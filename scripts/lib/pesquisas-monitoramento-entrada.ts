import "server-only"

import { createHash } from "node:crypto"
import { getEstadoNome, getEstadoUFs } from "../../src/lib/br-uf"
import { LISTAGENS_PESQUISAS, type ObservacaoListagemPesquisas } from "./pesquisas-monitoramento-descoberta"
import { obterAdaptadorMonitoramento, selecionarRegistroPublicado, type AlvoMonitoramento } from "./pesquisas-monitoramento-adapters"
import { consultarRegistroPesqele, criarOrcamentoDescoberta, PESQELE_ORIGIN, type ObservacaoPesqele, type InventarioRegistrosPesqele, type OrcamentoDescoberta } from "./pesquisas-monitoramento-pesqele"
import type { ClienteHttpMonitoramento } from "./pesquisas-monitoramento-rede"
import { isObservedPollPublication } from "./pesquisas-publication-observation"

class DiscoveryCurationError extends Error {}

export interface EntradaDescoberta {
  url: string
  execution_status: "complete" | "failed"
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

const PESQELE_SEARCH_URL = `${PESQELE_ORIGIN}/app/pesquisa/listar.xhtml`
const REGISTRY_RECEIPT_MAX_AGE_MS = 2 * 60 * 60 * 1000
const REGISTRATION_ID = /^[A-Z]{2}-\d{5}\/2026$/
const ISO_DATE = /^2026-\d{2}-\d{2}$/

function validDate(value: unknown): boolean {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validTimestamp(value: unknown, now: number): boolean {
  if (typeof value !== "string") return false
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{3})?Z$/.exec(value)
  if (!match) return false
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return false
  const canonical = `${match[1]}${match[2] ?? ".000"}Z`
  if (new Date(timestamp).toISOString() !== canonical) return false
  return timestamp <= now && now - timestamp <= REGISTRY_RECEIPT_MAX_AGE_MS
}

function delimitedValue(text: string, start: string, end: string): string | null {
  const startIndex = text.indexOf(start)
  if (startIndex < 0) return null
  const valueStart = startIndex + start.length
  const endIndex = text.indexOf(end, valueStart)
  return (endIndex < 0 ? text.slice(valueStart) : text.slice(valueStart, endIndex)).trim()
}

function brazilianDate(value: string): string {
  const [year, month, day] = value.split("-")
  return `${day}/${month}/${year}`
}

function receiptMatchesPublicText(observation: ObservacaoPesqele): boolean {
  const registry = observation.registry
  const text = observation.public_text
  const confidence = text.match(/nível de confiança[^0-9]{0,80}(\d+(?:[,.]\d+)?)\s*%/i)?.[1]?.replace(",", ".")
  const margin = text.match(/margem de erro[^.]{0,160}?([0-9]+(?:[,.][0-9]+)?)\s*(?:\([^)]*\)\s*)?pontos/i)?.[1]?.replace(",", ".")
  return text.includes(`Visualizar Pesquisa Eleitoral - ${registry.registration_id}`)
    && delimitedValue(text, `Número de identificação: `, " Data de registro:") === registry.registration_id
    && delimitedValue(text, `${registry.registration_id} `, " Número de identificação:") === registry.geography
    && delimitedValue(text, "Cargo(s): ", " Data de divulgação:") === registry.office
    && delimitedValue(text, "Empresa contratada/ Nome Fantasia: ", " Eleição:") === registry.institute
    && delimitedValue(text, "Data de início da pesquisa: ", " Data de término da pesquisa:") === brazilianDate(registry.field_start)
    && delimitedValue(text, "Data de término da pesquisa: ", " Estatístico responsável:") === brazilianDate(registry.field_end)
    && delimitedValue(text, "Data de divulgação: ", " Empresa contratada/ Nome Fantasia:") === brazilianDate(observation.publication_date)
    && delimitedValue(text, "Entrevistados: ", " Data de início da pesquisa:") === String(registry.sample_size)
    && delimitedValue(text, "Metodologia de pesquisa: ", " Plano amostral") === observation.method
    && confidence === String(observation.confidence_percent)
    && margin === String(registry.margin_error_pp)
}

function validRegistryReceipt(observation: unknown, now: number): observation is ObservacaoPesqele {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) return false
  const value = observation as Partial<ObservacaoPesqele>
  const registry = value.registry
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) return false
  const requiredStrings = [
    value.source_url, value.observed_at, value.publication_date, value.method, value.public_text,
    value.evidence_sha256, registry.registration_id, registry.office, registry.geography,
    registry.field_start, registry.field_end, registry.institute,
  ]
  if (requiredStrings.some((entry) => typeof entry !== "string" || !entry.trim())) return false
  const marginError = registry.margin_error_pp
  if (typeof marginError !== "number" || !Number.isFinite(marginError) || marginError <= 0 || marginError >= 100) return false
  const complete = value as ObservacaoPesqele
  if (complete.source_url !== PESQELE_SEARCH_URL || !REGISTRATION_ID.test(registry.registration_id)
    || !validDate(registry.field_start) || !validDate(registry.field_end) || !validDate(complete.publication_date)
    || registry.field_start > registry.field_end || registry.field_end > complete.publication_date
    || !validTimestamp(complete.observed_at, now) || !/^[a-f0-9]{64}$/.test(complete.evidence_sha256)
    || createHash("sha256").update(complete.public_text).digest("hex") !== complete.evidence_sha256
    || !Number.isInteger(registry.sample_size) || registry.sample_size <= 0
    || !Number.isFinite(complete.confidence_percent) || complete.confidence_percent <= 0 || complete.confidence_percent >= 100
    || !receiptMatchesPublicText(complete)) return false
  return true
}

