/**
 * Reconciliacao focal dos cinco eventos da Camara usados pelas perguntas
 * nominais do quiz.
 *
 * O padrao e dry-run. `--apply` e um ato separado: cadastra a linha ausente (ou
 * corrige somente o proposicao_id conhecido da Eletrobras) e insere apenas
 * pares candidato-voto ausentes. Voto existente divergente nunca e alterado.
 * Toda escrita passa por `escreverAuditado`, com CAS no catalogo e readback.
 */

import { createHash } from "node:crypto"
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { parseVoto } from "./lib/ingest-camara"
import { escreverAuditado } from "./lib/escrita-auditada"
import { supabase, supabaseProjectRefParaAuditoria } from "./lib/supabase"

const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2"
const ROOT = resolve(import.meta.dirname, "..")
const DEFAULT_OUTPUT = "/tmp/puxaficha-quiz-audit-20260917/pipeline/reconcile-quiz-votes.json"

export const QUIZ_RECONCILIATION_EVENTS = [
  { questionId: "q01", titulo: "Reforma Trabalhista", votacaoIdApi: "2122076-348", proposicaoId: "2122076", data: "2017-04-26" },
  { questionId: "q02", titulo: "Teto de Gastos (EC 95)", votacaoIdApi: "2088351-324", proposicaoId: "2088351", data: "2016-10-25" },
  { questionId: "q03", titulo: "Reforma da Previdência", votacaoIdApi: "2192459-786", proposicaoId: "2192459", data: "2019-08-06" },
  { questionId: "q04", titulo: "Privatização da Eletrobras", votacaoIdApi: "2270789-73", proposicaoId: "2270789", data: "2021-05-19" },
  { questionId: "q06", titulo: "Autonomia do Banco Central (Câmara)", votacaoIdApi: "2265124-70", proposicaoId: "2265124", data: "2021-02-10" },
] as const

type EventSpec = (typeof QUIZ_RECONCILIATION_EVENTS)[number]
type JsonObject = Record<string, unknown>

interface LocalCandidate {
  slug: string
  cargo_disputado?: string
  ids?: { camara?: number | null }
}

interface PublicCandidate {
  id: string
  slug: string
  cargo_disputado: string | null
  estado: string | null
  status: string | null
}

interface CatalogRow {
  id: string
  titulo: string
  casa: string | null
  fonte: string | null
  votacao_id_api: string | null
  proposicao_id: string | null
  data_votacao: string | null
  descricao: string | null
}

interface CatalogTitleRow {
  id: string
  titulo: string
  casa: string | null
  fonte: string | null
  votacao_id_api: string | null
}

interface ExistingVote {
  candidato_id: string
  votacao_id: string
  voto: string
  contradicao: boolean | null
  contradicao_descricao: string | null
}

interface ExpectedVote {
  candidato_id: string
  slug: string
  nome_deputado_oficial: string | null
  voto: string
  id_camara: number
}

interface VoteConflict {
  candidato_id: string
  slug: string
  id_camara: number
  expected: string
  existing: string | null
}

