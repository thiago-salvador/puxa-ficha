export function isAlertsEmailFeatureEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.NEXT_PUBLIC_ALERTS_EMAIL_ENABLED === "true"
}
