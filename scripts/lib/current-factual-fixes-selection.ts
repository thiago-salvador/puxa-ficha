export interface SluggedFix {
  slug: string
}

export function selectCurrentFactualFixes<T extends SluggedFix>(
  fixes: readonly T[],
  slugFilter: string | null
): T[] {
  if (!slugFilter) return [...fixes]
  return fixes.filter((fix) => fix.slug === slugFilter)
}