export function sha256Raw(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex")
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`
}

export function hashJson(value: unknown): string {
  return sha256Raw(stableJson(value))
}

export function normalizeOfficialVote(raw: unknown): string | null {
  return parseVoto(String(raw ?? ""))
}

async function fetchOfficial(url: string): Promise<{ url: string; status: number; raw: string; parsed: JsonObject; sha256: string }> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60_000) })
      const raw = await response.text()
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const parsed = JSON.parse(raw) as JsonObject
      return { url, status: response.status, raw, parsed, sha256: sha256Raw(raw) }
    } catch (error) {
      lastError = error
      if (attempt < 4) await new Promise((done) => setTimeout(done, attempt * 1_000))
    }
  }
  throw new Error(`${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

interface OfficialCollection {
  rows: JsonObject[]
  pages: Array<{ url: string; status: number; sha256: string; rows: number }>
  sha256: string
}

function nextOfficialUrl(payload: JsonObject, currentUrl: string): string | null {
  const links = payload.links
  if (!Array.isArray(links)) return null
  const next = links.find((link) => link && typeof link === "object" && (link as JsonObject).rel === "next") as JsonObject | undefined
  const href = next?.href
  if (typeof href !== "string" || !href.trim()) return null
  return new URL(href, currentUrl).toString()
}

async function fetchOfficialCollection(url: string): Promise<OfficialCollection> {
  const rows: JsonObject[] = []
  const pages: OfficialCollection["pages"] = []
  const seen = new Set<string>()
  let currentUrl: string | null = url
  while (currentUrl) {
    if (seen.has(currentUrl)) throw new Error(`paginação oficial repetida: ${currentUrl}`)
    seen.add(currentUrl)
    if (seen.size > 100) throw new Error(`paginação oficial excedeu 100 páginas: ${url}`)
    const page = await fetchOfficial(currentUrl)
    const pageRows = requireArray(dataField(page.parsed), currentUrl)
    rows.push(...pageRows)
    pages.push({ url: page.url, status: page.status, sha256: page.sha256, rows: pageRows.length })
    currentUrl = nextOfficialUrl(page.parsed, page.url)
  }
  return { rows, pages, sha256: hashJson(pages) }
}

function parseArgs(): { apply: boolean; output: string } {
  const output = process.argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length) ?? DEFAULT_OUTPUT
  return { apply: process.argv.includes("--apply"), output: resolve(output) }
}

function requireArray(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value)) throw new Error(`${label}: resposta sem lista dados`)
  return value.filter((row): row is JsonObject => Boolean(row && typeof row === "object" && !Array.isArray(row)))
}

function dataField(payload: JsonObject): unknown {
  return payload.dados
}

function extractDeputyId(row: JsonObject): number | null {
  const deputy = row.deputado_ as JsonObject | undefined
  const id = Number(deputy?.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

function extractDeputyName(row: JsonObject): string | null {
  const deputy = row.deputado_ as JsonObject | undefined
  const name = deputy?.nome ?? deputy?.nomeEleitoral
  return typeof name === "string" && name.trim() ? name.trim() : null
}

function extractVote(row: JsonObject): string | null {
  return normalizeOfficialVote(row.tipoVoto)
}

function extractProposicaoIds(detail: JsonObject): string[] {
  const values = detail.proposicoesAfetadas
  if (!Array.isArray(values)) return []
  return values.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const id = (item as JsonObject).id
    return id == null ? [] : [String(id)]
  })
}

function loadLocalCandidates(): LocalCandidate[] {
  const rows = JSON.parse(readFileSync(resolve(ROOT, "data/candidatos.json"), "utf8")) as unknown
  if (!Array.isArray(rows)) throw new Error("data/candidatos.json não é uma lista")
  return rows.filter((row): row is LocalCandidate => Boolean(row && typeof row === "object" && typeof (row as JsonObject).slug === "string"))
}

async function loadPublicCandidates(local: LocalCandidate[]): Promise<PublicCandidate[]> {
  const slugs = local
    .filter((candidate) => candidate.cargo_disputado === "Presidente" || candidate.cargo_disputado === "Governador")
    .filter((candidate) => Number.isInteger(candidate.ids?.camara))
    .map((candidate) => candidate.slug)
  const { data, error } = await supabase
    .from("candidatos_publico")
    .select("id,slug,cargo_disputado,estado,status")
    .in("slug", [...new Set(slugs)])
    .order("slug", { ascending: true })
  if (error) throw new Error(`candidatos_publico: ${error.message}`)
  return (data ?? []) as PublicCandidate[]
}

