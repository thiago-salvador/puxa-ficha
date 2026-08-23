import type { MudancaPartido } from "@/lib/types"
import {
  formatPartyDisplayLabel,
  partiesEquivalent,
  partiesHistoricallyEquivalent,
  resolveCanonicalPartySigla,
} from "@/lib/party-utils"
import { stripAccents } from "@/lib/strip-accents"

function normalizePartyToken(value: string | null | undefined) {
  if (!value) return null

  return stripAccents(value)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
}

/** Token de âncora inicial ou de lacuna honesta na timeline partidária (ver spec §6 — continuidade). */
export function isInitialPartyAnchorToken(value: string | null | undefined) {
  const normalized = normalizePartyToken(value)
  return (
    normalized != null &&
    [
      "sempartido",
      "semfiliacaopartidaria",
      "semfiliacao",
      "naofiliado",
      "naofiliadopartido",
      "independente",
      "historicoanteriornaodeterminado",
      "historicoanteriorindeterminado",
    ].includes(normalized)
  )
}

function isObservedCurrentPartyAnchor(
  item: Pick<MudancaPartido, "contexto"> | null | undefined,
) {
  return (
    item?.contexto != null &&
    stripAccents(item.contexto)
      .toLowerCase()
      .includes("filiacao atual observada")
  )
}

function isTseObservedPartyChangeContext(contexto: string | null | undefined) {
  return (
    contexto != null &&
    stripAccents(contexto)
      .toLowerCase()
      .includes("mudanca observada entre eleicoes tse")
  )
}

function isWikidataPartyContext(contexto: string | null | undefined) {
  return (
    contexto != null &&
    stripAccents(contexto)
      .toLowerCase()
      .includes("wikidata p102")
  )
}

function isCurrentPartyObservationContext(contexto: string | null | undefined) {
  return (
    contexto != null &&
    stripAccents(contexto)
      .toLowerCase()
      .includes("filiacao atual observada")
  ) || (
    contexto != null &&
    stripAccents(contexto)
      .toLowerCase()
      .includes("partido atual")
  )
}

function isStrongTimelineAnchor(item: Pick<MudancaPartido, "partido_anterior" | "data_mudanca" | "contexto">) {
  return (
    hasPreciseTimelineDate(item) ||
    isCurrentPartyObservationContext(item.contexto) ||
    (!!item.contexto && !isTseObservedPartyChangeContext(item.contexto)) ||
    isInitialPartyAnchorToken(item.partido_anterior)
  )
}

function isInitialPartyAnchor(item: MudancaPartido, index: number) {
  return index === 0 && isInitialPartyAnchorToken(item.partido_anterior) && !!item.partido_novo
}

/** Anchor row regardless of position (semantic check). */
function isAnchorRow(item: MudancaPartido) {
  return isInitialPartyAnchorToken(item.partido_anterior) && !!item.partido_novo
}

function isSamePartyTransition(item: Pick<MudancaPartido, "partido_anterior" | "partido_novo">) {
  const previous = normalizePartyToken(item.partido_anterior)
  const next = normalizePartyToken(item.partido_novo)
  return previous != null && next != null && previous === next
}

function getTimelineDisplayYear(item: Pick<MudancaPartido, "ano" | "data_mudanca">) {
  if (item.data_mudanca) {
    const parsed = new Date(item.data_mudanca)
    if (!Number.isNaN(parsed.getTime())) return parsed.getUTCFullYear()
  }
  return item.ano ?? null
}

export function formatPartyTransitionLabel(
  item: Pick<MudancaPartido, "partido_anterior" | "partido_novo" | "ano" | "data_mudanca">,
) {
  const year = getTimelineDisplayYear(item)
  const previous = formatPartyDisplayLabel(item.partido_anterior, { year })
  const next = formatPartyDisplayLabel(item.partido_novo, { year })

  if (isInitialPartyAnchorToken(item.partido_anterior)) {
    return `Partido confirmado: ${next}`
  }

  if (isSamePartyTransition(item) || normalizePartyToken(previous) === normalizePartyToken(next)) {
    return `Filiação: ${next}`
  }

  if (isHistoricalRenameTransition(item.partido_anterior, item.partido_novo)) {
    return `${previous} → ${next} (renomeação)`
  }

  return `${previous} → ${next}`
}

function canonicalizePartyTimelineValue(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null
  return resolveCanonicalPartySigla(value) ?? value.trim()
}

/**
 * Diz se dois rótulos de partido “encaixam” na cadeia temporal (sigla canónica + grupos históricos),
 * espelhando a mesma semântica usada em `normalizePartyTimelineForDisplay` para rechaining.
 */
