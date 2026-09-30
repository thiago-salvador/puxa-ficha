/**
 * Valida e prepara a evidencia final da curadoria de processos para registro
 * em `coleta_log` pelo comando canonico `registrar-revisao-curadoria.ts`.
 *
 * O padrao e dry-run e nao acessa o banco. Somente `--apply`, depois de toda a
 * evidencia e todos os argumentos terem sido validados, chama o registrador
 * sequencialmente. Este script nao escreve em `processos` ou `pontos_atencao`.
 *
 * Uso:
 *   tsx scripts/aplicar-evidencia-processos-curadoria.ts \
 *     --evidence=/caminho/evidence.json [--limit=3]
 *   tsx scripts/aplicar-evidencia-processos-curadoria.ts \
 *     --evidence=/caminho/evidence.json --apply
 */

import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import {
  main as registrarRevisao,
  validarRevisaoManual,
  type ProvaIdentidade,
} from "./registrar-revisao-curadoria"
import { supabase } from "./lib/supabase"
import { registrarColetaOuFalhar, type EntradaColeta } from "./lib/coleta-log"
import { normalizarTextoJudicial } from "./curadoria-processos-lote"
import { carregarDecisoes, decididoNaoPublicar } from "./lib/processos-decisao-editorial"
import { stripAccents } from "../src/lib/strip-accents"

const TOTAL_CANDIDATOS = 185
const TOTAL_LOTES = 10
const TAMANHO_LOTE = 20
const TAMANHO_PAGINA_PREFLIGHT = 1_000
const FONTE_CURADORIA = "processos-curadoria"
const EVIDENCE_PADRAO = resolve(
  homedir(),
  ".disposable-html/2026-08-05-puxa-ficha-processos-curadoria.evidence.json",
)

type ClassificacaoEvidencia = "encontrado" | "vazio_confirmado" | "bloqueado" | "erro"
type ResultadoRegistro = "encontrado" | "vazio_confirmado" | "indeterminado" | "erro"

const METODOS_ID_OFICIAL = new Set([
  "tse-sq-candidato",
  "senado-id-oficial",
  "camara-id-oficial",
])
const METODOS_CARGO_UF = new Set([
  "tse-nome-cargo-uf",
  "tse-2026-oficial",
  "partido-oficial",
  "prefeitura-oficial",
  "diario-oficial-municipal",
  "governo-estadual-oficial",
  "assembleia-oficial",
  "oab-oficial",
])
const CARGO_POLITICO = /\b(?:presidencia|presidente|governador|prefeit[oa]s?|senador|deputad[oa]|ministr[oa]|vereador|candidat[oa]|candidatura)\b/i
const UF_POR_SIGLA: Readonly<Record<string, string>> = {
  AC: "acre", AL: "alagoas", AP: "amapa", AM: "amazonas", BA: "bahia",
  CE: "ceara", DF: "distrito federal", ES: "espirito santo", GO: "goias",
  MA: "maranhao", MT: "mato grosso", MS: "mato grosso do sul", MG: "minas gerais",
  PA: "para", PB: "paraiba", PR: "parana", PE: "pernambuco", PI: "piaui",
  RJ: "rio de janeiro", RN: "rio grande do norte", RS: "rio grande do sul",
  RO: "rondonia", RR: "roraima", SC: "santa catarina", SP: "sao paulo",
  SE: "sergipe", TO: "tocantins",
}

interface RegistroEvidencia {
  slug: string
  nome_completo: string
  nome_urna: string
  cargo: string
  uf: string | null
  identidade: Record<string, unknown>
  busca: Record<string, unknown>
  ocorrencias_ambiguas?: Array<Record<string, unknown>>
  homonimos_descartados: Array<Record<string, unknown>>
  classificacao: ClassificacaoEvidencia
  motivo: string
  processos: Array<Record<string, unknown>>
}

interface LoteEvidencia {
  numero: number
  concluido_em: string
  slugs: string[]
  candidatos: RegistroEvidencia[]
}

interface EvidenciaFinal {
  schema_version: 1
  total_inicial: number
  candidatos_iniciais: string[]
  lotes: LoteEvidencia[]
  resumo: Record<string, number>
  /** Presente quando a evidência veio de `--coorte-atual`; ativa a semântica de renovação. */
  coorte_atual?: { modo: string; snapshot_sha256: string | null }
}

const MODOS_COORTE_ATUAL = new Set([
  "dry-run-coorte-atual-sem-recibo",
  "dry-run-coorte-atual-renovacao",
  "dry-run-coorte-atual-revalidacao",
])

export interface PlanoRegistro {
  lote: number
  slug: string
  data: string
  classificacao: ClassificacaoEvidencia
  resultado: ResultadoRegistro
  homonimosDescartados: number
  args: string[]
}

export interface LinhaExistentePreflight {
  alvo: string
  resultado: string
  detalhe: string | null
  executado_em?: string | null
}

export interface ResultadoPreflight {
  pendentes: PlanoRegistro[]
  equivalentes: PlanoRegistro[]
}

interface Opcoes {
  evidence: string
  apply: boolean
  limit?: number
  somenteMudancas: boolean
}

function falhar(caminho: string, mensagem: string): never {
  throw new Error(`${caminho}: ${mensagem}`)
}

function objeto(valor: unknown, caminho: string): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return falhar(caminho, "objeto obrigatorio")
  }
  return valor as Record<string, unknown>
}

function lista(valor: unknown, caminho: string): unknown[] {
  if (!Array.isArray(valor)) return falhar(caminho, "lista obrigatoria")
  return valor
}

function texto(valor: unknown, caminho: string): string {
  if (typeof valor !== "string" || !valor.trim()) return falhar(caminho, "texto nao vazio obrigatorio")
  return valor.trim()
}

function inteiro(valor: unknown, caminho: string): number {
  if (!Number.isInteger(valor)) return falhar(caminho, "inteiro obrigatorio")
  return valor as number
}

function slug(valor: unknown, caminho: string): string {
  const resultado = texto(valor, caminho)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultado)) return falhar(caminho, "slug invalido")
  return resultado
}

function textos(valor: unknown, caminho: string): string[] {
  return lista(valor, caminho).map((item, indice) => texto(item, `${caminho}[${indice}]`))
}

function registros(valor: unknown, caminho: string): Array<Record<string, unknown>> {
  return lista(valor, caminho).map((item, indice) => objeto(item, `${caminho}[${indice}]`))
}

function textoLimpo(valor: string): string {
  return valor.replace(/[;\r\n]+/g, ", ").replace(/\s+/g, " ").trim()
}

function normalizar(valor: string): string {
  return stripAccents(valor).toLowerCase()
}

/** Mesma normalização do coletor (`normalizarTextoJudicial`), sem pontuação. */
function normalizarProva(valor: unknown): string {
  return normalizarTextoJudicial(valor)
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")
}

const CARGO_POLITICO_PROVA = "(?:VICE GOVERNADOR(?:A)?|GOVERNADOR(?:A)?|VICE PREFEIT[OA]|PREFEIT[OA]S?|SENADOR(?:A)?|DEPUTAD[OA] (?:FEDERAL|ESTADUAL)|MINISTR[OA] DE ESTADO|PRE CANDIDAT[OA] (?:A|AO) (?:PRESIDENCIA|PRESIDENTE|GOVERNO|GOVERNADOR|PREFEITURA|PREFEITO)|PRE CANDIDATURA (?:A|AO) (?:PRESIDENCIA|PRESIDENTE|GOVERNO|GOVERNADOR|PREFEITURA|PREFEITO)|CANDIDAT[OA] (?:A|AO) (?:PRESIDENCIA|PRESIDENTE|GOVERNO|GOVERNADOR|PREFEITURA|PREFEITO)|PRESIDENTE DA REPUBLICA)"

function nomesCompativeis(candidato: RegistroEvidencia): string[] {
  return [...new Set([
    candidato.nome_completo,
    candidato.nome_urna,
    typeof candidato.identidade.nome === "string" ? candidato.identidade.nome : "",
    typeof candidato.identidade.nome_oficial === "string" ? candidato.identidade.nome_oficial : "",
  ].map(normalizarProva).filter((nome) => nome.length >= 4))]
}

function exigirNomeOficialCompativel(
  identidade: Record<string, unknown>,
  candidato: RegistroEvidencia,
  caminho: string,
): void {
  for (const campo of ["nome", "nome_oficial"] as const) {
    if (identidade[campo] === undefined) continue
    const nome = texto(identidade[campo], `${caminho}.${campo}`)
    const nomesFicha = new Set([
      normalizarProva(candidato.nome_completo),
      normalizarProva(candidato.nome_urna),
    ])
    if (!nomesFicha.has(normalizarProva(nome))) {
      falhar(`${caminho}.${campo}`, "nome oficial diverge do candidato")
    }
  }
}

function textoVinculaNomeECargo(textoFonte: string, candidato: RegistroEvidencia): boolean {
  const fonte = normalizarProva(textoFonte)
  return nomesCompativeis(candidato).some((nome) => {
    const nomeRegex = escaparRegex(nome)
    const ponteDepois = "(?:COMO(?: (?:EX )?PRESIDENTE (?:DA|DO) [A-Z0-9]{2,20} E| INTEGRANTE (?:DA|DO) [A-Z0-9]{2,20} E)?|NA RELACAO OFICIAL DE|O SITE OFICIAL (?:DA|DO) [A-Z0-9]{2,20} CONFIRMA A|NA CONDICAO DE)"
    return new RegExp(`\\b${nomeRegex}\\b\\s+${ponteDepois}\\s+${CARGO_POLITICO_PROVA}\\b`).test(fonte)
      || new RegExp(`\\b${nomeRegex}\\b(?:\\s+(?:ATUAL|ENTAO|EX|SR|SRA)){0,3}\\s+${CARGO_POLITICO_PROVA}\\b`).test(fonte)
      || new RegExp(`\\b${CARGO_POLITICO_PROVA}\\s+(?:DO|DA|DE)?\\s*${nomeRegex}\\b`).test(fonte)
  })
}

