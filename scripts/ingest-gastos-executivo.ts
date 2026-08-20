/**
 * Coleta gastos institucionais de um órgão do Executivo no Portal da
 * Transparência. A API de cartões pagina e prova órgão/UG/contagem. O valor
 * persistido vem do download oficial mensal do CPGF. Se a contagem por UG
 * divergir, apply aborta. Sem CSV publicado, o mês não entra. Dry-run é o
 * padrão; somente --apply escreve, por upsert, e deixa trilha em coleta_log.
 *
 * Uso:
 *   npx tsx scripts/ingest-gastos-executivo.ts
 *   npx tsx scripts/ingest-gastos-executivo.ts --slug=lula --codigo-orgao=20101 --data-inicio=01/2026 --data-fim=01/2026
 *   npx tsx scripts/ingest-gastos-executivo.ts --apply
 */

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { parse as parseCsvSync } from "csv-parse/sync"
import { pathToFileURL } from "node:url"
import { escreverAuditado } from "./lib/escrita-auditada"
import { supabase } from "./lib/supabase"

export const PORTAL_CARTOES_API =
  "https://api.portaldatransparencia.gov.br/api-de-dados/cartoes"
export const PORTAL_CARTOES_FONTE = "https://portaldatransparencia.gov.br/cartoes"
export const PORTAL_CPGF_DOWNLOAD_BASE =
  "https://portaldatransparencia.gov.br/download-de-dados/cpgf"

interface OrgaoVinculado {
  codigoSIAFI?: string | null
  nome?: string | null
}

export interface PortalCartaoRow {
  id?: number | string | null
  mesExtrato?: string | null
  valorTransacao?: string | number | null
  portador?: { nome?: string | null } | null
  estabelecimento?: { nome?: string | null } | null
  unidadeGestora?: {
    codigo?: string | null
    nome?: string | null
    orgaoVinculado?: OrgaoVinculado | null
  } | null
}

export type ClassificacaoSigilo = "sigiloso" | "nominado" | "ausente"

/**
 * Regra para nomear portador. No CPGF federal, o Portal marca cartão
 * classificado com o token "Sigiloso"; nome só é publicável quando a fonte
 * trouxe um nome real.
 *
 * Governador (Onda G): plugar o portal estadual só quando ele nomear o
 * portador. Sem nome na fonte, o status fica ausente ou sigiloso; nunca
 * inventar o titular nem a família. Este ingest liga só o órgão federal
 * 20101 (Presidência da República / Lula).
 */
export interface PortadorNamingRule {
  classifiedTokens: readonly string[]
  publishHolderNames: boolean
}

export const FEDERAL_CPGF_PORTADOR_RULE: PortadorNamingRule = Object.freeze({
  classifiedTokens: ["Sigiloso"],
  publishHolderNames: true,
})

export interface GastoExecutivoUgColetado {
  orgao_codigo: string
  orgao_nome: string
  ug_codigo: string
  ug_nome: string
  mes_extrato: string
  valor_total: number
  qtd_transacoes: number
  qtd_portador_sigiloso: number
  qtd_portador_nominado: number
  qtd_portador_ausente: number
  qtd_estabelecimento_sigiloso: number
  qtd_estabelecimento_nominado: number
  qtd_estabelecimento_ausente: number
}

export interface GastoExecutivoMensalColetado {
  orgao_codigo: string
  orgao_nome: string
  mes_extrato: string
  valor_total: number
  qtd_transacoes: number
  unidades: GastoExecutivoUgColetado[]
}

export type GastoExecutivoCsvMes = GastoExecutivoMensalColetado & {
  csvPresente: boolean
}

export type MotivoReconciliacao = "conferido" | "valor_csv" | "csv_ausente" | "grao_diverge"

export interface MesReconciliado {
  persistivel: boolean
  motivo: MotivoReconciliacao
  valorCorrigidoPeloCsv: boolean
  deltaReais: number
  fonte: string
  mes: GastoExecutivoMensalColetado | null
}

export class CsvCpgfAusenteError extends Error {
  constructor(url: string) {
    super(`download oficial do CPGF ausente: ${url}`)
    this.name = "CsvCpgfAusenteError"
  }
}

export type FetchPortalPage = (
  url: URL,
  apiKey: string,
) => Promise<PortalCartaoRow[]>

export interface FetchPortalOptions {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  minIntervalMs?: number
  maxAttempts?: number
}

interface ColetarMesArgs {
  codigoOrgao: string
  orgaoNome: string
  mes: string
  apiKey: string
  fetchPage?: FetchPortalPage
  /** Portal estadual futuro: passar regra que só nomeia quando a fonte nomear. */
  portadorRule?: PortadorNamingRule
}

interface ValidarFiltroArgs {
  codigoOrgao: string
  mes: string
  apiKey: string
  fetchPage?: FetchPortalPage
}

