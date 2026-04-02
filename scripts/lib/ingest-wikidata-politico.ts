import { supabase } from "./supabase"
import { loadCandidatos, fetchJSON, sleep } from "./helpers"
import { log, warn } from "./logger"
import { resolveCanonicalParty } from "./party-canonical"
import type { IngestResult } from "./types"

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
const HEADERS = {
  Accept: "application/sparql-results+json",
  "User-Agent": "PuxaFicha/1.0 (puxaficha.com.br)",
}
const args = process.argv.slice(2)
const slugArgs = args
  .filter((arg, index) => args[index - 1] === "--slug")
  .flatMap((value) => value.split(","))
  .map((value) => value.trim())
  .filter(Boolean)
const filterSlugs = slugArgs.length > 0 ? new Set(slugArgs) : null

interface SparqlBinding {
  party?: { value: string }
  partyLabel?: { value: string }
  partyStart?: { value: string }
  partyEnd?: { value: string }
  office?: { value: string }
  officeLabel?: { value: string }
  officeStart?: { value: string }
  officeEnd?: { value: string }
}

interface SparqlResponse {
  results?: {
    bindings?: SparqlBinding[]
  }
}

interface PartyMembership {
  sigla: string
  label: string
  startDate: string | null
  endDate: string | null
}

interface OfficeHeld {
  label: string
  startDate: string | null
  endDate: string | null
}

const STATE_NAMES: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function extractDate(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value.replace(/^\+/, "")
  const iso = cleaned.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  return iso ?? null
}

function extractYear(value: string | null | undefined): number | null {
  const iso = extractDate(value)
  if (!iso) return null
  const year = Number.parseInt(iso.slice(0, 4), 10)
  return Number.isNaN(year) ? null : year
}

function resolveEstadoSigla(label: string): string {
  const normalized = normalizeText(label)
  for (const [name, sigla] of Object.entries(STATE_NAMES)) {
    if (normalized.includes(name)) return sigla
  }
  return ""
}

function inferCargo(label: string): { cargo: string; estado: string } {
  const normalized = normalizeText(label)

  if (normalized.includes("vice presidente")) return { cargo: "Vice-Presidente", estado: "" }
  if (normalized.includes("presidente do brasil") || normalized.includes("presidente da republica")) {
    return { cargo: "Presidente da República", estado: "" }
  }
  if (normalized.includes("vice governador")) return { cargo: "Vice-Governador", estado: resolveEstadoSigla(label) }
  if (normalized.includes("governador")) return { cargo: "Governador", estado: resolveEstadoSigla(label) }
  if (normalized.includes("vice prefeito")) return { cargo: "Vice-Prefeito", estado: resolveEstadoSigla(label) }
  if (normalized.includes("prefeito")) return { cargo: "Prefeito", estado: resolveEstadoSigla(label) }
  if (normalized.includes("deputado federal")) return { cargo: "Deputado Federal", estado: resolveEstadoSigla(label) }
  if (normalized.includes("deputado estadual")) return { cargo: "Deputado Estadual", estado: resolveEstadoSigla(label) }
  if (normalized.includes("deputado distrital")) return { cargo: "Deputado Distrital", estado: "DF" }
  if (normalized.includes("senador")) return { cargo: "Senador", estado: resolveEstadoSigla(label) }
  if (normalized.includes("vereador")) return { cargo: "Vereador", estado: resolveEstadoSigla(label) }
  if (normalized.includes("ministro")) return { cargo: "Ministro", estado: "" }
  if (normalized.includes("secretario")) return { cargo: "Secretário", estado: resolveEstadoSigla(label) }

  return { cargo: label.trim(), estado: resolveEstadoSigla(label) }
}

function currentPartyForYear(parties: PartyMembership[], year: number | null): string | null {
  if (year == null) return null

  const active = parties
    .filter((party) => {
      const start = extractYear(party.startDate)
      const end = extractYear(party.endDate)
      if (start == null) return false
      if (end == null) return year >= start
      return year >= start && year <= end
    })
    .sort((left, right) => {
      const leftStart = left.startDate ?? "0000-00-00"
      const rightStart = right.startDate ?? "0000-00-00"
      return rightStart.localeCompare(leftStart)
    })

  return active[0]?.sigla ?? null
}