function contextoVinculaCandidato(contexto: string, candidato: RegistroEvidencia): boolean {
  const fonte = normalizarProva(contexto)
  const nome = normalizarProva(candidato.nome_completo)
  if (!nome || !new RegExp(`\\b${escaparRegex(nome)}\\b`).test(fonte)) return false

  const nomeRegex = escaparRegex(nome)
  const cpf = String(candidato.identidade.cpf ?? "").replace(/\D/g, "")
  const cpfRegex = cpf.length === 11 ? cpf.split("").join("[.\\s-]{0,3}") : "(?!)"
  const estado = candidato.uf ? UF_POR_SIGLA[candidato.uf.toUpperCase()]?.toUpperCase() ?? "" : ""
  const estadoRegex = estado ? escaparRegex(estado) : "(?!)"
  const cpfCompativel = new RegExp(
    `(?:\\b${nomeRegex}\\b.{0,100}\\bCPF(?:\\s+N)?\\s+${cpfRegex}\\b|\\bCPF(?:\\s+N)?\\s+${cpfRegex}.{0,100}\\b${nomeRegex}\\b)`,
  ).test(fonte)
  const cargoDepois = new RegExp(
    `\\b${nomeRegex}\\b(?:\\s+(?:ATUAL|ENTAO|EX|SR|SRA)){0,3}\\s+${CARGO_POLITICO_PROVA}\\b`,
  ).test(fonte)
  const cargoAntesDireto = new RegExp(
    `\\b${CARGO_POLITICO_PROVA}\\s+(?:DO|DA|DE)?\\s*${nomeRegex}\\b`,
  ).test(fonte)
  const cargoAntesComLocal = new RegExp(
    `\\b(?:VICE GOVERNADOR(?:A)?|GOVERNADOR(?:A)?) (?:DO ESTADO )?DE ${estadoRegex} ${nomeRegex}\\b|\\b(?:VICE PREFEIT[OA]|PREFEIT[OA]) DE [A-Z ]{2,45} REGISTRAD[OA] CIVILMENTE COMO ${nomeRegex}\\b`,
  ).test(fonte)
  const condicao = new RegExp(
    `\\b${nomeRegex}\\s+NA CONDICAO DE ${CARGO_POLITICO_PROVA}\\b`,
  ).test(fonte)
  // Segundo caminho (26/09): o trecho oficial traz o nome e o CPF completo da
  // candidatura; a trava de advogado e o CPF divergente são conferidos no coletor.
  const cpfNoTrecho = new RegExp(`(?<![0-9])${cpfRegex}(?![0-9])`).test(fonte)
  return cpfCompativel || cpfNoTrecho || cargoDepois || cargoAntesDireto || cargoAntesComLocal || condicao
}

function urlsDoCampo(registro: Record<string, unknown>, caminho: string): string[] {
  const urls = urlsOpcionaisDoCampo(registro, caminho)
  if (urls.length === 0) return falhar(caminho, "ao menos uma URL obrigatoria")
  return urls
}

function urlsOpcionaisDoCampo(registro: Record<string, unknown>, caminho: string): string[] {
  const candidatas: unknown[] = []
  if (registro.url !== undefined) candidatas.push(registro.url)
  if (registro.urls !== undefined) candidatas.push(...lista(registro.urls, `${caminho}.urls`))
  const urls = candidatas.map((valor, indice) => texto(valor, `${caminho}.url[${indice}]`))
  return [...new Set(urls)]
}

function dataDaConclusao(valor: unknown, caminho: string): string {
  const iso = texto(valor, caminho)
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return falhar(caminho, "data ISO invalida")
  return data.toISOString().slice(0, 10)
}

function ufComprovadaPorFonte(
  uf: string,
  detalhe: string,
  urls: string[],
): boolean {
  const sigla = uf.toUpperCase()
  const nome = UF_POR_SIGLA[sigla]
  const detalheNormalizado = normalizar(detalhe)
  if (new RegExp(`\\b${sigla.toLowerCase()}\\b`).test(detalheNormalizado)) return true
  if (nome && detalheNormalizado.includes(nome)) return true
  return urls.some((valor) => {
    const host = new URL(valor).hostname.toLowerCase()
    return host.includes(`.${sigla.toLowerCase()}.gov.br`) || host.includes(`.${sigla.toLowerCase()}.jus.br`)
  })
}

function provaIdentidade(
  identidade: Record<string, unknown>,
  candidato: RegistroEvidencia,
  identidadeUrls: string[],
  caminho: string,
): ProvaIdentidade {
  if (identidade.status !== "confirmada") return falhar(caminho, "identidade precisa estar confirmada")
  const metodo = texto(identidade.metodo, `${caminho}.metodo`)
  exigirNomeOficialCompativel(identidade, candidato, caminho)
  if (METODOS_ID_OFICIAL.has(metodo)) {
    if (metodo === "tse-sq-candidato") {
      const sq = texto(identidade.sq_candidato, `${caminho}.sq_candidato`)
      if (!/^\d{10,20}$/.test(sq)) falhar(`${caminho}.sq_candidato`, "identificador TSE invalido")
      if (identidade.nome === undefined) falhar(`${caminho}.nome`, "nome oficial obrigatorio para vincular o registro TSE")
    } else if (!Number.isInteger(identidade.id) || Number(identidade.id) <= 0) {
      falhar(`${caminho}.id`, "identificador oficial positivo obrigatorio")
    } else {
      const id = String(identidade.id)
      const caminhoEsperado = metodo === "senado-id-oficial" ? `/perfil/${id}` : `/deputados/${id}`
      const hostEsperado = metodo === "senado-id-oficial" ? "senado.leg.br" : "camara.leg.br"
      if (!identidadeUrls.some((valor) => {
        const url = new URL(valor)
        return (url.hostname === hostEsperado || url.hostname.endsWith(`.${hostEsperado}`))
          && url.pathname.endsWith(caminhoEsperado)
      })) {
        falhar(`${caminho}.url`, "URL oficial nao corresponde ao identificador declarado")
      }
    }
    return "id-oficial"
  }
  if (!METODOS_CARGO_UF.has(metodo)) return falhar(`${caminho}.metodo`, `metodo nao permitido: ${metodo}`)

  if (metodo === "tse-nome-cargo-uf") {
    texto(identidade.nome, `${caminho}.nome`)
    const cargo = texto(identidade.cargo, `${caminho}.cargo`)
    if (!CARGO_POLITICO.test(normalizar(cargo))) {
      falhar(`${caminho}.cargo`, "cargo politico oficial obrigatorio")
    }
    const ufIdentidade = texto(identidade.uf, `${caminho}.uf`).toUpperCase()
    if (!candidato.uf || ufIdentidade !== candidato.uf.toUpperCase()) {
      falhar(`${caminho}.uf`, "UF da identidade diverge da UF do candidato")
    }
    return "cargo-e-uf"
  }

  const detalhe = texto(identidade.detalhe, `${caminho}.detalhe`)
  if (!CARGO_POLITICO.test(normalizar(detalhe))) {
    falhar(`${caminho}.detalhe`, "fonte oficial precisa identificar cargo ou candidatura")
  }
  const cargoNacional = /\b(?:presidencia|presidente da republica)\b/i.test(normalizar(detalhe))
  if (candidato.uf && !cargoNacional && !ufComprovadaPorFonte(candidato.uf, detalhe, identidadeUrls)) {
    falhar(`${caminho}.detalhe`, `fonte oficial nao comprova a UF ${candidato.uf}`)
  }
  if (!textoVinculaNomeECargo(detalhe, candidato)) {
    falhar(`${caminho}.detalhe`, "fonte oficial nao vincula o nome do candidato ao cargo")
  }
  return "cargo-e-uf"
}

function resultadoDaClassificacao(classificacao: ClassificacaoEvidencia): ResultadoRegistro {
  return classificacao === "bloqueado" ? "indeterminado" : classificacao
}

function jurisdicao(orgaos: string[]): string {
  return `orgaos declarados na busca (${orgaos.join(", ")})`
}

function argumento(nome: string, valor: string): string {
  return `--${nome}=${valor}`
}

function urlsDatajud(processos: Array<Record<string, unknown>>, caminho: string): string[] {
  const urls: string[] = []
  processos.forEach((processo, indice) => {
    if (processo.datajud === undefined) return
    const datajud = objeto(processo.datajud, `${caminho}[${indice}].datajud`)
    if (datajud.url !== undefined) urls.push(texto(datajud.url, `${caminho}[${indice}].datajud.url`))
  })
  return urls
}

function cnjValido(valor: string): boolean {
  if (!/^\d{20}$/.test(valor) && !/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(valor)) {
    return false
  }
  const digitos = valor.replace(/\D/g, "")
  if (digitos.length !== 20) return false
  const sequencial = digitos.slice(0, 7)
  const verificador = Number(digitos.slice(7, 9))
  const restante = digitos.slice(9)
  const esperado = 98 - Number(BigInt(`${sequencial}${restante}00`) % BigInt(97))
  return verificador === esperado
}

function urlOficialEspecifica(valor: string, buscaUrls: string[], numero: string): boolean {
  const url = new URL(valor)
  if (urlGenericaDeBusca(url, buscaUrls)) return false
  if ((url.pathname === "/" || url.pathname === "") && !url.search && !url.hash) return false
  const host = url.hostname.toLowerCase()
  const numeroDigitos = numero.replace(/\D/g, "")
  const numeroConsulta = url.searchParams.get("numeroProcesso")?.replace(/\D/g, "") ?? ""
  const apiOk = host === "comunicaapi.pje.jus.br" && url.pathname === "/api/v1/comunicacao"
  const portalOk = host === "comunica.pje.jus.br" && url.pathname === "/consulta"
  return (apiOk || portalOk) && numeroConsulta === numeroDigitos
}

