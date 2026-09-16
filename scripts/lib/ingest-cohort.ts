import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import { getExplicitCohort, withExplicitCohort } from "./cohort-context"
import { planejarEscrita } from "./dry-run"
import type { CandidatoConfig, IngestResult } from "./types"
import type { SenadoRosterManifest, SenadoRosterPerson, TSEComplementRow, TSESnapshotRow } from "./tse-roster"
import type { IngestTask } from "../ingest-all"

export interface CohortSelectionInput {
  ano: number
  sqs: string[]
  ufs?: string[]
  explicit?: boolean
}

export interface ValidatedCohortSelection {
  ano: 2026
  sqs: string[]
  ufs: string[]
  rows: SenadoRosterPerson[]
}

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
])
const terminal = new Set(["CANCELADO", "FALECIDO", "INDEFERIDO", "RENÚNCIA", "RENUNCIA", "PEDIDO NÃO CONHECIDO", "PEDIDO NAO CONHECIDO"])
const recognizedJudgments = new Set(["DEFERIDO", "AGUARDANDO JULGAMENTO"])
const clean = (value: unknown) => String(value ?? "").trim()
const resolvedSlugs = new WeakMap<object, string>()
// O bootstrap usa a trilha TSE do ingest existente quando coleta dados; a
// declaração mantém a isenção do pipeline ancorada em FONTES.
const COHORT_AUDIT_SCOPE = {
  source: "tse",
  candidato: "coorte-senado-2026",
} as const
const COHORT_INGEST_RESULT_SOURCE: { source: "senado-cohort"; candidato: string } = {
  source: "senado-cohort",
  candidato: "coorte-senado-2026",
}

function isTerminal(person: SenadoRosterPerson): boolean {
  return terminal.has(clean(person.situacao_julgamento || person.situacao).toUpperCase())
}

function rosterIdentity(row: SenadoRosterPerson): string {
  return `${row.ano}|${row.uf}|${row.cargo_codigo}|${row.sq_candidato}`
}

/** Slug do roster é uma âncora confirmada; o fallback é determinístico por SQ. */
export function canonicalSenadoSlug(row: Pick<SenadoRosterPerson, "sq_candidato" | "slug">): string {
  return resolvedSlugs.get(row as object) ?? (clean(row.slug) || `tse-2026-${clean(row.sq_candidato)}`)
}

export function validateCohortSelection(manifest: SenadoRosterManifest, selection: CohortSelectionInput): ValidatedCohortSelection {
  if (selection.explicit !== true) throw new Error("coorte recusada: seleção explícita obrigatória")
  if (selection.ano !== 2026 || manifest.metadata.ano !== 2026) throw new Error("coorte recusada: ano incompatível")
  const sqs = selection.sqs.map(clean)
  if (sqs.length === 0 || sqs.some((sq) => !sq) || new Set(sqs).size !== sqs.length) throw new Error("coorte recusada: SQ ausente ou duplicado")
  const requestedUfs = [...new Set((selection.ufs ?? []).map((uf) => clean(uf).toUpperCase()))]
  if (requestedUfs.some((uf) => !UFS.has(uf))) throw new Error("coorte recusada: UF inválida")
  const bySq = new Map<string, SenadoRosterPerson>()
  for (const row of manifest.rows) {
    if (bySq.has(row.sq_candidato)) throw new Error(`coorte recusada: SQ duplicado no manifesto ${row.sq_candidato}`)
    bySq.set(row.sq_candidato, row)
  }
  const rows = sqs.map((sq) => {
    const row = bySq.get(sq)
    if (!row) throw new Error(`coorte recusada: SQ ${sq} não pertence ao snapshot`)
    if (row.ano !== 2026 || !UFS.has(row.uf) || row.cargo_codigo !== "5" || row.papel !== "titular") {
      throw new Error(`coorte recusada: suplente ou identidade inválida para SQ ${sq}`)
    }
    if (isTerminal(row)) throw new Error(`coorte recusada: SQ terminal ${sq}`)
    if (row.action === "revisar") throw new Error(`coorte recusada: SQ em revisão ${sq}`)
    const judgment = clean(row.situacao_julgamento).toUpperCase()
    if (!recognizedJudgments.has(judgment)) throw new Error(`coorte recusada: situação de julgamento ausente ou desconhecida para SQ ${sq}`)
    if (row.substituido) throw new Error(`coorte recusada: SQ substituído ${sq}`)
    if (requestedUfs.length > 0 && !requestedUfs.includes(row.uf)) throw new Error(`coorte recusada: SQ ${sq} fora das UFs selecionadas`)
    if (row.publicavel !== false) throw new Error(`coorte recusada: SQ ${sq} sem publicavel=false`)
    return row
  })
  const identities = new Set(rows.map((row) => rosterIdentity(row)))
  if (identities.size !== rows.length) throw new Error("coorte recusada: conflito de identidade")
  return {
    ano: 2026,
    sqs: [...sqs].sort(),
    ufs: [...new Set(rows.map((row) => row.uf))].sort(),
    rows: [...rows].sort((a, b) => a.sq_candidato.localeCompare(b.sq_candidato)),
  }
}

export function candidatoConfigsFromSelection(selection: ValidatedCohortSelection, seed: readonly CandidatoConfig[] = []): CandidatoConfig[] {
  const seedBySlug = new Map(seed.map((candidate) => [candidate.slug, candidate]))
  return selection.rows.map((row) => ({
    ...(seedBySlug.get(canonicalSenadoSlug(row)) ?? {}),
    slug: canonicalSenadoSlug(row),
    nome_completo: row.nome_completo,
    nome_urna: row.nome_urna,
    cargo_disputado: "Senador",
    estado: row.uf,
    ids: {
      ...(seedBySlug.get(canonicalSenadoSlug(row))?.ids ?? { camara: null, senado: null }),
      tse_sq_candidato: { ...(seedBySlug.get(canonicalSenadoSlug(row))?.ids.tse_sq_candidato ?? {}), "2026": row.sq_candidato },
      tse_uf_candidatura: { ...(seedBySlug.get(canonicalSenadoSlug(row))?.ids.tse_uf_candidatura ?? {}), "2026": row.uf },
    },
  }))
}

