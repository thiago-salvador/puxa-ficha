/** Sort source values descending, keeping unavailable values after confirmed zero. */
export function compareCandidateSortValues(a: number | null | undefined, b: number | null | undefined): number {
  const ak = typeof a === "number" && Number.isFinite(a)
  const bk = typeof b === "number" && Number.isFinite(b)
  if (!ak && !bk) return 0
  if (!ak) return 1
  if (!bk) return -1
  return b - a
}
