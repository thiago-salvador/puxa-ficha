/**
 * Normalização de texto para comparação (NFD + strip combining + upper + trim).
 * Módulo sem side-effects nem dependência de Supabase — seguro para `validate:seed` e CI.
 */
import { stripAccents } from "../../src/lib/strip-accents"

export function normalizeForMatch(text: string): string {
  return stripAccents(text)
    .toUpperCase()
    .trim()
}