/** Confere o merge com o seed antes de uma promoção editorial futura. */
export function buildCohortPromotionConfig(selection: ValidatedCohortSelection, seed: readonly CandidatoConfig[] = []): CandidatoConfig[] {
  const configs = candidatoConfigsFromSelection(selection, seed)
  for (const config of configs) {
    const sameSlug = seed.filter((candidate) => candidate.slug === config.slug)
    if (sameSlug.some((candidate) => candidate.ids.tse_sq_candidato["2026"] && candidate.ids.tse_sq_candidato["2026"] !== config.ids.tse_sq_candidato["2026"])) {
      throw new Error(`revisão necessária: slug ${config.slug} ancorado em SQ diferente`)
    }
  }
  const slugs = new Set<string>()
  for (const config of configs) {
    if (slugs.has(config.slug)) throw new Error(`coorte recusada: slug duplicado ${config.slug}`)
    slugs.add(config.slug)
  }
  return configs
}

export interface CohortPromotionArtifact {
  schema_version: "senado-cohort-config-v1"
  promotion_required: true
  rows: CandidatoConfig[]
}

export interface SenadoPublicCohortConfig {
  schema_version: "senado-public-cohort-config-v1"
  generated_at: string
  source: {
    relation: "candidatos_publico"
    expected_count: number
    endpoint: "local-supabase"
  }
  rows: CandidatoConfig[]
}

export interface PublicCohortDbRow {
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: string
  estado: string
  sq_candidato_2026: string
}

/** Lê uma configuração pública explícita; o cotejo com a view ocorre separadamente. */
export function readSenadoPublicCohortConfig(path: string): SenadoPublicCohortConfig {
  const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as Partial<SenadoPublicCohortConfig>
  const source = parsed.source
  if (parsed.schema_version !== "senado-public-cohort-config-v1" || !Array.isArray(parsed.rows) || !source || !Number.isInteger(source.expected_count) || source.expected_count < 1 || source.relation !== "candidatos_publico") {
    throw new Error(`configuração pública Senado inválida: ${path}`)
  }
  if (!Number.isFinite(Date.parse(String(parsed.generated_at ?? "")))) throw new Error(`configuração pública Senado sem data válida: ${path}`)
  const rows = withExplicitCohort(parsed.rows, () => parsed.rows!.map((row) => ({ ...row, ids: { ...row.ids, tse_sq_candidato: { ...row.ids.tse_sq_candidato } } })))
  if (rows.length !== source.expected_count) throw new Error(`configuração pública Senado diverge da contagem declarada: ${rows.length}/${source.expected_count}`)
  return { ...parsed, rows } as SenadoPublicCohortConfig
}

/** Prova que a configuração é exatamente a view pública, sem candidatos extras ou faltantes. */
export function validateSenadoPublicCohortIntersection(
  configs: readonly CandidatoConfig[],
  publicRows: readonly PublicCohortDbRow[],
  expectedCount = 311,
): void {
  if (configs.length !== expectedCount || publicRows.length !== expectedCount) {
    throw new Error(`coorte pública Senado divergente: config=${configs.length}, view=${publicRows.length}, esperado=${expectedCount}`)
  }
  const bySlug = new Map<string, PublicCohortDbRow>()
  const sqs = new Set<string>()
  for (const row of publicRows) {
    if (!row.slug || bySlug.has(row.slug) || !/^\d+$/.test(row.sq_candidato_2026) || sqs.has(row.sq_candidato_2026)) throw new Error(`coorte pública Senado ambígua na view: ${row.slug || "(sem slug)"}`)
    if (row.cargo_disputado !== "Senador" || !UFS.has(row.estado)) throw new Error(`coorte pública Senado com cargo/UF inválido: ${row.slug}`)
    bySlug.set(row.slug, row)
    sqs.add(row.sq_candidato_2026)
  }
  for (const config of configs) {
    const db = bySlug.get(config.slug)
    const sq = clean(config.ids.tse_sq_candidato["2026"])
    if (!db || db.sq_candidato_2026 !== sq || db.nome_completo !== config.nome_completo || db.nome_urna !== config.nome_urna || db.estado !== config.estado || config.cargo_disputado !== "Senador") {
      throw new Error(`configuração pública Senado diverge da view: ${config.slug}`)
    }
  }
}

/** Converte toda a config pública, ou um allowlist de SQs, ao contrato dos coletores. */
export function selectSenadoPublicCohort(configs: readonly CandidatoConfig[], sqAllowlist: readonly string[] = []): { selection: ValidatedCohortSelection; seed: CandidatoConfig[] } {
  const requested = sqAllowlist.map(clean).filter(Boolean)
  if (new Set(requested).size !== requested.length) throw new Error("coorte pública Senado com SQ duplicado")
  const allowed = new Set(requested)
  const seed = configs.filter((config) => requested.length === 0 || allowed.has(clean(config.ids.tse_sq_candidato["2026"])))
  if (seed.length !== (requested.length || configs.length)) throw new Error(`coorte pública Senado incompleta: solicitados=${requested.length}, selecionados=${seed.length}`)
  const rows = seed.map((config): SenadoRosterPerson => ({
    sq_candidato: clean(config.ids.tse_sq_candidato["2026"]),
    uf: clean(config.estado).toUpperCase(),
    ano: 2026,
    cargo_codigo: "5",
    cargo: "Senador",
    papel: "titular",
    numero: "",
    nome_completo: config.nome_completo,
    nome_urna: config.nome_urna,
    partido_sigla: "",
    partido_nome: "",
    sq_coligacao: "",
    chave_chapa: "",
    situacao: "PUBLICADO",
    situacao_codigo: "",
    situacao_julgamento: "PUBLICADO",
    substituido: false,
    sq_substituido: null,
    fonte_arquivo: "candidatos_publico",
    fonte_url: "local-supabase",
    fonte_sha256: "",
    // Estrutura interna reutilizada pelo runner; a publicidade real já foi
    // provada contra candidatos_publico antes desta conversão.
    publicavel: false,
    slug: config.slug,
    action: "manter",
    reason: "configuração pública explícita validada contra candidatos_publico",
  }))
  return {
    selection: { ano: 2026, sqs: rows.map((row) => row.sq_candidato).sort(), ufs: [...new Set(rows.map((row) => row.uf))].sort(), rows: rows.sort((a, b) => a.sq_candidato.localeCompare(b.sq_candidato)) },
    seed,
  }
}

