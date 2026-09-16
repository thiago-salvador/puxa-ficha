/**
 * Normalização de texto para comparação (NFD + strip combining + upper + trim).
 * Módulo sem side-effects nem dependência de Supabase — seguro para `validate:seed` e CI.
 */
import { stripAccents } from "../../src/lib/strip-accents"

export function normalizeForMatch(text: string): string {
  return stripAccents(text)
    // Official registries alternate between a straight/curly apostrophe and a
    // separating space (e.g. D'ÁVILA vs D ÁVILA). Treat punctuation as a token
    // boundary, while retaining the existing accent/case normalization.
    .replace(/[\u0027\u0060\u00b4\u2018\u2019\u201b\u2032\u02bc]/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim()
}