function urlGenericaDeBusca(url: URL, buscaUrls: string[]): boolean {
  return buscaUrls.some((busca) => {
    const consulta = new URL(busca)
    if (consulta.href.replace(/\/$/, "") === url.href.replace(/\/$/, "")) return true
    return consulta.origin === url.origin
      && consulta.pathname === url.pathname
      && url.searchParams.has("nomeParte")
  })
}

function evidenciasPublicaveis(
  processos: Array<Record<string, unknown>>,
  buscaUrls: string[],
  candidato: RegistroEvidencia,
  caminho: string,
): string[] {
  return processos.map((processo, indice) => {
    const processoCaminho = `${caminho}[${indice}]`
    const url = texto(processo.url, `${processoCaminho}.url`)
    const contexto = texto(processo.contexto_identidade, `${processoCaminho}.contexto_identidade`)
    if (urlGenericaDeBusca(new URL(url), buscaUrls)) {
      falhar(`${processoCaminho}.url`, "URL generica de busca nao e evidencia publicavel")
    }
    const numero = typeof processo.numero_cnj === "string" ? processo.numero_cnj : ""
    if (!cnjValido(numero)) falhar(`${processoCaminho}.numero_cnj`, "exige CNJ valido")
    if (!urlOficialEspecifica(url, buscaUrls, numero)) {
      falhar(`${processoCaminho}.url`, "exige fonte oficial especifica vinculada ao processo")
    }
    if (contexto.length < 20) falhar(`${processoCaminho}.contexto_identidade`, "contexto de identidade insuficiente")
    if (!contextoVinculaCandidato(contexto, candidato)) {
      falhar(`${processoCaminho}.contexto_identidade`, "nao vincula nome do candidato a CPF ou cargo politico")
    }
    return url
  })
}

function homonimosAuditaveis(
  homonimos: Array<Record<string, unknown>>,
  caminho: string,
): Array<{ numero_cnj: string; tribunal: string | null; motivo: string }> {
  return homonimos.map((homonimo, indice) => {
    const itemCaminho = `${caminho}[${indice}]`
    const numero = texto(homonimo.numero_cnj, `${itemCaminho}.numero_cnj`)
    if (!cnjValido(numero) && !/^comunicacao-\d+$/.test(numero)) {
      falhar(`${itemCaminho}.numero_cnj`, "identificador de processo invalido")
    }
    const tribunal = homonimo.tribunal === null
      ? null
      : texto(homonimo.tribunal, `${itemCaminho}.tribunal`).toUpperCase()
    if (tribunal !== null && !/^[A-Z0-9-]{2,16}$/.test(tribunal)) {
      falhar(`${itemCaminho}.tribunal`, "sigla de tribunal invalida")
    }
    return {
      numero_cnj: numero,
      tribunal,
      motivo: "nome exato sem segundo identificador oficial no documento",
    }
  })
}

function textosOpcionais(valor: unknown, caminho: string): string[] {
  if (valor === undefined) return []
  if (typeof valor === "string") return [texto(valor, caminho)]
  return textos(valor, caminho)
}

function tentativasIdentidade(
  identidade: Record<string, unknown>,
  motivo: string,
): { fontes: string[]; anos: string[] } {
  const fontesDeclaradas = textosOpcionais(
    identidade.fontes_consultadas,
    "identidade.fontes_consultadas",
  )
  const anosDeclarados = textosOpcionais(
    identidade.anos_consultados,
    "identidade.anos_consultados",
  )
  const fontesExtraidas = [
    [/\bTSE\b/i, "TSE"],
    [/\bSENADO\b/i, "Senado"],
    [/\bCAMARA\b/i, "Camara"],
    [/\bASSEMBLEIA\b/i, "Assembleia"],
    [/\bOAB\b/i, "OAB"],
    [/\bPREFEITURA\b/i, "Prefeitura"],
    [/\bGOVERNO\b/i, "Governo"],
  ].filter(([padrao]) => (padrao as RegExp).test(motivo)).map(([, fonte]) => fonte as string)
  const anosExtraidos = motivo.match(/\b(?:19|20)\d{2}\b/g) ?? []
  return {
    fontes: [...new Set([...fontesDeclaradas, ...fontesExtraidas])],
    anos: [...new Set([...anosDeclarados, ...anosExtraidos])],
  }
}

function criarPlanoIdentidadeNaoConfirmada(
  candidato: RegistroEvidencia,
  lote: LoteEvidencia,
  caminho: string,
): PlanoRegistro {
  // Falha de fonte antes da identidade também vira recibo: `erro`, nunca silêncio.
  const resultado: ResultadoRegistro = candidato.classificacao === "erro" ? "erro" : "indeterminado"
  if (candidato.processos.length > 0) {
    falhar(`${caminho}.processos`, "identidade nao confirmada nao pode publicar processos")
  }
  const motivoIdentidade = texto(candidato.identidade.motivo, `${caminho}.identidade.motivo`)
  const identidadeUrls = urlsOpcionaisDoCampo(candidato.identidade, `${caminho}.identidade`)
  const buscaUrls = urlsOpcionaisDoCampo(candidato.busca, `${caminho}.busca`)
  const urls = [...new Set([...identidadeUrls, ...buscaUrls])]
  const tentativas = tentativasIdentidade(candidato.identidade, motivoIdentidade)
  const homonimos = homonimosAuditaveis(
    candidato.homonimos_descartados,
    `${caminho}.homonimos_descartados`,
  )
  const ambiguos = homonimosAuditaveis(
    candidato.ocorrencias_ambiguas ?? [],
    `${caminho}.ocorrencias_ambiguas`,
  )
  const data = dataDaConclusao(lote.concluido_em, `${caminho}.concluido_em`)
  const detalhe = [
    `classificacao_original: ${candidato.classificacao}`,
    `motivo: ${textoLimpo(motivoIdentidade)}`,
    `motivo_classificacao: ${textoLimpo(candidato.motivo)}`,
    `identidade_status: ${textoLimpo(String(candidato.identidade.status ?? "ausente"))}`,
    ...(tentativas.fontes.length > 0 ? [`fontes consultadas: ${textoLimpo(tentativas.fontes.join(", "))}`] : []),
    ...(tentativas.anos.length > 0 ? [`anos consultados: ${textoLimpo(tentativas.anos.join(", "))}`] : []),
    `ocorrencias_ambiguas: ${JSON.stringify(ambiguos)}`,
    `homonimos_descartados: ${JSON.stringify(homonimos)}`,
  ].join("; ")
  const args = [
    argumento("slug", candidato.slug),
    "--frente=processos",
    argumento("data", data),
    argumento("resultado", resultado),
    argumento("detalhe", detalhe),
    "--identidade=nao-confirmada",
    ...urls.map((url) => argumento("url", url)),
    ...identidadeUrls.map((url) => argumento("identidade-url", url)),
  ]
  validarRevisaoManual([...args, "--dry-run"])
  return {
    lote: lote.numero,
    slug: candidato.slug,
    data,
    classificacao: candidato.classificacao,
    resultado,
    homonimosDescartados: candidato.homonimos_descartados.length,
    args,
  }
}

