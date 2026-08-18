import { normalizeForSearch } from "@/lib/global-search"

export type GlobalSearchTextSegment = { text: string; highlight: boolean }

/**
 * Parte o texto em segmentos para realçar tokens da query (acentos ignorados).
 * Tokens com menos de 2 caracteres são ignorados para evitar ruído.
 */
export function segmentTextByQueryTokens(
  text: string,
  query: string
): GlobalSearchTextSegment[] {
  const q = normalizeForSearch(query).trim()
  if (!q) return [{ text, highlight: false }]
  const tokens = [...new Set(q.split(/\s+/).filter((t) => t.length >= 2))]
  if (tokens.length === 0) return [{ text, highlight: false }]

  const parts = text.split(/(\s+)/)
  return parts.map((part) => {
    if (/^\s+$/.test(part)) {
      return { text: part, highlight: false }
    }
    const nw = normalizeForSearch(part)
    const hit = tokens.some((t) => nw.includes(t))
    return { text: part, highlight: hit }
  })
}
