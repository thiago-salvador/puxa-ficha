import "server-only"

import { createHash } from "node:crypto"
import { getEstadoNome, getEstadoUFs } from "../../src/lib/br-uf"
import type { ClienteHttpMonitoramento } from "./pesquisas-monitoramento-rede"
import { criarOrcamentoDescoberta, descobrirRegistrosPesqele, type OrcamentoDescoberta, type InventarioRegistrosPesqele } from "./pesquisas-monitoramento-pesqele"
import type { EntradaDescoberta } from "./pesquisas-monitoramento-entrada"
import { validarEntradasDescobertas } from "./pesquisas-monitoramento-entrada"
import type { AlvoMonitoramento } from "./pesquisas-monitoramento-adapters"

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
  status: "observed" | "partial" | "unavailable" | "layout_changed"
  evidence_sha256: string | null
  links: LinkPesquisaDescoberta[]
  error: string | null
  page?: number
  pagination_status?: "next_page" | "not_exposed" | "limit_reached" | "failed"
  next_url?: string | null
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
  budget?: OrcamentoDescoberta
  maxPagesPerListing?: number
}): Promise<ObservacaoListagemPesquisas[]> {
  const listings = LISTAGENS_PESQUISAS.filter((listing) => !input.sourceId || input.sourceId === "all" || (listing.source_ids as readonly string[]).includes(input.sourceId))
  if (!listings.length) throw new Error("fonte sem listagem de descoberta aprovada")
  const budget = input.budget ?? criarOrcamentoDescoberta()
  const maxPages = input.maxPagesPerListing ?? 3
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) throw new Error("limite de páginas de publicações inválido")
  const client = input.client ?? budget.client(listings.map((listing) => new URL(listing.url).origin))
  const observations: ObservacaoListagemPesquisas[] = []
  for (const listing of listings) {
    let url: string | null = listing.url
    const visited = new Set<string>()
    for (let page = 1; url && page <= maxPages; page++) {
      const pageUrl = url
      visited.add(url)
      let response: Awaited<ReturnType<ClienteHttpMonitoramento["getText"]>>
      try { budget.check(); response = await client.getText(url) } catch (error) {
        observations.push({ id: listing.id, url, page, pagination_status: "failed", observed_at: new Date().toISOString(), status: "unavailable", evidence_sha256: null, links: [], error: error instanceof Error ? error.message : String(error) })
        break
      }
      try {
        const next = proximaPaginaListagem(response.body, listing, url)
        const exhaustedLimit = Boolean(next && (page === maxPages || visited.has(next)))
        observations.push({ id: listing.id, url, page, pagination_status: exhaustedLimit ? "limit_reached" : next ? "next_page" : "not_exposed", next_url: next,
          observed_at: response.observedAt, status: exhaustedLimit ? "partial" : "observed", evidence_sha256: createHash("sha256").update(response.body).digest("hex"), links: extrairLinksDePesquisas(response.body, listing, input.knownUrls), error: exhaustedLimit ? "limite de paginação ou ciclo; cobertura incompleta" : null })
        url = exhaustedLimit ? null : next
      } catch (error) {
        observations.push({ id: listing.id, url: pageUrl, page, pagination_status: "failed", observed_at: response.observedAt, status: "layout_changed", evidence_sha256: createHash("sha256").update(response.body).digest("hex"), links: [], error: error instanceof Error ? error.message : String(error) })
        break
      }
    }
  }
  return observations
}