async function loadCatalog(): Promise<{ rows: CatalogRow[]; error: string | null }> {
  const ids = QUIZ_RECONCILIATION_EVENTS.map((event) => event.votacaoIdApi)
  const { data, error } = await supabase
    .from("votacoes_chave")
    .select("id,titulo,casa,fonte,votacao_id_api,proposicao_id,data_votacao,descricao")
    .eq("fonte", "camara")
    .in("votacao_id_api", ids)
    .order("id", { ascending: true })
  return { rows: (data ?? []) as CatalogRow[], error: error?.message ?? null }
}

async function loadTitleCollisions(): Promise<{ rows: CatalogTitleRow[]; error: string | null }> {
  const titles = QUIZ_RECONCILIATION_EVENTS.map((event) => event.titulo)
  const { data, error } = await supabase
    .from("votacoes_chave")
    .select("id,titulo,casa,fonte,votacao_id_api")
    .in("titulo", titles)
    .order("id", { ascending: true })
  return { rows: (data ?? []) as CatalogTitleRow[], error: error?.message ?? null }
}

function writePreflightCheckpoint(output: string, mode: "dry-run" | "apply", events: JsonObject[], titleCollisions: JsonObject[], complete: boolean): string {
  const checkpoint = `${output}.checkpoint.json`
  mkdirSync(dirname(checkpoint), { recursive: true })
  writeFileSync(checkpoint, `${JSON.stringify({
    schema_version: 1,
    checkpoint: complete ? "preflight-complete" : "preflight-progress",
    generated_at: new Date().toISOString(),
    mode,
    remote_writes_started: false,
    title_collisions: titleCollisions,
    events,
  }, null, 2)}\n`)
  return checkpoint
}

async function loadExistingVotes(candidateIds: string[], votacaoId: string): Promise<{ rows: ExistingVote[]; error: string | null }> {
  if (candidateIds.length === 0) return { rows: [], error: null }
  const { data, error } = await supabase
    .from("votos_candidato")
    .select("candidato_id,votacao_id,voto,contradicao,contradicao_descricao")
    .in("candidato_id", candidateIds)
    .eq("votacao_id", votacaoId)
  return { rows: (data ?? []) as ExistingVote[], error: error?.message ?? null }
}

function catalogBefore(catalog: CatalogRow[], event: EventSpec): CatalogRow | null {
  const rows = catalog.filter((row) => row.votacao_id_api === event.votacaoIdApi)
  if (rows.length > 1) throw new Error(`catálogo duplicado para ${event.votacaoIdApi}`)
  return rows[0] ?? null
}

function buildManifestCandidateMap(local: LocalCandidate[], publicCandidates: PublicCandidate[]): Map<number, PublicCandidate> {
  const publicBySlug = new Map<string, PublicCandidate>()
  for (const candidate of publicCandidates) {
    if (publicBySlug.has(candidate.slug)) throw new Error(`candidatos_publico: slug duplicado ${candidate.slug}`)
    publicBySlug.set(candidate.slug, candidate)
  }
  const byCamara = new Map<number, PublicCandidate>()
  const localSlugs = new Set<string>()
  for (const candidate of local) {
    if (candidate.cargo_disputado !== "Presidente" && candidate.cargo_disputado !== "Governador") continue
    const idCamara = candidate.ids?.camara
    const publicCandidate = publicBySlug.get(candidate.slug)
    if (!Number.isInteger(idCamara) || !publicCandidate || publicCandidate.slug !== candidate.slug || publicCandidate.status === "removido") continue
    if (localSlugs.has(candidate.slug)) throw new Error(`data/candidatos.json: slug executivo duplicado ${candidate.slug}`)
    localSlugs.add(candidate.slug)
    if (byCamara.has(Number(idCamara))) throw new Error(`data/candidatos.json: id Câmara duplicado ${idCamara}`)
    byCamara.set(Number(idCamara), publicCandidate)
  }
  return byCamara
}

