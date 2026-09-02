export type QuotaRpcFunctionName =
  | "insert_quiz_short_link_under_ip_quota"
  | "insert_analytics_launch_event_under_ip_quota"
  | "insert_alert_subscriber_under_ip_quota"
  | "reserve_alert_email_ip_budget"

export function readQuotaRpcStatus(data: unknown): string | null {
  if (typeof data === "string") return data
  if (!data || typeof data !== "object") return null
  const status = (data as { status?: unknown }).status
  return typeof status === "string" ? status : null
}

export function readQuotaRpcId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  const id = (data as { id?: unknown }).id
  return typeof id === "string" && id.length > 0 ? id : null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function isMissingQuotaRpc(
  error: { code?: string; message?: string } | null,
  expectedFunction: QuotaRpcFunctionName,
): boolean {
  if (!error) return false
  const message = (error.message?.toLowerCase() ?? "").replaceAll('"', "")
  const expected = `(?:public\\.)?${escapeRegExp(expectedFunction)}`
  const postgrestMissing = new RegExp(
    `could not find the function\\s+${expected}(?:\\s*\\([^)]*\\))?(?:\\s|$)`,
  )
  const postgresMissing = new RegExp(
    `function\\s+${expected}(?:\\s*\\([^)]*\\))?\\s+does not exist\\b`,
  )
  if (error.code === "PGRST202") return postgrestMissing.test(message)
  if (error.code === "42883") return postgresMissing.test(message)
  return postgrestMissing.test(message) || postgresMissing.test(message)
}
