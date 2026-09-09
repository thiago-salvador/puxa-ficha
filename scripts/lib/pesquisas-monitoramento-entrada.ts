import "server-only"

import { createHash } from "node:crypto"
import { getEstadoNome, getEstadoUFs } from "../../src/lib/br-uf"
import { LISTAGENS_PESQUISAS, type ObservacaoListagemPesquisas } from "./pesquisas-monitoramento-descoberta"
import { obterAdaptadorMonitoramento, type AlvoMonitoramento } from "./pesquisas-monitoramento-adapters"
import { consultarRegistroPesqele, type ObservacaoPesqele } from "./pesquisas-monitoramento-pesqele"
import { criarClienteHttpMonitoramento, type ClienteHttpMonitoramento } from "./pesquisas-monitoramento-rede"

export interface EntradaDescoberta {
  url: string
  status: "target_validated" | "duplicate_registration" | "unsupported_scope" | "blocked"
  reason: string
  source_sha256?: string
  observed_at?: string
  poll_id?: string
}

/** Discovery hints route a public registry check; they never supply vote numbers. */
export async function validarEntradasDescobertas(input: {
  observations: ObservacaoListagemPesquisas[]
  knownTargets: AlvoMonitoramento[]
  sourceId?: string
  uf?: string | null
  client?: ClienteHttpMonitoramento
  queryRegistry?: typeof consultarRegistroPesqele
}): Promise<{ targets: AlvoMonitoramento[]; registry: ObservacaoPesqele[]; entries: EntradaDescoberta[] }> {
  const client = input.client ?? criarClienteHttpMonitoramento({ allowedOrigins: LISTAGENS_PESQUISAS.map((listing) => new URL(listing.url).origin), maxBytes: 2_000_000 })
  const query = input.queryRegistry ?? consultarRegistroPesqele
  const targets = new Map<string, AlvoMonitoramento>()
  const registry = new Map<string, ObservacaoPesqele>()
  const entries: EntradaDescoberta[] = []
  const links = input.observations.flatMap((observation) => observation.links).filter((link) => link.state === "pending_validation")
  if (links.length > 100) throw new Error("descoberta acima do limite de 100 URLs por execução")
  for (const link of links) {
    const entry: EntradaDescoberta = { url: link.url, status: "blocked", reason: "unvalidated" }
    entries.push(entry)
    try {
      const listing = LISTAGENS_PESQUISAS.find((candidate) => candidate.id === link.listing_id)
      const url = new URL(link.url)
      if (!listing || url.origin !== new URL(listing.url).origin || !listing.articlePath.test(url.pathname) || url.username || url.password || url.search || url.hash) throw new Error("URL fora da listagem aprovada")
      if (input.sourceId && input.sourceId !== "all" && !(listing.source_ids as readonly string[]).includes(input.sourceId)) { entries.pop(); continue }
      if (input.uf && input.uf !== "ALL" && link.geography_hint && input.uf !== link.geography_hint) { entries.pop(); continue }
      if (listing.id === "r7-eleicoes" && link.office_hint === "Presidente") {
        Object.assign(entry, { status: "unsupported_scope", reason: "pesquisa presidencial regional fora do contrato nacional" }); continue
      }
      const response = await client.getText(url.href)
      entry.source_sha256 = createHash("sha256").update(response.body).digest("hex")
      entry.observed_at = response.observedAt
      const text = response.body.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")
      const ids = [...new Set(text.match(/\b[A-Z]{2}-\d{5}\/2026\b/g) ?? [])]
      if (ids.length !== 1) throw new Error("registro público ausente ou ambíguo na publicação")
      const observation = registry.get(ids[0]) ?? await query(ids[0])
      registry.set(ids[0], observation)
      const official = observation.registry
      const office = /Governador/i.test(official.office) ? "Governador" : /Presidente/i.test(official.office) ? "Presidente" : null
      if (!office || (link.office_hint && link.office_hint !== office)) throw new Error("cargo da publicação conflitante com registro")
      const normalize = (value: string) => value.normalize("NFC").toLocaleUpperCase("pt-BR")
      const uf = ["BR", ...getEstadoUFs().map((value) => value.toUpperCase())].find((value) => [value, value === "BR" ? "BRASIL" : normalize(getEstadoNome(value)!)].includes(normalize(official.geography)))
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
      const target: AlvoMonitoramento = known ? { ...known, url: link.url } : {
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