interface ColetarSerieArgs {
  codigoOrgao: string
  orgaoNome: string
  meses: string[]
  apiKey: string
  fetchPage?: FetchPortalPage
  onMonth?: (mes: string, row: GastoExecutivoMensalColetado) => void
  onFiltroProvado?: (mes: string) => void
  portadorRule?: PortadorNamingRule
}

interface CliArgs {
  slug: string
  codigoOrgao: string
  orgaoNome: string
  dataInicio: string
  dataFim: string | null
  apply: boolean
  relatorio: string | null
}

const ORGAOS_EXECUTIVOS_POR_SLUG: Readonly<
  Record<string, { codigoOrgao: string; orgaoNome: string }>
> = Object.freeze({
  lula: {
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
  },
})

function validarMes(mes: string): { month: number; year: number } {
  const match = mes.match(/^(0[1-9]|1[0-2])\/(\d{4})$/)
  if (!match) throw new Error(`mês inválido: ${mes}; use MM/AAAA`)
  return { month: Number(match[1]), year: Number(match[2]) }
}

function dataDoMes(mes: string): string {
  const { month, year } = validarMes(mes)
  return `${year}-${String(month).padStart(2, "0")}-01`
}

export function urlDownloadCpgf(mes: string): string {
  const { month, year } = validarMes(mes)
  return `${PORTAL_CPGF_DOWNLOAD_BASE}/${year}${String(month).padStart(2, "0")}`
}

function normalizarCabecalhoCsv(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function valorDaColunaCsv(row: Record<string, string>, ...nomes: string[]): string {
  const wanted = new Set(nomes.map(normalizarCabecalhoCsv))
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(normalizarCabecalhoCsv(key))) return (value ?? "").trim()
  }
  return ""
}

function codigoDaLinha(row: PortalCartaoRow): string | null {
  return row.unidadeGestora?.orgaoVinculado?.codigoSIAFI?.trim() || null
}

function nomeDaLinha(row: PortalCartaoRow): string | null {
  return row.unidadeGestora?.orgaoVinculado?.nome?.trim() || null
}

function centavosDoValor(value: string | number | null | undefined): number {
  const raw = typeof value === "number" ? String(value) : value?.trim()
  if (!raw) throw new Error("valorTransacao vazio ou ausente")

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`valorTransacao inválido: ${raw}`)
  }
  const amount = Number(normalized)
  if (!Number.isFinite(amount)) throw new Error(`valorTransacao inválido: ${raw}`)
  return Math.round(amount * 100)
}

export function parseValorTransacao(value: string | number): number {
  return centavosDoValor(value) / 100
}

function tokenClassificado(nome: string, rule: PortadorNamingRule): boolean {
  const normalized = nome.trim().toLowerCase()
  return rule.classifiedTokens.some((token) => token.trim().toLowerCase() === normalized)
}

export function classificarCampoSigilo(
  nome: string | null | undefined,
  rule: PortadorNamingRule,
): ClassificacaoSigilo {
  const trimmed = nome?.trim() ?? ""
  if (!trimmed) return "ausente"
  if (tokenClassificado(trimmed, rule)) return "sigiloso"
  return "nominado"
}

export function nomePublicavelPortador(
  nome: string | null | undefined,
  rule: PortadorNamingRule,
): string | null {
  if (!rule.publishHolderNames) return null
  if (classificarCampoSigilo(nome, rule) !== "nominado") return null
  return nome?.trim() || null
}

function ugDaLinha(row: PortalCartaoRow, mes: string, pagina: number): { codigo: string; nome: string } {
  const codigo = row.unidadeGestora?.codigo?.trim()
  const nome = row.unidadeGestora?.nome?.trim()
  if (!codigo) {
    throw new Error(`${mes} página ${pagina}: transação sem código de unidade gestora`)
  }
  return { codigo, nome: nome || codigo }
}

type SigiloAcc = { sigiloso: number; nominado: number; ausente: number }

function contarSigilo(acc: SigiloAcc, classe: ClassificacaoSigilo): void {
  acc[classe] += 1
}

type UgAcc = {
  ug_codigo: string
  ug_nome: string
  orgao_nome: string
  centavos: number
  qtd: number
  portador: SigiloAcc
  estabelecimento: SigiloAcc
}

function montarUrlMes(codigoOrgao: string, mes: string, pagina: number): URL {
  const url = new URL(PORTAL_CARTOES_API)
  url.searchParams.set("codigoOrgao", codigoOrgao)
  url.searchParams.set("mesExtratoInicio", mes)
  url.searchParams.set("mesExtratoFim", mes)
  url.searchParams.set("pagina", String(pagina))
  return url
}

let proximaRequisicaoEm = 0

const sleepReal = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000]
const STATUS_TRANSITORIOS = new Set([403, 429, 502, 503, 504])