function criarPlano(candidato: RegistroEvidencia, lote: LoteEvidencia): PlanoRegistro {
  const caminho = `lote ${lote.numero}/${candidato.slug}`
  if ((candidato.classificacao === "bloqueado" || candidato.classificacao === "erro")
    && candidato.identidade.status !== "confirmada") {
    return criarPlanoIdentidadeNaoConfirmada(candidato, lote, caminho)
  }
  const identidadeUrls = urlsDoCampo(candidato.identidade, `${caminho}.identidade`)
  const buscaUrls = urlsDoCampo(candidato.busca, `${caminho}.busca`)
  const orgaos = textos(candidato.busca.tribunais_consultados, `${caminho}.busca.tribunais_consultados`)
  if (orgaos.length === 0) falhar(`${caminho}.busca.tribunais_consultados`, "ao menos um orgao obrigatorio")
  const periodo = texto(candidato.busca.periodo, `${caminho}.busca.periodo`)
  const termos = texto(candidato.busca.termos, `${caminho}.busca.termos`)
  const identidade = provaIdentidade(
    candidato.identidade,
    candidato,
    identidadeUrls,
    `${caminho}.identidade`,
  )
  const resultado = resultadoDaClassificacao(candidato.classificacao)

  if (candidato.classificacao !== "erro" && candidato.busca.consultado_em !== undefined && candidato.busca.completo !== true) {
    falhar(`${caminho}.busca.completo`, "true obrigatório para recibo DJEN novo")
  }

  if (candidato.classificacao === "vazio_confirmado") {
    const tetoDeclarado = candidato.busca.teto_publico_atingido
    if (tetoDeclarado !== undefined && typeof tetoDeclarado !== "boolean") {
      falhar(`${caminho}.busca.teto_publico_atingido`, "booleano obrigatorio")
    }
    const totalApi = candidato.busca.total_api
    if (totalApi !== undefined && (!Number.isInteger(totalApi) || Number(totalApi) < 0)) {
      falhar(`${caminho}.busca.total_api`, "inteiro nao negativo obrigatorio")
    }
    if (tetoDeclarado === true || Number(totalApi ?? 0) >= 10_000) {
      falhar(`${caminho}.classificacao`, "vazio_confirmado proibido quando a busca atinge o teto publico")
    }
    // vazio_confirmado é uma alegação negativa pública ("nada encontrado").
    // Ocorrência ambígua registrada significa que uma coincidência de nome
    // ainda não teve identidade resolvida (ex.: "nome exato sem segundo
    // identificador"): publicar vazio_confirmado nesse estado seria afirmar
    // ausência enquanto uma correspondência não descartada permanece aberta.
    // Reclassificar como bloqueado/encontrado preserva o registro da
    // ocorrência (serializado em `detalhe` via ocorrencias_ambiguas) sem
    // fazer a alegação negativa antes da hora.
    if ((candidato.ocorrencias_ambiguas ?? []).length > 0) {
      falhar(`${caminho}.classificacao`, "vazio_confirmado exige ausência de ocorrências ambíguas")
    }
  }

  // Busca servida do cache sanitizado não tem o texto bruto: o descarte de
  // homônimo por CPF divergente não rodou, então nenhuma atribuição dela vale.
  if (candidato.classificacao === "encontrado" && candidato.busca.conferencia_cpf === "indisponivel_cache_sanitizado") {
    falhar(`${caminho}.busca.conferencia_cpf`, "encontrado exige conferência de CPF no texto bruto; refazer a busca sem cache")
  }
  if (candidato.classificacao === "encontrado" && candidato.processos.length === 0) {
    falhar(`${caminho}.processos`, "classificacao encontrado exige ao menos um achado")
  }
  if (candidato.classificacao !== "encontrado" && candidato.processos.length > 0) {
    falhar(`${caminho}.processos`, "processos presentes exigem classificacao encontrado")
  }

  const publicaveis = evidenciasPublicaveis(candidato.processos, buscaUrls, candidato, `${caminho}.processos`)
  const urls = [...new Set([
    ...identidadeUrls,
    ...buscaUrls,
    ...publicaveis,
    ...urlsDatajud(candidato.processos, `${caminho}.processos`),
  ])]
  const homonimos = homonimosAuditaveis(
    candidato.homonimos_descartados,
    `${caminho}.homonimos_descartados`,
  )
  const ambiguos = homonimosAuditaveis(
    candidato.ocorrencias_ambiguas ?? [],
    `${caminho}.ocorrencias_ambiguas`,
  )
  const data = dataDaConclusao(lote.concluido_em, `${caminho}.concluido_em`)
  const detalhe = [
    `orgaos: ${textoLimpo(orgaos.join(", "))}`,
    `jurisdicao: ${jurisdicao(orgaos)}`,
    `periodo: ${textoLimpo(periodo)}`,
    `termos: ${textoLimpo(termos)}`,
    `classificacao_original: ${candidato.classificacao}`,
    `motivo: ${textoLimpo(candidato.motivo)}`,
    `ocorrencias_ambiguas: ${JSON.stringify(ambiguos)}`,
    `homonimos_descartados: ${JSON.stringify(homonimos)}`,
  ].join("; ")

  const args = [
    argumento("slug", candidato.slug),
    "--frente=processos",
    argumento("data", data),
    argumento("resultado", resultado),
    argumento("detalhe", detalhe),
    argumento("identidade", identidade),
    ...urls.map((url) => argumento("url", url)),
    ...identidadeUrls.map((url) => argumento("identidade-url", url)),
    ...publicaveis.map((url) => argumento("evidencia-publicavel", url)),
  ]

  // Reusa o validador canonico antes que qualquer candidato possa ser escrito.
  validarRevisaoManual([...args, "--dry-run"])
  return {
    lote: lote.numero,
    slug: candidato.slug,
    data,
    classificacao: candidato.classificacao,
    resultado,
    homonimosDescartados: candidato.homonimos_descartados.length,
    args,
  }
}

function lerCandidato(valor: unknown, caminho: string): RegistroEvidencia {
  const registro = objeto(valor, caminho)
  const classificacao = texto(registro.classificacao, `${caminho}.classificacao`)
  if (!new Set<ClassificacaoEvidencia>(["encontrado", "vazio_confirmado", "bloqueado", "erro"]).has(classificacao as ClassificacaoEvidencia)) {
    return falhar(`${caminho}.classificacao`, "valor desconhecido")
  }
  const uf = registro.uf === null ? null : texto(registro.uf, `${caminho}.uf`)
  return {
    slug: slug(registro.slug, `${caminho}.slug`),
    nome_completo: texto(registro.nome_completo, `${caminho}.nome_completo`),
    nome_urna: texto(registro.nome_urna, `${caminho}.nome_urna`),
    cargo: texto(registro.cargo, `${caminho}.cargo`),
    uf,
    identidade: objeto(registro.identidade, `${caminho}.identidade`),
    busca: objeto(registro.busca, `${caminho}.busca`),
    ocorrencias_ambiguas: registro.ocorrencias_ambiguas === undefined
      ? []
      : registros(registro.ocorrencias_ambiguas, `${caminho}.ocorrencias_ambiguas`),
    homonimos_descartados: registros(registro.homonimos_descartados, `${caminho}.homonimos_descartados`),
    classificacao: classificacao as ClassificacaoEvidencia,
    motivo: texto(registro.motivo, `${caminho}.motivo`),
    processos: registros(registro.processos, `${caminho}.processos`),
  }
}

function lerLote(valor: unknown, caminho: string): LoteEvidencia {
  const registro = objeto(valor, caminho)
  return {
    numero: inteiro(registro.numero, `${caminho}.numero`),
    concluido_em: texto(registro.concluido_em, `${caminho}.concluido_em`),
    slugs: lista(registro.slugs, `${caminho}.slugs`).map((item, indice) => slug(item, `${caminho}.slugs[${indice}]`)),
    candidatos: lista(registro.candidatos, `${caminho}.candidatos`).map((item, indice) =>
      lerCandidato(item, `${caminho}.candidatos[${indice}]`),
    ),
  }
}

function validarResumo(evidencia: EvidenciaFinal, candidatos: RegistroEvidencia[]): void {
  const esperado: Record<string, number> = {
    classificados: candidatos.length,
    encontrado: candidatos.filter((candidato) => candidato.classificacao === "encontrado").length,
    vazio_confirmado: candidatos.filter((candidato) => candidato.classificacao === "vazio_confirmado").length,
    bloqueado: candidatos.filter((candidato) => candidato.classificacao === "bloqueado").length,
    erro: candidatos.filter((candidato) => candidato.classificacao === "erro").length,
  }
  for (const [chave, valor] of Object.entries(esperado)) {
    if (chave === "erro" && !(chave in evidencia.resumo) && valor === 0) continue
    if (evidencia.resumo[chave] !== valor) {
      falhar(`resumo.${chave}`, `esperado ${valor}, recebido ${String(evidencia.resumo[chave])}`)
    }
  }
}

/**
 * Evidência gerada por `curadoria-processos-lote --coorte-atual`: registra só
 * os alvos da execução (qualquer tamanho), sem o snapshot de agosto.
 */
export function validarEvidenciaCoorteAtual(valor: unknown): EvidenciaFinal {
  const raiz = objeto(valor, "evidence")
  if (raiz.schema_version !== 1) falhar("evidence.schema_version", "esperado 1")
  const fontes = objeto(raiz.fontes, "evidence.fontes")
  const modo = texto(fontes.modo, "evidence.fontes.modo")
  if (!MODOS_COORTE_ATUAL.has(modo)) falhar("evidence.fontes.modo", `modo nao aplicavel: ${modo}`)
  const candidatosIniciais = lista(raiz.candidatos_iniciais, "evidence.candidatos_iniciais")
    .map((item, indice) => slug(item, `evidence.candidatos_iniciais[${indice}]`))
  const total = inteiro(raiz.total_inicial, "evidence.total_inicial")
  if (total < 1 || candidatosIniciais.length !== total || new Set(candidatosIniciais).size !== total) {
    falhar("evidence.candidatos_iniciais", "total_inicial deve igualar a quantidade de slugs unicos")
  }
  const lotes = lista(raiz.lotes, "evidence.lotes").map((item, indice) => lerLote(item, `evidence.lotes[${indice}]`))
  if (lotes.length === 0) falhar("evidence.lotes", "ao menos um lote obrigatorio")
  lotes.sort((a, b) => a.numero - b.numero)
  lotes.forEach((lote, indice) => {
    if (lote.numero !== indice + 1) falhar(`evidence.lotes[${indice}].numero`, `esperado ${indice + 1}`)
    if (lote.slugs.length !== lote.candidatos.length) falhar(`evidence.lotes[${indice}]`, "slugs e candidatos divergem")
    lote.candidatos.forEach((candidato, candidatoIndice) => {
      if (lote.slugs[candidatoIndice] !== candidato.slug) {
        falhar(`evidence.lotes[${indice}].candidatos[${candidatoIndice}].slug`, "ordem diverge de lote.slugs")
      }
    })
  })
  const candidatos = lotes.flatMap((lote) => lote.candidatos)
  const classificados = candidatos.map((candidato) => candidato.slug)
  const iniciais = new Set(candidatosIniciais)
  if (new Set(classificados).size !== classificados.length) falhar("evidence.lotes", "slug repetido entre lotes")
  const divergentes = classificados.filter((item) => !iniciais.has(item))
    .concat(candidatosIniciais.filter((item) => !new Set(classificados).has(item)))
  if (divergentes.length > 0) falhar("evidence.lotes", `coorte diverge dos candidatos iniciais: ${divergentes.join(", ")}`)
  const resumoRegistro = objeto(raiz.resumo, "evidence.resumo")
  const resumo = Object.fromEntries(Object.entries(resumoRegistro).map(([chave, valor]) => [chave, inteiro(valor, `evidence.resumo.${chave}`)]))
  const evidencia: EvidenciaFinal = {
    schema_version: 1,
    total_inicial: total,
    candidatos_iniciais: candidatosIniciais,
    lotes,
    resumo,
    coorte_atual: {
      modo,
      snapshot_sha256: typeof fontes.snapshot_sha256 === "string" ? fontes.snapshot_sha256 : null,
    },
  }
  validarResumo(evidencia, candidatos)
  return evidencia
}

