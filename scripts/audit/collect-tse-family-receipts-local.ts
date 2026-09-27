/**
 * Gera recibos locais, somente leitura, para as quatro famílias deriváveis dos
 * pacotes oficiais de dados abertos do TSE.
 *
 * O comando não baixa, não consulta banco e não materializa dados. Cada ZIP
 * deve ser fornecido por um manifesto privado com URL oficial, caminho local e
 * SHA-256. O relatório contém apenas slugs, contagens e digests; nunca copia
 * nome, CPF, e-mail, endereço ou conteúdo textual dos CSVs.
 *
 * Uso:
 *   node --import tsx scripts/audit/collect-tse-family-receipts-local.ts \
 *     --manifest=/privado/tse-assets.json --out=/privado/recibos.json \
 *     [--candidates=data/candidatos.json] [--materialized=/privado/readback.json]
 *     [--public-profiles=/privado/perfis-publicos.json]
 */
import { createHash } from "node:crypto"
import { execFileSync, spawn } from "node:child_process"
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"
import { parse } from "csv-parse"
import { stripAccents } from "../../src/lib/strip-accents"
import { maskDocumentLikeSequences } from "../../src/lib/public-profile-dto"
import { sanitizeMaioresDoadoresForPublic } from "../../src/lib/financiamento-public"
import { digitsOnly, pickRawDonorDocumentFromTseRow } from "../../src/lib/financiamento-doador-identifiers"
import { categoriaFinanciamentoExibida, classifyFinanciamentoOrigem, sanitizeTseLegacyAssetText } from "../lib/ingest-tse"
import { financiamentoReceitaDedupKey } from "../lib/financiamento-receita-dedup"
import { normalizeFinanciamentoReceitaRow } from "../lib/financiamento-receita-legacy-row"
import { parseEleitoStatus, shouldOmitFromHistoricoDescricao } from "../lib/tse-historico-regras"
import { canonicalCargo } from "../../src/lib/cargo-utils"
import { resolveResultadoEleitoral } from "../../src/lib/resultado-eleitoral"
import { resolveCanonicalParty } from "../lib/party-canonical"
import { publicFamilyPayloadSha256, publicFamilyRowCount, validCoverageSourceProof } from "./lib/coverage-source-proof"
import { publicPatrimonioRow } from "./plan-patrimonio-writers-local"
import type { CoverageProfile } from "./audit-cobertura-fichas"

export const TSE_FAMILIES = ["perfil_atual", "historico_politico", "patrimonio", "financiamento"] as const
export type TseFamily = (typeof TSE_FAMILIES)[number]
export const TSE_SOURCE_BY_FAMILY: Record<TseFamily, "tse" | "tse-historico" | "tse-patrimonio" | "tse-financiamento"> = {
  perfil_atual: "tse", historico_politico: "tse-historico", patrimonio: "tse-patrimonio", financiamento: "tse-financiamento",
}

const OFFICIAL_HOST = "https://cdn.tse.jus.br/"
const CORE_FIELDS = [
  "partido_sigla", "situacao_candidatura", "foto_url", "biografia", "naturalidade",
  "data_nascimento", "formacao", "profissao_declarada", "genero", "estado_civil", "cor_raca",
] as const

export type Row = Record<string, string>
type Candidate = {
  slug: string
  id?: string
  candidato_id?: string
  ids?: { tse_sq_candidato?: Record<string, string>; tse_uf_candidatura?: Record<string, string>; tse_divulga_prior_uf?: Record<string, string> }
}
export type SourceAsset = { family: TseFamily; year: number; path: string; url: string; sha256: string }
export type MaterializedReadback = {
  slug: string
  family: TseFamily
  candidato_id: string
  /** Perfil público lido por id+slug, sem digest declarado pelo chamador. */
  public_profile: CoverageProfile
  core_fields?: string[]
  source_years?: number[]
}
type AuditedAction = {
  tipo: string; slug: string; ano_eleicao?: number; sq_candidato?: string; uf_candidatura?: string; match_mode?: "exact_context" | "unique_year_public"
  antes?: Record<string, unknown>; antes_publico?: Record<string, unknown>[]
  depois?: Record<string, unknown> | Record<string, unknown>[]; linha?: Record<string, unknown>; serie?: Record<string, unknown>
}

const FINANCE_DISPLAY_FIELDS = ["cargo_candidatura", "total_arrecadado", "total_fundo_partidario", "total_fundo_eleitoral", "total_pessoa_fisica", "total_recursos_proprios", "categorias_origem", "maiores_doadores"] as const
const PATRIMONIO_DISPLAY_FIELDS = ["ano_eleicao", "cargo_candidatura", "tipo_eleicao", "valor_total", "bens"] as const
const HISTORY_DISPLAY_FIELDS = ["cargo", "cargo_canonico", "tipo_evento", "periodo_inicio", "periodo_fim", "partido", "estado", "eleito_por", "observacoes"] as const

function displayed(row: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]))
}

function sameDisplayedRows(actual: readonly Record<string, unknown>[], expected: readonly Record<string, unknown>[], fields: readonly string[]): boolean {
  const keys = (rows: readonly Record<string, unknown>[]) => rows.map((row) => stable(displayed(row, fields))).sort()
  return stable(keys(actual)) === stable(keys(expected))
}

function publicFinanceRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.hasOwn(row, "maiores_doadores")
    ? { ...row, maiores_doadores: sanitizeMaioresDoadoresForPublic(row.maiores_doadores) }
    : { ...row }
}

/** Apply only the domain writes in the audited 2026 finance plan to a public snapshot.
 * This is deliberately conservative: a missing or ambiguous public row leaves
 * the snapshot unchanged, so the projected receipt cannot close by assumption.
 */
