export type QuotaRpcStatus =
  | "inserted"
  | "duplicate"
  | "quota_exceeded"
  | "reserved"
  | "not_found"

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

export function isMissingQuotaRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === "PGRST202" || error.code === "42883") return true
  const message = error.message?.toLowerCase() ?? ""
  return message.includes("could not find the function") || (
    message.includes("does not exist") && message.includes("function")
  )
}
