import { execFileSync } from "child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { delimiter, join, resolve } from "path"
import { createClient } from "@supabase/supabase-js"
import { CANDIDATE_ASSERTIONS } from "./lib/factual-assertions"

const envFiles = [".env.local", ".env"]
for (const file of envFiles) {
  const hasUrl = Boolean(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (hasUrl && hasKey) break

  const envPath = resolve(process.cwd(), file)
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath)
  }
}

const BASE_URL = process.env.VERIFY_URL ?? "http://localhost:3000"
const REPORT_PATH =
  process.argv.find((_, i, arr) => arr[i - 1] === "--report") ??
  resolve(process.cwd(), "scripts/audit-factual-report.json")
const OUTPUT_PREFIX =
  process.argv.find((_, i, arr) => arr[i - 1] === "--output-prefix") ?? "release-verify"
const MODE =
  (process.argv.find((_, i, arr) => arr[i - 1] === "--mode") as "partial" | "full" | undefined) ??
  "full"
const EXPLICIT_SLUGS = (
  process.argv.find((_, i, arr) => arr[i - 1] === "--slugs") ?? ""
)
  .split(",")
  .map((slug) => slug.trim())
  .filter(Boolean)

const REPORT_OUTPUT_PATH = resolve(process.cwd(), "scripts", `${OUTPUT_PREFIX}-report.json`)
const SUMMARY_OUTPUT_PATH = resolve(process.cwd(), "scripts", `${OUTPUT_PREFIX}-summary.md`)
const GLOBAL_NODE_MODULES = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim()
const LOCAL_NODE_MODULES = resolve(process.cwd(), "node_modules")
const IS_LOCAL_BASE_URL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE_URL)
const PREVIEW_TOKEN = process.env.PF_PREVIEW_TOKEN ?? (IS_LOCAL_BASE_URL ? "local-preview" : "")
const RANKING_SLUGS = ["gastos-parlamentares", "mudancas-partido", "patrimonio-declarado"] as const

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface SnapshotFreshnessInfo {
  key: string
  status: string
  verified_at: string | null
  reference_date: string | null
  reference_year: number | null
}

interface CandidateSnapshot {
  slug: string
  canonical_person_slug: string
  nome_urna: string
  partido_sigla: string | null
  cargo_disputado: string
  biografia: string | null
  patrimonio_mais_recente: number | null
  total_processos: number
  total_mudancas_partido: number
  total_historico_politico: number
  audit_profile: string
  section_freshness: Record<string, SnapshotFreshnessInfo | undefined>
}

interface AuditCandidateResult {
  slug: string
  auditoria_status: "auditado" | "pendente" | "reprovado"
  tem_falha_critica: boolean
}

interface AuditReport {
  gerado_em: string
  total_candidatos: number
  snapshots: CandidateSnapshot[]
  candidatos: AuditCandidateResult[]
}

interface CompareRow {
  slug: string
  nome_urna: string
  partido_sigla: string
  cargo_disputado: string
  total_processos: number
}

interface ComparePageRow {
  id: string
  slug: string
  nome_urna: string
  partido_sigla: string
  idade: number | null
  formacao: string | null
  patrimonio_declarado: number | null
  total_processos: number
  alertas_graves: number
  pontos_atencao?: Array<{
    categoria: string | null
    gravidade: string | null
  }> | null
}

interface RankingPageResult {
  status: number
  hrefs?: string[]
  rowCount?: number
}

interface CandidateCheckResult {
  slug: string
  ok: boolean
  checks: Array<{ check: string; ok: boolean; details: string }>
}

interface CandidatePageSnapshot extends CandidateSnapshot {
  verify_path: string
}

async function withQueryRetry<T>(label: string, run: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    }
  }

  throw new Error(`${label} failed: ${String(lastError)}`)
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function countNegativeCriticalPoints(
  pontos: ComparePageRow["pontos_atencao"]
): number {
  return (pontos ?? []).filter((ponto) => {
    return ponto.categoria !== "feito_positivo" && (ponto.gravidade === "critica" || ponto.gravidade === "alta")
  }).length
}

