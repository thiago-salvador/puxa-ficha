/**
 * Passo §15.6 — após writes curados em `mudancas_partido`, decidir se o rechainer corre no mesmo `applyFix`.
 * Extraído para um módulo único usado por `apply-current-factual-fixes` e pelo smoke de integração em CI.
 */

import {
  shouldSkipPartyTimelineRechainAfterCuratedTimelineWrites,
  type PartyTimelineRechainGuardFix,
} from "./apply-factual-party-timeline-order"
import { fixCandidatePartyTimelineConsistency } from "../fix-party-timeline-consistency"
import type { PartyTimelineUpdate } from "../fix-party-timeline-consistency"

export async function runAfterCuratedPartyTimelineWrites(
  candidatoId: string,
  fix: PartyTimelineRechainGuardFix,
): Promise<{ skipRechain: boolean; repairedTimeline: PartyTimelineUpdate[] }> {
  const skipRechain = shouldSkipPartyTimelineRechainAfterCuratedTimelineWrites(fix)
  const repairedTimeline = skipRechain ? [] : await fixCandidatePartyTimelineConsistency(candidatoId, true)
  return { skipRechain, repairedTimeline }
}