export function projectAuditedFinanceReadback(profile: CoverageProfile, actions: readonly AuditedAction[]): { profile: CoverageProfile; applied: string[] } {
  let projected: CoverageProfile = { ...profile }
  const applied: string[] = []
  for (const action of actions) {
    if (action.slug !== profile.slug) continue
    if (action.tipo === "atualizar_financiamento" && action.depois && !Array.isArray(action.depois)) {
      const rows = Array.isArray(projected.financiamento) ? projected.financiamento as Record<string, unknown>[] : []
      const current = rows.filter((row) => Number(row.ano_eleicao) === 2026)
      if (current.length !== 1) continue
      const guarded = action.antes && Object.keys(action.antes).filter((key) => FINANCE_DISPLAY_FIELDS.includes(key as typeof FINANCE_DISPLAY_FIELDS[number]))
      if (guarded?.length && stable(displayed(publicFinanceRow(current[0]!), guarded)) !== stable(displayed(publicFinanceRow(action.antes!), guarded))) continue
      projected = { ...projected, financiamento: rows.map((row) => row === current[0] ? { ...row, ...publicFinanceRow(action.depois as Record<string, unknown>) } : row) }
      applied.push(action.tipo)
    } else if (action.tipo === "substituir_financiamento" && action.ano_eleicao && action.depois && !Array.isArray(action.depois) && action.antes_publico) {
      const rows = Array.isArray(projected.financiamento) ? projected.financiamento as Record<string, unknown>[] : []
      const current = rows.filter((row) => Number(row.ano_eleicao) === action.ano_eleicao)
      if (current.length > 1 || !sameDisplayedRows(current.map(publicFinanceRow), action.antes_publico.map(publicFinanceRow), FINANCE_DISPLAY_FIELDS)) continue
      if (!action.serie || Number(action.serie.ano) !== action.ano_eleicao || action.serie.estado !== "publicado") continue
      const series = Array.isArray(projected.financiamento_eleicoes) ? projected.financiamento_eleicoes as Record<string, unknown>[] : []
      const priorYear = series.find((row) => Number(row.ano) === action.ano_eleicao)
      projected = { ...projected,
        financiamento: [...rows.filter((row) => Number(row.ano_eleicao) !== action.ano_eleicao), publicFinanceRow({ ...(current[0] ?? {}), ...action.depois, ano_eleicao: action.ano_eleicao })],
        financiamento_eleicoes: [{ ...(priorYear ?? {}), ...action.serie }, ...series.filter((row) => Number(row.ano) !== action.ano_eleicao)],
      }
      applied.push(action.tipo)
    } else if (action.tipo === "inserir_financiamento" && action.linha) {
      const rows = Array.isArray(projected.financiamento) ? projected.financiamento as Record<string, unknown>[] : []
      if (rows.some((row) => Number(row.ano_eleicao) === 2026)) continue
      const series = Array.isArray(projected.financiamento_eleicoes) ? projected.financiamento_eleicoes as Record<string, unknown>[] : []
      projected = { ...projected, financiamento: [...rows, publicFinanceRow(action.linha)], financiamento_eleicoes: [{ ano: 2026, estado: "publicado", fonte_url: null, verificado_em: null }, ...series.filter((row) => Number(row.ano) !== 2026)] }
      applied.push(action.tipo)
    } else if (action.tipo === "inserir_patrimonio" && action.linha) {
      const rows = Array.isArray(projected.patrimonio) ? projected.patrimonio as Record<string, unknown>[] : []
      if (rows.some((row) => Number(row.ano_eleicao) === 2026)) continue
      const series = Array.isArray(projected.patrimonio_eleicoes) ? projected.patrimonio_eleicoes as Record<string, unknown>[] : []
      projected = { ...projected, patrimonio: [...rows, action.linha], patrimonio_eleicoes: [{ ano: 2026, estado: "publicado", fonte_url: null, verificado_em: null }, ...series.filter((row) => Number(row.ano) !== 2026)] }
      applied.push(action.tipo)
    } else if (action.tipo === "substituir_patrimonio" && action.depois && !Array.isArray(action.depois) && action.ano_eleicao) {
      const rows = Array.isArray(projected.patrimonio) ? projected.patrimonio as Record<string, unknown>[] : []
      const sameYear = (row: Record<string, unknown>) => Number(row.ano_eleicao) === action.ano_eleicao
      const sameContext = (row: Record<string, unknown>) => sameYear(row) &&
        normalized(row.sq_candidato) === normalized(action.sq_candidato) && normalized(row.uf_candidatura) === normalized(action.uf_candidatura)
      const uniqueYear = action.match_mode === "unique_year_public"
      const current = rows.filter(uniqueYear ? sameYear : sameContext)
      if (!action.sq_candidato || !action.uf_candidatura || !action.antes_publico ||
        !sameDisplayedRows(current.map(publicPatrimonioRow), action.antes_publico.map(publicPatrimonioRow), PATRIMONIO_DISPLAY_FIELDS) || current.length > 1 ||
        (uniqueYear && current.length !== 1) || (!uniqueYear && rows.some((row) => sameYear(row) && !row.sq_candidato && !row.uf_candidatura))) continue
      if (action.serie && (Number(action.serie.ano) !== action.ano_eleicao || action.serie.estado !== "publicado")) continue
      const next = { ...(current[0] ?? {}), ...action.depois, ano_eleicao: action.ano_eleicao }
      const series = publicFamilyEntries(projected, "patrimonio")
      const priorYear = series.find((row) => Number(row.ano) === action.ano_eleicao)
      const nextSeries = action.serie && Number(action.serie.ano) === action.ano_eleicao && action.serie.estado === "publicado"
        ? action.serie : { ...(priorYear ?? {}), ano: action.ano_eleicao, estado: "publicado", fonte_url: null, verificado_em: null }
      projected = {
        ...projected,
        patrimonio: [...rows.filter((row) => !(uniqueYear ? sameYear(row) : sameContext(row))), next],
        patrimonio_eleicoes: [nextSeries, ...series.filter((row) => Number(row.ano) !== action.ano_eleicao)],
      }
      applied.push(action.tipo)
    } else if (action.tipo === "substituir_historico" && Array.isArray(action.depois) && action.antes_publico) {
      const rows = Array.isArray(projected.historico) ? projected.historico as Record<string, unknown>[] : []
      const tseCandidates = rows.filter((row) => normalized(row.proveniencia) === "TSE" && normalized(row.tipo_evento) === "CANDIDATURA")
      if (!sameDisplayedRows(tseCandidates, action.antes_publico, HISTORY_DISPLAY_FIELDS)) continue
      projected = { ...projected, historico: [
        ...rows.filter((row) => !tseCandidates.includes(row)),
        ...action.depois.map((row) => ({ ...row, proveniencia: "tse", tipo_evento: "candidatura" })),
      ] }
      applied.push(action.tipo)
    }
  }
  return { profile: projected, applied }
}
type Manifest = { assets: SourceAsset[] }

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export function canonicalDigest(rows: readonly Row[], fields: readonly string[]): string {
  const selected = rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? ""])))
    .sort((a, b) => stable(a).localeCompare(stable(b)))
  return createHash("sha256").update(stable(selected)).digest("hex")
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : "" }
function validSha(value: string): boolean { return /^[a-f0-9]{64}$/i.test(value) }
function validOfficialUrl(value: string): boolean { return value.startsWith(OFFICIAL_HOST) && !/[\r\n]/.test(value) }
function arg(name: string, required = true): string | undefined {
  const prefix = `--${name}=`
  const value = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length)
  if (!value && required) throw new Error(`argumento obrigatório: ${prefix}<arquivo>`)
  return value ? resolve(value) : undefined
}