export async function fetchPortalPage(
  url: URL,
  apiKey: string,
  {
    fetchImpl = fetch,
    sleep = sleepReal,
    minIntervalMs = 500,
    maxAttempts = 6,
  }: FetchPortalOptions = {},
): Promise<PortalCartaoRow[]> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const esperaPacing = Math.max(0, proximaRequisicaoEm - Date.now())
    if (esperaPacing > 0) await sleep(esperaPacing)
    proximaRequisicaoEm = Date.now() + minIntervalMs

    const response = await fetchImpl(url, {
      headers: { "chave-api-dados": apiKey },
    })
    if (response.ok) {
      const payload: unknown = await response.json()
      if (!Array.isArray(payload)) {
        throw new Error("Portal da Transparência devolveu payload não tabular")
      }
      return payload as PortalCartaoRow[]
    }

    if (STATUS_TRANSITORIOS.has(response.status) && attempt < maxAttempts) {
      const retryAfter = Number(response.headers.get("retry-after"))
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : (RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1)!)
      await sleep(delay)
      continue
    }

    const detalhe = (await response.text())
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180)
    throw new Error(
      `Portal da Transparência respondeu HTTP ${response.status}` +
        (detalhe ? `: ${detalhe}` : ""),
    )
  }
  throw new Error("Portal da Transparência excedeu tentativas de retry")
}

function assinaturaPagina(rows: PortalCartaoRow[]): string {
  return rows.map((row) => String(row.id ?? "sem-id")).join(",")
}

export async function validarFiltroCodigoOrgao({
  codigoOrgao,
  mes,
  apiKey,
  fetchPage = fetchPortalPage,
}: ValidarFiltroArgs): Promise<void> {
  const urlValida = montarUrlMes(codigoOrgao, mes, 1)
  const urlIgnorada = new URL(PORTAL_CARTOES_API)
  urlIgnorada.searchParams.set("codigoOrgaoInexistente", codigoOrgao)
  urlIgnorada.searchParams.set("mesExtratoInicio", mes)
  urlIgnorada.searchParams.set("mesExtratoFim", mes)
  urlIgnorada.searchParams.set("pagina", "1")

  const filtradas = await fetchPage(urlValida, apiKey)
  const controleIgnorado = await fetchPage(urlIgnorada, apiKey)
  if (filtradas.length === 0) {
    throw new Error(`não foi possível provar codigoOrgao=${codigoOrgao}: ${mes} veio vazio`)
  }
  const codigosFiltrados = new Set(filtradas.map(codigoDaLinha))
  if (codigosFiltrados.size !== 1 || !codigosFiltrados.has(codigoOrgao)) {
    throw new Error(
      `codigoOrgao=${codigoOrgao} não restringiu a resposta ao órgão esperado`,
    )
  }

  if (controleIgnorado.length === 0) {
    throw new Error(
      "prova do filtro inconclusiva: a consulta de controle veio vazia, impossível distinguir filtro aceito de filtro ignorado",
    )
  }
  const controleTemOutroOrgao = controleIgnorado.some(
    (row) => codigoDaLinha(row) !== codigoOrgao,
  )
  if (
    !controleTemOutroOrgao &&
    assinaturaPagina(controleIgnorado) === assinaturaPagina(filtradas)
  ) {
    throw new Error(
      "prova do filtro inconclusiva: parâmetro válido e parâmetro inventado devolveram a mesma página",
    )
  }
}

