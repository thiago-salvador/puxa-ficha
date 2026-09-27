import { createHash } from "node:crypto"
import { chmodSync, copyFileSync, createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"

import { assertOutsideRepository } from "../audit/lib/private-output"
import { financiamentoReceitasZipUrls } from "../lib/tse-financiamento-receitas-urls"
import { getExplicitCohort } from "../lib/cohort-context"
import { withVisibleTseChrome } from "./chrome-fetch"
import { collectDivulgaCandidateFallback, type DivulgaCandidateSummary, type SeedCandidateIdentity } from "./divulga-candidate"
import { collectDivulgaFinancingForClient, type DivulgaFinancingResult } from "./divulga-financing"
import { officialCandidateUfMap } from "./official-uf"

const TSE_CDN = "https://cdn.tse.jus.br/estatistica/sead/odsele"
export const HISTORICAL_YEARS = Array.from({ length: 16 }, (_, index) => 1996 + index * 2)
export const HISTORICAL_SOURCE = "tse-historico"

export type CliOptions = {
  mode: "dry-run" | "live"
  outDir: string
  profiles: string | null
  candidates: string
  historicalYears: number[]
  slugs: string[] | null
  openCells: string | null
  expectedPlanSha: string | null
  verifiedCacheManifest: string | null
}

export type CandidateProfile = { slug?: unknown; id?: unknown; [key: string]: unknown }
export type SeedCandidate = { slug?: unknown; [key: string]: unknown }

export function candidateUfForDivulga(candidate: SeedCandidate): string {
  if (candidate.cargo_disputado === "Presidente") return "BR"
  return typeof candidate.estado === "string" ? candidate.estado.toUpperCase() : ""
}

/** Extend curated SQ anchors only with links returned by that candidate's verified 2026 detail. */
export function enrichSeedWithDivulga(candidates: readonly SeedCandidate[], summaries: readonly DivulgaCandidateSummary[]) {
  const bySlug = new Map(summaries.filter((row) => row.status === "ok").map((row) => [row.slug, row]))
  const conflicts: Array<{ slug: string; year: number }> = []
  const enriched = candidates.map((candidate) => {
    const slug = typeof candidate.slug === "string" ? candidate.slug : ""
    const summary = bySlug.get(slug)
    const oldIds = candidate.ids && typeof candidate.ids === "object" ? candidate.ids as Record<string, unknown> : {}
    const oldSq = oldIds.tse_sq_candidato && typeof oldIds.tse_sq_candidato === "object"
      ? oldIds.tse_sq_candidato as Record<string, string> : {}
    if (!summary || oldSq["2026"] !== summary.sqCandidato) return candidate
    const sqByYear = { ...oldSq }
    const oldUf = oldIds.tse_uf_candidatura && typeof oldIds.tse_uf_candidatura === "object"
      ? oldIds.tse_uf_candidatura as Record<string, string> : {}
    const ufByYear = { ...oldUf }
    const priorVerifiedUf: Record<string, string> = {}
    for (const prior of summary.eleicoesAnteriores ?? []) {
      if (!Number.isInteger(prior.year) || prior.year! < 1996 || prior.year! > 2026 ||
          !prior.sqCandidato || !/^\d{5,20}$/.test(prior.sqCandidato)) continue
      const year = String(prior.year)
      if (sqByYear[year] && sqByYear[year] !== prior.sqCandidato) {
        conflicts.push({ slug, year: prior.year! })
        continue
      }
      sqByYear[year] = prior.sqCandidato
      if (prior.uf && !ufByYear[year]) ufByYear[year] = prior.uf
      if (prior.uf && /^[A-Z]{2}$/.test(prior.uf) && ufByYear[year] === prior.uf) priorVerifiedUf[year] = prior.uf
    }
    return { ...candidate, ids: { ...oldIds, tse_sq_candidato: sqByYear, tse_uf_candidatura: ufByYear, tse_divulga_prior_uf: priorVerifiedUf } }
  })
  return { candidates: enriched, conflicts }
}
export type CandidateCohort = { profiles: CandidateProfile[]; candidates: SeedCandidate[]; requestedSlugs: string[] | null }

export type Asset = {
  family: "perfil_atual" | "historico_politico" | "patrimonio" | "financiamento"
  year: number
  path: string
  url: string
  sha256: string
  bytes: number
  reused_cache?: true
}

function argument(argv: readonly string[], name: string): string | null {
  return argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
}

export function parseCliOptions(argv: readonly string[], cwd = process.cwd()): CliOptions {
  const switches = new Set(["--live", "--dry-run"])
  const valueOptions = new Set(["profiles", "candidates", "years", "slugs", "open-cells", "out-dir", "expected-plan-sha", "verified-cache-manifest"])
  for (const item of argv) {
    if (switches.has(item)) continue
    const name = item.startsWith("--") ? item.slice(2).split("=", 1)[0] : ""
    if (!item.startsWith("--") || !item.includes("=") || !valueOptions.has(name)) throw new Error(`opção TSE local desconhecida: ${item.split("=", 1)[0]}`)
  }
  const live = argv.includes("--live")
  const dryRun = argv.includes("--dry-run")
  if (live && dryRun) throw new Error("use --live ou --dry-run, não ambos")
  const profiles = argument(argv, "profiles")
  const expectedPlanSha = argument(argv, "expected-plan-sha") ?? null
  if (live && !/^[a-f0-9]{64}$/i.test(expectedPlanSha ?? "")) {
    throw new Error("--live exige --expected-plan-sha=<SHA-256 revisado>")
  }
  const rawSlugs = argument(argv, "slugs")
  const slugs = rawSlugs ? [...new Set(rawSlugs.split(",").map((slug) => slug.trim()).filter(Boolean))] : null
  if (rawSlugs && (!slugs?.length || slugs.some((slug) => !/^[a-z0-9][a-z0-9-]{0,119}$/i.test(slug)))) {
    throw new Error("--slugs deve listar slugs públicos separados por vírgula")
  }
  if (!profiles && slugs) throw new Error("--slugs exige --profiles=<snapshot-privado.json>")
  const rawYears = argument(argv, "years")
  const historicalYears = rawYears ? [...new Set(rawYears.split(",").map(Number))].sort((a, b) => a - b) : HISTORICAL_YEARS
  if (!historicalYears.length || historicalYears.some((year) => !HISTORICAL_YEARS.includes(year))) {
    throw new Error("--years deve listar eleições pares canônicas entre 1996 e 2026")
  }
  const openCells = argument(argv, "open-cells")
  return {
    mode: live ? "live" : "dry-run",
    outDir: resolve(argument(argv, "out-dir") ?? join(homedir(), "Library", "Application Support", "puxa-ficha", "tse-local", new Date().toISOString().replace(/[:.]/g, "-"))),
    profiles: profiles ? resolve(profiles) : null,
    candidates: resolve(argument(argv, "candidates") ?? join(cwd, "data/candidatos.json")),
    historicalYears,
    slugs,
    openCells: openCells ? resolve(openCells) : null,
    expectedPlanSha,
    verifiedCacheManifest: argument(argv, "verified-cache-manifest") ? resolve(argument(argv, "verified-cache-manifest")!) : null,
  }
}

export function officialPackages2026(): Array<{ family: Asset["family"]; year: 2026; url: string; cacheName: string }> {
  return [
    { family: "perfil_atual", year: 2026, url: `${TSE_CDN}/consulta_cand/consulta_cand_2026.zip`, cacheName: "consulta_cand_2026.zip" },
    { family: "patrimonio", year: 2026, url: `${TSE_CDN}/bem_candidato/bem_candidato_2026.zip`, cacheName: "bem_candidato_2026.zip" },
    { family: "financiamento", year: 2026, url: financiamentoReceitasZipUrls(2026).at(-1)!, cacheName: "receitas_2026_0_prestacao_de_contas_eleitorais_candidatos_2026.zip" },
  ]
}

export function historicalUrl(year: number): string {
  if (!HISTORICAL_YEARS.includes(year)) throw new Error(`ano eleitoral fora do escopo: ${year}`)
  return `${TSE_CDN}/consulta_cand/consulta_cand_${year}.zip`
}

export function historicalFamilyPackages(year: number): Array<{ family: Asset["family"]; year: number; url: string }> {
  if (!HISTORICAL_YEARS.includes(year)) throw new Error(`ano eleitoral fora do escopo: ${year}`)
  if (year === 2026) return []
  return [
    ...(year >= 2006 ? [{ family: "patrimonio" as const, year, url: `${TSE_CDN}/bem_candidato/bem_candidato_${year}.zip` }] : []),
    ...(year >= 2002 ? [{ family: "financiamento" as const, year, url: financiamentoReceitasZipUrls(year).at(-1)! }] : []),
  ]
}

/** The sole cohort selector used by all local source/review steps. */
export function selectCandidateCohort(
  profiles: readonly CandidateProfile[],
  candidates: readonly SeedCandidate[],
  requestedSlugs: readonly string[] | null = null,
): CandidateCohort {
  const explicit = getExplicitCohort()
  const explicitSlugs = explicit ? new Set(explicit.map((candidate) => candidate.slug)) : null
  const selected = requestedSlugs || explicitSlugs
    ? new Set([...(requestedSlugs ?? []), ...(explicitSlugs ?? [])].filter((slug) => !explicitSlugs || explicitSlugs.has(slug)))
    : null
  const profileBySlug = new Map<string, CandidateProfile>()
  for (const profile of profiles) {
    const slug = typeof profile.slug === "string" ? profile.slug.trim() : ""
    const id = typeof profile.id === "string" ? profile.id.trim() : ""
    if (!slug || !id || profileBySlug.has(slug)) throw new Error("snapshot público contém slug/id ausente ou duplicado")
    profileBySlug.set(slug, profile)
  }
  const candidateBySlug = new Map<string, SeedCandidate>()
  for (const candidate of candidates) {
    const slug = typeof candidate.slug === "string" ? candidate.slug.trim() : ""
    if (slug && candidateBySlug.has(slug)) throw new Error("seed contém slug duplicado")
    if (slug) candidateBySlug.set(slug, candidate)
  }
  const cohortSlugs = [...profileBySlug.keys()].filter((slug) =>
    (!selected || selected.has(slug)) && candidateBySlug.has(slug),
  ).sort()
  if (selected) {
    const absent = [...selected].filter((slug) => !cohortSlugs.includes(slug))
    if (absent.length) throw new Error(`slugs solicitados fora da coorte pública local: ${absent.join(", ")}`)
  }
  return {
    profiles: cohortSlugs.map((slug) => profileBySlug.get(slug)!),
    candidates: cohortSlugs.map((slug) => candidateBySlug.get(slug)!),
    requestedSlugs: requestedSlugs ? [...requestedSlugs] : null,
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest("hex")
}

type VerifiedCacheAsset = { family: Asset["family"]; year: number; path: string; url: string; sha256: string }

async function verifiedCacheFallback(
  manifestPath: string | null,
  info: { family: Asset["family"]; year: number },
  url: string,
): Promise<{ path: string; sha256: string; bytes: number; reused_cache: true } | null> {
  if (!manifestPath) return null
  const manifest = resolve(assertOutsideRepository(manifestPath, "--verified-cache-manifest"))
  const raw = JSON.parse(readFileSync(manifest, "utf8")) as { assets?: VerifiedCacheAsset[] }
  const matchingUrl = (raw.assets ?? []).filter((asset) => asset.year === info.year && asset.url === url)
  const exactFamily = matchingUrl.filter((asset) => asset.family === info.family)
  const candidates = exactFamily.length ? exactFamily : info.family === "perfil_atual"
    ? matchingUrl.filter((asset) => asset.family === "historico_politico")
    : []
  if (candidates.length !== 1) return null
  const asset = candidates[0]!
  const path = resolve(dirname(manifest), asset.path)
  assertOutsideRepository(path, "asset de cache verificado")
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !/^[a-f0-9]{64}$/i.test(asset.sha256)) return null
  if (await sha256File(path) !== asset.sha256.toLowerCase()) return null
  try { execFileSync("unzip", ["-tqq", path], { stdio: "ignore", timeout: 15 * 60_000 }) }
  catch { return null }
  const { statSync } = await import("node:fs")
  return { path, sha256: asset.sha256.toLowerCase(), bytes: statSync(path).size, reused_cache: true }
}

function writePrivate(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  chmodSync(path, 0o600)
}

export function summarizeOpenCells(path: string | null, cohortSlugs: ReadonlySet<string> | null) {
  if (!path) return { supplied: false, rows: null, in_cohort: null, by_state: {} as Record<string, number>, cells: [] as Array<{ slug: string; family: string | null }> }
  let rows = 0
  const byState: Record<string, number> = {}
  const cells: Array<{ slug: string; family: string | null }> = []
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue
    const row = JSON.parse(line) as Record<string, unknown>
    rows++
    const slug = typeof row.alvo === "string" ? row.alvo : typeof row.slug === "string" ? row.slug : ""
    if (!cohortSlugs || cohortSlugs.has(slug)) {
      const state = typeof row.estado === "string" ? row.estado : "sem_estado"
      byState[state] = (byState[state] ?? 0) + 1
      const family = typeof row.familia === "string" ? row.familia : typeof row.family === "string" ? row.family : null
      if (slug) cells.push({ slug, family })
    }
  }
  const uniqueCells = [...new Map(cells.map((cell) => [`${cell.slug}|${cell.family ?? "*"}`, cell])).values()]
  return { supplied: true, rows, in_cohort: uniqueCells.length, by_state: byState, cells: uniqueCells }
}

