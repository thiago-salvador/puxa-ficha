import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { podePublicar } from "./lib/audit-rules"
import { RUNS_DIR } from "./lib/audit-persistence"
import type { AuditCandidateResult } from "./lib/audit-types"

const args = process.argv.slice(2)
const beforePathArg = args.find((_, i) => args[i - 1] === "--before")
const afterPathArg = args.find((_, i) => args[i - 1] === "--after")
const scopeArg = args.find((_, i) => args[i - 1] === "--scope")
const outputPrefix = args.find((_, i) => args[i - 1] === "--output-prefix")

interface AuditReportFile {
  gerado_em: string
  candidatos: AuditCandidateResult[]
}

interface CandidateDiffEntry {
  slug: string
  before_status: string | null
  after_status: string | null
  before_pode_publicar: boolean | null
  after_pode_publicar: boolean | null
  change_type: "added" | "removed" | "improved" | "regressed" | "changed" | "unchanged"
  changed_fields: string[]
}

interface AuditDiffReport {
  gerado_em: string
  before_path: string
  after_path: string
  resumo: {
    candidatos_comparados: number
    improved: number
    regressed: number
    changed: number
    unchanged: number
    added: number
    removed: number
  }
  candidatos: CandidateDiffEntry[]
}

function normalizeScope(scope: string): string {
  return scope
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function resolveLatestRunPaths(scope: string): { before: string; after: string } {
  const normalizedScope = normalizeScope(scope)
  if (!existsSync(RUNS_DIR)) {
    throw new Error(`Diretório de runs não encontrado: ${RUNS_DIR}`)
  }

  const candidates = readdirSync(RUNS_DIR)
    .filter((file) => file.endsWith(`-${normalizedScope}-report.json`))
    .sort()

  if (candidates.length < 2) {
    throw new Error(
      `Menos de duas execuções encontradas para o escopo "${normalizedScope}" em ${RUNS_DIR}`
    )
  }

  return {
    before: resolve(RUNS_DIR, candidates[candidates.length - 2]),
    after: resolve(RUNS_DIR, candidates[candidates.length - 1]),
  }
}

function loadReport(reportPath: string): AuditReportFile {
  return JSON.parse(readFileSync(reportPath, "utf-8")) as AuditReportFile
}

function buildCandidateFieldSet(
  beforeCandidate: AuditCandidateResult | undefined,
  afterCandidate: AuditCandidateResult | undefined
): string[] {
  const fieldNames = new Set<string>([
    ...(beforeCandidate?.campos.map((campo) => campo.campo) ?? []),
    ...(afterCandidate?.campos.map((campo) => campo.campo) ?? []),
  ])

  const changedFields: string[] = []

  for (const field of fieldNames) {
    const beforeField = beforeCandidate?.campos.find((campo) => campo.campo === field) ?? null
    const afterField = afterCandidate?.campos.find((campo) => campo.campo === field) ?? null

    if (JSON.stringify(beforeField) !== JSON.stringify(afterField)) {
      changedFields.push(field)
    }
  }

  return changedFields
}

function rankStatus(status: string | null): number {
  if (status === "auditado") return 3
  if (status === "pendente") return 2
  if (status === "reprovado") return 1
  return 0
}

function classifyChange(
  beforeCandidate: AuditCandidateResult | undefined,
  afterCandidate: AuditCandidateResult | undefined,
  changedFields: string[]
): CandidateDiffEntry["change_type"] {
  if (!beforeCandidate && afterCandidate) return "added"
  if (beforeCandidate && !afterCandidate) return "removed"
  if (!beforeCandidate || !afterCandidate) return "unchanged"

  const beforePublish = podePublicar(beforeCandidate)
  const afterPublish = podePublicar(afterCandidate)

  if (!beforePublish && afterPublish) return "improved"
  if (beforePublish && !afterPublish) return "regressed"

  const beforeRank = rankStatus(beforeCandidate.auditoria_status)
  const afterRank = rankStatus(afterCandidate.auditoria_status)

  if (afterRank > beforeRank) return "improved"
  if (afterRank < beforeRank) return "regressed"

  if (changedFields.length > 0) return "changed"
  return "unchanged"
}

function buildMarkdownSummary(diff: AuditDiffReport): string {
  const lines = [
    "# Diff de Auditoria Factual",
    "",
    `Gerado em: ${diff.gerado_em}`,
    `Before: ${diff.before_path}`,
    `After: ${diff.after_path}`,
    "",
    "## Resumo",
    "",
    `- Candidatos comparados: ${diff.resumo.candidatos_comparados}`,
    `- Melhoraram: ${diff.resumo.improved}`,
    `- Regrediram: ${diff.resumo.regressed}`,
    `- Mudaram sem gate: ${diff.resumo.changed}`,
    `- Inalterados: ${diff.resumo.unchanged}`,
    `- Novos no escopo: ${diff.resumo.added}`,
    `- Removidos do escopo: ${diff.resumo.removed}`,
  ]

  const regressed = diff.candidatos.filter((item) => item.change_type === "regressed")
  if (regressed.length > 0) {
    lines.push("", "## Regressões", "")
    for (const item of regressed) {
      lines.push(`- ${item.slug}: ${item.changed_fields.join(", ") || "sem detalhe de campo"}`)
    }
  }

  const improved = diff.candidatos.filter((item) => item.change_type === "improved")
  if (improved.length > 0) {
    lines.push("", "## Melhoras", "")
    for (const item of improved) {
      lines.push(`- ${item.slug}: ${item.changed_fields.join(", ") || "sem detalhe de campo"}`)
    }
  }

  return `${lines.join("\n")}\n`
}

function main() {
  const resolvedPaths =
    beforePathArg && afterPathArg
      ? { before: resolve(beforePathArg), after: resolve(afterPathArg) }
      : scopeArg
        ? resolveLatestRunPaths(scopeArg)
        : null

  if (!resolvedPaths) {
    console.error("Use --before <path> --after <path> ou --scope <scope>.")
    process.exit(1)
  }

  const beforeReport = loadReport(resolvedPaths.before)
  const afterReport = loadReport(resolvedPaths.after)

  const beforeMap = new Map(beforeReport.candidatos.map((item) => [item.slug, item]))
  const afterMap = new Map(afterReport.candidatos.map((item) => [item.slug, item]))
  const slugs = new Set([...beforeMap.keys(), ...afterMap.keys()])

  const candidatos: CandidateDiffEntry[] = [...slugs]
    .sort()
    .map((slug) => {
      const beforeCandidate = beforeMap.get(slug)
      const afterCandidate = afterMap.get(slug)
      const changedFields = buildCandidateFieldSet(beforeCandidate, afterCandidate)

      return {
        slug,
        before_status: beforeCandidate?.auditoria_status ?? null,
        after_status: afterCandidate?.auditoria_status ?? null,
        before_pode_publicar: beforeCandidate ? podePublicar(beforeCandidate) : null,
        after_pode_publicar: afterCandidate ? podePublicar(afterCandidate) : null,
        change_type: classifyChange(beforeCandidate, afterCandidate, changedFields),
        changed_fields: changedFields,
      }
    })

  const resumo = {
    candidatos_comparados: candidatos.length,
    improved: candidatos.filter((item) => item.change_type === "improved").length,
    regressed: candidatos.filter((item) => item.change_type === "regressed").length,
    changed: candidatos.filter((item) => item.change_type === "changed").length,
    unchanged: candidatos.filter((item) => item.change_type === "unchanged").length,
    added: candidatos.filter((item) => item.change_type === "added").length,
    removed: candidatos.filter((item) => item.change_type === "removed").length,
  }

  const diffReport: AuditDiffReport = {
    gerado_em: new Date().toISOString(),
    before_path: resolvedPaths.before,
    after_path: resolvedPaths.after,
    resumo,
    candidatos,
  }

  const prefix = normalizeScope(outputPrefix ?? scopeArg ?? "diff")
  const jsonPath = resolve(process.cwd(), "scripts", `audit-factual-diff-${prefix}.json`)
  const summaryPath = resolve(process.cwd(), "scripts", `audit-factual-diff-${prefix}.md`)

  writeFileSync(jsonPath, JSON.stringify(diffReport, null, 2), "utf-8")
  writeFileSync(summaryPath, buildMarkdownSummary(diffReport), "utf-8")

  console.log(`Diff factual salvo em ${jsonPath}`)
  console.log(`Resumo do diff salvo em ${summaryPath}`)
  console.log(
    `Melhoraram: ${resumo.improved} | Regrediram: ${resumo.regressed} | Mudaram: ${resumo.changed}`
  )
}

main()
