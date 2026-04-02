import { readFileSync } from "fs"
import { resolve } from "path"
import { CANDIDATE_ASSERTIONS } from "./lib/factual-assertions"

const args = process.argv.slice(2)
const reportPath =
  args.find((_, i) => args[i - 1] === "--report") ??
  resolve(process.cwd(), "scripts/audit-factual-report.json")
const maxBlocked = Number(args.find((_, i) => args[i - 1] === "--max-blocked") ?? "0")
const minAssertions = Number(args.find((_, i) => args[i - 1] === "--min-assertions") ?? "0")
const minCuratedArg = args.find((_, i) => args[i - 1] === "--min-curated")

// Derive expected curated count from assertions file (unique slugs)
const curatedSlugs = new Set(
  CANDIDATE_ASSERTIONS.filter((a) => a.confidence === "curated").map((a) => a.slug)
)
const mirroredOnlySlugs = new Set(
  CANDIDATE_ASSERTIONS.filter((a) => a.confidence === "mirrored").map((a) => a.slug)
)
for (const s of curatedSlugs) mirroredOnlySlugs.delete(s)

// --min-curated auto means: require that the report confirms every curated slug passed.
// A numeric value is a hard floor (e.g. --min-curated 42).
const minCurated =
  minCuratedArg === "auto" || minCuratedArg === undefined
    ? curatedSlugs.size
    : Number(minCuratedArg)

interface AuditCandidateResult {
  slug: string
  auditoria_status: "auditado" | "pendente" | "reprovado"
  tem_falha_critica: boolean
}

interface GateReport {
  total_candidatos: number
  resumo: {
    nao_podem_publicar: number
    com_assertions: number
  }
  candidatos: AuditCandidateResult[]
}

const report = JSON.parse(readFileSync(reportPath, "utf-8")) as GateReport

let failed = false

// Check 1: no blocked candidates
if (report.resumo.nao_podem_publicar > maxBlocked) {
  console.error(
    `Gate falhou: ${report.resumo.nao_podem_publicar} bloqueados (max ${maxBlocked})`
  )
  failed = true
}

// Check 2: minimum total assertions
if (report.resumo.com_assertions < minAssertions) {
  console.error(
    `Gate falhou: ${report.resumo.com_assertions} assertions (min ${minAssertions})`
  )
  failed = true
}

// Check 3: every curated slug must appear in the report AND have passed
const reportSlugsMap = new Map(
  report.candidatos.map((c) => [c.slug, c])
)

const curatedPassed: string[] = []
const curatedFailed: string[] = []
const curatedMissing: string[] = []

for (const slug of curatedSlugs) {
  const result = reportSlugsMap.get(slug)
  if (!result) {
    curatedMissing.push(slug)
  } else if (result.auditoria_status !== "auditado" || result.tem_falha_critica) {
    curatedFailed.push(slug)
  } else {
    curatedPassed.push(slug)
  }
}

if (curatedPassed.length < minCurated) {
  console.error(
    `Gate falhou: ${curatedPassed.length} curated passaram (min ${minCurated})`
  )
  if (curatedFailed.length > 0) {
    console.error(`  Curated com falha: ${curatedFailed.join(", ")}`)
  }
  if (curatedMissing.length > 0) {
    console.error(`  Curated ausentes do report: ${curatedMissing.join(", ")}`)
  }
  failed = true
}

if (failed) {
  process.exit(1)
}

console.log(
  `Gate factual OK: ${report.resumo.nao_podem_publicar} bloqueados, ${report.resumo.com_assertions} assertions (curated passaram: ${curatedPassed.length}/${curatedSlugs.size}, mirrored: ${mirroredOnlySlugs.size})`
)