async function applyCatalogAction(event: EventSpec, before: CatalogRow | null, detail: JsonObject): Promise<CatalogRow> {
  const description = typeof detail.descricao === "string" ? detail.descricao : null
  if (!before) {
    const rows = await escreverAuditado(
      { script: "reconcile-quiz-votes", tabela: "votacoes_chave", motivo: `cadastra referência nominal ${event.questionId}`, recorte: event.votacaoIdApi },
      () => supabase.from("votacoes_chave").insert({ titulo: event.titulo, descricao: description, data_votacao: event.data, casa: "Câmara", fonte: "camara", votacao_id_api: event.votacaoIdApi, proposicao_id: event.proposicaoId }).select("id,titulo,casa,fonte,votacao_id_api,proposicao_id,data_votacao,descricao"),
    )
    const inserted = rows[0] as CatalogRow | undefined
    if (!inserted) throw new Error(`insert de catálogo não retornou ${event.votacaoIdApi}`)
    return inserted
  }

  if (before.proposicao_id === event.proposicaoId) return before
  if (event.questionId !== "q04" || before.proposicao_id !== "2228666") {
    throw new Error(`CAS recusou correção inesperada de ${event.votacaoIdApi}: ${before.proposicao_id}`)
  }
  const rows = await escreverAuditado(
    { script: "reconcile-quiz-votes", tabela: "votacoes_chave", motivo: "corrige proposição oficial da Eletrobras", recorte: `${event.votacaoIdApi} 2228666->${event.proposicaoId}` },
    () => supabase.from("votacoes_chave").update({ proposicao_id: event.proposicaoId }).eq("id", before.id).eq("votacao_id_api", event.votacaoIdApi).eq("proposicao_id", "2228666").select("id,titulo,casa,fonte,votacao_id_api,proposicao_id,data_votacao,descricao"),
  )
  const updated = rows[0] as CatalogRow | undefined
  if (!updated) throw new Error(`CAS não confirmou correção ${event.votacaoIdApi}`)
  return updated
}