function sourcePattern(family: TseFamily): RegExp {
  if (family === "perfil_atual" || family === "historico_politico") return /consulta_cand(?:_complementar)?_/i
  if (family === "patrimonio") return /(?:bem[_-]candidato|consulta_cand_complementar)_/i
  return /receitas?[^/]*candid[^/]*\.(?:csv|txt)$/i
}

export function selectCsvMembers(listing: string, family: TseFamily): string[] {
  const matches = listing.split(/\r?\n/).filter((member) => /\.(?:csv|txt)$/i.test(member) && sourcePattern(family).test(member))
  const base = family === "financiamento"
    ? matches.filter((member) => !/doador[_-]?originario|(?:_|-)sup\.(?:csv|txt)$/i.test(member))
    : matches
  const national = base.filter((member) => /(?:_|-)brasil\.(?:csv|txt)$/i.test(member))
  return national.length === 1 ? national : base
}

function csvMembers(zipPath: string, family: TseFamily): string[] {
  const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
  return selectCsvMembers(listing, family)
}

export async function readRows(zipPath: string, family: TseFamily, wantedSq: ReadonlySet<string>, year?: number): Promise<Row[]> {
  const members = csvMembers(zipPath, family)
  if (members.length === 0) throw new Error(`ZIP ${basename(zipPath)} sem CSV compatível com ${family}`)
  const rows: Row[] = []
  for (const member of members) {
    const child = spawn("unzip", ["-p", zipPath, member], { stdio: ["ignore", "pipe", "ignore"] })
    const exit = new Promise<number>((accept, reject) => {
      child.once("error", reject)
      child.once("close", (code) => accept(code ?? 1))
    })
    child.stdout.setEncoding("latin1")
    const parser = parse({ delimiter: ";", columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, cast: (value: string) => value.trim() })
    const parsed = pipeline(child.stdout, parser)
    try {
      for await (const value of parser) {
        const row = value as Row
        if (wantedSq.has(rowSq(row))) rows.push(safeSourceRow(row, family === "financiamento" ? year : undefined))
      }
      await parsed
      if (await exit !== 0) throw new Error(`unzip falhou para ${basename(zipPath)}`)
    } catch (error) {
      child.kill()
      await parsed.catch(() => undefined)
      await exit.catch(() => undefined)
      throw error
    }
  }
  return rows
}

const SAFE_SOURCE_FIELDS = new Set([
  "SQ_CANDIDATO", "SQ_CANDIDATO_2026", "SEQUENCIAL_CANDIDATO", "Sequencial Candidato",
  "SG_UF", "SG_UF_CANDIDATURA", "UF", "SG_UE_SUPERIOR", "UNIDADE_ELEITORAL_CANDIDATO", "SG_UE",
  "ANO_ELEICAO", "ANO", "ANO_CANDIDATURA", "DS_CARGO", "SG_PARTIDO", "NR_CANDIDATO", "NM_URNA_CANDIDATO",
  "DS_SITUACAO_CANDIDATURA", "CD_SITUACAO_CANDIDATURA", "DS_SIT_TOT_TURNO", "DT_ELEICAO", "NM_TIPO_ELEICAO", "NR_TURNO",
  "VR_BEM_CANDIDATO", "VR_BEM", "VALOR_BEM", "DS_TIPO_BEM_CANDIDATO", "TP_BEM_CANDIDATO", "DS_BEM_CANDIDATO", "DS_BEM",
  "VR_RECEITA", "VALOR_RECEITA", "DS_FONTE_RECEITA", "DS_ORIGEM_RECEITA", "DS_TIPO_RECEITA",
  "SQ_RECEITA", "NR_RECIBO_DOACAO", "Numero Recibo Eleitoral", "Número Recibo Eleitoral",
  "NM_DOADOR_ORIGINARIO", "NM_DOADOR", "NM_DOADOR_RFB", "DS_TIPO_DOADOR", "TP_DOADOR",
  "Valor receita", "Fonte recurso", "Tipo receita", "Nome do doador", "NO_DOADOR", "TP_RECURSO",
])

export function safeSourceRow(row: Row, financeYear?: number): Row {
  const safe = Object.fromEntries(Object.entries(row).filter(([field]) => SAFE_SOURCE_FIELDS.has(field)))
  const donorDocumentLength = digitsOnly(pickRawDonorDocumentFromTseRow(row)).length
  if (donorDocumentLength === 11) safe.__donor_kind = "PF"
  if (donorDocumentLength === 14) safe.__donor_kind = "PJ"
  if (financeYear) {
    const normalizedRow = normalizeFinanciamentoReceitaRow(row)
    const key = financiamentoReceitaDedupKey(normalizedRow, {
      ano: financeYear, uf: normalizedRow.SG_UF_CANDIDATURA || rowUf(row), sqCandidato: rowSq(row),
    })
    if (key) safe.__receipt_dedup_sha256 = createHash("sha256").update(key).digest("hex")
  }
  return safe
}

function rowSq(row: Row): string { return text(row.SQ_CANDIDATO || row.SQ_CANDIDATO_2026 || row.SEQUENCIAL_CANDIDATO || row["Sequencial Candidato"]) }
function rowUf(row: Row): string {
  return text(row.SG_UF || row.SG_UF_CANDIDATURA || row.UF || row.SG_UE_SUPERIOR || row.UNIDADE_ELEITORAL_CANDIDATO || row.SG_UE).toUpperCase()
}
function rowYear(row: Row, fallback: number): number {
  const value = Number(text(row.ANO_ELEICAO || row.ANO || row.ANO_CANDIDATURA))
  return Number.isInteger(value) && value > 1900 ? value : fallback
}

