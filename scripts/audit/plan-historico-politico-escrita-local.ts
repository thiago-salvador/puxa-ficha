/**
 * Gera um plano local, somente leitura, para completar candidaturas TSE na ficha.
 * Cada pacote precisa vir de manifesto oficial com SHA-256; nenhuma conexão ao
 * banco é feita aqui. O consumidor do plano deve revalidar o preimage antes da
 * escrita e registrar backup, readback e recibo.
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "csv-parse"
import { canonicalCargo } from "../../src/lib/cargo-utils"
import { stripAccents } from "../../src/lib/strip-accents"
import { resolveCanonicalParty } from "../lib/party-canonical"
import { parseEleitoStatus, shouldOmitFromHistoricoDescricao } from "../lib/tse-historico-regras"
import { assertOutsideRepository } from "./lib/private-output"
import { minimalChildEnv } from "../lib/minimal-child-env"
import { sourceAssetsComplete } from "./lib/source-completeness"

export const HISTORICO_DISPLAY_FIELDS = [
  "cargo", "cargo_canonico", "tipo_evento", "periodo_inicio", "periodo_fim",
  "partido", "estado", "eleito_por", "observacoes",
] as const

type SourceRow = Record<string, string | undefined>
type Asset = { family: string; year: number; path: string; url: string; sha256: string }
type Candidate = { id?: string; slug: string; ids?: { tse_sq_candidato?: Record<string, string | number>; tse_uf_candidatura?: Record<string, string>; tse_divulga_prior_uf?: Record<string, string> } }
type Profile = { id?: string; slug: string; historico?: Array<Record<string, unknown>> }
type Cell = { slug: string; family: string; category: string; reason?: string }
type ReviewItem = { slug: string; tipo: string; motivo?: string; proveniencia?: string | null; ano?: number; cargo?: string | null; uf?: string | null }
export type HistoricalAction = {
  tipo: "substituir_historico"
  slug: string
  candidato_id: string
  antes_publico: Array<Record<string, unknown>>
  antes_sha256: string
  depois: Array<Record<string, unknown>>
  fonte: "tse-historico"
  source_revisions: Array<{ year: number; url: string; sha256: string }>
  source_complete: true
  classification: "a"
}
export type HistoricalReview = { slug: string; classification: "b" | "c"; reason: string }
export type HistoricalPlan = {
  schema_version: 1
  mode: "dry-run"
  source: "TSE Dados Abertos"
  actions: HistoricalAction[]
  review: HistoricalReview[]
  review_evidence: { rule_profiles: number; reviewed_rows: number; rows_with_package: number; rows_with_sq: number; rows_with_resolved_uf: number; rows_with_exact_official_context: number; rows_with_same_cargo: number }
  summary: { safe_class_a: number; identity_class_b: number; rule_class_c: number; source_rows: number }
}

const OFFICIAL_PREFIX = "https://cdn.tse.jus.br/"
const RULE_REVIEW_TYPES = new Set(["linha_diverge", "linha_sem_registro_oficial"])

function text(value: unknown): string { return typeof value === "string" ? value.trim() : "" }
function normalize(value: unknown): string { return stripAccents(text(value)).toUpperCase().replace(/\s+/g, " ") }
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex") }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}
function projected(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(HISTORICO_DISPLAY_FIELDS.map((field) => [field, row[field] ?? null]))
}
function digestRows(rows: readonly Record<string, unknown>[]): string {
  return sha256(stable(rows.map(projected).sort((a, b) => stable(a).localeCompare(stable(b)))))
}
function cellsFor(slug: string, cells: readonly Cell[]): Cell[] {
  return cells.filter((cell) => cell.slug === slug && cell.family === "historico_politico")
}
function reviewFor(slug: string, items: readonly ReviewItem[]): ReviewItem[] { return items.filter((item) => item.slug === slug) }
function sourceUf(row: SourceRow): string {
  return text(row.SG_UF || row.SG_UF_CANDIDATURA || row.UF || row.SG_UE_SUPERIOR || row.UNIDADE_ELEITORAL_CANDIDATO || row.SG_UE).toUpperCase()
}
function verifiedCandidateUf(candidate: Candidate, year: number, sq: string, rows: readonly SourceRow[]): string | null {
  const seedUf = text(candidate.ids?.tse_uf_candidatura?.[String(year)]).toUpperCase()
  const priorUf = text(candidate.ids?.tse_divulga_prior_uf?.[String(year)]).toUpperCase()
  const matched = rows.filter((row) => text(row.SQ_CANDIDATO) === sq && Number(text(row.ANO_ELEICAO) || year) === year)
  const observed = new Set(matched.map(sourceUf).filter(Boolean))
  const officialUf = observed.size === 1 ? [...observed][0]! : observed.size > 1 ? null : undefined
  if (officialUf === null && (!priorUf || priorUf !== seedUf)) return null
  if (seedUf && officialUf && seedUf !== officialUf) return null
  const uf = seedUf || officialUf || ""
  if (!uf) return null
  const scoped = matched.filter((row) => sourceUf(row) === uf)
  if (!scoped.length) return null
  if (officialUf !== null) return uf
  const signatures = new Set(scoped.map((row) => [row.SG_UE, row.NR_CANDIDATO, row.DS_CARGO, row.SG_PARTIDO].join("|")))
  return scoped.every((row) => row.NR_CANDIDATO && row.DS_CARGO && row.SG_PARTIDO) && signatures.size === 1 ? uf : null
}

export function classifyHistoryTarget(slug: string, cells: readonly Cell[], reviewItems: readonly ReviewItem[]): HistoricalReview | null {
  const ownCells = cellsFor(slug, cells)
  if (ownCells.some((cell) => cell.category === "identity_review") || reviewFor(slug, reviewItems).some((item) => item.tipo === "identidade")) {
    return { slug, classification: "b", reason: "identidade_em_revisao" }
  }
  if (!ownCells.some((cell) => cell.category === "stale_not_projected")) return { slug, classification: "c", reason: "sem_celula_historica_segura_para_planejar" }
  const ruleItem = reviewFor(slug, reviewItems).find((item) => RULE_REVIEW_TYPES.has(item.tipo) || (item.tipo === "linha_sem_fonte_oficial" && normalize(item.proveniencia) === "TSE"))
  if (ruleItem) return { slug, classification: "c", reason: `regra_ou_vinculo_historico_em_revisao:${ruleItem.tipo}` }
  if (ownCells.some((cell) => cell.category !== "stale_not_projected" && cell.category !== "closed_now")) {
    return { slug, classification: "c", reason: "categoria_historica_fora_de_a" }
  }
  return null
}

function publicTseRows(profile: Profile): Array<Record<string, unknown>> {
  return (Array.isArray(profile.historico) ? profile.historico : []).filter((row) =>
    normalize(row.proveniencia) === "TSE" && normalize(row.tipo_evento) === "CANDIDATURA",
  ).map(projected)
}

function observation(registrationRaw: string, resultDescription: string): string {
  const registration = text(registrationRaw)
  const result = text(resultDescription) || "Resultado não informado"
  const displayedRegistration = !registration || registration === "#NE" || registration === "#NULO#" ? "não informada" : registration
  const displayedResult = result.startsWith("Resultado") ? result : `Resultado eleitoral: ${result}`
  return `Situação do registro: ${displayedRegistration}. ${displayedResult}`
}

function displayRow(row: SourceRow, year: number): Record<string, unknown> | null {
  const cargoRaw = text(row.DS_CARGO)
  const cargo = canonicalCargo(cargoRaw)
  const uf = text(row.SG_UF).toUpperCase()
  const partidoRaw = text(row.SG_PARTIDO)
  const result = parseEleitoStatus(text(row.DS_SIT_TOT_TURNO))
  if (!cargo || !uf || shouldOmitFromHistoricoDescricao(result.descricao) || /SUPLENTE/i.test(cargo)) return null
  const partido = resolveCanonicalParty(partidoRaw)?.sigla ?? partidoRaw
  return {
    cargo, cargo_canonico: cargo, tipo_evento: "candidatura", periodo_inicio: year,
    periodo_fim: year, partido: partido || null, estado: uf, eleito_por: result.descricao === "Resultado não informado" ? null : result.descricao,
    observacoes: observation(text(row.DS_SITUACAO_CANDIDATURA), result.descricao),
    proveniencia: "tse",
  }
}

function selectOfficialRows(rows: readonly SourceRow[], year: number, sq: string, expectedUf: string | null): { rows: Array<Record<string, unknown>>; reason?: string } {
  const selected = rows.filter((row) => text(row.SQ_CANDIDATO) === sq && Number(text(row.ANO_ELEICAO) || year) === year)
  if (selected.length === 0) return { rows: [], reason: "sq_ausente_no_pacote" }
  if (!expectedUf) return { rows: [], reason: "uf_ausente_ou_ambigua_para_sq_ano" }
  const scopedRows = selected.filter((row) => sourceUf(row) === expectedUf)
  if (!scopedRows.length) return { rows: [], reason: "uf_ausente_ou_ambigua_para_sq_ano" }
  const best = new Map<string, { row: Record<string, unknown>; turn: number; key: string }>()
  for (const source of scopedRows) {
    const item = displayRow(source, year)
    if (!item) continue
    const key = stable([year, item.cargo_canonico, item.estado])
    const turn = Number(text(source.NR_TURNO) || 1)
    const sourceKey = stable(projected(item))
    const prior = best.get(key)
    if (prior && prior.turn === turn && prior.key !== sourceKey) return { rows: [], reason: "resultado_ou_situacao_ambigua_no_mesmo_turno" }
    if (!prior || turn > prior.turn) best.set(key, { row: item, turn, key: sourceKey })
  }
  return { rows: [...best.values()].map((entry) => entry.row).sort((a, b) => stable(a).localeCompare(stable(b))) }
}

export function buildHistoryPlan(input: {
  sourceComplete?: boolean
  riskSlugs?: ReadonlySet<string>
  candidates: readonly Candidate[]
  profiles: readonly Profile[]
  cells: readonly Cell[]
  reviewItems: readonly ReviewItem[]
  assets: readonly Asset[]
  rowsByYear: ReadonlyMap<number, readonly SourceRow[]>
}): HistoricalPlan {
  const candidates = new Map(input.candidates.map((candidate) => [candidate.slug, candidate]))
  const profiles = new Map(input.profiles.map((profile) => [profile.slug, profile]))
  const targetSlugs = [...new Set(input.cells.filter((cell) => cell.family === "historico_politico" && cell.category !== "closed_now").map((cell) => cell.slug))].sort()
  const actions: HistoricalAction[] = []
  const review: HistoricalReview[] = []
  let sourceRows = 0
  for (const slug of targetSlugs) {
    if (input.riskSlugs?.has(slug)) { review.push({ slug, classification: "b", reason: "identidade_em_revisao" }); continue }
    const blocked = classifyHistoryTarget(slug, input.cells, input.reviewItems)
    if (blocked) { review.push(blocked); continue }
    const candidate = candidates.get(slug)
    const profile = profiles.get(slug)
    const candidateId = text(profile?.id || candidate?.id)
    if (!candidate || !profile || !candidateId) { review.push({ slug, classification: "c", reason: "candidate_ou_readback_ausente" }); continue }
    const ids = candidate.ids?.tse_sq_candidato ?? {}
    const years = Object.keys(ids).map(Number).filter((year) => Number.isInteger(year) && year > 1900).sort((a, b) => a - b)
    if (!years.length) { review.push({ slug, classification: "c", reason: "sem_sq_oficial_por_ano" }); continue }
    const revisions: Array<{ year: number; url: string; sha256: string }> = []
    const expected: Array<Record<string, unknown>> = []
    let candidateSourceRows = 0
    let failed: string | null = null
    for (const year of years) {
      const sq = text(ids[String(year)])
      const asset = input.assets.find((item) => item.family === "historico_politico" && item.year === year)
      const officialRows = input.rowsByYear.get(year)
      if (!sq || !asset || !officialRows) { failed = `fonte_ou_sq_ausente:${year}`; break }
      const uf = verifiedCandidateUf(candidate, year, sq, officialRows)
      const result = selectOfficialRows(officialRows, year, sq, uf)
      if (result.reason) { failed = `${result.reason}:${year}`; break }
      expected.push(...result.rows)
      revisions.push({ year, url: asset.url, sha256: asset.sha256.toLowerCase() })
      candidateSourceRows += result.rows.length
    }
    if (failed) { review.push({ slug, classification: "c", reason: failed }); continue }
    if (!expected.length) { review.push({ slug, classification: "c", reason: "nenhuma_candidatura_exibivel_no_escopo" }); continue }
    sourceRows += candidateSourceRows
    const coveredYears = new Set(revisions.map((revision) => revision.year))
    const before = publicTseRows(profile).filter((row) => coveredYears.has(Number(row.periodo_inicio)))
    if (stable(before.map(projected).sort((a, b) => stable(a).localeCompare(stable(b)))) === stable(expected.map(projected).sort((a, b) => stable(a).localeCompare(stable(b))))) continue
    if (!input.sourceComplete) { review.push({ slug, classification: "c", reason: "pacote_oficial_completo_nao_comprovado" }); continue }
    if (before.length > expected.length * 1.25) { review.push({ slug, classification: "c", reason: "limite_reducao_candidaturas" }); continue }
    actions.push({ tipo: "substituir_historico", slug, candidato_id: candidateId, antes_publico: before,
      antes_sha256: digestRows(before), depois: expected, fonte: "tse-historico", source_revisions: revisions, source_complete: true, classification: "a" })
  }
  const ruleSlugs = new Set(review.filter((item) => item.classification === "c" && item.reason.startsWith("regra_ou_vinculo_historico_em_revisao:")).map((item) => item.slug))
  const relevantReviews = input.reviewItems.filter((item) => ruleSlugs.has(item.slug) &&
    (RULE_REVIEW_TYPES.has(item.tipo) || (item.tipo === "linha_sem_fonte_oficial" && normalize(item.proveniencia) === "TSE")))
  const reviewEvidence = { rule_profiles: ruleSlugs.size, reviewed_rows: relevantReviews.length, rows_with_package: 0, rows_with_sq: 0,
    rows_with_resolved_uf: 0, rows_with_exact_official_context: 0, rows_with_same_cargo: 0 }
  for (const item of relevantReviews) {
    const year = Number(item.ano)
    if (!Number.isInteger(year)) continue
    const asset = input.assets.find((entry) => entry.family === "historico_politico" && entry.year === year)
    if (!asset) continue
    reviewEvidence.rows_with_package++
    const candidate = candidates.get(item.slug)
    const sq = text(candidate?.ids?.tse_sq_candidato?.[String(year)])
    if (!sq) continue
    reviewEvidence.rows_with_sq++
    const rows = input.rowsByYear.get(year) ?? []
    const uf = candidate ? verifiedCandidateUf(candidate, year, sq, rows) : null
    if (!uf) continue
    reviewEvidence.rows_with_resolved_uf++
    const matches = rows.filter((row) => text(row.SQ_CANDIDATO) === sq && Number(text(row.ANO_ELEICAO) || year) === year && sourceUf(row) === uf)
    if (!matches.length) continue
    reviewEvidence.rows_with_exact_official_context++
    const reviewCargo = normalize(canonicalCargo(text(item.cargo)))
    if (reviewCargo && matches.some((row) => normalize(canonicalCargo(text(row.DS_CARGO))) === reviewCargo)) reviewEvidence.rows_with_same_cargo++
  }
  return { schema_version: 1, mode: "dry-run", source: "TSE Dados Abertos", actions, review,
    review_evidence: reviewEvidence,
    summary: { safe_class_a: actions.length, identity_class_b: review.filter((item) => item.classification === "b").length,
      rule_class_c: review.filter((item) => item.classification === "c").length, source_rows: sourceRows } }
}

function arg(args: string[], name: string): string {
  const value = args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3)
  if (!value) throw new Error(`argumento obrigatório: --${name}=<arquivo>`)
  return resolve(value)
}
function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T }
async function parseSourceRows(zipPath: string, year: number, wanted: ReadonlySet<string>): Promise<SourceRow[]> {
  let listing: string
  try { listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, env: minimalChildEnv() }) }
  catch { throw new Error(`não foi possível listar CSVs do pacote TSE de ${year}`) }
  const csvs = listing.split(/\r?\n/).filter((name) => /(?:^|\/)consulta_cand(?:_complementar)?_[^/]+\.csv$/i.test(name))
  const brasil = csvs.filter((name) => /(?:_|-)BRASIL\.csv$/i.test(name))
  const members = brasil.length === 1 ? brasil : csvs
  if (!members.length) throw new Error(`pacote ${year} sem consulta_cand CSV`)
  const rows: SourceRow[] = []
  for (const member of members) {
    const child = spawn("unzip", ["-p", zipPath, member], { stdio: ["ignore", "pipe", "ignore"], env: minimalChildEnv() })
    const parser = parse({ bom: true, columns: true, delimiter: ";", skip_empty_lines: true, relax_column_count: true, relax_quotes: true, encoding: "latin1", cast: (value: string) => value.trim() })
    child.stdout.pipe(parser)
    const completed = new Promise<void>((resolvePromise, rejectPromise) => {
      child.once("error", () => rejectPromise(new Error(`falha ao ler CSV TSE de ${year}`)))
      child.once("close", (code) => code === 0 ? resolvePromise() : rejectPromise(new Error(`falha ao extrair CSV TSE de ${year}`)))
    })
    try {
      for await (const raw of parser) {
        const row = raw as SourceRow
        if (wanted.has(`${Number(text(row.ANO_ELEICAO) || year)}|${text(row.SQ_CANDIDATO)}`)) {
      rows.push({ SQ_CANDIDATO: text(row.SQ_CANDIDATO), SG_UF: text(row.SG_UF), SG_UF_CANDIDATURA: text(row.SG_UF_CANDIDATURA), UF: text(row.UF), SG_UE_SUPERIOR: text(row.SG_UE_SUPERIOR), UNIDADE_ELEITORAL_CANDIDATO: text(row.UNIDADE_ELEITORAL_CANDIDATO), SG_UE: text(row.SG_UE), NR_CANDIDATO: text(row.NR_CANDIDATO), ANO_ELEICAO: text(row.ANO_ELEICAO) || String(year),
            DS_CARGO: text(row.DS_CARGO), SG_PARTIDO: text(row.SG_PARTIDO), DS_SITUACAO_CANDIDATURA: text(row.DS_SITUACAO_CANDIDATURA),
            DS_SIT_TOT_TURNO: text(row.DS_SIT_TOT_TURNO), NR_TURNO: text(row.NR_TURNO) })
        }
      }
      await completed
    } catch {
      child.kill()
      throw new Error(`não foi possível processar CSV TSE de ${year}`)
    }
  }
  return rows
}

export function validateIdentityReviewCoverage(
  cells: readonly Cell[],
  reviewed: unknown,
): Set<string> {
  if (!Array.isArray(reviewed) || reviewed.some((item) => !item || typeof item.slug !== "string" || !item.slug)) {
    throw new Error("revisão de identidade incompleta")
  }
  const reviewedSlugs = reviewed.map((item: { slug: string }) => item.slug)
  const riskSlugs = new Set<string>(reviewedSlugs)
  if (riskSlugs.size !== reviewedSlugs.length) throw new Error("revisão de identidade duplicada")
  const plannedRisk = new Set(cells.filter((cell) => cell.family === "historico_politico" && cell.category === "identity_review").map((cell) => cell.slug))
  if ([...plannedRisk].some((slug) => !riskSlugs.has(slug))) throw new Error("revisão de identidade incompleta para a coorte planejada")
  return riskSlugs
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const manifestPath = arg(args, "manifest")
  const classificationPath = arg(args, "classification")
  const reviewPath = arg(args, "review")
  const identityReviewPath = arg(args, "identity-review")
  const candidatesPath = arg(args, "candidates")
  const profilesPath = arg(args, "profiles")
  const outputPath = assertOutsideRepository(arg(args, "out"), "--out")
  const manifest = readJson<{ assets: Asset[]; pending?: unknown[] }>(manifestPath)
  if (!Array.isArray(manifest.assets) || manifest.pending?.length) throw new Error("manifesto incompleto ou com assets pendentes")
  const assets = manifest.assets.filter((asset) => asset.family === "historico_politico").map((asset) => ({ ...asset, path: resolve(asset.path) }))
  if (!assets.length) throw new Error("manifesto sem pacotes historico_politico")
  const hashChecked: Asset[] = []
  for (const asset of assets) {
    if (!asset.url.startsWith(OFFICIAL_PREFIX) || !/^[a-f0-9]{64}$/i.test(asset.sha256) || !existsSync(asset.path)) throw new Error(`asset oficial inválido: ${asset.year}`)
    const actual = sha256(readFileSync(asset.path))
    if (actual !== asset.sha256.toLowerCase()) throw new Error(`SHA-256 divergiu no pacote de ${asset.year}`)
    hashChecked.push(asset)
  }
  const candidates = readJson<Candidate[]>(candidatesPath)
  const profiles = readJson<Profile[]>(profilesPath)
  const classification = readJson<{ cells: Cell[] }>(classificationPath)
  const reviewFile = readJson<{ itens: ReviewItem[] }>(reviewPath)
  if (!Array.isArray(reviewFile.itens)) throw new Error("arquivo de revisão sem itens[]")
  const identityReview = readJson<{ perfis: Array<{ slug: string }> }>(identityReviewPath)
  const riskSlugs = validateIdentityReviewCoverage(classification.cells, identityReview.perfis)
  const wanted = new Set<string>()
  for (const cell of classification.cells.filter((item) => item.family === "historico_politico" && item.category === "stale_not_projected")) {
    const ids = candidates.find((candidate) => candidate.slug === cell.slug)?.ids?.tse_sq_candidato ?? {}
    for (const [year, sq] of Object.entries(ids)) wanted.add(`${Number(year)}|${text(sq)}`)
  }
  const years = [...new Set(hashChecked.map((asset) => asset.year))].sort((a, b) => a - b)
  const rowsByYear = new Map<number, SourceRow[]>()
  for (const year of years) {
    const asset = hashChecked.find((item) => item.year === year)
    if (asset) rowsByYear.set(year, await parseSourceRows(asset.path, year, wanted))
  }
  const targetSlugs = new Set(classification.cells.filter((cell) => cell.family === "historico_politico" && cell.category !== "closed_now").map((cell) => cell.slug))
  const expectedKeys = [...new Set(candidates.filter((candidate) => targetSlugs.has(candidate.slug))
    .flatMap((candidate) => Object.keys(candidate.ids?.tse_sq_candidato ?? {}).map((year) => `historico_politico|${year}`)))]
  const plan = buildHistoryPlan({ sourceComplete: sourceAssetsComplete(expectedKeys,
    hashChecked.map((asset) => `${asset.family}|${asset.year}`), [...rowsByYear.keys()].map((year) => `historico_politico|${year}`)),
    riskSlugs, candidates, profiles, cells: classification.cells, reviewItems: reviewFile.itens, assets: hashChecked, rowsByYear })
  mkdirSync(dirname(outputPath), { recursive: true })
  const temporary = `${outputPath}.${process.pid}.tmp`
  const combinedShape = { schema_version: plan.schema_version, mode: plan.mode, source: plan.source, acoes: plan.actions, review: plan.review, review_evidence: plan.review_evidence, summary: plan.summary }
  writeFileSync(temporary, `${JSON.stringify(combinedShape, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  renameSync(temporary, outputPath)
  console.log(JSON.stringify({ output: outputPath, ...plan.summary, reviews: plan.review.length, source_packages_sha_checked: hashChecked.length }))
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) void main()
