const ROLE_STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no"])

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
}

function tokenizeRole(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.replace(/a$/, "").replace(/o$/, ""))
    .filter((token) => token.length > 2 && !ROLE_STOPWORDS.has(token))
}

export function rolesCompatible(
  currentRole: string | null | undefined,
  historicalRole: string | null | undefined
): boolean {
  const currentTokens = tokenizeRole(currentRole)
  const historicalTokens = tokenizeRole(historicalRole)
  if (currentTokens.length === 0 || historicalTokens.length === 0) return false

  const currentSet = new Set(currentTokens)
  const historicalSet = new Set(historicalTokens)
  const smaller = currentSet.size <= historicalSet.size ? currentSet : historicalSet
  const larger = currentSet.size <= historicalSet.size ? historicalSet : currentSet
  return [...smaller].every((token) => larger.has(token))
}

export function isNoCurrentMandate(value: string | null | undefined): boolean {
  const normalized = normalizeText(value)
  return (
    normalized === "" ||
    normalized.startsWith("ex ") ||
    normalized.includes("sem cargo publico") ||
    normalized.includes("sem mandato") ||
    normalized.includes("nao ocupa cargo")
  )
}
