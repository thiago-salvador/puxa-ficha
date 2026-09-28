import { supabase } from "./supabase"
import { createHash } from "node:crypto"
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { assertSemReplacementChar } from "./ceaps-csv-encoding"
import { decodeCeapsCsv, normalizeCeapsCsvAmount, parseCeapsCsvRecords } from "./ceaps-csv-encoding"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { normalizeForMatch } from "./helpers"
import { emDryRun, planejarEscrita, ativarDryRun } from "./dry-run"
import { log, error } from "./logger"
import { escreverAuditado } from "./escrita-auditada"
import { decidirChaveOcupada, lerLinhaNaChave } from "./gastos-chave-anual"
import { parseSenadoLegislatureRoster, senadoExpenseLegislatureForYear, senadoLegislatureRosterUrl, SENADO_EXPENSE_LEGISLATURES, type SenadoLegislatureRoster } from "./senado-legislature-roster"
import { getExplicitCohort } from "./cohort-context"
import type { IngestResult } from "./types"

const BASE_URL = "https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps"
const ANOS = Array.from({ length: 19 }, (_, index) => 2008 + index)
const JEV_SCRIPT = resolve(process.env.HOME ?? "", ".claude/scripts/jev.py")
const JEV_SCRIPT_SHA256_PIN = "ae19a9a053c970b8bd82cbf47ce102b454b1168d35c089edf738e9bf367fd46d"
const JEV_QUESTIONS = resolve(process.cwd(), "scripts/data/ceaps-senado-identity-questions.json")
const JEV_LOG_DIR = resolve(process.env.HOME ?? "", "Library/Logs/puxa-ficha/jev")
const JEV_SHADOW_PATH = resolve(JEV_LOG_DIR, "ceaps-senado.jsonl")
const JEV_REVIEW_PATH = resolve(JEV_LOG_DIR, "ceaps-senado-review.jsonl")

export type CeapsLegacyReconciliation = "confirmed" | "absent" | "review"

export function classifyCeapsCandidateScope(years: readonly number[]): "verifiable" | "indeterminate" {
  return years.length > 0 ? "verifiable" : "indeterminate"
}

export function isKnownSenateCeapsSource(source: string | null | undefined): boolean {
  return source === "Senado" || source === "CEAPS/Senado" || source === "Senado CEAPS"
}

export function isHistoricalSenateCeapsAlias(source: string | null | undefined): boolean {
  return source === "CEAPS/Senado" || source === "Senado CEAPS"
}

export function historicalCeapsTotalMatches(source: string | null | undefined, stored: number | null, official: number): boolean {
  return !isHistoricalSenateCeapsAlias(source) || Number(stored) === official
}

function categorySignature(value: unknown): string | null {
  let entries: Array<{ categoria: string; valor: number }> = []
  if (Array.isArray(value)) {
    entries = value.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const row = item as Record<string, unknown>
      const categoria = String(row.categoria ?? "").trim().toUpperCase()
      const valor = Number(row.valor)
      return categoria && Number.isFinite(valor) ? [{ categoria, valor }] : []
    })
  } else if (value && typeof value === "object") {
    entries = Object.entries(value as Record<string, unknown>).flatMap(([categoria, rawValue]) => {
      const valor = Number(rawValue)
      return categoria.trim() && Number.isFinite(valor) ? [{ categoria: categoria.trim().toUpperCase(), valor }] : []
    })
  }
  if (entries.length === 0) return null
  const centsByCategory = new Map<string, number>()
  for (const { categoria, valor } of entries) centsByCategory.set(categoria, (centsByCategory.get(categoria) ?? 0) + Math.round(valor * 100))
  return JSON.stringify([...centsByCategory].sort(([a], [b]) => a.localeCompare(b)))
}

export function legacyExpenseCategorySignatureMatches(stored: unknown, official: unknown): boolean {
  const storedSignature = categorySignature(stored)
  return storedSignature != null && storedSignature === categorySignature(official)
}

export function classifyCeapsAnnualRows<T extends { fonte?: string | null }>(rows: readonly T[]): {
  senateRows: T[]
  legacyRows: T[]
  unrelatedRows: T[]
  ambiguous: boolean
  insertAlongsideUnrelated: boolean
  target?: T
} {
  const senateRows = rows.filter((row) => isKnownSenateCeapsSource(row.fonte))
  const legacyRows = rows.filter((row) => row.fonte == null || row.fonte.trim() === "")
  const unrelatedRows = rows.filter((row) => !isKnownSenateCeapsSource(row.fonte) && row.fonte != null && row.fonte.trim() !== "")
  const ambiguous = senateRows.length > 1 || legacyRows.length > 1 || (senateRows.length > 0 && legacyRows.length > 0)
  const target = ambiguous ? undefined : senateRows[0] ?? legacyRows[0]
  return { senateRows, legacyRows, unrelatedRows, ambiguous, target, insertAlongsideUnrelated: !ambiguous && target == null && unrelatedRows.length > 0 }
}

export function ceapsProcessingYears(candidateYears: readonly number[], existingRows: readonly { ano: number | null; fonte?: string | null; despublicado_em?: string | null }[]): number[] {
  const years = new Set(candidateYears)
  for (const row of existingRows) {
    if (row.despublicado_em == null && isKnownSenateCeapsSource(row.fonte) && row.ano != null && ANOS.includes(Number(row.ano))) years.add(Number(row.ano))
  }
  return [...years].sort((a, b) => a - b)
}

export function senateNameMatchesHistoricalRoster(sourceName: string, officialId: string, rosterNames: readonly ReadonlyMap<string, string>[]): boolean {
  const normalizedSource = normalizeForMatch(sourceName)
  return normalizedSource !== "" && rosterNames.some((names) => normalizeForMatch(names.get(officialId) ?? "") === normalizedSource)
}

/** Limite mínimo do Jev `mesma_pessoa` para aceitar um alias CEAPS (a regra de código também precisa aceitar). */
export const CEAPS_ALIAS_JEV_MIN_P = 0.8

function nameTokens(name: string): string[] {
  return normalizeForMatch(name).split(" ").filter(Boolean)
}

function startsWithTokens(tokens: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length > 0 && prefix.length <= tokens.length && prefix.every((token, index) => tokens[index] === token)
}

function tokensInOrder(tokens: readonly string[], container: readonly string[]): boolean {
  let cursor = 0
  for (const token of container) if (cursor < tokens.length && tokens[cursor] === token) cursor++
  return cursor === tokens.length
}

/**
 * Alias único de um parlamentar no CSV CEAPS de um ano. Um nome do CSV só vale
 * quando começa pelos tokens do NomeParlamentar oficial, tem todos os tokens
 * contidos, em ordem, no nome completo do cadastro, é o único nome do ano com
 * essa forma e nenhum outro parlamentar do roster do ano disputa esse nome.
 * Qualquer ambiguidade devolve null e o par fica em revisão.
 */
