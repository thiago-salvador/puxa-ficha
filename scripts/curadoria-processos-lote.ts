/**
 * Busca ativa conservadora de processos no DJEN/PJe, em lotes de 20.
 *
 * A API e pesquisável por nome, mas nome sozinho nunca identifica a parte.
 * Uma ocorrência só vira achado quando a própria comunicação também contém
 * contexto político compatível (cargo, campanha, partido ou nome de urna).
 * O DataJud é consultado depois, exclusivamente pelos números CNJ encontrados.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  closeSync,
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { pipeline } from "node:stream/promises"
import { Readable } from "node:stream"
import { pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"

import { normalizarCpfTse } from "./lib/cpf"
import { parseCSV } from "./lib/parse-csv-local"
import { supabase } from "./lib/supabase"
import { stripAccents } from "../src/lib/strip-accents"

const DJEN = "https://comunicaapi.pje.jus.br"
const DATAJUD = "https://api-publica.datajud.cnj.jus.br"
const TSE_CDN = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand"
const TAMANHO_LOTE = 20

type Prioridade = 1 | 2 | 3 | 4
type Classificacao = "encontrado" | "vazio_confirmado" | "bloqueado" | "erro"

interface SnapshotCandidato {
  slug: string
  nome_urna: string
  cargo_disputado: string
  estado?: string
  partido_sigla?: string
  processos: number
  historico?: Array<{
    tipo_evento?: string
    cargo_canonico?: string
    partido?: string
    estado?: string
  }>
  claims?: Array<{ titulo?: string; descricao?: string; categoria?: string }>
  noticias?: number
}

interface CandidatoBanco {
  id: string
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: string
  cargo_atual: string | null
  estado: string | null
  partido_sigla: string | null
  biografia: string | null
  /** SQ read back from the local candidate snapshot; it is identity evidence, not a seed gate. */
  sq_candidato_2026?: string | null
  /** Used only in-memory for identity-context matching; never persisted in receipts. */
  cpf?: string | null
}

interface SeedCandidato {
  slug: string
  ids?: {
    camara?: number | null
    senado?: number | null
    tse_sq_candidato?: Record<string, string>
  }
}

export interface Comunicacao {
  id: number
  ativo?: boolean
  data_disponibilizacao?: string
  siglaTribunal?: string
  nomeClasse?: string
  nomeOrgao?: string
  numero_processo?: string
  numeroprocessocommascara?: string
  link?: string
  texto?: string
  destinatarios?: Array<{ nome?: string; polo?: string }>
}

interface ProcessoAchado {
  numero_cnj: string
  tribunal: string
  classe: string | null
  orgao: string | null
  polo: string | null
  url: string
  contexto_identidade: string
  datajud: Record<string, unknown>
}

interface RegistroCandidato {
  slug: string
  nome_urna: string
  nome_completo: string
  cargo: string
  uf: string | null
  partido: string | null
  prioridade: Prioridade
  identidade: Record<string, unknown>
  busca: Record<string, unknown>
  ocorrencias_ambiguas: Array<Record<string, unknown>>
  homonimos_descartados: Array<Record<string, unknown>>
  classificacao: Classificacao
  motivo: string
  processos: ProcessoAchado[]
  banco: { coleta_log: "pendente" }
}

interface DependenciasPesquisa {
  confirmarIdentidade?: typeof confirmarIdentidade
  buscarDjen?: typeof buscarDjenSerializado
}

interface Evidencia {
  schema_version: 1
  supabase_ref: string
  base_commit: string
  branch: string
  snapshot_inicial_em: string
  total_inicial: number
  candidatos_iniciais: string[]
  fontes: Record<string, unknown>
  lotes: Array<{
    numero: number
    concluido_em: string
    slugs: string[]
    candidatos: RegistroCandidato[]
  }>
  resumo: Record<string, number>
  atualizado_em: string
}

interface CheckpointEvidenciaInput {
  lote: Evidencia["lotes"][number]
  supabase_ref: string
  base_commit: string
  branch: string
  snapshot_inicial_em: string
  total_inicial: number
  candidatos_iniciais: string[]
  fontes: Record<string, unknown>
}

interface CheckpointEvidenciaOpcoes {
  timeoutMs?: number
  retryMs?: number
  aposAdquirirLock?: () => Promise<void> | void
}

interface InventarioTribunais {
  uf: string
  instituicoes: Array<{ sigla: string; active?: boolean }>
}

const IDENTIDADE_OVERRIDES: Record<string, {
  metodo: string
  url: string
  urls?: string[]
  detalhe: string
  nome_oficial?: string
  status?: "confirmada" | "bloqueada"
  motivo?: string
}> = {
  "augusto-cury": {
    metodo: "partido-oficial",
    url: "https://avante70.org.br/noticias/augusto-cury-e-apresentado-como-pre-candidato-a-presidencia-da-republica-pelo-avante/",
    detalhe: "Avante identifica Augusto Cury como pre-candidato a Presidencia pelo partido.",
  },
  "renan-santos": {
    metodo: "partido-oficial",
    url: "https://congresso.missao.org.br/",
    detalhe: "Site oficial do Partido Missao identifica Renan Santos como fundador; contexto eleitoral confirmado separadamente no roster.",
    status: "bloqueada",
    motivo: "fonte oficial do partido confirma a identidade como fundador, mas nao identifica cargo ou pre-candidatura; busca processual por nome ficaria ambigua",
  },
  "adailton-furia": {
    metodo: "prefeitura-oficial",
    url: "https://pagina.cacoal.ro.gov.br/",
    nome_oficial: "Adailton Antunes Ferreira",
    detalhe: "Prefeitura de Cacoal identifica Adailton Furia como prefeito do municipio em Rondonia.",
  },
  "marcelo-maranata": {
    metodo: "diario-oficial-municipal",
    url: "https://www-storage.voxtecnologia.com.br/?f=159&i=publicado_117814_2026-04-01_faf1c1810f0a735624ff8605f66a3cec.pdf&m=sigpub.publicacao",
    nome_oficial: "Marcelo Maranata Soares Reinaldo",
    detalhe: "Diario Oficial dos Municipios do RS identifica Marcelo Maranata Soares Reinaldo como prefeito de Guaiba.",
  },
  "mateus-simoes": {
    metodo: "governo-estadual-oficial",
    url: "https://agenciaminas.mg.gov.br/noticia/mateus-simoes-e-empossado-governador-e-reforca-projeto-de-desenvolvimento-de-minas-gerais",
    nome_oficial: "Mateus Simoes de Almeida",
    detalhe: "Agencia oficial de Minas Gerais identifica Mateus Simoes como governador e registra sua eleicao como vice-governador em 2022.",
  },
  "pazolini": {
    metodo: "prefeitura-oficial",
    url: "https://vitoria.es.gov.br/gabpref/prefeitos-de-vitoria",
    nome_oficial: "Lorenzo Silva de Pazolini",
    detalhe: "Prefeitura de Vitoria inclui Lorenzo Pazolini na relacao oficial de prefeitos do municipio.",
  },
  "ricardo-cappelli": {
    metodo: "partido-oficial",
    url: "https://psb40.org.br/psb-lanca-pre-candidatura-de-ricardo-cappelli-ao-governo-do-df/",
    nome_oficial: "Ricardo Garcia Cappelli",
    detalhe: "PSB identifica Ricardo Cappelli como ex-presidente da ABDI e pre-candidato ao Governo do Distrito Federal.",
  },
  "joao-henrique-catan": {
    metodo: "assembleia-oficial",
    url: "https://al.ms.gov.br/upload/Pdf/2026_06_02_09_30_43_lista-de-autoridades-02-06-26.pdf",
    urls: ["https://novo.org.br/noticias/catan-pre-candidato-governador-mato-grosso-do-sul/"],
    nome_oficial: "Joao Henrique Miranda Soares Catan",
    detalhe: "ALEMS identifica o nome completo de Joao Henrique Catan; o site oficial do NOVO confirma a pre-candidatura ao governo de MS.",
  },
  "kiko-caputo": {
    metodo: "oab-oficial",
    url: "https://oabdf.org.br/lealdade-e-gratidao-delio-destaca-valores-da-advocacia-na-ultima-cerimonia-de-entrega-de-carteiras-de-sua-segunda-gestao/",
    nome_oficial: "Francisco Queiroz Caputo Neto",
    detalhe: "OAB-DF identifica Francisco Queiroz Caputo Neto como Kiko Caputo e ex-presidente da seccional.",
    status: "bloqueada",
    motivo: "OAB-DF confirma a ligacao entre Francisco Queiroz Caputo Neto e Kiko Caputo, mas nao confirma a pre-candidatura atual ao governo do DF",
  },
  "lais-chaud": {
    metodo: "assembleia-oficial",
    url: "https://download.alesc.sc.gov.br/taquigrafiacomissoes/14/20_4_013_AUP.pdf",
    nome_oficial: "Lais Paganelli Chaud",
    detalhe: "ALESC registra Lais Chaud como integrante da UP e pre-candidata ao governo de SC.",
  },
  "lucien-rezende": {
    metodo: "tse-2026-oficial",
    url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
    nome_oficial: "Lucien Roberto Garcia de Rezende",
    detalhe: "TSE 2026 identifica Lucien Roberto Garcia de Rezende como candidato a governador de MS pelo PSOL.",
  },
}

const UF_NOME: Record<string, string> = {
  AC: "ACRE", AL: "ALAGOAS", AP: "AMAPA", AM: "AMAZONAS", BA: "BAHIA",
  CE: "CEARA", DF: "DISTRITO FEDERAL", ES: "ESPIRITO SANTO", GO: "GOIAS",
  MA: "MARANHAO", MT: "MATO GROSSO", MS: "MATO GROSSO DO SUL",
  MG: "MINAS GERAIS", PA: "PARA", PB: "PARAIBA", PR: "PARANA",
  PE: "PERNAMBUCO", PI: "PIAUI", RJ: "RIO DE JANEIRO",
  RN: "RIO GRANDE DO NORTE", RS: "RIO GRANDE DO SUL", RO: "RONDONIA",
  RR: "RORAIMA", SC: "SANTA CATARINA", SP: "SAO PAULO", SE: "SERGIPE",
  TO: "TOCANTINS",
}

const TERMOS_SINAL = /investiga|investigacao|acao judicial|acao civil|condena|processo judicial|reu|denuncia|improbidade|corrupcao|operacao/i
const CARGOS_EXECUTIVO = /^(governador|prefeito|ministro(?: de estado)?)$/i
const CARGO_POLITICO = "(?:VICE GOVERNADOR(?:A)?|GOVERNADOR(?:A)?|VICE PREFEIT[OA]|PREFEIT[OA]|SENADOR(?:A)?|DEPUTAD[OA] (?:FEDERAL|ESTADUAL)|MINISTR[OA] DE ESTADO|PRE CANDIDAT[OA] (?:A|AO) (?:PRESIDENCIA|PRESIDENTE|GOVERNO|GOVERNADOR|PREFEITURA|PREFEITO)|CANDIDAT[OA] (?:A|AO) (?:PRESIDENCIA|PRESIDENTE|GOVERNO|GOVERNADOR|PREFEITURA|PREFEITO)|PRESIDENTE DA REPUBLICA)"