async function fetchPartyMemberships(qid: string): Promise<PartyMembership[]> {
  const query = `
SELECT ?party ?partyLabel ?partyStart ?partyEnd WHERE {
  wd:${qid} p:P102 ?partyStmt .
  ?partyStmt ps:P102 ?party .
  OPTIONAL { ?partyStmt pq:P580 ?partyStart }
  OPTIONAL { ?partyStmt pq:P582 ?partyEnd }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en" }
}
ORDER BY ?partyStart
`
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`
  const json = await fetchJSON<SparqlResponse>(url, HEADERS, 3, 20000)
  const bindings = json.results?.bindings ?? []
  const deduped = new Map<string, PartyMembership>()

  for (const row of bindings) {
    const rawParty = row.partyLabel?.value
    if (!rawParty) continue
    const sigla = resolveCanonicalParty(rawParty)?.sigla ?? rawParty.trim().toUpperCase()
    const startDate = extractDate(row.partyStart?.value)
    const endDate = extractDate(row.partyEnd?.value)
    const key = [sigla, startDate ?? "", endDate ?? ""].join("|")
    if (deduped.has(key)) continue
    deduped.set(key, {
      sigla,
      label: rawParty,
      startDate,
      endDate,
    })
  }

  return [...deduped.values()].sort((left, right) => {
    const leftDate = left.startDate ?? "9999-12-31"
    const rightDate = right.startDate ?? "9999-12-31"
    return leftDate.localeCompare(rightDate)
  })
}

async function fetchOffices(qid: string): Promise<OfficeHeld[]> {
  const query = `
SELECT ?office ?officeLabel ?officeStart ?officeEnd WHERE {
  wd:${qid} p:P39 ?officeStmt .
  ?officeStmt ps:P39 ?office .
  OPTIONAL { ?officeStmt pq:P580 ?officeStart }
  OPTIONAL { ?officeStmt pq:P582 ?officeEnd }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en" }
}
ORDER BY ?officeStart
`
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`
  const json = await fetchJSON<SparqlResponse>(url, HEADERS, 3, 20000)
  const bindings = json.results?.bindings ?? []
  const deduped = new Map<string, OfficeHeld>()

  for (const row of bindings) {
    const label = row.officeLabel?.value?.trim()
    if (!label) continue
    const startDate = extractDate(row.officeStart?.value)
    const endDate = extractDate(row.officeEnd?.value)
    const key = [label, startDate ?? "", endDate ?? ""].join("|")
    if (deduped.has(key)) continue
    deduped.set(key, {
      label,
      startDate,
      endDate,
    })
  }

  return [...deduped.values()].sort((left, right) => {
    const leftDate = left.startDate ?? "9999-12-31"
    const rightDate = right.startDate ?? "9999-12-31"
    return leftDate.localeCompare(rightDate)
  })
}

async function resolveCandidate(slug: string): Promise<{
  id: string
  wikidata_id: string | null
  partido_sigla: string | null
} | null> {
  const { data } = await supabase
    .from("candidatos")
    .select("id, wikidata_id, partido_sigla")
    .eq("slug", slug)
    .single()

  return data ?? null
}