export function partiesMatchForTimeline(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const leftCanonical = canonicalizePartyTimelineValue(left)
  const rightCanonical = canonicalizePartyTimelineValue(right)

  if (!leftCanonical && !rightCanonical) return true
  if (!leftCanonical || !rightCanonical) return false

  return partiesHistoricallyEquivalent(leftCanonical, rightCanonical)
}

/** Ordenação cronológica crescente (mais antigo primeiro) para rows de `mudancas_partido`. */
export function rankPartyTimelineRow(item: Pick<MudancaPartido, "ano" | "data_mudanca">) {
  if (item.data_mudanca) {
    const parsed = Date.parse(item.data_mudanca)
    if (Number.isFinite(parsed)) return parsed
  }

  if (item.ano != null) {
    return Date.UTC(item.ano, 11, 31)
  }

  return 0
}

function hasPreciseTimelineDate(item: Pick<MudancaPartido, "data_mudanca">) {
  return /^\d{4}-\d{2}-\d{2}$/.test(item.data_mudanca?.trim() ?? "")
}

function extractTimelineYear(item: Pick<MudancaPartido, "ano" | "data_mudanca">) {
  return getTimelineDisplayYear(item)
}

function hasAmbiguousAdjacency(
  previousItem: Pick<MudancaPartido, "ano" | "data_mudanca"> | null | undefined,
  currentItem: Pick<MudancaPartido, "ano" | "data_mudanca">,
) {
  if (!previousItem) return false
  if (rankPartyTimelineRow(previousItem) === rankPartyTimelineRow(currentItem)) return true

  const previousYear = extractTimelineYear(previousItem)
  const currentYear = extractTimelineYear(currentItem)

  return (
    previousYear != null &&
    currentYear != null &&
    previousYear === currentYear &&
    (!hasPreciseTimelineDate(previousItem) || !hasPreciseTimelineDate(currentItem))
  )
}

function hasAmbiguousCompetingRow(
  items: readonly Pick<MudancaPartido, "ano" | "data_mudanca">[],
  itemIndex: number,
) {
  const currentItem = items[itemIndex]
  const currentYear = extractTimelineYear(currentItem)
  if (currentYear == null) return false

  return items.some((candidateItem, candidateIndex) => {
    if (candidateIndex === itemIndex) return false

    const candidateYear = extractTimelineYear(candidateItem)
    if (candidateYear == null || candidateYear !== currentYear) return false

    return (
      rankPartyTimelineRow(candidateItem) === rankPartyTimelineRow(currentItem) ||
      !hasPreciseTimelineDate(candidateItem) ||
      !hasPreciseTimelineDate(currentItem)
    )
  })
}

function isHistoricalRenameTransition(
  previousParty: string | null | undefined,
  nextParty: string | null | undefined,
) {
  return (
    !partiesEquivalent(previousParty, nextParty) &&
    partiesHistoricallyEquivalent(previousParty, nextParty)
  )
}

function isEffectiveNonSwitchTimelineRow(
  item: Pick<MudancaPartido, "partido_anterior" | "partido_novo">,
) {
  return (
    isSamePartyTransition(item) ||
    partiesHistoricallyEquivalent(item.partido_anterior, item.partido_novo)
  )
}

function transitionsMatchForDisplay(
  left: Pick<MudancaPartido, "partido_anterior" | "partido_novo">,
  right: Pick<MudancaPartido, "partido_anterior" | "partido_novo">,
) {
  return (
    partiesMatchForTimeline(left.partido_anterior, right.partido_anterior) &&
    partiesMatchForTimeline(left.partido_novo, right.partido_novo)
  )
}

function rankPartyTimelineRowPreference(
  item: Pick<MudancaPartido, "ano" | "data_mudanca" | "contexto">,
) {
  return [
    isWikidataPartyContext(item.contexto) ? 0 : 1,
    isTseObservedPartyChangeContext(item.contexto) || isCurrentPartyObservationContext(item.contexto) ? 0 : 1,
    item.contexto?.trim() ? 1 : 0,
    hasPreciseTimelineDate(item) ? 1 : 0,
    -rankPartyTimelineRow(item),
  ]
}

function preferDisplayTimelineRow(
  current: MudancaPartido,
  candidate: MudancaPartido,
) {
  const currentPreference = rankPartyTimelineRowPreference(current)
  const candidatePreference = rankPartyTimelineRowPreference(candidate)

  for (let index = 0; index < currentPreference.length; index += 1) {
    if (candidatePreference[index] === currentPreference[index]) continue
    return candidatePreference[index] > currentPreference[index] ? candidate : current
  }

  return current
}

function collapseEquivalentTimelineRows(items: readonly MudancaPartido[]) {
  const collapsed: MudancaPartido[] = []

  for (const item of items) {
    const previous = collapsed.at(-1)

    if (previous && transitionsMatchForDisplay(previous, item)) {
      collapsed[collapsed.length - 1] = preferDisplayTimelineRow(previous, item)
      continue
    }

    collapsed.push(item)
  }

  return collapsed
}