export function projectedClosure(openCells: ReturnType<typeof summarizeOpenCells>, directories: readonly string[], projectionPath: string | null,
  familyReceiptsPath: string, historyReceiptsPath: string, divulgaSummaries: readonly DivulgaCandidateSummary[] | null,
  profiles: readonly CandidateProfile[] = [], identityRiskSlugs: ReadonlySet<string> = new Set(), partyReceiptsPath?: string) {
  const planned: Array<{ alvo?: string; familia?: string; fonte?: string }> = []
  for (const directory of directories) {
    if (!existsSync(directory)) continue
    const plans = readdirSync(directory).filter((name) => /^plano-.*\.json$/.test(name))
    const latest = plans.sort().at(-1)
    if (!latest) continue
    const parsed = JSON.parse(readFileSync(join(directory, latest), "utf8")) as { planned?: typeof planned }
    planned.push(...(parsed.planned ?? []))
  }
  if (!openCells.supplied) return { measured: false, closed_now: null, projected_after_safe_write: null, by_source: {} }
  const read = (path: string): { receipts?: Array<{ alvo?: string; fonte?: string; detalhe?: string; resultado?: string }>; diagnostics?: Array<{ slug: string; family: string; reason: string }>; apply_projection?: Array<{ slug: string; family: string; writer_actions: string[]; post_write_readback_matches: boolean; reason: string }> } =>
    existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {}
  const family = read(familyReceiptsPath)
  const history = read(historyReceiptsPath)
  const party = partyReceiptsPath ? read(partyReceiptsPath) : { receipts: [] }
  const projection = projectionPath ? read(projectionPath) : {}
  const diagnostic = new Map((family.diagnostics ?? []).map((row) => [`${row.slug}|${row.family}`, row.reason]))
  const simulated = new Map((projection.apply_projection ?? []).map((row) => [`${row.slug}|${row.family}`, row]))
  const official2026 = new Map((divulgaSummaries ?? []).map((row) => [row.slug, row]))
  const profileBySlug = new Map(profiles.filter((row): row is CandidateProfile & { slug: string } => typeof row.slug === "string").map((row) => [row.slug, row]))
  const results = openCells.cells.map((cell) => {
    const source = cell.family === "patrimonio" ? "tse-patrimonio" : cell.family === "financiamento" ? "tse-financiamento" : cell.family === "historico_politico" ? "tse-historico" : cell.family === "mudancas_partido" ? "tse-partido-candidatura" : "sem-fonte"
    const now = planned.some((row) => row.alvo === cell.slug && row.familia === cell.family)
    const counterfactual = simulated.get(`${cell.slug}|${cell.family}`)
    const after = !now && !identityRiskSlugs.has(cell.slug) && Boolean(counterfactual?.writer_actions.length && counterfactual.post_write_readback_matches)
    const sourceReceipt = [...(history.receipts ?? []), ...(party.receipts ?? [])]
      .find((row) => row.alvo === cell.slug && row.fonte === source)
    let sourceReason = sourceReceipt?.resultado ?? "sem_recibo"
    if (cell.family === "mudancas_partido" && sourceReceipt?.detalhe) {
      try {
        const detail = JSON.parse(sourceReceipt.detalhe) as { motivo?: string }
        sourceReason = detail.motivo ?? sourceReason
      } catch { /* resultado do recibo continua disponível */ }
    }
    const reason = diagnostic.get(`${cell.slug}|${cell.family}`) ?? sourceReason
    const candidate = official2026.get(cell.slug)
    const profile = profileBySlug.get(cell.slug)
    const annual = Array.isArray(profile?.patrimonio_eleicoes) ? profile.patrimonio_eleicoes as Array<{ ano?: number; estado?: string; fonte_url?: string }> : []
    const published = Array.isArray(profile?.patrimonio) ? profile.patrimonio as Array<{ ano_eleicao?: number }> : []
    const empty2026 = cell.family === "patrimonio" && diagnostic.get(`${cell.slug}|${cell.family}`) === "official_row_missing_or_identity_mismatch" &&
      candidate?.status === "ok" && Array.isArray(candidate.bens) && candidate.bens.length === 0 && candidate.totalDeBens === 0 &&
      !published.some((row) => row.ano_eleicao === 2026) && annual.some((row) => row.ano === 2026 && row.estado === "vazio_confirmado" && /^https:\/\//.test(row.fonte_url ?? ""))
    const category = now ? "closed_now" : empty2026 ? "scope_vazio_confirmado_2026"
      : cell.family === "patrimonio" && reason === "source_manifest_incomplete" ? "scope_outside_supported_series"
        : identityRiskSlugs.has(cell.slug) || /identity|uf_|sq_|ambig|curated/i.test(reason) ? "identity_review"
          : after ? "projected_after_safe_write"
        : cell.family === "mudancas_partido" ? "scope_rule_review"
          : /materialized_readback|indeterminado/i.test(reason) ? "stale_not_projected" : "unresolved"
    return { slug: cell.slug, family: cell.family, fonte: source, category, reason: counterfactual?.reason ?? reason,
      writer_actions: counterfactual?.writer_actions ?? [],
      writer_status: counterfactual ? counterfactual.writer_actions.length ? "simulated_action" : "no_planned_action"
        : cell.family === "historico_politico" || cell.family === "mudancas_partido" ? "no_audited_domain_writer" : "projection_unavailable",
      post_write_readback_matches: counterfactual?.post_write_readback_matches ?? null,
      ...(empty2026 ? { proof_url: candidate.source } : {}) }
  })
  const bySource: Record<string, Record<string, number>> = {}
  for (const result of results) {
    const source = bySource[result.fonte] ?? {}
    source[result.category] = (source[result.category] ?? 0) + 1
    bySource[result.fonte] = source
  }
  return { measured: true, closed_now: results.filter((row) => row.category === "closed_now").length,
    projected_after_safe_write: results.filter((row) => row.category === "projected_after_safe_write").length,
    by_source: bySource, cells: results }
}

function privateDirectory(path: string): string {
  const absolute = assertOutsideRepository(path, "--out-dir")
  mkdirSync(absolute, { recursive: true, mode: 0o700 })
  if (lstatSync(absolute).isSymbolicLink()) throw new Error("--out-dir não pode ser link simbólico")
  chmodSync(absolute, 0o700)
  return assertOutsideRepository(realpathSync(absolute), "--out-dir real")
}

type StepResult = { ok: boolean; code: number | null; reason?: string; stdout?: string }

function runScript(script: string, args: string[], env?: NodeJS.ProcessEnv): StepResult {
  const result = spawnSync(process.execPath, ["--import", "tsx", script, ...args], { encoding: "utf8", ...(env ? { env } : {}), maxBuffer: 16 * 1024 * 1024 })
  if (result.status === 0) return { ok: true, code: 0, stdout: result.stdout ?? "" }
  const stderr = (result.stderr ?? "").slice(0, 12_000)
  const reason = /403|network|failed to fetch|fonte indispon/i.test(stderr) ? "leitura da fonte indisponível"
    : /salt/i.test(stderr) ? "salt de hash ausente ou inválido"
      : /manifest|sha/i.test(stderr) ? "manifesto ou SHA inválido"
        : /json|parse|zip|csv/i.test(stderr) ? "falha de parsing ou validação do pacote"
          : `etapa terminou sem sucesso (código ${result.status ?? "indisponível"})`
  return { ok: false, code: result.status, reason }
}

function stepSummary(result: StepResult): { ok: boolean; code: number | null; reason?: string } {
  return { ok: result.ok, code: result.code, ...(result.reason ? { reason: result.reason } : {}) }
}

function safeDownloadFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "falha sem detalhe"
  return /403|forbidden|network|failed to fetch|timeout|net::/i.test(message) ? "fonte oficial indisponível nesta execução"
    : /range|content-range|206|content-length/i.test(message) ? "resposta Range inválida ou incompleta"
      : /zip|crc|signature|archive/i.test(message) ? "pacote ZIP inválido"
        : "falha de download ou validação do pacote"
}