async function upsertMudancas(
  candidatoId: string,
  slug: string,
  parties: PartyMembership[],
  currentParty: string | null
): Promise<number> {
  let inserted = 0
  let previousParty: string | null = null

  for (const party of parties) {
    const ano = extractYear(party.startDate)
    if (!party.startDate || ano == null) continue

    if (previousParty === null) {
      previousParty = party.sigla

      const { data: existing } = await supabase
        .from("mudancas_partido")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano", ano)
        .eq("partido_novo", party.sigla)
        .single()

      if (!existing) {
        const { error } = await supabase.from("mudancas_partido").insert({
          candidato_id: candidatoId,
          partido_anterior: "Sem partido",
          partido_novo: party.sigla,
          data_mudanca: party.startDate,
          ano,
          contexto: "Wikidata P102 (filiacao inicial conhecida)",
        })
        if (error) {
          warn("wikidata-politico", `  ${slug}: erro filiacao inicial ${error.message}`)
        } else {
          inserted++
        }
      }

      continue
    }

    if (previousParty === party.sigla) continue

    const { data: existing } = await supabase
      .from("mudancas_partido")
      .select("id")
      .eq("candidato_id", candidatoId)
      .eq("ano", ano)
      .eq("partido_novo", party.sigla)
      .single()

    if (!existing) {
      const { error } = await supabase.from("mudancas_partido").insert({
        candidato_id: candidatoId,
        partido_anterior: previousParty,
        partido_novo: party.sigla,
        data_mudanca: party.startDate,
        ano,
        contexto: "Wikidata P102",
      })
      if (error) {
        warn("wikidata-politico", `  ${slug}: erro mudanca partido ${error.message}`)
      } else {
        inserted++
      }
    }

    previousParty = party.sigla
  }

  if (!currentParty || parties.length === 0) return inserted

  const latestKnown = parties
    .filter((party) => party.startDate)
    .sort((left, right) => (right.startDate ?? "").localeCompare(left.startDate ?? ""))[0]

  if (!latestKnown || latestKnown.sigla === currentParty) return inserted

  log(
    "wikidata-politico",
    `  ${slug}: partido atual do perfil (${currentParty}) diverge da ultima filiacao Wikidata (${latestKnown.sigla})`
  )
  return inserted
}

async function upsertHistorico(
  candidatoId: string,
  slug: string,
  offices: OfficeHeld[],
  parties: PartyMembership[]
): Promise<number> {
  let inserted = 0

  for (const office of offices) {
    const inicio = extractYear(office.startDate)
    if (inicio == null) continue

    const fim = extractYear(office.endDate)
    const inferred = inferCargo(office.label)
    const party = currentPartyForYear(parties, inicio)

    const { data: existing } = await supabase
      .from("historico_politico")
      .select("id")
      .eq("candidato_id", candidatoId)
      .eq("cargo", inferred.cargo)
      .eq("periodo_inicio", inicio)
      .single()

    const row = {
      candidato_id: candidatoId,
      cargo: inferred.cargo,
      periodo_inicio: inicio,
      periodo_fim: fim,
      partido: party,
      estado: inferred.estado || null,
      eleito_por: null,
      observacoes: `Importado automaticamente de Wikidata P39 em ${new Date().toISOString().slice(0, 10)}`,
    }

    if (existing) {
      const { error } = await supabase.from("historico_politico").update(row).eq("id", existing.id)
      if (error) {
        warn("wikidata-politico", `  ${slug}: erro atualizando historico ${error.message}`)
      }
      continue
    }

    const { error } = await supabase.from("historico_politico").insert(row)
    if (error) {
      warn("wikidata-politico", `  ${slug}: erro inserindo historico ${error.message}`)
      continue
    }
    inserted++
  }

  return inserted
}

export async function ingestWikidataPolitico(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos().filter((cand) => !filterSlugs || filterSlugs.has(cand.slug))
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const result: IngestResult = {
      source: "wikidata-politico",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    const start = Date.now()

    try {
      const dbCandidate = await resolveCandidate(cand.slug)
      if (!dbCandidate?.id) {
        result.errors.push("Candidato nao encontrado no banco")
        results.push(result)
        continue
      }

      if (!dbCandidate.wikidata_id) {
        log("wikidata-politico", `  ${cand.slug}: sem wikidata_id, pulando`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const parties = await fetchPartyMemberships(dbCandidate.wikidata_id)
      await sleep(250)
      const offices = await fetchOffices(dbCandidate.wikidata_id)
      await sleep(250)

      const mudancas = await upsertMudancas(dbCandidate.id, cand.slug, parties, dbCandidate.partido_sigla)
      const historico = await upsertHistorico(dbCandidate.id, cand.slug, offices, parties)

      if (mudancas > 0) result.tables_updated.push("mudancas_partido")
      if (historico > 0) result.tables_updated.push("historico_politico")
      result.rows_upserted = mudancas + historico

      log(
        "wikidata-politico",
        `  ${cand.slug}: +${mudancas} mudancas_partido, +${historico} historico_politico`
      )
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
      warn("wikidata-politico", `  ${cand.slug}: ${err instanceof Error ? err.message : String(err)}`)
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    await sleep(750)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestWikidataPolitico().then((results) => console.log(JSON.stringify(results, null, 2)))
}