export async function coletarMesCartoes({
  codigoOrgao,
  orgaoNome,
  mes,
  apiKey,
  fetchPage = fetchPortalPage,
  portadorRule,
}: ColetarMesArgs): Promise<GastoExecutivoMensalColetado> {
  validarMes(mes)
  const regra = portadorRule ?? FEDERAL_CPGF_PORTADOR_RULE
  const porUg = new Map<string, UgAcc>()
  let pagina = 1
  let nomeOrgaoObservado: string | null = null

  for (;;) {
    if (pagina > 10_000) {
      throw new Error(`${mes}: paginação excedeu o limite de segurança`)
    }
    const rows = await fetchPage(montarUrlMes(codigoOrgao, mes, pagina), apiKey)
    if (rows.length === 0) break

    for (const row of rows) {
      const codigoObservado = codigoDaLinha(row)
      if (codigoObservado !== codigoOrgao) {
        throw new Error(
          `${mes} página ${pagina}: órgão ${codigoObservado ?? "ausente"} fora do filtro ${codigoOrgao}`,
        )
      }
      if (row.mesExtrato !== mes) {
        throw new Error(
          `${mes} página ${pagina}: transação pertence a ${row.mesExtrato ?? "mês ausente"}`,
        )
      }
      const ug = ugDaLinha(row, mes, pagina)
      let acc = porUg.get(ug.codigo)
      if (!acc) {
        acc = {
          ug_codigo: ug.codigo,
          ug_nome: ug.nome,
          orgao_nome: nomeDaLinha(row) ?? orgaoNome,
          centavos: 0,
          qtd: 0,
          portador: { sigiloso: 0, nominado: 0, ausente: 0 },
          estabelecimento: { sigiloso: 0, nominado: 0, ausente: 0 },
        }
        porUg.set(ug.codigo, acc)
      }
      acc.centavos += centavosDoValor(row.valorTransacao)
      acc.qtd += 1
      contarSigilo(acc.portador, classificarCampoSigilo(row.portador?.nome, regra))
      contarSigilo(
        acc.estabelecimento,
        classificarCampoSigilo(row.estabelecimento?.nome, regra),
      )
      nomeOrgaoObservado ??= nomeDaLinha(row)
    }
    pagina += 1
  }

  const unidades: GastoExecutivoUgColetado[] = [...porUg.values()]
    .sort((a, b) => b.centavos - a.centavos || a.ug_codigo.localeCompare(b.ug_codigo))
    .map((acc) => {
      if (acc.centavos < 0) {
        throw new Error(
          `${mes} UG ${acc.ug_codigo}: soma negativa (${acc.centavos / 100}), estornos excedem gastos; tratar manualmente`,
        )
      }
      return {
        orgao_codigo: codigoOrgao,
        orgao_nome: acc.orgao_nome,
        ug_codigo: acc.ug_codigo,
        ug_nome: acc.ug_nome,
        mes_extrato: dataDoMes(mes),
        valor_total: acc.centavos / 100,
        qtd_transacoes: acc.qtd,
        qtd_portador_sigiloso: acc.portador.sigiloso,
        qtd_portador_nominado: acc.portador.nominado,
        qtd_portador_ausente: acc.portador.ausente,
        qtd_estabelecimento_sigiloso: acc.estabelecimento.sigiloso,
        qtd_estabelecimento_nominado: acc.estabelecimento.nominado,
        qtd_estabelecimento_ausente: acc.estabelecimento.ausente,
      }
    })

  const totalCentavos = [...porUg.values()].reduce((sum, acc) => sum + acc.centavos, 0)
  const quantidade = [...porUg.values()].reduce((sum, acc) => sum + acc.qtd, 0)
  if (totalCentavos < 0) {
    throw new Error(
      `${mes}: soma negativa (${totalCentavos / 100}), estornos excedem gastos; tratar manualmente`,
    )
  }
  return {
    orgao_codigo: codigoOrgao,
    orgao_nome: nomeOrgaoObservado ?? orgaoNome,
    mes_extrato: dataDoMes(mes),
    valor_total: totalCentavos / 100,
    qtd_transacoes: quantidade,
    unidades,
  }
}

function mesVazioCsv(
  codigoOrgao: string,
  orgaoNome: string,
  mes: string,
  csvPresente: boolean,
): GastoExecutivoCsvMes {
  return {
    orgao_codigo: codigoOrgao,
    orgao_nome: orgaoNome,
    mes_extrato: dataDoMes(mes),
    valor_total: 0,
    qtd_transacoes: 0,
    unidades: [],
    csvPresente,
  }
}

function unidadesDoAcc(
  porUg: Map<string, UgAcc>,
  codigoOrgao: string,
  mes: string,
): GastoExecutivoUgColetado[] {
  return [...porUg.values()]
    .sort((a, b) => b.centavos - a.centavos || a.ug_codigo.localeCompare(b.ug_codigo))
    .map((acc) => {
      if (acc.centavos < 0) {
        throw new Error(
          `${mes} UG ${acc.ug_codigo}: soma negativa (${acc.centavos / 100}), estornos excedem gastos; tratar manualmente`,
        )
      }
      return {
        orgao_codigo: codigoOrgao,
        orgao_nome: acc.orgao_nome,
        ug_codigo: acc.ug_codigo,
        ug_nome: acc.ug_nome,
        mes_extrato: dataDoMes(mes),
        valor_total: acc.centavos / 100,
        qtd_transacoes: acc.qtd,
        qtd_portador_sigiloso: acc.portador.sigiloso,
        qtd_portador_nominado: acc.portador.nominado,
        qtd_portador_ausente: acc.portador.ausente,
        qtd_estabelecimento_sigiloso: acc.estabelecimento.sigiloso,
        qtd_estabelecimento_nominado: acc.estabelecimento.nominado,
        qtd_estabelecimento_ausente: acc.estabelecimento.ausente,
      }
    })
}