function readAuditReport(): AuditReport {
  if (!existsSync(REPORT_PATH)) {
    throw new Error(`Audit report not found at ${REPORT_PATH}`)
  }

  const report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as AuditReport
  if (!Array.isArray(report.snapshots)) {
    throw new Error("Audit report does not include snapshots. Re-run scripts/audit-factual.ts.")
  }
  return report
}

function resolveSnapshots(report: AuditReport): CandidateSnapshot[] {
  const curatedSlugs = new Set(
    CANDIDATE_ASSERTIONS.filter((item) => item.confidence === "curated").map((item) => item.slug)
  )
  const auditMap = new Map(report.candidatos.map((item) => [item.slug, item]))
  const snapshots = report.snapshots

  if (EXPLICIT_SLUGS.length > 0) {
    return snapshots.filter((snapshot) => EXPLICIT_SLUGS.includes(snapshot.slug))
  }

  if (MODE === "partial") {
    return snapshots.filter((snapshot) => {
      const result = auditMap.get(snapshot.slug)
      return (
        curatedSlugs.has(snapshot.slug) &&
        result?.auditoria_status === "auditado" &&
        !result.tem_falha_critica
      )
    })
  }

  return snapshots
}

function buildSummary(results: CandidateCheckResult[], mode: "partial" | "full"): string {
  const passed = results.filter((result) => result.ok).length
  const failed = results.filter((result) => !result.ok)

  const lines = [
    "# Release Verify",
    "",
    `Base URL: ${BASE_URL}`,
    `Modo: ${mode}`,
    `Auditado em: ${new Date().toISOString()}`,
    "",
    `- Paginas verificadas: ${results.length}`,
    `- Passaram: ${passed}`,
    `- Falharam: ${failed.length}`,
  ]

  if (failed.length > 0) {
    lines.push("", "## Falhas", "")
    for (const result of failed) {
      const details = result.checks
        .filter((check) => !check.ok)
        .map((check) => `${check.check}: ${check.details}`)
        .join("; ")
      lines.push(`- ${result.slug}: ${details}`)
    }
  }

  return `${lines.join("\n")}\n`
}

