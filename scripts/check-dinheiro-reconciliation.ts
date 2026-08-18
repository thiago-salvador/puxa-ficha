import { readFileSync } from "node:fs"
import { resolve } from "node:path"

interface MoneyYearRow {
  slug: string
  ano: number
  patrimonio: string
  financiamento: string
}

interface MoneyReport {
  generated_at: string
  entries: Array<{ years: MoneyYearRow[] }>
}

const DEFAULT_REPORT = "output/dinheiro-audit/current.json"
const DEFAULT_MIGRATION =
  "supabase/migrations/20260711223000_tse_money_gap_jenilson_wanderlei.sql"

export function hasPlannedMoneyRow(
  migration: string,
  table: "patrimonio" | "financiamento",
  slug: string,
  year: number,
): boolean {
  const financiamentoMarker = "INSERT INTO public.financiamento"
  const section =
    table === "patrimonio"
      ? migration.split(financiamentoMarker)[0]
      : migration.split(financiamentoMarker)[1] ?? ""
  return section.includes(`('${slug}', ${year},`)
}

export function findUnplannedMoneyGaps(report: MoneyReport, migration: string) {
  const gaps: Array<{ table: "patrimonio" | "financiamento"; slug: string; ano: number }> = []
  for (const entry of report.entries) {
    for (const row of entry.years) {
      if (row.patrimonio === "gap_no_row") {
        gaps.push({ table: "patrimonio", slug: row.slug, ano: row.ano })
      }
      if (row.financiamento === "gap_no_row") {
        gaps.push({ table: "financiamento", slug: row.slug, ano: row.ano })
      }
    }
  }
  return gaps.filter((gap) => !hasPlannedMoneyRow(migration, gap.table, gap.slug, gap.ano))
}

function main() {
  const reportPath = resolve(process.argv[2] ?? DEFAULT_REPORT)
  const migrationPath = resolve(process.argv[3] ?? DEFAULT_MIGRATION)
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as MoneyReport
  const migration = readFileSync(migrationPath, "utf8")
  const allGaps = report.entries.flatMap((entry) =>
    entry.years.flatMap((row) => [
      ...(row.patrimonio === "gap_no_row"
        ? [{ table: "patrimonio" as const, slug: row.slug, ano: row.ano }]
        : []),
      ...(row.financiamento === "gap_no_row"
        ? [{ table: "financiamento" as const, slug: row.slug, ano: row.ano }]
        : []),
    ]),
  )
  const unplanned = findUnplannedMoneyGaps(report, migration)

  console.log(
    `dinheiro reconciliation: live_gaps=${allGaps.length} planned=${allGaps.length - unplanned.length} unplanned=${unplanned.length}`,
  )
  if (unplanned.length > 0) {
    for (const gap of unplanned) console.error(`UNPLANNED ${gap.table} ${gap.slug} ${gap.ano}`)
    process.exit(1)
  }
  console.log("audit:dinheiro-cohort-coverage:gate PASSED")
}

if (import.meta.url === `file://${process.argv[1]}`) main()
