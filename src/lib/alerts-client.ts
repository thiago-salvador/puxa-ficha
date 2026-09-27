import {
  ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY,
  ALERT_MANAGE_TOKEN_STORAGE_KEY,
} from "@/lib/alerts-client-storage"

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export function clearStoredAlertManageToken(): void {
  if (!hasLocalStorage()) return
  window.localStorage.removeItem(ALERT_MANAGE_TOKEN_STORAGE_KEY)
}

function readStoredFollowedCandidateSlugs(): string[] {
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

/**
 * A lista de fichas seguidas só é gravada depois que `/api/alerts/me` confirma
 * uma sessão (verificação, gestão ou botão Seguir) e só é apagada no logout.
 * A chave presente, mesmo com `[]`, é o sinal de que vale consultar a sessão.
 */
export function hasStoredAlertSessionHint(): boolean {
  if (!hasLocalStorage()) return false
  try {
    return window.localStorage.getItem(ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY) !== null
  } catch {
    return false
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