export function ceapsUniqueAliasName(input: {
  officialName: string
  nomeCompleto: string
  yearNames: readonly string[]
  otherOfficialNames: readonly string[]
}): string | null {
  const official = nameTokens(input.officialName)
  const full = nameTokens(input.nomeCompleto)
  if (official.length === 0 || full.length === 0) return null
  const candidates = new Map<string, string>()
  for (const name of input.yearNames) {
    const tokens = nameTokens(name)
    if (tokens.length <= official.length || !startsWithTokens(tokens, official) || !tokensInOrder(tokens, full)) continue
    candidates.set(tokens.join(" "), name)
  }
  if (candidates.size !== 1) return null
  const [[normalizedAlias, alias]] = [...candidates]
  const aliasTokens = normalizedAlias.split(" ")
  const contested = input.otherOfficialNames.some((other) => {
    const otherTokens = nameTokens(other)
    return otherTokens.length > 0 && startsWithTokens(aliasTokens, otherTokens)
  })
  return contested ? null : alias
}

type ExistingSenateExpense = { id: string; ano: number | null; fonte: string; despublicado_em: string | null; total_gasto: number | null }

async function loadPublishedSenateExpenseRows(candidatoId: string): Promise<ExistingSenateExpense[]> {
  const pageSize = 500
  const safetyLimit = 5000
  const rows: ExistingSenateExpense[] = []
  let expectedCount: number | null = null
  for (let offset = 0; offset <= safetyLimit; offset += pageSize) {
    const { data, error: queryError, count } = await supabase.from("gastos_parlamentares")
      .select("id,ano,fonte,despublicado_em,total_gasto", { count: "exact" })
      .eq("candidato_id", candidatoId).in("fonte", ["Senado", "CEAPS/Senado", "Senado CEAPS"])
      .is("despublicado_em", null).order("id", { ascending: true }).range(offset, offset + pageSize - 1)
    if (queryError) throw new Error(`gastos_parlamentares: falha ao ler proveniências Senado existentes: ${queryError.message}`)
    if (count == null) throw new Error("gastos_parlamentares: leitura de proveniências Senado sem contagem exata")
    expectedCount ??= count
    if (count !== expectedCount) throw new Error("gastos_parlamentares: conjunto de proveniências Senado mudou durante a paginação")
    const page = (data ?? []) as ExistingSenateExpense[]
    rows.push(...page)
    if (rows.length === expectedCount) return rows
    if (page.length < pageSize) throw new Error("gastos_parlamentares: leitura de proveniências Senado truncada")
    if (offset >= safetyLimit) throw new Error("gastos_parlamentares: proveniências Senado excedem limite seguro de leitura")
  }
  return rows
}

export function classifyCeapsLegacyRow(input: {
  sourceRows: number
  annualCsvComplete: boolean
  rosterMembershipVerified: boolean
  noCompetingHouseIdentity: boolean
  senateProvenanceVerified?: boolean
}): CeapsLegacyReconciliation {
  if (!input.annualCsvComplete) return "review"
  if (input.sourceRows > 0) return "confirmed"
  if (input.senateProvenanceVerified) return "absent"
  if (!input.rosterMembershipVerified) return "review"
  // A null Câmara ID is not evidence that a legacy row belongs to the Senate.
  // Only a row with positive Senate provenance may be tombstoned on a miss.
  return "review"
}

export function ceapsNamesForSenator(officialId: string, rosterNames: readonly ReadonlyMap<string, string>[]): string[] {
  return [...new Set(rosterNames.map((names) => names.get(officialId)?.trim()).filter((name): name is string => Boolean(name)))]
}

export function withinCeapsUnpublishCaps(input: { candidateUnpublishes: number; runUnpublishes: number; candidateScopeYears: number }): boolean {
  return input.candidateUnpublishes <= 1 && input.runUnpublishes < 100
    && input.candidateUnpublishes <= Math.floor(input.candidateScopeYears * 0.1)
}

export function ceapsReceiptOutcome(input: { scopeIndeterminate: boolean; hasErrors: boolean; sourceRows: number; rowsUpserted: number }): "indeterminado" | "erro" | "encontrado" | "vazio_confirmado" {
  if (input.scopeIndeterminate) return "indeterminado"
  if (input.hasErrors) return input.rowsUpserted > 0 && input.sourceRows > 0 ? "encontrado" : "erro"
  return input.sourceRows > 0 ? "encontrado" : "vazio_confirmado"
}

interface CeapsCsvRow {
  ANO: string
  MES: string
  SENADOR: string
  TIPO_DESPESA: string
  FORNECEDOR: string
  DATA: string
  VALOR_REEMBOLSADO: string
}

interface CeapsSnapshot {
  ano: number
  url: string
  sha256: string
  rows: CeapsCsvRow[]
}

export function parseCeapsCsv(buffer: Buffer, expectedYear: number): CeapsCsvRow[] {
  const { header, rows: records } = parseCeapsCsvRecords(decodeCeapsCsv(buffer))
  const required = ["ANO", "MES", "SENADOR", "TIPO_DESPESA", "FORNECEDOR", "DATA", "VALOR_REEMBOLSADO"]
  if (required.some((column) => !header.includes(column))) {
    throw new Error(`CSV CEAPS ${expectedYear}: esquema incompleto (${header.filter((h) => h !== "CNPJ_CPF").join(",")})`)
  }
  const rows: CeapsCsvRow[] = []
  for (const [index, raw] of records.entries()) {
    const year = Number(raw.ANO)
    if (!Number.isInteger(year) || year !== expectedYear) {
      throw new Error(`CSV CEAPS ${expectedYear}: registro ${index + 1} informa ano inválido`)
    }
    // O SHA-256 da fonte permanece sobre os bytes originais no snapshot.
    const amount = normalizeCeapsCsvAmount(raw.VALOR_REEMBOLSADO)
    if (!raw.SENADOR?.trim() || parseValorOficial(amount) === null) {
      throw new Error(`CSV CEAPS ${expectedYear}: registro ${index + 1} tem campos obrigatórios inválidos`)
    }
    // CNPJ_CPF, documento e detalhamento são deliberadamente descartados.
    rows.push({
      ANO: String(year), MES: raw.MES, SENADOR: raw.SENADOR,
      TIPO_DESPESA: raw.TIPO_DESPESA, FORNECEDOR: raw.FORNECEDOR,
      DATA: raw.DATA, VALOR_REEMBOLSADO: amount,
    })
  }
  if (rows.length === 0) throw new Error(`CSV CEAPS ${expectedYear}: arquivo sem linhas, cobertura não confirmada`)
  return rows
}

export async function fetchCeapsSnapshot(ano: number): Promise<CeapsSnapshot> {
  const url = `${BASE_URL}_${ano}.csv`
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: "text/csv, application/octet-stream", "User-Agent": "PuxaFicha/1.0 (+https://puxaficha.com.br)" }, signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status} para CSV CEAPS ${ano}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      const declaredLength = Number(response.headers.get("content-length"))
      if (response.headers.get("content-encoding") == null && Number.isFinite(declaredLength) && declaredLength > 0 && declaredLength !== bytes.length) throw new Error(`CSV CEAPS ${ano}: Content-Length divergente (${bytes.length}/${declaredLength})`)
      const rows = parseCeapsCsv(bytes, ano)
      return { ano, url, sha256: createHash("sha256").update(bytes).digest("hex"), rows }
    } catch (err) {
      lastError = err
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1500))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`falha ao obter CSV CEAPS ${ano}`)
}