function normalizar(valor: unknown): string {
  return stripAccents(String(valor ?? ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")
}

export function cnjValido(valor: string): boolean {
  if (!/^\d{20}$/.test(valor) && !/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(valor)) return false
  const digitos = valor.replace(/\D/g, "")
  const sequencial = digitos.slice(0, 7)
  const verificador = Number(digitos.slice(7, 9))
  const restante = digitos.slice(9)
  const esperado = 98 - Number(BigInt(`${sequencial}${restante}00`) % BigInt(97))
  return verificador === esperado
}

function flags(argv: string[]): Map<string, string> {
  return new Map(argv.filter((x) => x.startsWith("--") && x.includes("="))
    .map((x) => { const i = x.indexOf("="); return [x.slice(2, i), x.slice(i + 1)] }))
}

function flagPresente(argv: string[], nome: string): boolean {
  return argv.some((valor) => valor === `--${nome}` || valor.startsWith(`--${nome}=`))
}

export interface CandidatoCoorteAtual {
  id: string
  slug: string
}

export interface ReciboProcessosAtual {
  candidato_id?: string | null
  alvo?: string | null
  fonte?: string | null
  escopo?: string | null
  executado_em?: string | null
  resultado?: string | null
}

const RESULTADOS_RECIBO_VALIDOS = new Set(["encontrado", "vazio_confirmado", "indeterminado", "erro", "bloqueado"])

/**
 * Recorta somente a coorte atual sem recibo. O resultado `indeterminado` não
 * reabre busca: ele já tem recibo e só pode voltar ao protocolo com fonte nova
 * ou segundo identificador, decidido fora deste coletor.
 */
export function selecionarAlvosSemRecibo(
  candidatos: CandidatoCoorteAtual[],
  recibos: ReciboProcessosAtual[],
): string[] {
  const ids = new Set(candidatos.map((c) => c.id))
  const slugPorId = new Map(candidatos.map((c) => [c.id, c.slug]))
  const comRecibo = new Set(
    recibos
      .filter((r) => {
        if (typeof r.candidato_id !== "string" || !ids.has(r.candidato_id)) return false
        if (r.alvo !== slugPorId.get(r.candidato_id)) return false
        if (r.fonte !== "processos-curadoria" || r.escopo !== "candidato") return false
        if (typeof r.executado_em !== "string" || !Number.isFinite(Date.parse(r.executado_em)) || Date.parse(r.executado_em) > Date.now()) return false
        return typeof r.resultado === "string" && RESULTADOS_RECIBO_VALIDOS.has(r.resultado)
      })
      .map((r) => r.candidato_id as string),
  )
  return candidatos.filter((c) => !comRecibo.has(c.id)).map((c) => c.slug).sort()
}

/** Janela de validade do recibo judicial exibida no site (dias). */
export const SLA_RECIBO_PROCESSOS_DIAS = 14
const RESULTADOS_CONCLUSIVOS = new Set(["encontrado", "vazio_confirmado"])

export type ModoAlvos = "sem-recibo" | "vencendo" | "indeterminados" | "encontrados"

export function modoAlvosSolicitado(argv: string[]): ModoAlvos {
  const valor = flags(argv).get("alvos") ?? "sem-recibo"
  if (valor !== "sem-recibo" && valor !== "vencendo" && valor !== "indeterminados" && valor !== "encontrados") {
    throw new Error("use --alvos=sem-recibo, --alvos=vencendo, --alvos=indeterminados ou --alvos=encontrados")
  }
  return valor
}

export function margemDiasSolicitada(argv: string[]): number {
  const bruto = flags(argv).get("margem-dias") ?? "4"
  if (!/^\d+$/.test(bruto) || Number(bruto) >= SLA_RECIBO_PROCESSOS_DIAS) {
    throw new Error(`--margem-dias deve ser inteiro entre 0 e ${SLA_RECIBO_PROCESSOS_DIAS - 1}`)
  }
  return Number(bruto)
}

export function cargoSolicitado(argv: string[]): string | null {
  const valor = flags(argv).get("cargo")
  if (valor === undefined) return null
  if (!new Set(["Presidente", "Governador", "Senador"]).has(valor)) throw new Error("--cargo deve ser Presidente, Governador ou Senador")
  return valor
}

function ultimoReciboValidoPorCandidato(
  candidatos: CandidatoCoorteAtual[],
  recibos: ReciboProcessosAtual[],
  agora: number,
): Map<string, ReciboProcessosAtual> {
  const slugPorId = new Map(candidatos.map((c) => [c.id, c.slug]))
  const ultimo = new Map<string, ReciboProcessosAtual>()
  for (const r of recibos) {
    if (typeof r.candidato_id !== "string" || !slugPorId.has(r.candidato_id)) continue
    if (r.alvo !== slugPorId.get(r.candidato_id)) continue
    if (r.fonte !== "processos-curadoria" || r.escopo !== "candidato") continue
    if (typeof r.executado_em !== "string" || !Number.isFinite(Date.parse(r.executado_em)) || Date.parse(r.executado_em) > agora) continue
    if (typeof r.resultado !== "string" || !RESULTADOS_RECIBO_VALIDOS.has(r.resultado)) continue
    const anterior = ultimo.get(r.candidato_id)
    if (!anterior || Date.parse(anterior.executado_em!) < Date.parse(r.executado_em)) ultimo.set(r.candidato_id, r)
  }
  return ultimo
}

/**
 * Renovação antes do SLA: reabre fichas cujo último recibo é conclusivo
 * (`encontrado` ou `vazio_confirmado`) com idade de pelo menos `SLA - margem`
 * dias, e toda ficha cujo último recibo é `erro`, em qualquer idade.
 * `indeterminado` e `bloqueado` continuam fora:
 * reconsultar o mesmo nome sem fonte nova repetiria a mesma ambiguidade.
 */
export function selecionarAlvosVencendo(
  candidatos: CandidatoCoorteAtual[],
  recibos: ReciboProcessosAtual[],
  margemDias: number,
  agora: number = Date.now(),
): string[] {
  const limite = agora - (SLA_RECIBO_PROCESSOS_DIAS - margemDias) * 86_400_000
  const ultimo = ultimoReciboValidoPorCandidato(candidatos, recibos, agora)
  return candidatos.filter((c) => {
    const recibo = ultimo.get(c.id)
    if (recibo === undefined) return false
    // Falha de fonte não é estado final: a próxima execução sempre tenta de novo.
    if (recibo.resultado === "erro") return true
    return RESULTADOS_CONCLUSIVOS.has(recibo.resultado as string)
      && Date.parse(recibo.executado_em as string) <= limite
  }).map((c) => c.slug).sort()
}

/**
 * Reexame dirigido de `indeterminado`, `erro` e `bloqueado` para revisão
 * humana (dossiê). A evidência deste modo não é aceita pelo aplicador: ela
 * só alimenta a triagem, nunca grava recibo sozinha.
 */
export function selecionarAlvosIndeterminados(
  candidatos: CandidatoCoorteAtual[],
  recibos: ReciboProcessosAtual[],
  agora: number = Date.now(),
): string[] {
  const ultimo = ultimoReciboValidoPorCandidato(candidatos, recibos, agora)
  return candidatos.filter((c) => {
    const resultado = ultimo.get(c.id)?.resultado
    return resultado === "indeterminado" || resultado === "erro" || resultado === "bloqueado"
  }).map((c) => c.slug).sort()
}

/** Revalidação: toda ficha cujo último recibo é `encontrado`, em qualquer idade. */
export function selecionarAlvosEncontrados(
  candidatos: CandidatoCoorteAtual[],
  recibos: ReciboProcessosAtual[],
  agora: number = Date.now(),
): string[] {
  const ultimo = ultimoReciboValidoPorCandidato(candidatos, recibos, agora)
  return candidatos.filter((c) => ultimo.get(c.id)?.resultado === "encontrado").map((c) => c.slug).sort()
}

/** Caminhos efêmeros perderam o snapshot de agosto no reboot de 24/09. */
export function exigirCaminhoPersistente(caminho: string, rotulo: string): void {
  if (process.env.PF_PERMITIR_TMP === "1") return
  if (/^\/(?:private\/)?tmp(?:\/|$)/.test(resolve(caminho))) {
    throw new Error(`${rotulo} em /tmp nao sobrevive a reboot; use pasta persistente ou PF_PERMITIR_TMP=1`)
  }
}

export interface SnapshotCoorteAtual {
  schema_version: 1
  gerado_em: string
  modo: string
  coorte_publica_total: number
  filtro_cargo: string | null
  margem_dias: number | null
  alvos: Array<{
    slug: string
    candidato_id: string
    cargo_disputado: string
    estado: string | null
    ultimo_recibo: { resultado: string; executado_em: string } | null
  }>
}

export function montarSnapshotCoorteAtual(
  candidatos: CandidatoBanco[],
  recibos: ReciboProcessosAtual[],
  alvos: string[],
  meta: { modo: string; filtro_cargo: string | null; margem_dias: number | null; coorte_publica_total: number },
  agora: number = Date.now(),
): SnapshotCoorteAtual {
  const ultimo = ultimoReciboValidoPorCandidato(candidatos, recibos, agora)
  const porSlug = new Map(candidatos.map((c) => [c.slug, c]))
  return {
    schema_version: 1,
    gerado_em: new Date(agora).toISOString(),
    ...meta,
    alvos: alvos.map((slug) => {
      const c = porSlug.get(slug)
      if (!c) throw new Error(`snapshot: alvo fora da coorte: ${slug}`)
      const r = ultimo.get(c.id)
      return {
        slug,
        candidato_id: c.id,
        cargo_disputado: c.cargo_disputado,
        estado: c.estado,
        ultimo_recibo: r ? { resultado: r.resultado as string, executado_em: r.executado_em as string } : null,
      }
    }),
  }
}

interface CoorteAtualPreflight {
  candidatos: CandidatoBanco[]
  alvos: string[]
  cnjsPorSlug: Map<string, Array<{ numero_cnj: string; tribunal: string }>>
  residuais: string[]
  recibos: ReciboProcessosAtual[]
  coortePublicaTotal: number
}

interface ProcessoCnjAtual {
  candidato_id?: string | null
  numero_processo?: string | null
  tribunal?: string | null
}

/** A agenda só reabre pendências com um número judicial já conhecido. */
export function selecionarAlvosComCnj(
  candidatos: CandidatoCoorteAtual[],
  recibos: ReciboProcessosAtual[],
  processos: ProcessoCnjAtual[],
): { alvos: string[]; cnjsPorSlug: Map<string, Array<{ numero_cnj: string; tribunal: string }>>; residuais: string[] } {
  const candidatosPorId = new Map(candidatos.map((c) => [c.id, c]))
  const ultimo = new Map(recibos.filter((r) =>
    typeof r.candidato_id === "string" && candidatosPorId.has(r.candidato_id)
    && r.alvo === candidatosPorId.get(r.candidato_id)?.slug
    && r.fonte === "processos-curadoria" && r.escopo === "candidato"
    && typeof r.executado_em === "string" && Number.isFinite(Date.parse(r.executado_em))
    && Date.parse(r.executado_em) <= Date.now() && typeof r.resultado === "string"
    && RESULTADOS_RECIBO_VALIDOS.has(r.resultado),
  ).map((r) => [r.candidato_id as string, r.resultado as string]))
  const cnjsPorSlug = new Map<string, Array<{ numero_cnj: string; tribunal: string }>>()
  for (const row of processos) {
    const c = row.candidato_id ? candidatosPorId.get(row.candidato_id) : undefined
    if (!c || !new Set([undefined, "indeterminado", "erro", "bloqueado"]).has(ultimo.get(c.id))) continue
    if (!cnjValido(row.numero_processo ?? "") || !row.tribunal?.trim()) continue
    const anteriores = cnjsPorSlug.get(c.slug) ?? []
    if (!anteriores.some((p) => p.numero_cnj === row.numero_processo)) {
      cnjsPorSlug.set(c.slug, [...anteriores, { numero_cnj: row.numero_processo!, tribunal: row.tribunal.trim() }])
    }
  }
  const pendentes = candidatos.filter((c) => new Set([undefined, "indeterminado", "erro", "bloqueado"]).has(ultimo.get(c.id)))
  return {
    alvos: pendentes.map((c) => c.slug).filter((slug) => cnjsPorSlug.has(slug)).sort(),
    cnjsPorSlug,
    residuais: pendentes.map((c) => c.slug).filter((slug) => !cnjsPorSlug.has(slug)).sort(),
  }
}

export function assertPreflightNotTruncated(count: number, limit: number, source: string): void {
  if (count >= limit) throw new Error(`preflight ${source}: limite ${limit} atingido; coorte incompleta`)
}

async function lerCoorteAtualParaDryRun(
  somenteCnj = false,
  modo: ModoAlvos = "sem-recibo",
  margemDias = 4,
  cargo: string | null = null,
): Promise<CoorteAtualPreflight> {
  const { data, error } = await supabase.from("candidatos")
    .select("id,slug,nome_completo,nome_urna,cargo_disputado,cargo_atual,estado,partido_sigla,biografia,sq_candidato_2026")
    .eq("publicavel", true).neq("status", "removido").order("slug").limit(1000)
  if (error) throw new Error(`preflight candidatos: ${error.message}`)
  const coorte = (data ?? []) as CandidatoBanco[]
  if (coorte.length === 0) throw new Error("preflight candidatos: coorte publica vazia")
  assertPreflightNotTruncated(coorte.length, 1000, "candidatos")
  const candidatos = cargo ? coorte.filter((c) => c.cargo_disputado === cargo) : coorte
  const { data: recibosData, error: recibosError } = await supabase.from("coleta_log_ultima")
    .select("candidato_id,alvo,resultado,executado_em,escopo,fonte")
    .eq("fonte", "processos-curadoria").eq("escopo", "candidato")
    .limit(2000)
  if (recibosError) throw new Error(`preflight recibos processos-curadoria: ${recibosError.message}`)
  assertPreflightNotTruncated((recibosData ?? []).length, 2000, "recibos processos-curadoria")
  const recibos = (recibosData ?? []) as ReciboProcessosAtual[]
  if (!somenteCnj) return {
    candidatos,
    alvos: modo === "vencendo"
      ? selecionarAlvosVencendo(candidatos, recibos, margemDias)
      : modo === "indeterminados"
        ? selecionarAlvosIndeterminados(candidatos, recibos)
        : modo === "encontrados"
          ? selecionarAlvosEncontrados(candidatos, recibos)
          : selecionarAlvosSemRecibo(candidatos, recibos),
    cnjsPorSlug: new Map(),
    residuais: [],
    recibos,
    coortePublicaTotal: coorte.length,
  }
  const { data: processos, error: processosError } = await supabase.from("processos")
    .select("candidato_id,numero_processo,tribunal").limit(2000)
  if (processosError) throw new Error(`preflight processos com CNJ: ${processosError.message}`)
  assertPreflightNotTruncated((processos ?? []).length, 2000, "processos com CNJ")
  return {
    candidatos,
    ...selecionarAlvosComCnj(candidatos, recibos, (processos ?? []) as ProcessoCnjAtual[]),
    recibos,
    coortePublicaTotal: coorte.length,
  }
}

export function lotesSolicitados(argv: string[]): number[] {
  const opcoes = flags(argv)
  const lote = opcoes.get("lote")
  const lotes = opcoes.get("lotes")
  if ((lote && lotes) || (!lote && !lotes)) {
    throw new Error("use --lote=N ou --lotes=INICIO-FIM")
  }
  if (lote) {
    if (!/^\d+$/.test(lote) || Number(lote) < 1) throw new Error("use --lote=N")
    return [Number(lote)]
  }
  const faixa = /^(\d+)-(\d+)$/.exec(lotes ?? "")
  if (!faixa) throw new Error("use --lotes=INICIO-FIM")
  const inicio = Number(faixa[1])
  const fim = Number(faixa[2])
  if (inicio < 1 || fim < inicio) throw new Error("faixa de lotes invalida")
  return Array.from({ length: fim - inicio + 1 }, (_, indice) => inicio + indice)
}

export function slugsSolicitados(argv: string[]): string[] | null {
  const opcoes = flags(argv)
  const raw = opcoes.get("slugs")
  if (!raw) return null
  if (opcoes.has("lote") || opcoes.has("lotes")) {
    throw new Error("--slugs não pode ser combinado com --lote ou --lotes")
  }
  const slugs = [...new Set(raw.split(",").map((slug) => slug.trim()).filter(Boolean))].sort()
  if (slugs.length === 0 || slugs.length > TAMANHO_LOTE) {
    throw new Error(`--slugs exige entre 1 e ${TAMANHO_LOTE} fichas`)
  }
  return slugs
}

export function instituicoesAtivas(inventario: InventarioTribunais[]): string[] {
  return [...new Set(
    inventario.flatMap((item) => item.instituicoes)
      .filter((item) => item.active !== false)
      .map((item) => item.sigla)
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b))
}

export async function processarComDoisWorkers<T, R>(
  itens: T[],
  processar: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length)
  let proximo = 0
  const trabalhador = async (): Promise<void> => {
    while (proximo < itens.length) {
      const indice = proximo
      proximo += 1
      resultados[indice] = await processar(itens[indice], indice)
    }
  }
  await Promise.all([trabalhador(), trabalhador()])
  return resultados
}

export async function executarLotesEmOrdem<Contexto, Resultado>(
  numeros: number[],
  carregarContexto: (numerosSelecionados: number[]) => Promise<Contexto>,
  processarLote: (numero: number, contexto: Contexto) => Promise<Resultado>,
  checkpoint: (numero: number, resultado: Resultado, contexto: Contexto) => Promise<void> | void,
): Promise<void> {
  const contexto = await carregarContexto(numeros)
  for (const numero of numeros) {
    const resultado = await processarLote(numero, contexto)
    await checkpoint(numero, resultado, contexto)
  }
}

export function prioridade(c: SnapshotCandidato): Prioridade {
  if (c.cargo_disputado === "Presidente") return 1
  const executivo = c.cargo_disputado === "Governador" && (c.historico ?? []).some(
    (h) => h.tipo_evento === "mandato" && CARGOS_EXECUTIVO.test(h.cargo_canonico ?? ""),
  )
  if (executivo) return 2
  const sinal = (c.claims ?? []).some((x) => TERMOS_SINAL.test(normalizar(`${x.titulo} ${x.descricao} ${x.categoria}`)))
  return sinal ? 3 : 4
}

export function ordenar(coorte: SnapshotCandidato[]): SnapshotCandidato[] {
  return [...coorte].sort((a, b) => prioridade(a) - prioridade(b) || a.slug.localeCompare(b.slug))
}

/** Espera antes de nova tentativa: respeita Retry-After (s ou data HTTP), senão 30 s, 60 s, 120 s... teto 300 s. */
export function esperaRetry(tentativa: number, retryAfter: string | null, agora = Date.now()): number {
  const teto = 300_000
  if (retryAfter) {
    const segundos = Number(retryAfter)
    if (Number.isFinite(segundos) && segundos >= 0) return Math.min(teto, Math.ceil(segundos * 1000))
    const data = Date.parse(retryAfter)
    if (Number.isFinite(data)) return Math.min(teto, Math.max(0, data - agora))
  }
  return Math.min(teto, 30_000 * 2 ** tentativa)
}

/**
 * Disjuntor por fonte: depois de N respostas 429/5xx seguidas (somando
 * chamadas diferentes), a coleta para em vez de insistir contra o tribunal.
 */
export class Disjuntor {
  private seguidas = 0
  constructor(readonly limite = 4) {}
  registrarFalha(): void { this.seguidas += 1 }
  registrarSucesso(): void { this.seguidas = 0 }
  get aberto(): boolean { return this.seguidas >= this.limite }
}

export const DISJUNTOR_ABERTO = "disjuntor aberto: respostas 429/5xx seguidas da fonte oficial"
const disjuntorFontes = new Disjuntor()

async function fetchJson<T>(url: string, init?: RequestInit, tentativas = 3, timeoutMs = 60_000): Promise<T> {
  for (let i = 0; i < tentativas; i += 1) {
    if (disjuntorFontes.aberto) throw new Error(DISJUNTOR_ABERTO)
    const resposta = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    if (resposta.status === 429 || resposta.status >= 500) {
      disjuntorFontes.registrarFalha()
      if (i + 1 < tentativas && !disjuntorFontes.aberto) {
        await new Promise((resolve) => setTimeout(resolve, esperaRetry(i, resposta.headers.get("retry-after"))))
        continue
      }
    }
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${url}`)
    disjuntorFontes.registrarSucesso()
    return await resposta.json() as T
  }
  throw new Error(`limite de tentativas em ${url}`)
}

export type TipoFalhaColeta = "limite_de_taxa" | "fonte_indisponivel" | "preflight_banco" | "identidade_tse" | "outro"

/** Classificação fechada da falha fatal, lida pelo workflow sem grep de log. */
export function classificarFalhaColeta(erro: unknown): TipoFalhaColeta {
  const mensagem = erro instanceof Error ? erro.message : String(erro)
  if (mensagem === DISJUNTOR_ABERTO || /HTTP 429/.test(mensagem)) return "limite_de_taxa"
  if (/^preflight[ :]/.test(mensagem)) return "preflight_banco"
  if (/consulta_cand|TSE/.test(mensagem)) return "identidade_tse"
  if (/HTTP 5\d\d|fetch failed|timeout|aborted|ECONN|ENOTFOUND|DataJud|DJEN/i.test(mensagem)) return "fonte_indisponivel"
  return "outro"
}

async function baixar(url: string, destino: string): Promise<void> {
  if (existsSync(destino)) return
  mkdirSync(dirname(destino), { recursive: true })
  const parcial = `${destino}.part`
  rmSync(parcial, { force: true })
  const resposta = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  if (!resposta.ok || !resposta.body) throw new Error(`HTTP ${resposta.status} ao baixar ${url}`)
  await pipeline(Readable.fromWeb(resposta.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(parcial))
  renameSync(parcial, destino)
}

/**
 * CPF da linha do consulta_cand para o dossiê de identidade.
 *
 * O valor bruto ia direto para o relatório, e o consumidor
 * (`aplicar-evidencia-processos-curadoria`) só liga o casamento por CPF quando
 * o campo tem 11 dígitos. Com os zeros à esquerda comidos pelo publicador do
 * TSE, o CPF verdadeiro entrava com 9 dígitos e a prova por CPF ficava
 * desligada para aquele candidato. O que não dá para reconstruir com segurança
 * continua indo cru: perder o registro da linha seria pior que registrá-lo como
 * a fonte publicou.
 */
function cpfDaLinhaTse(bruto: string | null | undefined): string {
  return normalizarCpfTse(bruto) || (bruto ?? "")
}

/**
 * CSVs extraídos do consulta_cand. `-L` segue diretório de cache ligado por
 * symlink; zero arquivos falha alto, porque identidade TSE ausente viraria
 * "bloqueada" em silêncio para todo candidato daquele ano.
 */
export function csvsDoConsultaCand(extraido: string, ano: string): string[] {
  const arquivos = execFileSync("find", ["-L", extraido, "-type", "f", "-name", "*.csv"], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean)
  if (arquivos.length === 0) throw new Error(`consulta_cand_${ano}: nenhum CSV em ${extraido}`)
  return arquivos
}

async function carregarIdentidadesTse(
  candidatos: CandidatoBanco[],
  seeds: Map<string, SeedCandidato>,
  cache: string,
): Promise<Map<string, Record<string, unknown>>> {
  const porAno = new Map<string, Array<{ candidato: CandidatoBanco; sq: string }>>()
  for (const candidato of candidatos) {
    const ids = Object.entries(seeds.get(candidato.slug)?.ids?.tse_sq_candidato ?? {})
      .sort((a, b) => Number(b[0]) - Number(a[0]))
    const latest = ids[0] ?? (candidato.sq_candidato_2026 ? ["2026", candidato.sq_candidato_2026] as const : undefined)
    if (!latest) continue
    porAno.set(latest[0], [...(porAno.get(latest[0]) ?? []), { candidato, sq: latest[1] }])
  }
  const resultado = new Map<string, Record<string, unknown>>()
  for (const [ano, alvos] of porAno) {
    const url = `${TSE_CDN}/consulta_cand_${ano}.zip`
    const zip = join(cache, `consulta_cand_${ano}.zip`)
    const extraido = join(cache, `consulta_cand_${ano}`)
    await baixar(url, zip)
    if (!existsSync(extraido)) {
      mkdirSync(extraido, { recursive: true })
      execFileSync("unzip", ["-oq", zip, "-d", extraido])
    }
    const arquivos = csvsDoConsultaCand(extraido, ano)
    for (const arquivo of arquivos) {
      await parseCSV(arquivo, (row) => {
        const alvo = alvos.find((item) => item.sq === row.SQ_CANDIDATO)
        if (!alvo || resultado.has(alvo.candidato.slug)) return
        if (normalizar(row.NM_CANDIDATO) !== normalizar(alvo.candidato.nome_completo)) return
        resultado.set(alvo.candidato.slug, {
          status: "confirmada",
          metodo: "tse-sq-candidato",
          url,
          ano: Number(ano),
          sq_candidato: alvo.sq,
          nome: row.NM_CANDIDATO,
          nome_urna: row.NM_URNA_CANDIDATO,
          cargo: row.DS_CARGO,
          uf: row.SG_UF,
          partido: row.SG_PARTIDO,
          cpf: cpfDaLinhaTse(row.NR_CPF_CANDIDATO),
          arquivo: basename(arquivo),
        })
      })
    }
  }

  const anosFallback = ["2026", "2024", "2022", "2020", "2018", "2016"]
  for (const ano of anosFallback) {
    const pendentes = candidatos.filter(
      (c) => !resultado.has(c.slug) && c.estado && !IDENTIDADE_OVERRIDES[c.slug],
    )
    if (pendentes.length === 0) break
    const pendentesPorNome = new Map<string, CandidatoBanco[]>()
    for (const candidato of pendentes) {
      const nome = normalizar(candidato.nome_completo)
      pendentesPorNome.set(nome, [...(pendentesPorNome.get(nome) ?? []), candidato])
    }
    const url = `${TSE_CDN}/consulta_cand_${ano}.zip`
    const zip = join(cache, `consulta_cand_${ano}.zip`)
    const extraido = join(cache, `consulta_cand_${ano}`)
    await baixar(url, zip)
    if (!existsSync(extraido)) {
      mkdirSync(extraido, { recursive: true })
      execFileSync("unzip", ["-oq", zip, "-d", extraido])
    }
    const arquivos = csvsDoConsultaCand(extraido, ano)
    for (const arquivo of arquivos) {
      await parseCSV(arquivo, (row) => {
        const alvo = (pendentesPorNome.get(normalizar(row.NM_CANDIDATO)) ?? []).find((c) => {
          if (resultado.has(c.slug)) return false
          if (normalizar(row.SG_UF) !== normalizar(c.estado)) return false
          const urna = normalizar(row.NM_URNA_CANDIDATO) === normalizar(c.nome_urna)
          const partido = normalizar(row.SG_PARTIDO) === normalizar(c.partido_sigla)
          return urna || partido
        })
        if (!alvo) return
        resultado.set(alvo.slug, {
          status: "confirmada",
          metodo: "tse-nome-cargo-uf",
          url,
          ano: Number(ano),
          sq_candidato: row.SQ_CANDIDATO,
          nome: row.NM_CANDIDATO,
          nome_urna: row.NM_URNA_CANDIDATO,
          cargo: row.DS_CARGO,
          uf: row.SG_UF,
          partido: row.SG_PARTIDO,
          cpf: cpfDaLinhaTse(row.NR_CPF_CANDIDATO),
          arquivo: basename(arquivo),
        })
      })
    }
  }
  return resultado
}

async function confirmarIdentidade(
  c: CandidatoBanco,
  seed: SeedCandidato | undefined,
  identidadesTse: Map<string, Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const override = IDENTIDADE_OVERRIDES[c.slug]
  if (override) return { status: override.status ?? "confirmada", ...override }
  // A locally read back SQ is already a confirmed identity anchor. It must not
  // depend on the historical seed being present in data/candidatos.json.
  const tseLocal = identidadesTse.get(c.slug)
  if (tseLocal) {
    const ufTse = typeof tseLocal.uf === "string" ? normalizar(tseLocal.uf) : ""
    const ufAtual = normalizar(c.estado)
    if (ufTse && ufAtual && ufTse !== ufAtual) {
      return {
        status: "bloqueada",
        motivo: `identidade TSE localizada em ${ufTse}, mas a ficha atual esta em ${ufAtual}; falta ponte oficial entre as UFs`,
        url: tseLocal.url,
      }
    }
    return tseLocal
  }
  if (seed) {
    if (seed.ids?.senado) return {
      status: "confirmada", metodo: "senado-id-oficial",
      url: `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${seed.ids.senado}`,
      id: seed.ids.senado,
    }
    if (seed.ids?.camara) return {
      status: "confirmada", metodo: "camara-id-oficial",
      url: `https://www.camara.leg.br/deputados/${seed.ids.camara}`,
      id: seed.ids.camara,
    }
  }
  return {
    status: "bloqueada",
    motivo: "sem identificador ou perfil oficial verificavel apos TSE 2016, 2018, 2020, 2022, 2024 e 2026 (nome completo + UF + nome de urna ou partido)",
    urls: ["2016", "2018", "2020", "2022", "2024", "2026"].map((ano) => `${TSE_CDN}/consulta_cand_${ano}.zip`),
    detalhe: "TSE consulta_cand consultado nos anos 2016, 2018, 2020, 2022, 2024 e 2026 sem identidade oficial compativel",
  }
}

