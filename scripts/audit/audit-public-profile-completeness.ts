import { mkdir, writeFile } from "node:fs/promises"
import { readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { canonicalCargo } from "../../src/lib/cargo-utils"
import { isHistoricoCandidaturaRow } from "../../src/lib/historico-tipo-evento"

const CORE_FIELDS = [
  "partido_sigla",
  "situacao_candidatura",
  "foto_url",
  "biografia",
  "naturalidade",
  "data_nascimento",
  "formacao",
  "profissao_declarada",
  "genero",
  "estado_civil",
  "cor_raca",
] as const

type ProfileEnvelope = {
  data?: Record<string, unknown>
  sourceStatus?: string
}

type MoneyElection = {
  ano?: number
  estado?: string
  fonte_url?: string | null
  verificado_em?: string | null
}

const PATRIMONIO_STATES = new Set(["publicado", "vazio_confirmado", "nao_coletado"])
const FINANCIAMENTO_STATES = new Set([
  "publicado",
  "zero_declarado",
  "ausencia_oficial",
  "erro",
  "fora_da_serie_oficial",
  "pleito_futuro",
  "nao_coletado",
])

export type ProfileCompletenessIssue = {
  slug: string
  kind:
    | "source_not_live"
    | "core_field_missing"
    | "profile_payload_invalid"
    | "patrimonio_uncollected"
    | "financiamento_uncollected"
    | "current_candidacy_missing_from_history"
    | "current_candidacy_duplicate_in_history"
    | "public_profile_missing_from_seed"
  field?: string
  year?: number
  state?: string
}

export type ProfileReviewNotice = {
  slug: string
  section: string
  reason: "missing_verification" | "section_missing"
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null
}

function currentCandidacyHistoryCount(data: Record<string, unknown>): number {
  if (!Array.isArray(data.historico) || typeof data.cargo_disputado !== "string") return 0
  const currentCargo = canonicalCargo(data.cargo_disputado)
  return data.historico.filter((raw) => {
    if (!raw || typeof raw !== "object") return false
    const row = raw as Record<string, unknown>
    const rowCargo = typeof row.cargo_canonico === "string"
      ? row.cargo_canonico
      : typeof row.cargo === "string"
        ? row.cargo
        : ""
    return row.periodo_inicio === 2026 &&
      isHistoricoCandidaturaRow({
        tipo_evento: typeof row.tipo_evento === "string" ? row.tipo_evento : null,
        observacoes: typeof row.observacoes === "string" ? row.observacoes : null,
        periodo_inicio: typeof row.periodo_inicio === "number" ? row.periodo_inicio : null,
        periodo_fim: typeof row.periodo_fim === "number" ? row.periodo_fim : null,
      }) &&
      canonicalCargo(rowCargo) === currentCargo
  }).length
}

function moneyIssues(
  slug: string,
  value: unknown,
  kind: "patrimonio_uncollected" | "financiamento_uncollected",
  field: "patrimonio_eleicoes" | "financiamento_eleicoes",
  allowedStates: ReadonlySet<string>,
  proofRequiredStates: ReadonlySet<string>,
): ProfileCompletenessIssue[] {
  if (!Array.isArray(value)) {
    return [{ slug, kind: "profile_payload_invalid", field, state: "missing_or_not_array" }]
  }
  const issues: ProfileCompletenessIssue[] = []
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      issues.push({ slug, kind: "profile_payload_invalid", field: `${field}[${index}]`, state: "not_object" })
      return
    }
    const item = raw as MoneyElection
    if (!Number.isInteger(item.ano) || !item.estado || !allowedStates.has(item.estado)) {
      issues.push({
        slug,
        kind: "profile_payload_invalid",
        field: `${field}[${index}]`,
        year: item.ano,
        state: item.estado ?? "invalid_year_or_state",
      })
      return
    }
    if (
      proofRequiredStates.has(item.estado) &&
      (!hasValue(item.fonte_url) || !hasValue(item.verificado_em))
    ) {
      issues.push({
        slug,
        kind: "profile_payload_invalid",
        field: `${field}[${index}]`,
        year: item.ano,
        state: `${item.estado}_without_official_proof`,
      })
      return
    }
    if (item.estado === "nao_coletado" || item.estado === "erro") {
      issues.push({ slug, kind, year: item.ano, state: item.estado })
    }
  })
  return issues
}