function evidenciaDaCoorteAtual(valor: unknown): boolean {
  if (!valor || typeof valor !== "object") return false
  const fontes = (valor as Record<string, unknown>).fontes
  return Boolean(fontes && typeof fontes === "object"
    && typeof (fontes as Record<string, unknown>).modo === "string"
    && String((fontes as Record<string, unknown>).modo).startsWith("dry-run-coorte-atual"))
}

export function validarEvidencia(valor: unknown): EvidenciaFinal {
  return evidenciaDaCoorteAtual(valor) ? validarEvidenciaCoorteAtual(valor) : validarEvidenciaFinal(valor)
}

/**
 * Renovação: recibo anterior do mesmo alvo não é conflito, é o que está sendo
 * renovado. Conflito é só um recibo mais novo que a própria evidência, que
 * seria rebaixado por uma busca mais velha.
 */
export function validarPreflightRenovacao(
  planos: PlanoRegistro[],
  slugsPublicos: string[],
  existentes: LinhaExistentePreflight[],
  concluidoEmPorLote: Map<number, string>,
): ResultadoPreflight {
  const publicos = new Set(slugsPublicos)
  const ausentes = planos.map((plano) => plano.slug).filter((item) => !publicos.has(item))
  if (ausentes.length > 0) throw new Error(`preflight: fora de candidatos_publico: ${ausentes.join(", ")}`)
  const porAlvo = new Map<string, LinhaExistentePreflight[]>()
  for (const linha of existentes) porAlvo.set(linha.alvo, [...(porAlvo.get(linha.alvo) ?? []), linha])
  const equivalentes: PlanoRegistro[] = []
  const pendentes: PlanoRegistro[] = []
  const conflitos: string[] = []
  for (const plano of planos) {
    const linhas = porAlvo.get(plano.slug) ?? []
    const concluido = Date.parse(concluidoEmPorLote.get(plano.lote) ?? "")
    if (!Number.isFinite(concluido)) throw new Error(`preflight: lote ${plano.lote} sem concluido_em`)
    const esperado = detalheEsperadoDoPlano(plano)
    if (linhas.some((linha) => linha.resultado === plano.resultado && linha.detalhe === esperado)) {
      equivalentes.push(plano)
      continue
    }
    if (linhas.some((linha) => linha.executado_em && Date.parse(linha.executado_em) > concluido)) {
      conflitos.push(plano.slug)
      continue
    }
    pendentes.push(plano)
  }
  if (conflitos.length > 0) {
    throw new Error(`preflight: ${conflitos.length} alvo(s) com recibo mais novo que a evidencia: ${[...new Set(conflitos)].sort().join(", ")}`)
  }
  return { pendentes, equivalentes }
}

function detalheEsperadoDoPlano(plano: PlanoRegistro): string {
  const argumentos = (nome: string): string[] => plano.args
    .filter((item) => item.startsWith(`--${nome}=`))
    .map((item) => item.slice(nome.length + 3))
  return [
    `revisao_em=${plano.data}`,
    `identidade=${argumentos("identidade")[0] ?? ""}`,
    `identidade_urls=${argumentos("identidade-url").join(",")}`,
    `urls_consultadas=${argumentos("url").join(",")}`,
    `detalhe=${argumentos("detalhe")[0] ?? ""}`,
  ].join("; ")
}

export function validarEvidenciaFinal(valor: unknown): EvidenciaFinal {
  const raiz = objeto(valor, "evidence")
  if (raiz.schema_version !== 1) falhar("evidence.schema_version", "esperado 1")
  if (raiz.total_inicial !== TOTAL_CANDIDATOS) {
    falhar("evidence.total_inicial", `esperado ${TOTAL_CANDIDATOS}`)
  }
  const candidatosIniciais = lista(raiz.candidatos_iniciais, "evidence.candidatos_iniciais")
    .map((item, indice) => slug(item, `evidence.candidatos_iniciais[${indice}]`))
  if (candidatosIniciais.length !== TOTAL_CANDIDATOS || new Set(candidatosIniciais).size !== TOTAL_CANDIDATOS) {
    falhar("evidence.candidatos_iniciais", `${TOTAL_CANDIDATOS} slugs unicos obrigatorios`)
  }

  const lotes = lista(raiz.lotes, "evidence.lotes").map((item, indice) => lerLote(item, `evidence.lotes[${indice}]`))
  if (lotes.length !== TOTAL_LOTES) falhar("evidence.lotes", `${TOTAL_LOTES} lotes obrigatorios`)
  lotes.sort((a, b) => a.numero - b.numero)
  lotes.forEach((lote, indice) => {
    const numeroEsperado = indice + 1
    if (lote.numero !== numeroEsperado) falhar(`evidence.lotes[${indice}].numero`, `esperado ${numeroEsperado}`)
    const tamanhoEsperado = lote.numero < TOTAL_LOTES ? TAMANHO_LOTE : TOTAL_CANDIDATOS % TAMANHO_LOTE
    if (lote.slugs.length !== tamanhoEsperado || lote.candidatos.length !== tamanhoEsperado) {
      falhar(`evidence.lotes[${indice}]`, `esperados ${tamanhoEsperado} slugs e candidatos`)
    }
    lote.candidatos.forEach((candidato, candidatoIndice) => {
      if (lote.slugs[candidatoIndice] !== candidato.slug) {
        falhar(`evidence.lotes[${indice}].candidatos[${candidatoIndice}].slug`, "ordem diverge de lote.slugs")
      }
    })
  })

  const candidatos = lotes.flatMap((lote) => lote.candidatos)
  const slugsClassificados = candidatos.map((candidato) => candidato.slug)
  if (slugsClassificados.length !== TOTAL_CANDIDATOS || new Set(slugsClassificados).size !== TOTAL_CANDIDATOS) {
    falhar("evidence.lotes", `${TOTAL_CANDIDATOS} candidatos unicos obrigatorios`)
  }
  const iniciais = new Set(candidatosIniciais)
  const divergentes = slugsClassificados.filter((item) => !iniciais.has(item))
    .concat(candidatosIniciais.filter((item) => !new Set(slugsClassificados).has(item)))
  if (divergentes.length > 0) falhar("evidence.lotes", `coorte diverge dos candidatos iniciais: ${divergentes.join(", ")}`)

  const resumoRegistro = objeto(raiz.resumo, "evidence.resumo")
  const resumo = Object.fromEntries(Object.entries(resumoRegistro).map(([chave, valor]) => [chave, inteiro(valor, `evidence.resumo.${chave}`)]))
  const evidencia: EvidenciaFinal = {
    schema_version: 1,
    total_inicial: TOTAL_CANDIDATOS,
    candidatos_iniciais: candidatosIniciais,
    lotes,
    resumo,
  }
  validarResumo(evidencia, candidatos)
  return evidencia
}

export function criarPlanos(evidencia: EvidenciaFinal): PlanoRegistro[] {
  return evidencia.lotes.flatMap((lote) => lote.candidatos.map((candidato) => criarPlano(candidato, lote)))
}

export function validarPreflight(
  planos: PlanoRegistro[],
  slugsPublicos: string[],
  existentes: LinhaExistentePreflight[],
): ResultadoPreflight {
  const publicos = new Set(slugsPublicos)
  const ausentes = planos.map((plano) => plano.slug).filter((item) => !publicos.has(item))
  if (ausentes.length > 0 || publicos.size !== planos.length) {
    throw new Error(`preflight: coorte publica divergente; ausentes=${ausentes.join(", ") || "nenhum"}`)
  }

  const detalheEsperado = detalheEsperadoDoPlano
  const porAlvo = new Map<string, LinhaExistentePreflight[]>()
  for (const linha of existentes) {
    porAlvo.set(linha.alvo, [...(porAlvo.get(linha.alvo) ?? []), linha])
  }
  const equivalentes: PlanoRegistro[] = []
  const pendentes: PlanoRegistro[] = []
  const conflitos: string[] = []
  for (const plano of planos) {
    const linhas = porAlvo.get(plano.slug) ?? []
    if (linhas.length === 0) {
      pendentes.push(plano)
      continue
    }
    const esperado = detalheEsperado(plano)
    const exatas = linhas.filter((linha) => linha.resultado === plano.resultado && linha.detalhe === esperado)
    const divergentes = linhas.filter((linha) => linha.resultado !== plano.resultado || linha.detalhe !== esperado)
    if (divergentes.length > 0) conflitos.push(plano.slug)
    else if (exatas.length > 0) equivalentes.push(plano)
  }
  if (conflitos.length > 0) {
    const alvos = [...new Set(conflitos)].sort()
    throw new Error(
      `preflight: ${alvos.length} registro(s) conflitante(s) ja existem em ${FONTE_CURADORIA}: ${alvos.join(", ")}`,
    )
  }
  return { pendentes, equivalentes }
}

/**
 * `vazio_confirmado` afirma "nenhum processo" na ficha. Candidato com linha
 * publicada em `processos` nunca recebe esse recibo: seria a contradição que
 * a UI marca como "recibo judicial contraditório".
 */
export function exigirVazioSemLinhasPublicadas(planos: PlanoRegistro[], slugsComLinhas: ReadonlySet<string>): void {
  const contraditorios = planos
    .filter((plano) => plano.resultado === "vazio_confirmado" && slugsComLinhas.has(plano.slug))
    .map((plano) => plano.slug)
    .sort()
  if (contraditorios.length > 0) {
    throw new Error(`preflight: vazio_confirmado recusado para candidato com linhas em processos: ${contraditorios.join(", ")}`)
  }
}

