import { supabase } from "./supabase"
import { createHash } from "node:crypto"
import { appendFileSync, chmodSync, mkdirSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { assertSemReplacementChar } from "./ceaps-csv-encoding"
import { decodeCeapsCsv, normalizeCeapsCsvAmount, parseCeapsCsvRecords } from "./ceaps-csv-encoding"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { normalizeForMatch } from "./helpers"
import { emDryRun, planejarEscrita, ativarDryRun } from "./dry-run"
import { log, error } from "./logger"
import { escreverAuditado } from "./escrita-auditada"
import { parseSenadoLegislatureRoster, senadoExpenseLegislatureForYear, senadoLegislatureRosterUrl, SENADO_EXPENSE_LEGISLATURES, type SenadoLegislatureRoster } from "./senado-legislature-roster"
import type { IngestResult } from "./types"

const BASE_URL = "https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps"
const ANOS = Array.from({ length: 19 }, (_, index) => 2008 + index)
const JEV_SCRIPT = resolve(process.env.HOME ?? "", ".claude/scripts/jev.py")
const JEV_QUESTIONS = resolve(process.cwd(), "scripts/data/ceaps-senado-identity-questions.json")
const JEV_LOG_DIR = resolve(process.env.HOME ?? "", "Library/Logs/puxa-ficha/jev")
const JEV_SHADOW_PATH = resolve(JEV_LOG_DIR, "ceaps-senado.jsonl")
const JEV_REVIEW_PATH = resolve(JEV_LOG_DIR, "ceaps-senado-review.jsonl")

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

async function fetchCeapsSnapshot(ano: number): Promise<CeapsSnapshot> {
  const url = `${BASE_URL}_${ano}.csv`
  const response = await fetch(url, { headers: { Accept: "text/csv, application/octet-stream" }, signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} para CSV CEAPS ${ano}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const rows = parseCeapsCsv(bytes, ano)
  return { ano, url, sha256: createHash("sha256").update(bytes).digest("hex"), rows }
}

function ceapsCandidateNames(candidato: { nome_completo: string; nome_urna: string }): Set<string> {
  return new Set([candidato.nome_completo, candidato.nome_urna].map(normalizeForMatch).filter(Boolean))
}

function senatorNamesForSnapshot(snapshots: CeapsSnapshot[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const snapshot of snapshots) for (const row of snapshot.rows) {
    const normalized = normalizeForMatch(row.SENADOR)
    if (normalized && !names.has(normalized)) names.set(normalized, row.SENADOR)
  }
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

async function samePersonByJev(candidate: { slug: string; nome_completo: string; nome_urna: string; ids: { senado?: number | null } }, sourceName: string): Promise<number | null> {
  const state = {
    fonte: "CSV oficial CEAPS do Senado",
    registro: { senador: sourceName },
    candidato: { slug: candidate.slug, nome_completo: candidate.nome_completo, nome_urna: candidate.nome_urna, id_senado: candidate.ids.senado },
  }
  const questions = JSON.parse(readFileSync(JEV_QUESTIONS, "utf8"))
  const request = spawnSync("python3", [JEV_SCRIPT, "ask"], { input: JSON.stringify({ state, questions }), encoding: "utf8", timeout: 30_000 })
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
  if (process.argv.includes("--dry-run")) ativarDryRun()
  const candidatos = await loadCandidatosPublicos()
  const senadores = selectCeapsSenadoCandidates(candidatos, { targetSlugs: options.targetSlugs })
  const snapshots: CeapsSnapshot[] = []
  const falhasFonte = new Map<number, string>()
  const senateRosters = new Map<number, SenadoLegislatureRoster>()
  const senateRosterFailures = new Map<number, string>()
  for (const legislature of [53, 54, 55, 56, 57]) {
    const url = senadoLegislatureRosterUrl(legislature)
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const roster = parseSenadoLegislatureRoster(Buffer.from(await response.arrayBuffer()), legislature)
      senateRosters.set(legislature, roster)
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

  for (const cand of senadores) {
    const result: IngestResult = { source: "ceaps-senado", candidato: cand.slug, tables_updated: [], rows_upserted: 0, errors: [], duration_ms: 0 }
    const start = Date.now()
    const officialId = cand.ids.senado == null ? null : String(cand.ids.senado)
    const candidateYears = officialId ? ANOS.filter((year) => {
      const roster = senateRosters.get(senadoExpenseLegislatureForYear(year))
      return !roster || roster.ids.has(officialId)
    }) : ANOS
    const candidateSnapshots = snapshots.filter((snapshot) => candidateYears.includes(snapshot.ano))
    const candidateFailures = [...falhasFonte.entries()].filter(([year]) => candidateYears.includes(year)).map(([year, message]) => `${year}: ${message}`)
    const excludedYears = ANOS.filter((year) => !candidateYears.includes(year))
    const scopeEvidence = {
      rosters: [53, 54, 55, 56, 57].map((legislature) => {
        const roster = senateRosters.get(legislature)
        return { legislature, url: roster?.url ?? senadoLegislatureRosterUrl(legislature), sha256: roster?.sha256 ?? null, membership: officialId && roster ? roster.ids.has(officialId) : "unverified", years: [...SENADO_EXPENSE_LEGISLATURES[legislature]!], failure: senateRosterFailures.get(legislature) ?? null }
      }),
      scope_years: candidateYears,
      excluded_years: excludedYears,
    }
    const receiptDetail = (extra: Record<string, unknown> = {}) => JSON.stringify({ source: "Senado CEAPS CSV", scope_years: candidateYears, scope_evidence: scopeEvidence, source_revisions: allSourceRevisions.filter(({ ano }) => candidateYears.includes(ano)), failed_years: candidateFailures, ...extra })
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
    const names = ceapsCandidateNames(cand)
    const possibleNames = [...names].flatMap((name) => sourceNames.has(name) ? [sourceNames.get(name)!] : [])
    const matchedNames = [...new Set(possibleNames)]
    if (matchedNames.length === 0 && cand.ids.senado != null) {
      try {
        const officialName = await fetchSenateRosterName(cand.ids.senado)
        const sourceName = officialName ? sourceNames.get(normalizeForMatch(officialName)) : undefined
        if (sourceName) matchedNames.push(sourceName)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`Verificação de roster Senado falhou: ${message}`)
      }
    }
    if (matchedNames.length !== 1) {
      result.errors.push(matchedNames.length === 0 ? "nenhum nome parlamentar exato no CEAPS anual; identidade e zero não confirmados" : "nome parlamentar ambíguo entre aliases CEAPS")
      result.coleta_resultado = "erro"
      result.coleta_detalhe = receiptDetail({ id_senado: cand.ids.senado, nomes_testados: [...names], motivo: result.errors[0] })
      result.coleta_url = `${BASE_URL}_2026.csv`
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    const sourceName = matchedNames[0]
    const p = await samePersonByJev(cand, sourceName)
    appendIdentityShadow(cand, sourceName, p)
    if (p === null || p >= 0.35 && p <= 0.65) {
      result.coleta_resultado = p === null ? "erro" : "indeterminado"
      result.errors.push(p === null ? "Jev indisponível; identidade não confirmada" : `Jev Noul p=${p.toFixed(2)} enviado para revisão humana`)
      result.coleta_detalhe = receiptDetail({ id_senado: cand.ids.senado, nome_fonte: sourceName, jev_noul: p, revisao: p === null ? null : JEV_REVIEW_PATH })
      result.coleta_url = `${BASE_URL}_2026.csv`
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }
    if (p < 0.35) {
      result.errors.push(`Jev Noul rejeitou identidade nominal (p=${p.toFixed(2)})`)
      result.coleta_resultado = "erro"
      result.coleta_detalhe = receiptDetail({ id_senado: cand.ids.senado, nome_fonte: sourceName, jev_noul: p })
      result.coleta_url = `${BASE_URL}_2026.csv`
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    const candidatoId = await resolveCandidatoId(cand.slug)
    if (!candidatoId) {
      result.errors.push("Candidato não encontrado no Supabase")
      result.coleta_resultado = "erro"
      result.coleta_detalhe = receiptDetail({ id_senado: cand.ids.senado, nome_fonte: sourceName, jev_noul: p })
      result.coleta_url = `${BASE_URL}_2026.csv`
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    let sourceRows = 0
    const anosVazios: number[] = []
    for (const snapshot of candidateSnapshots) {
      const aggregate = agregarDespesasCeapsCsv(snapshot.rows, sourceName, snapshot.ano)
      sourceRows += aggregate.quantidade
      if (!aggregate.dados) {
        anosVazios.push(snapshot.ano)
        continue
      }
      const { total, porCategoria, destaques } = aggregate.dados
      const detalhamento = detalhamentoCeaps(porCategoria)
      const gastosDestaque = destaques.map((d) => ({ fornecedor: d.fornecedor, tipo: d.tipo, valor: Math.round(d.valor * 100) / 100, data: d.data }))
      assertSemReplacementChar(JSON.stringify({ detalhamento, gastosDestaque }), `ceaps-senado:${cand.slug}:${snapshot.ano}`)
      const { data: existing, error: selectError } = await supabase.from("gastos_parlamentares").select("id").eq("candidato_id", candidatoId).eq("ano", snapshot.ano).single()
      if (selectError && !/0 rows|no rows/i.test(selectError.message)) {
        result.errors.push(`Falha de leitura gastos ${snapshot.ano}: ${selectError.message}`)
        continue
      }
      const row = { candidato_id: candidatoId, ano: snapshot.ano, total_gasto: Math.round(total * 100) / 100, coletado_em: new Date().toISOString(), detalhamento, gastos_destaque: gastosDestaque, fonte: "Senado" }
      if (emDryRun()) {
        planejarEscrita({ fonte: "ceaps-senado", tabela: "gastos_parlamentares", operacao: existing ? "update" : "insert", alvo: cand.slug, identidade: `id-senado:${cand.ids.senado};jev-noul:${p.toFixed(2)}`, chave: existing ? { id: existing.id } : { candidato_id: candidatoId, ano: snapshot.ano }, valores: row })
        result.rows_upserted++
      } else if (existing) {
        const written = await escreverAuditado({ script: "ingest-ceaps-senado", tabela: "gastos_parlamentares", motivo: "Materializar despesas anuais do CSV oficial CEAPS do Senado", recorte: `${cand.slug}:${snapshot.ano}` }, () => supabase.from("gastos_parlamentares").update(row).eq("id", existing.id).select("id"))
        result.rows_upserted += written.length
      } else {
        const written = await escreverAuditado({ script: "ingest-ceaps-senado", tabela: "gastos_parlamentares", motivo: "Materializar despesas anuais do CSV oficial CEAPS do Senado", recorte: `${cand.slug}:${snapshot.ano}` }, () => supabase.from("gastos_parlamentares").insert(row).select("id"))
        result.rows_upserted += written.length
      }
      if (result.rows_upserted > 0 && !result.tables_updated.includes("gastos_parlamentares")) result.tables_updated.push("gastos_parlamentares")
    }

    if (result.errors.length > 0 || candidateFailures.length > 0) result.coleta_resultado = "erro"
    else if (sourceRows > 0) result.coleta_resultado = "encontrado"
    else result.coleta_resultado = "vazio_confirmado"
    result.coleta_volume = sourceRows
    result.coleta_url = candidateSnapshots.at(-1)?.url ?? `${BASE_URL}_2026.csv`
    result.coleta_detalhe = receiptDetail({ id_senado: cand.ids.senado, nome_fonte: sourceName, jev_noul: p, source_rows: sourceRows, anos_vazios: anosVazios })
    result.duration_ms = Date.now() - start
    results.push(result)
  }
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--dry-run")) ativarDryRun()
  ingestCeapsSenado().then((r) => console.log(JSON.stringify(r, null, 2)))
}