const FIELDS: Record<TseFamily, readonly string[]> = {
  perfil_atual: ["SQ_CANDIDATO", "SG_UF", "ANO_ELEICAO", "DS_CARGO", "SG_PARTIDO", "NM_URNA_CANDIDATO", "DS_SITUACAO_CANDIDATURA", "CD_SITUACAO_CANDIDATURA", "DT_ELEICAO"],
  historico_politico: ["SQ_CANDIDATO", "SG_UF", "ANO_ELEICAO", "DS_CARGO", "SG_PARTIDO", "DS_SITUACAO_CANDIDATURA", "DS_SIT_TOT_TURNO", "NR_TURNO"],
  patrimonio: ["SQ_CANDIDATO", "SG_UF", "ANO_ELEICAO", "VR_BEM_CANDIDATO", "DS_TIPO_BEM_CANDIDATO", "DS_BEM_CANDIDATO", "NM_TIPO_ELEICAO"],
  financiamento: ["SQ_CANDIDATO", "SG_UF_CANDIDATURA", "ANO_ELEICAO", "VR_RECEITA", "DS_FONTE_RECEITA", "DS_ORIGEM_RECEITA", "DS_TIPO_RECEITA", "NM_DOADOR", "NM_DOADOR_RFB", "NM_DOADOR_ORIGINARIO", "DS_TIPO_DOADOR"],
}

function identityRows(rows: readonly Row[], candidate: Candidate, year: number, officialUf?: ReadonlyMap<string, string | null>): Row[] {
  const sq = text(candidate.ids?.tse_sq_candidato?.[String(year)])
  const seedUf = text(candidate.ids?.tse_uf_candidatura?.[String(year)]).toUpperCase()
  const observedUf = sq ? officialUf?.get(`${year}|${sq}`) : undefined
  const verifiedPriorUf = text(candidate.ids?.tse_divulga_prior_uf?.[String(year)]).toUpperCase()
  if (observedUf === null && (!verifiedPriorUf || verifiedPriorUf !== seedUf)) return []
  if (seedUf && observedUf && seedUf !== observedUf) return []
  const uf = seedUf || observedUf || ""
  if (!sq) return []
  if (!uf) return []
  const matched = rows.filter((row) => rowSq(row) === sq && rowYear(row, year) === year && rowUf(row) === uf)
  if (observedUf !== null) return matched
  const signatures = new Set(matched.map((row) => [row.SG_UE, row.NR_CANDIDATO, row.DS_CARGO, row.SG_PARTIDO].join("|")))
  return matched.every((row) => row.NR_CANDIDATO && row.DS_CARGO && row.SG_PARTIDO) && signatures.size === 1 ? matched : []
}

function normalized(value: unknown): string {
  return stripAccents(text(value)).replace(/\s+/g, " ").toUpperCase()
}

function publicFamilyEntries(profile: CoverageProfile, family: TseFamily): Record<string, unknown>[] {
  const key = family === "historico_politico" ? "historico" : family === "patrimonio" ? "patrimonio_eleicoes" : family === "financiamento" ? "financiamento_eleicoes" : ""
  const value = key ? profile[key] : null
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : []
}

function sourceScopedPublicRows(profile: CoverageProfile, family: TseFamily): number {
  if (family !== "historico_politico") return publicFamilyRowCount(profile, family)
  return publicFamilyEntries(profile, family).filter((row) => normalized(row.proveniencia) === "TSE" && normalized(row.tipo_evento) === "CANDIDATURA").length
}