export function agregarMesCsvCpgf({
  codigoOrgao,
  orgaoNome,
  mes,
  csv,
  portadorRule,
}: {
  codigoOrgao: string
  orgaoNome: string
  mes: string
  csv: string
  portadorRule?: PortadorNamingRule
}): GastoExecutivoCsvMes {
  validarMes(mes)
  const regra = portadorRule ?? FEDERAL_CPGF_PORTADOR_RULE
  if (!csv.trim()) return mesVazioCsv(codigoOrgao, orgaoNome, mes, false)

  const linhas = parseCsvSync(csv, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
    trim: true,
  }) as Record<string, string>[]

  const { month, year } = validarMes(mes)
  const porUg = new Map<string, UgAcc>()
  let nomeOrgaoObservado: string | null = null

  for (const linha of linhas) {
    const codigoObservado = valorDaColunaCsv(linha, "CÓDIGO ÓRGÃO", "CODIGO ORGAO")
    if (codigoObservado !== codigoOrgao) continue
    const ano = Number(valorDaColunaCsv(linha, "ANO EXTRATO"))
    const mesLinha = Number(valorDaColunaCsv(linha, "MÊS EXTRATO", "MES EXTRATO"))
    if (ano !== year || mesLinha !== month) continue

    const ugCodigo = valorDaColunaCsv(linha, "CÓDIGO UNIDADE GESTORA", "CODIGO UNIDADE GESTORA")
    if (!ugCodigo) {
      throw new Error(`${mes}: transação do CSV sem código de unidade gestora`)
    }
    const ugNome = valorDaColunaCsv(linha, "NOME UNIDADE GESTORA") || ugCodigo
    const nomeOrgao = valorDaColunaCsv(linha, "NOME ÓRGÃO", "NOME ORGAO") || orgaoNome
    let acc = porUg.get(ugCodigo)
    if (!acc) {
      acc = {
        ug_codigo: ugCodigo,
        ug_nome: ugNome,
        orgao_nome: nomeOrgao,
        centavos: 0,
        qtd: 0,
        portador: { sigiloso: 0, nominado: 0, ausente: 0 },
        estabelecimento: { sigiloso: 0, nominado: 0, ausente: 0 },
      }
      porUg.set(ugCodigo, acc)
    }
    acc.centavos += centavosDoValor(valorDaColunaCsv(linha, "VALOR TRANSAÇÃO", "VALOR TRANSACAO"))
    acc.qtd += 1
    contarSigilo(acc.portador, classificarCampoSigilo(valorDaColunaCsv(linha, "NOME PORTADOR"), regra))
    contarSigilo(
      acc.estabelecimento,
      classificarCampoSigilo(valorDaColunaCsv(linha, "NOME FAVORECIDO", "NOME ESTABELECIMENTO"), regra),
    )
    nomeOrgaoObservado ??= nomeOrgao
  }

  const unidades = unidadesDoAcc(porUg, codigoOrgao, mes)
  const totalCentavos = [...porUg.values()].reduce((sum, acc) => sum + acc.centavos, 0)
  const quantidade = [...porUg.values()].reduce((sum, acc) => sum + acc.qtd, 0)
  return {
    orgao_codigo: codigoOrgao,
    orgao_nome: nomeOrgaoObservado ?? orgaoNome,
    mes_extrato: dataDoMes(mes),
    valor_total: totalCentavos / 100,
    qtd_transacoes: quantidade,
    unidades,
    csvPresente: true,
  }
}

function mapaQtdPorUg(mes: GastoExecutivoMensalColetado): Map<string, number> {
  return new Map(mes.unidades.map((ug) => [ug.ug_codigo, ug.qtd_transacoes]))
}

function graoUgIgual(api: GastoExecutivoMensalColetado, csv: GastoExecutivoMensalColetado): boolean {
  const apiQtd = mapaQtdPorUg(api)
  const csvQtd = mapaQtdPorUg(csv)
  if (apiQtd.size !== csvQtd.size) return false
  for (const [codigo, qtd] of apiQtd) {
    if (csvQtd.get(codigo) !== qtd) return false
  }
  return true
}

function mesSemFlagCsv(csv: GastoExecutivoCsvMes): GastoExecutivoMensalColetado {
  return {
    orgao_codigo: csv.orgao_codigo,
    orgao_nome: csv.orgao_nome,
    mes_extrato: csv.mes_extrato,
    valor_total: csv.valor_total,
    qtd_transacoes: csv.qtd_transacoes,
    unidades: csv.unidades,
  }
}

export function reconciliarMesCartoesCsv({
  api,
  csv,
  fonteCsv,
}: {
  api: GastoExecutivoMensalColetado
  csv: GastoExecutivoCsvMes
  fonteCsv: string
}): MesReconciliado {
  const deltaReais = Number((csv.valor_total - api.valor_total).toFixed(2))
  if (!csv.csvPresente) {
    return {
      persistivel: false,
      motivo: "csv_ausente",
      valorCorrigidoPeloCsv: false,
      deltaReais,
      fonte: fonteCsv,
      mes: null,
    }
  }
  if (!graoUgIgual(api, csv)) {
    return {
      persistivel: false,
      motivo: "grao_diverge",
      valorCorrigidoPeloCsv: false,
      deltaReais,
      fonte: fonteCsv,
      mes: null,
    }
  }
  const valorCorrigidoPeloCsv = Number(csv.valor_total.toFixed(2)) !== Number(api.valor_total.toFixed(2))
  return {
    persistivel: true,
    motivo: valorCorrigidoPeloCsv ? "valor_csv" : "conferido",
    valorCorrigidoPeloCsv,
    deltaReais,
    fonte: fonteCsv,
    mes: mesSemFlagCsv(csv),
  }
}

