/**
 * Allowlist de origens para escrita publica, compartilhada.
 *
 * Ate 2026-08-03 esta logica existia duas vezes, linha a linha: em
 * `alerts-csrf.ts` (rotas de mutacao de alertas) e em
 * `public-write-origin-guard.ts` (`/api/analytics/event` e
 * `/api/quiz/short-link`). Duas copias da mesma allowlist significam que
 * acrescentar um dominio novo (ou fechar um buraco) so em um dos lados passa
 * despercebido: os dois arquivos ja divergiam em tipo de request e em formato
 * de resposta, o que escondia o fato de que a regra de decisao era identica.
 *
 * Aqui fica so a decisao. Cada chamador continua dono do que faz com ela:
 * alertas loga a saida com `logAlertsApiExit`, escrita publica devolve o motivo
 * no header `x-pf-block-reason`.
 */

type HeadersLike = Pick<Headers, "get">

export type CrossSiteWriteBlockReason =
  | "csrf_sec_fetch_cross_site"
  | "csrf_origin_not_allowed"
  | "csrf_origin_missing"

export interface CrossSiteWriteGuardOptions {
  /**
   * Quando true, request sem header `Origin` e bloqueada em vez de liberada.
   *
   * O default (false) existe porque nem todo cliente legitimo manda `Origin`:
   * o valor so e obrigatorio no navegador, e um form GET->POST antigo ou um
   * cliente server-to-server nao manda. Rotas que so sao chamadas por
   * `fetch`/`sendBeacon` do proprio site podem exigir, porque nesses dois casos
   * o navegador SEMPRE envia `Origin` em POST (Fetch spec: o header e anexado
   * quando o metodo nao e GET nem HEAD).
   */
  requireOrigin?: boolean
}

function addOrigin(origins: Set<string>, value: string | null | undefined) {
  if (!value) return
  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`)
    origins.add(parsed.origin)
  } catch {
    // Config malformada e ignorada; a origem da propria request ainda protege a rota.
  }
}

/**
 * Origens aceitas para escrita. `requestOrigin` entra na lista para que preview
 * deploys e dev local funcionem sem configuracao extra.
 */
function allowedCrossSiteWriteOrigins(requestOrigin: string): Set<string> {
  const origins = new Set<string>()
  addOrigin(origins, requestOrigin)
  addOrigin(origins, process.env.NEXT_PUBLIC_SITE_URL)
  addOrigin(origins, process.env.VERCEL_URL)
  addOrigin(origins, "https://puxaficha.com.br")
  addOrigin(origins, "https://www.puxaficha.com.br")
  return origins
}

export function getCrossSiteWriteBlockReason(
  headers: HeadersLike,
  requestOrigin: string,
  options: CrossSiteWriteGuardOptions = {},
): CrossSiteWriteBlockReason | null {
  const secFetchSite = headers.get("sec-fetch-site")?.trim().toLowerCase()
  if (secFetchSite === "cross-site") return "csrf_sec_fetch_cross_site"

  const originHeader = headers.get("origin")?.trim()
  if (!originHeader) return options.requireOrigin ? "csrf_origin_missing" : null

  let origin: string
  try {
    origin = new URL(originHeader).origin
  } catch {
    return "csrf_origin_not_allowed"
  }

  return allowedCrossSiteWriteOrigins(requestOrigin).has(origin)
    ? null
    : "csrf_origin_not_allowed"
}
