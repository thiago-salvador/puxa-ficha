import { canonicalPartiesEquivalent, resolveCanonicalParty } from "./party-canonical"
import type { ResolveMethod } from "./tse-resolver"
import { stripAccents } from "../../src/lib/strip-accents"

export interface PartyTimelineRowLike {
  id: string
  partido_anterior: string | null
  partido_novo: string | null
  ano: number | null
  data_mudanca: string | null
  contexto?: string | null
  despublicado_em?: string | null
}

export type NormalizedPartyTimelineRow<Row extends PartyTimelineRowLike> = Omit<
  Row,
  "partido_anterior" | "partido_novo"
> & {
  partido_anterior: string | null
  partido_novo: string | null
}

export type PartyTimelineChangeCategory =
  | "reencadeamento_real"
  | "alias_seguro"
  | "renomeacao_historica_mesmo_partido"
  | "suspeito_precisa_revisao"

export type PartyTimelineSafeApplyKind = "alias" | "rechain"

export interface PartyTimelineRowDecision<Row extends PartyTimelineRowLike> {
  row: Row
  normalized: NormalizedPartyTimelineRow<Row>
  legacyNormalized: NormalizedPartyTimelineRow<Row>
  category: PartyTimelineChangeCategory | null
  autoApply: boolean
  applyKind: PartyTimelineSafeApplyKind | null
  reason: string | null
}

type SafeRechainBlockReason =
  | "historical_previous_matches_current_new"
  | "historical_previous_matches_current_before"
  | "historical_current_transition"
  | "historical_previous_transition"
  | "ambiguous_chronology"
  | "ambiguous_prior_cluster"
  | "current_anchor_context"
  | "safe_rechain"

const HISTORICAL_SAME_PARTY_GROUPS: Array<{ group: string; labels: string[] }> = [
  { group: "MDB", labels: ["MDB", "PMDB"] },
  { group: "CIDADANIA", labels: ["CIDADANIA", "PPS", "PARTIDO POPULAR SOCIALISTA"] },
  { group: "REPUBLICANOS", labels: ["REPUBLICANOS", "PRB", "PARTIDO REPUBLICANO BRASILEIRO"] },
  { group: "DEM", labels: ["DEM", "DEMOCRATAS", "PFL", "PARTIDO DA FRENTE LIBERAL"] },
  { group: "PODE", labels: ["PODE", "PODEMOS", "PTN", "PARTIDO TRABALHISTA NACIONAL"] },
  { group: "PP", labels: ["PP", "PPB", "PPR", "PROGRESSISTAS"] },
  { group: "PL", labels: ["PL", "PR", "PARTIDO LIBERAL", "PARTIDO DA REPUBLICA"] },
  { group: "AVANTE", labels: ["AVANTE", "PT DO B", "PTDOB", "PARTIDO TRABALHISTA DO BRASIL"] },
]

const HISTORICAL_SAME_PARTY_INDEX = new Map<string, string>()

for (const group of HISTORICAL_SAME_PARTY_GROUPS) {
  for (const label of group.labels) {
    const token = stripAccents(label)
      .replace(/[^a-zA-Z0-9]+/g, "")
      .toLowerCase()
    HISTORICAL_SAME_PARTY_INDEX.set(token, group.group)
  }
}

function normalizePartyTimelineComparisonToken(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null

  const canonical = resolveCanonicalParty(value)
  if (canonical) return canonical.sigla

  const normalized = stripAccents(value
    .trim())
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase()

  if (
    [
      "sempartido",
      "semfiliacaopartidaria",
      "semfiliacao",
      "naofiliado",
      "naofiliadopartido",
      "independente",
    ].includes(normalized)
  ) {
    return "SEM_PARTIDO"
  }

  if (
    [
      "historicoanteriornaodeterminado",
      "historicoanteriorindeterminado",
    ].includes(normalized)
  ) {
    return "HISTORICO_ANTERIOR_NAO_DETERMINADO"
  }

  return normalized
}

function normalizeHistoricalPartyGroupToken(value: string | null | undefined): string | null {
  const token = normalizePartyTimelineComparisonToken(value)
  if (!token) return null
  const normalized = stripAccents(token)
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase()
  return HISTORICAL_SAME_PARTY_INDEX.get(normalized) ?? normalized
}

