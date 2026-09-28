/** Complete only when every source required by the planned cohort was acquired and parsed. */
export function sourceAssetsComplete(
  expected: readonly string[],
  acquired: readonly string[],
  read: readonly string[],
): boolean {
  if (!expected.length) return false
  const acquiredKeys = new Set(acquired)
  const readKeys = new Set(read)
  return expected.every((key) => acquiredKeys.has(key) && readKeys.has(key))
}
