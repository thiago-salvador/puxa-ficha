import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

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
}

export type ProfileCompletenessIssue = {
  slug: string
  kind:
    | "source_not_live"
    | "core_field_missing"
    | "patrimonio_uncollected"
    | "financiamento_uncollected"
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

function moneyIssues(
  slug: string,
  value: unknown,
  kind: "patrimonio_uncollected" | "financiamento_uncollected",
): ProfileCompletenessIssue[] {
  if (!Array.isArray(value)) return []
  return (value as MoneyElection[])
    .filter((item) => item.estado === "nao_coletado" || item.estado === "erro")
    .map((item) => ({
      slug,
      kind,
      year: item.ano,
      state: item.estado,
    }))
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

  for (const field of CORE_FIELDS) {
    if (!hasValue(data[field])) actionable.push({ slug, kind: "core_field_missing", field })
  }

  actionable.push(...moneyIssues(slug, data.patrimonio_eleicoes, "patrimonio_uncollected"))
  actionable.push(...moneyIssues(slug, data.financiamento_eleicoes, "financiamento_uncollected"))

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

async function fetchJson(url: string, attempts = 8): Promise<unknown> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } })
      if (response.ok) return await response.json()
      lastError = new Error(`HTTP ${response.status}`)
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable) throw new Error(`HTTP ${response.status}`)
      const retryAfter = Number(response.headers.get("retry-after"))
      await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 500 * 2 ** attempt)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
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

type CliOptions = {
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

  const actionable: ProfileCompletenessIssue[] = []
  const review: ProfileReviewNotice[] = []
  const fetchErrors: Array<{ slug: string; error: string }> = []
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