function isInitialTimelineAnchorValue(value: string | null | undefined): boolean {
  const token = normalizePartyTimelineComparisonToken(value)
  return token === "SEM_PARTIDO" || token === "HISTORICO_ANTERIOR_NAO_DETERMINADO"
}

export function partyTimelineValuesEquivalent(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const normalizedLeft = normalizePartyTimelineComparisonToken(left)
  const normalizedRight = normalizePartyTimelineComparisonToken(right)
  return normalizedLeft != null && normalizedRight != null && normalizedLeft === normalizedRight
}

function partyTimelineHistoricallyEquivalent(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const normalizedLeft = normalizeHistoricalPartyGroupToken(left)
  const normalizedRight = normalizeHistoricalPartyGroupToken(right)
  return normalizedLeft != null && normalizedRight != null && normalizedLeft === normalizedRight
}

export function canonicalizePartyTimelineLabel(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null
  return resolveCanonicalParty(value)?.sigla ?? value.trim()
}

export function rankPartyTimelineConsistencyRow(
  row: Pick<PartyTimelineRowLike, "ano" | "data_mudanca">
): number {
  if (row.data_mudanca) {
    const parsed = Date.parse(row.data_mudanca)
    if (Number.isFinite(parsed)) return parsed
  }
  if (row.ano != null) {
    return Date.UTC(row.ano, 11, 31)
  }
  return 0
}

function extractTimelineYear(row: Pick<PartyTimelineRowLike, "ano" | "data_mudanca">): number | null {
  if (row.data_mudanca) {
    const parsed = new Date(row.data_mudanca)
    if (!Number.isNaN(parsed.getTime())) return parsed.getUTCFullYear()
  }

  return row.ano ?? null
}

function hasPreciseTimelineDate(row: Pick<PartyTimelineRowLike, "data_mudanca">): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(row.data_mudanca?.trim() ?? "")
}

function hasAmbiguousAdjacency(
  previousRow: Pick<PartyTimelineRowLike, "ano" | "data_mudanca"> | null | undefined,
  currentRow: Pick<PartyTimelineRowLike, "ano" | "data_mudanca">
): boolean {
  if (!previousRow) return false
  if (rankPartyTimelineConsistencyRow(previousRow) === rankPartyTimelineConsistencyRow(currentRow)) return true

  const previousYear = extractTimelineYear(previousRow)
  const currentYear = extractTimelineYear(currentRow)

  return (
    previousYear != null &&
    currentYear != null &&
    previousYear === currentYear &&
    (!hasPreciseTimelineDate(previousRow) || !hasPreciseTimelineDate(currentRow))
  )
}

function hasAmbiguousCompetingRow<Row extends PartyTimelineRowLike>(
  rows: readonly Row[],
  rowIndex: number
): boolean {
  const currentRow = rows[rowIndex]
  const currentYear = extractTimelineYear(currentRow)
  if (currentYear == null) return false

  return rows.some((candidateRow, candidateIndex) => {
    if (candidateIndex === rowIndex) return false

    const candidateYear = extractTimelineYear(candidateRow)
    if (candidateYear == null || candidateYear !== currentYear) return false

    return (
      rankPartyTimelineConsistencyRow(candidateRow) === rankPartyTimelineConsistencyRow(currentRow) ||
      !hasPreciseTimelineDate(candidateRow) ||
      !hasPreciseTimelineDate(currentRow)
    )
  })
}

export function isTseObservedPartyChangeContext(contexto: string | null | undefined): boolean {
  return stripAccents((contexto ?? ""))
    .toLowerCase()
    .includes("mudanca observada entre eleicoes tse")
}

function isCurrentPartyObservationContext(contexto: string | null | undefined): boolean {
  const normalized = stripAccents((contexto ?? ""))
    .toLowerCase()

  return (
    normalized.includes("filiacao atual observada") ||
    normalized.includes("partido atual curado") ||
    normalized.includes("partido atual verificado") ||
    normalized.includes("partido atual consolidado")
  )
}

function isStrongTimelineAnchorRow(
  row: Pick<PartyTimelineRowLike, "partido_anterior" | "data_mudanca" | "contexto">
): boolean {
  return (
    hasPreciseTimelineDate(row) ||
    isCurrentPartyObservationContext(row.contexto) ||
    (!!row.contexto && !isTseObservedPartyChangeContext(row.contexto)) ||
    isInitialTimelineAnchorValue(row.partido_anterior)
  )
}

