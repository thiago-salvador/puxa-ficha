/**
 * Removes combining marks in the canonical U+0300 through U+036F range after
 * canonical decomposition. Case, whitespace and all other code points are preserved.
 */
export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}
