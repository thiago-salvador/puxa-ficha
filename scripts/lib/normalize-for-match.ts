/**
 * Normalização de texto para comparação (NFD + strip combining + upper + trim).
 * Módulo sem side-effects nem dependência de Supabase — seguro para `validate:seed` e CI.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
}