export interface ResultadoDjen {
  schema_version: 2
  url: string
  query_nome: string
  consultado_em: string
  total: number
  itens: Comunicacao[]
  paginas: number
  completo: true
  tetoAtingido?: boolean
  /**
   * Texto bruto por comunicação, só em memória e só quando a resposta veio da
   * rede: o cache guarda o texto com o CPF rotulado apagado, e sem o bruto a
   * conferência de CPF do candidato nunca casaria. Nunca é persistido.
   */
  textosBrutos?: Map<number, string>
}

function sanitizarCpfEmTexto(texto: string): string {
  return texto.replace(/(\bCPF(?:\s*N(?:[ºo°])?)?\s*[:=-]?\s*)(\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[.\s-]?\d{2})\b/gi, "$1[cpf omitido]")
}

function sanitizarComunicacoes(itens: Comunicacao[]): Comunicacao[] {
  return itens.map((item) => ({ ...item, texto: typeof item.texto === "string" ? sanitizarCpfEmTexto(item.texto) : item.texto }))
}

/** Nome do destinatário sem apelido ou qualificação entre parênteses. */
export function nomeDestinatario(valor: unknown): string {
  return normalizar(String(valor ?? "").replace(/\([^)]*\)/g, " "))
}

/**
 * O nome exato aparece no texto da comunicação como palavra inteira, fora de
 * um nome mais longo de destinatário que o contenha com prenome ou nome do
 * meio diferente (ex.: "JOSE SILVA" dentro de "MARIA JOSE SILVA" não conta).
 * Destinatário com o nome exato seguido de sobrenome a mais ("JOSE SILVA
 * SOUZA") conta: pode ser a mesma pessoa com nome civil alterado.
 */