export function analyzePublicProfileCompleteness(
  slug: string,
  envelope: ProfileEnvelope,
): { actionable: ProfileCompletenessIssue[]; review: ProfileReviewNotice[] } {
  const data = envelope.data ?? {}
  const actionable: ProfileCompletenessIssue[] = []
  const review: ProfileReviewNotice[] = []

  if (envelope.sourceStatus !== "live") {
    actionable.push({ slug, kind: "source_not_live", state: envelope.sourceStatus })
  }
  if (data.slug !== slug) {
    actionable.push({
      slug,
      kind: "profile_payload_invalid",
      field: "slug",
      state: typeof data.slug === "string" ? data.slug : "missing",
    })
  }

  for (const field of CORE_FIELDS) {
    if (!hasValue(data[field])) actionable.push({ slug, kind: "core_field_missing", field })
  }

  if (typeof data.cargo_disputado === "string" && data.cargo_disputado !== "Nenhum") {
    const currentCandidacyCount = currentCandidacyHistoryCount(data)
    if (currentCandidacyCount === 0) {
      actionable.push({
        slug,
        kind: "current_candidacy_missing_from_history",
        field: "historico",
        year: 2026,
      })
    } else if (currentCandidacyCount > 1) {
      actionable.push({
        slug,
        kind: "current_candidacy_duplicate_in_history",
        field: "historico",
        year: 2026,
        state: String(currentCandidacyCount),
      })
    }
  }

  actionable.push(
    ...moneyIssues(
      slug,
      data.patrimonio_eleicoes,
      "patrimonio_uncollected",
      "patrimonio_eleicoes",
      PATRIMONIO_STATES,
      new Set(["vazio_confirmado"]),
    ),
  )
  actionable.push(
    ...moneyIssues(
      slug,
      data.financiamento_eleicoes,
      "financiamento_uncollected",
      "financiamento_eleicoes",
      FINANCIAMENTO_STATES,
      new Set(["ausencia_oficial", "fora_da_serie_oficial"]),
    ),
  )

  for (const [section, value] of [
    ["processos", data.processos_verificacao],
    ["trajetoria", data.trajetoria_verificacao],
    ["patrimonio", data.patrimonio_verificacao],
    ["votacoes", data.votacoes_verificacao],
  ] as const) {
    if (value == null) review.push({ slug, section, reason: "missing_verification" })
  }

  const freshness = data.section_freshness
  if (freshness && typeof freshness === "object") {
    for (const [section, value] of Object.entries(freshness)) {
      if (value && typeof value === "object" && (value as { status?: unknown }).status === "missing") {
        review.push({ slug, section, reason: "section_missing" })
      }
    }
  }

  return { actionable, review }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchJson(url: string, attempts = 8): Promise<unknown> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } })
      if (response.ok) return await response.json()
      lastError = new Error(`HTTP ${response.status}`)
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable) throw Object.assign(new Error(`HTTP ${response.status}`), { retryable: false })
      const retryAfter = Number(response.headers.get("retry-after"))
      await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 500 * 2 ** attempt)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if ((error as { retryable?: unknown })?.retryable === false) throw lastError
      if (attempt + 1 < attempts) await delay(500 * 2 ** attempt)
    }
  }
  throw lastError ?? new Error("resposta indisponível depois das tentativas")
}

function countBy<T extends { kind?: string; section?: string }>(rows: T[], key: "kind" | "section") {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row[key]).filter((value): value is string => Boolean(value)))]
      .sort()
      .map((value) => [value, rows.filter((row) => row[key] === value).length]),
  )
}

export type CliOptions = {
  baseUrl: string
  out: string | null
  slug: string | null
  allowActionable: boolean
  expectZeroActionable: boolean
}

function parseArgs(args: string[]): CliOptions {
  const value = (prefix: string) => args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
  return {
    baseUrl: (value("--base-url=") ?? "https://puxaficha.com.br").replace(/\/$/, ""),
    out: value("--out="),
    slug: value("--slug="),
    allowActionable: args.includes("--allow-actionable"),
    expectZeroActionable: args.includes("--expect-zero-actionable"),
  }
}