async function slugsComLinhasPublicadas(slugs: string[]): Promise<Set<string>> {
  // coorte-atualizacao: isento (preflight mapeia ids apenas dos slugs presentes no plano explícito)
  const { data: candidatos, error } = await supabase.from("candidatos").select("id,slug").in("slug", slugs)
  if (error) throw new Error(`preflight: nao foi possivel ler candidatos: ${error.message}`)
  const slugPorId = new Map((candidatos ?? []).map((linha) => [String(linha.id), String(linha.slug)]))
  if (slugPorId.size === 0) return new Set()
  const { data: linhas, error: erroProcessos } = await supabase.from("processos")
    .select("candidato_id").in("candidato_id", [...slugPorId.keys()]).limit(5_000)
  if (erroProcessos) throw new Error(`preflight: nao foi possivel ler processos: ${erroProcessos.message}`)
  return new Set((linhas ?? []).map((linha) => slugPorId.get(String(linha.candidato_id))).filter((slug): slug is string => Boolean(slug)))
}

/** CNJ só de URL publicável (DJEN por número, API ou portal), nunca de outra URL consultada. */
export function cnjsPublicaveisDoTexto(valor: string): string[] {
  const padrao = /https:\/\/comunica(?:api)?\.pje\.jus\.br\/(?:api\/v1\/comunicacao|consulta)\?[^,;\s]*?numeroProcesso=(\d{20})(?!\d)/g
  return [...new Set([...valor.matchAll(padrao)].map((m) => m[1]))].sort()
}

/**
 * Revalidação: só grava o plano cujo estado muda em relação ao último recibo
 * do alvo (resultado diferente, ou conjunto de CNJ publicáveis diferente).
 * Recibo que só renovaria a data fica de fora.
 */
export function filtrarMudancas(planos: PlanoRegistro[], existentes: LinhaExistentePreflight[]): PlanoRegistro[] {
  const ultimo = ultimoReciboPorAlvo(existentes)
  return planos.filter((plano) => {
    const linha = ultimo.get(plano.slug)
    if (!linha) return true
    if (linha.resultado !== plano.resultado) return true
    const publicaveis = cnjsPublicaveisDoTexto(plano.args.filter((arg) => arg.startsWith("--evidencia-publicavel=")).join(" "))
    const anteriores = cnjsPublicaveisDoTexto((linha.detalhe ?? "").split("; detalhe=")[0])
    return plano.resultado === "encontrado" && JSON.stringify(publicaveis) !== JSON.stringify(anteriores)
  })
}

/**
 * Falha de consulta nunca rebaixa recibo: plano `erro` só é gravado para alvo
 * sem recibo ou cujo último recibo já é `erro`. Nos demais, o recibo anterior
 * (encontrado, vazio, indeterminado) fica intacto e a próxima execução tenta
 * de novo; o SLA de 14 dias continua sendo cobrado pela conferência.
 */
export function descartarErroSobreRecibo(
  planos: PlanoRegistro[],
  existentes: LinhaExistentePreflight[],
): { planos: PlanoRegistro[]; mantidos: string[] } {
  const ultimo = ultimoReciboPorAlvo(existentes)
  const mantidos: string[] = []
  const saida = planos.filter((plano) => {
    if (plano.resultado !== "erro") return true
    const linha = ultimo.get(plano.slug)
    if (!linha || linha.resultado === "erro") return true
    mantidos.push(plano.slug)
    return false
  })
  return { planos: saida, mantidos }
}

/**
 * Último recibo de cada alvo. Empate de `executado_em` fica com a linha que
 * vem depois (as linhas chegam por `id` ascendente).
 */
function ultimoReciboPorAlvo(existentes: LinhaExistentePreflight[]): Map<string, LinhaExistentePreflight> {
  const ultimo = new Map<string, LinhaExistentePreflight>()
  for (const linha of existentes) {
    const anterior = ultimo.get(linha.alvo)
    if (!anterior || Date.parse(linha.executado_em ?? "") >= Date.parse(anterior.executado_em ?? "")) ultimo.set(linha.alvo, linha)
  }
  return ultimo
}

export interface ConfirmacaoEditorial {
  numero_cnj: string
  confirmacao: "editorial"
  decidido_por: string
  decidido_em: string
  motivo: string
}

export interface RevisaoHumana {
  slug: string
  numero_cnj: string
  motivo: string
}

/** Um recibo é indivisível: se contém CNJ vetado, o plano inteiro vai à revisão. */
export function bloquearPlanosPorDecisao(
  planos: PlanoRegistro[],
  cnjsPorSlug: ReadonlyMap<string, readonly string[]>,
  decisoes: ReadonlySet<string>,
): { planos: PlanoRegistro[]; revisaoHumana: RevisaoHumana[]; bloqueados: number } {
  const permitidos: PlanoRegistro[] = []
  const revisaoHumana: RevisaoHumana[] = []
  let bloqueados = 0
  for (const plano of planos) {
    const cnjs = new Set([
      ...(cnjsPorSlug.get(plano.slug) ?? []),
      ...plano.args.flatMap((arg) => arg.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|\d{20}/g) ?? []),
    ])
    const vetados = [...cnjs].filter((cnj) => decididoNaoPublicar(decisoes, plano.slug, cnj))
    if (vetados.length === 0) {
      permitidos.push(plano)
      continue
    }
    bloqueados += vetados.length
    revisaoHumana.push(...vetados.map((numero_cnj) => ({
      slug: plano.slug, numero_cnj, motivo: "decisao_editorial_nao_publicar",
    })))
  }
  return { planos: permitidos, revisaoHumana, bloqueados }
}

/** Quem pode registrar confirmação editorial de identidade. */
export const DECISORES_EDITORIAIS: readonly string[] = ["Thiago Salvador"]

function dataReal(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const data = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor
}

/**
 * Lê `confirmacao_editorial: [...]` do detalhe gravado (`revisao_em=...; ...; detalhe=<campos>`).
 * Devolve `null` quando o campo existe mas não é válido (decisor fora da lista,
 * data irreal, futura ou posterior à revisão do recibo): quem chama manda o
 * alvo para revisão humana em vez de perder ou aceitar a confirmação em silêncio.
 */
export function confirmacoesEditoriaisDoDetalhe(
  detalhe: string | null | undefined,
  hoje: string = new Date().toISOString().slice(0, 10),
): ConfirmacaoEditorial[] | null {
  const texto = detalhe ?? ""
  const interno = texto.split("; detalhe=").slice(1).join("; detalhe=")
  const campo = /(?:^|; )confirmacao_editorial: (\[.*?\])(?=; [a-z_ ]+: |$)/.exec(interno)
  if (!campo) return []
  const revisaoEm = /^revisao_em=(\d{4}-\d{2}-\d{2})(?:;|$)/.exec(texto)?.[1]
  if (!revisaoEm || !dataReal(revisaoEm)) return null
  try {
    const lista = JSON.parse(campo[1]) as unknown
    if (!Array.isArray(lista)) return null
    // Lista vazia é revogação explícita: a próxima linha sai sem confirmação.
    if (lista.length === 0) return []
    const validas = lista.filter((item): item is ConfirmacaoEditorial => {
      if (!item || typeof item !== "object") return false
      const c = item as Record<string, unknown>
      return typeof c.numero_cnj === "string" && cnjValido(c.numero_cnj)
        && c.confirmacao === "editorial"
        && typeof c.decidido_por === "string" && DECISORES_EDITORIAIS.includes(c.decidido_por)
        && typeof c.decidido_em === "string" && dataReal(c.decidido_em)
        && c.decidido_em <= hoje && c.decidido_em <= revisaoEm
        && typeof c.motivo === "string" && c.motivo.trim().length > 0 && !c.motivo.includes(";")
    })
    if (validas.length !== lista.length) return null
    return validas.map(({ numero_cnj, confirmacao, decidido_por, decidido_em, motivo }) => ({ numero_cnj, confirmacao, decidido_por, decidido_em, motivo }))
  } catch {
    return null
  }
}

const URL_DJEN_POR_NUMERO = "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso="

/** Troca o valor de um campo do detalhe (`chave: valor`), mantendo os demais. */
function comCampoDoDetalhe(detalhe: string, chave: string, valor: (atual: string) => string): string {
  return detalhe.split(/; (?=[a-z_ ]+: )/).map((parte) => {
    const separador = parte.indexOf(": ")
    return separador >= 0 && parte.slice(0, separador) === chave ? `${chave}: ${valor(parte.slice(separador + 2))}` : parte
  }).join("; ")
}

/** Busca que não fecha o acervo: não sustenta carregar uma confirmação. */
function buscaSemConclusao(plano: PlanoRegistro, candidato: RegistroEvidencia): boolean {
  const busca = candidato.busca
  return plano.resultado === "erro"
    || plano.args.includes("--identidade=nao-confirmada")
    || busca.conferencia_cpf === "indisponivel_cache_sanitizado"
    || busca.teto_publico_atingido === true
    || Number(busca.total_api ?? 0) >= 10_000
    || busca.completo !== true
}

/**
 * Confirmação editorial (decisão humana registrada no recibo) sobrevive à
 * renovação automática:
 * - toda confirmação válida do último recibo é regravada na linha nova, provada
 *   pela coleta ou não, para não se perder quando a coleta deixar de provar;
 * - CNJ que a coleta nova prova segue como a coleta diz: a confirmação nunca
 *   rebaixa nem muda resultado ou evidências de um recibo provado;
 * - CNJ confirmado que a coleta não prova é carregado: entra como evidência
 *   publicável, sai das ambíguas, e o resultado passa a `encontrado`;
 * - o alvo vai a revisão humana (nenhuma linha nova) quando a coleta traz
 *   prova contra a confirmação (homônimo descartado ou documento completo
 *   diferente colado ao nome), quando a busca não fecha o acervo (erro,
 *   identidade não confirmada, cache sem texto bruto, teto público, busca
 *   incompleta), quando a coleta não acha o nome (`vazio_confirmado`) ou
 *   quando a confirmação gravada é inválida.
 */