function runPlaywrightSpec<T>(prefix: string, specBody: string): T {
  const tempDir = mkdtempSync(join(tmpdir(), `puxa-ficha-${prefix}-`))
  const outputPath = join(tempDir, `${prefix}.json`)
  const specPath = join(tempDir, `${prefix}.spec.cjs`)

  try {
    writeFileSync(
      specPath,
      specBody.replaceAll("__OUTPUT_PATH__", JSON.stringify(outputPath)),
      "utf8"
    )

    execFileSync("node", [specPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        VERIFY_URL: BASE_URL,
        CI: "1",
        NODE_PATH: [LOCAL_NODE_MODULES, GLOBAL_NODE_MODULES, process.env.NODE_PATH]
          .filter(Boolean)
          .join(delimiter),
      },
      stdio: "pipe",
    })

    return JSON.parse(readFileSync(outputPath, "utf8")) as T
  } catch (error) {
    if (error instanceof Error && "stdout" in error) {
      const stdout = String((error as { stdout?: Buffer }).stdout ?? "")
      const stderr = String((error as { stderr?: Buffer }).stderr ?? "")
      if (stdout) console.error(stdout)
      if (stderr) console.error(stderr)
    }
    throw error
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function buildCandidatePagesSpec(inputPath: string, outputPath: string): string {
  return `
const { chromium } = require("playwright")
const { readFileSync, writeFileSync } = require("fs")

const baseUrl = process.env.VERIFY_URL || "http://localhost:3000"
const rows = JSON.parse(readFileSync(${JSON.stringify(inputPath)}, "utf8"))
const outputPath = ${JSON.stringify(outputPath)}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/\\s+/g, " ")
    .trim()
    .toLowerCase()
}

async function textContent(page, selector) {
  const locator = page.locator(selector).first()
  if (!(await locator.count())) return null
  return (await locator.textContent()) || null
}

async function attr(page, selector, name) {
  const locator = page.locator(selector).first()
  if (!(await locator.count())) return null
  return await locator.getAttribute(name)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const results = []

  for (const row of rows) {
    const response = await page.goto(\`\${baseUrl}\${row.verify_path}\`, {
      waitUntil: "domcontentloaded",
    })
    await page.waitForTimeout(300)

    const checks = []
    const status = response ? response.status() : 0
    checks.push({
      check: "http_status",
      ok: status > 0 && status < 400,
      details: String(status),
    })

    if (status > 0 && status < 400) {
      const heroName = await textContent(page, "[data-pf-hero-name]")
      const heroParty = await attr(page, "[data-pf-hero-party]", "data-pf-hero-party")
      const heroRole = await attr(page, "[data-pf-hero-role]", "data-pf-hero-role")
      const bio = await textContent(page, "[data-pf-bio]")
      const processos = await textContent(page, "[data-pf-overview-processos]")
      const mudancas = await textContent(page, "[data-pf-overview-mudancas]")
      const patrimonio = await attr(page, "[data-pf-overview-patrimonio]", "data-pf-overview-raw")
      const freshnessStatus = await attr(page, "[data-pf-freshness-key='perfil_atual']", "data-pf-freshness-status")

      checks.push({
        check: "hero_name",
        ok: normalizeText(heroName) === normalizeText(row.nome_urna),
        details: row.nome_urna,
      })
      checks.push({
        check: "hero_party",
        ok: normalizeText(heroParty) === normalizeText(row.partido_sigla),
        details: String(row.partido_sigla),
      })
      checks.push({
        check: "hero_role",
        ok: normalizeText(heroRole) === normalizeText(row.cargo_disputado),
        details: row.cargo_disputado,
      })
      checks.push({
        check: "overview_processos",
        ok: Number(processos || "0") === Number(row.total_processos || 0),
        details: String(row.total_processos || 0),
      })
      checks.push({
        check: "overview_mudancas",
        ok: Number(mudancas || "0") === Number(row.total_mudancas_partido || 0),
        details: String(row.total_mudancas_partido || 0),
      })

      if (row.patrimonio_mais_recente != null) {
        checks.push({
          check: "overview_patrimonio",
          ok: Number(patrimonio || "0") === Number(row.patrimonio_mais_recente),
          details: String(row.patrimonio_mais_recente),
        })
      }

      if (row.biografia) {
        checks.push({
          check: "bio",
          ok: normalizeText(bio) === normalizeText(row.biografia),
          details: row.biografia.slice(0, 80),
        })
      }

      checks.push({
        check: "freshness_perfil_atual",
        ok: normalizeText(freshnessStatus) === normalizeText(row.section_freshness?.perfil_atual?.status || ""),
        details: row.section_freshness?.perfil_atual?.status || "missing",
      })

      if (row.total_historico_politico > 0 || row.total_mudancas_partido > 0) {
        const trajetoriaTab = page.getByRole("button", { name: /Trajetoria/i }).first()
        if (await trajetoriaTab.count()) {
          await trajetoriaTab.click()
          await page.waitForTimeout(250)
        }

        const trajetoriaCount = await attr(page, "[data-pf-trajetoria-count]", "data-pf-trajetoria-count")
        const partidosCount = await attr(page, "[data-pf-partidos-count]", "data-pf-partidos-count")

        if (row.total_historico_politico > 0) {
          checks.push({
            check: "trajetoria_count",
            ok: Number(trajetoriaCount || "0") === Number(row.total_historico_politico),
            details: String(row.total_historico_politico),
          })
        }

        if (row.total_mudancas_partido > 0) {
          checks.push({
            check: "partidos_count",
            ok: Number(partidosCount || "0") === Number(row.total_mudancas_partido),
            details: String(row.total_mudancas_partido),
          })
        }
      }
    }

    results.push({
      slug: row.slug,
      ok: checks.every((check) => check.ok),
      checks,
    })
  }

  await browser.close()
  writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8")
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
`
}

/** Rotas publicas `/candidato/{slug}/timeline` (preview nao tem espelho dedicado). */
function buildTimelinePagesSpec(inputPath: string, outputPath: string): string {
  return `
const { chromium } = require("playwright")
const { readFileSync, writeFileSync } = require("fs")

const baseUrl = process.env.VERIFY_URL || "http://localhost:3000"
const rows = JSON.parse(readFileSync(${JSON.stringify(inputPath)}, "utf8"))
const outputPath = ${JSON.stringify(outputPath)}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/\\s+/g, " ")
    .trim()
    .toLowerCase()
}

async function textContent(page, selector) {
  const locator = page.locator(selector).first()
  if (!(await locator.count())) return null
  return (await locator.textContent()) || null
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const results = []

  for (const row of rows) {
    const response = await page.goto(\`\${baseUrl}\${row.verify_path}\`, {
      waitUntil: "domcontentloaded",
    })
    await page.waitForTimeout(300)

    const checks = []
    const status = response ? response.status() : 0
    checks.push({
      check: "timeline_http_status",
      ok: status > 0 && status < 400,
      details: String(status),
    })

    if (status > 0 && status < 400) {
      const heroName = await textContent(page, "[data-pf-hero-name]")
      checks.push({
        check: "timeline_hero_name",
        ok: normalizeText(heroName) === normalizeText(row.nome_urna),
        details: row.nome_urna,
      })
    }

    results.push({
      slug: row.slug,
      ok: checks.every((check) => check.ok),
      checks,
    })
  }

  await browser.close()
  writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8")
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
`
}

async function verifyCompareView(selectedSnapshots: CandidateSnapshot[]) {
  const slugs = selectedSnapshots.map((snapshot) => snapshot.slug)
  const snapshotMap = new Map(selectedSnapshots.map((snapshot) => [snapshot.slug, snapshot]))
  const { data, error } = await withQueryRetry("v_comparador query", async () =>
    await supabase
      .from("v_comparador")
      .select("slug, nome_urna, partido_sigla, cargo_disputado, total_processos")
      .in("slug", slugs)
  )

  if (error) {
    throw new Error(`v_comparador query failed: ${error.message}`)
  }

  const failures: CandidateCheckResult[] = []

  for (const row of (data ?? []) as CompareRow[]) {
    const snapshot = snapshotMap.get(row.slug)
    if (!snapshot) continue

    const checks = [
      {
        check: "comparador_nome",
        ok: normalizeText(row.nome_urna) === normalizeText(snapshot.nome_urna),
        details: snapshot.nome_urna,
      },
      {
        check: "comparador_partido",
        ok: normalizeText(row.partido_sigla) === normalizeText(snapshot.partido_sigla),
        details: String(snapshot.partido_sigla),
      },
      {
        check: "comparador_cargo",
        ok: normalizeText(row.cargo_disputado) === normalizeText(snapshot.cargo_disputado),
        details: snapshot.cargo_disputado,
      },
      {
        check: "comparador_processos",
        ok: Number(row.total_processos) === Number(snapshot.total_processos),
        details: String(snapshot.total_processos),
      },
    ]

    if (!checks.every((check) => check.ok)) {
      failures.push({
        slug: row.slug,
        ok: false,
        checks,
      })
    }
  }

  return failures
}

async function verifyCompararPage(): Promise<CandidateCheckResult> {
  const { data: activeRows, error: activeError } = await withQueryRetry(
    "candidatos_publico query for comparar",
    async () =>
      await supabase
        .from("candidatos_publico")
        .select("id")
        .neq("status", "removido")
        .eq("cargo_disputado", "Presidente")
  )

  if (activeError) {
    throw new Error(`candidatos_publico query for comparar failed: ${activeError.message}`)
  }

  const activeIds = new Set((activeRows ?? []).map((row) => row.id))
  const { data, error } = await withQueryRetry("v_comparador query for comparar page", async () =>
    await supabase
      .from("v_comparador")
      .select("id, slug, nome_urna, partido_sigla, idade, formacao, patrimonio_declarado, total_processos, alertas_graves, pontos_atencao")
      .order("nome_urna")
  )

  if (error) {
    throw new Error(`v_comparador query for comparar page failed: ${error.message}`)
  }

  const expectedRows = ((data ?? []) as ComparePageRow[])
    .filter((row: ComparePageRow) => activeIds.has(row.id))
    .map((row) => ({
      ...row,
      alertas_graves: countNegativeCriticalPoints(row.pontos_atencao),
    }))
  const expectedBySlug = new Map(expectedRows.map((row) => [row.slug, row]))

  const result = runPlaywrightSpec<{
    status: number
    rows: Array<{
      slug: string | null
      nome_urna: string | null
      partido_sigla: string | null
      idade: string | null
      formacao: string | null
      patrimonio_declarado: string | null
      total_processos: string | null
      alertas_graves: string | null
    }>
  }>(
    "release-verify-comparar",
    `
const { chromium } = require("playwright")
const { writeFileSync } = require("fs")
const outputPath = __OUTPUT_PATH__

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const response = await page.goto((process.env.VERIFY_URL || "http://localhost:3000") + "/comparar", {
    waitUntil: "domcontentloaded",
  })
  await page.waitForTimeout(300)
  const rows = await page.locator("[data-pf-comparador-row]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      slug: node.getAttribute("data-pf-comparador-slug"),
      nome_urna: node.getAttribute("data-pf-comparador-name"),
      partido_sigla: node.getAttribute("data-pf-comparador-party"),
      idade: node.getAttribute("data-pf-comparador-age"),
      formacao: node.getAttribute("data-pf-comparador-formacao"),
      patrimonio_declarado: node.getAttribute("data-pf-comparador-patrimonio"),
      total_processos: node.getAttribute("data-pf-comparador-processos"),
      alertas_graves: node.getAttribute("data-pf-comparador-alertas"),
    }))
  )
  await browser.close()
  writeFileSync(outputPath, JSON.stringify({
    status: response ? response.status() : 0,
    rows,
  }, null, 2), "utf8")
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
`,
  )

  const seenSlugs = new Set(result.rows.map((row) => row.slug).filter(Boolean) as string[])
  const missingSlugs = expectedRows.map((row) => row.slug).filter((slug) => !seenSlugs.has(slug))
  const extraSlugs = result.rows
    .map((row) => row.slug)
    .filter((slug): slug is string => Boolean(slug))
    .filter((slug) => !expectedBySlug.has(slug))

  const mismatches = result.rows.flatMap((row) => {
    if (!row.slug) {
      return [
        {
          check: "comparar_slug_ausente",
          ok: false,
          details: "Linha do comparador sem slug deterministico",
        },
      ]
    }

    const expected = expectedBySlug.get(row.slug)
    if (!expected) return []

    const checks = [
      {
        check: "comparar_nome",
        ok: normalizeText(row.nome_urna) === normalizeText(expected.nome_urna),
        details: `${row.slug}: esperado ${expected.nome_urna}`,
      },
      {
        check: "comparar_partido",
        ok: normalizeText(row.partido_sigla) === normalizeText(expected.partido_sigla),
        details: `${row.slug}: esperado ${expected.partido_sigla}`,
      },
      {
        check: "comparar_processos",
        ok: Number(row.total_processos || "0") === Number(expected.total_processos || 0),
        details: `${row.slug}: esperado ${expected.total_processos || 0}`,
      },
      {
        check: "comparar_alertas",
        ok: Number(row.alertas_graves || "0") === Number(expected.alertas_graves || 0),
        details: `${row.slug}: esperado ${expected.alertas_graves || 0}`,
      },
    ]

    if (expected.patrimonio_declarado != null) {
      checks.push({
        check: "comparar_patrimonio",
        ok: Number(row.patrimonio_declarado || "0") === Number(expected.patrimonio_declarado || 0),
        details: `${row.slug}: esperado ${expected.patrimonio_declarado || 0}`,
      })
    }

    return checks.filter((check) => !check.ok)
  })

  return {
    slug: "comparar",
    ok:
      result.status > 0 &&
      result.status < 400 &&
      missingSlugs.length === 0 &&
      extraSlugs.length === 0 &&
      mismatches.length === 0,
    checks: [
      {
        check: "comparar_status",
        ok: result.status > 0 && result.status < 400,
        details: String(result.status),
      },
      {
        check: "comparar_rows_presentes",
        ok: missingSlugs.length === 0,
        details: missingSlugs.join(", ") || "ok",
      },
      {
        check: "comparar_rows_extras",
        ok: extraSlugs.length === 0,
        details: extraSlugs.join(", ") || "ok",
      },
      ...mismatches,
    ],
  }
}

function verifyRankingPages(): CandidateCheckResult[] {
  const indexResult = runPlaywrightSpec<RankingPageResult>(
    "release-verify-rankings-index",
    `
const { chromium } = require("playwright")
const { writeFileSync } = require("fs")
const outputPath = __OUTPUT_PATH__

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const response = await page.goto((process.env.VERIFY_URL || "http://localhost:3000") + "/rankings", {
    waitUntil: "domcontentloaded",
  })
  await page.waitForTimeout(300)
  const hrefs = await page.locator('a[href^="/rankings/"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("href")).filter(Boolean)
  )
  await browser.close()
  writeFileSync(outputPath, JSON.stringify({
    status: response ? response.status() : 0,
    hrefs,
  }, null, 2), "utf8")
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
`
  )

  const expectedHrefs = RANKING_SLUGS.map((slug) => `/rankings/${slug}`)
  const hrefSet = new Set(indexResult.hrefs ?? [])

  const results: CandidateCheckResult[] = [
    {
      slug: "rankings",
      ok:
        indexResult.status > 0 &&
        indexResult.status < 400 &&
        expectedHrefs.every((href) => hrefSet.has(href)),
      checks: [
        {
          check: "rankings_index_status",
          ok: indexResult.status > 0 && indexResult.status < 400,
          details: String(indexResult.status),
        },
        {
          check: "rankings_index_links",
          ok: expectedHrefs.every((href) => hrefSet.has(href)),
          details: expectedHrefs.filter((href) => !hrefSet.has(href)).join(", ") || "ok",
        },
      ],
    },
  ]

  for (const slug of RANKING_SLUGS) {
    const detailResult = runPlaywrightSpec<RankingPageResult>(
      `release-verify-ranking-${slug}`,
      `
const { chromium } = require("playwright")
const { writeFileSync } = require("fs")
const outputPath = __OUTPUT_PATH__

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const response = await page.goto((process.env.VERIFY_URL || "http://localhost:3000") + ${JSON.stringify(`/rankings/${slug}`)}, {
    waitUntil: "domcontentloaded",
  })
  await page.waitForTimeout(300)
  const rowCount = await page.locator("[data-pf-ranking-row]").count()
  await browser.close()
  writeFileSync(outputPath, JSON.stringify({
    status: response ? response.status() : 0,
    rowCount,
  }, null, 2), "utf8")
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
`
    )

    results.push({
      slug: `rankings:${slug}`,
      ok:
        detailResult.status > 0 && detailResult.status < 400 && Number(detailResult.rowCount || 0) > 0,
      checks: [
        {
          check: "ranking_detail_status",
          ok: detailResult.status > 0 && detailResult.status < 400,
          details: String(detailResult.status),
        },
        {
          check: "ranking_detail_rows",
          ok: Number(detailResult.rowCount || 0) > 0,
          details: String(detailResult.rowCount || 0),
        },
      ],
    })
  }

  return results
}


async function main() {
  const report = readAuditReport()
  const selectedSnapshots = resolveSnapshots(report)
  const { data: publicRows, error: publicError } = await withQueryRetry(
    "candidatos_publico query for page verify",
    async () =>
      await supabase
        .from("candidatos_publico")
        .select("slug")
        .neq("status", "removido")
  )

  if (publicError) {
    throw new Error(`candidatos_publico query for page verify failed: ${publicError.message}`)
  }

  const publicSlugs = new Set(((publicRows ?? []) as Array<{ slug: string }>).map((row) => row.slug))
  const hiddenSnapshots = selectedSnapshots.filter((snapshot) => !publicSlugs.has(snapshot.slug))

  if (hiddenSnapshots.length > 0 && !PREVIEW_TOKEN) {
    throw new Error(
      `Release verify precisa de PF_PREVIEW_TOKEN para ${hiddenSnapshots.length} fichas ocultas.`
    )
  }

  const pageSnapshots: CandidatePageSnapshot[] = selectedSnapshots.map((snapshot) => ({
    ...snapshot,
    verify_path: publicSlugs.has(snapshot.slug)
      ? `/candidato/${snapshot.slug}`
      : `/preview/candidato/${snapshot.slug}?token=${encodeURIComponent(PREVIEW_TOKEN)}`,
  }))
  const tempDir = mkdtempSync(join(tmpdir(), "puxa-ficha-release-verify-"))
  const inputPath = join(tempDir, "rows.json")
  const outputPath = join(tempDir, "results.json")
  const specPath = join(tempDir, "release-verify.spec.cjs")

  try {
    const compareFailures = await verifyCompareView(selectedSnapshots)
    const compararResult = await verifyCompararPage()
    const rankingResults = verifyRankingPages()

    writeFileSync(inputPath, JSON.stringify(pageSnapshots, null, 2), "utf8")
    writeFileSync(specPath, buildCandidatePagesSpec(inputPath, outputPath), "utf8")

    execFileSync("node", [specPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        VERIFY_URL: BASE_URL,
        CI: "1",
        NODE_PATH: [LOCAL_NODE_MODULES, GLOBAL_NODE_MODULES, process.env.NODE_PATH]
          .filter(Boolean)
          .join(delimiter),
      },
      stdio: "pipe",
    })

    const pageResults = JSON.parse(readFileSync(outputPath, "utf8")) as CandidateCheckResult[]

    const timelineRows = selectedSnapshots
      .filter((snapshot) => publicSlugs.has(snapshot.slug))
      .map((snapshot) => ({
        slug: `timeline:${snapshot.slug}`,
        nome_urna: snapshot.nome_urna,
        verify_path: `/candidato/${snapshot.slug}/timeline`,
      }))

    let timelineResults: CandidateCheckResult[] = []
    if (timelineRows.length > 0) {
      const timelineInputPath = join(tempDir, "timeline-rows.json")
      const timelineOutputPath = join(tempDir, "timeline-results.json")
      const timelineSpecPath = join(tempDir, "release-verify-timeline.spec.cjs")
      writeFileSync(timelineInputPath, JSON.stringify(timelineRows, null, 2), "utf8")
      writeFileSync(timelineSpecPath, buildTimelinePagesSpec(timelineInputPath, timelineOutputPath), "utf8")
      execFileSync("node", [timelineSpecPath], {
        cwd: tempDir,
        env: {
          ...process.env,
          VERIFY_URL: BASE_URL,
          CI: "1",
          NODE_PATH: [LOCAL_NODE_MODULES, GLOBAL_NODE_MODULES, process.env.NODE_PATH]
            .filter(Boolean)
            .join(delimiter),
        },
        stdio: "pipe",
      })
      timelineResults = JSON.parse(readFileSync(timelineOutputPath, "utf8")) as CandidateCheckResult[]
    }

    const results = [...pageResults, ...timelineResults, ...compareFailures, compararResult, ...rankingResults]

    writeFileSync(REPORT_OUTPUT_PATH, JSON.stringify(results, null, 2), "utf8")
    writeFileSync(SUMMARY_OUTPUT_PATH, buildSummary(results, MODE), "utf8")

    const failed = results.filter((result) => !result.ok)
    console.log(
      `Release verify (${MODE}): ${results.length - failed.length}/${results.length} OK at ${BASE_URL}`
    )
    console.log(`Relatorio salvo em ${REPORT_OUTPUT_PATH}`)
    console.log(`Resumo salvo em ${SUMMARY_OUTPUT_PATH}`)

    if (failed.length > 0) {
      for (const result of failed) {
        const details = result.checks
          .filter((check) => !check.ok)
          .map((check) => `${check.check}: ${check.details}`)
          .join("; ")
        console.error(`  ${result.slug}: ${details}`)
      }
      process.exit(1)
    }
  } catch (error) {
    if (error instanceof Error && "stdout" in error) {
      const stdout = String((error as { stdout?: Buffer }).stdout ?? "")
      const stderr = String((error as { stderr?: Buffer }).stderr ?? "")
      if (stdout) console.error(stdout)
      if (stderr) console.error(stderr)
    }
    throw error
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
