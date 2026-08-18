/**
 * Invariante §15.6 — ordem segura entre `ensureTimelineRows` / `ensureCurrentPartyTimeline`
 * e `fixCandidatePartyTimelineConsistency` no apply de curadoria.
 *
 * O rechainer pode reescrever `partido_anterior` de linhas recém inseridas pelo bloco
 * curado (`joao-rodrigues`, 2026-04-14). Quando este apply já escreveu timeline
 * explícita no mesmo passo, **não** voltar a rechainer automaticamente.
 */

export type PartyTimelineRechainGuardFix = {
  ensureTimelineRows?: readonly unknown[] | undefined
  ensureCurrentPartyTimeline?: boolean | undefined
}

/**
 * Quando `true`, `apply-current-factual-fixes` **não** deve chamar
 * `fixCandidatePartyTimelineConsistency` no mesmo `applyFix` (reexecutar noutro
 * passo ou usar script dedicado se for preciso rechainer só em linhas antigas).
 */
export function shouldSkipPartyTimelineRechainAfterCuratedTimelineWrites(
  fix: PartyTimelineRechainGuardFix
): boolean {
  const ensured = fix.ensureTimelineRows?.length ?? 0
  if (ensured > 0) return true
  if (fix.ensureCurrentPartyTimeline === true) return true
  return false
}