export function preservarConfirmacaoEditorial(
  planos: PlanoRegistro[],
  candidatos: ReadonlyMap<string, RegistroEvidencia>,
  existentes: LinhaExistentePreflight[],
  hoje?: string,
): { planos: PlanoRegistro[]; revisaoHumana: RevisaoHumana[] } {
  const ultimo = ultimoReciboPorAlvo(existentes)
  const revisaoHumana: RevisaoHumana[] = []
  const saida: PlanoRegistro[] = []
  for (const plano of planos) {
    const linha = ultimo.get(plano.slug)
    const confirmacoes = linha ? confirmacoesEditoriaisDoDetalhe(linha.detalhe, hoje) : []
    if (confirmacoes === null) {
      revisaoHumana.push({ slug: plano.slug, numero_cnj: "", motivo: "confirmacao_editorial invalida no ultimo recibo" })
      continue
    }
    const candidato = candidatos.get(plano.slug)
    if (confirmacoes.length === 0 || !candidato) {
      saida.push(plano)
      continue
    }
    const provados = new Set(candidato.processos.map((p) => String(p.numero_cnj ?? "")))
    const pendentes = confirmacoes.filter((c) => !provados.has(c.numero_cnj))
    const descartados = new Set(candidato.homonimos_descartados.map((h) => String(h.numero_cnj ?? "")))
    const divergentes = new Set((candidato.ocorrencias_ambiguas ?? [])
      .filter((o) => o.cpf_divergente === true).map((o) => String(o.numero_cnj ?? "")))
    const semConclusao = buscaSemConclusao(plano, candidato)
    const bloqueios = pendentes.flatMap((c): RevisaoHumana[] => {
      if (descartados.has(c.numero_cnj) || divergentes.has(c.numero_cnj)) {
        return [{ slug: plano.slug, numero_cnj: c.numero_cnj, motivo: "coleta nova traz documento divergente colado ao nome" }]
      }
      if (semConclusao) return [{ slug: plano.slug, numero_cnj: c.numero_cnj, motivo: "busca nova sem conclusao sobre o acervo" }]
      if (plano.resultado === "vazio_confirmado") {
        return [{ slug: plano.slug, numero_cnj: c.numero_cnj, motivo: "coleta nova nao achou o nome no acervo" }]
      }
      return []
    })
    if (bloqueios.length > 0) {
      revisaoHumana.push(...bloqueios)
      continue
    }
    const cnjsPendentes = new Set(pendentes.map((c) => c.numero_cnj))
    const urls = pendentes.map((c) => `${URL_DJEN_POR_NUMERO}${c.numero_cnj.replace(/\D/g, "")}`)
    const resultado: ResultadoRegistro = pendentes.length > 0 ? "encontrado" : plano.resultado
    const args = plano.args.map((arg) => {
      if (arg.startsWith("--resultado=")) return argumento("resultado", resultado)
      if (!arg.startsWith("--detalhe=")) return arg
      const detalhe = comCampoDoDetalhe(arg.slice("--detalhe=".length), "ocorrencias_ambiguas", (atual) => {
        const lista = JSON.parse(atual) as Array<Record<string, unknown>>
        return JSON.stringify(lista.filter((o) => !cnjsPendentes.has(String(o.numero_cnj ?? ""))))
      })
      // Todas as confirmações válidas, provadas ou não: a próxima rodada precisa delas.
      return argumento("detalhe", `${detalhe}; confirmacao_editorial: ${JSON.stringify(confirmacoes)}`)
    })
    for (const url of urls) {
      if (!args.includes(argumento("url", url))) args.push(argumento("url", url))
      if (!args.includes(argumento("evidencia-publicavel", url))) args.push(argumento("evidencia-publicavel", url))
    }
    validarRevisaoManual([...args, "--dry-run"])
    saida.push({ ...plano, resultado, args })
  }
  return { planos: saida, revisaoHumana }
}

/**
 * Fonte do recibo de controle que marca alvo parado em revisão humana. Fica
 * fora de `FONTES` e do catálogo de frescor de propósito: não é coleta e não
 * pode esconder a idade do recibo judicial. A matriz de cobertura a lê pela
 * família "processos" só enquanto está pendente (`indeterminado`).
 */
export const FONTE_REVISAO_HUMANA = "processos-revisao-humana"

export interface DecisaoRevisaoHumana {
  numero_cnj: string
  decisao: "mantido" | "retirado"
}

/**
 * Fechamento de uma revisão humana: recibo final `nao_aplicavel` na mesma
 * fonte de controle, que passa a ser o último do alvo e tira a pendência da
 * matriz. A decisão em si (manter ou retirar o CNJ) vai para o recibo judicial
 * pelo registrador; este recibo só registra que a revisão fechou e como.
 */
export function entradaFechamentoRevisaoHumana(
  slug: string,
  decisoes: DecisaoRevisaoHumana[],
  decididoPor: string,
  decididoEm: string,
  hoje: string = new Date().toISOString().slice(0, 10),
): EntradaColeta {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("fechamento: slug invalido")
  if (decisoes.length === 0) throw new Error("fechamento: ao menos uma decisao por CNJ")
  for (const d of decisoes) {
    if (!cnjValido(d.numero_cnj)) throw new Error(`fechamento: CNJ invalido: ${d.numero_cnj}`)
    if (d.decisao !== "mantido" && d.decisao !== "retirado") throw new Error("fechamento: decisao deve ser mantido ou retirado")
  }
  if (new Set(decisoes.map((d) => d.numero_cnj)).size !== decisoes.length) throw new Error("fechamento: CNJ repetido")
  if (!DECISORES_EDITORIAIS.includes(decididoPor)) throw new Error("fechamento: decisor fora da lista")
  if (!dataReal(decididoEm) || decididoEm > hoje) throw new Error("fechamento: data de decisao invalida ou futura")
  return {
    fonte: FONTE_REVISAO_HUMANA,
    alvo: slug,
    resultado: "nao_aplicavel",
    volume: 0,
    detalhe: `motivo: revisao humana fechada; decidido_por: ${decididoPor}; decidido_em: ${decididoEm}; itens: ${JSON.stringify(decisoes.map(({ numero_cnj, decisao }) => ({ numero_cnj, decisao })))}`,
  }
}

/** Um recibo de controle por alvo em revisão humana (sem CPF; CNJ e motivo). */
export function entradasRevisaoHumana(revisao: RevisaoHumana[]): EntradaColeta[] {
  const porAlvo = new Map<string, RevisaoHumana[]>()
  for (const item of revisao) porAlvo.set(item.slug, [...(porAlvo.get(item.slug) ?? []), item])
  return [...porAlvo].map(([alvo, itens]) => ({
    fonte: FONTE_REVISAO_HUMANA,
    alvo,
    resultado: "indeterminado",
    volume: 0,
    detalhe: `motivo: confirmacao editorial parada em revisao humana; itens: ${JSON.stringify(itens.map(({ numero_cnj, motivo }) => ({ numero_cnj, motivo })))}`,
  }))
}

async function linhasExistentesPreflight(slugs: string[]): Promise<LinhaExistentePreflight[]> {
  const linhas: LinhaExistentePreflight[] = []
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA_PREFLIGHT) {
    const { data, error } = await supabase
      .from("coleta_log")
      .select("id,alvo,resultado,detalhe,executado_em,execucao,candidato_id,url,volume")
      .eq("fonte", FONTE_CURADORIA)
      // Só o recibo por candidato daquele alvo: é o que o readback e o site leem.
      .eq("escopo", "candidato")
      .in("alvo", slugs)
      .order("id", { ascending: true })
      .range(inicio, inicio + TAMANHO_PAGINA_PREFLIGHT - 1)
    if (error) throw new Error(`preflight: nao foi possivel ler coleta_log: ${error.message}`)
    const pagina = (data ?? []) as LinhaExistentePreflight[]
    linhas.push(...pagina)
    if (pagina.length < TAMANHO_PAGINA_PREFLIGHT) return linhas
  }
}

async function executarPreflightRemoto(
  planos: PlanoRegistro[],
  evidencia: EvidenciaFinal,
): Promise<ResultadoPreflight & { existentes: LinhaExistentePreflight[] }> {
  const slugs = planos.map((plano) => plano.slug)
  // coorte-atualizacao: isento (valida publicação apenas dos slugs do plano explícito)
  const { data, error } = await supabase.from("candidatos_publico").select("slug").in("slug", slugs)
  if (error) throw new Error(`preflight: nao foi possivel validar candidatos_publico: ${error.message}`)
  const slugsPublicos = (data ?? []).map((linha) => texto(linha.slug, "preflight.candidatos_publico.slug"))
  const vazios = planos.filter((plano) => plano.resultado === "vazio_confirmado").map((plano) => plano.slug)
  if (vazios.length > 0) exigirVazioSemLinhasPublicadas(planos, await slugsComLinhasPublicadas(vazios))
  const existentes = await linhasExistentesPreflight(slugs)
  const resultado = evidencia.coorte_atual
    ? validarPreflightRenovacao(
      planos,
      slugsPublicos,
      existentes,
      new Map(evidencia.lotes.map((lote) => [lote.numero, lote.concluido_em])),
    )
    : validarPreflight(planos, slugsPublicos, existentes)
  return { ...resultado, existentes }
}

