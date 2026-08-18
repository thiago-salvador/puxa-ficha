import type { MudancaPartido } from "@/lib/types"
import {
  isInitialPartyAnchorToken,
  normalizePartyTimelineForDisplay,
  partiesMatchForTimeline,
  rankPartyTimelineRow,
} from "@/lib/party-switches"

export interface PartyTimelineContinuityBrokenLink {
  /** Índice da row “destino” na ordem cronológica crescente (a segunda transição da dupla). */
  indexTo: number
  from: Pick<MudancaPartido, "partido_anterior" | "partido_novo" | "ano" | "data_mudanca" | "id">
  to: Pick<MudancaPartido, "partido_anterior" | "partido_novo" | "ano" | "data_mudanca" | "id">
  message: string
}

export interface PartyTimelineContinuityReport {
  /** Sem quebras detectáveis após aplicar exceções documentadas. */
  ok: boolean
  orderedLength: number
  brokenLinks: PartyTimelineContinuityBrokenLink[]
  /** Quantas adjacências foram ignoradas por nota explícita de lacuna/ambiguidade no `contexto`. */
  skippedDueToGapNote: number
}

/**
 * `contexto` ou observação editorial que marca lacuna/ambiguidade explícita — não forçar
 * encadeamento automático nem tratar como erro de continuidade (ver spec §6 — continuidade).
 */
export function hasExplicitPartyTimelineGapNote(contexto: string | null | undefined): boolean {
  if (contexto == null || !contexto.trim()) return false
  const u = contexto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  const needles = [
    "lacuna",
    "incompleto",
    "incompletude",
    "ambiguo",
    "incerto",
    "indeterminad",
    "sem fonte primaria",
    "em curadoria",
    "pendente de curadoria",
    "nao foi possivel corrigir",
    "sessao so cons",
    "nao encadeado",
    "gap document",
    "timeline incompleta",
  ]
  return needles.some((n) => u.includes(n))
}

/**
 * Valida a **continuidade narrativa** da timeline partidária **após** o mesmo pipeline público
 * (`normalizePartyTimelineForDisplay`) usado na ficha. Não grava no DB nem altera rows.
 *
 * Regra: ordenando do mais antigo ao mais recente, cada transição `prev` (`A→B`) deve ser seguida
 * por uma transição cuja `partido_anterior` encaixa em `B` via `partiesMatchForTimeline`
 * (sigla canónica + grupos históricos já aceites no produto).
 *
 * Exceções (não contam como quebra):
 * - `partido_anterior` da row seguinte é token de âncora (`Sem partido`, `Historico anterior nao determinado`, …);
 * - `contexto` de qualquer uma das duas rows marca lacuna/ambiguidade explícita
 *   (`hasExplicitPartyTimelineGapNote`);
 * - convergência duplicada ao mesmo `partido_novo` **só** se a row `from` parte de token de âncora
 *   em `partido_anterior` (ver bloco dedicado no loop).
 */
export function analyzePartyTimelineContinuity(
  mudancas: readonly MudancaPartido[],
): PartyTimelineContinuityReport {
  const normalized = normalizePartyTimelineForDisplay(mudancas)
  const ordered = [...normalized].sort(
    (a, b) =>
      rankPartyTimelineRow(a) - rankPartyTimelineRow(b) || (a.id ?? "").localeCompare(b.id ?? ""),
  )

  const brokenLinks: PartyTimelineContinuityBrokenLink[] = []
  let skippedDueToGapNote = 0

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const from = ordered[i]!
    const to = ordered[i + 1]!

    if (hasExplicitPartyTimelineGapNote(from.contexto) || hasExplicitPartyTimelineGapNote(to.contexto)) {
      skippedDueToGapNote += 1
      continue
    }

    if (isInitialPartyAnchorToken(to.partido_anterior)) {
      continue
    }

    if (partiesMatchForTimeline(from.partido_novo, to.partido_anterior)) {
      continue
    }

    /**
     * Convergência editorial/TSE ao mesmo `partido_novo` **só** quando a primeira row da
     * adjacência parte de **token de âncora** (`Sem partido`, `Historico anterior nao determinado`, …).
     * Ex.: `Sem partido`→PSDB seguido de PDT→PSDB (caso `ciro-gomes`). Não aplicar a
     * X→B / Y→B com X e Y partidos reais distintos — isso continua a ser quebra (falso negativo
     * se ignorássemos só por B igual).
     */
    if (
      isInitialPartyAnchorToken(from.partido_anterior) &&
      partiesMatchForTimeline(from.partido_novo, to.partido_novo) &&
      !partiesMatchForTimeline(from.partido_novo, to.partido_anterior)
    ) {
      continue
    }

    brokenLinks.push({
      indexTo: i + 1,
      from,
      to,
      message: `Quebra de continuidade: fim da transição anterior (${from.partido_novo ?? "null"}) não encaixa no início da seguinte (${to.partido_anterior ?? "null"}).`,
    })
  }

  return {
    ok: brokenLinks.length === 0,
    orderedLength: ordered.length,
    brokenLinks,
    skippedDueToGapNote,
  }
}
