/**
 * Busca ativa conservadora de processos no DJEN/PJe, em lotes de 20.
 *
 * A API e pesquisável por nome, mas nome sozinho nunca identifica a parte.
 * Uma ocorrência só vira achado quando a própria comunicação também contém
 * contexto político compatível (cargo, campanha, partido ou nome de urna).
 * O DataJud é consultado depois, exclusivamente pelos números CNJ encontrados.
 */
import { execFileSync } from "node:child_process"
import {
  closeSync,
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
}

interface SeedCandidato {
  slug: string
  ids?: {
    camara?: number | null
    senado?: number | null
    tse_sq_candidato?: Record<string, string>
  }
}

interface Comunicacao {
  id: number
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
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

async function fetchJson<T>(url: string, init?: RequestInit, tentativas = 3, timeoutMs = 60_000): Promise<T> {
  for (let i = 0; i < tentativas; i += 1) {
    const resposta = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    if (resposta.status === 429 && i + 1 < tentativas) {
      await new Promise((resolve) => setTimeout(resolve, 61_000))
      continue
    }
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${url}`)
    return await resposta.json() as T
  }
  throw new Error(`limite de tentativas em ${url}`)
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

async function carregarIdentidadesTse(
  candidatos: CandidatoBanco[],
  seeds: Map<string, SeedCandidato>,
  cache: string,
): Promise<Map<string, Record<string, unknown>>> {
  const porAno = new Map<string, Array<{ candidato: CandidatoBanco; sq: string }>>()
  for (const candidato of candidatos) {
    const ids = Object.entries(seeds.get(candidato.slug)?.ids?.tse_sq_candidato ?? {})
      .sort((a, b) => Number(b[0]) - Number(a[0]))
    const latest = ids[0]
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
    const arquivos = execFileSync("find", [extraido, "-type", "f", "-name", "*.csv"], { encoding: "utf8" })
      .trim().split("\n").filter(Boolean)
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
    const arquivos = execFileSync("find", [extraido, "-type", "f", "-name", "*.csv"], { encoding: "utf8" })
      .trim().split("\n").filter(Boolean)
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
  if (seed) {
    const tse = identidadesTse.get(c.slug)
    if (tse) {
      const ufTse = typeof tse.uf === "string" ? normalizar(tse.uf) : ""
      const ufAtual = normalizar(c.estado)
      if (ufTse && ufAtual && ufTse !== ufAtual) {
        return {
          status: "bloqueada",
          motivo: `identidade TSE localizada em ${ufTse}, mas a ficha atual esta em ${ufAtual}; falta ponte oficial entre as UFs`,
          url: tse.url,
        }
      }
      return tse
    }
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

async function buscarDjen(nome: string, cache: string): Promise<{ url: string; total: number; itens: Comunicacao[]; tetoAtingido?: boolean }> {
  const itensPorPagina = 1_000
  const base = `${DJEN}/api/v1/comunicacao?itensPorPagina=${itensPorPagina}&nomeParte=${encodeURIComponent(nome)}`
  const cacheDir = join(cache, "djen")
  const cachePath = join(cacheDir, `${Buffer.from(normalizar(nome)).toString("base64url")}.json`)
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, "utf8")) as { url: string; total: number; itens: Comunicacao[]; tetoAtingido?: boolean }
  }
  const itens: Comunicacao[] = []
  let pagina = 1
  let total = 0
  do {
    const resposta = await fetchJson<{ count: number; items: Comunicacao[] }>(`${base}&pagina=${pagina}`)
    total = resposta.count ?? 0
    if (total > 10_000) {
      throw new Error(`DJEN excede limite paginavel: ${total} comunicacoes para o nome consultado`)
    }
    itens.push(...(resposta.items ?? []))
    pagina += 1
  } while (itens.length < total && pagina <= Math.ceil(total / itensPorPagina) + 1 && pagina <= 11)
  if (itens.length < total) throw new Error(`DJEN truncado: ${itens.length}/${total}`)
  const resposta = { url: `${base}&pagina=1`, total, itens, tetoAtingido: total >= 10_000 }
  mkdirSync(cacheDir, { recursive: true })
  const temp = `${cachePath}.tmp-${process.pid}`
  writeFileSync(temp, `${JSON.stringify(resposta)}\n`, { encoding: "utf8", mode: 0o600 })
  renameSync(temp, cachePath)
  return resposta
}

let filaDjen: Promise<void> = Promise.resolve()

async function buscarDjenSerializado(
  nome: string,
  cache: string,
): Promise<{ url: string; total: number; itens: Comunicacao[]; tetoAtingido?: boolean }> {
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
  for (const pos of posicoes) {
    const janela = t.slice(Math.max(0, pos - 700), pos + nome.length + 700)
    const identidadeProxima = t.slice(Math.max(0, pos - 220), pos + nome.length + 220)
    const cpfRegex = cpf.length === 11
      ? cpf.split("").join("[.\\s-]{0,3}")
      : "(?!)"
    const cpfCompativel = new RegExp(
      `(?:${nomeRegex}.{0,100}\\bCPF(?:\\s+N)?\\s+${cpfRegex}\\b|\\bCPF(?:\\s+N)?\\s+${cpfRegex}.{0,100}${nomeRegex})`,
    ).test(identidadeProxima)
    const cargoDepois = new RegExp(`\\b${nomeRegex}\\b(?:\\s+(?:ATUAL|ENTAO|EX|SR|SRA)){0,3}\\s+${CARGO_POLITICO}\\b`).test(identidadeProxima)
    const cargoAntesDireto = new RegExp(`\\b${CARGO_POLITICO}\\s+(?:DO|DA|DE)?\\s*${nomeRegex}\\b`).test(identidadeProxima)
    const cargoAntesComLocal = new RegExp(
      `\\b(?:VICE GOVERNADOR(?:A)?|GOVERNADOR(?:A)?) (?:DO ESTADO )?DE ${estadoRegex} ${nomeRegex}\\b|\\b(?:VICE PREFEIT[OA]|PREFEIT[OA]) DE [A-Z ]{2,45} REGISTRAD[OA] CIVILMENTE COMO ${nomeRegex}\\b`,
    ).test(identidadeProxima)
    const condicao = new RegExp(`\\b${nomeRegex}\\s+NA CONDICAO DE ${CARGO_POLITICO}\\b`).test(identidadeProxima)
    const contextoEspecial = c.slug === "renan-santos"
      && new RegExp(`(?:${nomeRegex}\\s+(?:FUNDADOR|COORDENADOR|INTEGRANTE|REPRESENTANTE|DO|DA)\\s+(?:MISSAO|MOVIMENTO BRASIL LIVRE|MBL)|(?:MISSAO|MOVIMENTO BRASIL LIVRE|MBL)\\s+(?:REPRESENTAD[OA] POR|FUNDADOR|COORDENADOR|INTEGRANTE)\\s+${nomeRegex})`).test(identidadeProxima)
    if (cpfCompativel || cargoDepois || cargoAntesDireto || cargoAntesComLocal || condicao || contextoEspecial) {
      return janela.slice(0, 900)
    }
  }
  return null
}

async function chaveDatajud(): Promise<string> {
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
        const resposta = await fetchJson<{ hits?: { hits?: Array<{ _source?: Record<string, unknown> }> } }>(url, {
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
        }, 1, 15_000)
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
    const exatos = djen.itens.filter((item) => (item.destinatarios ?? []).some((d) => normalizar(d.nome) === nome))
    if (identidade.status !== "confirmada") {
      const tetoAtingido = djen.tetoAtingido === true || djen.total >= 10_000
      return {
        ...baseConfirmada,
        identidade,
        busca: {
          fonte: "DJEN/PJe-CNJ", url: djen.url, periodo: "acervo disponivel ate 2026-08-05",
          termos: "nome completo exato; resultado nao atribuivel sem segundo identificador oficial",
          total_api: djen.total, ocorrencias_nome_exato: exatos.length,
          ocorrencias_ambiguas: exatos.length,
          teto_publico_atingido: tetoAtingido,
          tribunais_consultados: tribunais,
        },
        ocorrencias_ambiguas: exatos.map((item) => ({
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
    for (const item of exatos) {
      const numero = item.numeroprocessocommascara || item.numero_processo || `comunicacao-${item.id}`
      const contexto = contextoPolitico(c, snap, item.texto ?? "", nomeConsulta, identidade)
      const polo = item.destinatarios?.find((d) => normalizar(d.nome) === nome)?.polo ?? null
      const cnj = cnjValido(numero)
      if (contexto && cnj) encontrados.set(numero, { item, contexto, polo })
      else ambiguos.set(numero, {
        numero_cnj: numero,
        tribunal: item.siglaTribunal ?? null,
        motivo: contexto
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
    const ambiguosPendentes = new Map(
      [...ambiguos].filter(([numero]) => !encontrados.has(numero)),
    )
    const tetoAtingido = djen.tetoAtingido === true || djen.total >= 10_000
    const resultado = classificarResultadoDjen(processos.length, ambiguosPendentes.size, tetoAtingido)
    return {
      ...baseConfirmada, identidade,
      busca: {
        fonte: "DJEN/PJe-CNJ", url: djen.url, periodo: "acervo disponivel ate 2026-08-05",
        termos: `nome completo exato + cargo + UF + partido + trajetoria`,
        total_api: djen.total, ocorrencias_nome_exato: exatos.length,
        ocorrencias_ambiguas: ambiguosPendentes.size,
        teto_publico_atingido: tetoAtingido,
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
        periodo: "acervo disponivel ate 2026-08-05",
        termos: "nome completo exato + cargo + UF + partido + trajetoria",
        tribunais_consultados: tribunais,
        erro: erro instanceof Error ? erro.message : String(erro),
      },
      ocorrencias_ambiguas: [], homonimos_descartados: [], classificacao: "erro",
      motivo: erro instanceof Error ? erro.message : String(erro), processos: [],
    }
  }
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
  const numeros = lotesSolicitados(argv)
  const snapshotPath = resolve(opcoes.get("snapshot") ?? "/tmp/2026-08-05-processos-inicial-snapshot.json")
  const evidencePath = resolve(opcoes.get("evidence") ?? "~/.disposable-html/2026-08-05-puxa-ficha-processos-curadoria.evidence.json".replace("~", process.env.HOME ?? ""))
  const cache = resolve(opcoes.get("cache") ?? "/tmp/puxa-ficha-processos-curadoria-cache")
  await executarLotesEmOrdem(
    numeros,
    async (selecionados) => {
      const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as SnapshotCandidato[]
      const iniciais = ordenar(snapshot.filter((c) => c.processos === 0))
      if (iniciais.length !== 185) throw new Error(`coorte inicial inesperada: ${iniciais.length}`)
      const lotes = new Map(selecionados.map((numero) => {
        const lote = iniciais.slice((numero - 1) * TAMANHO_LOTE, numero * TAMANHO_LOTE)
        if (lote.length === 0) throw new Error(`lote ${numero} vazio`)
        return [numero, lote]
      }))
      const slugs = [...lotes.values()].flatMap((lote) => lote.map((c) => c.slug))
      const { data, error } = await supabase.from("candidatos")
        .select("id,slug,nome_completo,nome_urna,cargo_disputado,cargo_atual,estado,partido_sigla,biografia")
        .in("slug", slugs)
      if (error) throw new Error(error.message)
      const candidatosBanco = data as CandidatoBanco[]
      const banco = new Map(candidatosBanco.map((c) => [c.slug, c]))
      const seeds = new Map((JSON.parse(readFileSync(resolve("data/candidatos.json"), "utf8")) as SeedCandidato[]).map((c) => [c.slug, c]))
      const identidadesTse = await carregarIdentidadesTse(candidatosBanco, seeds, cache)
      const inventario = await fetchJson<InventarioTribunais[]>(`${DJEN}/api/v1/comunicacao/tribunal`)
      const tribunais = instituicoesAtivas(inventario)
      const datajudKey = await chaveDatajud()
      const anterior: Evidencia | null = existsSync(evidencePath)
        ? JSON.parse(readFileSync(evidencePath, "utf8")) as Evidencia
        : null
      const snapshotInicialEm = anterior?.snapshot_inicial_em ?? statSync(snapshotPath).mtime.toISOString()
      return { iniciais, lotes, banco, seeds, identidadesTse, tribunais, datajudKey, anterior, snapshotInicialEm }
    },
    async (numero, contexto) => {
      const lote = contexto.lotes.get(numero)
      if (!lote) throw new Error(`lote ${numero} nao carregado`)
      const resultados = await processarComDoisWorkers(lote, async (snap) => {
        const c = contexto.banco.get(snap.slug)
        if (!c) throw new Error(`candidato ausente no banco: ${snap.slug}`)
        const resultado = await pesquisarCandidato(
          c,
          snap,
          contexto.seeds.get(c.slug),
          contexto.identidadesTse,
          contexto.tribunais,
          cache,
        )
        console.error(`[processos] ${c.slug}: ${resultado.classificacao}`)
        return resultado
      })
      await conferirDatajudResultados(resultados, contexto.datajudKey)
      return { slugs: lote.map((c) => c.slug), resultados }
    },
    async (numero, lote, contexto) => {
      const agora = new Date().toISOString()
      const evidencia = await gravarCheckpointConcorrente(evidencePath, {
        lote: { numero, concluido_em: agora, slugs: lote.slugs, candidatos: lote.resultados },
        supabase_ref: "wskpzsobvqwhnbsdsmok",
        base_commit: "022d3ed292b6f0918636c813cf5271e615999809",
        branch: "codex/processos-curadoria-20260805",
        snapshot_inicial_em: contexto.snapshotInicialEm,
        total_inicial: contexto.iniciais.length,
        candidatos_iniciais: contexto.iniciais.map((c) => c.slug),
        fontes: {
          djen: `${DJEN}/swagger/index.html`,
          datajud: "https://datajud-wiki.cnj.jus.br/api-publica/",
          tse: TSE_CDN,
          criterio: "docs/criterio-processos-judiciais.md",
        },
      })
      contexto.anterior = evidencia
      console.log(JSON.stringify({ lote: numero, slugs: lote.slugs, resumo: evidencia.resumo, evidence: evidencePath }, null, 2))
    },
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => { console.error(erro); process.exitCode = 1 })
}