export function findLatestKnownPartyBefore<Row extends PartyTimelineRowLike>(
  rows: readonly Row[],
  target: Pick<PartyTimelineRowLike, "id" | "ano" | "data_mudanca">
): string | null {
  const targetRank = rankPartyTimelineConsistencyRow(target)

  const previous = [...rows]
    .filter((row) => row.id !== target.id && rankPartyTimelineConsistencyRow(row) < targetRank)
    .sort((left, right) => rankPartyTimelineConsistencyRow(right) - rankPartyTimelineConsistencyRow(left))
    .find((row) => canonicalizePartyTimelineLabel(row.partido_novo))

  return previous ? canonicalizePartyTimelineLabel(previous.partido_novo) : null
}

function shouldAdoptImmediatePreviousPartyLegacy<Row extends PartyTimelineRowLike>(
  row: Row,
  normalizedRows: readonly NormalizedPartyTimelineRow<Row>[],
  partidoAnterior: string | null,
  partidoNovo: string | null
): boolean {
  const immediatePreviousParty = normalizedRows.at(-1)?.partido_novo ?? null
  if (!immediatePreviousParty || !partidoNovo) return false
  if (partyTimelineValuesEquivalent(immediatePreviousParty, partidoNovo)) return false
  if (partyTimelineValuesEquivalent(partidoAnterior, immediatePreviousParty)) return false

  const repeatedOlderParty =
    partidoAnterior != null &&
    normalizedRows.some((knownRow) =>
      partyTimelineValuesEquivalent(knownRow.partido_novo, partidoAnterior)
    )

  return isTseObservedPartyChangeContext(row.contexto) || repeatedOlderParty || !partidoAnterior
}

function suggestLegacyImmediatePreviousParty<Row extends PartyTimelineRowLike>(
  row: Row,
  normalizedRows: readonly NormalizedPartyTimelineRow<Row>[],
  partidoAnterior: string | null,
  partidoNovo: string | null
): string | null {
  if (
    !shouldAdoptImmediatePreviousPartyLegacy(row, normalizedRows, partidoAnterior, partidoNovo)
  ) {
    return null
  }

  return normalizedRows.at(-1)?.partido_novo ?? null
}

function isHistoricalRenameTransition(
  previousParty: string | null | undefined,
  nextParty: string | null | undefined
): boolean {
  return (
    !partyTimelineValuesEquivalent(previousParty, nextParty) &&
    partyTimelineHistoricallyEquivalent(previousParty, nextParty)
  )
}

function isAliasOnlyMutation<Row extends PartyTimelineRowLike>(
  currentRow: Row,
  nextRow: NormalizedPartyTimelineRow<Row>
): boolean {
  const fieldPairs: Array<
    [string | null | undefined, string | null | undefined]
  > = [
    [currentRow.partido_anterior, nextRow.partido_anterior],
    [currentRow.partido_novo, nextRow.partido_novo],
  ]

  return fieldPairs.every(
    ([currentValue, nextValue]) =>
      currentValue === nextValue || partyTimelineValuesEquivalent(currentValue, nextValue)
  )
}

