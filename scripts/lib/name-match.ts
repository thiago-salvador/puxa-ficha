import { normalizeForMatch } from "./normalize-for-match"

function significantNameTokens(value: string): string[] {
  return normalizeForMatch(value)
    .split(" ")
    .filter((token) => token.length > 2)
}

function nameTokensAreSubsequence(needleName: string, haystackName: string): boolean {
  const needle = significantNameTokens(needleName)
  const haystack = significantNameTokens(haystackName)
  if (needle.length < 2 || haystack.length < needle.length) return false
  let needleIndex = 0
  for (const token of haystack) {
    if (token === needle[needleIndex]) needleIndex += 1
    if (needleIndex === needle.length) return true
  }
  return false
}

/**
 * Heurística de compatibilidade de nomes, nunca prova suficiente de identidade.
 * Aceita igualdade, contenção e sequência ordenada de ao menos dois tokens relevantes.
 */
export function namesLookCompatible(
  expectedNames: Array<string | null | undefined>,
  observedNames: Array<string | null | undefined>,
): boolean {
  const expected = expectedNames.map((value) => normalizeForMatch(value ?? "")).filter(Boolean)
  const observed = observedNames.map((value) => normalizeForMatch(value ?? "")).filter(Boolean)
  if (expected.length === 0 || observed.length === 0) return true
  return observed.some((candidateName) =>
    expected.some(
      (expectedName) =>
        candidateName === expectedName ||
        candidateName.includes(expectedName) ||
        expectedName.includes(candidateName) ||
        nameTokensAreSubsequence(expectedName, candidateName) ||
        nameTokensAreSubsequence(candidateName, expectedName),
    ),
  )
}
