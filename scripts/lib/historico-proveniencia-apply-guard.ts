/**
 * Guardrails operacionais (P2f) para backfills em lote de `historico_politico.proveniencia`
 * (P2d substring Wikidata, P2e pré-1994 + obs nulas + Q-id).
 *
 * O `--apply` só prossegue se `eligible_row_count <= apply_eligible_max`; caso contrário aborta
 * com código de saída ≠ 0 para forçar revisão humana antes de gravar.
 */

/** Margem sobre o baseline conhecido do lote P2d (~29 rows). */
const DEFAULT_P2D_APPLY_ELIGIBLE_MAX = 80

/** Margem sobre o baseline conhecido do piloto P2e (2 rows). */
const DEFAULT_P2E_APPLY_ELIGIBLE_MAX = 25

export type ProvenienciaBatchMode = "p2d" | "p2e"

export function defaultApplyEligibleMax(mode: ProvenienciaBatchMode): number {
  return mode === "p2d" ? DEFAULT_P2D_APPLY_ELIGIBLE_MAX : DEFAULT_P2E_APPLY_ELIGIBLE_MAX
}

/**
 * Resolve o teto de elegíveis para apply: flag CLI explícita, senão default por modo.
 * Valores &lt; 0 ou não finitos voltam ao default.
 */
export function resolveApplyEligibleMax(
  mode: ProvenienciaBatchMode,
  fromFlag: number | null | undefined,
): number {
  if (fromFlag == null || !Number.isFinite(fromFlag)) return defaultApplyEligibleMax(mode)
  const n = Math.floor(fromFlag)
  if (n < 0) return defaultApplyEligibleMax(mode)
  return n
}

export type ApplyGuardSnapshot = {
  apply_eligible_max: number
  eligible_row_count: number
  /** `true` se um `--apply` seria bloqueado até rever o limite ou os dados. */
  would_block_apply: boolean
}

export function buildApplyGuardSnapshot(
  mode: ProvenienciaBatchMode,
  eligibleRowCount: number,
  applyEligibleMax: number,
): ApplyGuardSnapshot {
  return {
    apply_eligible_max: applyEligibleMax,
    eligible_row_count: eligibleRowCount,
    would_block_apply: eligibleRowCount > applyEligibleMax,
  }
}

/** Mensagem curta para stderr quando o apply é abortado. */
export function formatApplyGuardAbortMessage(
  mode: ProvenienciaBatchMode,
  eligibleRowCount: number,
  applyEligibleMax: number,
): string {
  return (
    `proveniencia-backfill | ${mode} | ABORT: eligible_row_count=${eligibleRowCount} > apply_eligible_max=${applyEligibleMax}. ` +
    `Revisão humana obrigatória (ou aumente o limite com --apply-eligible-max=N só após auditoria).`
  )
}
