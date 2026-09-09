import "server-only"

import { createHash } from "node:crypto"
import { getEstadoNome, getEstadoUFs } from "../../src/lib/br-uf"
import { criarClienteHttpMonitoramento, type ClienteHttpMonitoramento } from "./pesquisas-monitoramento-rede"

export const LISTAGENS_PESQUISAS = [
  { id: "r7-eleicoes", url: "https://noticias.r7.com/eleicoes/2026/", source_ids: ["real-time-big-data-estaduais-2026"], institution: /Real Time/i, articlePath: /^\/eleicoes\/2026\/[^/]+\/$/ },
  { id: "poderdata", url: "https://www.poder360.com.br/poderdata/", source_ids: ["poderdata-aya-nacional-2026"], institution: /PoderData|pesquisa/i, articlePath: /^\/poderdata\/[^/]+\/$/ },
  { id: "folha-poder", url: "https://www1.folha.uol.com.br/poder/", source_ids: ["datafolha-folha-globo-nacional-2026", "datafolha-folha-globo-estaduais-2026"], institution: /Datafolha/i, articlePath: /^\/poder\/2026\/\d{2}\/[^/]+\.shtml$/ },
] as const

type Listing = typeof LISTAGENS_PESQUISAS[number]

export interface LinkPesquisaDescoberta {
  url: string
  title: string
  listing_id: string
  geography_hint: string | null
  office_hint: "Presidente" | "Governador" | null
  state: "known_url" | "pending_validation"
}

export interface ObservacaoListagemPesquisas {
  id: string
  url: string
  observed_at: string
  status: "observed" | "unavailable" | "layout_changed"
  evidence_sha256: string | null
  links: LinkPesquisaDescoberta[]
  error: string | null
}

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, raw: string) => {
      const value = Number(raw)
      return value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : " "
    }).replace(/\s+/g, " ").trim()
}

function geographyHint(title: string): string | null {
  const longNames = getEstadoUFs().map((uf) => ({ uf: uf.toUpperCase(), name: getEstadoNome(uf)! }))
    .sort((left, right) => right.name.length - left.name.length)
  const named = longNames.find(({ name }) => new RegExp(`\\b${name}\\b`, "iu").test(title))
  if (named) return named.uf
  const abbreviations = [...title.matchAll(/\b(?:d[oa]|n[oa]|em|de)\s+([A-Z]{2})\b/g)].map((match) => match[1]).filter((uf) => getEstadoNome(uf))
  return new Set(abbreviations).size === 1 ? abbreviations[0] : null
}

export function extrairLinksDePesquisas(html: string, listing: Listing, knownUrls: Set<string>): LinkPesquisaDescoberta[] {
  const safe = html.replace(/<(script|style|template|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const anchors = [...safe.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  if (anchors.length === 0) throw new Error("listagem sem links reconhecíveis")
  const found = new Map<string, LinkPesquisaDescoberta>()
  for (const anchor of anchors) {
    const title = plainText(anchor[2])
    if (!listing.institution.test(title) || /\bsenado\b|\bsenador(?:es)?\b/i.test(title)) continue
    if (/PoderDataCast|ao vivo|rejei[cç]|rejeitad|aprovad|desaprova|avaliação/i.test(title)) continue
    if (!/turno|intenções? de voto|intenção de voto|venceria|resultados da pesquisa|governo|governador/i.test(title)) continue
    let url: URL
    try { url = new URL(anchor[1].replaceAll("&amp;", "&"), listing.url) } catch { continue }
    if (url.origin !== new URL(listing.url).origin || url.username || url.password || !listing.articlePath.test(url.pathname)) continue
    url.hash = ""
    // Query parameters are unnecessary for the canonical public article URL.
    url.search = ""
    const geography = geographyHint(title)
    const office = /governo|governador/i.test(title) ? "Governador" : /presiden|\bLula\b|Flávio Bolsonaro/i.test(title) ? "Presidente" : null
    found.set(url.href, {
      url: url.href, title, listing_id: listing.id,
      geography_hint: geography ?? (office === "Presidente" && listing.id !== "r7-eleicoes" ? "BR" : null),
      office_hint: office,
      state: knownUrls.has(url.href) ? "known_url" : "pending_validation",
    })
  }
  return [...found.values()].sort((left, right) => left.url.localeCompare(right.url))
}

export async function descobrirPublicacoesPesquisas(input: {
  knownUrls: Set<string>
  sourceId?: string
  client?: ClienteHttpMonitoramento
}): Promise<ObservacaoListagemPesquisas[]> {
  const listings = LISTAGENS_PESQUISAS.filter((listing) => !input.sourceId || input.sourceId === "all" || (listing.source_ids as readonly string[]).includes(input.sourceId))
  if (!listings.length) throw new Error("fonte sem listagem de descoberta aprovada")
  const client = input.client ?? criarClienteHttpMonitoramento({ allowedOrigins: listings.map((listing) => new URL(listing.url).origin), maxBytes: 2_000_000 })
  const observations: ObservacaoListagemPesquisas[] = []
  for (const listing of listings) {
    let response: Awaited<ReturnType<ClienteHttpMonitoramento["getText"]>>
    try { response = await client.getText(listing.url) } catch (error) {
      observations.push({ id: listing.id, url: listing.url, observed_at: new Date().toISOString(), status: "unavailable", evidence_sha256: null, links: [], error: error instanceof Error ? error.message : String(error) })
      continue
    }
    try {
      observations.push({ id: listing.id, url: listing.url, observed_at: response.observedAt, status: "observed", evidence_sha256: createHash("sha256").update(response.body).digest("hex"), links: extrairLinksDePesquisas(response.body, listing, input.knownUrls), error: null })
    } catch (error) {
      observations.push({ id: listing.id, url: listing.url, observed_at: response.observedAt, status: "layout_changed", evidence_sha256: createHash("sha256").update(response.body).digest("hex"), links: [], error: error instanceof Error ? error.message : String(error) })
    }
  }
  return observations
}

export function construirCoberturaDescoberta(input: {
  observations: ObservacaoListagemPesquisas[]
  targets: Array<{ geography_code: string }>
}) {
  const links = input.observations.flatMap((observation) => observation.links)
  return ["BR", ...getEstadoUFs().map((uf) => uf.toUpperCase())].map((geography) => ({
    geography_code: geography,
    geography: geography === "BR" ? "Brasil" : getEstadoNome(geography),
    monitored_catalog_polls: input.targets.filter((target) => target.geography_code === geography).length,
    pending_urls: links.filter((link) => link.geography_hint === geography && link.state === "pending_validation").map((link) => link.url),
    freshness_status: "not_assessed" as const,
    absence_of_poll_confirmed: false,
  }))
}
