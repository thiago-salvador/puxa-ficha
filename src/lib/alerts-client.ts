import {
  ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY,
  ALERT_MANAGE_TOKEN_STORAGE_KEY,
} from "@/lib/alerts-client-storage"

/**
 * O próprio getter `window.localStorage` lança SecurityError quando o storage
 * está bloqueado (iframe sandbox, cookies desligados). Todo acesso passa por
 * aqui: sem storage, leitura cai no fallback e escrita vira no-op.
 */
function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

export function clearStoredAlertManageToken(): void {
  safeStorage()?.removeItem(ALERT_MANAGE_TOKEN_STORAGE_KEY)
}

function readStoredFollowedCandidateSlugs(): string[] {
  const storage = safeStorage()
  if (!storage) return []

  try {
    const raw = storage.getItem(ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY)
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
  const storage = safeStorage()
  if (!storage) return false
  try {
    return storage.getItem(ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export function writeStoredFollowedCandidateSlugs(slugs: string[]): void {
  const storage = safeStorage()
  if (!storage) return
  const nextValue = Array.from(new Set(slugs)).sort((a, b) => a.localeCompare(b, "pt-BR"))
  storage.setItem(ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY, JSON.stringify(nextValue))
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
  safeStorage()?.removeItem(ALERT_FOLLOWED_CANDIDATES_STORAGE_KEY)
}