export function mesesPersistiveis(recs: MesReconciliado[]): GastoExecutivoMensalColetado[] {
  return recs.flatMap((rec) => (rec.persistivel && rec.mes ? [rec.mes] : []))
}

export function assertSerieAplicavel(recs: MesReconciliado[]): void {
  const divergente = recs.find((rec) => rec.motivo === "grao_diverge")
  if (!divergente) return
  throw new Error(
    "grão do CSV diverge da API de cartões (contagem ou unidade gestora); apply abortado",
  )
}

export function extrairCsvDoZipCpgf(buffer: Buffer, mes: string): string {
  if (buffer.subarray(0, 2).toString() !== "PK") {
    return buffer.toString("latin1")
  }
  const dir = mkdtempSync(join(tmpdir(), "cpgf-"))
  const zip = join(dir, "cpgf.zip")
  writeFileSync(zip, buffer)
  try {
    const { month, year } = validarMes(mes)
    const nome = `${year}${String(month).padStart(2, "0")}_CPGF.csv`
    try {
      return execFileSync("unzip", ["-p", zip, nome], {
        encoding: "latin1",
        maxBuffer: 64 * 1024 * 1024,
      })
    } catch {
      return execFileSync("unzip", ["-p", zip], {
        encoding: "latin1",
        maxBuffer: 64 * 1024 * 1024,
      })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export async function baixarCsvCpgf(
  mes: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = urlDownloadCpgf(mes)
  const response = await fetchImpl(url)
  if (response.status === 404) throw new CsvCpgfAusenteError(url)
  if (!response.ok) {
    throw new Error(`download oficial do CPGF HTTP ${response.status}: ${url}`)
  }
  return extrairCsvDoZipCpgf(Buffer.from(await response.arrayBuffer()), mes)
}

export async function coletarSerieCartoes({
  codigoOrgao,
  orgaoNome,
  meses,
  apiKey,
  fetchPage = fetchPortalPage,
  onMonth,
  onFiltroProvado,
  portadorRule,
}: ColetarSerieArgs): Promise<GastoExecutivoMensalColetado[]> {
  let filtroProvado = false
  const serie: GastoExecutivoMensalColetado[] = []

  for (const mes of meses) {
    const row = await coletarMesCartoes({
      codigoOrgao,
      orgaoNome,
      mes,
      apiKey,
      fetchPage,
      portadorRule,
    })
    if (!filtroProvado && row.qtd_transacoes > 0) {
      await validarFiltroCodigoOrgao({ codigoOrgao, mes, apiKey, fetchPage })
      filtroProvado = true
      onFiltroProvado?.(mes)
    }
    serie.push(row)
    onMonth?.(mes, row)
  }

  if (!filtroProvado) {
    throw new Error(
      `não foi possível provar codigoOrgao=${codigoOrgao}: toda a janela consultada veio vazia`,
    )
  }
  return serie
}

export function listarMeses(
  dataInicio: string,
  hoje = new Date(),
  dataFim?: string | null,
): string[] {
  const inicio = validarMes(dataInicio)
  // O fim da janela é o mês corrente EM BRASÍLIA, não no fuso da máquina:
  // um runner UTC na virada do mês geraria lista diferente da do operador.
  const brasilia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(hoje)
  const [fimAno, fimMes] = brasilia.split("-").map(Number)
  const corrente = { month: fimMes, year: fimAno }
  const fim = dataFim ? validarMes(dataFim) : corrente
  const startIndex = inicio.year * 12 + inicio.month - 1
  const endIndex = fim.year * 12 + fim.month - 1
  const correnteIndex = corrente.year * 12 + corrente.month - 1
  if (endIndex > correnteIndex) throw new Error("data-fim está depois do mês corrente")
  if (startIndex > endIndex) throw new Error("data-fim está antes de data-inicio")

  return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => {
    const index = startIndex + offset
    const year = Math.floor(index / 12)
    const month = (index % 12) + 1
    return `${String(month).padStart(2, "0")}/${year}`
  })
}

export function parseArgs(argv: string[]): CliArgs {
  if (argv.includes("--apply") && argv.includes("--dry-run")) {
    throw new Error("use --apply ou --dry-run, nunca os dois")
  }
  const known = new Set([
    "--apply",
    "--dry-run",
    "--slug",
    "--codigo-orgao",
    "--data-inicio",
    "--data-fim",
    "--relatorio",
  ])
  for (const arg of argv) {
    const key = arg.split("=", 1)[0]
    if (!known.has(key)) throw new Error(`argumento desconhecido: ${arg}`)
  }
  const flag = (name: string, fallback: string) =>
    argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) || fallback

  const slug = flag("--slug", "lula")
  const codigoOrgao = flag("--codigo-orgao", "20101")
  const vinculo = ORGAOS_EXECUTIVOS_POR_SLUG[slug]
  if (!vinculo) {
    throw new Error(`slug ${slug} não tem vínculo de órgão executivo registrado neste ingest`)
  }
  if (codigoOrgao !== vinculo.codigoOrgao) {
    throw new Error(
      `órgão ${codigoOrgao} não pertence ao vínculo registrado para ${slug}; esperado ${vinculo.codigoOrgao}`,
    )
  }
  const parsed = {
    slug,
    codigoOrgao,
    orgaoNome: vinculo.orgaoNome,
    dataInicio: flag("--data-inicio", "01/2023"),
    dataFim: argv.find((arg) => arg.startsWith("--data-fim="))?.slice("--data-fim=".length) || null,
    apply: argv.includes("--apply"),
    relatorio: argv.find((arg) => arg.startsWith("--relatorio="))?.slice("--relatorio=".length) || null,
  }
  if (!/^\d+$/.test(parsed.codigoOrgao)) throw new Error("codigo-orgao deve conter só dígitos")
  validarMes(parsed.dataInicio)
  if (parsed.dataFim) {
    validarMes(parsed.dataFim)
    listarMeses(parsed.dataInicio, new Date(), parsed.dataFim)
  }
  return parsed
}

function loadEnvLocal(): void {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file)
  }
}