export function mencionaNomeNoTexto(item: Comunicacao, nome: string): boolean {
  if (!nome) return false
  const destinatarios = (item.destinatarios ?? []).map((d) => nomeDestinatario(d.nome))
  if (destinatarios.some((d) => d.startsWith(`${nome} `))) return true
  let texto = normalizar(item.texto ?? "")
  const maiores = destinatarios
    .filter((d) => d !== nome && new RegExp(`\\b${escaparRegex(nome)}\\b`).test(d))
    .sort((a, b) => b.length - a.length)
  for (const maior of maiores) texto = texto.replace(new RegExp(`\\b${escaparRegex(maior)}\\b`, "g"), " ")
  return new RegExp(`\\b${escaparRegex(nome)}\\b`).test(texto)
}

function periodoConsultaDjen(consultadoEm: string): string {
  return `acervo publico consultado em ${consultadoEm}`
}

export function validarRespostaDjen(resposta: unknown, nomeEsperado?: string): { count: number; items: Comunicacao[] } {
  if (!resposta || typeof resposta !== "object") throw new Error("DJEN resposta invalida: objeto esperado")
  const registro = resposta as Record<string, unknown>
  if (!Number.isInteger(registro.count) || Number(registro.count) < 0) {
    throw new Error("DJEN resposta invalida: count inteiro nao-negativo esperado")
  }
  if (!Array.isArray(registro.items)) throw new Error("DJEN resposta invalida: items array esperado")
  for (const item of registro.items) {
    if (!item || typeof item !== "object") throw new Error("DJEN resposta invalida: item objeto esperado")
    const comunicacao = item as Record<string, unknown>
    if (!Number.isInteger(comunicacao.id)) throw new Error("DJEN resposta invalida: item.id inteiro esperado")
    if (comunicacao.destinatarios !== null && comunicacao.destinatarios !== undefined && !Array.isArray(comunicacao.destinatarios)) throw new Error("DJEN resposta invalida: item.destinatarios array ou null esperado")
  }
  if (nomeEsperado && typeof registro.query_nome === "string" && normalizar(registro.query_nome) !== normalizar(nomeEsperado)) {
    throw new Error("DJEN resposta invalida: nome da consulta divergente")
  }
  return { count: Number(registro.count), items: registro.items as Comunicacao[] }
}

export function validarCacheDjen(cache: unknown, nomeEsperado?: string): ResultadoDjen {
  if (!cache || typeof cache !== "object") throw new Error("DJEN cache invalido: objeto esperado")
  const registro = cache as Record<string, unknown>
  if (registro.schema_version !== 2) throw new Error("DJEN cache invalido: schema_version")
  if (typeof registro.url !== "string" || registro.url.length === 0) throw new Error("DJEN cache invalido: url")
  let url: URL
  try { url = new URL(registro.url) } catch { throw new Error("DJEN cache invalido: url malformada") }
  if (url.origin !== DJEN || url.pathname !== "/api/v1/comunicacao" || url.searchParams.get("itensPorPagina") !== "1000") throw new Error("DJEN cache invalido: endpoint/query")
  if (typeof registro.query_nome !== "string" || registro.query_nome.length === 0) throw new Error("DJEN cache invalido: query_nome")
  if (normalizar(url.searchParams.get("nomeParte")) !== normalizar(registro.query_nome)) throw new Error("DJEN cache invalido: nomeParte divergente")
  if (nomeEsperado && normalizar(registro.query_nome) !== normalizar(nomeEsperado)) throw new Error("DJEN cache invalido: nome da consulta divergente")
  if (typeof registro.consultado_em !== "string" || Number.isNaN(Date.parse(registro.consultado_em))) throw new Error("DJEN cache invalido: consultado_em")
  if (!Number.isInteger(registro.total) || Number(registro.total) < 0) throw new Error("DJEN cache invalido: total")
  if (!Array.isArray(registro.itens)) throw new Error("DJEN cache invalido: itens")
  if (!Number.isInteger(registro.paginas) || Number(registro.paginas) < 1) throw new Error("DJEN cache invalido: paginas")
  if (registro.completo !== true) throw new Error("DJEN cache invalido: completo=false")
  const itensValidados = validarRespostaDjen({ count: registro.total, items: registro.itens })
  if (itensValidados.items.length !== Number(registro.total)) throw new Error(`DJEN cache truncado: ${itensValidados.items.length}/${registro.total}`)
  return registro as unknown as ResultadoDjen
}

async function buscarDjen(nome: string, cache: string): Promise<ResultadoDjen> {
  const itensPorPagina = 1_000
  const base = `${DJEN}/api/v1/comunicacao?itensPorPagina=${itensPorPagina}&nomeParte=${encodeURIComponent(nome)}`
  const cacheDir = join(cache, "djen")
  const cachePath = join(cacheDir, `${Buffer.from(normalizar(nome)).toString("base64url")}.json`)
  if (existsSync(cachePath)) {
    return validarCacheDjen(JSON.parse(readFileSync(cachePath, "utf8")), nome)
  }
  const itens: Comunicacao[] = []
  let pagina = 1
  let total = 0
  let paginas = 0
  do {
    const resposta = validarRespostaDjen(await fetchJson<unknown>(`${base}&pagina=${pagina}`), nome)
    if (paginas > 0 && resposta.count !== total) throw new Error(`DJEN count inconsistente: ${resposta.count}/${total}`)
    total = resposta.count
    if (total > 10_000) {
      throw new Error(`DJEN excede limite paginavel: ${total} comunicacoes para o nome consultado`)
    }
    if (resposta.items.length === 0 && itens.length < total) throw new Error(`DJEN truncado: pagina ${pagina} vazia antes de ${itens.length}/${total}`)
    itens.push(...resposta.items)
    paginas = pagina
    pagina += 1
  } while (itens.length < total && pagina <= Math.ceil(total / itensPorPagina) + 1 && pagina <= 11)
  if (itens.length < total) throw new Error(`DJEN truncado: ${itens.length}/${total}`)
  const resposta: ResultadoDjen = {
    schema_version: 2,
    url: `${base}&pagina=1`,
    query_nome: nome,
    consultado_em: new Date().toISOString(),
    total,
    itens: sanitizarComunicacoes(itens),
    paginas: Math.max(1, paginas),
    completo: true,
    tetoAtingido: total >= 10_000,
  }
  mkdirSync(cacheDir, { recursive: true })
  const temp = `${cachePath}.tmp-${process.pid}`
  writeFileSync(temp, `${JSON.stringify(resposta)}\n`, { encoding: "utf8", mode: 0o600 })
  renameSync(temp, cachePath)
  return { ...validarCacheDjen(resposta, nome), textosBrutos: new Map(itens.map((item) => [item.id, item.texto ?? ""])) }
}

let filaDjen: Promise<void> = Promise.resolve()