/** Materializa uma configuração pronta para revisão e merge futuro no seed. */
export function writeCohortPromotionArtifact(path: string, selection: ValidatedCohortSelection, seed: readonly CandidatoConfig[] = []): string {
  const target = resolve(path)
  const rows = buildCohortPromotionConfig(selection, seed)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify({ schema_version: "senado-cohort-config-v1", promotion_required: true, rows }, null, 2)}\n`, "utf8")
  return target
}

export { withExplicitCohort }

/** Executa um coletor existente com a seleção convertida ao contrato comum. */
export function runCohortWithContext<T>(selection: ValidatedCohortSelection, collector: () => T, seed?: readonly CandidatoConfig[]): T
export function runCohortWithContext<T>(selection: ValidatedCohortSelection, collector: () => Promise<T>, seed?: readonly CandidatoConfig[]): Promise<T>
export function runCohortWithContext<T>(selection: ValidatedCohortSelection, collector: () => T | Promise<T>, seed: readonly CandidatoConfig[] = []): T | Promise<T> {
  return withExplicitCohort(buildCohortPromotionConfig(selection, seed), collector)
}

/**
 * Fontes automáticas aceitas pelo runner de coorte. Curadoria individual tem
 * manifesto e contrato próprios no runner Senado; ela não pode ser acionada
 * por um lote automático e acabar parecendo uma coleta global.
 */
export const SENADO_COHORT_SOURCES = Object.freeze([
  "tse-situacao", "tse", "tse-historico", "transparencia", "tcu", "sancoes",
  "filiacao", "wikipedia", "wiki-historico", "wikidata", "wikidata-politico",
  "instagram", "google-news", "camara", "senado", "ceaps-senado", "jarbas",
] as const)

export type SenadoCohortSource = (typeof SENADO_COHORT_SOURCES)[number]

export function validateCohortSources(raw: string | readonly string[] | undefined): SenadoCohortSource[] {
  const values = typeof raw === "string"
    ? raw.split(",").map((source) => source.trim()).filter(Boolean)
    : [...(raw ?? [])].map((source) => String(source).trim()).filter(Boolean)
  if (values.length === 0 && raw !== undefined) throw new Error("fontes da coorte não podem ser vazias")
  const allowed = new Set<string>(SENADO_COHORT_SOURCES)
  const seen = new Set<string>()
  for (const source of values) {
    if (!allowed.has(source)) {
      throw new Error(`fonte de coorte inválida: ${source}. Válidas: ${SENADO_COHORT_SOURCES.join(", ")}`)
    }
    if (seen.has(source)) throw new Error(`fonte de coorte repetida: ${source}`)
    seen.add(source)
  }
  return values as SenadoCohortSource[]
}

function selectCohortSourceTasks(sources: readonly SenadoCohortSource[], registry: readonly IngestTask[]): IngestTask[] {
  const bySource = new Map<string, IngestTask>()
  for (const task of registry) {
    if (bySource.has(task.source)) throw new Error(`registry de coorte contém fonte repetida: ${task.source}`)
    bySource.set(task.source, task)
  }
  return sources.map((source) => {
    const task = bySource.get(source)
    if (!task) throw new Error(`coletor de coorte não registrado: ${source}`)
    return task
  })
}

/** Valida o registry sem executar fonte ou tocar o banco. */
export async function resolveCohortSourceTasks(sources: readonly string[]): Promise<IngestTask[]> {
  const selected = validateCohortSources(sources)
  const { INGEST_TASKS } = await import("../ingest-all")
  return selectCohortSourceTasks(selected, INGEST_TASKS)
}

export interface CohortSourceRunOptions {
  seed?: readonly CandidatoConfig[]
  taskRegistry?: readonly IngestTask[]
  registerResults?: (results: IngestResult[]) => Promise<void>
  /** Compatibilidade de --collect-tse: o restante do registry mantém suas opções. */
  tseYears?: readonly number[]
  dryRun?: boolean
}

export interface CohortSourceRunResult {
  source: "senado-cohort-sources"
  sources: SenadoCohortSource[]
  dry_run: boolean
  planned: number
  results: IngestResult[]
  failures: string[]
  status: "success" | "partial" | "error"
  exit_code: 0 | 1
}

/**
 * Executa cada tarefa do registry uma vez dentro de uma única coorte explícita.
 * Toda validação do nome e do registry ocorre antes de entrar no contexto de
 * execução, e o modo dry-run só devolve o plano: nenhuma tarefa é chamada.
 */
export async function runCohortSources(
  selection: ValidatedCohortSelection,
  sources: readonly string[],
  options: CohortSourceRunOptions = {},
): Promise<CohortSourceRunResult> {
  const selected = validateCohortSources(sources)
  const dryRun = options.dryRun === true
  if (dryRun) {
    return {
      source: "senado-cohort-sources",
      sources: selected,
      dry_run: true,
      planned: selection.rows.length * selected.length,
      results: [],
      failures: [],
      status: "success",
      exit_code: 0,
    }
  }

  const registry = options.taskRegistry ?? await resolveCohortSourceTasks(selected)
  const tasks = selectCohortSourceTasks(selected, registry)
  const { runIngestTask } = await import("../ingest-all")
  const results: IngestResult[] = []
  const failures: string[] = []

  await runCohortWithContext(selection, async () => {
    for (const task of tasks) {
      const before = results.length
      const executable = task.source === "tse" && options.tseYears
        ? { ...task, run: async () => {
            const { ingestTSE } = await import("./ingest-tse")
            return ingestTSE([...options.tseYears!])
          } }
        : task
      const ok = await runIngestTask(executable, results, options.registerResults)
      const produced = results.slice(before)
      if (!ok || produced.length === 0) {
        failures.push(!ok ? `${task.source}: falhou antes de devolver resultados` : `${task.source}: não devolveu resultado`)
        continue
      }
      if (produced.some((result) => result.errors.length > 0 || result.coleta_resultado === "erro")) {
        failures.push(`${task.source}: resultado contém erro`)
      }
    }
  }, options.seed ?? [])

  const hasIndeterminate = results.some((result) => result.coleta_resultado === "indeterminado")
  const status = failures.length > 0 ? "error" : hasIndeterminate ? "partial" : "success"
  return {
    source: "senado-cohort-sources",
    sources: selected,
    dry_run: false,
    planned: 0,
    results,
    failures,
    status,
    exit_code: status === "success" ? 0 : 1,
  }
}

export interface SenadoSourceReceipt {
  url: string
  checked_at: string
  http_status: number
  payload_raw_sha256: string
  bytes: number
  content_type: string
  artifact_path: string | null
  escopo: string
}

export interface SenadoProfileEvidence {
  registration: SenadoSourceReceipt
  complement: SenadoSourceReceipt
  photo?: {
    url: string
    original_url?: string
    local_path?: string
    local_sha256?: string
    local_bytes?: number
    archive_member?: string
    archive_receipt?: SenadoSourceReceipt
    extracted_sha256?: string
    extracted_bytes?: number
    credit: string
    receipt: SenadoSourceReceipt
  }
}

export interface SenadoProfileEvidenceDocument {
  schema_version: "senado-profile-evidence-v1"
  rows: Record<string, {
    base: TSESnapshotRow
    complement: TSEComplementRow
    evidence: SenadoProfileEvidence
  }>
}

export interface SenadoProfilePatch {
  values: Record<string, unknown>
  missing: string[]
}

const JUDGMENT_TO_STATUS: Readonly<Record<string, string>> = Object.freeze({
  "2": "deferido",
  "4": "indeferido com recurso",
  "8": "aguardando julgamento",
  "14": "indeferido",
  "16": "deferido com recurso",
})
const JUDGMENT_DESCRIPTION_TO_STATUS: Readonly<Record<string, string>> = Object.freeze({
  "DEFERIDO": "deferido",
  "DEFERIDO COM RECURSO": "deferido com recurso",
  "AGUARDANDO JULGAMENTO": "aguardando julgamento",
  "INDEFERIDO": "indeferido",
  "INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO": "indeferido com recurso",
})
const SOURCE_SHA256 = /^[a-f0-9]{64}$/i
const SENTINEL = new Set(["", "#NE", "#NULO", "#NULO#", "NÃO DIVULGÁVEL", "NAO DIVULGAVEL"])

function profileValue(value: unknown): string {
  const cleanValue = clean(value)
  return SENTINEL.has(cleanValue.toUpperCase()) ? "" : cleanValue
}

function validIsoDate(value: string): boolean {
  const parsed = Date.parse(value)
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(parsed)
}

function convertBirthDate(value: string): string {
  const raw = profileValue(value)
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return ""
}

function assertSourceReceipt(receipt: SenadoSourceReceipt, label: string, options: { allowPartial?: boolean } = {}): void {
  let url: URL
  try { url = new URL(receipt.url) } catch { throw new Error(`perfil Senado: recibo ${label} com URL inválida`) }
  if (url.protocol !== "https:") throw new Error(`perfil Senado: recibo ${label} fora de HTTPS`)
  const validStatus = receipt.http_status === 200 || (options.allowPartial === true && receipt.http_status === 206)
  if (!validStatus || receipt.bytes <= 0 || !SOURCE_SHA256.test(receipt.payload_raw_sha256) || !validIsoDate(receipt.checked_at)) {
    throw new Error(`perfil Senado: recibo ${label} incompleto ou não confirmado`)
  }
  if (!profileValue(receipt.escopo)) throw new Error(`perfil Senado: recibo ${label} sem escopo SQ`)
}

function fonteConsultada(receipt: SenadoSourceReceipt): Record<string, unknown> {
  return {
    url: receipt.url,
    checked_at: receipt.checked_at,
    http_status: receipt.http_status,
    payload_raw_sha256: receipt.payload_raw_sha256,
    bytes: receipt.bytes,
    content_type: receipt.content_type,
    ...(receipt.artifact_path ? { artifact_path: receipt.artifact_path } : {}),
    escopo: receipt.escopo,
  }
}

function normalizedProfileText(value: unknown): string {
  return profileValue(value).toLocaleUpperCase()
}

function statusFromRoster(row: SenadoRosterPerson): string {
  const status = JUDGMENT_DESCRIPTION_TO_STATUS[normalizedProfileText(row.situacao_julgamento)]
  if (!status) throw new Error(`coorte recusada: julgamento sem status persistível para SQ ${row.sq_candidato}`)
  return status
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

/**
 * Constrói o patch de perfil a partir de duas linhas oficiais já cruzadas por
 * SQ. O builder não busca rede, não inventa data e não emite recibo quando a
 * fonte ou o campo está incompleto. A publicação continua fora deste patch.
 */
export function buildSenadoProfilePatch(
  roster: SenadoRosterPerson,
  base: TSESnapshotRow,
  complement: TSEComplementRow,
  evidence: SenadoProfileEvidence,
): SenadoProfilePatch {
  if (roster.ano !== 2026 || !UFS.has(roster.uf) || roster.cargo_codigo !== "5" || roster.papel !== "titular") {
    throw new Error(`perfil Senado: roster inválido para SQ ${roster.sq_candidato}`)
  }
  if (roster.action === "revisar" || roster.substituido || isTerminal(roster)) {
    throw new Error(`perfil Senado: roster não publicável para SQ ${roster.sq_candidato}`)
  }
  if (profileValue(base.SQ_CANDIDATO) !== roster.sq_candidato || profileValue(complement.SQ_CANDIDATO) !== roster.sq_candidato) {
    throw new Error(`perfil Senado: fontes não conferem com SQ ${roster.sq_candidato}`)
  }
  if (profileValue(base.ANO_ELEICAO) !== "2026" || profileValue(base.SG_UF) !== roster.uf || profileValue(base.CD_CARGO) !== "5") {
    throw new Error(`perfil Senado: fonte base não confere com UF/cargo do SQ ${roster.sq_candidato}`)
  }
  const complementUf = profileValue(complement.SG_UF)
  if (profileValue(complement.ANO_ELEICAO) !== "2026" || (complementUf && complementUf !== roster.uf)) {
    throw new Error(`perfil Senado: fonte complementar não confere com ano/UF do SQ ${roster.sq_candidato}`)
  }
  assertSourceReceipt(evidence.registration, "candidate_registration")
  assertSourceReceipt(evidence.complement, "candidate_complement")
  if (!evidence.registration.escopo.includes(roster.sq_candidato) || !evidence.complement.escopo.includes(roster.sq_candidato)) {
    throw new Error(`perfil Senado: recibo sem escopo do SQ ${roster.sq_candidato}`)
  }

  const required = {
    nome_completo: profileValue(base.NM_CANDIDATO),
    nome_urna: profileValue(base.NM_URNA_CANDIDATO),
    partido_sigla: profileValue(base.SG_PARTIDO),
    data_nascimento: convertBirthDate(profileValue(base.DT_NASCIMENTO)),
    naturalidade: profileValue(complement.NM_MUNICIPIO_NASCIMENTO),
    formacao: profileValue(base.DS_GRAU_INSTRUCAO),
    profissao_declarada: profileValue(base.DS_OCUPACAO),
    genero: profileValue(base.DS_GENERO),
    estado_civil: profileValue(base.DS_ESTADO_CIVIL),
    cor_raca: profileValue(base.DS_COR_RACA),
  }
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key)
  const judgmentCode = profileValue(complement.CD_SITUACAO_JULGAMENTO)
  const judgmentDescription = profileValue(complement.DS_SITUACAO_JULGAMENTO)
  const status = JUDGMENT_TO_STATUS[judgmentCode]
  if (!status || !judgmentDescription) throw new Error(`perfil Senado: julgamento ausente ou desconhecido para SQ ${roster.sq_candidato}`)
  if (normalizedProfileText(judgmentDescription) !== normalizedProfileText(roster.situacao_julgamento)) {
    throw new Error(`perfil Senado: julgamento não confere com manifesto para SQ ${roster.sq_candidato}`)
  }
  if (status === "indeferido" || status === "indeferido com recurso") missing.push("situacao_candidatura_publicável")

  const values: Record<string, unknown> = {
    ...required,
    partido_atual: required.partido_sigla,
    cargo_disputado: "Senador",
    estado: roster.uf,
    situacao_candidatura: status,
    biografia: `${required.nome_completo}, nome de urna ${required.nome_urna}, consta no cadastro oficial como candidatura ao Senado por ${roster.uf}, pelo partido ${required.partido_sigla}, nas Eleições 2026. O cadastro declara nascimento em ${required.naturalidade}, formação ${required.formacao.toLocaleLowerCase()} e ocupação de ${required.profissao_declarada.toLocaleLowerCase()}.`,
    verificacao_campos: {
      candidate_registration: {
        estado: "publicado",
        verificado_em: evidence.registration.checked_at,
        fonte: "TSE",
        fontes_consultadas: [fonteConsultada(evidence.registration), fonteConsultada(evidence.complement)],
        escopo: `inscrição titular ${roster.sq_candidato}; julgamento ${judgmentDescription}`,
      },
      candidate_complement: {
        estado: "publicado",
        verificado_em: evidence.complement.checked_at,
        fonte: "TSE",
        fontes_consultadas: [fonteConsultada(evidence.registration), fonteConsultada(evidence.complement)],
        escopo: `inscrição titular ${roster.sq_candidato}; dados declarados de nascimento, formação e ocupação`,
      },
    },
  }

  if (evidence.photo) {
    if (!evidence.photo.credit.trim()) throw new Error("perfil Senado: foto_credito vazio")
    const localPhoto = /^\/candidates\/[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp)$/i.test(evidence.photo.url)
    const originalUrl = evidence.photo.original_url?.trim()
    const archiveReceipt = evidence.photo.archive_receipt
    if (archiveReceipt) {
      assertSourceReceipt(archiveReceipt, "photo archive", { allowPartial: true })
      if (!archiveReceipt.content_type.toLocaleLowerCase().includes("zip")) throw new Error("perfil Senado: recibo do arquivo de fotos não é ZIP")
      const expectedMember = `F${roster.uf}${roster.sq_candidato}_div.jpg`
      if (evidence.photo.archive_member !== expectedMember) throw new Error(`perfil Senado: membro de foto divergente para SQ ${roster.sq_candidato}`)
      if (!archiveReceipt.escopo.includes(roster.sq_candidato) || !archiveReceipt.escopo.includes(expectedMember)) throw new Error(`perfil Senado: recibo do arquivo sem escopo do SQ ${roster.sq_candidato}`)
      if (!localPhoto || !evidence.photo.local_path || !/^public\/candidates\/[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp)$/i.test(evidence.photo.local_path)) throw new Error("perfil Senado: foto extraída sem caminho local permitido")
      if (`/${evidence.photo.local_path}`.replace(/^\/public/, "") !== evidence.photo.url) throw new Error("perfil Senado: cópia local não vincula foto_url ao caminho")
      if (evidence.photo.local_sha256 !== evidence.photo.extracted_sha256 || evidence.photo.local_bytes !== evidence.photo.extracted_bytes || !SOURCE_SHA256.test(evidence.photo.extracted_sha256 ?? "") || !Number.isSafeInteger(evidence.photo.extracted_bytes) || (evidence.photo.extracted_bytes ?? 0) <= 0) throw new Error("perfil Senado: hash ou tamanho do JPEG extraído diverge")
      values.foto_url = evidence.photo.url
      values.foto_credito = { origem: "tse", descricao: evidence.photo.credit, fonte_url: archiveReceipt.url }
      ;(values.verificacao_campos as Record<string, unknown>).photo = { estado: "publicado", verificado_em: archiveReceipt.checked_at, fonte: evidence.photo.credit, fontes_consultadas: [fonteConsultada(archiveReceipt)], escopo: `membro ${expectedMember} extraído do arquivo oficial por UF; hash JPEG ${evidence.photo.extracted_sha256}` }
    } else {
      assertSourceReceipt(evidence.photo.receipt, "photo")
      if (!evidence.photo.receipt.escopo.includes(roster.sq_candidato)) throw new Error(`perfil Senado: recibo da foto sem escopo do SQ ${roster.sq_candidato}`)
      if (!evidence.photo.receipt.content_type.toLocaleLowerCase().startsWith("image/")) throw new Error("perfil Senado: recibo da foto não é imagem")
      if (localPhoto) {
        if (!originalUrl || !evidence.photo.local_path || !/^public\/candidates\/[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp)$/i.test(evidence.photo.local_path)) throw new Error("perfil Senado: cópia local da foto sem caminho permitido e fonte original")
        if (`/${evidence.photo.local_path}`.replace(/^\/public/, "") !== evidence.photo.url || evidence.photo.receipt.url !== originalUrl) throw new Error("perfil Senado: cópia local não vincula foto_url à fonte original")
        if (evidence.photo.local_sha256 !== evidence.photo.receipt.payload_raw_sha256 || evidence.photo.local_bytes !== evidence.photo.receipt.bytes) throw new Error("perfil Senado: hash ou tamanho da cópia local diverge do original")
      } else {
        let photoUrl: URL
        try { photoUrl = new URL(evidence.photo.url) } catch { throw new Error("perfil Senado: foto_url inválida") }
        if (photoUrl.protocol !== "https:") throw new Error("perfil Senado: foto_url precisa ser HTTPS")
        if (evidence.photo.receipt.url !== evidence.photo.url && (!originalUrl || evidence.photo.receipt.url !== originalUrl || !evidence.photo.receipt.artifact_path)) throw new Error("perfil Senado: recibo da foto não vincula foto_url à fonte original")
      }
      values.foto_url = evidence.photo.url
      values.foto_credito = { origem: "fonte primária de campanha", descricao: evidence.photo.credit, fonte_url: originalUrl ?? evidence.photo.url }
      ;(values.verificacao_campos as Record<string, unknown>).photo = { estado: "publicado", verificado_em: evidence.photo.receipt.checked_at, fonte: evidence.photo.credit, fontes_consultadas: [fonteConsultada(evidence.photo.receipt)], escopo: `retrato identificado para inscrição ${roster.sq_candidato}` }
    }
  } else {
    missing.push("foto_url")
  }

  return { values, missing: [...new Set(missing)] }
}

export function readSenadoProfileEvidence(path: string): SenadoProfileEvidenceDocument {
  const target = resolve(path)
  const parsed = JSON.parse(readFileSync(target, "utf8")) as SenadoProfileEvidenceDocument
  if (parsed.schema_version !== "senado-profile-evidence-v1" || !parsed.rows || typeof parsed.rows !== "object") {
    throw new Error(`evidência de perfil Senado inválida: ${target}`)
  }
  return parsed
}

export interface CohortAdapter {
  readonly name: string
  readonly writes: boolean
  enrich(row: SenadoRosterPerson): Promise<unknown>
  patchProfile?(row: SenadoRosterPerson, profile: SenadoProfilePatch): Promise<void>
}

export interface CohortQueryResult<T> {
  data: T | T[] | null
  error?: { message?: string } | null
}

export interface CohortReadQuery {
  select(columns?: string): CohortReadQuery
  eq(column: string, value: unknown): CohortReadQuery
  ilike(column: string, value: string): CohortReadQuery
  limit(count: number): CohortReadQuery
  maybeSingle(): Promise<CohortQueryResult<unknown>>
}

export interface CohortMutationQuery {
  eq(column: string, value: unknown): CohortMutationQuery
  then<TResult1 = { error?: { message?: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { error?: { message?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>
}

export interface CohortUpsertQuery extends CohortReadQuery {
  update(values: Record<string, unknown>): CohortMutationQuery
  insert(values: Record<string, unknown>): Promise<{ error?: { message?: string } | null }>
}

export interface CohortUpsertClient {
  from(table: string): CohortUpsertQuery
}

type DbCandidate = {
  id?: string | null
  slug?: string | null
  nome_completo?: string | null
  cargo_disputado?: string | null
  estado?: string | null
  publicavel?: boolean | null
  sq_candidato_2026?: string | null
  situacao_candidatura?: string | null
  verificacao_campos?: Record<string, unknown> | null
  [key: string]: unknown
}

async function readOne(client: CohortUpsertClient, table: string, columns: string, column: string, value: string): Promise<DbCandidate | null> {
  const result = await client.from(table).select(columns).eq(column, value).maybeSingle()
  if (result.error) throw new Error(`${table}.${column}: ${result.error.message ?? "erro sem mensagem"}`)
  return (result.data as DbCandidate | null) ?? null
}

async function readByFilters(client: CohortUpsertClient, table: string, columns: string, filters: Array<[string, unknown]>): Promise<DbCandidate | null> {
  let query = client.from(table).select(columns)
  for (const [column, value] of filters) query = query.eq(column, value)
  const result = await query.maybeSingle()
  if (result.error) throw new Error(`${table}: ${result.error.message ?? "erro sem mensagem"}`)
  return (result.data as DbCandidate | null) ?? null
}

async function readMany(client: CohortUpsertClient, table: string, columns: string, column: string, value: string): Promise<DbCandidate[]> {
  const result = await client.from(table).select(columns).ilike(column, value).limit(2).maybeSingle()
  if (result.error) {
    const message = result.error.message ?? "erro sem mensagem"
    if (/multiple|mais de uma|JSON object requested/i.test(message)) throw new Error(`revisão necessária: múltiplas identidades para ${value}`)
    throw new Error(`${table}.${column}: ${message}`)
  }
  if (!result.data) return []
  return Array.isArray(result.data) ? result.data as DbCandidate[] : [result.data as DbCandidate]
}

function assertExistingIdentity(existing: DbCandidate, row: SenadoRosterPerson): void {
  if (existing.publicavel !== false) throw new Error(`coorte recusada: candidato ${existing.slug ?? row.sq_candidato} já é publicável`)
  if (existing.sq_candidato_2026 !== row.sq_candidato) throw new Error(`conflito de identidade: SQ ${row.sq_candidato}`)
  if (existing.cargo_disputado !== "Senador" || existing.estado !== row.uf) throw new Error(`conflito de cargo/UF para SQ ${row.sq_candidato}`)
}

function mergeTseFonteDados(current: unknown): string[] {
  const existing = Array.isArray(current)
    ? current.filter((value): value is string => typeof value === "string" && value.length > 0)
    : []
  return existing.some((value) => /\btse\b/i.test(value)) ? existing : [...existing, "TSE"]
}

/** Adapter Supabase real, com leitura de identidade e cliente injetado para teste/local. */
export function createSupabaseCohortUpsertAdapter(client: CohortUpsertClient): CohortAdapter {
  return {
    name: "supabase-candidatos-cohort",
    writes: true,
    async enrich(row) {
      const requestedSlug = canonicalSenadoSlug(row)
      const columns = "id,slug,nome_completo,cargo_disputado,estado,publicavel,sq_candidato_2026,situacao_candidatura,fonte_dados,verificacao_campos"
      const bySq = await readOne(client, "candidatos", columns, "sq_candidato_2026", row.sq_candidato)
      const existing = bySq ?? await readOne(client, "candidatos", columns, "slug", requestedSlug)
      if (existing) assertExistingIdentity(existing, row)
      const slug = existing?.slug ?? requestedSlug
      if (existing && row.slug && existing.slug !== row.slug) throw new Error(`conflito de slug ancorado para SQ ${row.sq_candidato}`)
      const publicMatch = await readOne(client, "candidatos_publico", "slug", "slug", slug)
      if (publicMatch) throw new Error(`coorte recusada: slug ${slug} aparece em candidatos_publico`)
      if (!existing) {
        const nameMatches = await readMany(client, "candidatos", columns, "nome_completo", row.nome_completo)
        const explicit = getExplicitCohort()
        const explicitSqs = new Set(explicit?.map((candidate) => candidate.ids.tse_sq_candidato["2026"]) ?? [])
        const allMatchesAnchoredInCohort = nameMatches.length > 0 && nameMatches.every((match) => Boolean(match.sq_candidato_2026 && explicitSqs.has(match.sq_candidato_2026)))
        if (nameMatches.length > 0 && !allMatchesAnchoredInCohort) throw new Error(`revisão necessária: colisão nominal sem âncora para ${row.nome_completo}`)
      }
      const values: Record<string, unknown> = {
        ...(existing?.id ? { id: existing.id } : {}),
        slug,
        nome_completo: row.nome_completo,
        nome_urna: row.nome_urna,
        partido_sigla: row.partido_sigla,
        partido_atual: row.partido_sigla,
        cargo_disputado: "Senador",
        estado: row.uf,
        sq_candidato_2026: row.sq_candidato,
        situacao_candidatura: statusFromRoster(row),
        fonte_dados: mergeTseFonteDados(existing?.fonte_dados),
        publicavel: false,
      }
      if (existing) {
        if (!existing.id) throw new Error(`coorte recusada: candidato ${slug} sem id estável`)
        const { error } = await client.from("candidatos").update(values)
          .eq("id", existing.id)
          .eq("sq_candidato_2026", row.sq_candidato)
          .eq("publicavel", false)
        if (error) throw new Error(`coorte candidatos update: ${error.message ?? "erro sem mensagem"}`)
        const readback = await readByFilters(client, "candidatos", columns, [["id", existing.id], ["sq_candidato_2026", row.sq_candidato], ["publicavel", false]])
        if (!readback) throw new Error(`coorte recusada: identidade mudou durante update para SQ ${row.sq_candidato}`)
      } else {
        const { error } = await client.from("candidatos").insert(values)
        if (error) throw new Error(`coorte candidatos insert: ${error.message ?? "erro sem mensagem"}`)
      }
      // A âncora histórica encontrada por SQ passa a ser a identidade que o
      // runner repassa ao coletor, preservando a resolução de candidato.
      resolvedSlugs.set(row, slug)
    },
    async patchProfile(row, profile) {
      const columns = "id,slug,nome_completo,nome_urna,partido_sigla,partido_atual,cargo_disputado,estado,publicavel,sq_candidato_2026,situacao_candidatura,fonte_dados,data_nascimento,naturalidade,formacao,profissao_declarada,genero,estado_civil,cor_raca,biografia,foto_url,foto_credito,verificacao_campos"
      const existing = await readOne(client, "candidatos", columns, "sq_candidato_2026", row.sq_candidato)
      if (!existing) throw new Error(`perfil Senado: candidato não encontrado para SQ ${row.sq_candidato}`)
      assertExistingIdentity(existing, row)
      if (!existing.id) throw new Error(`perfil Senado: candidato ${row.sq_candidato} sem id estável`)
      const currentVerification = existing.verificacao_campos && typeof existing.verificacao_campos === "object"
        ? existing.verificacao_campos
        : {}
      // O snapshot de perfil e validado por uma coleta anterior ao TSE
      // situação. Nunca deixe esse patch rebaixar uma situação já reconciliada
      // por fonte mais recente; a atualização de situação pertence ao coletor
      // TSE situação, com seu próprio recibo.
      const profileValues = Object.fromEntries(
        Object.entries(profile.values).filter(([key]) => key !== "situacao_candidatura"),
      )
      const values = {
        ...profileValues,
        ...(profile.values.data_nascimento === "" ? { data_nascimento: null } : {}),
        fonte_dados: mergeTseFonteDados(existing.fonte_dados),
        verificacao_campos: {
          ...currentVerification,
          ...(profile.values.verificacao_campos as Record<string, unknown> | undefined),
        },
      }
      const { error } = await client.from("candidatos").update(values)
        .eq("id", existing.id)
        .eq("sq_candidato_2026", row.sq_candidato)
        .eq("publicavel", false)
      if (error) throw new Error(`perfil Senado update: ${error.message ?? "erro sem mensagem"}`)
      const readback = await readByFilters(client, "candidatos", columns, [["id", existing.id], ["sq_candidato_2026", row.sq_candidato], ["publicavel", false]])
      if (!readback) throw new Error(`perfil Senado: publicação concorrente detectada para SQ ${row.sq_candidato}`)
      for (const [key, value] of Object.entries(values)) {
        if (key === "verificacao_campos") {
          const expected = value as Record<string, unknown>
          const actual = readback.verificacao_campos
          if (!actual || Object.entries(expected).some(([nestedKey, nestedValue]) => stableJson(actual[nestedKey]) !== stableJson(nestedValue))) {
            throw new Error(`perfil Senado: readback divergente em verificacao_campos para SQ ${row.sq_candidato}`)
          }
          continue
        }
        if (stableJson(readback[key]) !== stableJson(value)) {
          throw new Error(`perfil Senado: readback divergente em ${key} para SQ ${row.sq_candidato}`)
        }
      }
    },
  }
}

export interface LocalCohortStore {
  schema_version: "senado-cohort-local-v1"
  rows: SenadoRosterPerson[]
}

export interface LocalCohortUpsertAdapter extends CohortAdapter {
  readonly path: string
  readonly inserts: number
  readonly updates: number
  readonly records: ReadonlyMap<string, SenadoRosterPerson>
}

export function createLocalCohortUpsertAdapter(path: string): LocalCohortUpsertAdapter {
  const target = resolve(path)
  const records = new Map<string, SenadoRosterPerson>()
  if (existsSync(target)) {
    const parsed = JSON.parse(readFileSync(target, "utf8")) as Partial<LocalCohortStore>
    if (parsed.schema_version !== "senado-cohort-local-v1" || !Array.isArray(parsed.rows)) throw new Error(`store local inválido: ${target}`)
    for (const row of parsed.rows) {
      if (row.publicavel !== false || !row.sq_candidato || !row.uf || row.ano !== 2026 || row.cargo_codigo !== "5") throw new Error(`store local contém linha publicável ou identidade inválida: ${target}`)
      const key = rosterIdentity(row)
      if (records.has(key)) throw new Error(`store local contém identidade duplicada: ${key}`)
      records.set(key, row)
    }
  }
  let inserts = 0
  let updates = 0
  return {
    name: "senado-roster-local-json",
    writes: true,
    path: target,
    get inserts() { return inserts },
    get updates() { return updates },
    records,
    async enrich(row) {
      if (row.publicavel !== false || row.cargo_codigo !== "5") throw new Error(`upsert recusado: SQ ${row.sq_candidato}`)
      const key = rosterIdentity(row)
      if (records.has(key)) updates += 1
      else inserts += 1
      records.set(key, row)
      mkdirSync(dirname(target), { recursive: true })
      const rows = [...records.values()].sort((a, b) => rosterIdentity(a).localeCompare(rosterIdentity(b)))
      writeFileSync(target, `${JSON.stringify({ schema_version: "senado-cohort-local-v1", rows }, null, 2)}\n`, "utf8")
    },
  }
}

export interface CohortBootstrapOptions {
  selection: ValidatedCohortSelection
  adapters: CohortAdapter[]
  dryRun: boolean
}

export interface CohortBootstrapResult {
  source: "senado-cohort"
  candidato: string
  dry_run: boolean
  rows: number
  adapters: string[]
  planned: number
  persisted: number
}

/** Falha o executor quando o coletor devolve erro, mesmo sem lançar exceção. */
export function assertColetaSuccess(results: readonly Pick<IngestResult, "source" | "candidato" | "errors" | "coleta_resultado">[]): void {
  const failures = results.filter((result) => result.errors.length > 0 || result.coleta_resultado === "erro")
  if (failures.length > 0) {
    const details = failures.map((result) => `${result.source}/${result.candidato}: ${result.errors.join("; ") || "coleta_resultado=erro"}`).join(" | ")
    throw new Error(`coleta Senado falhou: ${details}`)
  }
}

export async function bootstrapCohort(options: CohortBootstrapOptions): Promise<CohortBootstrapResult> {
  if (options.selection.rows.length === 0) throw new Error("coorte recusada: vazia")
  if (options.dryRun && options.adapters.some((adapter) => adapter.writes)) throw new Error("dry-run recusado: adapter com escrita não pode ser executado")
  const execute = async (): Promise<CohortBootstrapResult> => {
    let persisted = 0
    for (const row of options.selection.rows) {
      for (const adapter of options.adapters) {
        if (options.dryRun) {
          planejarEscrita({ fonte: `${COHORT_AUDIT_SCOPE.source}/senado-cohort/${adapter.name}`, tabela: "coorte_nao_publica", operacao: "upsert", alvo: row.sq_candidato, identidade: `sq:${row.sq_candidato}`, chave: { ano: row.ano, uf: row.uf, cargo_codigo: row.cargo_codigo, sq_candidato: row.sq_candidato }, valores: { publicavel: false } })
        } else {
          await adapter.enrich(row)
          persisted += 1
        }
      }
    }
    return { ...COHORT_INGEST_RESULT_SOURCE, candidato: `coorte-2026-${options.selection.sqs.join(",")}`, dry_run: options.dryRun, rows: options.selection.rows.length, adapters: options.adapters.map((adapter) => adapter.name), planned: options.dryRun ? options.selection.rows.length * options.adapters.length : 0, persisted }
  }
  return withExplicitCohort(buildCohortPromotionConfig(options.selection), execute)
}

export function readRosterManifest(path: string): SenadoRosterManifest {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as SenadoRosterManifest
  if (parsed.schema_version !== "senado-roster-v1" || parsed.metadata?.ano !== 2026 || !Array.isArray(parsed.rows)) throw new Error(`manifesto de roster inválido: ${path}`)
  const seen = new Set<string>()
  for (const row of parsed.rows) {
    if (row.ano !== 2026 || !/^[A-Z]{2}$/.test(row.uf) || !["5", "9", "10"].includes(row.cargo_codigo) || typeof row.publicavel !== "boolean" || !/^\d+$/.test(row.sq_candidato)) throw new Error(`manifesto contém identidade/coorte inválida: ${row.sq_candidato}`)
    const key = rosterIdentity(row)
    if (seen.has(key)) throw new Error(`manifesto contém identidade duplicada: ${key}`)
    seen.add(key)
  }
  return parsed
}