export function money(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : Number.NaN
  const value = typeof raw === "string" ? raw.trim() : ""
  if (!value || value === "#NULO#" || value === "#NE#" || value === "-1") return Number.NaN
  const parsed = value.includes(",") ? Number(value.replace(/\./g, "").replace(",", ".")) : Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function numberEqual(left: number, right: number): boolean { return Math.abs(left - right) < 0.005 }

function comparePatrimonio(profile: CoverageProfile, rows: readonly Row[], officialCargo?: ReadonlyMap<string, string | null>): boolean {
  const raw = Array.isArray(profile.patrimonio) ? profile.patrimonio.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : []
  const series = publicFamilyEntries(profile, "patrimonio")
  const byYear = new Map<number, { total: number; bens: Array<{ tipo: string; descricao: string; valor: number }> }>()
  for (const row of rows) {
    const year = rowYear(row, 0)
    if (!year) return false
    const item = byYear.get(year) ?? { total: 0, bens: [] }
    const value = money(row.VR_BEM_CANDIDATO || row.VR_BEM || row.VALOR_BEM)
    item.total += value
    let tipo: string
    let descricao: string
    try {
      tipo = sanitizeTseLegacyAssetText(text(row.DS_TIPO_BEM_CANDIDATO || row.TP_BEM_CANDIDATO), "bem:tipo")
      descricao = sanitizeTseLegacyAssetText(maskDocumentLikeSequences(text(row.DS_BEM_CANDIDATO || row.DS_BEM)), "bem:descricao")
    } catch { return false }
    item.bens.push({ tipo: normalized(tipo), descricao: normalized(descricao), valor: value })
    byYear.set(year, item)
  }
  if (byYear.size === 0) return false
  for (const [year, expected] of byYear) {
    // A série pode conter outros pleitos sem bens; eles permanecem visíveis
    // como vazio confirmado ou ainda não coletado (DTO: buildPatrimonioEleicoes).
    const matching = raw.filter((candidate) => Number(candidate.ano_eleicao ?? candidate.ano) === year)
    if (matching.length !== 1) return false
    const item = matching[0]
    const source = rows.find((row) => rowYear(row, 0) === year)!
    const cargo = officialCargo?.get(`${year}|${rowSq(source)}|${rowUf(source)}`)
    if (officialCargo && !cargo) return false
    if (cargo && normalized(canonicalCargo(text(item?.cargo_candidatura))) !== normalized(canonicalCargo(cargo))) return false
    if (text(source.NM_TIPO_ELEICAO) && normalized(item?.tipo_eleicao) !== normalized(source.NM_TIPO_ELEICAO)) return false
    const publicBens = Array.isArray(item?.bens) ? item.bens : []
    const actualBens = publicBens.map((bem) => ({ tipo: normalized((bem as Record<string, unknown>).tipo), descricao: normalized((bem as Record<string, unknown>).descricao), valor: money((bem as Record<string, unknown>).valor) }))
    if (!item || !numberEqual(money(item.valor_total), expected.total) || actualBens.length !== expected.bens.length) return false
    const left = expected.bens.map(stable).sort()
    const right = actualBens.map(stable).sort()
    if (left.some((value, index) => value !== right[index])) return false
  }
  return [...byYear.keys()].every((year) => series.filter((entry) => Number(entry.ano) === year).length === 1 &&
    series.some((entry) => Number(entry.ano) === year && text(entry.estado) === "publicado"))
}

function compareFinanciamento(profile: CoverageProfile, rows: readonly Row[], officialCargo?: ReadonlyMap<string, string | null>): boolean {
  const raw = Array.isArray(profile.financiamento) ? profile.financiamento.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : []
  const series = publicFamilyEntries(profile, "financiamento")
  type FinanceExpected = { total: number; fundo_partidario: number; fundo_eleitoral: number; pessoa_fisica: number; recursos_proprios: number; nao_informado: number; doadores: Array<{ nome: string; valor: number; tipo: "PF" | "PJ" | "fundo_partidario" | "fundo_eleitoral" | "recursos_proprios" }> }
  const byYear = new Map<number, FinanceExpected>()
  const futureMarkers = new Set<number>()
  const seenReceipts = new Set<string>()
  for (const row of rows) {
    const year = rowYear(row, 0)
    if (!year) return false
    const value = money(row.VR_RECEITA || row.VALOR_RECEITA || row["Valor receita"])
    if (!Number.isFinite(value)) return false
    const donorName = text(row.NM_DOADOR || row.NM_DOADOR_RFB || row["Nome do doador"] || row.NO_DOADOR || row.NM_DOADOR_ORIGINARIO)
    if (year === 2026 && text(row.SQ_RECEITA) === "-1" && value === 0 && /^#(?:NULO|NE)#?$/i.test(donorName)) {
      futureMarkers.add(year)
      continue
    }
    const receiptDigest = text(row.__receipt_dedup_sha256)
    if (receiptDigest && seenReceipts.has(receiptDigest)) continue
    if (receiptDigest) seenReceipts.add(receiptDigest)
    const item = byYear.get(year) ?? { total: 0, fundo_partidario: 0, fundo_eleitoral: 0, pessoa_fisica: 0, recursos_proprios: 0, nao_informado: 0, doadores: [] }
    item.total += value
    const origin = [row.DS_FONTE_RECEITA || row["Fonte recurso"], row.DS_ORIGEM_RECEITA || row["Tipo receita"]].filter(Boolean).join(" — ")
    const category = classifyFinanciamentoOrigem(origin)
    if (category !== "outros") item[category] += value
    if (categoriaFinanciamentoExibida(row.DS_FONTE_RECEITA || row["Fonte recurso"], row.DS_ORIGEM_RECEITA || row["Tipo receita"]) === "nao_informado_pelo_tse") item.nao_informado += value
    if (donorName) item.doadores.push({ nome: donorName, valor: value,
      tipo: category === "fundo_eleitoral" || category === "fundo_partidario" || category === "recursos_proprios"
        ? category : row.__donor_kind === "PF" ? "PF" : row.__donor_kind === "PJ" ? "PJ" : category === "pessoa_fisica" ? "PF" : "PJ" })
    byYear.set(year, item)
  }
  if (byYear.size === 0 && futureMarkers.size === 0) return false
  for (const year of futureMarkers) {
    if (byYear.has(year)) continue
    const displayedYear = series.filter((entry) => Number(entry.ano) === year)
    // O marcador não cria pleito: a série exibida é ancorada nas candidaturas
    // elegíveis por buildFinanciamentoEleicoes/anosDePleitoDisputado.
    if (raw.some((item) => Number(item.ano_eleicao ?? item.ano) === year) ||
      (displayedYear.length > 0 && (displayedYear.length !== 1 || text(displayedYear[0]?.estado) !== "pleito_futuro"))) return false
  }
  for (const [year, expected] of byYear) {
    const matching = raw.filter((candidate) => Number(candidate.ano_eleicao ?? candidate.ano) === year)
    if (matching.length !== 1) return false
    const item = matching[0]!
    const source = rows.find((row) => rowYear(row, 0) === year)!
    const cargo = officialCargo?.get(`${year}|${rowSq(source)}|${rowUf(source)}`)
    if (officialCargo && !cargo) return false
    if (cargo && normalized(canonicalCargo(text(item.cargo_candidatura))) !== normalized(canonicalCargo(cargo))) return false
    if (!numberEqual(money(item.total_arrecadado ?? 0), expected.total) ||
      !numberEqual(money(item.total_fundo_partidario ?? 0), expected.fundo_partidario) ||
      !numberEqual(money(item.total_fundo_eleitoral ?? 0), expected.fundo_eleitoral) ||
      !numberEqual(money(item.total_pessoa_fisica ?? 0), expected.pessoa_fisica) ||
      !numberEqual(money(item.total_recursos_proprios ?? 0), expected.recursos_proprios)) return false
    const publicCategories = item.categorias_origem && typeof item.categorias_origem === "object" ? item.categorias_origem as Record<string, unknown> : {}
    if (Object.keys(publicCategories).length > 0) {
      const expectedCategories = {
        fundo_eleitoral: expected.fundo_eleitoral,
        fundo_partidario: expected.fundo_partidario,
        outros_recursos: expected.total - expected.fundo_eleitoral - expected.fundo_partidario - expected.nao_informado,
        nao_informado_pelo_tse: expected.nao_informado,
      }
      for (const [key, value] of Object.entries(expectedCategories)) {
        if (!numberEqual(money(publicCategories[key] ?? 0), value)) return false
      }
      if (Object.keys(publicCategories).some((key) => !(key in expectedCategories))) return false
    }
    const publicDonors = sanitizeMaioresDoadoresForPublic(item.maiores_doadores)
    const sourceDonors = sanitizeMaioresDoadoresForPublic(expected.doadores)
    const donorKey = (donor: { nome: string; valor: number; tipo: string }) => stable([normalized(donor.nome), money(donor.valor), normalized(donor.tipo)])
    if (publicDonors.length !== sourceDonors.length || publicDonors.some((donor, index) => donorKey(donor) !== donorKey(sourceDonors[index]!))) return false
    if (series.filter((entry) => Number(entry.ano) === year).length !== 1 || !series.some((entry) => Number(entry.ano) === year && text(entry.estado) === "publicado")) return false
  }
  return true
}

/** Compara somente projeções que possuem uma chave pública estável. Perfis exigem fontes externas e nunca fecham aqui. */
function comparePublicProjection(profile: CoverageProfile, family: TseFamily, rows: readonly Row[], officialCargo?: ReadonlyMap<string, string | null>): boolean {
  if (family === "perfil_atual") return false
  const publicRows = publicFamilyEntries(profile, family)
  if (publicRows.length === 0) return false
  if (family === "patrimonio") return comparePatrimonio(profile, rows, officialCargo)
  if (family === "financiamento") return compareFinanciamento(profile, rows, officialCargo)
  if (family === "historico_politico") {
    if (rows.length === 0) return false
    // Consulta_cand pode trazer dois turnos do mesmo pleito. A ficha publica
    // uma candidatura com o resultado definitivo, não uma linha por turno.
    const best = new Map<string, Row>()
    for (const row of rows) {
      const year = rowYear(row, 0)
      const cargo = normalized(canonicalCargo(text(row.DS_CARGO)))
      if (!year || !cargo || /SUPLENTE/.test(cargo)) continue
      const result = parseEleitoStatus(text(row.DS_SIT_TOT_TURNO))
      if (shouldOmitFromHistoricoDescricao(result.descricao)) continue
      const key = stable([year, cargo, rowUf(row)])
      const prior = best.get(key)
      if (!prior || Number(row.NR_TURNO || 1) > Number(prior.NR_TURNO || 1)) best.set(key, row)
    }
    if (best.size === 0) return false
    const scopedYears = new Set([...best.values()].map((row) => rowYear(row, 0)))
    const published = publicRows.filter((row) => normalized(row.proveniencia) === "TSE" && normalized(row.tipo_evento) === "CANDIDATURA" && scopedYears.has(Number(row.periodo_inicio)))
    if (published.length !== best.size) return false
    const used = new Set<Record<string, unknown>>()
    for (const source of best.values()) {
      const year = rowYear(source, 0)
      const cargo = normalized(canonicalCargo(text(source.DS_CARGO)))
      const party = resolveCanonicalParty(text(source.SG_PARTIDO))?.sigla ?? text(source.SG_PARTIDO)
      const result = parseEleitoStatus(text(source.DS_SIT_TOT_TURNO))
      const match = published.find((row) => !used.has(row) && Number(row.periodo_inicio) === year &&
        normalized(canonicalCargo(text(row.cargo_canonico ?? row.cargo))) === cargo &&
        normalized(row.partido) === normalized(party) && normalized(row.estado) === rowUf(source))
      if (!match) return false
      const observation = normalized(match.observacoes)
      if (text(source.DS_SIT_TOT_TURNO) && !observation.includes(normalized(result.descricao))) return false
      const expectedResult = resolveResultadoEleitoral({ eleito_por: text(source.DS_SIT_TOT_TURNO), observacoes: `Resultado eleitoral: ${result.descricao}` })
      const actualResult = resolveResultadoEleitoral({ eleito_por: text(match.eleito_por), observacoes: text(match.observacoes) })
      if (actualResult.resultado !== expectedResult.resultado) return false
      const registration = normalized(source.DS_SITUACAO_CANDIDATURA)
      if (registration && !/^(#NE|#NULO#?|DEFERIDO|APTO|REGULAR)$/.test(registration) && !observation.includes(registration)) return false
      used.add(match)
    }
    return true
  }
  return false
}

export async function manifestAssets(raw: Manifest): Promise<SourceAsset[]> {
  if (!raw || !Array.isArray(raw.assets) || raw.assets.length === 0) throw new Error("manifesto sem assets")
  const assets = raw.assets.map((asset) => ({ ...asset, path: resolve(asset.path), url: text(asset.url), sha256: text(asset.sha256).toLowerCase() }))
  const checkedPaths = new Map<string, string>()
  for (const asset of assets) {
    if (!TSE_FAMILIES.includes(asset.family) || !Number.isInteger(asset.year) || !existsSync(asset.path) ||
      !validOfficialUrl(asset.url) || !validSha(asset.sha256)) throw new Error(`asset inválido: ${JSON.stringify({ family: asset.family, year: asset.year, url: asset.url })}`)
    let actual = checkedPaths.get(asset.path)
    if (!actual) {
      actual = await sha256File(asset.path)
      checkedPaths.set(asset.path, actual)
    }
    if (actual !== asset.sha256) throw new Error(`SHA-256 divergente: ${asset.path}`)
  }
  return assets
}

function sourceRevision(assets: readonly SourceAsset[]): Array<{ year: number; url: string; sha256: string }> {
  return [...assets].sort((a, b) => a.year - b.year || a.url.localeCompare(b.url)).map(({ year, url, sha256 }) => ({ year, url, sha256 }))
}

function parseReadback(path: string | undefined): Map<string, MaterializedReadback> {
  if (!path) return new Map()
  const raw = JSON.parse(readFileSync(path, "utf8")) as { rows?: MaterializedReadback[] }
  if (!Array.isArray(raw.rows)) throw new Error("readback materializado deve ter rows[]")
  const map = new Map<string, MaterializedReadback>()
  for (const row of raw.rows) {
    if (!TSE_FAMILIES.includes(row.family) || !row.slug || !row.candidato_id || !row.public_profile) throw new Error("linha de readback inválida")
    map.set(`${row.slug}|${row.family}`, row)
  }
  return map
}

/** Reutiliza o snapshot público já relido para a matriz; IDs vêm só do seed. */
export function readbackFromPublicProfiles(path: string, candidates: readonly Candidate[]): Map<string, MaterializedReadback> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!Array.isArray(parsed)) throw new Error("--public-profiles exige a lista de perfis públicos relidos")
  const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]))
  const map = new Map<string, MaterializedReadback>()
  const seen = new Set<string>()
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("perfil público inválido")
    const profile = raw as CoverageProfile
    const slug = text(profile.slug)
    const id = text(profile.id)
    if (!slug || !id || seen.has(slug)) throw new Error("slug/id público ausente ou duplicado")
    seen.add(slug)
    if (!bySlug.has(slug)) throw new Error(`perfil público fora da coorte local: ${slug}`)
    for (const family of TSE_FAMILIES) {
      map.set(`${slug}|${family}`, { slug, family, candidato_id: id, public_profile: profile })
    }
  }
  return map
}