function evaluateSafeRechain<Row extends PartyTimelineRowLike>(
  row: Row,
  rows: readonly Row[],
  rowIndex: number,
  normalizedRows: readonly NormalizedPartyTimelineRow<Row>[],
  hasPendingAmbiguousCluster: boolean,
  partidoAnterior: string | null,
  partidoNovo: string | null,
  legacySuggestedAnterior: string | null
): {
  suggestedAnterior: string | null
  allowed: boolean
  blockedReason: SafeRechainBlockReason | null
} {
  const previousRow = normalizedRows.at(-1) ?? null
  if (!previousRow || !legacySuggestedAnterior || !partidoNovo) {
    return {
      suggestedAnterior: null,
      allowed: false,
      blockedReason: null,
    }
  }

  if (partyTimelineHistoricallyEquivalent(legacySuggestedAnterior, partidoNovo)) {
    return {
      suggestedAnterior: legacySuggestedAnterior,
      allowed: false,
      blockedReason: "historical_previous_matches_current_new",
    }
  }

  if (partyTimelineHistoricallyEquivalent(legacySuggestedAnterior, partidoAnterior)) {
    return {
      suggestedAnterior: legacySuggestedAnterior,
      allowed: false,
      blockedReason: "historical_previous_matches_current_before",
    }
  }

  if (isHistoricalRenameTransition(partidoAnterior, partidoNovo)) {
    return {
      suggestedAnterior: legacySuggestedAnterior,
      allowed: false,
      blockedReason: "historical_current_transition",
    }
  }

  if (isHistoricalRenameTransition(previousRow.partido_anterior, previousRow.partido_novo)) {
    return {
      suggestedAnterior: legacySuggestedAnterior,
      allowed: false,
      blockedReason: "historical_previous_transition",
    }
  }

  if (
    isCurrentPartyObservationContext(row.contexto) ||
    isCurrentPartyObservationContext(previousRow.contexto)
  ) {
    return {
      suggestedAnterior: legacySuggestedAnterior,
      allowed: false,
      blockedReason: "current_anchor_context",
    }
  }

  if (hasAmbiguousAdjacency(previousRow, row)) {
    return {
      suggestedAnterior: legacySuggestedAnterior,
      allowed: false,
      blockedReason: "ambiguous_chronology",
    }
  }

  if (hasAmbiguousCompetingRow(rows, rowIndex)) {
    return {
      suggestedAnterior: legacySuggestedAnterior,
      allowed: false,
      blockedReason: "ambiguous_chronology",
    }
  }

  if (hasPendingAmbiguousCluster) {
    return {
      suggestedAnterior: legacySuggestedAnterior,
      allowed: false,
      blockedReason: "ambiguous_prior_cluster",
    }
  }

  return {
    suggestedAnterior: legacySuggestedAnterior,
    allowed: true,
    blockedReason: "safe_rechain",
  }
}

function classifyBlockedLegacySuggestion(
  blockedReason: SafeRechainBlockReason | null
): PartyTimelineChangeCategory {
  if (
    blockedReason === "historical_previous_matches_current_new" ||
    blockedReason === "historical_previous_matches_current_before" ||
    blockedReason === "historical_current_transition" ||
    blockedReason === "historical_previous_transition"
  ) {
    return "renomeacao_historica_mesmo_partido"
  }

  return "suspeito_precisa_revisao"
}

export function analyzePartyTimelineRows<Row extends PartyTimelineRowLike>(
  rows: readonly Row[]
): PartyTimelineRowDecision<Row>[] {
  const sorted = [...rows].sort((left, right) => {
    const rankDiff = rankPartyTimelineConsistencyRow(left) - rankPartyTimelineConsistencyRow(right)
    if (rankDiff !== 0) return rankDiff
    return left.id.localeCompare(right.id)
  })

  const decisions: PartyTimelineRowDecision<Row>[] = []
  const safeNormalizedRows: NormalizedPartyTimelineRow<Row>[] = []
  const legacyNormalizedRows: NormalizedPartyTimelineRow<Row>[] = []
  let hasPendingAmbiguousCluster = false

  for (const [rowIndex, row] of sorted.entries()) {
    const aliasNormalizedRow: NormalizedPartyTimelineRow<Row> = {
      ...row,
      partido_anterior: canonicalizePartyTimelineLabel(row.partido_anterior),
      partido_novo: canonicalizePartyTimelineLabel(row.partido_novo),
    }

    const legacySuggestedAnterior = suggestLegacyImmediatePreviousParty(
      row,
      legacyNormalizedRows,
      aliasNormalizedRow.partido_anterior,
      aliasNormalizedRow.partido_novo
    )

    const legacyNormalizedRow: NormalizedPartyTimelineRow<Row> = {
      ...aliasNormalizedRow,
      partido_anterior: legacySuggestedAnterior ?? aliasNormalizedRow.partido_anterior,
    }

    const safeRechain = evaluateSafeRechain(
      row,
      sorted,
      rowIndex,
      safeNormalizedRows,
      hasPendingAmbiguousCluster,
      aliasNormalizedRow.partido_anterior,
      aliasNormalizedRow.partido_novo,
      legacySuggestedAnterior
    )

    const safeNormalizedRow: NormalizedPartyTimelineRow<Row> = {
      ...aliasNormalizedRow,
      partido_anterior:
        safeRechain.allowed && safeRechain.suggestedAnterior
          ? safeRechain.suggestedAnterior
          : aliasNormalizedRow.partido_anterior,
    }

    let category: PartyTimelineChangeCategory | null = null
    let autoApply = false
    let applyKind: PartyTimelineSafeApplyKind | null = null
    let reason: string | null = null

    const safeChanged =
      row.partido_anterior !== safeNormalizedRow.partido_anterior ||
      row.partido_novo !== safeNormalizedRow.partido_novo

    const legacyChanged =
      row.partido_anterior !== legacyNormalizedRow.partido_anterior ||
      row.partido_novo !== legacyNormalizedRow.partido_novo

    if (safeChanged) {
      if (isAliasOnlyMutation(row, safeNormalizedRow)) {
        category = "alias_seguro"
        autoApply = true
        applyKind = "alias"
        reason = "canonical_label"
      } else {
        category = "reencadeamento_real"
        autoApply = true
        applyKind = "rechain"
        reason = safeRechain.blockedReason ?? "safe_rechain"
      }
    } else if (legacyChanged) {
      category = classifyBlockedLegacySuggestion(safeRechain.blockedReason)
      reason = safeRechain.blockedReason ?? "legacy_rechain_blocked"
    }

    decisions.push({
      row,
      normalized: safeNormalizedRow,
      legacyNormalized: legacyNormalizedRow,
      category,
      autoApply,
      applyKind,
      reason,
    })

    safeNormalizedRows.push(safeNormalizedRow)
    legacyNormalizedRows.push(legacyNormalizedRow)

    const localPreviousRow = rowIndex > 0 ? sorted[rowIndex - 1] : null
    const rowHasLocalAmbiguity =
      hasAmbiguousAdjacency(localPreviousRow, row) || hasAmbiguousCompetingRow(sorted, rowIndex)

    if (rowHasLocalAmbiguity) {
      hasPendingAmbiguousCluster = true
    } else if (isStrongTimelineAnchorRow(row)) {
      hasPendingAmbiguousCluster = false
    }
  }

  return decisions
}

