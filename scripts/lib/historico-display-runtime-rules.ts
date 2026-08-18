import { canonicalCargo } from "@/lib/cargo-utils"
import { normalizeHistoricoPoliticoForDisplay } from "@/lib/historico-dedupe"
import {
  formatHistoricoCargoTituloPublico,
  formatHistoricoPeriodoDisplay,
} from "@/lib/historico-display"
import { isHistoricoCandidaturaRow } from "@/lib/historico-tipo-evento"
import type { HistoricoPolitico } from "@/lib/types"

export type DisplayIssueSeverity = "alta" | "media" | "baixa"

export interface DisplayHistoricoRow {
  id: string
  title: string
  canon: string
  kind: "mandato" | "candidatura"
  periodo: string
  inTeaser: boolean
  badPeriod: boolean
}

export interface DisplayHistoricoIssue {
  groupKey: string
  severity: DisplayIssueSeverity
  teaserBroken: boolean
  titleOverlap: boolean
  goodRows: DisplayHistoricoRow[]
  badRows: DisplayHistoricoRow[]
}

export interface DisplayHistoricoAuditResult {
  normalizedRows: DisplayHistoricoRow[]
  issues: DisplayHistoricoIssue[]
  counts: Record<DisplayIssueSeverity, number>
}

export function isBadDisplayPeriodo(label: string): boolean {
  return (
    label === "Período não determinado" ||
    /mandato encerrado/i.test(label) ||
    /^Até\s+\d{4}$/i.test(label)
  )
}

export function auditHistoricoDisplay(rows: HistoricoPolitico[]): DisplayHistoricoAuditResult {
  const normalized = normalizeHistoricoPoliticoForDisplay(rows)
  const sorted = [...normalized].sort((a, b) => (b.periodo_inicio ?? 0) - (a.periodo_inicio ?? 0))
  const teaserIds = new Set(sorted.slice(0, 3).map((row) => row.id))

  const displayRows: DisplayHistoricoRow[] = sorted.map((row) => {
    const title = formatHistoricoCargoTituloPublico(row)
    const periodo = formatHistoricoPeriodoDisplay(row, sorted)
    return {
      id: row.id,
      title,
      canon: (row.cargo_canonico?.trim() || canonicalCargo(row.cargo ?? "")).trim(),
      kind: isHistoricoCandidaturaRow(row) ? "candidatura" : "mandato",
      periodo,
      inTeaser: teaserIds.has(row.id),
      badPeriod: isBadDisplayPeriodo(periodo),
    }
  })

  const grouped = new Map<string, DisplayHistoricoRow[]>()
  for (const row of displayRows) {
    const key = `${row.kind}|${row.canon}`
    const list = grouped.get(key) ?? []
    list.push(row)
    grouped.set(key, list)
  }

  const issues: DisplayHistoricoIssue[] = []

  for (const [groupKey, groupRows] of grouped.entries()) {
    const goodRows = groupRows.filter((row) => !row.badPeriod)
    const badRows = groupRows.filter((row) => row.badPeriod)
    if (goodRows.length === 0 || badRows.length === 0) continue

    const titleOverlap = badRows.some((bad) => goodRows.some((good) => good.title === bad.title))
    const teaserBroken = titleOverlap
      && badRows.some((row) => row.inTeaser)
      && goodRows.some((row) => row.inTeaser)

    const severity: DisplayIssueSeverity = teaserBroken
      ? "alta"
      : titleOverlap
        ? "media"
        : "baixa"

    issues.push({
      groupKey,
      severity,
      teaserBroken,
      titleOverlap,
      goodRows,
      badRows,
    })
  }

  const counts: Record<DisplayIssueSeverity, number> = { alta: 0, media: 0, baixa: 0 }
  for (const issue of issues) counts[issue.severity] += 1

  return {
    normalizedRows: displayRows,
    issues,
    counts,
  }
}
