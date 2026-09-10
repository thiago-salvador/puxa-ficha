import "server-only"

import { createHash } from "node:crypto"
import { getEstadoNome, getEstadoUFs } from "../../src/lib/br-uf"
import { LISTAGENS_PESQUISAS, type ObservacaoListagemPesquisas } from "./pesquisas-monitoramento-descoberta"
import { obterAdaptadorMonitoramento, selecionarRegistroPublicado, type AlvoMonitoramento } from "./pesquisas-monitoramento-adapters"
import { consultarRegistroPesqele, criarOrcamentoDescoberta, PESQELE_ORIGIN, type ObservacaoPesqele, type InventarioRegistrosPesqele, type OrcamentoDescoberta } from "./pesquisas-monitoramento-pesqele"
import type { ClienteHttpMonitoramento } from "./pesquisas-monitoramento-rede"

export interface EntradaDescoberta {
  url: string
  status: "target_validated" | "duplicate_registration" | "unsupported_scope" | "blocked"
  classification?: "discovery_exception"
  reason: string
  source_sha256?: string
  observed_at?: string
  poll_id?: string
  registration_id?: string
  geography_code?: string
  geography_hint?: string | null
  registry_inventory_match?: boolean
  registry_sha256?: string
  known_url_rechecked?: boolean
  published_registration_ids?: string[]
}