export function normalizePartyTimelineRows<Row extends PartyTimelineRowLike>(
  rows: readonly Row[]
): NormalizedPartyTimelineRow<Row>[] {
  return analyzePartyTimelineRows(rows).map((decision) => decision.normalized)
}

export function deriveConsistentPartyTimelineRow<Row extends PartyTimelineRowLike>(
  row: Row,
  knownRows: readonly Row[]
) {
  const normalizedRow = normalizePartyTimelineRows([...knownRows, row]).find(
    (candidateRow) => candidateRow.id === row.id
  )

  const partidoNovo = normalizedRow?.partido_novo ?? canonicalizePartyTimelineLabel(row.partido_novo)
  let partidoAnterior =
    normalizedRow?.partido_anterior ?? canonicalizePartyTimelineLabel(row.partido_anterior)

  if (isTseObservedPartyChangeContext(row.contexto)) {
    const latestKnownParty = findLatestKnownPartyBefore(knownRows, row)
    if (
      latestKnownParty &&
      partidoNovo &&
      !canonicalPartiesEquivalent(latestKnownParty, partidoNovo) &&
      (!partidoAnterior || !partyTimelineValuesEquivalent(partidoAnterior, latestKnownParty))
    ) {
      partidoAnterior = latestKnownParty
    }
  }

  return {
    partido_anterior: partidoAnterior,
    partido_novo: partidoNovo,
  }
}

export interface TsePartyObservation {
  ano: number
  partido: string
  match_method: ResolveMethod
  historico_visivel: boolean
}

export interface TseObservedPartyChange {
  ano: number
  partido_anterior: string
  partido_novo: string
  contexto: string
}

export interface TsePartyConflict {
  ano: number
  partidos: string[]
}

export function canReconcileTseObservedPartyChanges(
  failedYears: readonly number[],
  conflicts: readonly TsePartyConflict[],
): boolean {
  return failedYears.length === 0 && conflicts.length === 0
}

