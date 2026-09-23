import { isUncertainParty, resolveCanonicalPartySigla } from "@/lib/party-utils"

const PARTY_FILTER_QUERY_KEY = "partido"
const PARTY_FILTER_URL_CHANGE_EVENT = "puxaficha:party-filter-url-change"

/** Resolve apenas valores publicáveis; valores inválidos ou incertos são ignorados. */
export function readPartyFilterFromSearchParams(
  searchParams: URLSearchParams | string,
): string {
  const params = typeof searchParams === "string"
    ? new URLSearchParams(searchParams.startsWith("?") ? searchParams.slice(1) : searchParams)
    : searchParams
  const value = params.get(PARTY_FILTER_QUERY_KEY)
  if (!value || isUncertainParty(value)) return ""
  return resolveCanonicalPartySigla(value) ?? ""
}

/** Atualiza somente o filtro de partido, preservando busca e demais parâmetros. */
export function writePartyFilterToSearchParams(
  searchParams: URLSearchParams | string,
  value: string,
): string {
  const params = typeof searchParams === "string"
    ? new URLSearchParams(searchParams.startsWith("?") ? searchParams.slice(1) : searchParams)
    : new URLSearchParams(searchParams)
  const canonical = !isUncertainParty(value) ? resolveCanonicalPartySigla(value) : null
  if (canonical) params.set(PARTY_FILTER_QUERY_KEY, canonical)
  else params.delete(PARTY_FILTER_QUERY_KEY)
  return params.toString()
}

/** Sincroniza os controles da página após replaceState, que não emite popstate. */
export function replacePartyFilterInBrowserUrl(value: string): string {
  const search = writePartyFilterToSearchParams(window.location.search, value)
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
  )
  window.dispatchEvent(new Event(PARTY_FILTER_URL_CHANGE_EVENT))
  return readPartyFilterFromSearchParams(search)
}

export function subscribeToPartyFilterUrlChanges(listener: () => void): () => void {
  window.addEventListener("popstate", listener)
  window.addEventListener(PARTY_FILTER_URL_CHANGE_EVENT, listener)
  return () => {
    window.removeEventListener("popstate", listener)
    window.removeEventListener(PARTY_FILTER_URL_CHANGE_EVENT, listener)
  }
}