function isRedundantObservedTimelineRow(
  previous: MudancaPartido | undefined,
  item: MudancaPartido,
  priorRows: readonly MudancaPartido[],
) {
  if (!previous) return false
  if (!isTseObservedPartyChangeContext(item.contexto) && !isCurrentPartyObservationContext(item.contexto)) {
    return false
  }
  if (!partiesMatchForTimeline(previous.partido_novo, item.partido_novo)) return false

  return priorRows.some((row) =>
    partiesMatchForTimeline(row.partido_novo, item.partido_anterior) ||
    partiesMatchForTimeline(row.partido_anterior, item.partido_anterior)
  )
}

function collapseRedundantObservedTimelineRows(items: readonly MudancaPartido[]) {
  const collapsed: MudancaPartido[] = []

  for (const item of items) {
    const previous = collapsed.at(-1)

    if (isRedundantObservedTimelineRow(previous, item, collapsed.slice(0, -1))) {
      continue
    }

    collapsed.push(item)
  }

  return collapsed
}

/**
 * Corrige incoerências comuns na timeline para exibição pública:
 * - canoniza siglas conhecidas;
 * - corrige rows TSE cujo `partido_anterior` ficou desatualizado;
 * - reencadeia uma row curada posterior quando ela repete um partido antigo
 *   apesar de haver uma mudança intermediária observada depois.
 */
export function normalizePartyTimelineForDisplay(mudancas: readonly MudancaPartido[]): MudancaPartido[] {
  const ordered = [...mudancas].sort(
    (a, b) =>
      rankPartyTimelineRow(a) - rankPartyTimelineRow(b) ||
      (a.id ?? "").localeCompare(b.id ?? "")
  )
  const canonicalized = ordered.map((item) => ({
    ...item,
    partido_anterior: canonicalizePartyTimelineValue(item.partido_anterior) ?? item.partido_anterior,
    partido_novo: canonicalizePartyTimelineValue(item.partido_novo) ?? item.partido_novo,
  }))
  const collapsed = collapseRedundantObservedTimelineRows(
    collapseEquivalentTimelineRows(canonicalized)
  )
  const normalized: MudancaPartido[] = []
  let hasPendingAmbiguousCluster = false

  for (const [itemIndex, item] of collapsed.entries()) {
    const canonicalNovo = item.partido_novo
    let canonicalAnterior = item.partido_anterior

    const immediatePrevious = normalized.at(-1) ?? null
    const immediatePreviousParty = immediatePrevious?.partido_novo ?? null
    const repeatedOlderParty =
      canonicalAnterior != null &&
      normalized.slice(0, -1).some((row) => partiesEquivalent(row.partido_novo, canonicalAnterior))

    const shouldAttemptRechain =
      immediatePreviousParty &&
      canonicalNovo &&
      !partiesHistoricallyEquivalent(immediatePreviousParty, canonicalNovo) &&
      !partiesHistoricallyEquivalent(canonicalAnterior, immediatePreviousParty) &&
      !isHistoricalRenameTransition(immediatePrevious?.partido_anterior, immediatePrevious?.partido_novo) &&
      !isHistoricalRenameTransition(canonicalAnterior, canonicalNovo) &&
      !isCurrentPartyObservationContext(item.contexto) &&
      !isCurrentPartyObservationContext(immediatePrevious?.contexto) &&
      !hasAmbiguousAdjacency(immediatePrevious, item) &&
      !hasAmbiguousCompetingRow(collapsed, itemIndex) &&
      !hasPendingAmbiguousCluster &&
      (isTseObservedPartyChangeContext(item.contexto) || repeatedOlderParty || !canonicalAnterior)

    if (
      shouldAttemptRechain
    ) {
      canonicalAnterior = immediatePreviousParty
    }

    normalized.push({
      ...item,
      partido_anterior: canonicalAnterior ?? item.partido_anterior,
      partido_novo: canonicalNovo ?? item.partido_novo,
    })

    const localPreviousItem = itemIndex > 0 ? collapsed[itemIndex - 1] : null
    const itemHasLocalAmbiguity =
      hasAmbiguousAdjacency(localPreviousItem, item) ||
      hasAmbiguousCompetingRow(collapsed, itemIndex)

    if (itemHasLocalAmbiguity) {
      hasPendingAmbiguousCluster = true
    } else if (isStrongTimelineAnchor(item)) {
      hasPendingAmbiguousCluster = false
    }
  }

  return normalized
    .filter((item) => !isSamePartyTransition(item))
    .sort((a, b) => rankPartyTimelineRow(a) - rankPartyTimelineRow(b))
}