export function deriveTseObservedPartyChanges(
  observations: readonly TsePartyObservation[],
  curatedRows: readonly PartyTimelineRowLike[],
): { mudancas: TseObservedPartyChange[]; conflitos: TsePartyConflict[] } {
  const strongVisible = observations.filter(
    (item) =>
      item.historico_visivel &&
      (item.match_method === "cpf" || item.match_method === "sq-preloaded") &&
      canonicalizePartyTimelineLabel(item.partido) != null,
  )

  const partiesByYear = new Map<number, Map<string, string>>()
  for (const item of strongVisible) {
    const canonical = canonicalizePartyTimelineLabel(item.partido)
    if (!canonical) continue
    const parties = partiesByYear.get(item.ano) ?? new Map<string, string>()
    const token = normalizeHistoricalPartyGroupToken(canonical) ?? canonical
    parties.set(token, canonical)
    partiesByYear.set(item.ano, parties)
  }

  const conflitos: TsePartyConflict[] = []
  const orderedObservations: Array<{ ano: number; partido: string }> = []
  for (const [ano, parties] of [...partiesByYear.entries()].sort((a, b) => a[0] - b[0])) {
    const labels = [...parties.values()].sort((a, b) => a.localeCompare(b))
    if (labels.length > 1) {
      conflitos.push({ ano, partidos: labels })
      continue
    }
    if (labels[0]) orderedObservations.push({ ano, partido: labels[0] })
  }

  if (conflitos.length > 0) return { mudancas: [], conflitos }

  const curated = curatedRows.filter((row) => !isTseObservedPartyChangeContext(row.contexto))
  const knownRows: PartyTimelineRowLike[] = [...curated]
  const mudancas: TseObservedPartyChange[] = []
  let previousParty: string | null = null

  for (const item of orderedObservations) {
    if (previousParty == null) {
      previousParty = item.partido
      continue
    }
    if (partyTimelineValuesEquivalent(previousParty, item.partido)) {
      previousParty = item.partido
      continue
    }

    const curatedDestinationExists = curated.some(
      (row) =>
        row.ano === item.ano &&
        partyTimelineValuesEquivalent(row.partido_novo, item.partido),
    )
    if (curatedDestinationExists) {
      previousParty = item.partido
      continue
    }

    const contexto = `Mudança observada entre eleições TSE (${item.ano})`
    const target: PartyTimelineRowLike = {
      id: `observed-${item.ano}-${item.partido}`,
      partido_anterior: previousParty,
      partido_novo: item.partido,
      ano: item.ano,
      data_mudanca: null,
      contexto,
    }
    const inferred = deriveConsistentPartyTimelineRow(target, knownRows)
    if (
      inferred.partido_anterior &&
      inferred.partido_novo &&
      !partyTimelineValuesEquivalent(inferred.partido_anterior, inferred.partido_novo)
    ) {
      const derived = {
        ano: item.ano,
        partido_anterior: inferred.partido_anterior,
        partido_novo: inferred.partido_novo,
        contexto,
      }
      mudancas.push(derived)
      knownRows.push({ ...target, ...derived })
    }
    previousParty = item.partido
  }

  return { mudancas, conflitos }
}

export function planTseObservedPartyChangeReconciliation(
  existingRows: readonly PartyTimelineRowLike[],
  desiredRows: readonly TseObservedPartyChange[],
): {
  deleteIds: string[]
  updates: Array<{ id: string; values: TseObservedPartyChange }>
  inserts: TseObservedPartyChange[]
} {
  const desiredByKey = new Map<string, TseObservedPartyChange>()
  for (const row of desiredRows) {
    desiredByKey.set(`${row.ano}|${canonicalizePartyTimelineLabel(row.partido_novo)}`, row)
  }

  const matched = new Set<string>()
  const deleteIds: string[] = []
  const updates: Array<{ id: string; values: TseObservedPartyChange }> = []

  const derivedRows = existingRows
    .filter(
      (row) =>
        row.despublicado_em == null && isTseObservedPartyChangeContext(row.contexto),
    )
    .sort((a, b) => a.id.localeCompare(b.id))

  for (const row of derivedRows) {
    const key = `${row.ano}|${canonicalizePartyTimelineLabel(row.partido_novo)}`
    const desired = desiredByKey.get(key)
    if (!desired || matched.has(key)) {
      deleteIds.push(row.id)
      continue
    }
    matched.add(key)

    if (
      !partyTimelineValuesEquivalent(row.partido_anterior, desired.partido_anterior) ||
      !partyTimelineValuesEquivalent(row.partido_novo, desired.partido_novo) ||
      row.contexto !== desired.contexto
    ) {
      updates.push({ id: row.id, values: desired })
    }
  }

  const inserts = [...desiredByKey.entries()]
    .filter(([key]) => !matched.has(key))
    .map(([, row]) => row)

  return { deleteIds, updates, inserts }
}