function senatorNamesForSnapshot(snapshots: CeapsSnapshot[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const snapshot of snapshots) for (const row of snapshot.rows) {
    const normalized = normalizeForMatch(row.SENADOR)
    if (normalized && !names.has(normalized)) names.set(normalized, row.SENADOR)
  }
  return names
}

function senateOfficialNamesById(bytes: Buffer): Map<string, string> {
  const parsed = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>
  const root = (parsed.ListaParlamentarLegislatura as Record<string, unknown> | undefined) ?? {}
  const parliamentaryRoot = (root.Parlamentares as Record<string, unknown> | undefined) ?? {}
  const rawRows = parliamentaryRoot.Parlamentar
  const rows = Array.isArray(rawRows) ? rawRows : rawRows ? [rawRows] : []
  const names = new Map<string, string>()
  for (const raw of rows) {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
    const identification = row.IdentificacaoParlamentar && typeof row.IdentificacaoParlamentar === "object" ? row.IdentificacaoParlamentar as Record<string, unknown> : {}
    const id = String(identification.CodigoParlamentar ?? "")
    const name = String(identification.NomeParlamentar ?? "").trim()
    if (!/^\d+$/.test(id) || !name || names.has(id)) throw new Error("roster legislativo Senado contém ID/nome inválido ou duplicado")
    names.set(id, name)
  }
  if (names.size === 0) throw new Error("roster legislativo Senado sem nomes oficiais")
  return names
}

function senateRosterName(payload: unknown, officialId: string): string | null {
  if (Array.isArray(payload)) {
    for (const item of payload) { const found = senateRosterName(item, officialId); if (found) return found }
    return null
  }
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const id = record.CodigoParlamentar ?? record.Codigo ?? record.id
  const name = record.NomeParlamentar ?? record.Nome
  if (String(id ?? "") === officialId && typeof name === "string" && name.trim()) return name.trim()
  for (const value of Object.values(record)) { const found = senateRosterName(value, officialId); if (found) return found }
  return null
}

