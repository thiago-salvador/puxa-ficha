/** Remove diacríticos e normaliza para busca (PT-BR). Espelhado em SQL por `public.normalize_for_search` (mesma ordem: NFD → strip → lower → trim). */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}