async function main(): Promise<void> {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))
  const apiKey = process.env.TRANSPARENCIA_API_KEY
  if (!apiKey) throw new Error("TRANSPARENCIA_API_KEY ausente")

  const meses = listarMeses(args.dataInicio, new Date(), args.dataFim)
  const serieApi = await coletarSerieCartoes({
    codigoOrgao: args.codigoOrgao,
    orgaoNome: args.orgaoNome,
    meses,
    apiKey,
    onFiltroProvado: (mes) => console.log(
      `Filtro codigoOrgao=${args.codigoOrgao} provado contra parâmetro inventado em ${mes}.`,
    ),
    onMonth: (mes, row) => {
      console.log(
        `${mes} API: ${row.qtd_transacoes} transação(ões), R$ ${row.valor_total.toFixed(2)} no órgão ${args.codigoOrgao}`,
      )
    },
  })

  const reconciliados: MesReconciliado[] = []
  for (let i = 0; i < meses.length; i += 1) {
    const mes = meses[i]
    const api = serieApi[i]
    let csvTexto = ""
    try {
      csvTexto = await baixarCsvCpgf(mes)
    } catch (error) {
      if (!(error instanceof CsvCpgfAusenteError)) throw error
      console.log(`${mes}: download oficial do CPGF ausente; mês não entra na persistência.`)
    }
    const csv = agregarMesCsvCpgf({
      codigoOrgao: args.codigoOrgao,
      orgaoNome: args.orgaoNome,
      mes,
      csv: csvTexto,
    })
    const rec = reconciliarMesCartoesCsv({
      api,
      csv,
      fonteCsv: urlDownloadCpgf(mes),
    })
    reconciliados.push(rec)
    console.log(
      `${mes} CSV: ${csv.qtd_transacoes} transação(ões), R$ ${csv.valor_total.toFixed(2)}` +
        ` | ${rec.motivo}` +
        (rec.valorCorrigidoPeloCsv ? ` | delta API ${rec.deltaReais.toFixed(2)}` : ""),
    )
    if (rec.mes) {
      for (const ug of rec.mes.unidades) {
        console.log(
          `  UG ${ug.ug_codigo} ${ug.ug_nome}: ${ug.qtd_transacoes} tx, R$ ${ug.valor_total.toFixed(2)}` +
            ` | portador sigiloso ${ug.qtd_portador_sigiloso}/${ug.qtd_transacoes}` +
            ` | estabelecimento sigiloso ${ug.qtd_estabelecimento_sigiloso}/${ug.qtd_transacoes}`,
        )
      }
    }
  }

  if (args.apply) assertSerieAplicavel(reconciliados)
  const serie = mesesPersistiveis(reconciliados)
  const total = serie.reduce((sum, row) => sum + row.valor_total, 0)
  const transacoes = serie.reduce((sum, row) => sum + row.qtd_transacoes, 0)
  const ugs = serie.reduce((sum, row) => sum + row.unidades.length, 0)
  console.log(
    `${args.apply ? "Apply" : "Dry-run"}: ${serie.length} mês(es) persistível(is), ${ugs} linha(s) de UG, ${transacoes} transação(ões), ` +
      `R$ ${total.toFixed(2)} no total (valor do download oficial do CPGF).`,
  )
  for (const mes of serie) {
    const somaUgs = mes.unidades.reduce((sum, ug) => sum + ug.valor_total, 0)
    if (Number(somaUgs.toFixed(2)) !== Number(mes.valor_total.toFixed(2))) {
      throw new Error(
        `${mes.mes_extrato}: soma das UGs (R$ ${somaUgs.toFixed(2)}) diverge do órgão (R$ ${mes.valor_total.toFixed(2)})`,
      )
    }
  }
  if (args.relatorio) {
    mkdirSync(dirname(args.relatorio), { recursive: true })
    writeFileSync(
      args.relatorio,
      JSON.stringify(
        {
          apply: args.apply,
          slug: args.slug,
          codigoOrgao: args.codigoOrgao,
          orgaoNome: args.orgaoNome,
          dataInicio: args.dataInicio,
          dataFim: args.dataFim,
          fonte_valor: "download oficial do CPGF",
          fonte_api: PORTAL_CARTOES_FONTE,
          meses: reconciliados.map((rec, index) => ({
            mes: meses[index],
            persistivel: rec.persistivel,
            motivo: rec.motivo,
            fonte: rec.fonte,
            valorCorrigidoPeloCsv: rec.valorCorrigidoPeloCsv,
            deltaReais: rec.deltaReais,
            api: serieApi[index]
              ? {
                  orgao_valor_total: serieApi[index].valor_total,
                  orgao_qtd_transacoes: serieApi[index].qtd_transacoes,
                }
              : null,
            persistido: rec.mes
              ? {
                  orgao_valor_total: rec.mes.valor_total,
                  orgao_qtd_transacoes: rec.mes.qtd_transacoes,
                  soma_ugs: rec.mes.unidades.reduce((sum, ug) => sum + ug.valor_total, 0),
                  unidades: rec.mes.unidades,
                }
              : null,
          })),
        },
        null,
        2,
      ),
    )
    console.log(`Relatório gravado em ${args.relatorio}.`)
  }
  if (!args.apply) {
    console.log("Nenhuma escrita foi executada. Use --apply somente na integração autorizada.")
    return
  }

  const { data: candidato, error: candidatoError } = await supabase
    .from("candidatos")
    .select("id, slug")
    .eq("slug", args.slug)
    .single()
  if (candidatoError || !candidato) {
    throw new Error(`${args.slug}: candidato não encontrado: ${candidatoError?.message ?? "sem linha"}`)
  }

  const coletadoEm = new Date().toISOString()
  const payload = reconciliados.flatMap((rec) => {
    if (!rec.persistivel || !rec.mes) return []
    return rec.mes.unidades.map((ug) => ({
      candidato_id: candidato.id,
      orgao_codigo: ug.orgao_codigo,
      orgao_nome: ug.orgao_nome,
      ug_codigo: ug.ug_codigo,
      ug_nome: ug.ug_nome,
      mes_extrato: ug.mes_extrato,
      valor_total: ug.valor_total,
      qtd_transacoes: ug.qtd_transacoes,
      qtd_portador_sigiloso: ug.qtd_portador_sigiloso,
      qtd_portador_nominado: ug.qtd_portador_nominado,
      qtd_portador_ausente: ug.qtd_portador_ausente,
      qtd_estabelecimento_sigiloso: ug.qtd_estabelecimento_sigiloso,
      qtd_estabelecimento_nominado: ug.qtd_estabelecimento_nominado,
      qtd_estabelecimento_ausente: ug.qtd_estabelecimento_ausente,
      fonte: rec.fonte,
      coletado_em: coletadoEm,
    }))
  })
  const linhas = await escreverAuditado(
    {
      script: "ingest-gastos-executivo",
      tabela: "gastos_executivo",
      motivo: "materializa totais mensais por UG do download oficial do CPGF, conferidos com a API de cartões; o gasto pertence ao órgão, não à pessoa",
      recorte: `${args.slug}, órgão ${args.codigoOrgao}, ${meses[0]} a ${meses.at(-1)}`,
    },
    async () => {
      const limpeza = await supabase
        .from("gastos_executivo")
        .delete()
        .eq("candidato_id", candidato.id)
        .eq("orgao_codigo", args.codigoOrgao)
        .select("id")
      if (limpeza.error) return limpeza
      if (payload.length === 0) return { data: [], error: null }
      const resposta = await supabase
        .from("gastos_executivo")
        .upsert(payload, {
          onConflict: "candidato_id,orgao_codigo,ug_codigo,mes_extrato",
        })
        .select("id")
      if (!resposta.error && (resposta.data?.length ?? 0) !== payload.length) {
        throw new Error(
          `upsert tocou ${resposta.data?.length ?? 0} linha(s), esperado ${payload.length}`,
        )
      }
      return resposta
    },
  )
  console.log(`Apply concluído: ${linhas.length} linha(s) materializada(s) com trilha auditada.`)
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