export function buildReceipt(input: {
  candidate: Candidate; family: TseFamily; assets: readonly SourceAsset[]; sourceRowsByAsset: ReadonlyMap<string, readonly Row[]>; readback?: MaterializedReadback
  officialUf?: ReadonlyMap<string, string | null>
  officialCargo?: ReadonlyMap<string, string | null>
  contextAssets?: readonly SourceAsset[]
  checkedAt: string
}): { receipt: Record<string, unknown>; reason: string } {
  const { candidate, family, assets, sourceRowsByAsset, readback, officialUf, officialCargo, contextAssets, checkedAt } = input
  const candidateId = text(candidate.id || candidate.candidato_id || readback?.candidato_id || readback?.public_profile?.id)
  const ufMissing = assets.some((asset) => {
    const sq = text(candidate.ids?.tse_sq_candidato?.[String(asset.year)])
    const seedUf = text(candidate.ids?.tse_uf_candidatura?.[String(asset.year)]).toUpperCase()
    const observedUf = sq ? officialUf?.get(`${asset.year}|${sq}`) : undefined
    const verifiedPriorUf = text(candidate.ids?.tse_divulga_prior_uf?.[String(asset.year)]).toUpperCase()
    return !sq || (observedUf === null && (!verifiedPriorUf || verifiedPriorUf !== seedUf)) || (!seedUf && !observedUf) || Boolean(seedUf && observedUf && seedUf !== observedUf)
  })
  const knownYears = Object.keys(candidate.ids?.tse_sq_candidato ?? {}).map(Number).filter(Number.isInteger)
  // Os pacotes de bens iniciam em 2006 e os de contas em 2002. A API não
  // exibe uma linha de bens/contas de um pleito anterior como publicada.
  const firstOfficialYear = family === "patrimonio" ? 2006 : family === "financiamento" ? 2002 : 0
  const requiredYears = family === "perfil_atual" ? knownYears.slice().sort((a, b) => b - a).slice(0, 1)
    : knownYears.filter((year) => year >= firstOfficialYear)
  const manifestComplete = requiredYears.every((year) => assets.some((asset) => asset.year === year))
  const matches = assets.flatMap((asset) => identityRows(sourceRowsByAsset.get(`${asset.family}|${asset.year}|${asset.path}`) ?? [], candidate, asset.year, officialUf)
    .map((row) => ({ ...row, ANO_ELEICAO: row.ANO_ELEICAO || String(asset.year) })))
  const digest = canonicalDigest(matches, FIELDS[family])
  const revision = sourceRevision(assets)
  const publicDigest = readback ? publicFamilyPayloadSha256(readback.public_profile, family) : null
  const publicRows = readback ? sourceScopedPublicRows(readback.public_profile, family) : 0
  const sourceMatch = readback ? comparePublicProjection(readback.public_profile, family, matches, officialCargo) : false
  const readbackOk = Boolean(readback && readback.candidato_id === candidateId && readback.public_profile.slug === candidate.slug && readback.public_profile.id === candidateId && sourceMatch && publicRows > 0)
  const profileCoreOk = family !== "perfil_atual" || Boolean(readback?.core_fields && CORE_FIELDS.every((field) => readback.core_fields?.includes(field)))
  const found = manifestComplete && !ufMissing && matches.length > 0 && readbackOk && profileCoreOk
  const reason = found ? "ok" : !candidateId ? "candidate_id_missing" : !manifestComplete ? "source_manifest_incomplete" : ufMissing ? "uf_identity_missing" : matches.length === 0 ? "official_row_missing_or_identity_mismatch" : !readbackOk ? "materialized_readback_missing_or_digest_mismatch" : "profile_core_fields_or_external_sources_missing"
  const fonte = TSE_SOURCE_BY_FAMILY[family]
  return {
    reason,
    receipt: {
      fonte, escopo: "candidato", alvo: candidate.slug, candidato_id: candidateId || null, resultado: found ? "encontrado" : "indeterminado", volume: found ? matches.length : 0,
      url: revision[0]?.url ?? null, executado_em: checkedAt,
      detalhe: JSON.stringify({
        contract_version: 1, family, source_revision: revision,
        ...(contextAssets?.length ? { official_context_revisions: sourceRevision(contextAssets) } : {}),
        identity_contract: { match: "SQ_CANDIDATO+UF+ANO_ELEICAO", matched_rows: matches.length },
        coverage_proof: {
          contract_version: 1,
          family,
          method: "official-source-to-public-readback",
          ...(family === "historico_politico" ? { scope: "tse-candidacies" } : family === "patrimonio" || family === "financiamento" ? { scope: "display-series" } : {}),
          source_revisions: revision,
          public_payload_sha256: publicDigest,
          source_rows: matches.length,
          public_rows: publicRows,
          matched_rows: readbackOk ? publicRows : 0,
          unmatched_rows: readbackOk ? 0 : publicRows,
          scope_complete: manifestComplete && readbackOk && profileCoreOk,
          identity: { key: "SQ_CANDIDATO+UF+ANO_ELEICAO", slug: candidate.slug, candidate_id: candidateId || null, source_id: text(candidate.ids?.tse_sq_candidato?.[String(assets[0]?.year)]) || "" },
        },
        materialized_readback: { required: true, provided: Boolean(readback), row_count: publicRows, canonical_digest: publicDigest, source_canonical_digest: digest, equal: readbackOk },
        profile_core_fields: family === "perfil_atual" ? { required: [...CORE_FIELDS], complete: profileCoreOk, external_sources_required: ["wikipedia", "wikidata"] } : undefined,
        canonical_fields: FIELDS[family], freshness_days: null,
      }),
    },
  }
}

