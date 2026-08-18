const DEFAULT_MAX_REPORT_AGE_MS = 2 * 60 * 60 * 1000

export function getMaxReportAgeMs(envValue = process.env.PF_AUDIT_REPORT_MAX_AGE_MS): number {
  if (!envValue) return DEFAULT_MAX_REPORT_AGE_MS
  const parsed = Number(envValue)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`PF_AUDIT_REPORT_MAX_AGE_MS invalido: ${envValue}`)
  }
  return parsed
}

export function assertFreshReport(
  generatedAt: string,
  label: string,
  nowMs = Date.now(),
  maxAgeMs = getMaxReportAgeMs(),
): void {
  const generatedAtMs = Date.parse(generatedAt)
  if (!Number.isFinite(generatedAtMs)) {
    throw new Error(`${label} sem timestamp valido: ${generatedAt}`)
  }

  const ageMs = nowMs - generatedAtMs
  if (ageMs < -5 * 60 * 1000) {
    throw new Error(`${label} tem timestamp no futuro: ${generatedAt}`)
  }
  if (ageMs > maxAgeMs) {
    throw new Error(
      `${label} stale: ${Math.round(ageMs / 60000)} min (max ${Math.round(maxAgeMs / 60000)} min). Regenere o relatorio no mesmo run.`,
    )
  }
}
