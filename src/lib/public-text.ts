import { stripTseTechnicalMarkers } from "@/lib/public-text-markers"
import {
  assertPublicTextEncodingSafe,
  repairPublicTextEncoding,
} from "@/lib/public-text-encoding"

/** Remove marcadores técnicos do TSE antes de qualquer texto chegar à ficha pública. */
export function sanitizePublicText(value: string | null | undefined): string {
  return stripTseTechnicalMarkers(repairPublicTextEncoding(value ?? ""))
    .replace(/\s{2,}/g, " ")
    .trim()
}

export function sanitizePublicTextOrThrow(
  value: string | null | undefined,
  origin: string,
): string {
  const sanitized = sanitizePublicText(value)
  assertPublicTextEncodingSafe(sanitized, origin)
  return sanitized
}