async function main(): Promise<void> {
  const manifestPath = arg("manifest")!
  const outPath = arg("out")!
  const candidatePath = arg("candidates", false) ?? resolve("data/candidatos.json")
  const checkedAt = process.argv.find((item) => item.startsWith("--checked-at="))?.slice("--checked-at=".length) ?? new Date().toISOString()
  if (!Number.isFinite(Date.parse(checkedAt))) throw new Error("--checked-at inválido")
  const candidates = JSON.parse(readFileSync(candidatePath, "utf8")) as Candidate[]
  const assets = await manifestAssets(JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest)
  const materializedPath = arg("materialized", false)
  const publicProfilesPath = arg("public-profiles", false)
  if (materializedPath && publicProfilesPath) throw new Error("use somente um de --materialized e --public-profiles")
  const readback = publicProfilesPath ? readbackFromPublicProfiles(publicProfilesPath, candidates) : parseReadback(materializedPath)
  const writerPlanPath = arg("writer-plan", false)
  const writerActions = writerPlanPath
    ? (JSON.parse(readFileSync(writerPlanPath, "utf8")) as { acoes?: AuditedAction[] }).acoes ?? []
    : []
  const rowsByAsset = new Map<string, Row[]>()
  const parsedZip = new Map<string, Row[]>()
  const wantedSq = new Set(candidates.flatMap((candidate) => Object.values(candidate.ids?.tse_sq_candidato ?? {})))
  for (const asset of assets) {
    const parserFamily = asset.family === "perfil_atual" || asset.family === "historico_politico" ? "consulta_cand" : asset.family
    const key = `${asset.path}|${parserFamily}`
    let rows = parsedZip.get(key)
    if (!rows) {
      rows = await readRows(asset.path, asset.family, wantedSq, asset.year)
      parsedZip.set(key, rows)
    }
    rowsByAsset.set(`${asset.family}|${asset.year}|${asset.path}`, rows)
  }
  const wanted = new Set(candidates.flatMap((candidate) => Object.entries(candidate.ids?.tse_sq_candidato ?? {}).map(([year, sq]) => `${year}|${sq}`)))
  const officialUf = new Map<string, string | null>()
  const officialCargo = new Map<string, string | null>()
  for (const asset of assets.filter((item) => item.family === "perfil_atual" || item.family === "historico_politico")) {
    for (const row of rowsByAsset.get(`${asset.family}|${asset.year}|${asset.path}`) ?? []) {
      const key = `${rowYear(row, asset.year)}|${rowSq(row)}`
      if (!wanted.has(key)) continue
      const uf = rowUf(row)
      if (!uf) continue
      const prior = officialUf.get(key)
      officialUf.set(key, prior === undefined || prior === uf ? uf : null)
      const contextKey = `${key}|${uf}`
      const cargo = text(row.DS_CARGO)
      if (cargo) {
        const old = officialCargo.get(contextKey)
        officialCargo.set(contextKey, old === undefined || normalized(canonicalCargo(old ?? "")) === normalized(canonicalCargo(cargo)) ? cargo : null)
      }
    }
  }
  const receipts: Record<string, unknown>[] = []
  const diagnostics: Array<{ slug: string; family: TseFamily; reason: string }> = []
  const applyProjection: Array<{ slug: string; family: TseFamily; writer_actions: string[]; post_write_readback_matches: boolean; reason: string }> = []
  for (const candidate of candidates) {
    if (!candidate.slug) continue
    for (const family of TSE_FAMILIES) {
      const familyAssets = assets.filter((asset) => asset.family === family && candidate.ids?.tse_sq_candidato?.[String(asset.year)])
      if (familyAssets.length === 0) continue
      const contextAssets = assets.filter((asset) => (asset.family === "historico_politico" || asset.family === "perfil_atual") && candidate.ids?.tse_sq_candidato?.[String(asset.year)])
      const built = buildReceipt({ candidate, family, assets: familyAssets, contextAssets, sourceRowsByAsset: rowsByAsset, officialUf, officialCargo, readback: readback.get(`${candidate.slug}|${family}`), checkedAt })
      receipts.push(built.receipt)
      if (built.reason !== "ok") diagnostics.push({ slug: candidate.slug, family, reason: built.reason })
      if (writerPlanPath && (family === "patrimonio" || family === "financiamento" || family === "historico_politico")) {
        const current = readback.get(`${candidate.slug}|${family}`)
        const familyActions = writerActions.filter((action) => family === "patrimonio"
          ? action.tipo === "inserir_patrimonio" || action.tipo === "substituir_patrimonio" || action.tipo === "apagar_ausencia_patrimonio"
          : family === "historico_politico" ? action.tipo === "substituir_historico"
            : action.tipo === "inserir_financiamento" || action.tipo === "atualizar_financiamento" || action.tipo === "substituir_financiamento" || action.tipo === "apagar_verificacao")
        const simulated = current ? projectAuditedFinanceReadback(current.public_profile, familyActions) : null
        const after = simulated && current ? buildReceipt({ candidate, family, assets: familyAssets, contextAssets, sourceRowsByAsset: rowsByAsset, officialUf, officialCargo,
          readback: { ...current, public_profile: simulated.profile }, checkedAt }) : null
        const validProof = Boolean(after && simulated && after.reason === "ok" &&
          validCoverageSourceProof(simulated.profile, family, { ...after.receipt, ...JSON.parse(String(after.receipt.detalhe)) }))
        applyProjection.push({ slug: candidate.slug, family, writer_actions: simulated?.applied ?? [],
          post_write_readback_matches: validProof, reason: !after ? "snapshot_missing" : after.reason === "ok" && !validProof ? "coverage_proof_invalid" : after.reason })
      }
    }
  }
  const output = { schema_version: 1, generated_at: checkedAt, source: "TSE Dados Abertos", receipts, diagnostics,
    ...(writerPlanPath ? { apply_projection: applyProjection } : {}),
    contract: { identity: "SQ_CANDIDATO+UF+ANO_ELEICAO", raw_rows_emitted: false, source_revision_is_array: true, materialized_readback_digest: "sha256(stable(canonical selected fields))" } }
  mkdirSync(dirname(outPath), { recursive: true })
  const temporary = `${outPath}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  renameSync(temporary, outPath)
  console.log(JSON.stringify({ receipts: receipts.length, diagnostics: diagnostics.length, families: TSE_FAMILIES }))
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