async function fetchSenateRosterName(officialId: number | string): Promise<string | null> {
  const url = `https://legis.senado.leg.br/dadosabertos/senador/${encodeURIComponent(String(officialId))}.json`
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} ao verificar roster oficial do Senado`)
  const payload = await response.json() as unknown
  return senateRosterName(payload, String(officialId))
}

async function samePersonByJev(candidate: { slug: string; nome_completo: string; nome_urna: string; ids: { senado?: number | null } }, sourceName: string, extraCandidateContext: Record<string, unknown> = {}): Promise<number | null> {
  const state = {
    fonte: "CSV oficial CEAPS do Senado",
    registro: { senador: sourceName },
    candidato: { slug: candidate.slug, nome_completo: candidate.nome_completo, nome_urna: candidate.nome_urna, id_senado: candidate.ids.senado, ...extraCandidateContext },
  }
  const questions = JSON.parse(readFileSync(JEV_QUESTIONS, "utf8"))
  const scriptSha = existsSync(JEV_SCRIPT) ? createHash("sha256").update(readFileSync(JEV_SCRIPT)).digest("hex") : null
  if (scriptSha !== JEV_SCRIPT_SHA256_PIN) {
    appendFileSync(JEV_SHADOW_PATH, `${JSON.stringify({ fonte: "ceaps-senado", slug: candidate.slug, id_senado: candidate.ids.senado, status: "shadow_skipped_script_sha_mismatch", expected_sha256: JEV_SCRIPT_SHA256_PIN, actual_sha256: scriptSha, consultado_em: new Date().toISOString() })}\n`, { mode: 0o600 })
    return null
  }
  const allowlistedEnv = {
    ...(process.env.TYPESAFE_API_KEY ? { TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY } : {}),
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
  } as NodeJS.ProcessEnv
  const request = spawnSync("python3", [JEV_SCRIPT, "ask"], { input: JSON.stringify({ state, questions }), encoding: "utf8", timeout: 30_000, env: allowlistedEnv })
  if (request.status !== 0) return null
  try {
    const output = JSON.parse(request.stdout) as { answers?: { mesma_pessoa?: { noul?: number } } }
    const p = output.answers?.mesma_pessoa?.noul
    return typeof p === "number" && Number.isFinite(p) ? p : null
  } catch { return null }
}

function appendIdentityShadow(candidate: { slug: string; ids: { senado?: number | null } }, sourceName: string, p: number | null): void {
  mkdirSync(JEV_LOG_DIR, { recursive: true, mode: 0o700 })
  const row = JSON.stringify({ fonte: "ceaps-senado", slug: candidate.slug, id_senado: candidate.ids.senado, nome_fonte: sourceName, p_mesma_pessoa: p, consultado_em: new Date().toISOString() })
  appendFileSync(JEV_SHADOW_PATH, `${row}\n`, { mode: 0o600 })
  chmodSync(JEV_SHADOW_PATH, 0o600)
  if (p !== null && p >= 0.35 && p <= 0.65) appendFileSync(JEV_REVIEW_PATH, `${row}\n`, { mode: 0o600 })
  if (p !== null && p >= 0.35 && p <= 0.65) chmodSync(JEV_REVIEW_PATH, 0o600)
}

export function agregarDespesasCeapsCsv(rows: CeapsCsvRow[], nomeSenador: string, ano: number): { quantidade: number; dados: DespesasAgregadas | null } {
  const normalizedName = normalizeForMatch(nomeSenador)
  const doSenador = rows.filter((row) => normalizeForMatch(row.SENADOR) === normalizedName)
  const porCategoriaCents: Record<string, number> = {}
  const destaques: GastoDestaque[] = []
  let totalCents = 0
  for (const row of doSenador) {
    if (Number(row.ANO) !== ano) throw new Error(`registro CEAPS de ano alheio em ${ano}`)
    const amount = parseValorOficial(row.VALOR_REEMBOLSADO)
    if (amount === null) throw new Error(`valor CEAPS inválido em ${ano}`)
    const category = (row.TIPO_DESPESA || "OUTROS").trim().toUpperCase()
    const cents = Math.round(amount * 100)
    porCategoriaCents[category] = (porCategoriaCents[category] ?? 0) + cents
    totalCents += cents
    if (amount > 0) destaques.push({ fornecedor: row.FORNECEDOR.trim(), tipo: category, valor: amount, data: row.DATA || null })
  }
  const porCategoria = Object.fromEntries(Object.entries(porCategoriaCents).map(([key, cents]) => [key, cents / 100]))
  return {
    quantidade: doSenador.length,
    dados: doSenador.length === 0 ? null : {
      total: totalCents / 100,
      porCategoria,
      destaques: destaques.sort((a, b) => b.valor - a.valor).slice(0, 5),
      anosDescartados: [],
    },
  }
}

export interface DespesaCeapsOficial {
  ano?: number | string
  codSenador?: number | string
  tipoDespesa?: string
  fornecedor?: string
  data?: string
  valorReembolsado?: number | string
}

interface Despesa {
  TipoDespesa?: string
  ValorDespesa?: string
  CNPJFornecedor?: string
  NomeFornecedor?: string
  DataDespesa?: string
}

interface MesData {
  NumMes?: string
  Despesa?: Despesa | Despesa[]
}

interface AnoData {
  NumAno?: string
  Mes?: MesData | MesData[]
}

interface DespesasResponse {
  DespesasSenador?: {
    Parlamentar?: {
      IdentificacaoParlamentar?: {
        CodigoParlamentar?: string | number
        NomeParlamentar?: string
      }
    }
    Periodo?: {
      Ano?: AnoData | AnoData[]
    }
  }
}

interface DespesasAgregadas {
  total: number
  porCategoria: GastoPorCategoria
  destaques: GastoDestaque[]
  /** Anos que a API devolveu sem serem o pedido, e que foram descartados. */
  anosDescartados: string[]
}

export function selectCeapsSenadoCandidates<T extends { slug: string; ids: { senado?: number | null } }>(
  candidates: readonly T[],
  options: { targetSlugs?: readonly string[]; cohortPredicate?: (candidate: T) => boolean } = {},
): T[] {
  const target = options.targetSlugs ? new Set(options.targetSlugs) : null
  const inCohort = options.cohortPredicate ?? (() => true)
  return candidates.filter((candidate) => inCohort(candidate)
    && candidate.ids.senado !== null && candidate.ids.senado !== undefined
    && (!target || target.has(candidate.slug)))
}

export type ConferenciaDespesas =
  | { ok: true; dados: DespesasAgregadas | null }
  | { ok: false; motivo: string }

/**
 * Agrega as despesas de UM ano, conferindo antes de quem elas sao.
 *
 * Dois defeitos que esta funcao fecha, os dois da mesma familia do incidente de
 * 2026-08-04 no ingest de sancoes:
 *
 * 1. `IdentificacaoParlamentar` estava tipado como `Record<string, unknown>` e
 *    nunca era lido. O payload diz de quem sao as despesas e o codigo ignorava,
 *    gravando em `gastos_parlamentares` o que a API mandasse.
 * 2. O codigo aceitava qualquer ano devolvido e somava tudo na linha do ano
 *    PEDIDO. O comentario antigo registrava isso como comportamento conhecido
 *    ("a API as vezes retorna o ano solicitado, as vezes outros"), o que e
 *    evidencia de que o filtro nao e confiavel, nao licenca para confiar nele.
 *    Somar 2023 na linha de 2019 nao e dado incompleto, e dado errado.
 *
 * Ausencia de `CodigoParlamentar` nao reprova a resposta: nem todo payload
 * traz o bloco. O que reprova e ele vir preenchido e ser de outro senador.
 *
 * Ano ausente NAO tem a mesma tolerancia, e a assimetria e proposital. Sem
 * `CodigoParlamentar` a resposta continua sendo a resposta da rota daquele
 * senador, entao o dado tem dono conhecido. Sem `NumAno` a despesa nao tem ano
 * conhecido, e somar despesa de ano desconhecido na linha do ano pedido e o
 * mesmo defeito do item 2 acima, so que sem nem a evidencia de qual ano foi
 * somado. Bloco sem ano e descartado e entra em `anosDescartados` como
 * "sem ano", para o operador ver que houve descarte.
 */
export function agregarDespesasDoAno(
  payload: DespesasResponse | null | undefined,
  senadoId: number,
  ano: number
): ConferenciaDespesas {
  const despesasSenador = payload?.DespesasSenador
  if (!despesasSenador) return { ok: true, dados: null }

  const codigoRetornado = despesasSenador.Parlamentar?.IdentificacaoParlamentar?.CodigoParlamentar
  if (codigoRetornado !== undefined && codigoRetornado !== null && String(codigoRetornado).trim() !== "") {
    if (String(codigoRetornado).trim() !== String(senadoId)) {
      const nome = despesasSenador.Parlamentar?.IdentificacaoParlamentar?.NomeParlamentar ?? "sem nome"
      return {
        ok: false,
        motivo: `despesas devolvidas sao do parlamentar ${codigoRetornado} (${nome}), nao do ${senadoId}`,
      }
    }
  }

  const periodo = despesasSenador.Periodo
  if (!periodo) return { ok: true, dados: null }

  const anos = toArray(periodo.Ano)
  const porCategoria: GastoPorCategoria = {}
  const allDespesas: GastoDestaque[] = []
  const anosDescartados: string[] = []
  let total = 0

  for (const anoData of anos) {
    const anoRetornado = String(anoData.NumAno ?? "").trim()
    if (anoRetornado !== String(ano)) {
      anosDescartados.push(anoRetornado || "sem ano")
      continue
    }

    for (const mes of toArray(anoData.Mes)) {
      for (const d of toArray(mes.Despesa)) {
        const valor = parseValor(d.ValorDespesa)
        if (valor <= 0) continue

        const categoria = (d.TipoDespesa || "OUTROS").trim().toUpperCase()
        porCategoria[categoria] = (porCategoria[categoria] ?? 0) + valor
        total += valor

        allDespesas.push({
          fornecedor: (d.NomeFornecedor || "").trim(),
          tipo: categoria,
          valor,
          data: d.DataDespesa ?? null,
        })
      }
    }
  }

  if (total === 0) return { ok: true, dados: null }

  return {
    ok: true,
    dados: {
      total,
      porCategoria,
      // Top 5 gastos por valor
      destaques: allDespesas.sort((a, b) => b.valor - a.valor).slice(0, 5),
      anosDescartados: [...new Set(anosDescartados)],
    },
  }
}

function parseValor(v: string | undefined): number {
  if (!v || v.trim() === "") return 0
  return parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0
}

function parseValorOficial(v: number | string | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v !== "string" || v.trim() === "") return null

  const trimmed = v.trim()
  if (trimmed.includes(",") && !/^-?(?:(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{0,2})?|,\d{1,2})$/.test(trimmed)) return null
  let normalized = trimmed
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "")
    if (normalized.startsWith(",")) normalized = `0${normalized}`
    else if (normalized.startsWith("-,")) normalized = normalized.replace("-,", "-0,")
    if (normalized.endsWith(",")) normalized += "0"
    normalized = normalized.replace(",", ".")
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized.trim())) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Agrega o endpoint administrativo vigente do Senado, que devolve todos os
 * senadores de um ano. A identidade e o ano sao filtrados pelo retorno, nunca
 * inferidos apenas pela URL consultada.
 */
export function agregarDespesasCeapsOficial(
  payload: DespesaCeapsOficial[] | null | undefined,
  senadoId: number,
  ano: number,
): ConferenciaDespesas {
  // Uma resposta que nao e uma lista nao permite distinguir erro de rota de
  // ausencia de despesas. Nunca a trate como vazio confirmado.
  if (!Array.isArray(payload)) {
    return { ok: false, motivo: "resposta CEAPS nao e uma lista de despesas" }
  }

  // O endpoint anual devolve a lista inteira do ano. Validar o lote antes de
  // filtrar pelo senador impede [null], [{}] ou registros de outro ano de
  // parecerem ausencia legitima do alvo.
  for (const [index, despesa] of payload.entries()) {
    if (!despesa || typeof despesa !== "object" || Array.isArray(despesa)) {
      return { ok: false, motivo: `registro CEAPS invalido na posicao ${index}` }
    }
    const anoRetornado = String(despesa.ano ?? "").trim()
    if (!/^\d{4}$/.test(anoRetornado) || Number(anoRetornado) !== ano) {
      return {
        ok: false,
        motivo: `resposta CEAPS fora do ano solicitado ${ano}: registro ${index} informa ${anoRetornado || "sem ano"}`,
      }
    }
    if (String(despesa.codSenador ?? "").trim() === "") {
      return { ok: false, motivo: `registro CEAPS sem codSenador na posicao ${index}` }
    }
    if (parseValorOficial(despesa.valorReembolsado) === null) {
      return { ok: false, motivo: `registro CEAPS com valorReembolsado invalido na posicao ${index}` }
    }
  }

  const porCategoria: GastoPorCategoria = {}
  const allDespesas: GastoDestaque[] = []
  const anosDescartados: string[] = []
  const registrosDoSenador = payload.filter((despesa) =>
    despesa !== null &&
    typeof despesa === "object" &&
    String(despesa.codSenador ?? "").trim() === String(senadoId),
  )
  let registrosDoAno = 0
  let totalCents = 0
  let hasNonzeroValue = false
  const porCategoriaCents: Record<string, number> = {}

  for (const despesa of registrosDoSenador) {
    const anoRetornado = String(despesa.ano ?? "").trim()
    if (anoRetornado !== String(ano)) {
      anosDescartados.push(anoRetornado || "sem ano")
      continue
    }
    registrosDoAno++

    const valor = parseValorOficial(despesa.valorReembolsado)
    if (valor === null) {
      return { ok: false, motivo: "registro CEAPS com valorReembolsado invalido" }
    }
    if (valor === 0) continue
    hasNonzeroValue = true

    const categoria = (despesa.tipoDespesa || "OUTROS").trim().toUpperCase()
    const cents = Math.round(valor * 100)
    porCategoriaCents[categoria] = (porCategoriaCents[categoria] ?? 0) + cents
    totalCents += cents
    if (valor > 0) {
      allDespesas.push({
        fornecedor: (despesa.fornecedor || "").trim(),
        tipo: categoria,
        valor,
        data: despesa.data ?? null,
      })
    }
  }

  // A API respondeu por este senador, mas somente com outro ano (ou sem
  // ano). Isso e uma resposta inconclusiva, nunca evidencia de vazio no ano
  // pedido.
  if (registrosDoSenador.length > 0 && registrosDoAno === 0) {
    return {
      ok: false,
      motivo: `resposta CEAPS sem registros do ano ${ano}; anos retornados: ${[...new Set(anosDescartados)].join(", ") || "nenhum"}`,
    }
  }

  if (!hasNonzeroValue) return { ok: true, dados: null }
  for (const [categoria, cents] of Object.entries(porCategoriaCents)) {
    porCategoria[categoria] = cents / 100
  }
  return {
    ok: true,
    dados: {
      total: totalCents / 100,
      porCategoria,
      destaques: allDespesas.sort((a, b) => b.valor - a.valor).slice(0, 5),
      anosDescartados: [...new Set(anosDescartados)],
    },
  }
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

interface GastoPorCategoria {
  [categoria: string]: number
}

export function detalhamentoCeaps(
  porCategoria: GastoPorCategoria,
): Array<{ categoria: string; valor: number }> {
  return Object.entries(porCategoria).map(([categoria, valor]) => ({
    categoria,
    valor: Math.round(valor * 100) / 100,
  }))
}

interface GastoDestaque {
  fornecedor: string
  tipo: string
  valor: number
  data: string | null
}

/**
 * Desfecho de UMA tentativa (um senador, um ano).
 *
 * Ate 2026-08-05 esta funcao devolvia `null` tanto para "a rota caiu" quanto
 * para "a API respondeu e o senador nao tem gasto neste ano", e o chamador
 * logava "sem dados" nos dois casos. No `coleta_log` isso virava
 * `vazio_confirmado`: o projeto afirmando ter procurado e nao achado nada,
 * quando na verdade a rota inteira esta 404 desde antes da pergunta. Separar os
 * dois e o unico jeito de o relatorio de cobertura parar de contar fonte morta
 * como zero verificado.
 */
export async function ingestCeapsSenado(options: { targetSlugs?: readonly string[] } = {}): Promise<IngestResult[]> {
  const candidatos = await loadCandidatosPublicos()
  const cohort = getExplicitCohort()
  const senadores = selectCeapsSenadoCandidates(candidatos, { targetSlugs: options.targetSlugs, cohortPredicate: (candidate) => !cohort || cohort.some((item) => item.slug === candidate.slug) })
  const snapshots: CeapsSnapshot[] = []
  const falhasFonte = new Map<number, string>()
  const senateRosters = new Map<number, SenadoLegislatureRoster>()
  const senateRosterNames = new Map<number, ReadonlyMap<string, string>>()
  const senateRosterFailures = new Map<number, string>()
  for (const legislature of [53, 54, 55, 56, 57]) {
    const url = senadoLegislatureRosterUrl(legislature)
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      const roster = parseSenadoLegislatureRoster(bytes, legislature)
      const names = senateOfficialNamesById(bytes)
      if (names.size !== roster.ids.size || [...names.keys()].some((id) => !roster.ids.has(id))) throw new Error("roster legislativo Senado divergiu entre nomes e IDs validados")
      senateRosters.set(legislature, roster)
      senateRosterNames.set(legislature, names)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      senateRosterFailures.set(legislature, reason)
      error("ceaps-senado", `Roster legislativo ${legislature} indisponível/incompleto; anos mantidos no escopo`)
    }
  }
  for (const ano of ANOS) {
    try {
      const snapshot = await fetchCeapsSnapshot(ano)
      snapshots.push(snapshot)
      log("ceaps-senado", `CSV ${ano}: ${snapshot.rows.length} linhas; sha256=${snapshot.sha256}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      falhasFonte.set(ano, message)
      error("ceaps-senado", `CSV ${ano}: ${message}`)
    }
  }
  const sourceNames = senatorNamesForSnapshot(snapshots)
  const allSourceRevisions = snapshots.map(({ ano, url, sha256 }) => ({ ano, url, sha256 }))
  const results: IngestResult[] = []
  let runUnpublishCount = 0

  for (const cand of senadores) {
    const result: IngestResult = { source: "ceaps-senado", candidato: cand.slug, tables_updated: [], rows_upserted: 0, errors: [], duration_ms: 0 }
    const start = Date.now()
    const officialId = cand.ids.senado == null ? null : String(cand.ids.senado)
    const unverifiedRosterYears = officialId ? ANOS.filter((year) => !senateRosters.has(senadoExpenseLegislatureForYear(year))) : ANOS
    const candidateYears = officialId ? ANOS.filter((year) => senateRosters.get(senadoExpenseLegislatureForYear(year))?.ids.has(officialId)) : ANOS
    const candidateFailures = [...falhasFonte.entries()].filter(([year]) => candidateYears.includes(year)).map(([year, message]) => `${year}: ${message}`)
    let processingYears = [...candidateYears]
    let candidateSnapshots = snapshots.filter((snapshot) => processingYears.includes(snapshot.ano))
    const excludedYears = ANOS.filter((year) => !candidateYears.includes(year))
    const scopeEvidence = {
      rosters: [53, 54, 55, 56, 57].map((legislature) => {
        const roster = senateRosters.get(legislature)
        return { legislature, url: roster?.url ?? senadoLegislatureRosterUrl(legislature), sha256: roster?.sha256 ?? null, membership: officialId && roster ? roster.ids.has(officialId) : "unverified", years: [...SENADO_EXPENSE_LEGISLATURES[legislature]!], failure: senateRosterFailures.get(legislature) ?? null }
      }),
      scope_years: candidateYears,
      excluded_years: excludedYears,
    }
    const receiptDetail = (extra: Record<string, unknown> = {}) => JSON.stringify({ source: "Senado CEAPS CSV", scope_years: candidateYears, reconciliation_years: processingYears, scope_evidence: scopeEvidence, source_revisions: allSourceRevisions.filter(({ ano }) => processingYears.includes(ano)), failed_years: candidateFailures, ...extra })
    if (officialId === null) {
      result.errors.push("ID Senado ausente; escopo parlamentar não confirmado")
      result.coleta_resultado = "erro"
      result.coleta_detalhe = receiptDetail({ motivo: "ID Senado ausente" })
      result.coleta_url = senadoLegislatureRosterUrl(53)
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }
    if (candidateFailures.length > 0) {
      result.errors.push(`Fonte CEAPS indisponível/inválida nos anos do escopo: ${candidateFailures.map((failure) => failure.split(":")[0]).join(",")}`)
      result.coleta_resultado = "erro"
      result.coleta_detalhe = receiptDetail({ id_senado: cand.ids.senado, motivo: "falha anual de fonte; nenhuma ausência inferida" })
      const firstFailedYear = Number(candidateFailures[0]?.split(":")[0])
      result.coleta_url = Number.isInteger(firstFailedYear) && firstFailedYear >= 2008 && firstFailedYear <= 2026
        ? `${BASE_URL}_${firstFailedYear}.csv`
        : candidateSnapshots.at(-1)?.url ?? `${BASE_URL}_2026.csv`
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }
    const scopeIndeterminate = classifyCeapsCandidateScope(candidateYears) === "indeterminate"
    const candidatoId = await resolveCandidatoId(cand.slug)
    if (!candidatoId) {
      result.errors.push("Candidato não encontrado no Supabase")
      result.coleta_resultado = "erro"
      result.coleta_detalhe = receiptDetail({ id_senado: cand.ids.senado, motivo: result.errors[0] })
      result.coleta_url = `${BASE_URL}_2026.csv`
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }
    let existingSenateRows: ExistingSenateExpense[] = []
    try { existingSenateRows = await loadPublishedSenateExpenseRows(candidatoId) }
    catch (err) {
      result.errors.push(`Proveniências Senado existentes não puderam ser lidas integralmente; conciliação fora do roster suspensa: ${err instanceof Error ? err.message : String(err)}`)
    }
    processingYears = ceapsProcessingYears(candidateYears, existingSenateRows)
    candidateSnapshots = snapshots.filter((snapshot) => processingYears.includes(snapshot.ano))
    const missingReconciliationSnapshots = processingYears.filter((year) => !snapshots.some((snapshot) => snapshot.ano === year))
      .filter((year) => !candidateYears.includes(year))
    if (missingReconciliationSnapshots.length > 0) result.errors.push(`CSV CEAPS anual ausente para linhas Senado fora do roster em ${missingReconciliationSnapshots.join(",")}; revisão mantida`)
    if (scopeIndeterminate) result.errors.push("Roster oficial não confirma período de exercício para este ID; reconciliação fica limitada a proveniências Senado já publicadas e ausência não vira zero confirmado")
    if (unverifiedRosterYears.length > 0) result.errors.push(`Roster legislativo não confirmou os anos: ${unverifiedRosterYears.join(", ")}`)
    let officialName: string | null = null
    try { officialName = await fetchSenateRosterName(officialId) }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`Verificação de identidade no roster Senado falhou: ${message}`)
    }
    const officialSourceName = officialName ? sourceNames.get(normalizeForMatch(officialName)) : undefined
    // Alias único (NomeParlamentar curto, CSV com o nome de urna): só quando o
    // nome exato não aparece em nenhum CSV, ano a ano e dentro do roster.
    const aliasByYear = new Map<number, string>()
    if (!officialSourceName && officialName) {
      for (const snapshot of candidateSnapshots) {
        const legislature = senadoExpenseLegislatureForYear(snapshot.ano)
        const rosterNames = senateRosterNames.get(legislature)
        if (!rosterNames || senateRosters.get(legislature)?.ids.has(officialId) !== true) continue
        const alias = ceapsUniqueAliasName({
          officialName,
          nomeCompleto: cand.nome_completo,
          yearNames: [...new Set(snapshot.rows.map((row) => row.SENADOR))],
          otherOfficialNames: [...rosterNames].filter(([id]) => id !== officialId).map(([, name]) => name),
        })
        if (alias) aliasByYear.set(snapshot.ano, alias)
      }
    }
    const aliasNames = [...new Map([...aliasByYear.values()].map((name) => [normalizeForMatch(name), name])).values()]
    const matchedNames = officialSourceName ? [officialSourceName] : aliasNames
    const aliasMatch = !officialSourceName && aliasNames.length === 1
    if (matchedNames.length !== 1) {
      result.errors.push(matchedNames.length === 0 ? "nome oficial do ID Senado não encontrado exatamente nos CSVs CEAPS; novas atribuições ficam em revisão" : "nome parlamentar ambíguo no CEAPS")
    }

    let sourceName = matchedNames.length === 1 ? matchedNames[0]! : null
    let p: number | null = null
    if (sourceName) {
      p = await samePersonByJev(cand, sourceName, aliasMatch ? { nome_parlamentar_senado: officialName, uf: cand.estado ?? null, anos_mandato_senado: candidateYears } : {})
      appendIdentityShadow(cand, sourceName, p)
    }
    // Alias exige a regra de código E o Jev mesma_pessoa; sem os dois, fica em revisão.
    const aliasConfirmed = aliasMatch && p !== null && p >= CEAPS_ALIAS_JEV_MIN_P
    if (aliasMatch && !aliasConfirmed) {
      result.errors.push(`alias CEAPS sem confirmação Jev mesma_pessoa (p=${p ?? "indisponível"}); novas atribuições ficam em revisão`)
      sourceName = null
    }

    if (!sourceName) {
      result.coleta_resultado = "indeterminado"
      result.coleta_detalhe = receiptDetail({ id_senado: cand.ids.senado, nome_oficial: officialName, motivo: result.errors[0] })
      result.coleta_url = candidateSnapshots.at(-1)?.url ?? `${BASE_URL}_2026.csv`
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    let sourceRows = 0
    const anosVazios: number[] = []
    const pendingTombstones: Array<{ snapshot: CeapsSnapshot; target: ExistingSenateExpense; row: { despublicado_em: string; despublicacao_motivo: string } }> = []
    for (const snapshot of candidateSnapshots) {
      const historicalNames = [...new Map([...ceapsNamesForSenator(officialId, [...senateRosterNames.values()]), sourceName].map((name) => [normalizeForMatch(name), name])).values()]
      const aggregateByNames = historicalNames.map((name) => agregarDespesasCeapsCsv(snapshot.rows, name, snapshot.ano))
      const aggregate = aggregateByNames.reduce((combined, item) => {
        if (!item.dados) return combined
        if (!combined.dados) return { quantidade: item.quantidade, dados: item.dados }
        const porCategoria = { ...combined.dados.porCategoria }
        for (const [category, value] of Object.entries(item.dados.porCategoria)) porCategoria[category] = (porCategoria[category] ?? 0) + value
        return { quantidade: combined.quantidade + item.quantidade, dados: { total: combined.dados.total + item.dados.total, porCategoria, destaques: [...combined.dados.destaques, ...item.dados.destaques].sort((a, b) => b.valor - a.valor).slice(0, 5), anosDescartados: [] } }
      }, { quantidade: 0, dados: null as DespesasAgregadas | null })
      sourceRows += aggregate.quantidade
      const { data: existingRows, error: selectError } = await supabase.from("gastos_parlamentares").select("id,fonte,despublicado_em,total_gasto,detalhamento").eq("candidato_id", candidatoId).eq("ano", snapshot.ano)
      if (selectError) {
        result.errors.push(`Falha de leitura gastos ${snapshot.ano}: ${selectError.message}`)
        continue
      }
      const publicRows = (existingRows ?? []).filter((row: { despublicado_em?: string | null }) => row.despublicado_em == null)
      const annualRows = classifyCeapsAnnualRows(publicRows)
      const { legacyRows } = annualRows
      if (annualRows.ambiguous) {
        result.errors.push(`Linhas CEAPS ambíguas para ${snapshot.ano}; nenhuma reconciliação automática`)
        continue
      }
      const existing = annualRows.target
      const rosterMemberForYear = senateRosters.get(senadoExpenseLegislatureForYear(snapshot.ano))?.ids.has(officialId) === true
      const officialNameForYear = senateRosterNames.get(senadoExpenseLegislatureForYear(snapshot.ano))?.get(officialId)
      const historicalNameVerified = sourceName != null && senateNameMatchesHistoricalRoster(sourceName, officialId, [...senateRosterNames.values()])
      const sourceIdentityVerified = sourceName != null && (
        rosterMemberForYear && officialNameForYear != null && normalizeForMatch(officialNameForYear) === normalizeForMatch(sourceName)
        || !rosterMemberForYear && historicalNameVerified
        || aliasConfirmed && rosterMemberForYear && normalizeForMatch(aliasByYear.get(snapshot.ano) ?? "") === normalizeForMatch(sourceName)
      )
      if (aggregate.dados && !sourceIdentityVerified) {
        result.errors.push(`Identidade CEAPS ${snapshot.ano} não vinculada ao ID Senado por roster oficial; linha mantida em revisão`)
        continue
      }
      if (!aggregate.dados) {
        anosVazios.push(snapshot.ano)
        const reconciliation = classifyCeapsLegacyRow({
          sourceRows: aggregate.quantidade,
          annualCsvComplete: !falhasFonte.has(snapshot.ano) && candidateSnapshots.some((item) => item.ano === snapshot.ano),
          rosterMembershipVerified: rosterMemberForYear,
          noCompetingHouseIdentity: false,
          senateProvenanceVerified: existing != null && isKnownSenateCeapsSource(existing.fonte) && sourceIdentityVerified,
        })
        const target = existing as { id: string; fonte?: string | null; total_gasto: number | null } | undefined
        const canTombstone = reconciliation === "absent" && target != null && isKnownSenateCeapsSource(target.fonte)
        if (canTombstone && target) {
          if (!withinCeapsUnpublishCaps({ candidateUnpublishes: pendingTombstones.length + 1, runUnpublishes: runUnpublishCount, candidateScopeYears: processingYears.length })) {
            result.errors.push(`Tombstone CEAPS ${snapshot.ano} excedeu limite de lote/razão; mantido para revisão`)
            continue
          }
          const row = { despublicado_em: new Date().toISOString(), despublicacao_motivo: `ceaps-senado: CSV oficial completo ${snapshot.ano} sem despesas para o nome oficial vinculado ao ID Senado ${officialId}; fonte anterior=${target.fonte ?? "sem fonte"}; nome=${sourceName}; csv=${snapshot.url}; sha256=${snapshot.sha256}` }
          pendingTombstones.push({ snapshot, target: target as ExistingSenateExpense, row })
        } else if (legacyRows.length === 1 && reconciliation === "review") result.errors.push(`Linha legada CEAPS ${snapshot.ano} mantida para revisão: escopo oficial incompleto`)
        continue
      }
      const { total, porCategoria, destaques } = aggregate.dados
      const detalhamento = detalhamentoCeaps(porCategoria)
      const gastosDestaque = destaques.map((d) => ({ fornecedor: d.fornecedor, tipo: d.tipo, valor: Math.round(d.valor * 100) / 100, data: d.data }))
      assertSemReplacementChar(JSON.stringify({ detalhamento, gastosDestaque }), `ceaps-senado:${cand.slug}:${snapshot.ano}`)
      const row = { candidato_id: candidatoId, ano: snapshot.ano, total_gasto: Math.round(total * 100) / 100, coletado_em: new Date().toISOString(), detalhamento, gastos_destaque: gastosDestaque, fonte: "Senado" }
      const target = existing as { id: string; fonte?: string | null; total_gasto: number | null } | undefined
      if (target && target.fonte == null && cand.ids.camara != null) {
        const exactTotal = Number(target.total_gasto) === row.total_gasto
        const exactCategories = legacyExpenseCategorySignatureMatches((existing as { detalhamento?: unknown }).detalhamento, detalhamento)
        if (!exactTotal || !exactCategories) {
          result.errors.push(`Linha legada de gastos ${snapshot.ano} não tem assinatura anual CEAPS distinta confirmada; revisão com a fonte da Câmara necessária`)
          continue
        }
      }
      if (target && !historicalCeapsTotalMatches(target.fonte, target.total_gasto, row.total_gasto)) {
        result.errors.push(`Linha ${target.fonte} ${snapshot.ano} diverge do total anual oficial; revisão necessária`)
        continue
      }
      if (target && target.fonte != null && !isKnownSenateCeapsSource(target.fonte)) {
        result.errors.push(`Linha de gastos ${snapshot.ano} já pertence a fonte ${target.fonte}; revisão necessária`)
        continue
      }
      if (annualRows.insertAlongsideUnrelated) {
        result.errors.push(`Linha de gastos ${snapshot.ano} com outra proveniência mantida para revisão; inserção CEAPS oficial segue em linha própria`)
      }
      try {
        const chave = target ? { acao: "inserir" as const } : decidirChaveOcupada(await lerLinhaNaChave(candidatoId, snapshot.ano), isKnownSenateCeapsSource, { aceitaPublicada: false })
        if (chave.acao === "revisao") {
          result.errors.push(`CEAPS ${snapshot.ano}: ${chave.motivo}; revisão necessária`)
          continue
        }
        if (emDryRun()) {
          planejarEscrita({ fonte: "ceaps-senado", tabela: "gastos_parlamentares", operacao: target || chave.acao === "substituir" ? "update" : "insert", alvo: cand.slug, identidade: `id-senado:${cand.ids.senado}`, chave: target ? { id: target.id } : chave.acao === "substituir" ? { id: chave.linha.id, republicar: true } : { candidato_id: candidatoId, ano: snapshot.ano }, valores: row })
          result.rows_upserted++
        } else if (chave.acao === "substituir") {
          const ocupante = chave.linha
          let update = supabase.from("gastos_parlamentares").update({ ...row, despublicado_em: null, despublicacao_motivo: null }).eq("id", ocupante.id).eq("candidato_id", candidatoId).eq("ano", snapshot.ano).not("despublicado_em", "is", null)
          update = ocupante.fonte == null ? update.is("fonte", null) : update.eq("fonte", ocupante.fonte)
          update = ocupante.total_gasto == null ? update.is("total_gasto", null) : update.eq("total_gasto", ocupante.total_gasto)
          const written = await escreverAuditado({ script: "ingest-ceaps-senado", tabela: "gastos_parlamentares", motivo: "Republicar ano com o total oficial do CSV CEAPS no lugar da linha despublicada da mesma chave", recorte: `${cand.slug}:${snapshot.ano}` }, () => update.select("id,fonte,ano,despublicado_em"))
          if (written.length !== 1 || written[0]?.fonte !== "Senado" || written[0]?.despublicado_em != null) result.errors.push(`Readback CEAPS ${snapshot.ano} divergiu da linha republicada`)
          result.rows_upserted += written.length
        } else if (target) {
          let update = supabase.from("gastos_parlamentares").update({ ...row, despublicado_em: null, despublicacao_motivo: null }).eq("id", target.id).eq("candidato_id", candidatoId).eq("ano", snapshot.ano).eq("total_gasto", (existing as { total_gasto: number | null }).total_gasto).is("despublicado_em", null)
          update = target.fonte == null ? update.is("fonte", null) : update.eq("fonte", target.fonte)
          const written = await escreverAuditado({ script: "ingest-ceaps-senado", tabela: "gastos_parlamentares", motivo: "Materializar despesas anuais do CSV oficial CEAPS do Senado", recorte: `${cand.slug}:${snapshot.ano}` }, () => update.select("id,fonte,ano,despublicado_em"))
          if (written.length !== 1 || written[0]?.fonte !== "Senado" || written[0]?.despublicado_em != null) result.errors.push(`Readback CEAPS ${snapshot.ano} divergiu da linha escrita`)
          result.rows_upserted += written.length
        } else {
          const written = await escreverAuditado({ script: "ingest-ceaps-senado", tabela: "gastos_parlamentares", motivo: "Materializar despesas anuais do CSV oficial CEAPS do Senado", recorte: `${cand.slug}:${snapshot.ano}` }, () => supabase.from("gastos_parlamentares").insert(row).select("id,fonte,ano,despublicado_em"))
          if (written.length !== 1 || written[0]?.fonte !== "Senado" || Number(written[0]?.ano) !== snapshot.ano) result.errors.push(`Readback CEAPS ${snapshot.ano} divergiu da linha inserida`)
          result.rows_upserted += written.length
        }
        if (!emDryRun()) {
          const readback = await supabase.from("gastos_parlamentares").select("id,fonte,ano,total_gasto,despublicado_em").eq("candidato_id", candidatoId).eq("ano", snapshot.ano).eq("fonte", "Senado").is("despublicado_em", null).limit(2)
          if (readback.error || readback.data?.length !== 1 || Number(readback.data[0]?.total_gasto) !== Math.round(total * 100) / 100) result.errors.push(`Readback independente CEAPS ${snapshot.ano} não confirmou chave e total`)
        }
      } catch (err) {
        result.errors.push(`Falha ao persistir/readback CEAPS ${snapshot.ano}: ${err instanceof Error ? err.message : String(err)}`)
        continue
      }
      if (result.rows_upserted > 0 && !result.tables_updated.includes("gastos_parlamentares")) result.tables_updated.push("gastos_parlamentares")
    }

    if (pendingTombstones.length > 0) {
      if (result.errors.length > 0) result.errors.push(`${pendingTombstones.length} tombstone(s) CEAPS suspenso(s): outra escrita/readback do candidato falhou`)
      else {
        for (const { snapshot, target, row } of pendingTombstones) {
          try {
            if (emDryRun()) {
              planejarEscrita({ fonte: "ceaps-senado", tabela: "gastos_parlamentares", operacao: "update", alvo: cand.slug, identidade: `id-senado:${officialId};csv-sha256:${snapshot.sha256}`, chave: { id: target.id }, valores: row })
            } else {
              let update = supabase.from("gastos_parlamentares").update(row).eq("id", target.id).eq("candidato_id", candidatoId).eq("ano", snapshot.ano).eq("total_gasto", target.total_gasto).is("despublicado_em", null)
              update = target.fonte == null ? update.is("fonte", null) : update.eq("fonte", target.fonte)
              const written = await escreverAuditado({ script: "ingest-ceaps-senado", tabela: "gastos_parlamentares", motivo: "Despublicar linha Senado sem ocorrência no CSV CEAPS anual completo", recorte: `${cand.slug}:${snapshot.ano}` }, () => update.select("id,despublicado_em"))
              if (written.length !== 1 || !written[0]?.despublicado_em) throw new Error(`Readback de despublicação não confirmou a linha`)
              const readback = await supabase.from("gastos_parlamentares").select("id,despublicado_em,despublicacao_motivo").eq("id", target.id).single()
              if (readback.error || readback.data?.despublicado_em == null || !readback.data?.despublicacao_motivo) throw new Error("readback independente não confirmou a linha")
            }
          } catch (err) {
            result.errors.push(`Despublicação CEAPS ${snapshot.ano} sem confirmação: ${err instanceof Error ? err.message : String(err)}`)
            break
          }
          runUnpublishCount++
        }
      }
    }

    result.coleta_resultado = ceapsReceiptOutcome({
      scopeIndeterminate,
      hasErrors: result.errors.length > 0 || candidateFailures.length > 0,
      sourceRows,
      rowsUpserted: result.rows_upserted,
    })
    result.coleta_volume = sourceRows
    result.coleta_url = candidateSnapshots.at(-1)?.url ?? `${BASE_URL}_2026.csv`
    result.coleta_detalhe = receiptDetail({ id_senado: cand.ids.senado, nome_fonte: sourceName, source_rows: sourceRows, anos_vazios: anosVazios, ...(aliasConfirmed ? { alias_de_nome_parlamentar: officialName, anos_alias: [...aliasByYear.keys()] } : {}) })
    result.duration_ms = Date.now() - start
    results.push(result)
  }
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv.includes("--apply")) ativarDryRun()
  ingestCeapsSenado().then((r) => console.log(JSON.stringify(r, null, 2)))
}
