const SIMPLE_EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const NAME_EMAIL_RE = /^[^<>\n\r]+\s<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>$/

export const DEFAULT_ALERTS_FROM_EMAIL = "Puxa Ficha <alertas@puxaficha.com.br>"

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < 2) return trimmed

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }

  return trimmed
}

export function resolveConfiguredFromEmail(
  primaryValue?: string | null,
  secondaryValue?: string | null,
): string {
  const raw = primaryValue?.trim() || secondaryValue?.trim() || ""
  const normalized = stripWrappingQuotes(raw)
  return normalized || DEFAULT_ALERTS_FROM_EMAIL
}

export function isValidConfiguredFromEmail(value: string): boolean {
  return SIMPLE_EMAIL_RE.test(value) || NAME_EMAIL_RE.test(value)
}
