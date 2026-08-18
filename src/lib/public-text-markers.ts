const TSE_MARKER_EXACT_RE =
  /^#?\s*(?:NULO|NULL|NE|N(?:Ã|A)O\s+DIVULG(?:Á|A)VEL)\s*#?$/iu

const TSE_MARKER_INLINE_RE =
  /(?:#\s*(?:NULO|NE)(?![\p{L}\p{N}_])\s*#?|\bNULL\b|#?\s*N(?:Ã|A)O\s+DIVULG(?:Á|A)VEL\s*#?)/iu

const TSE_MARKER_INLINE_GLOBAL_RE =
  /(?:#\s*(?:NULO|NE)(?![\p{L}\p{N}_])\s*#?|\bNULL\b|#?\s*N(?:Ã|A)O\s+DIVULG(?:Á|A)VEL\s*#?)/giu

/** Marcadores técnicos do TSE que nunca podem virar conteúdo público. */
export function containsTseTechnicalMarker(value: unknown): boolean {
  if (typeof value !== "string") return false
  const texto = value.trim()
  return TSE_MARKER_EXACT_RE.test(texto) || TSE_MARKER_INLINE_RE.test(texto)
}

export function stripTseTechnicalMarkers(value: string): string {
  return value.replace(TSE_MARKER_INLINE_GLOBAL_RE, "")
}

/** Carimbos de lote e curadoria que pertencem à trilha, não à ficha. */
export const PUBLIC_INTERNAL_VOCABULARY_RE =
  /(?:\+\s*TSE\s+\d{4}-\d{2}-\d{2}|\bcuradoria\s+S\d+(?:\.\d+)*\b|\blote\s+\d+\b|\b(?:per[ií]odo\s+)?em\s+confer[eê]ncia\b)/iu