async function buscarDjenSerializado(
  nome: string,
  cache: string,
): Promise<ResultadoDjen> {
  const anterior = filaDjen
  let liberar: () => void = () => undefined
  filaDjen = new Promise<void>((resolve) => { liberar = resolve })
  await anterior
  try {
    return await buscarDjen(nome, cache)
  } finally {
    liberar()
  }
}

let falhasNumeroConsecutivas = 0
const DJEN_NUMERO_SUSPENSO = "DJEN por CNJ suspenso após duas falhas consecutivas"

async function buscarDjenNumeroSerializado(numero: string): Promise<{ count: number; items: Comunicacao[] }> {
  const anterior = filaDjen
  let liberar: () => void = () => undefined
  filaDjen = new Promise<void>((resolve) => { liberar = resolve })
  await anterior
  try {
    if (falhasNumeroConsecutivas >= 2) throw new Error(DJEN_NUMERO_SUSPENSO)
    const digits = numero.replace(/\D/g, "")
    const base = `${DJEN}/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=${digits}`
    const itens: Comunicacao[] = []
    let total = 0
    for (let pagina = 1; pagina <= 10; pagina += 1) {
      const resposta = validarRespostaDjen(await fetchJson<unknown>(`${base}&pagina=${pagina}`, undefined, 1, 20_000))
      if (pagina > 1 && resposta.count !== total) throw new Error("DJEN por CNJ: total mudou durante paginacao")
      total = resposta.count
      if (total > 1000) throw new Error("DJEN por CNJ: limite paginavel excedido")
      itens.push(...resposta.items)
      if (itens.length >= total) break
      if (resposta.items.length === 0) throw new Error("DJEN por CNJ: pagina vazia antes do total")
    }
    if (itens.length !== total) throw new Error("DJEN por CNJ: resposta truncada")
    falhasNumeroConsecutivas = 0
    return { count: total, items: itens }
  } catch (erro) {
    if (!(erro instanceof Error && erro.message === DJEN_NUMERO_SUSPENSO)) falhasNumeroConsecutivas += 1
    throw erro
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300))
    liberar()
  }
}

export function contextoPolitico(
  c: CandidatoBanco,
  _snap: SnapshotCandidato,
  texto: string,
  nomeCompleto: string,
  identidade: Record<string, unknown> = {},
): string | null {
  const t = normalizar(texto)
  const nome = normalizar(nomeCompleto)
  const nomeRegex = escaparRegex(nome)
  const estadoEsperado = UF_NOME[normalizar(c.estado)] ?? ""
  const estadoRegex = estadoEsperado ? escaparRegex(estadoEsperado) : "(?!)"
  const posicoes: number[] = []
  for (let i = t.indexOf(nome); i >= 0; i = t.indexOf(nome, i + nome.length)) posicoes.push(i)
  const cpf = String(identidade.cpf ?? "").replace(/\D/g, "")
  // CPF confere sobre o texto cru (a regra estrita precisa da pontuação)...
  const cpfNoTextoCru = cpfCompativelNoTexto(texto, nomeCompleto, cpf)
  const cpfRegex = cpf.length === 11 ? cpf.split("").join("[.\\s-]{0,3}") : "(?!)"
  for (const pos of posicoes) {
    // Janela salva centrada nesta menção: contém toda a vizinhança conferida abaixo.
    const janela = t.slice(Math.max(0, pos - 400), pos + nome.length + 400)
    const identidadeProxima = t.slice(Math.max(0, pos - 220), pos + nome.length + 220)
    // ...e a prova publicada precisa mostrar o vínculo: o CPF colado ao nome
    // dentro desta janela, não em outro ponto do texto.
    const cpfCompativel = cpfNoTextoCru
      && new RegExp(`\\b${nomeRegex}\\b.{0,100}\\bCPF(?:\\s+N)?\\s+${cpfRegex}\\b`).test(identidadeProxima)
    const cargoDepois = new RegExp(`\\b${nomeRegex}\\b(?:\\s+(?:ATUAL|ENTAO|EX|SR|SRA)){0,3}\\s+${CARGO_POLITICO}\\b`).test(identidadeProxima)
    const cargoAntesDireto = new RegExp(`\\b${CARGO_POLITICO}\\s+(?:DO|DA|DE)?\\s*${nomeRegex}\\b`).test(identidadeProxima)
    const cargoAntesComLocal = new RegExp(
      `\\b(?:VICE GOVERNADOR(?:A)?|GOVERNADOR(?:A)?) (?:DO ESTADO )?DE ${estadoRegex} ${nomeRegex}\\b|\\b(?:VICE PREFEIT[OA]|PREFEIT[OA]) DE [A-Z ]{2,45} REGISTRAD[OA] CIVILMENTE COMO ${nomeRegex}\\b`,
    ).test(identidadeProxima)
    const condicao = new RegExp(`\\b${nomeRegex}\\s+NA CONDICAO DE ${CARGO_POLITICO}\\b`).test(identidadeProxima)
    const contextoEspecial = c.slug === "renan-santos"
      && new RegExp(`(?:${nomeRegex}\\s+(?:FUNDADOR|COORDENADOR|INTEGRANTE|REPRESENTANTE|DO|DA)\\s+(?:MISSAO|MOVIMENTO BRASIL LIVRE|MBL)|(?:MISSAO|MOVIMENTO BRASIL LIVRE|MBL)\\s+(?:REPRESENTAD[OA] POR|FUNDADOR|COORDENADOR|INTEGRANTE)\\s+${nomeRegex})`).test(identidadeProxima)
    if (cpfCompativel || cargoDepois || cargoAntesDireto || cargoAntesComLocal || condicao || contextoEspecial) {
      return janela
    }
  }
  return null
}

export interface CpfRotulado {
  /** `completo`: 11 dígitos; `mascarado`: CPF presente e ilegível (asteriscos ou X). */
  tipo: "completo" | "mascarado"
  digitos: string
}

/** Texto com pontuação preservada: a guarda à esquerda depende dela. */
function semiNormalizar(valor: string): string {
  return stripAccents(String(valor ?? "")).toUpperCase().replace(/[ \t]+/g, " ")
}

/**
 * CPF rotulado COLADO depois do nome no texto oficial, só nessa direção:
 * [início, `:;,.()-` ou quebra de linha] NOME [pontuação] CPF [N°/MF] <CPF>.
 * - O nome precisa começar depois de pontuação (guarda à esquerda): em
 *   "MARIA X, CPF ..." o nome de X está dentro de outro nome e não conta.
 * - Nome embutido em destinatário mais longo (como em `mencionaNomeNoTexto`)
 *   é apagado antes da busca.
 * - Bloco de qualificação entre o nome e o CPF ("brasileiro, casado,
 *   portador do RG...") nunca confirma nem descarta: falha fechada.
 * - CPF antes do nome não conta: é rótulo de quem vem antes.
 */
export function cpfsRotuladosDoNome(texto: string, nomeCompleto: string, destinatarios: string[] = []): CpfRotulado[] {
  const tokens = normalizar(nomeCompleto).split(" ").filter(Boolean)
  if (tokens.length === 0) return []
  let t = semiNormalizar(texto)
  const nomeNorm = tokens.join(" ")
  for (const maior of destinatarios.map(nomeDestinatario).filter((d) => d !== nomeNorm && d.includes(nomeNorm))) {
    const regexMaior = maior.split(" ").map(escaparRegex).join("[\\s'.-]+")
    t = t.replace(new RegExp(`\\b${regexMaior}\\b`, "g"), " # ")
  }
  const nome = tokens.map(escaparRegex).join("[\\s'.-]+")
  const cpf = "(\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}|[\\d*X]{3}\\.?[\\d*X]{3}\\.?[\\d*X]{3}-?[\\d*X]{2})(?![\\d*X])"
  const padrao = new RegExp(
    `(?:^|[:;,.()\\-\\u2013\\n]\\s*)${nome}\\s*[,;:(\\-\\u2013]?\\s*CPF(?:\\s*\\/\\s*MF)?(?:\\s*(?:N[O°º.]?|NUMERO)(?![A-Z])\\.?)?\\s*[:.]?\\s*${cpf}`,
    "gm",
  )
  return [...t.matchAll(padrao)].map((m) => {
    const bruto = m[1]
    return /[*X]/.test(bruto)
      ? { tipo: "mascarado" as const, digitos: bruto.replace(/[^\d]/g, "") }
      : { tipo: "completo" as const, digitos: bruto.replace(/\D/g, "") }
  })
}

/** Os 11 dígitos da candidatura aparecem em algum ponto do texto cru, em qualquer formatação. */
export function cpfDaCandidaturaNoTexto(texto: string, cpf: string): boolean {
  const digitos = cpf.replace(/\D/g, "")
  if (digitos.length !== 11) return false
  return new RegExp(`(?<!\\d)${digitos.split("").join("\\D{0,3}")}(?!\\d)`).test(String(texto ?? ""))
}

/**
 * Descarte de homônimo: só quando há CPF COMPLETO colado ao nome, nenhum CPF
 * mascarado colado ao nome (presente e indecidível mantém a ocorrência
 * ambígua) e os 11 dígitos da candidatura não aparecem em lugar nenhum do
 * texto. Na dúvida, não descarta.
 */
export function cpfDivergenteNoTexto(texto: string, nomeCompleto: string, cpf: string, destinatarios: string[] = []): boolean {
  const cpfCandidato = cpf.replace(/\D/g, "")
  if (cpfCandidato.length !== 11) return false
  if (cpfDaCandidaturaNoTexto(texto, cpfCandidato)) return false
  const rotulados = cpfsRotuladosDoNome(texto, nomeCompleto, destinatarios)
  if (rotulados.some((r) => r.tipo === "mascarado")) return false
  return rotulados.some((r) => r.tipo === "completo" && r.digitos !== cpfCandidato)
}

/** CPF completo da candidatura colado depois do nome (mesma regra estrita). */
export function cpfCompativelNoTexto(texto: string, nomeCompleto: string, cpf: string, destinatarios: string[] = []): boolean {
  const cpfCandidato = cpf.replace(/\D/g, "")
  if (cpfCandidato.length !== 11) return false
  return cpfsRotuladosDoNome(texto, nomeCompleto, destinatarios).some((r) => r.tipo === "completo" && r.digitos === cpfCandidato)
}

/** Segundo identificador estrito para monitoramento por CNJ: CPF ou cargo estadual com UF. */
export function identificadorForteNoTexto(
  c: CandidatoBanco,
  texto: string,
  nomeCompleto: string,
  identidade: Record<string, unknown>,
): boolean {
  const cpf = String(identidade.cpf ?? "").replace(/\D/g, "")
  if (cpfCompativelNoTexto(texto, nomeCompleto, cpf)) return true
  const uf = UF_NOME[normalizar(c.estado)]
  if (!uf) return false
  const cargos = [c.cargo_disputado, c.cargo_atual].map(normalizar)
  const generos: string[] = []
  if (cargos.some((cargo) => /^GOVERNADOR(?:A)?$/.test(cargo))) generos.push("GOVERNADOR(?:A)?")
  if (cargos.some((cargo) => /^VICE GOVERNADOR(?:A)?$/.test(cargo))) generos.push("VICE GOVERNADOR(?:A)?")
  if (cargos.some((cargo) => /\bSENADOR(?:A)?\b/.test(cargo))) generos.push("SENADOR(?:A)?")
  if (cargos.some((cargo) => /\bDEPUTAD[OA] ESTADUAL\b/.test(cargo))) generos.push("DEPUTAD[OA] ESTADUAL")
  if (generos.length === 0) return false
  const nome = escaparRegex(normalizar(nomeCompleto))
  const cargoUf = `(?:${generos.join("|")})\\s+(?:DO|DA|DE|PELO|PELA|POR)\\s+(?:ESTADO\\s+(?:DO|DA|DE)\\s+)?${escaparRegex(uf)}`
  const t = normalizar(texto)
  // Atribuicao gramatical direta: nenhum nome ou frase livre entre a parte e o cargo/UF.
  const depois = `\\b${nome}\\b\\s+(?:(?:O|A|EX|ATUAL|ENTAO)\\s+|(?:NA CONDICAO DE|QUE EXERCE O CARGO DE)\\s+)?${cargoUf}\\b`
  const antes = `\\b${cargoUf}\\b\\s+(?:(?:O|A)\\s+)?${nome}\\b`
  return new RegExp(`${depois}|${antes}`).test(t)
}

