// Sets publicavel = true ONLY for candidates with curated assertions that passed the
// stricter factual audit end-to-end. Fail-closed: starts by marking ALL candidates as
// publicavel = false, then enables only those meeting every gating criterion enforced by
// audit-factual.ts.
//
// Usage: npx tsx scripts/set-publicavel-from-audit.ts
//   Requires: audit-factual-report.json (run audit-factual.ts first)

import { readFileSync, statSync } from "fs"
import { resolve } from "path"
import { createClient } from "@supabase/supabase-js"
import { CANDIDATE_ASSERTIONS } from "./lib/factual-assertions"
import {
  FROZEN_PUBLICATION_REASON_MAP,
  FROZEN_PUBLICATION_SLUGS,
} from "./lib/frozen-publication"
import { log, warn } from "./lib/logger"

const REPORT_PATH = resolve(process.cwd(), "scripts/audit-factual-report.json")
const VERIFY_REPORT_PATH = resolve(process.cwd(), "scripts/release-verify-report.json")
const DRY_RUN = process.argv.includes("--dry-run")

// Curated slugs from assertions file
const curatedSlugs = new Set(
  CANDIDATE_ASSERTIONS.filter((a) => a.confidence === "curated").map((a) => a.slug)
)
const gatedCuratedSlugs = new Set(
  [...curatedSlugs].filter((slug) => !FROZEN_PUBLICATION_SLUGS.has(slug))
)

// Read and validate audit report
interface AuditResult {
  slug: string
  auditoria_status: "auditado" | "pendente" | "reprovado"
  tem_falha_critica: boolean
}
interface AuditReport {
  gerado_em: string
  total_candidatos: number
  filtros: { slug?: string; cargo?: string; cohort?: string }
  candidatos: AuditResult[]
}

const report = JSON.parse(readFileSync(REPORT_PATH, "utf-8")) as AuditReport
const verifyReport = JSON.parse(readFileSync(VERIFY_REPORT_PATH, "utf-8")) as Array<{
  slug: string
  ok: boolean
}>

// Validate report is full-scope (not a partial/cohort run)
if (report.filtros?.slug || report.filtros?.cargo || report.filtros?.cohort) {
  throw new Error(
    `Report is not full-scope: filtros = ${JSON.stringify(report.filtros)}. ` +
    `Run audit-factual.ts without --slug/--cargo/--cohort first.`
  )
}

// Validate report covers expected number of candidates
if (report.total_candidatos !== 144) {
  throw new Error(
    `Report has ${report.total_candidatos} candidates (expected 144). ` +
    `Possible partial or corrupted report.`
  )
}

// Validate freshness: report should be less than 1 hour old
const reportAge = Date.now() - new Date(report.gerado_em).getTime()
const ONE_HOUR = 60 * 60 * 1000
if (reportAge > ONE_HOUR) {
  const mins = Math.round(reportAge / 60000)
  warn("set-publicavel", `Report is ${mins} min old (generated ${report.gerado_em}). Consider re-running audit-factual.ts first.`)
}

const verifyAge = Date.now() - statSync(VERIFY_REPORT_PATH).mtimeMs
if (verifyAge > ONE_HOUR) {
  const mins = Math.round(verifyAge / 60000)
  warn(
    "set-publicavel",
    `Release verify report is ${mins} min old. Consider re-running scripts/release-verify.ts first.`
  )
}

const passedAudit = new Set(
  report.candidatos
    .filter((c) => c.auditoria_status === "auditado" && !c.tem_falha_critica)
    .map((c) => c.slug)
)

const candidateVerifySlugs = new Set(
  verifyReport
    .map((item) => item.slug)
    .filter((slug) => slug !== "comparar" && slug !== "explorar")
)

const missingCuratedCoverage = [...gatedCuratedSlugs].filter(
  (slug) => !candidateVerifySlugs.has(slug)
)
if (missingCuratedCoverage.length > 0) {
  throw new Error(
    `Release verify report is missing ${missingCuratedCoverage.length} curated slug(s): ${missingCuratedCoverage.join(", ")}`
  )
}

const passedReleaseVerify = new Set(
  verifyReport
    .filter((item) => item.ok && item.slug !== "comparar" && item.slug !== "explorar")
    .map((item) => item.slug)
)

// Eligible = curated AND passed full audit AND passed release verify
const eligible = new Set(
  [...gatedCuratedSlugs].filter(
    (slug) => passedAudit.has(slug) && passedReleaseVerify.has(slug)
  )
)

async function main() {
  const frozenCurated = [...curatedSlugs].filter((slug) => FROZEN_PUBLICATION_SLUGS.has(slug))

  log(
    "set-publicavel",
    `Curated: ${curatedSlugs.size}, Frozen: ${frozenCurated.length}, Passed audit: ${passedAudit.size}, Passed release verify: ${passedReleaseVerify.size}, Eligible: ${eligible.size}`
  )

  if (frozenCurated.length > 0) {
    warn(
      "set-publicavel",
      `Curated mantidos ocultos por politica editorial: ${frozenCurated
        .map((slug) => `${slug} (${FROZEN_PUBLICATION_REASON_MAP.get(slug) ?? "sem motivo"})`)
        .join("; ")}`
    )
  }

  if (DRY_RUN) {
    log(
      "set-publicavel",
      `Dry-run: ${eligible.size} slug(s) elegiveis para publicacao: ${[...eligible].sort().join(", ")}`
    )
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Step 1: Mark ALL as false
  const { error: resetError } = await supabase
    .from("candidatos")
    .update({ publicavel: false })
    .neq("status", "removido")
  if (resetError) throw new Error(`Reset failed: ${resetError.message}`)
  log("set-publicavel", "All candidates marked publicavel = false")

  // Step 2: Mark eligible as true
  if (eligible.size > 0) {
    const slugArray = [...eligible]
    const { error: enableError } = await supabase
      .from("candidatos")
      .update({ publicavel: true })
      .in("slug", slugArray)
    if (enableError) throw new Error(`Enable failed: ${enableError.message}`)
    log("set-publicavel", `${eligible.size} candidates marked publicavel = true`)
  }

  // Step 3: Verify
  const { data: countData } = await supabase
    .from("candidatos")
    .select("slug, publicavel")
    .eq("publicavel", true)
  const pubCount = countData?.length ?? 0

  const notEligible = [...curatedSlugs].filter(
    (slug) =>
      FROZEN_PUBLICATION_SLUGS.has(slug) ||
      !passedAudit.has(slug) ||
      !passedReleaseVerify.has(slug)
  )
  if (notEligible.length > 0) {
    warn(
      "set-publicavel",
      `Curated fora do gate final: ${notEligible.join(", ")}`
    )
  }

  log("set-publicavel", `Done. ${pubCount} candidates visible on site, ${144 - pubCount} hidden.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
