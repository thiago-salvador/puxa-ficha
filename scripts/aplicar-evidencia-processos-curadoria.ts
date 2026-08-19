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
}

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
}

export interface ResultadoPreflight {
  pendentes: PlanoRegistro[]
  equivalentes: PlanoRegistro[]
}

interface Opcoes {
  evidence: string
  apply: boolean
  limit?: number
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
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function normalizarProva(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
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
  return cpfCompativel || cargoDepois || cargoAntesDireto || cargoAntesComLocal || condicao
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
    "--resultado=indeterminado",
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
    resultado: "indeterminado",
    homonimosDescartados: candidato.homonimos_descartados.length,
    args,
  }
}

function criarPlano(candidato: RegistroEvidencia, lote: LoteEvidencia): PlanoRegistro {
  const caminho = `lote ${lote.numero}/${candidato.slug}`
  if (candidato.classificacao === "bloqueado" && candidato.identidade.status !== "confirmada") {
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

  const detalheEsperado = (plano: PlanoRegistro): string => {
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

async function linhasExistentesPreflight(slugs: string[]): Promise<LinhaExistentePreflight[]> {
  const linhas: LinhaExistentePreflight[] = []
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA_PREFLIGHT) {
    const { data, error } = await supabase
      .from("coleta_log")
      .select("alvo,resultado,detalhe")
      .eq("fonte", FONTE_CURADORIA)
      .in("alvo", slugs)
      .order("id", { ascending: true })
      .range(inicio, inicio + TAMANHO_PAGINA_PREFLIGHT - 1)
    if (error) throw new Error(`preflight: nao foi possivel ler coleta_log: ${error.message}`)
    const pagina = (data ?? []) as LinhaExistentePreflight[]
    linhas.push(...pagina)
    if (pagina.length < TAMANHO_PAGINA_PREFLIGHT) return linhas
  }
}

async function executarPreflightRemoto(planos: PlanoRegistro[]): Promise<ResultadoPreflight> {
  const slugs = planos.map((plano) => plano.slug)
  const { data, error } = await supabase.from("candidatos_publico").select("slug").in("slug", slugs)
  if (error) throw new Error(`preflight: nao foi possivel validar candidatos_publico: ${error.message}`)
  const slugsPublicos = (data ?? []).map((linha) => texto(linha.slug, "preflight.candidatos_publico.slug"))
  const existentes = await linhasExistentesPreflight(slugs)
  return validarPreflight(planos, slugsPublicos, existentes)
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
    arg !== "--apply" && arg !== "--dry-run" && !arg.startsWith("--evidence=") && !arg.startsWith("--limit="),
  )
  if (desconhecidas.length > 0) throw new Error(`flag desconhecida: ${desconhecidas[0]}`)
  if (argv.includes("--apply") && argv.includes("--dry-run")) throw new Error("use --apply ou --dry-run, nunca os dois")
  const evidenceFlags = argv.filter((arg) => arg.startsWith("--evidence="))
  if (evidenceFlags.length > 1) throw new Error("--evidence deve ser unico")
  const limitFlags = argv.filter((arg) => arg.startsWith("--limit="))
  if (limitFlags.length > 1) throw new Error("--limit deve ser unico")
  const limit = limitFlags.length === 1 ? Number(limitFlags[0].slice("--limit=".length)) : undefined
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > TOTAL_CANDIDATOS)) {
    throw new Error(`--limit deve estar entre 1 e ${TOTAL_CANDIDATOS}`)
  }
  if (argv.includes("--apply") && limit !== undefined) {
    throw new Error("--limit e exclusivo do dry-run; --apply sempre processa a evidencia completa")
  }
  const evidence = evidenceFlags.length === 1 ? evidenceFlags[0].slice("--evidence=".length).trim() : EVIDENCE_PADRAO
  if (!evidence) throw new Error("--evidence exige caminho nao vazio")
  return { evidence: resolve(evidence.replace(/^~(?=\/)/, homedir())), apply: argv.includes("--apply"), limit }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const opcoes = lerOpcoes(argv)
  const bruto = JSON.parse(readFileSync(opcoes.evidence, "utf8")) as unknown
  const evidencia = validarEvidenciaFinal(bruto)
  const planos = criarPlanos(evidencia)

  // Todos os 185 planos ja foram validados antes desta bifurcacao.
  if (!opcoes.apply) {
    const selecionados = planos.slice(0, opcoes.limit ?? planos.length)
    console.log(JSON.stringify({
      modo: "dry-run",
      evidence: opcoes.evidence,
      candidatos_validados: planos.length,
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
    const preflight = await executarPreflightRemoto(planos)
    for (const plano of preflight.pendentes) {
      await registrarRevisao([...plano.args, "--apply"])
    }
    console.log(JSON.stringify({
      modo: "apply",
      candidatos_validados: planos.length,
      candidatos_pulados: preflight.equivalentes.length,
      candidatos_inseridos: preflight.pendentes.length,
      lotes: evidencia.lotes.length,
    }))
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