/**
 * Número de trocas efetivas de partido.
 * Exclui no maximo uma row de ancora (partido_anterior e token de filiacao inicial).
 * Usar `data_mudanca` como tiebreaker garante estabilidade quando varias rows tem o mesmo `ano`.
 */
export function countPartySwitches(mudancas: readonly MudancaPartido[]) {
  const sorted = normalizePartyTimelineForDisplay(mudancas)
  let excludedAnchor = false
  let count = 0
  for (const item of sorted) {
    if (!excludedAnchor && isAnchorRow(item)) {
      excludedAnchor = true
      continue
    }
    if (isEffectiveNonSwitchTimelineRow(item)) {
      continue
    }
    count++
  }
  return count
}

/**
 * Detecta o padrão A→B e B→A no MESMO ano em `mudancas_partido`.
 *
 * Sem datas, esse padrão é indistinguível de erro de ingestão (mistura de
 * homônimos, ordem incorreta de filiações TSE) e continua bloqueando.
 *
 * EXCEÇÃO (caso Pablo Marçal, 2026): ida e volta reais no mesmo ano
 * acontecem, e quando AMBAS as linhas carregam `data_mudanca` distintas a
 * ordem dos fatos está documentada e não há contradição estrutural. O par
 * datado não bloqueia; a régua segue dura para linhas sem data.
 *
 * Usado como gate da Fase 0 para bloquear a renderização da seção de
 * trocas de partido quando há contradição estrutural na cadeia.
 */
export function hasSameYearPartyReversal(
  mudancas: readonly Pick<
    MudancaPartido,
    "ano" | "partido_anterior" | "partido_novo" | "data_mudanca"
  >[],
): boolean {
  const byYear = new Map<
    number,
    Array<Pick<MudancaPartido, "ano" | "partido_anterior" | "partido_novo" | "data_mudanca">>
  >()
  for (const item of mudancas) {
    if (typeof item.ano !== "number") continue
    const list = byYear.get(item.ano) ?? []
    list.push(item)
    byYear.set(item.ano, list)
  }

  for (const list of byYear.values()) {
    if (list.length < 2) continue
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!
        const b = list[j]!
        if (!a.partido_anterior || !a.partido_novo) continue
        if (!b.partido_anterior || !b.partido_novo) continue
        // Skip same-party noops on either row.
        if (partiesEquivalent(a.partido_anterior, a.partido_novo)) continue
        if (partiesEquivalent(b.partido_anterior, b.partido_novo)) continue
        // Skip historical renames inside a single canonical group (PFL↔DEM,
        // PMDB↔MDB, etc). They are noise, not a real reversal.
        if (partiesHistoricallyEquivalent(a.partido_anterior, a.partido_novo)) continue
        if (partiesHistoricallyEquivalent(b.partido_anterior, b.partido_novo)) continue
        if (
          partiesEquivalent(a.partido_anterior, b.partido_novo) &&
          partiesEquivalent(a.partido_novo, b.partido_anterior)
        ) {
          // Par datado dos dois lados com datas distintas: a ordem da ida e
          // da volta está documentada, então não é contradição estrutural.
          if (a.data_mudanca && b.data_mudanca && a.data_mudanca !== b.data_mudanca) {
            continue
          }
          return true
        }
      }
    }
  }

  return false
}

export function buildPartyJourney(
  mudancas: readonly MudancaPartido[],
  partidoSigla: string | null | undefined,
) {
  if (mudancas.length === 0) return "Sem mudancas"

  const ordered = normalizePartyTimelineForDisplay(mudancas)
  const chain: string[] = []
  const firstAnchor = ordered.find((item, index) => isInitialPartyAnchor(item, index)) ?? null
  const switchCount = countPartySwitches(ordered)

  for (const [index, item] of ordered.entries()) {
    const isAnchor = isInitialPartyAnchor(item, index)
    const year = getTimelineDisplayYear(item)
    const previousLabel = formatPartyDisplayLabel(item.partido_anterior, { year })
    const nextLabel = formatPartyDisplayLabel(item.partido_novo, { year })

    if (chain.length === 0 && item.partido_anterior && !isAnchor) {
      chain.push(previousLabel)
    }

    if (
      item.partido_novo &&
      normalizePartyToken(chain.at(-1)) !== normalizePartyToken(nextLabel)
    ) {
      chain.push(nextLabel)
    }
  }

  if (partidoSigla && normalizePartyToken(chain.at(-1)) !== normalizePartyToken(partidoSigla)) {
    chain.push(formatPartyDisplayLabel(partidoSigla))
  }

  if (
    switchCount === 0 &&
    chain.length === 1 &&
    firstAnchor?.ano &&
    !isObservedCurrentPartyAnchor(firstAnchor)
  ) {
    return `${chain[0]} desde ${firstAnchor.ano}`
  }

  return chain.join(" → ")
}