async function main(): Promise<void> {
  const args = parseArgs()
  const local = loadLocalCandidates()
  const publicCandidates = await loadPublicCandidates(local)
  const byCamara = buildManifestCandidateMap(local, publicCandidates)
  const catalogResult = await loadCatalog()
  if (catalogResult.error) throw new Error(`votacoes_chave: ${catalogResult.error}`)
  const catalog = catalogResult.rows
  const titleResult = await loadTitleCollisions()
  if (titleResult.error) throw new Error(`colisão de títulos votacoes_chave: ${titleResult.error}`)
  const titleCollisions = titleResult.rows.flatMap((row) => {
    const event = QUIZ_RECONCILIATION_EVENTS.find((candidate) => candidate.titulo === row.titulo)
    if (!event || (row.votacao_id_api === event.votacaoIdApi && row.fonte === "camara")) return []
    return [{ id: row.id, titulo: row.titulo, casa: row.casa, fonte: row.fonte, votacao_id_api: row.votacao_id_api, expected_event: event.votacaoIdApi }]
  })
  const preparedEvents: Array<{
    event: EventSpec
    metadata: Awaited<ReturnType<typeof fetchOfficial>>
    detail: JsonObject
    officialPropositions: string[]
    votesSource: OfficialCollection
    voteRows: JsonObject[]
    expected: ExpectedVote[]
    before: CatalogRow | null
    existingResult: { rows: ExistingVote[]; error: string | null }
    missing: ExpectedVote[]
    conflicts: VoteConflict[]
  }> = []

  for (const event of QUIZ_RECONCILIATION_EVENTS) {
    const metadata = await fetchOfficial(`${CAMARA_API}/votacoes/${event.votacaoIdApi}`)
    const detail = (dataField(metadata.parsed) ?? {}) as JsonObject
    const officialPropositions = extractProposicaoIds(detail)
    if (!officialPropositions.includes(event.proposicaoId)) throw new Error(`${event.votacaoIdApi}: proposição oficial não contém ${event.proposicaoId}`)
    const votesSource = await fetchOfficialCollection(`${CAMARA_API}/votacoes/${event.votacaoIdApi}/votos`)
    const voteRows = votesSource.rows
    const expected: ExpectedVote[] = voteRows.flatMap((row) => {
      const idCamara = extractDeputyId(row)
      const voto = extractVote(row)
      const candidate = idCamara == null ? undefined : byCamara.get(idCamara)
      if (!candidate || !voto) return []
      return [{ candidato_id: candidate.id, slug: candidate.slug, nome_deputado_oficial: extractDeputyName(row), voto, id_camara: idCamara as number }]
    })
    const before = catalogBefore(catalog, event)
    const existingResult = before
      ? await loadExistingVotes([...new Set(expected.map((row) => row.candidato_id))], before.id)
      : { rows: [], error: null }
    if (existingResult.error) throw new Error(`votos_candidato ${event.votacaoIdApi}: ${existingResult.error}`)
    const existingByCandidate = new Map(existingResult.rows.map((row) => [row.candidato_id, row]))
    const missing = expected.filter((row) => !existingByCandidate.has(row.candidato_id))
    const conflicts = expected.filter((row) => {
      const existing = existingByCandidate.get(row.candidato_id)
      return existing && normalizeOfficialVote(existing.voto) !== row.voto
    }).map((row) => ({
      candidato_id: row.candidato_id,
      slug: row.slug,
      id_camara: row.id_camara,
      expected: row.voto,
      existing: existingByCandidate.get(row.candidato_id)?.voto ?? null,
    }))

    preparedEvents.push({
      event,
      metadata,
      detail,
      officialPropositions,
      votesSource,
      voteRows,
      expected,
      before,
      existingResult,
      missing,
      conflicts,
    })
    writePreflightCheckpoint(
      args.output,
      args.apply ? "apply" : "dry-run",
      preparedEvents.map((prepared) => ({
        question_id: prepared.event.questionId,
        votacao_id_api: prepared.event.votacaoIdApi,
        expected_rows: prepared.expected,
        missing_rows: prepared.missing,
        conflicts_preserved: prepared.conflicts,
        catalog_before: prepared.before,
      })),
      titleCollisions,
      false,
    )
  }

  const conflictCount = preparedEvents.reduce((sum, prepared) => sum + prepared.conflicts.length, 0)
  const applyBlocked = args.apply && (conflictCount > 0 || titleCollisions.length > 0)
  const preflightCheckpoint = writePreflightCheckpoint(
    args.output,
    args.apply ? "apply" : "dry-run",
    preparedEvents.map((prepared) => ({
      question_id: prepared.event.questionId,
      votacao_id_api: prepared.event.votacaoIdApi,
      expected_rows: prepared.expected,
      missing_rows: prepared.missing,
      conflicts_preserved: prepared.conflicts,
      catalog_before: prepared.before,
    })),
    titleCollisions,
    true,
  )
  const events: JsonObject[] = []
  for (const prepared of preparedEvents) {
    const { event, metadata, officialPropositions, votesSource, voteRows, expected, before, existingResult, missing, conflicts } = prepared
    let afterCatalog: CatalogRow | null = null
    let afterVotesResult: { rows: ExistingVote[]; error: string | null } | null = null
    if (args.apply && !applyBlocked) {
      afterCatalog = await applyCatalogAction(event, before, prepared.detail)
      if (missing.length > 0) {
        const rows = await escreverAuditado(
          { script: "reconcile-quiz-votes", tabela: "votos_candidato", motivo: `insere votos nominais ausentes ${event.questionId}`, recorte: `${event.votacaoIdApi}: ${missing.length} pares` },
          () => supabase.from("votos_candidato").insert(missing.map((row) => ({ candidato_id: row.candidato_id, votacao_id: afterCatalog!.id, voto: row.voto, contradicao: false, contradicao_descricao: null }))).select("candidato_id,votacao_id,voto,contradicao,contradicao_descricao"),
        )
        if (rows.length !== missing.length) throw new Error(`${event.votacaoIdApi}: readback de votos ${rows.length}/${missing.length}`)
      }
      afterVotesResult = await loadExistingVotes([...new Set(expected.map((row) => row.candidato_id))], afterCatalog.id)
      if (afterVotesResult.error) throw new Error(`readback votos ${event.votacaoIdApi}: ${afterVotesResult.error}`)
      const afterByCandidate = new Map(afterVotesResult.rows.map((row) => [row.candidato_id, row]))
      const readbackMismatch = expected.filter((row) => normalizeOfficialVote(afterByCandidate.get(row.candidato_id)?.voto) !== row.voto)
      if (readbackMismatch.length > 0) throw new Error(`${event.votacaoIdApi}: readback não confirma todos os votos esperados (${readbackMismatch.length})`)
    }
    const candidateById = new Map(expected.map((row) => [row.candidato_id, row]))
    const observedRows = afterVotesResult?.rows ?? existingResult.rows
    const afterRows = observedRows.map((row) => ({
      ...(candidateById.get(row.candidato_id) ?? {}),
      candidato_id: row.candidato_id,
      votacao_id: row.votacao_id,
      voto: row.voto,
    }))

    events.push({
      question_id: event.questionId,
      titulo: event.titulo,
      votacao_id_api: event.votacaoIdApi,
      proposicao_id_esperada: event.proposicaoId,
      fontes: {
        metadata: { url: metadata.url, status: metadata.status, sha256: metadata.sha256, proposicoes_afetadas: officialPropositions },
        votos: { url: `${CAMARA_API}/votacoes/${event.votacaoIdApi}/votos`, paginas: votesSource.pages, sha256: votesSource.sha256, linhas_nominais: voteRows.length },
      },
      catalogo: {
        before: before ? { ...before, sha256: hashJson(before) } : null,
        action: applyBlocked ? "blocked_conflicts" : !before ? "insert" : before.proposicao_id !== event.proposicaoId ? "cas_update" : "none",
        after: afterCatalog ? { ...afterCatalog, sha256: hashJson(afterCatalog) } : null,
      },
      candidatos_executivo_publicos_com_id_camara: byCamara.size,
      votos_comparaveis: expected.length,
      expected_rows: expected,
      missing_rows: missing,
      existing_before: existingResult.rows.length,
      votes_before_sha256: hashJson(existingResult.rows),
      votes_after_sha256: afterVotesResult ? hashJson(afterVotesResult.rows) : null,
      votes_after_count: afterVotesResult?.rows.length ?? null,
      after_rows: afterRows,
      missing_to_insert: missing.length,
      conflicts_preserved: conflicts,
      apply_executado: Boolean(args.apply && !applyBlocked),
      unknown_vote_rows: voteRows.length - expected.length,
    })
  }

  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    apply_blocked: applyBlocked,
    preflight_checkpoint: preflightCheckpoint,
    title_collisions: titleCollisions,
    supabase_project: supabaseProjectRefParaAuditoria(),
    scope: "quiz nominal q01 q02 q03 q04 q06; Câmara; Presidente/Governador; slug e id oficial",
    events,
    summary: {
      events: events.length,
      candidates_public_executive_with_camara_id: byCamara.size,
      missing_to_insert: events.reduce((sum, event) => sum + Number(event.missing_to_insert ?? 0), 0),
      conflicts_preserved: events.reduce((sum, event) => sum + (Array.isArray(event.conflicts_preserved) ? event.conflicts_preserved.length : 0), 0),
      apply_blocked: applyBlocked,
      title_collisions: titleCollisions.length,
    },
  }
  mkdirSync(dirname(args.output), { recursive: true })
  writeFileSync(args.output, `${JSON.stringify(manifest, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(manifest.summary)}\n`)
  if (applyBlocked) throw new Error(`apply bloqueado: ${conflictCount} voto(s) existente(s) divergente(s); nenhum lote foi alterado`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
