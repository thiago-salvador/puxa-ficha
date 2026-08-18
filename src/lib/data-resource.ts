import type { DataResource, DataSourceStatus } from "./types"

export function liveResource<T>(data: T, sourceMessage?: string | null): DataResource<T> {
  return {
    data,
    sourceStatus: "live",
    sourceMessage,
  }
}

export function degradedResource<T>(data: T, sourceMessage?: string | null): DataResource<T> {
  return {
    data,
    sourceStatus: "degraded",
    sourceMessage:
      sourceMessage ??
      "Algumas fontes públicas não responderam. O conteúdo abaixo pode estar incompleto.",
  }
}

export function mergeSourceStatuses(
  ...statuses: Array<DataSourceStatus | undefined>
): DataSourceStatus {
  if (statuses.some((status) => status === "degraded")) return "degraded"
  return "live"
}

export function mergeSourceMessages(
  ...messages: Array<string | null | undefined>
): string | null {
  return messages.find(Boolean) ?? null
}