export async function runPublicProfileCompletenessAudit(options: CliOptions) {
  const rawSlugs: unknown = options.slug
    ? [options.slug]
    : ((await fetchJson(`${options.baseUrl}/api/candidato-slugs`)) as { slugs?: unknown }).slugs
  if (!Array.isArray(rawSlugs) || rawSlugs.some((slug) => typeof slug !== "string")) {
    throw new Error("/api/candidato-slugs não retornou uma lista válida")
  }
  const slugs = rawSlugs as string[]
  if (slugs.length === 0 || slugs.some((slug) => slug.trim().length === 0)) {
    throw new Error("/api/candidato-slugs retornou um inventário vazio ou inválido")
  }
  if (new Set(slugs).size !== slugs.length) {
    throw new Error("/api/candidato-slugs retornou slugs duplicados")
  }

  const actionable: ProfileCompletenessIssue[] = []
  const review: ProfileReviewNotice[] = []
  const fetchErrors: Array<{ slug: string; error: string }> = []
  const seedSlugs = new Set(
    (JSON.parse(readFileSync(path.resolve("data/candidatos.json"), "utf8")) as Array<{ slug: string }>).map(
      (candidate) => candidate.slug,
    ),
  )
  for (const slug of slugs) {
    if (!seedSlugs.has(slug)) actionable.push({ slug, kind: "public_profile_missing_from_seed" })
  }
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < slugs.length) {
      const slug = slugs[nextIndex++] as string
      try {
        const envelope = (await fetchJson(`${options.baseUrl}/api/candidato-profile/${encodeURIComponent(slug)}`)) as ProfileEnvelope
        const result = analyzePublicProfileCompleteness(slug, envelope)
        actionable.push(...result.actionable)
        review.push(...result.review)
      } catch (error) {
        fetchErrors.push({ slug, error: error instanceof Error ? error.message : String(error) })
      }
      await delay(250)
    }
  }

  // A rota tem limitação por IP. Uma fila serial é intencional: a varredura
  // precisa provar cobertura, não transformar 429 em falso dado ausente.
  await worker()
  actionable.sort((a, b) => `${a.slug}:${a.kind}:${a.year ?? ""}`.localeCompare(`${b.slug}:${b.kind}:${b.year ?? ""}`))
  review.sort((a, b) => `${a.slug}:${a.section}:${a.reason}`.localeCompare(`${b.slug}:${b.section}:${b.reason}`))
  fetchErrors.sort((a, b) => a.slug.localeCompare(b.slug))

  const report = {
    generated_at: new Date().toISOString(),
    base_url: options.baseUrl,
    requested_profiles: slugs.length,
    completed_profiles: slugs.length - fetchErrors.length,
    fetch_errors: fetchErrors,
    actionable_issues: actionable,
    actionable_by_kind: countBy(actionable, "kind"),
    review_notices: review,
    review_by_section: countBy(review, "section"),
  }

  if (options.out) {
    await mkdir(path.dirname(path.resolve(options.out)), { recursive: true })
    await writeFile(path.resolve(options.out), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  }

  if (fetchErrors.length > 0) {
    throw new Error(`varredura incompleta: ${fetchErrors.length}/${slugs.length} fichas não responderam`)
  }
  if (options.expectZeroActionable && actionable.length > 0) {
    throw new Error(`lacunas acionáveis: ${actionable.length} em ${new Set(actionable.map((row) => row.slug)).size} fichas`)
  }
  if (!options.allowActionable && !options.expectZeroActionable && actionable.length > 0) {
    throw new Error("use --allow-actionable para inventário ou --expect-zero-actionable para gate")
  }

  const marker = options.expectZeroActionable
    ? "PROFILE_COMPLETENESS_ZERO_ACTIONABLE"
    : "PROFILE_COMPLETENESS_AUDIT_OK"
  console.log(
    `${marker} requested=${slugs.length} completed=${slugs.length - fetchErrors.length} actionable=${actionable.length} actionable_profiles=${new Set(actionable.map((row) => row.slug)).size} review=${review.length}`,
  )
  return report
}

async function main(): Promise<void> {
  await runPublicProfileCompletenessAudit(parseArgs(process.argv.slice(2)))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