/** Discovery hints route a public registry check; they never supply vote numbers. */
export async function validarEntradasDescobertas(input: {
  observations: ObservacaoListagemPesquisas[]
  knownTargets: AlvoMonitoramento[]
  sourceId?: string
  uf?: string | null
  client?: ClienteHttpMonitoramento
  queryRegistry?: typeof consultarRegistroPesqele
  inventory?: InventarioRegistrosPesqele
  budget?: OrcamentoDescoberta
}): Promise<{ targets: AlvoMonitoramento[]; registry: ObservacaoPesqele[]; entries: EntradaDescoberta[] }> {
  const budget = input.budget ?? criarOrcamentoDescoberta()
  const client = input.client ?? budget.client(LISTAGENS_PESQUISAS.map((listing) => new URL(listing.url).origin))
  const query = input.queryRegistry ?? ((id: string) => consultarRegistroPesqele(id, budget.client([PESQELE_ORIGIN], true)))
  const targets = new Map<string, AlvoMonitoramento>()
  const registry = new Map<string, ObservacaoPesqele>()
  const entries: EntradaDescoberta[] = []
  // Re-read known URLs as well: an unchanged URL can contain a rectification.
  const links = [...new Map(input.observations.flatMap((observation) => observation.links).map((link) => [link.url, link])).values()].sort((a, b) => a.url.localeCompare(b.url))
  for (const [index, link] of links.entries()) {
    const entry: EntradaDescoberta = { url: link.url, status: "blocked", reason: "unvalidated", geography_hint: link.geography_hint, known_url_rechecked: link.state === "known_url" }
    entries.push(entry)
    if (index >= 100) { entry.reason = "limite de 100 URLs por execução; publicação não consultada"; continue }
    try {
      const listing = LISTAGENS_PESQUISAS.find((candidate) => candidate.id === link.listing_id)
      const url = new URL(link.url)
      if (!listing || url.origin !== new URL(listing.url).origin || !listing.articlePath.test(url.pathname) || url.username || url.password || url.search || url.hash) throw new Error("URL fora da listagem aprovada")
      if (input.sourceId && input.sourceId !== "all" && !(listing.source_ids as readonly string[]).includes(input.sourceId)) { entries.pop(); continue }
      if (input.uf && input.uf !== "ALL" && link.geography_hint && input.uf !== link.geography_hint) { entries.pop(); continue }
      if (listing.id === "r7-eleicoes" && link.office_hint === "Presidente") {
        Object.assign(entry, { status: "unsupported_scope", reason: "pesquisa presidencial regional fora do contrato nacional" }); continue
      }
      budget.check()
      const response = await client.getText(url.href)
      entry.source_sha256 = createHash("sha256").update(response.body).digest("hex")
      entry.observed_at = response.observedAt
      const text = response.body.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ")
        .replace(/&#(\d+);/g, (_, raw: string) => { const n = Number(raw); return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " " }).replace(/\s+/g, " ")
      const publishedIds = [...new Set(text.match(/\b[A-Z]{2}-\d{5}\/2026\b/g) ?? [])]
      entry.published_registration_ids = publishedIds
      // A state poll article may also cite its national companion. The exact
      // state prefix only routes the check; the official office/UF/institute
      // below still must agree. Two state registrations remain ambiguous.
      const selected = selecionarRegistroPublicado(publishedIds, link.office_hint, link.geography_hint)
      const ids = selected ? [selected] : publishedIds
      if (ids.length !== 1) {
        // Preserve fail-closed behavior in existing CLI consumers until I4 wires coverage.
        Object.assign(entry, { classification: "discovery_exception", reason: ids.length ? "múltiplos registros na publicação; vínculo exige desambiguação" : "publicação sem registro identificável; vínculo e cobertura permanecem pendentes" })
        continue
      }
      entry.registration_id = ids[0]
      const observation = registry.get(ids[0]) ?? await query(ids[0])
      if (observation.registry.registration_id !== ids[0]) throw new Error("registro retornado conflitante com publicação")
      registry.set(ids[0], observation)
      entry.registry_sha256 = observation.evidence_sha256
      const official = observation.registry
      const institute = listing.id === "poderdata" ? /PoderData/i : listing.id === "folha-poder" ? /Datafolha/i : /Real Time Big Data/i
      if (!institute.test(official.institute)) throw new Error("instituto do registro conflitante com a fonte aprovada")
      const offices = (["Governador", "Presidente"] as const).filter((office) => official.office.includes(office))
      const office = link.office_hint && offices.includes(link.office_hint) ? link.office_hint : offices.length === 1 ? offices[0] : null
      if (!office || (link.office_hint && link.office_hint !== office)) throw new Error("cargo da publicação conflitante com registro")
      const normalize = (value: string) => value.normalize("NFC").toLocaleUpperCase("pt-BR")
      const uf = ["BR", ...getEstadoUFs().map((value) => value.toUpperCase())].find((value) => [value, value === "BR" ? "BRASIL" : normalize(getEstadoNome(value)!)].includes(normalize(official.geography)))
      entry.geography_code = uf
      entry.registry_inventory_match = Boolean(input.inventory?.geographies.find((geo) => geo.geography_code === uf)?.records.some((record) => record.registration_id === ids[0]))
      if (!uf || (link.geography_hint && link.geography_hint !== uf) || (office === "Presidente" && uf !== "BR") || (office === "Governador" && uf === "BR")) throw new Error("geografia conflitante ou não contemplada pelo contrato")
      if (input.uf && input.uf !== "ALL" && input.uf !== uf) { entries.pop(); continue }
      const sourceId = listing.source_ids.find((id) => id.includes(office === "Presidente" ? "nacional" : "estaduais"))
      if (!sourceId || (input.sourceId && input.sourceId !== "all" && input.sourceId !== sourceId)) throw new Error("fonte sem contrato aprovado para o cargo")
      if (!obterAdaptadorMonitoramento(sourceId).allowed_origins.includes(url.origin)) throw new Error("origem fora do adaptador")
      const key = `${sourceId}:${ids[0]}:${office}:${uf}`
      if (targets.has(key)) {
        const previous = targets.get(key)!
        previous.alternative_urls = [...new Set([...(previous.alternative_urls ?? []), link.url])].filter((url) => url !== previous.url)
        Object.assign(entry, { status: "duplicate_registration", reason: "mesmo registro; publicação complementar preservada", poll_id: previous.poll_id }); continue
      }
      const known = input.knownTargets.find((target) => target.source_id === sourceId && target.registration_id === ids[0] && target.office === office && target.geography_code === uf)
      const pollId = known?.poll_id ?? `${sourceId.replace(/-2026$/, "")}-${ids[0].toLowerCase().replace("/", "-")}`
      const target: AlvoMonitoramento = known ? { ...known, url: link.url, alternative_urls: [...new Set([known.url, ...(known.alternative_urls ?? [])])].filter((url) => url !== link.url) } : {
        poll_id: pollId, source_id: sourceId, url: link.url, registration_id: ids[0], registry_url: observation.source_url,
        office, geography: uf === "BR" ? "Brasil" : getEstadoNome(uf)!, geography_code: uf,
        turn: 1, scenario_id: `${pollId}-1t`, scenario_label: "Intenção de voto no 1º turno", scenario_question: null, population: "eleitores",
      }
      targets.set(key, target)
      Object.assign(entry, { status: "target_validated", reason: "registro e escopo verificados; resultados ainda exigem coleta integral", poll_id: pollId })
    } catch (error) { entry.reason = error instanceof Error ? error.message : String(error) }
  }
  return { targets: [...targets.values()], registry: [...registry.values()], entries }
}
