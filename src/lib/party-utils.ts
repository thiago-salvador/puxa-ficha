/**
 * Client-safe normalizacao de sigla/nome de partido (espelha `normalizePartyValue`
 * em `scripts/lib/party-canonical.ts` sem depender de Node/scripts).
 */
export function normalizePartySigla(value: string | null | undefined): string {
  if (!value || !value.trim()) return ""
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase()
}