function isLiveMode(mode: CliOptions["mode"]): boolean { return mode === "live" }

function cacheZip(privateDownloadedPath: string, cachePath: string): void {
  mkdirSync(dirname(cachePath), { recursive: true, mode: 0o700 })
  const temporary = `${cachePath}.${process.pid}.tmp`
  copyFileSync(privateDownloadedPath, temporary)
  chmodSync(temporary, 0o600)
  renameSync(temporary, cachePath)
}

async function downloadAssets(
  outDir: string,
  historicalYears: readonly number[],
  options: CliOptions,
  divulgaCandidates: readonly SeedCandidateIdentity[],
): Promise<{ manifestPath: string; assets: Asset[]; errors: Array<{ source: string; year: number; reason: string }>; divulgaSummaries: DivulgaCandidateSummary[] | null; divulgaFinancing: Array<{ slug: string; receipt: DivulgaFinancingResult }> | null; officialUfOverrides: Array<{ slug: string; from: string; to: string }> }> {
  const downloadsDir = join(outDir, "downloads")
  mkdirSync(downloadsDir, { recursive: true, mode: 0o700 })
  chmodSync(downloadsDir, 0o700)
  const dataDir = resolve("data")
  if (lstatSync(dataDir).isSymbolicLink()) throw new Error("data não pode ser link simbólico")
  const cacheDir = resolve(dataDir, "tse")
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 })
  if (lstatSync(cacheDir).isSymbolicLink()) throw new Error("data/tse não pode ser link simbólico")
  chmodSync(cacheDir, 0o700)
  const requests = new Map<string, { family: Asset["family"]; year: number; cacheName?: string }>()
  for (const item of officialPackages2026()) requests.set(item.url, { family: item.family, year: item.year, cacheName: item.cacheName })
  for (const year of historicalYears) {
    if (year === 2026) continue
    requests.set(historicalUrl(year), { family: "historico_politico", year })
    for (const item of historicalFamilyPackages(year)) requests.set(item.url, item)
  }

  const downloaded = new Map<string, { path: string; sha256: string; bytes: number; reused_cache?: true }>()
  const errors: Array<{ source: string; year: number; reason: string }> = []
  let divulgaSummaries: DivulgaCandidateSummary[] | null = null
  let divulgaFinancing: Array<{ slug: string; receipt: DivulgaFinancingResult }> | null = null
  const officialUfOverrides: Array<{ slug: string; from: string; to: string }> = []
  try {
    await withVisibleTseChrome(async (client) => {
      for (const [url, info] of requests) {
        const name = basename(new URL(url).pathname)
        const destination = join(downloadsDir, `${info.year}-${info.family}-${name}`)
        try {
          const receipt = await client.downloadZip(url, destination)
          downloaded.set(url, { path: destination, ...receipt })
          if (info.cacheName) cacheZip(destination, join(cacheDir, info.cacheName))
        } catch (error) {
          const fallback = await verifiedCacheFallback(options.verifiedCacheManifest, info, url)
          if (fallback) {
            downloaded.set(url, fallback)
            errors.push({ source: info.family, year: info.year, reason: "download CDN falhou; cache verificado reutilizado, revisão atual indisponível" })
            if (info.cacheName) cacheZip(fallback.path, join(cacheDir, info.cacheName))
          } else {
            errors.push({ source: info.family, year: info.year, reason: safeDownloadFailure(error) })
          }
        }
      }
      const currentZip = downloaded.get(officialPackages2026()[0]!.url)
      const ufBySq = currentZip ? await officialCandidateUfMap(currentZip.path) : new Map<string, string | null>()
      const routedCandidates = divulgaCandidates.map((candidate) => {
        const officialUf = ufBySq.get(candidate.sqCandidato)
        if (!officialUf || officialUf === candidate.uf) return candidate
        officialUfOverrides.push({ slug: candidate.slug, from: candidate.uf, to: officialUf })
        return { ...candidate, uf: officialUf }
      })
      divulgaSummaries = await collectDivulgaCandidateFallback(routedCandidates, async (run) => run(client))
      divulgaFinancing = []
      for (const summary of divulgaSummaries) {
        if (summary.status !== "ok" || !summary.electionId) continue
        const receipt = await collectDivulgaFinancingForClient(client, {
          uf: summary.uf, sqCandidato: summary.sqCandidato,
          cargoCodigo: summary.cargoCodigo ?? null,
          partidoNumero: summary.partidoNumero ?? null,
          numeroCandidato: summary.numeroCandidato ?? null,
        }, summary.electionId)
        divulgaFinancing.push({ slug: summary.slug, receipt })
      }
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Chrome visível indisponível"
    for (const [url, info] of requests) {
      const fallback = await verifiedCacheFallback(options.verifiedCacheManifest, info, url)
      if (fallback) {
        downloaded.set(url, fallback)
        errors.push({ source: info.family, year: info.year, reason: "Chrome indisponível; cache verificado reutilizado, revisão atual indisponível" })
        if (info.cacheName) cacheZip(fallback.path, join(cacheDir, info.cacheName))
      } else errors.push({ source: info.family, year: info.year, reason: `${safeDownloadFailure(reason)} (${basename(new URL(url).pathname)})` })
    }
  }

  const retryRequests = [...requests].filter(([url]) => !downloaded.has(url) || downloaded.get(url)?.reused_cache)
  if (retryRequests.length) {
    try {
      await withVisibleTseChrome(async (client) => {
        for (const [url, info] of retryRequests) {
          const destination = join(downloadsDir, `${info.year}-${info.family}-${basename(new URL(url).pathname)}`)
          try {
            const receipt = await client.downloadZip(url, destination)
            downloaded.set(url, { path: destination, ...receipt })
            if (info.cacheName) cacheZip(destination, join(cacheDir, info.cacheName))
            for (let index = errors.length - 1; index >= 0; index -= 1) {
              if (errors[index]?.source === info.family && errors[index]?.year === info.year) errors.splice(index, 1)
            }
          } catch { /* Preserve the first failure and its verified cache, if any. */ }
        }
      })
    } catch { /* The original, item-specific acquisition failures remain in the report. */ }
  }

  const assets: Asset[] = []
  for (const [url, info] of requests) {
    const item = downloaded.get(url)
    if (!item) continue
    const digestPath = join(outDir, "assets", `${basename(item.path, ".zip")}-${item.sha256.slice(0, 12)}.zip`)
    mkdirSync(dirname(digestPath), { recursive: true, mode: 0o700 })
    if (!existsSync(digestPath)) {
      copyFileSync(item.path, digestPath)
      chmodSync(digestPath, 0o600)
    } else if (await sha256File(digestPath) !== item.sha256) {
      throw new Error(`asset privado diverge do SHA: ${basename(digestPath)}`)
    }
    const asset = { family: info.family, year: info.year, path: digestPath, url, sha256: item.sha256, bytes: item.bytes, ...(item.reused_cache ? { reused_cache: true as const } : {}) }
    assets.push(asset)
    if (info.family === "perfil_atual") assets.push({ ...asset, family: "historico_politico" })
  }
  const pending = errors.map((error) => ({ family: error.source, year: error.year, reason: error.reason }))
  const manifestPath = join(outDir, "tse-local-assets.json")
  writePrivate(manifestPath, { schema_version: 1, generated_at: new Date().toISOString(), assets, pending })
  return { manifestPath, assets, errors, divulgaSummaries, divulgaFinancing, officialUfOverrides }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseCliOptions(argv)
  const outDir = privateDirectory(options.outDir)
  const candidatesInput = JSON.parse(readFileSync(options.candidates, "utf8")) as SeedCandidate[]
  if (!Array.isArray(candidatesInput)) throw new Error("candidates deve ser uma lista JSON")
  const profilesPath = options.profiles ?? join(outDir, "perfis-publicos.json")
  const profileExport = options.profiles
    ? { ok: true, code: 0 }
    : runScript("scripts/audit/exportar-perfis-publicos.ts", [`--out=${profilesPath}`])
  const profilesInput = profileExport.ok ? JSON.parse(readFileSync(profilesPath, "utf8")) as CandidateProfile[] : null
  if (profilesInput && !Array.isArray(profilesInput)) throw new Error("profiles deve ser uma lista JSON")
  const cohort = profilesInput ? selectCandidateCohort(profilesInput, candidatesInput, options.slugs) : null
  if (cohort && !cohort.profiles.length) throw new Error("coorte vazia após seleção de candidatos")
  const cohortProfilesPath = join(outDir, "coorte-perfis.json")
  const cohortCandidatesPath = join(outDir, "coorte-candidatos.json")
  if (cohort) {
    writePrivate(cohortProfilesPath, cohort.profiles)
    writePrivate(cohortCandidatesPath, cohort.candidates)
  }
  const cohortSlugs = cohort ? new Set(cohort.profiles.map((profile) => String(profile.slug))) : null
  const openCells = summarizeOpenCells(options.openCells, cohortSlugs)

  const divulgaCandidates = cohort ? cohort.candidates.flatMap((candidate) => {
    const ids = candidate.ids as { tse_sq_candidato?: Record<string, unknown> } | undefined
    const sq = ids?.tse_sq_candidato?.["2026"]
    const uf = candidateUfForDivulga(candidate)
    return typeof candidate.slug === "string" && typeof sq === "string"
      ? [{ slug: candidate.slug, uf, sqCandidato: sq }]
      : []
  }) : []
  const { manifestPath, assets, errors, divulgaSummaries, divulgaFinancing, officialUfOverrides } = await downloadAssets(outDir, options.historicalYears, options, divulgaCandidates)
  const freshAssets = assets.filter((asset) => !asset.reused_cache)
  const freshManifestPath = join(outDir, "tse-local-assets-fresh.json")
  const requestedFamilies = new Set(officialPackages2026().map((asset) => `${asset.family}:${asset.year}`))
  for (const year of options.historicalYears) {
    requestedFamilies.add(`historico_politico:${year}`)
    for (const item of historicalFamilyPackages(year)) requestedFamilies.add(`${item.family}:${item.year}`)
  }
  const freshKeys = new Set(freshAssets.map((asset) => `${asset.family}:${asset.year}`))
  const freshPending = [...requestedFamilies].filter((key) => !freshKeys.has(key)).map((key) => {
    const [family, year] = key.split(":")
    const error = errors.find((item) => item.source === family && item.year === Number(year))
    return { family, year: Number(year), reason: error?.reason ?? "pacote veio de cache verificado; revisão CDN não confirmada nesta execução" }
  })
  writePrivate(freshManifestPath, { schema_version: 1, generated_at: new Date().toISOString(), assets: freshAssets, pending: freshPending })
  const acquisitionFailureReceiptsPath = join(outDir, "recibos-falha-aquisicao.json")
  const acquisitionFailureReceipts = cohort ? [...requestedFamilies].flatMap((key) => {
    const [family, rawYear] = key.split(":")
    const year = Number(rawYear)
    if (freshKeys.has(key)) return []
    const reused = assets.some((asset) => asset.year === year && asset.family === family && asset.reused_cache)
    const acquisitionError = errors.find((item) => item.year === year && item.source === family)
    const reason = reused ? "cache verificado reutilizado; revisão atual do CDN não confirmada" : acquisitionError?.reason ?? "pacote oficial indisponível"
    const source = family === "patrimonio" ? "tse-patrimonio" : family === "financiamento" ? "tse-financiamento" : family === "historico_politico" ? "tse-historico" : "tse"
    const url = family === "perfil_atual" ? officialPackages2026()[0]!.url
      : family === "historico_politico" ? historicalUrl(year)
        : year === 2026 ? officialPackages2026().find((item) => item.family === family)!.url
          : historicalFamilyPackages(year).find((item) => item.family === family)?.url ?? ""
    return cohort.profiles.map((profile) => ({
      fonte: source, escopo: "candidato", alvo: String(profile.slug), candidato_id: String(profile.id),
      resultado: "erro", volume: 0, url, executado_em: new Date().toISOString(),
      detalhe: JSON.stringify({ family, year, reason, status: "erro", verified_cache_only: reused,
        ...(assets.find((asset) => asset.family === family && asset.year === year)?.sha256
          ? { sha256: assets.find((asset) => asset.family === family && asset.year === year)!.sha256 } : {}) }),
    }))
  }) : []
  writePrivate(acquisitionFailureReceiptsPath, acquisitionFailureReceipts)
  const divulgaFallbackPath = join(outDir, "divulga-fallback-2026.json")
  let divulgaFallback: { attempted: boolean; ok: number; erro: number; artifact?: string } = { attempted: false, ok: 0, erro: 0 }
  if (divulgaSummaries) {
    writePrivate(divulgaFallbackPath, divulgaSummaries)
    divulgaFallback = { attempted: true, ok: divulgaSummaries.filter((row) => row.status === "ok").length,
      erro: divulgaSummaries.filter((row) => row.status === "erro").length, artifact: divulgaFallbackPath }
  }
  const divulgaFinancingPath = join(outDir, "divulga-financing-2026.json")
  if (divulgaFinancing) writePrivate(divulgaFinancingPath, divulgaFinancing)
  const enrichedCandidatesPath = join(outDir, "coorte-candidatos-sq-oficial.json")
  const enriched = enrichSeedWithDivulga(cohort?.candidates ?? [], divulgaSummaries ?? [])
  if (cohort) writePrivate(enrichedCandidatesPath, enriched.candidates)
  const receiptPath = join(outDir, "historico-recibos.json")
  const reviewPath = join(outDir, "historico-revisao.json")
  const financeManifestPath = join(outDir, "financas-assets.json")
  const financeAssets = assets.filter((asset) => asset.year === 2026 && (asset.family === "patrimonio" || asset.family === "financiamento"))
  writePrivate(financeManifestPath, { schema_version: 1, assets: financeAssets.filter((asset) => !asset.reused_cache) })

  const years = options.historicalYears.join(",")
  const historico = cohort ? runScript("scripts/audit/coletar-revisao-historico.ts", [
    `--anos=${years}`, `--public-profiles=${cohortProfilesPath}`, `--candidatos=${enrichedCandidatesPath}`,
    `--manifest=${freshManifestPath}`, `--out=${receiptPath}`, `--revisao=${reviewPath}`, "--identity-mode=official-only",
  ]) : { ok: false, code: null, reason: "snapshot de perfis ausente; recibos históricos não calculados" }

  const financeOut = join(outDir, "financas")
  const freshFinanceAssets = financeAssets.filter((asset) => !asset.reused_cache)
  const freshProfile2026 = freshAssets.some((asset) => asset.family === "perfil_atual" && asset.year === 2026)
  const requiredLiveAssets = freshFinanceAssets.length === 2 && freshProfile2026

  const genericReceiptsPath = join(outDir, "recibos-familias-tse.json")
  const generic = cohort ? runScript("scripts/audit/collect-tse-family-receipts-local.ts", [
    `--manifest=${freshManifestPath}`, `--out=${genericReceiptsPath}`, `--candidates=${enrichedCandidatesPath}`,
    `--public-profiles=${cohortProfilesPath}`,
  ]) : { ok: false, code: null, reason: "snapshot de perfis ausente; recibos de família não calculados" }
  const applyFamilyReceiptsPath = join(outDir, "recibos-familias-aplicaveis.json")
  if (generic.ok && existsSync(genericReceiptsPath)) {
    const allFamilyReceipts = JSON.parse(readFileSync(genericReceiptsPath, "utf8")) as { receipts?: Array<Record<string, unknown>> }
    writePrivate(applyFamilyReceiptsPath, { receipts: (allFamilyReceipts.receipts ?? []).filter((receipt) => receipt.fonte !== "tse-historico") })
  }

  const coverageOut = join(outDir, "coverage-plan")
  const coverage = generic.ok && cohort && existsSync(applyFamilyReceiptsPath)
    ? runScript("scripts/audit/apply-coverage-receipts.ts", [
      `--in=${applyFamilyReceiptsPath}`, `--out-dir=${coverageOut}`,
      "--allow-fonte=tse,tse-patrimonio,tse-financiamento", `--profiles=${cohortProfilesPath}`,
    ])
    : { ok: false, code: null, reason: "recibos locais ausentes; plano de cobertura não calculado" }
  const historyCoverageOut = join(outDir, "coverage-plan-historico")
  const historyCoverage = historico.ok && cohort && existsSync(receiptPath)
    ? runScript("scripts/audit/apply-coverage-receipts.ts", [
      `--in=${receiptPath}`, `--out-dir=${historyCoverageOut}`, "--allow-fonte=tse-historico,tse-partido-candidatura", `--profiles=${cohortProfilesPath}`,
    ])
    : { ok: false, code: null, reason: "recibos históricos não calculados" }

  let finance: { ok: boolean; code: number | null; reason?: string }
  const financeEnv: NodeJS.ProcessEnv = {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
    NODE_ENV: process.env.NODE_ENV ?? "production",
    ...(process.env.SUPABASE_URL ? { SUPABASE_URL: process.env.SUPABASE_URL } : {}),
    ...(process.env.SUPABASE_SERVICE_ROLE_KEY ? { SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY } : {}),
    ...(process.env.PF_DOADOR_CPF_HASH_SALT ? { PF_DOADOR_CPF_HASH_SALT: process.env.PF_DOADOR_CPF_HASH_SALT } : {}),
    PF_KEEP_TSE_DOWNLOADS: "1",
    PF_TSE_2026_ASSET_MANIFEST: financeManifestPath,
  }
  if (!process.env.PF_DOADOR_CPF_HASH_SALT) {
    finance = { ok: false, code: null, reason: "PF_DOADOR_CPF_HASH_SALT v2 ausente; planejador financeiro não executado" }
  } else {
    const financeArgs = [`--out=${financeOut}`]
    finance = runScript("scripts/tse-2026-financas.ts", financeArgs, financeEnv)
  }
  const projectionOut = join(outDir, "recibos-familias-projecao.json")
  const financePlanPath = join(financeOut, "plano-privado.json")
  const projectionStep = generic.ok && finance.ok && existsSync(financePlanPath) && cohort
    ? runScript("scripts/audit/collect-tse-family-receipts-local.ts", [
      `--manifest=${freshManifestPath}`, `--out=${projectionOut}`, `--candidates=${enrichedCandidatesPath}`,
      `--public-profiles=${cohortProfilesPath}`, `--writer-plan=${financePlanPath}`,
    ]) : { ok: false, code: null, reason: "plano auditado ou snapshot ausente; projeção não calculada" }
  const identityRiskSlugs = new Set<string>(historico.ok && existsSync(reviewPath)
    ? ((JSON.parse(readFileSync(reviewPath, "utf8")) as { itens?: Array<{ slug?: string; tipo?: string }> }).itens ?? [])
      .filter((item) => item.tipo === "identidade" && typeof item.slug === "string").map((item) => item.slug!) : [])
  for (const candidate of cohort?.candidates ?? []) {
    const ids = candidate.ids && typeof candidate.ids === "object" ? candidate.ids as Record<string, unknown> : {}
    const sqs = ids.tse_sq_candidato && typeof ids.tse_sq_candidato === "object" ? ids.tse_sq_candidato as Record<string, unknown> : {}
    if (!sqs["2026"] && typeof candidate.slug === "string") identityRiskSlugs.add(candidate.slug)
  }
  if (generic.ok && existsSync(genericReceiptsPath)) {
    const diagnostics = (JSON.parse(readFileSync(genericReceiptsPath, "utf8")) as { diagnostics?: Array<{ slug: string; reason: string }> }).diagnostics ?? []
    for (const diagnostic of diagnostics) {
      if (diagnostic.reason === "uf_identity_missing") identityRiskSlugs.add(diagnostic.slug)
    }
  }
  if (finance.ok && existsSync(financePlanPath)) {
    const reviews = (JSON.parse(readFileSync(financePlanPath, "utf8")) as {
      revisao?: Array<{ slug: string; familia: string; motivo: string }>
    }).revisao ?? []
    for (const review of reviews) {
      if (review.familia === "patrimonio" && review.motivo === "patrimonio_divergente") {
        identityRiskSlugs.add(review.slug)
      }
    }
  }
  const auditedActions = finance.ok && existsSync(financePlanPath)
    ? (JSON.parse(readFileSync(financePlanPath, "utf8")) as { acoes?: Array<{ slug: string }> }).acoes ?? [] : []
  const identityRiskActions = auditedActions.filter((action) => identityRiskSlugs.has(action.slug)).length

  const liveApply: Record<string, StepResult> = {}
  if (isLiveMode(options.mode)) {
    const financePlanPath = join(financeOut, "plano-resumo.json")
    const financePlanSha = existsSync(financePlanPath)
      ? (JSON.parse(readFileSync(financePlanPath, "utf8")) as { plano_sha256?: string }).plano_sha256 ?? null
      : null
    const planShaMatches = Boolean(financePlanSha && financePlanSha === options.expectedPlanSha?.toLowerCase())
    const allHistoryFresh = HISTORICAL_YEARS.every((year) => freshAssets.some((asset) => asset.family === "historico_politico" && asset.year === year))
    const gates = [allHistoryFresh, requiredLiveAssets, errors.length === 0, assets.every((asset) => !asset.reused_cache),
      Boolean(cohort?.profiles.length), profileExport.ok, historico.ok, generic.ok, coverage.ok, historyCoverage.ok, finance.ok, projectionStep.ok,
      identityRiskActions === 0, planShaMatches]
    if (gates.some((passed) => !passed)) {
      liveApply.preflight = { ok: false, code: null, reason: "--live recusado: requer ativos CDN frescos completos, coorte, recibos, planos válidos e SHA financeiro revisado coincidente" }
    } else {
      const executionId = `tse-local-${new Date().toISOString().replace(/[^0-9TZ]/g, "")}`
      liveApply.familias = runScript("scripts/audit/apply-coverage-receipts.ts", [
        `--in=${applyFamilyReceiptsPath}`, `--out-dir=${coverageOut}`, "--allow-fonte=tse,tse-patrimonio,tse-financiamento",
        `--profiles=${cohortProfilesPath}`, "--apply", `--execucao=${executionId}-familias`,
      ])
      if (liveApply.familias.ok) {
        liveApply.historico = runScript("scripts/audit/apply-coverage-receipts.ts", [
          `--in=${receiptPath}`, `--out-dir=${historyCoverageOut}`, "--allow-fonte=tse-historico,tse-partido-candidatura", `--profiles=${cohortProfilesPath}`,
          "--apply", `--execucao=${executionId}-historico`,
        ])
      } else liveApply.historico = { ok: false, code: null, reason: "bloqueado porque apply das famílias falhou" }
      if (liveApply.familias.ok && liveApply.historico.ok) {
        liveApply.financeiro = runScript("scripts/tse-2026-financas.ts", [
          `--out=${financeOut}`, "--apply", `--expected-plan-sha=${options.expectedPlanSha}`,
        ], financeEnv)
      } else liveApply.financeiro = { ok: false, code: null, reason: "bloqueado porque um apply de recibos falhou" }
    }
  }

  const report = {
    mode: options.mode,
    years: options.historicalYears,
    cohort: {
      selected: cohort?.profiles.length ?? null,
      open_cells: {
        supplied: openCells.supplied, rows: openCells.rows, in_cohort: openCells.in_cohort,
        by_state: openCells.by_state,
      },
    },
    sources: {
      consulta_cand: { requested: options.historicalYears.length, fresh_certifiable: freshAssets.filter((asset) => asset.family === "historico_politico").length, verified_cache_potential: assets.filter((asset) => asset.family === "historico_politico" && asset.reused_cache).length, errors: errors.filter((item) => item.source === "historico_politico" || item.source === "perfil_atual") },
      bem_candidato_2026: { fresh_certifiable: freshAssets.some((asset) => asset.family === "patrimonio" && asset.year === 2026), verified_cache_potential: assets.some((asset) => asset.family === "patrimonio" && asset.year === 2026 && asset.reused_cache), errors: errors.filter((item) => item.source === "patrimonio" && item.year === 2026) },
      financiamento_2026: { fresh_certifiable: freshAssets.some((asset) => asset.family === "financiamento" && asset.year === 2026), verified_cache_potential: assets.some((asset) => asset.family === "financiamento" && asset.year === 2026 && asset.reused_cache), errors: errors.filter((item) => item.source === "financiamento" && item.year === 2026) },
      patrimonio_historico: { requested: options.historicalYears.flatMap(historicalFamilyPackages).filter((item) => item.family === "patrimonio").length, fresh_certifiable: freshAssets.filter((asset) => asset.family === "patrimonio" && asset.year !== 2026).length },
      financiamento_historico: { requested: options.historicalYears.flatMap(historicalFamilyPackages).filter((item) => item.family === "financiamento").length, fresh_certifiable: freshAssets.filter((asset) => asset.family === "financiamento" && asset.year !== 2026).length },
      divulga_fallback_2026: { ...divulgaFallback, official_sq_conflicts: enriched.conflicts, official_uf_overrides: officialUfOverrides },
      divulga_financing_2026: { attempted: divulgaFinancing !== null, encontrado: divulgaFinancing?.filter((row) => row.receipt.resultado === "encontrado").length ?? 0, vazio_confirmado: divulgaFinancing?.filter((row) => row.receipt.resultado === "vazio_confirmado").length ?? 0, erro: divulgaFinancing?.filter((row) => row.receipt.resultado === "erro").length ?? 0, indeterminado: divulgaFinancing?.filter((row) => row.receipt.resultado === "indeterminado").length ?? 0 },
    },
    steps: {
      history_review_receipts: { ...stepSummary(historico), identity_mode: "official-only", jev_name_linking: "withheld" },
      coverage_dry_run: stepSummary(coverage),
      history_coverage_dry_run: stepSummary(historyCoverage),
      finance_planner: stepSummary(finance),
      apply_projection: stepSummary(projectionStep),
      identity_risk_actions_blocked: identityRiskActions,
      identity_risk_profiles: identityRiskSlugs.size,
      family_receipts: stepSummary(generic),
      live_apply: Object.fromEntries(Object.entries(liveApply).map(([name, result]) => [name, stepSummary(result)])),
    },
    historical_scope_complete: HISTORICAL_YEARS.every((year) => options.historicalYears.includes(year)),
    projected_open_cell_closure: projectedClosure(openCells, [coverageOut, historyCoverageOut], projectionStep.ok ? projectionOut : null,
      applyFamilyReceiptsPath, receiptPath, divulgaSummaries, cohort?.profiles ?? [], identityRiskSlugs),
    assets_reused_from_verified_cache: assets.filter((asset) => asset.reused_cache).map(({ family, year, sha256 }) => ({ family, year, sha256 })),
    artifacts: { manifest: manifestPath, acquisition_failure_receipts: acquisitionFailureReceiptsPath, historico: receiptPath, review: reviewPath, family_receipts: genericReceiptsPath, apply_family_receipts: applyFamilyReceiptsPath, coverage_plan: coverageOut, history_coverage_plan: historyCoverageOut, ...(divulgaFallback.artifact ? { divulga_fallback: divulgaFallback.artifact } : {}), ...(divulgaFinancing ? { divulga_financing: divulgaFinancingPath } : {}) },
  }
  const reportPath = join(outDir, "relatorio.json")
  writePrivate(reportPath, report)
  process.stdout.write(`${JSON.stringify({ ...report, artifacts: { report: reportPath } })}\n`)

  return isLiveMode(options.mode) && Object.values(liveApply).some((result) => !result.ok) ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "falha na coleta local TSE"}\n`)
    process.exitCode = 1
  })
}
