const LOCAL_PART_RE = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i
const DOMAIN_LABEL_RE = /^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/i

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

export function isValidConfiguredReplyToEmail(value: string): boolean {
  if (value.length > 254 || /[\s<>,;:"]/.test(value)) return false

  const atIndex = value.indexOf("@")
  if (atIndex <= 0 || atIndex !== value.lastIndexOf("@")) return false

  const localPart = value.slice(0, atIndex)
  const domain = value.slice(atIndex + 1)
  if (
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !LOCAL_PART_RE.test(localPart)
  ) {
    return false
  }

  const labels = domain.split(".")
  return labels.length >= 2 && labels.every((label) => DOMAIN_LABEL_RE.test(label))
}

export function normalizeConfiguredReplyToEmail(value?: string | null): string {
  return stripWrappingQuotes(value ?? "")
}

export function resolveConfiguredReplyToEmail(value?: string | null): string {
  const normalized = normalizeConfiguredReplyToEmail(value)
  if (!normalized) {
    throw new Error("Missing PF_ALERTS_REPLY_TO_EMAIL")
  }
  if (!isValidConfiguredReplyToEmail(normalized)) {
    throw new Error("Invalid PF_ALERTS_REPLY_TO_EMAIL")
  }
  return normalized
}
