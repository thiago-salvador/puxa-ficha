import { stripTseTechnicalMarkers } from "@/lib/public-text-markers"

/** Remove marcadores técnicos do TSE antes de qualquer texto chegar à ficha pública. */
export function sanitizePublicText(value: string | null | undefined): string {
  return stripTseTechnicalMarkers(value ?? "")
    .replace(/\s{2,}/g, " ")
    .trim()
}