function loadRegistryReceipt(input: {
  registryCache?: ObservacaoPesqele[]
  registryCacheGeneratedAt?: string
  now?: Date
}): Map<string, ObservacaoPesqele> {
  const now = input.now?.getTime() ?? Date.now()
  if (!validTimestamp(input.registryCacheGeneratedAt, now) || !Array.isArray(input.registryCache)) return new Map()
  const cache = new Map<string, ObservacaoPesqele>()
  const invalidIds = new Set<string>()
  for (const observation of input.registryCache) {
    const possibleId = observation && typeof observation === "object" && !Array.isArray(observation)
      && "registry" in observation && observation.registry && typeof observation.registry === "object"
      ? (observation.registry as Partial<ObservacaoPesqele["registry"]>).registration_id : undefined
    if (!validRegistryReceipt(observation, now)) {
      if (typeof possibleId === "string" && REGISTRATION_ID.test(possibleId)) {
        invalidIds.add(possibleId)
        cache.delete(possibleId)
      }
      continue
    }
    const id = observation.registry.registration_id
    if (invalidIds.has(id) || cache.has(id)) {
      cache.delete(id)
      invalidIds.add(id)
      continue
    }
    cache.set(id, observation)
  }
  return cache
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
  registryCache?: ObservacaoPesqele[]
  registryCacheGeneratedAt?: string
  now?: Date
}): Promise<{ targets: AlvoMonitoramento[]; registry: ObservacaoPesqele[]; entries: EntradaDescoberta[] }> {
  const budget = input.budget ?? criarOrcamentoDescoberta()
  const client = input.client ?? budget.client(LISTAGENS_PESQUISAS.map((listing) => new URL(listing.url).origin))
  const queryOnce = input.queryRegistry ?? ((id: string) => consultarRegistroPesqele(id, budget.client([PESQELE_ORIGIN], true)))
  // O PesqEle e um app JSF com sessao, e uma consulta lenta derruba a entrada
  // inteira. Em 19/09/2026 UMA recheca (BR-04974/2026, poder360) expirou por
  // timeout, marcou a entrada como `failed` e, por cli.ts, virou alerta global
  // `discovery_source_failure`: o lote inteiro bloqueou, incluindo cinco
  // pesquisas ja aprovadas que nada tinham a ver com ela (run 35447213619).
  // O laco do inventario em pesquisas-monitoramento-pesqele.ts ja reexecuta uma
  // vez nesse mesmo erro; aqui nao havia retry nenhum, e era so essa assimetria.
  // Fail-closed continua de pe: esgotadas as tentativas, o erro sobe igual.
  const query = async (id: string) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await queryOnce(id)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (attempt >= 2 || !reason.startsWith("timeout ao consultar ")) throw error
        // O orcamento decide se ainda ha folga de requisicao, byte e tempo;
        // ele lanca quando nao ha, entao o retry nunca estoura o teto do run.
        budget.check()
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
      }
    }
  }
  const targets = new Map<string, AlvoMonitoramento>()
  const registry = loadRegistryReceipt(input)
  const entries: EntradaDescoberta[] = []
  // Re-read known URLs as well: an unchanged URL can contain a rectification.
  const links = [...new Map(input.observations.flatMap((observation) => observation.links).map((link) => [link.url, link])).values()].sort((a, b) => a.url.localeCompare(b.url))
  for (const [index, link] of links.entries()) {
    const entry: EntradaDescoberta = { url: link.url, execution_status: "failed", status: "blocked", reason: "unvalidated", geography_hint: link.geography_hint, known_url_rechecked: link.state === "known_url" }
    let publicationObserved = false
    entries.push(entry)
    if (index >= 100) { entry.reason = "limite de 100 URLs por execução; publicação não consultada"; continue }
    try {
      const listing = LISTAGENS_PESQUISAS.find((candidate) => candidate.id === link.listing_id)
      const url = new URL(link.url)
      if (!listing || url.origin !== new URL(listing.url).origin || !listing.articlePath.test(url.pathname) || url.username || url.password || url.search || url.hash) throw new Error("URL fora da listagem aprovada")
      if (input.sourceId && input.sourceId !== "all" && !(listing.source_ids as readonly string[]).includes(input.sourceId)) { entries.pop(); continue }
      if (input.uf && input.uf !== "ALL" && link.geography_hint && input.uf !== link.geography_hint) { entries.pop(); continue }
      if (listing.id === "r7-eleicoes" && link.office_hint === "Presidente") {
        Object.assign(entry, { status: "unsupported_scope", execution_status: "complete", reason: "pesquisa presidencial regional fora do contrato nacional" }); continue
      }
      budget.check()
      const response = await client.getText(url.href)
      entry.source_sha256 = createHash("sha256").update(response.body).digest("hex")
      entry.observed_at = response.observedAt
      publicationObserved = isObservedPollPublication(response.body) && Number.isFinite(Date.parse(response.observedAt))
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
        entry.execution_status = publicationObserved ? "complete" : "failed"
        continue
      }
      entry.registration_id = ids[0]
      const observation = registry.get(ids[0]) ?? await query(ids[0])
      if (observation.registry.registration_id !== ids[0]) throw new Error("registro retornado conflitante com publicação")
      registry.set(ids[0], observation)
      entry.registry_sha256 = observation.evidence_sha256
      const official = observation.registry
      // #401. The official registry already names the geography here, so attribute
      // the entry before any curation branch can throw. An entry that failed with
      // no geography_code is spread over every geography by the coverage builder,
      // and one conflicting publication became 28 identical alerts on 2026-09-20.
      const normalize = (value: string) => value.normalize("NFC").toLocaleUpperCase("pt-BR")
      const uf = ["BR", ...getEstadoUFs().map((value) => value.toUpperCase())].find((value) => [value, value === "BR" ? "BRASIL" : normalize(getEstadoNome(value)!)].includes(normalize(official.geography)))
      entry.geography_code = uf
      entry.registry_inventory_match = Boolean(input.inventory?.geographies.find((geo) => geo.geography_code === uf)?.records.some((record) => record.registration_id === ids[0]))
      const institute = listing.id === "poderdata" ? /PoderData/i : listing.id === "folha-poder" ? /Datafolha/i : /Real Time Big Data/i
      if (!institute.test(official.institute)) throw new DiscoveryCurationError("instituto do registro conflitante com a fonte aprovada")
      const offices = (["Governador", "Presidente"] as const).filter((office) => official.office.includes(office))
      const office = link.office_hint && offices.includes(link.office_hint) ? link.office_hint : offices.length === 1 ? offices[0] : null
      if (!office || (link.office_hint && link.office_hint !== office)) throw new DiscoveryCurationError("cargo da publicação conflitante com registro")
      if (!uf || (link.geography_hint && link.geography_hint !== uf) || (office === "Presidente" && uf !== "BR") || (office === "Governador" && uf === "BR")) throw new DiscoveryCurationError("geografia conflitante ou não contemplada pelo contrato")
      if (input.uf && input.uf !== "ALL" && input.uf !== uf) { entries.pop(); continue }
      const sourceId = listing.source_ids.find((id) => id.includes(office === "Presidente" ? "nacional" : "estaduais"))
      if (!sourceId || (input.sourceId && input.sourceId !== "all" && input.sourceId !== sourceId)) throw new Error("fonte sem contrato aprovado para o cargo")
      if (!obterAdaptadorMonitoramento(sourceId).allowed_origins.includes(url.origin)) throw new Error("origem fora do adaptador")
      const key = `${sourceId}:${ids[0]}:${office}:${uf}`
      if (targets.has(key)) {
        const previous = targets.get(key)!
        previous.alternative_urls = [...new Set([...(previous.alternative_urls ?? []), link.url])].filter((url) => url !== previous.url)
        Object.assign(entry, { status: "duplicate_registration", execution_status: publicationObserved ? "complete" : "failed", reason: "mesmo registro; publicação complementar preservada", poll_id: previous.poll_id }); continue
      }
      const known = input.knownTargets.find((target) => target.source_id === sourceId && target.registration_id === ids[0] && target.office === office && target.geography_code === uf)
      const pollId = known?.poll_id ?? `${sourceId.replace(/-2026$/, "")}-${ids[0].toLowerCase().replace("/", "-")}`
      const target: AlvoMonitoramento = known ? { ...known, url: link.url, alternative_urls: [...new Set([known.url, ...(known.alternative_urls ?? [])])].filter((url) => url !== link.url) } : {
        poll_id: pollId, source_id: sourceId, url: link.url, registration_id: ids[0], registry_url: observation.source_url,
        office, geography: uf === "BR" ? "Brasil" : getEstadoNome(uf)!, geography_code: uf,
        turn: 1, scenario_id: `${pollId}-1t`, scenario_label: "Intenção de voto no 1º turno", scenario_question: null, population: "eleitores",
      }
      targets.set(key, target)
      Object.assign(entry, { status: "target_validated", execution_status: publicationObserved ? "complete" : "failed", reason: "registro e escopo verificados; resultados ainda exigem coleta integral", poll_id: pollId })
    } catch (error) {
      entry.reason = error instanceof Error ? error.message : String(error)
      entry.execution_status = error instanceof DiscoveryCurationError && publicationObserved ? "complete" : "failed"
    }
  }
  return { targets: [...targets.values()], registry: [...registry.values()], entries }
}
