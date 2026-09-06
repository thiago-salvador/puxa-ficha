import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

type CellState = "ok" | "partial" | "missing" | "zero" | "na"

type CoverageRow = {
  slug: string
  celulas: Record<string, CellState>
  indice: number
}

type Baseline = {
  version: number
  public_profiles: number
  sections: string[]
  total_missing: number
  total_partial: number
  missing_by_section: Record<string, number>
  partial_by_section: Record<string, number>
  min_score: number
  profiles_below_90: number
}

export type ContractSummary = {
  public_profiles: number
  sections: string[]
  total_missing: number
  total_partial: number
  missing_by_section: Record<string, number>
  partial_by_section: Record<string, number>
  min_score: number
  profiles_below_90: number
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1
}

export function summarizeContract(rows: CoverageRow[]): ContractSummary {
  if (rows.length === 0) throw new Error("relatório de cobertura vazio")
  const slugs = new Set<string>()
  const missingBySection: Record<string, number> = {}
  const partialBySection: Record<string, number> = {}
  for (const row of rows) {
    if (!row.slug || slugs.has(row.slug)) throw new Error(`slug ausente ou duplicado: ${row.slug || "<vazio>"}`)
    if (!Number.isFinite(row.indice)) throw new Error(`índice inválido: ${row.slug}`)
    slugs.add(row.slug)
    for (const [section, state] of Object.entries(row.celulas ?? {})) {
      if (state === "missing") increment(missingBySection, section)
      if (state === "partial") increment(partialBySection, section)
    }
  }
  const total = (values: Record<string, number>) => Object.values(values).reduce((sum, value) => sum + value, 0)
  return {
    public_profiles: rows.length,
    sections: [...new Set(rows.flatMap((row) => Object.keys(row.celulas ?? {})))].sort(),
    total_missing: total(missingBySection),
    total_partial: total(partialBySection),
    missing_by_section: missingBySection,
    partial_by_section: partialBySection,
    min_score: Math.min(...rows.map((row) => row.indice)),
    profiles_below_90: rows.filter((row) => row.indice < 90).length,
  }
}

export function findContractRegressions(summary: ContractSummary, baseline: Baseline): string[] {
  const regressions: string[] = []
  if (summary.public_profiles !== baseline.public_profiles) {
    regressions.push(`perfis públicos ${summary.public_profiles}!=${baseline.public_profiles}`)
  }
  for (const section of baseline.sections) {
    if (!summary.sections.includes(section)) regressions.push(`seção ausente ${section}`)
  }
  if (summary.total_missing > baseline.total_missing) {
    regressions.push(`missing total ${summary.total_missing}>${baseline.total_missing}`)
  }
  if (summary.total_partial > baseline.total_partial) {
    regressions.push(`partial total ${summary.total_partial}>${baseline.total_partial}`)
  }
  if (summary.min_score < baseline.min_score) {
    regressions.push(`índice mínimo ${summary.min_score}<${baseline.min_score}`)
  }
  if (summary.profiles_below_90 > baseline.profiles_below_90) {
    regressions.push(`perfis abaixo de 90 ${summary.profiles_below_90}>${baseline.profiles_below_90}`)
  }
  for (const [section, count] of Object.entries(summary.missing_by_section)) {
    const limit = baseline.missing_by_section[section] ?? 0
    if (count > limit) regressions.push(`missing ${section} ${count}>${limit}`)
  }
  for (const [section, count] of Object.entries(summary.partial_by_section)) {
    const limit = baseline.partial_by_section[section] ?? 0
    if (count > limit) regressions.push(`partial ${section} ${count}>${limit}`)
  }
  return regressions.sort()
}

function value(args: string[], prefix: string): string | null {
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const reportPath = value(args, "--report=")
  if (!reportPath) throw new Error("use --report=<coverage.json>")
  const baselinePath = value(args, "--baseline=") ?? "data/public-profile-contract-baseline.json"
  const outPath = value(args, "--out=")
  const rows = JSON.parse(await readFile(path.resolve(reportPath), "utf8")) as CoverageRow[]
  const baseline = JSON.parse(await readFile(path.resolve(baselinePath), "utf8")) as Baseline
  const summary = summarizeContract(rows)
  const regressions = findContractRegressions(summary, baseline)
  const result = {
    generated_at: new Date().toISOString(),
    status: regressions.length === 0 ? "known_debt_no_regression" : "regression",
    scope: "Contrato integral das seções públicas; missing e partial continuam dívida, mesmo com gate verde.",
    baseline,
    current: summary,
    regressions,
  }
  if (outPath) {
    await mkdir(path.dirname(path.resolve(outPath)), { recursive: true })
    await writeFile(path.resolve(outPath), `${JSON.stringify(result, null, 2)}\n`, "utf8")
  }
  console.log(
    `PUBLIC_PROFILE_CONTRACT_${regressions.length === 0 ? "NO_REGRESSION" : "REGRESSION"} ` +
    `profiles=${summary.public_profiles} known_missing=${summary.total_missing} known_partial=${summary.total_partial} ` +
    `regressions=${regressions.length}`,
  )
  if (regressions.length > 0) throw new Error(regressions.join("; "))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
