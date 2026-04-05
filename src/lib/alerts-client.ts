import {
  ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY,
  ALERT_MANAGE_TOKEN_STORAGE_KEY,
} from "@/lib/alerts-shared"

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export function readStoredAlertManageToken(): string | null {
  if (!hasLocalStorage()) return null
  const value = window.localStorage.getItem(ALERT_MANAGE_TOKEN_STORAGE_KEY)?.trim()
  return value || null
}

export function writeStoredAlertManageToken(token: string): void {
  if (!hasLocalStorage()) return
  window.localStorage.setItem(ALERT_MANAGE_TOKEN_STORAGE_KEY, token)
}

export function clearStoredAlertManageToken(): void {
  if (!hasLocalStorage()) return
  window.localStorage.removeItem(ALERT_MANAGE_TOKEN_STORAGE_KEY)
}

export function readStoredFollowedCandidateSlugs(): string[] {
  if (!hasLocalStorage()) return []

  try {
    const raw = window.localStorage.getItem(ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === "string" && value.length > 0)
  } catch {
    return []
  }
}

export function writeStoredFollowedCandidateSlugs(slugs: string[]): void {
  if (!hasLocalStorage()) return
  const nextValue = Array.from(new Set(slugs)).sort((a, b) => a.localeCompare(b, "pt-BR"))
  window.localStorage.setItem(ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY, JSON.stringify(nextValue))
}

export function setStoredCandidateFollowState(candidateSlug: string, following: boolean): string[] {
  const current = readStoredFollowedCandidateSlugs()
  const next = following
    ? Array.from(new Set([...current, candidateSlug]))
    : current.filter((slug) => slug !== candidateSlug)
  writeStoredFollowedCandidateSlugs(next)
  return next
}

export function clearStoredAlertState(): void {
  clearStoredAlertManageToken()
  if (!hasLocalStorage()) return
  window.localStorage.removeItem(ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY)
}
