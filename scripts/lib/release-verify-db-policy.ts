export type ReleaseVerifyMode = "partial" | "full"

export interface ReleaseVerifyDbPolicyInput {
  mode: ReleaseVerifyMode
  baseUrl: string
  allowDbDegradedEnv?: string | undefined
}

export interface ReleaseVerifyDbPolicy {
  mode: ReleaseVerifyMode
  isLocalBaseUrl: boolean
  isReleaseGradeRun: boolean
  allowDbDegradedRequested: boolean
  allowDbDegraded: boolean
}

export function isLocalReleaseVerifyBaseUrl(baseUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl)
}

export function resolveReleaseVerifyDbPolicy(
  input: ReleaseVerifyDbPolicyInput,
): ReleaseVerifyDbPolicy {
  const isLocalBaseUrl = isLocalReleaseVerifyBaseUrl(input.baseUrl)
  const allowDbDegradedRequested = input.allowDbDegradedEnv === "1"
  const isReleaseGradeRun = input.mode === "full" || !isLocalBaseUrl
  const allowDbDegraded =
    allowDbDegradedRequested && input.mode === "partial" && isLocalBaseUrl && !isReleaseGradeRun

  return {
    mode: input.mode,
    isLocalBaseUrl,
    isReleaseGradeRun,
    allowDbDegradedRequested,
    allowDbDegraded,
  }
}

export function buildDbUnavailableFailureMessage(
  reason: string,
  policy: ReleaseVerifyDbPolicy,
): string {
  const normalizedReason = reason.trim() || "erro de conectividade desconhecido"

  if (policy.isReleaseGradeRun) {
    const reasons = [
      policy.mode === "full" ? "modo full" : null,
      !policy.isLocalBaseUrl ? "VERIFY_URL remoto/prod" : null,
    ].filter(Boolean)
    const why = reasons.length > 0 ? ` (${reasons.join(", ")})` : ""
    const allowHint = policy.allowDbDegradedRequested
      ? " `PF_RELEASE_VERIFY_ALLOW_DB_DEGRADED=1` foi ignorado porque este run é release-grade."
      : ""

    return [
      `Supabase indisponível em run release-grade${why}: ${normalizedReason}.`,
      "Fail-closed: os checks DB-backed não podem ser pulados em full/prod.",
      "Para desenvolvimento local degradado, use `--mode partial` com `VERIFY_URL` local e `PF_RELEASE_VERIFY_ALLOW_DB_DEGRADED=1`.",
      allowHint,
    ]
      .join(" ")
      .trim()
  }

  return [
    `Supabase indisponível: ${normalizedReason}.`,
    "Este run só pode continuar em modo degradado com opt-in explícito.",
    "Para desenvolvimento local, reexecute com `PF_RELEASE_VERIFY_ALLOW_DB_DEGRADED=1`.",
  ].join(" ")
}

export function buildDbDegradedNotes(reason: string): string[] {
  const normalizedReason = reason.trim() || "erro de conectividade desconhecido"

  return [
    `Modo degradado explícito ativo via PF_RELEASE_VERIFY_ALLOW_DB_DEGRADED=1.`,
    `Supabase indisponível: ${normalizedReason}.`,
    "Checks DB-backed de parity/enriquecimento foram pulados neste run.",
    "Resultado não é release-grade.",
  ]
}