/** Confere, fora de transação, que o último recibo de cada alvo é o recém-gravado. */
async function readbackRecibos(planos: PlanoRegistro[]): Promise<{ conferidos: number; divergentes: string[] }> {
  const slugs = planos.map((plano) => plano.slug)
  const { data, error } = await supabase.from("coleta_log_ultima")
    .select("alvo,resultado,detalhe")
    .eq("fonte", FONTE_CURADORIA).eq("escopo", "candidato").in("alvo", slugs)
  if (error) throw new Error(`readback: ${error.message}`)
  const porAlvo = new Map((data ?? []).map((linha) => [String(linha.alvo), linha]))
  const divergentes = planos.filter((plano) => {
    const linha = porAlvo.get(plano.slug)
    return !linha || linha.resultado !== plano.resultado || linha.detalhe !== detalheEsperadoDoPlano(plano)
  }).map((plano) => plano.slug)
  return { conferidos: planos.length - divergentes.length, divergentes }
}

export function adquirirLockAplicacao(evidence: string): () => void {
  const lock = `${evidence}.apply.lock`
  let descritor: number
  try {
    descritor = openSync(lock, "wx", 0o600)
  } catch (erro) {
    const codigo = erro && typeof erro === "object" && "code" in erro ? String(erro.code) : ""
    if (codigo === "EEXIST") {
      throw new Error(`apply ja esta em execucao para esta evidencia: ${lock}`)
    }
    throw erro
  }
  writeFileSync(descritor, `${process.pid}\n`, "utf8")
  closeSync(descritor)
  let liberado = false
  return () => {
    if (liberado) return
    liberado = true
    unlinkSync(lock)
  }
}

function lerOpcoes(argv: string[]): Opcoes {
  const desconhecidas = argv.filter((arg) =>
    arg !== "--apply" && arg !== "--dry-run" && arg !== "--somente-mudancas" && !arg.startsWith("--evidence=") && !arg.startsWith("--limit="),
  )
  if (desconhecidas.length > 0) throw new Error(`flag desconhecida: ${desconhecidas[0]}`)
  if (argv.includes("--apply") && argv.includes("--dry-run")) throw new Error("use --apply ou --dry-run, nunca os dois")
  const evidenceFlags = argv.filter((arg) => arg.startsWith("--evidence="))
  if (evidenceFlags.length > 1) throw new Error("--evidence deve ser unico")
  const limitFlags = argv.filter((arg) => arg.startsWith("--limit="))
  if (limitFlags.length > 1) throw new Error("--limit deve ser unico")
  const limit = limitFlags.length === 1 ? Number(limitFlags[0].slice("--limit=".length)) : undefined
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 1_000)) {
    throw new Error("--limit deve estar entre 1 e 1000")
  }
  if (argv.includes("--apply") && limit !== undefined) {
    throw new Error("--limit e exclusivo do dry-run; --apply sempre processa a evidencia completa")
  }
  const evidence = evidenceFlags.length === 1 ? evidenceFlags[0].slice("--evidence=".length).trim() : EVIDENCE_PADRAO
  if (!evidence) throw new Error("--evidence exige caminho nao vazio")
  return { evidence: resolve(evidence.replace(/^~(?=\/)/, homedir())), apply: argv.includes("--apply"), limit, somenteMudancas: argv.includes("--somente-mudancas") }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const opcoes = lerOpcoes(argv)
  const decisoes = carregarDecisoes()
  const bruto = JSON.parse(readFileSync(opcoes.evidence, "utf8")) as unknown
  const evidencia = validarEvidencia(bruto)
  const planosCriados = criarPlanos(evidencia)
  let planos = planosCriados

  // Todos os planos ja foram validados antes desta bifurcacao.
  if (opcoes.somenteMudancas && !evidencia.coorte_atual) throw new Error("--somente-mudancas exige evidencia da coorte atual")
  // Renovação da coorte atual: a confirmação editorial do último recibo de cada
  // alvo sobrevive; alvo com prova contra ela vai a revisão humana, sem linha nova.
  let revisaoHumana: RevisaoHumana[] = []
  let existentesIniciais: LinhaExistentePreflight[] = []
  let mantidosSemRebaixar = 0
  if (evidencia.coorte_atual && (opcoes.apply || opcoes.somenteMudancas)) {
    existentesIniciais = await linhasExistentesPreflight(planos.map((plano) => plano.slug))
    const candidatos = new Map(evidencia.lotes.flatMap((lote) => lote.candidatos).map((candidato) => [candidato.slug, candidato]))
    const preservado = preservarConfirmacaoEditorial(planos, candidatos, existentesIniciais)
    planos = preservado.planos
    revisaoHumana = preservado.revisaoHumana
    const semRebaixar = descartarErroSobreRecibo(planos, existentesIniciais)
    planos = semRebaixar.planos
    mantidosSemRebaixar = semRebaixar.mantidos.length
  }
  const cnjsDosRecibos = new Map<string, string[]>()
  for (const linha of existentesIniciais) {
    const encontrados = linha.detalhe?.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|\d{20}/g) ?? []
    cnjsDosRecibos.set(linha.alvo, [...(cnjsDosRecibos.get(linha.alvo) ?? []), ...encontrados])
  }
  const cnjsPorSlug = new Map(evidencia.lotes.flatMap((lote) => lote.candidatos).map((candidato) => [
    candidato.slug,
    [
      ...candidato.processos,
      ...(candidato.ocorrencias_ambiguas ?? []),
      ...candidato.homonimos_descartados,
    ].map((item) => String(item.numero_cnj ?? "")).concat(cnjsDosRecibos.get(candidato.slug) ?? []),
  ]))
  const bloqueio = bloquearPlanosPorDecisao(planos, cnjsPorSlug, decisoes)
  planos = bloqueio.planos
  revisaoHumana.push(...bloqueio.revisaoHumana)
  if (!opcoes.apply && opcoes.somenteMudancas) {
    // Único dry-run que lê o banco: precisa do último recibo de cada alvo.
    const mudancas = filtrarMudancas(planos, existentesIniciais)
    console.log(JSON.stringify({
      modo: "dry-run-somente-mudancas",
      evidence: opcoes.evidence,
      coorte_atual: evidencia.coorte_atual,
      candidatos_validados: planosCriados.length,
      decisoes_editoriais_bloqueadas: bloqueio.bloqueados,
      revisao_humana: revisaoHumana,
      mudancas: mudancas.map((plano) => ({ slug: plano.slug, resultado: plano.resultado, args: [...plano.args, "--dry-run"] })),
    }, null, 2))
    return
  }
  if (!opcoes.apply) {
    const selecionados = planos.slice(0, opcoes.limit ?? planos.length)
    console.log(JSON.stringify({
      modo: "dry-run",
      // Este modo não lê o banco: os planos saem sem a confirmação editorial do
      // último recibo e podem divergir do --apply.
      aviso: evidencia.coorte_atual
        ? "confirmacao editorial nao avaliada neste modo; use --dry-run --somente-mudancas para ver o plano que o --apply grava"
        : null,
      evidence: opcoes.evidence,
      coorte_atual: evidencia.coorte_atual ?? null,
      contagem_por_resultado: planos.reduce<Record<string, number>>((acc, plano) => {
        acc[plano.resultado] = (acc[plano.resultado] ?? 0) + 1
        return acc
      }, {}),
      candidatos_validados: planos.length,
      decisoes_editoriais_bloqueadas: bloqueio.bloqueados,
      revisao_humana: revisaoHumana,
      lotes_validados: evidencia.lotes.length,
      planos_exibidos: selecionados.length,
      resumo: evidencia.resumo,
      planos: selecionados.map((plano) => ({
        lote: plano.lote,
        slug: plano.slug,
        data: plano.data,
        classificacao: plano.classificacao,
        resultado: plano.resultado,
        homonimos_descartados: plano.homonimosDescartados,
        args: [...plano.args, "--dry-run"],
      })),
    }, null, 2))
    return
  }

  const liberarLock = adquirirLockAplicacao(opcoes.evidence)
  try {
    const preflightCompleto = await executarPreflightRemoto(planos, evidencia)
    const preflight = opcoes.somenteMudancas
      ? { ...preflightCompleto, pendentes: filtrarMudancas(preflightCompleto.pendentes, preflightCompleto.existentes) }
      : preflightCompleto
    // Backup das linhas existentes dos alvos antes de qualquer escrita (0600, ao lado da evidência).
    const backupPath = `${opcoes.evidence}.backup-coleta_log-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    writeFileSync(backupPath, `${JSON.stringify({ gerado_em: new Date().toISOString(), fonte: FONTE_CURADORIA, linhas: preflight.existentes }, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" })
    for (const plano of preflight.pendentes) {
      await registrarRevisao([...plano.args, "--apply"])
    }
    // Alvo parado em revisão humana ganha recibo de controle: a matriz vê a
    // pendência e o recibo judicial anterior fica intacto.
    for (const entrada of entradasRevisaoHumana(revisaoHumana)) {
      await registrarColetaOuFalhar(entrada)
    }
    const readback = await readbackRecibos(opcoes.somenteMudancas ? preflight.pendentes : planos)
    console.log(JSON.stringify({
      modo: "apply",
      backup: backupPath,
      candidatos_validados: planosCriados.length,
      decisoes_editoriais_bloqueadas: bloqueio.bloqueados,
      candidatos_pulados: preflight.equivalentes.length,
      candidatos_inseridos: preflight.pendentes.length,
      mantidos_sem_rebaixar: mantidosSemRebaixar,
      lotes: evidencia.lotes.length,
      readback,
      revisao_humana: revisaoHumana,
    }))
    if (readback.divergentes.length > 0) process.exitCode = 1
  } finally {
    liberarLock()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : String(erro))
    process.exitCode = 1
  })
}
