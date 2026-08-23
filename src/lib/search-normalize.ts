/** Remove diacríticos e normaliza para busca (PT-BR). Espelhado em SQL por `public.normalize_for_search` (mesma ordem: NFD → strip → lower → trim). */
import { stripAccents } from "@/lib/strip-accents"

export function normalizeForSearch(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .trim()
}
