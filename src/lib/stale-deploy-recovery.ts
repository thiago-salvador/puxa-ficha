/**
 * Recuperação de aba presa num deploy antigo (PUXA-FICHA-2Z, 09/10/2026).
 *
 * Uma aba carregada num build e que, depois, navega pelo client e recebe
 * módulos de outro build quebra na instanciação: o id de módulo do runtime
 * antigo aponta para outra coisa no build novo, e o import minificado vira
 * "(0 , e.i(...).default) is not a function". O mesmo commit publicado duas
 * vezes em produção já basta para isso acontecer. Não é bug da rota: um
 * reload completo busca o HTML e os chunks do mesmo deploy e resolve.
 *
 * As boundaries de erro usam isto para fazer UM reload automático, com trava
 * por janela de tempo, em vez de mostrar a tela de erro.
 */

export const STALE_DEPLOY_RELOAD_WINDOW_MS = 60_000
const STORAGE_KEY = "pf:stale-deploy-reload-at"

// Import interop do Turbopack/webpack minificado: "(0 , e.i(...).default) is
// not a function" ou "(0 , n.default) is not a function". Erro de aplicação
// ("candidato.nome is not a function") não tem o prefixo "(0 , ".
const BUNDLER_INTEROP_RE = /^\(0\s*,\s*[\w$.]+(?:\([^)]*\))?(?:\.[\w$]+)*\)\s+is not a function/
const CHUNK_MESSAGE_RE =
  /Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i

export function isStaleDeployError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === "ChunkLoadError") return true
  const message = error.message ?? ""
  if (CHUNK_MESSAGE_RE.test(message)) return true
  return error instanceof TypeError && BUNDLER_INTEROP_RE.test(message)
}

type ReloadStorage = Pick<Storage, "getItem" | "setItem">

/**
 * Decide se vale recarregar e registra a tentativa. Sem storage utilizável
 * devolve false: preferimos mostrar a tela de erro a arriscar loop de reload.
 */
export function shouldReloadForStaleDeploy(
  storage: ReloadStorage | null | undefined,
  now: number,
): boolean {
  if (!storage) return false
  try {
    const last = Number(storage.getItem(STORAGE_KEY))
    if (Number.isFinite(last) && last > 0 && now - last < STALE_DEPLOY_RELOAD_WINDOW_MS) {
      return false
    }
    storage.setItem(STORAGE_KEY, String(now))
    return true
  } catch {
    return false
  }
}

function sessionStorageOrNull(): ReloadStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** Devolve true quando disparou o reload (a boundary pode então não reportar). */
export function recoverFromStaleDeploy(error: unknown): boolean {
  if (!isStaleDeployError(error)) return false
  if (!shouldReloadForStaleDeploy(sessionStorageOrNull(), Date.now())) return false
  window.location.reload()
  return true
}