/** Follow only pagination actually exposed by an approved listing, never guessed URLs. */
function proximaPaginaListagem(html: string, listing: Listing, current: string): string | null {
  const safe = html.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const links = [...safe.matchAll(/<(?:a|link)\b([^>]+)>/gi)].filter((match) => /\brel=["']next["']|\bclass=["'][^"']*\bnext\b/i.test(match[1]))
  const next = new Set<string>()
  for (const link of links) {
    const href = link[1].match(/\bhref=["']([^"']+)["']/i)?.[1]
    if (!href) continue
    const candidate = new URL(href.replaceAll("&amp;", "&"), current)
    const base = new URL(listing.url)
    const suffix = candidate.pathname.slice(base.pathname.length)
    if (candidate.origin !== base.origin || candidate.username || candidate.password || candidate.hash || !candidate.pathname.startsWith(base.pathname)
      || !(suffix === "" || /^page\/\d+\/$/.test(suffix)) || [...candidate.searchParams].some(([key, value]) => !["page", "paged"].includes(key) || !/^\d+$/.test(value))) throw new Error("paginação fora da listagem aprovada")
    next.add(candidate.href)
  }
  if (next.size > 1) throw new Error("paginação ambígua")
  return [...next][0] ?? null
}

export function construirCoberturaDescoberta(input: {
  observations: ObservacaoListagemPesquisas[]
  targets: Array<{ geography_code: string }>
  inventory?: InventarioRegistrosPesqele
  entries?: EntradaDescoberta[]
  validatedResults?: Array<{ geography_code: string; registration_id: string; source_sha256: string; registry_sha256: string; evidence_path: string }>
}) {
  const links = input.observations.flatMap((observation) => observation.links)
  return ["BR", ...getEstadoUFs().map((uf) => uf.toUpperCase())].map((geography) => {
    const registry = input.inventory?.geographies.find((item) => item.geography_code === geography)
    const entries = (input.entries ?? []).filter((entry) => entry.geography_code === geography || (!entry.geography_code && (!entry.geography_hint || entry.geography_hint === geography)))
    const publications = entries.filter((entry) => entry.registration_id && entry.source_sha256 && ["target_validated", "duplicate_registration"].includes(entry.status))
    const results = (input.validatedResults ?? []).filter((item) => item.geography_code === geography && /^[a-f0-9]{64}$/.test(item.source_sha256) && /^[a-f0-9]{64}$/.test(item.registry_sha256) && item.evidence_path.trim())
    const errors = [ ...(registry?.errors ?? []), ...input.observations.filter((item) => item.status !== "observed" || item.error).map((item) => `${item.id}: ${item.error ?? item.status}`), ...entries.filter((entry) => entry.status === "blocked").map((entry) => `${entry.url}: ${entry.reason}`) ]
    const ids = [...new Set([...(registry?.records.map((record) => record.registration_id) ?? []), ...publications.map((entry) => entry.registration_id!), ...results.map((entry) => entry.registration_id)])].sort()
    return {
    schema_version: "pesquisas-cobertura-v1" as const,
    geography_code: geography,
    geography: geography === "BR" ? "Brasil" : getEstadoNome(geography),
    monitored_catalog_polls: input.targets.filter((target) => target.geography_code === geography).length,
    pending_urls: [...new Set(links.filter((link) => link.geography_hint === geography && link.state === "pending_validation").map((link) => link.url))],
    registry_query_status: registry?.status ?? "not_queried",
    registry_query_exhausted: registry?.query_exhausted ?? false,
    registry_period: input.inventory ? { from: input.inventory.date_from, to: input.inventory.date_to } : null,
    registration_ids_found: ids,
    records: ids.map((registration_id) => ({ registration_id,
      status: results.some((item) => item.registration_id === registration_id) ? "result_validated" as const : publications.some((entry) => entry.registration_id === registration_id) ? "publication_located" as const : "registration_found" as const,
      publication_urls: publications.filter((entry) => entry.registration_id === registration_id).map((entry) => entry.url),
    })),
    coverage_complete: false,
    publications_located: publications.map((entry) => ({ registration_id: entry.registration_id!, url: entry.url, source_sha256: entry.source_sha256!, registry_inventory_match: entry.registry_inventory_match ?? false })),
    validated_results: results,
    discovery_exceptions: entries.filter((entry) => entry.classification === "discovery_exception").map((entry) => ({ url: entry.url, reason: entry.reason })),
    coverage_status: errors.length ? "gap_or_failure" as const : "absence_unproven" as const,
    errors,
    freshness_status: "not_assessed" as const,
    absence_of_poll_confirmed: false,
  }})
}

/** The search window is registration time, never fieldwork or publication time. */
export async function executarDescobertaIntegrada(input: {
  targets: AlvoMonitoramento[]; sourceId: string; validateTargets: boolean
  dateFrom: string; dateTo: string; budget?: OrcamentoDescoberta
}, dependencies = { discover: descobrirPublicacoesPesquisas, inventory: descobrirRegistrosPesqele, intake: validarEntradasDescobertas }) {
  const budget = input.budget ?? criarOrcamentoDescoberta()
  const observations = await dependencies.discover({ knownUrls: new Set(input.targets.map((target) => target.url)), sourceId: input.sourceId, budget })
  const inventory = await dependencies.inventory({ dateFrom: input.dateFrom, dateTo: input.dateTo, budget })
  const intake = input.validateTargets ? await dependencies.intake({ observations, knownTargets: input.targets, sourceId: input.sourceId, inventory, budget }) : null
  const coverage = construirCoberturaDescoberta({ observations, targets: input.targets, inventory, entries: intake?.entries })
  const pending = observations.flatMap((item) => item.links).filter((link) => link.state === "pending_validation")
  const failed = observations.some((item) => ["unavailable", "layout_changed"].includes(item.status)) || inventory.geographies.some((item) => item.status === "failed")
  return { schema_version: "1.0.0", generated_at: new Date().toISOString(), source_filter: input.sourceId,
    publication_authorized: false, status: failed ? "source_failure" : "partial",
    queue_status: intake?.targets.length ? "targets_ready_for_collection" : pending.length ? "new_urls_pending_validation" : "no_new_urls_in_consulted_listings",
    observations, inventory, intake, coverage, budget: budget.snapshot(),
    limitations: ["Listagens e período de registro não comprovam inventário exaustivo de resultados.", "Ausência de link não comprova ausência de pesquisa.", "Alvo validado ainda exige conciliação integral de resultados."],
  }
}