export async function chaveDatajud(): Promise<string> {
  const texto = await (await fetch("https://datajud-wiki.cnj.jus.br/api-publica/acesso/", { signal: AbortSignal.timeout(30_000) })).text()
  const semHtml = texto.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ")
  const match = semHtml.match(/Authorization:\s*APIKey\s+([A-Za-z0-9+/_=-]{20,})/)
  if (!match) throw new Error("chave publica do DataJud nao encontrada na documentacao oficial")
  return match[1]
}

async function conferirDatajudLote(
  processos: Array<{ numero: string; tribunal: string }>,
  chave: string,
): Promise<Map<string, Record<string, unknown>>> {
  const resultado = new Map<string, Record<string, unknown>>()
  const porTribunal = new Map<string, Array<{ numero: string; digitos: string }>>()
  for (const processo of processos) {
    const alias = processo.tribunal.toLowerCase()
    porTribunal.set(alias, [
      ...(porTribunal.get(alias) ?? []),
      { numero: processo.numero, digitos: processo.numero.replace(/\D/g, "") },
    ])
  }

  for (const [alias, itens] of porTribunal) {
    const url = `${DATAJUD}/api_publica_${alias}/_search`
    for (let inicio = 0; inicio < itens.length; inicio += 50) {
      const bloco = itens.slice(inicio, inicio + 50)
      try {
        const resposta = validarRespostaDatajud(await fetchJson<unknown>(url, {
          method: "POST",
          headers: { Authorization: `APIKey ${chave}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            size: bloco.length,
            query: {
              bool: {
                should: bloco.map((item) => ({ match: { numeroProcesso: item.digitos } })),
                minimum_should_match: 1,
              },
            },
          }),
        }, 1, 15_000))
        const fontes = new Map(
          (resposta.hits?.hits ?? [])
            .map((hit) => hit._source)
            .filter((fonte): fonte is Record<string, unknown> => Boolean(fonte?.numeroProcesso))
            .map((fonte) => [String(fonte.numeroProcesso).replace(/\D/g, ""), fonte]),
        )
        for (const item of bloco) {
          const fonte = fontes.get(item.digitos)
          resultado.set(chaveConferenciaDatajud(alias, item.numero), fonte ? {
            status: "confirmado", url, numeroProcesso: fonte.numeroProcesso,
            classe: fonte.classe, orgaoJulgador: fonte.orgaoJulgador,
            dataAjuizamento: fonte.dataAjuizamento, grau: fonte.grau,
          } : { status: "nao_localizado", url })
        }
      } catch (erro) {
        for (const item of bloco) {
          resultado.set(chaveConferenciaDatajud(alias, item.numero), {
            status: "erro", url, motivo: erro instanceof Error ? erro.message : String(erro),
          })
        }
      }
    }
  }
  return resultado
}

export function validarRespostaDatajud(resposta: unknown): { hits: { hits: Array<{ _source?: Record<string, unknown> }> } } {
  if (!resposta || typeof resposta !== "object") throw new Error("DataJud resposta invalida: objeto esperado")
  const registro = resposta as Record<string, unknown>
  if (!registro.hits || typeof registro.hits !== "object") throw new Error("DataJud resposta invalida: hits ausente")
  const hits = registro.hits as Record<string, unknown>
  if (!Array.isArray(hits.hits)) throw new Error("DataJud resposta invalida: hits.hits array esperado")
  return { hits: { hits: hits.hits as Array<{ _source?: Record<string, unknown> }> } }
}

export function chaveConferenciaDatajud(tribunal: string, numero: string): string {
  return `${tribunal.trim().toLowerCase()}:${numero.replace(/\D/g, "")}`
}

export async function conferirDatajudResultados(
  resultados: RegistroCandidato[],
  chave: string,
  conferir: typeof conferirDatajudLote = conferirDatajudLote,
): Promise<void> {
  const processos = resultados.flatMap((candidato) => candidato.processos.map((processo) => ({
    numero: processo.numero_cnj,
    tribunal: processo.tribunal,
  })))
  if (processos.length === 0) return
  const tribunaisPorNumero = new Map<string, string>()
  for (const processo of processos) {
    const numero = processo.numero.replace(/\D/g, "")
    const tribunal = processo.tribunal.trim().toLowerCase()
    const anterior = tribunaisPorNumero.get(numero)
    if (anterior && anterior !== tribunal) {
      throw new Error(`DataJud: conflito de tribunal para ${processo.numero}: ${anterior} x ${tribunal}`)
    }
    tribunaisPorNumero.set(numero, tribunal)
  }
  const conferencias = await conferir(processos, chave)
  for (const candidato of resultados) {
    for (const processo of candidato.processos) {
      const conferencia = conferencias.get(chaveConferenciaDatajud(processo.tribunal, processo.numero_cnj))
      if (!conferencia) throw new Error(`DataJud: resposta ausente para ${processo.tribunal} ${processo.numero_cnj}`)
      const status = String(conferencia.status ?? "")
      if (!new Set(["confirmado", "nao_localizado", "erro"]).has(status)) {
        throw new Error(`DataJud: status nao final para ${processo.tribunal} ${processo.numero_cnj}: ${status || "ausente"}`)
      }
      processo.datajud = conferencia
    }
  }
}

function urlOficial(_comunicacao: Comunicacao, numero: string): string {
  return `${DJEN}/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=${encodeURIComponent(numero.replace(/\D/g, ""))}`
}

export function filtrarHomonimosDescartados(
  descartados: Map<string, Record<string, unknown>>,
  encontrados: Map<string, unknown>,
): Array<Record<string, unknown>> {
  return [...descartados.entries()]
    .filter(([numero]) => !encontrados.has(numero))
    .map(([, descarte]) => descarte)
}

export function classificarResultadoDjen(
  processos: number,
  ambiguos: number,
  tetoAtingido: boolean,
): { classificacao: Classificacao; motivo: string } {
  if (processos > 0) {
    return {
      classificacao: "encontrado",
      motivo: `${processos} processo(s) com numero CNJ e contexto oficial de identidade`,
    }
  }
  if (ambiguos > 0) {
    return {
      classificacao: "bloqueado",
      motivo: `${ambiguos} ocorrencia(s) por nome exato sem segundo identificador; conclusao bloqueada por identidade ambigua${tetoAtingido ? "; DJEN atingiu o teto publico de 10000 comunicacoes" : ""}`,
    }
  }
  if (tetoAtingido) {
    return {
      classificacao: "bloqueado",
      motivo: "DJEN atingiu o teto publico de 10000 comunicacoes; a busca pode estar truncada e a ausencia de achado nao confirma vazio",
    }
  }
  return {
    classificacao: "vazio_confirmado",
    motivo: "nenhum processo atribuivel no escopo DJEN; nenhuma ocorrencia por nome exato foi localizada",
  }
}

export async function pesquisarCandidato(
  c: CandidatoBanco,
  snap: SnapshotCandidato,
  seed: SeedCandidato | undefined,
  identidadesTse: Map<string, Record<string, unknown>>,
  tribunais: string[],
  cache: string,
  dependencias: DependenciasPesquisa = {},
): Promise<RegistroCandidato> {
  const base: Omit<RegistroCandidato, "identidade" | "busca" | "ocorrencias_ambiguas" | "homonimos_descartados" | "classificacao" | "motivo" | "processos"> = {
    slug: c.slug, nome_urna: c.nome_urna, nome_completo: c.nome_completo,
    cargo: c.cargo_disputado, uf: c.estado, partido: c.partido_sigla,
    prioridade: prioridade(snap), banco: { coleta_log: "pendente" },
  }
  let identidade: Record<string, unknown>
  const confirmar = dependencias.confirmarIdentidade ?? confirmarIdentidade
  const buscar = dependencias.buscarDjen ?? buscarDjenSerializado
  try { identidade = await confirmar(c, seed, identidadesTse) }
  catch (erro) { identidade = { status: "bloqueada", motivo: erro instanceof Error ? erro.message : String(erro) } }
  const nomeConsulta = typeof identidade.nome === "string"
    ? identidade.nome
    : typeof identidade.nome_oficial === "string"
      ? identidade.nome_oficial
      : c.nome_completo
  const baseConfirmada = nomeConsulta === c.nome_completo
    ? base
    : {
        ...base,
        nome_completo: nomeConsulta,
        banco: { ...base.banco, nome_completo_ficha: c.nome_completo, divergencia_nome: true },
      }
  try {
    const djen = await buscar(nomeConsulta, cache)
    const nome = normalizar(nomeConsulta)
    const exatos = djen.itens.filter((item) => (item.destinatarios ?? []).some((d) => nomeDestinatario(d.nome) === nome))
    const exatosIds = new Set(exatos.map((item) => item.id))
    // Parte citada no texto sem ser destinataria (a intimacao vai ao advogado)
    // tambem e ocorrencia: sem isso, o vazio_confirmado afirmaria ausencia com
    // o nome exato presente no acervo consultado.
    const semDestinatarios = djen.itens.filter((item) =>
      !exatosIds.has(item.id) && mencionaNomeNoTexto(item, nome),
    )
    if (identidade.status !== "confirmada") {
      const tetoAtingido = djen.tetoAtingido === true || djen.total >= 10_000
      return {
        ...baseConfirmada,
        identidade,
        busca: {
          fonte: "DJEN/PJe-CNJ", url: djen.url, consultado_em: djen.consultado_em, periodo: periodoConsultaDjen(djen.consultado_em),
          termos: "nome completo exato (parametro nomeParte); cargo/UF/nome de urna no texto para atribuicao local",
          total_api: djen.total, ocorrencias_nome_exato: exatos.length,
          ocorrencias_ambiguas: exatos.length + semDestinatarios.length,
          ocorrencias_sem_destinatarios: semDestinatarios.length,
          ocorrencias_nome_no_texto: semDestinatarios.length,
          teto_publico_atingido: tetoAtingido,
          completo: djen.completo === true, conferencia_cpf: djen.textosBrutos ? "texto_bruto_em_memoria" : "indisponivel_cache_sanitizado",
          tribunais_consultados: tribunais,
        },
        ocorrencias_ambiguas: [...exatos, ...semDestinatarios].map((item) => ({
          numero_cnj: item.numeroprocessocommascara || item.numero_processo || `comunicacao-${item.id}`,
          tribunal: item.siglaTribunal ?? null,
          motivo: "nome exato sem segundo identificador oficial; identidade da ficha bloqueada",
        })),
        homonimos_descartados: [],
        classificacao: "bloqueado",
        motivo: `busca executada; identidade bloqueada: ${String(identidade.motivo ?? "sem segundo identificador oficial")}`,
        processos: [],
      }
    }
    const encontrados = new Map<string, { item: Comunicacao; contexto: string; polo: string | null }>()
    const descartados = new Map<string, Record<string, unknown>>()
    const ambiguos = new Map<string, Record<string, unknown>>()
    const cpfCandidato = String(identidade.cpf ?? "")
    const descartarSeCpfDiverge = (item: Comunicacao, numero: string): boolean => {
      const destinatarios = (item.destinatarios ?? []).map((d) => String(d.nome ?? ""))
      if (!cpfDivergenteNoTexto(djen.textosBrutos?.get(item.id) ?? "", nomeConsulta, cpfCandidato, destinatarios)) return false
      const chave = cnjValido(numero) ? numero : `comunicacao-${item.id}`
      descartados.set(chave, {
        numero_cnj: chave,
        tribunal: item.siglaTribunal ?? null,
        motivo: "CPF rotulado no texto oficial diverge do CPF da candidatura; homonimo descartado",
      })
      return true
    }
    for (const item of semDestinatarios) {
      const numero = item.numeroprocessocommascara || item.numero_processo || `comunicacao-${item.id}`
      if (descartarSeCpfDiverge(item, numero)) continue
      ambiguos.set(numero, {
        numero_cnj: numero,
        tribunal: item.siglaTribunal ?? null,
        motivo: "nome exato no texto da comunicacao, fora dos destinatarios; identidade nao atribuida automaticamente",
      })
    }
    for (const item of exatos) {
      const numero = item.numeroprocessocommascara || item.numero_processo || `comunicacao-${item.id}`
      if (descartarSeCpfDiverge(item, numero)) continue
      const contexto = contextoPolitico(c, snap, djen.textosBrutos?.get(item.id) ?? item.texto ?? "", nomeConsulta, identidade)
      const polo = item.destinatarios?.find((d) => nomeDestinatario(d.nome) === nome)?.polo ?? null
      const cnj = cnjValido(numero)
      // Sem texto bruto (cache sanitizado) o descarte por CPF não rodou: nada vira achado.
      if (contexto && cnj && djen.textosBrutos) encontrados.set(numero, { item, contexto, polo })
      else ambiguos.set(numero, {
        numero_cnj: numero,
        tribunal: item.siglaTribunal ?? null,
        motivo: contexto && cnj
          ? "conferencia de CPF indisponivel no cache sanitizado; refazer a busca sem cache"
          : contexto
          ? "comunicacao oficial sem numero CNJ validavel"
          : "nome exato sem segundo identificador oficial adjacente; identidade ambigua",
      })
    }
    const processos: ProcessoAchado[] = []
    for (const [numero, achado] of encontrados) {
      processos.push({
        numero_cnj: numero, tribunal: achado.item.siglaTribunal ?? "indeterminado",
        classe: achado.item.nomeClasse ?? null, orgao: achado.item.nomeOrgao ?? null,
        polo: achado.polo, url: urlOficial(achado.item, numero),
        contexto_identidade: achado.contexto,
        datajud: { status: "pendente_conferencia_lote" },
      })
    }
    // CNJ em que o mesmo nome foi identificado como outra pessoa sai da
    // ambiguidade: a coincidência já foi resolvida por CPF oficial.
    const ambiguosPendentes = new Map(
      [...ambiguos].filter(([numero]) => !encontrados.has(numero) && !descartados.has(numero)),
    )
    const tetoAtingido = djen.tetoAtingido === true || djen.total >= 10_000
    const resultado = classificarResultadoDjen(processos.length, ambiguosPendentes.size, tetoAtingido)
    return {
      ...baseConfirmada, identidade,
      busca: {
        fonte: "DJEN/PJe-CNJ", url: djen.url, consultado_em: djen.consultado_em, periodo: periodoConsultaDjen(djen.consultado_em),
        termos: "nome completo exato (parametro nomeParte); cargo/UF/nome de urna no texto para atribuicao local; partido/trajetoria nao sao filtros da consulta",
        total_api: djen.total, ocorrencias_nome_exato: exatos.length,
        ocorrencias_ambiguas: ambiguosPendentes.size,
        ocorrencias_sem_destinatarios: semDestinatarios.length,
        ocorrencias_nome_no_texto: semDestinatarios.length,
        teto_publico_atingido: tetoAtingido,
        completo: djen.completo === true, conferencia_cpf: djen.textosBrutos ? "texto_bruto_em_memoria" : "indisponivel_cache_sanitizado",
        tribunais_consultados: tribunais,
      },
      ocorrencias_ambiguas: [...ambiguosPendentes.values()],
      homonimos_descartados: filtrarHomonimosDescartados(descartados, encontrados),
      classificacao: resultado.classificacao,
      motivo: resultado.motivo,
      processos,
    }
  } catch (erro) {
    return {
      ...baseConfirmada,
      identidade,
      busca: {
        fonte: "DJEN/PJe-CNJ",
        url: `${DJEN}/api/v1/comunicacao?itensPorPagina=100&nomeParte=${encodeURIComponent(nomeConsulta)}&pagina=1`,
        consultado_em: new Date().toISOString(),
        periodo: "consulta DJEN falhou antes de obter acervo; data registrada no recibo",
        termos: "nome completo exato + cargo + UF + partido + trajetoria",
        tribunais_consultados: tribunais,
        erro: erro instanceof Error ? erro.message : String(erro),
      },
      ocorrencias_ambiguas: [], homonimos_descartados: [], classificacao: "erro",
      motivo: erro instanceof Error ? erro.message : String(erro), processos: [],
    }
  }
}

/** Readback dirigido: CNJ já persistido, destinatário exato e contexto político oficial. Nunca busca por nome. */
export async function pesquisarCandidatoPorCnjs(
  c: CandidatoBanco,
  snap: SnapshotCandidato,
  seed: SeedCandidato | undefined,
  identidadesTse: Map<string, Record<string, unknown>>,
  cnjs: Array<{ numero_cnj: string; tribunal: string }>,
  buscarNumero: (numero: string) => Promise<{ count: number; items: Comunicacao[] }> = buscarDjenNumeroSerializado,
  confirmar: typeof confirmarIdentidade = confirmarIdentidade,
): Promise<RegistroCandidato> {
  let identidade: Record<string, unknown>
  try { identidade = await confirmar(c, seed, identidadesTse) }
  catch (erro) { identidade = { status: "bloqueada", motivo: erro instanceof Error ? erro.message : String(erro) } }
  const identidadePersistida = { ...identidade }
  delete identidadePersistida.cpf
  const dataConsulta = new Date().toISOString()
  const base: RegistroCandidato = {
    slug: c.slug, nome_urna: c.nome_urna, nome_completo: c.nome_completo,
    cargo: c.cargo_disputado, uf: c.estado, partido: c.partido_sigla,
    prioridade: prioridade(snap), banco: { coleta_log: "pendente" },
    identidade: identidadePersistida,
    busca: { fonte: "DJEN/PJe-CNJ", consultado_em: dataConsulta, termos: "numeroProcesso; sem busca por nome", cnjs_previstos: cnjs.map((x) => x.numero_cnj) },
    ocorrencias_ambiguas: [], homonimos_descartados: [], processos: [],
    classificacao: "bloqueado", motivo: "sem atribuicao judicial suficiente",
  }
  if (identidade.status !== "confirmada") {
    base.motivo = "identidade eleitoral nao confirmada; consulta judicial nao iniciada"
    base.ocorrencias_ambiguas = cnjs.map(({ numero_cnj, tribunal }) => ({ numero_cnj, tribunal, motivo: "nao consultado: identidade eleitoral nao confirmada" }))
    base.busca = { ...base.busca, cnjs_respondidos: [], cnjs_nao_consultados: cnjs.map((x) => x.numero_cnj), parcial: true }
    return base
  }
  let falhas = 0
  let falhasConsecutivas = 0
  let semAtribuicao = 0
  const respondidos: string[] = []
  const naoConsultados: string[] = []
  const nome = typeof identidade.nome === "string" ? identidade.nome : c.nome_completo
  for (const [indice, { numero_cnj: numero, tribunal }] of cnjs.entries()) {
    const url = `${DJEN}/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=${numero.replace(/\D/g, "")}`
    try {
      const resposta = await buscarNumero(numero)
      if (!Number.isInteger(resposta.count) || !Array.isArray(resposta.items) || resposta.count !== resposta.items.length) {
        throw new Error("DJEN por CNJ: resposta incompleta")
      }
      respondidos.push(numero)
      falhasConsecutivas = 0
      const itens = resposta.items.filter((item) =>
        item.ativo === true && String(item.numero_processo ?? item.numeroprocessocommascara ?? "").replace(/\D/g, "") === numero.replace(/\D/g, ""),
      )
      const atribuivel = itens.find((item) =>
        (item.destinatarios ?? []).some((parte) => normalizar(parte.nome) === normalizar(nome))
        && identificadorForteNoTexto(c, item.texto ?? "", nome, identidade),
      )
      if (atribuivel) {
        base.processos.push({
          numero_cnj: numero, tribunal, classe: atribuivel.nomeClasse ?? null,
          orgao: atribuivel.nomeOrgao ?? null,
          polo: atribuivel.destinatarios?.find((parte) => normalizar(parte.nome) === normalizar(nome))?.polo ?? null,
          url,
          contexto_identidade: "destinatario exato e CPF igual ou cargo estadual ligado a UF na comunicacao oficial; texto omitido",
          datajud: { status: "nao_consultado_em_monitoramento" },
        })
      } else {
        semAtribuicao += 1
        base.ocorrencias_ambiguas.push({ numero_cnj: numero, tribunal, motivo: "CNJ oficial sem segundo identificador suficiente para atribuir a pessoa" })
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro)
      const fonteSuspensa = mensagem === DJEN_NUMERO_SUSPENSO
      if (fonteSuspensa) {
        naoConsultados.push(numero)
        base.ocorrencias_ambiguas.push({ numero_cnj: numero, tribunal, motivo: "nao consultado: DJEN suspenso apos duas falhas consecutivas" })
      } else {
        falhas += 1
        falhasConsecutivas += 1
        base.ocorrencias_ambiguas.push({ numero_cnj: numero, tribunal, motivo: "fonte oficial indisponivel ou incompleta", erro: mensagem })
      }
      if (fonteSuspensa || falhasConsecutivas >= 2) {
        for (const restante of cnjs.slice(indice + 1)) {
          naoConsultados.push(restante.numero_cnj)
          base.ocorrencias_ambiguas.push({ numero_cnj: restante.numero_cnj, tribunal: restante.tribunal, motivo: "nao consultado: interrompido apos duas falhas na fonte" })
        }
        break
      }
    }
  }
  base.busca = { ...base.busca, url: `${DJEN}/api/v1/comunicacao`, falhas, sem_atribuicao: semAtribuicao, cnjs_respondidos: respondidos, cnjs_nao_consultados: naoConsultados, parcial: falhas > 0 || naoConsultados.length > 0 }
  if (falhas > 0 || naoConsultados.length > 0) {
    base.classificacao = "erro"
    base.motivo = "readback DJEN por CNJ parcial ou falhou; achados parciais nao fecham o candidato"
  } else if (base.processos.length > 0) {
    base.classificacao = "encontrado"
    base.motivo = "CNJ, destinatario e contexto oficiais; atribuicao e publicacao exigem revisao independente"
  } else {
    base.motivo = "CNJs conhecidos sem segundo identificador judicial suficiente; nao confirmar vazio"
  }
  return base
}

function resumo(lotes: Evidencia["lotes"]): Record<string, number> {
  const candidatos = lotes.flatMap((l) => l.candidatos)
  return {
    classificados: candidatos.length,
    encontrado: candidatos.filter((c) => c.classificacao === "encontrado").length,
    vazio_confirmado: candidatos.filter((c) => c.classificacao === "vazio_confirmado").length,
    bloqueado: candidatos.filter((c) => c.classificacao === "bloqueado").length,
    erro: candidatos.filter((c) => c.classificacao === "erro").length,
  }
}

function gravarAtomico(path: string, dados: Evidencia): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}`
  rmSync(temp, { force: true })
  const texto = `${JSON.stringify(dados, null, 2)}\n`
  writeFileSync(temp, texto, { encoding: "utf8", mode: 0o600 })
  renameSync(temp, path)
  chmodSync(path, 0o600)
}

async function adquirirLockCheckpoint(
  path: string,
  opcoes: CheckpointEvidenciaOpcoes,
): Promise<() => void> {
  mkdirSync(dirname(path), { recursive: true })
  const lockPath = `${path}.lock`
  const timeoutMs = opcoes.timeoutMs ?? 30_000
  const retryMs = opcoes.retryMs ?? 25
  const inicio = Date.now()
  for (;;) {
    try {
      const descritor = openSync(lockPath, "wx", 0o600)
      return () => {
        try {
          closeSync(descritor)
        } finally {
          rmSync(lockPath, { force: true })
        }
      }
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== "EEXIST") throw erro
      if (Date.now() - inicio >= timeoutMs) {
        throw new Error(`checkpoint: timeout aguardando lock ${lockPath}`)
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs))
    }
  }
}

export async function gravarCheckpointConcorrente(
  path: string,
  entrada: CheckpointEvidenciaInput,
  opcoes: CheckpointEvidenciaOpcoes = {},
): Promise<Evidencia> {
  const liberar = await adquirirLockCheckpoint(path, opcoes)
  try {
    await opcoes.aposAdquirirLock?.()
    const anterior: Evidencia | null = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8")) as Evidencia
      : null
    if (anterior && anterior.schema_version !== 1) {
      throw new Error(`checkpoint: schema_version incompatível (${String(anterior.schema_version)})`)
    }
    if (anterior && anterior.total_inicial !== entrada.total_inicial) {
      throw new Error(`checkpoint: coorte diverge no total (${anterior.total_inicial} x ${entrada.total_inicial})`)
    }
    if (anterior && JSON.stringify(anterior.candidatos_iniciais) !== JSON.stringify(entrada.candidatos_iniciais)) {
      throw new Error("checkpoint: candidatos iniciais divergem da evidencia existente")
    }
    for (const [campo, valorAnterior, valorEntrada] of [
      ["supabase_ref", anterior?.supabase_ref, entrada.supabase_ref],
      ["base_commit", anterior?.base_commit, entrada.base_commit],
      ["branch", anterior?.branch, entrada.branch],
      ["snapshot_inicial_em", anterior?.snapshot_inicial_em, entrada.snapshot_inicial_em],
      ["fontes", anterior?.fontes, entrada.fontes],
    ] as const) {
      if (anterior && !isDeepStrictEqual(valorAnterior, valorEntrada)) {
        throw new Error(`checkpoint: ${campo} diverge da evidencia existente`)
      }
    }
    const lotes = [
      ...(anterior?.lotes ?? []).filter((item) => item.numero !== entrada.lote.numero),
      entrada.lote,
    ].sort((a, b) => a.numero - b.numero)
    const evidencia: Evidencia = {
      schema_version: 1,
      supabase_ref: entrada.supabase_ref,
      base_commit: entrada.base_commit,
      branch: entrada.branch,
      snapshot_inicial_em: anterior?.snapshot_inicial_em ?? entrada.snapshot_inicial_em,
      total_inicial: entrada.total_inicial,
      candidatos_iniciais: entrada.candidatos_iniciais,
      fontes: entrada.fontes,
      lotes,
      resumo: resumo(lotes),
      atualizado_em: new Date().toISOString(),
    }
    gravarAtomico(path, evidencia)
    return evidencia
  } finally {
    liberar()
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const opcoes = flags(argv)
  const targetSlugs = slugsSolicitados(argv)
  const coorteAtual = flagPresente(argv, "coorte-atual")
  const dryRun = flagPresente(argv, "dry-run")
  const somenteCnj = flagPresente(argv, "somente-cnj")
  if (somenteCnj && (!coorteAtual || !dryRun)) throw new Error("--somente-cnj exige --coorte-atual --dry-run")
  if (coorteAtual && (!opcoes.has("evidence") || !opcoes.has("cache"))) throw new Error("--coorte-atual exige --evidence e --cache explicitos")
  if (coorteAtual && targetSlugs) throw new Error("--coorte-atual nao pode ser combinado com --slugs")
  if (coorteAtual && (opcoes.has("lote") || opcoes.has("lotes"))) throw new Error("--coorte-atual nao pode ser combinado com --lote ou --lotes")
  if (coorteAtual && !dryRun) throw new Error("--coorte-atual exige --dry-run; a coorte atual so pode ser sondada sem escrita")
  const modoAlvos = modoAlvosSolicitado(argv)
  const margemDias = margemDiasSolicitada(argv)
  const cargo = cargoSolicitado(argv)
  if (!coorteAtual && (opcoes.has("alvos") || opcoes.has("margem-dias") || opcoes.has("cargo"))) {
    throw new Error("--alvos, --margem-dias e --cargo exigem --coorte-atual")
  }
  if (somenteCnj && modoAlvos !== "sem-recibo") throw new Error("--somente-cnj nao combina com --alvos=vencendo")
  const modoEvidencia = somenteCnj
    ? "dry-run-coorte-atual-somente-cnj"
    : modoAlvos === "vencendo"
      ? "dry-run-coorte-atual-renovacao"
      : modoAlvos === "indeterminados"
        ? "dry-run-coorte-atual-reexame-indeterminados"
        : modoAlvos === "encontrados" ? "dry-run-coorte-atual-revalidacao" : "dry-run-coorte-atual-sem-recibo"
  const numeros = coorteAtual || targetSlugs ? [1] : lotesSolicitados(argv)
  const snapshotPath = resolve(opcoes.get("snapshot") ?? "/tmp/2026-08-05-processos-inicial-snapshot.json")
  const evidencePath = resolve(opcoes.get("evidence") ?? "~/.disposable-html/2026-08-05-puxa-ficha-processos-curadoria.evidence.json".replace("~", process.env.HOME ?? ""))
  const cache = resolve(opcoes.get("cache") ?? "/tmp/puxa-ficha-processos-curadoria-cache")
  const snapshotSaida = coorteAtual ? resolve(opcoes.get("snapshot-saida") ?? `${evidencePath}.snapshot.json`) : null
  if (coorteAtual) {
    exigirCaminhoPersistente(evidencePath, "--evidence")
    exigirCaminhoPersistente(snapshotSaida!, "--snapshot-saida")
  }
  const coortePreflight = coorteAtual ? await lerCoorteAtualParaDryRun(somenteCnj, modoAlvos, margemDias, cargo) : null
  let snapshotSha: string | null = null
  if (coortePreflight && snapshotSaida) {
    const snapshot = montarSnapshotCoorteAtual(coortePreflight.candidatos, coortePreflight.recibos, coortePreflight.alvos, {
      modo: modoEvidencia,
      filtro_cargo: cargo,
      margem_dias: modoAlvos === "vencendo" ? margemDias : null,
      coorte_publica_total: coortePreflight.coortePublicaTotal,
    })
    const texto = `${JSON.stringify(snapshot, null, 2)}\n`
    mkdirSync(dirname(snapshotSaida), { recursive: true })
    writeFileSync(snapshotSaida, texto, { encoding: "utf8", mode: 0o600 })
    chmodSync(snapshotSaida, 0o600)
    snapshotSha = createHash("sha256").update(texto).digest("hex")
  }
  if (coortePreflight && coortePreflight.alvos.length === 0) {
    console.log(JSON.stringify({
      modo: modoEvidencia,
      snapshot: snapshotSaida,
      coorte: coortePreflight.candidatos.length,
      alvos: 0,
      residuais: coortePreflight.residuais.length,
      residuais_sem_cnj: somenteCnj ? coortePreflight.residuais : undefined,
      resumo: { classificados: 0, encontrado: 0, vazio_confirmado: 0, bloqueado: 0, erro: 0 },
      evidencia: "nao-sobrescrita",
    }, null, 2))
    return
  }
  await executarLotesEmOrdem(
    numeros,
    async (selecionados) => {
      let iniciais: SnapshotCandidato[]
      let currentTargets: string[] | null = null
      if (coorteAtual) {
        currentTargets = coortePreflight!.alvos
        const alvosSet = new Set(currentTargets)
        // A evidencia da coorte atual registra apenas os alvos: e ela que o
        // aplicador valida inteira, sem depender do snapshot de agosto.
        iniciais = coortePreflight!.candidatos.filter((c) => alvosSet.has(c.slug)).map((c) => ({
          slug: c.slug, nome_urna: c.nome_urna, cargo_disputado: c.cargo_disputado,
          estado: c.estado ?? undefined, partido_sigla: c.partido_sigla ?? undefined, processos: 0,
        }))
      } else {
        const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as SnapshotCandidato[]
        iniciais = ordenar(snapshot.filter((c) => c.processos === 0))
        if (!targetSlugs && iniciais.length !== 185) throw new Error(`coorte inicial inesperada: ${iniciais.length}`)
      }
      const initialBySlug = new Map(iniciais.map((candidate) => [candidate.slug, candidate]))
      const missingTargets = targetSlugs?.filter((slug) => !initialBySlug.has(slug)) ?? []
      if (missingTargets.length > 0) throw new Error(`alvos ausentes ou já materializados: ${missingTargets.join(",")}`)
      const scopedSlugs = coorteAtual ? currentTargets! : targetSlugs
      const scopedInitials = scopedSlugs ? scopedSlugs.map((slug) => initialBySlug.get(slug)!) : iniciais
      const lotes = scopedSlugs
        ? new Map([[1, scopedInitials]])
        : new Map(selecionados.map((numero) => {
            const lote = iniciais.slice((numero - 1) * TAMANHO_LOTE, numero * TAMANHO_LOTE)
            if (lote.length === 0) throw new Error(`lote ${numero} vazio`)
            return [numero, lote]
          }))
      const slugs = [...lotes.values()].flatMap((lote) => lote.map((c) => c.slug))
      const { data, error } = await supabase.from("candidatos")
        .select("id,slug,nome_completo,nome_urna,cargo_disputado,cargo_atual,estado,partido_sigla,biografia,sq_candidato_2026")
        .in("slug", slugs)
      if (error) throw new Error(error.message)
      const candidatosBanco = data as CandidatoBanco[]
      const banco = new Map(candidatosBanco.map((c) => [c.slug, c]))
      const seeds = new Map((JSON.parse(readFileSync(resolve("data/candidatos.json"), "utf8")) as SeedCandidato[]).map((c) => [c.slug, c]))
      const identidadesTse = await carregarIdentidadesTse(candidatosBanco, seeds, cache)
      const inventario = await fetchJson<InventarioTribunais[]>(`${DJEN}/api/v1/comunicacao/tribunal`)
      const tribunais = instituicoesAtivas(inventario)
      const datajudKey = somenteCnj ? null : await chaveDatajud()
      const anterior: Evidencia | null = existsSync(evidencePath)
        ? JSON.parse(readFileSync(evidencePath, "utf8")) as Evidencia
        : null
      const snapshotInicialEm = anterior?.snapshot_inicial_em ?? (coorteAtual ? new Date().toISOString() : statSync(snapshotPath).mtime.toISOString())
      return { iniciais, lotes, banco, seeds, identidadesTse, tribunais, datajudKey, anterior, snapshotInicialEm }
    },
    async (numero, contexto) => {
      const lote = contexto.lotes.get(numero)
      if (!lote) throw new Error(`lote ${numero} nao carregado`)
      const resultados = await processarComDoisWorkers(lote, async (snap) => {
        const c = contexto.banco.get(snap.slug)
        if (!c) throw new Error(`candidato ausente no banco: ${snap.slug}`)
        const resultado = somenteCnj
          ? await pesquisarCandidatoPorCnjs(
            c, snap, contexto.seeds.get(c.slug), contexto.identidadesTse,
            coortePreflight!.cnjsPorSlug.get(c.slug) ?? [],
          )
          : await pesquisarCandidato(
            c, snap, contexto.seeds.get(c.slug), contexto.identidadesTse,
            contexto.tribunais, cache,
          )
        console.error(`[processos] ${c.slug}: ${resultado.classificacao}`)
        return resultado
      })
      if (!somenteCnj) await conferirDatajudResultados(resultados, contexto.datajudKey!)
      return { slugs: lote.map((c) => c.slug), resultados }
    },
    async (numero, lote, contexto) => {
      const agora = new Date().toISOString()
      const evidencia = await gravarCheckpointConcorrente(evidencePath, {
        lote: { numero, concluido_em: agora, slugs: lote.slugs, candidatos: lote.resultados },
        supabase_ref: "wskpzsobvqwhnbsdsmok",
        base_commit: targetSlugs || coorteAtual
          ? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
          : "022d3ed292b6f0918636c813cf5271e615999809",
        branch: targetSlugs || coorteAtual
          ? execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim()
          : "codex/processos-curadoria-20260805",
        snapshot_inicial_em: contexto.snapshotInicialEm,
        total_inicial: contexto.iniciais.length,
        candidatos_iniciais: contexto.iniciais.map((c) => c.slug),
        fontes: {
          djen: `${DJEN}/swagger/index.html`,
          datajud: "https://datajud-wiki.cnj.jus.br/api-publica/",
          tse: TSE_CDN,
          criterio: "docs/criterio-processos-judiciais.md",
          modo: coorteAtual ? modoEvidencia : "curadoria-lote",
          regra_indeterminados: "nao_reconsultar_sem_nova_fonte_ou_segundo_identificador",
          residuais_sem_cnj: somenteCnj ? coortePreflight?.residuais : undefined,
          coorte_publica_total: coortePreflight?.coortePublicaTotal,
          filtro_cargo: coorteAtual ? cargo : undefined,
          margem_dias: coorteAtual && modoAlvos === "vencendo" ? margemDias : undefined,
          snapshot: snapshotSaida ?? undefined,
          snapshot_sha256: snapshotSha ?? undefined,
        },
      })
      contexto.anterior = evidencia
      console.log(JSON.stringify({ lote: numero, slugs: lote.slugs, resumo: evidencia.resumo, evidence: evidencePath }, null, 2))
    },
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    console.error(erro)
    process.exitCode = 1
    const argv = process.argv.slice(2)
    const evidence = flags(argv).get("evidence")
    if (evidence && flagPresente(argv, "coorte-atual")) {
      writeFileSync(`${resolve(evidence)}.falha.json`, `${JSON.stringify({ tipo: classificarFalhaColeta(erro), em: new Date().toISOString() })}\n`, { mode: 0o600 })
    }
  })
}
