import { supabase } from "./supabase"
import { loadCandidatosPublicos } from "./helpers-db"
import { fetchJSON, sleep } from "./helpers"
import { log, warn } from "./logger"
import { resolveCanonicalParty } from "./party-canonical"
import { canonicalCargo } from "./cargo-utils"
import { sanitizeTemplateText } from "./ptbr-sanitize"
import { extractEstadoFromText } from "@/lib/br-uf"
import { finalizarColeta, registrarErroColeta } from "./coleta-resultado"
import type { IngestResult } from "./types"
import { stripAccents } from "../../src/lib/strip-accents"

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
const HEADERS = {
  Accept: "application/sparql-results+json",
  "User-Agent": "PuxaFicha/1.0 (puxaficha.com.br)",
}
const args = process.argv.slice(2)
const slugArgs = args
  .filter((arg) => arg.startsWith("--slug="))
  .flatMap((value) => value.slice("--slug=".length).split(","))
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
  /** P585 point in time — fallback quando P580 (início) ausente */
  officePoint?: { value: string }
  officeEnd?: { value: string }
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

type JsonFetcher = typeof fetchJSON

export interface IngestWikidataPoliticoDependencies {
  database: typeof supabase
  loadCandidates: typeof loadCandidatosPublicos
  fetchJson: JsonFetcher
  wait: typeof sleep
}

interface FonteWikidata<T> {
  items: T[]
  sourceRows: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function validarBindingsPoliticos(
  payload: unknown,
  obrigatorios: readonly (keyof SparqlBinding)[],
): SparqlBinding[] {
  if (!isObject(payload) || !isObject(payload.results) || !Array.isArray(payload.results.bindings)) {
    throw new Error("Resposta SPARQL invalida: results.bindings ausente ou nao e array")
  }

  return payload.results.bindings.map((raw, index) => {
    if (!isObject(raw)) {
      throw new Error(`Resposta SPARQL invalida: binding ${index} nao e objeto`)
    }
    for (const property of obrigatorios) {
      const field = raw[property]
      if (!isObject(field) || typeof field.value !== "string" || field.value.trim() === "") {
        throw new Error(`Resposta SPARQL invalida: binding ${index}.${String(property)} sem value string`)
      }
    }
    for (const [property, field] of Object.entries(raw)) {
      if (!isObject(field) || typeof field.value !== "string") {
        throw new Error(`Resposta SPARQL invalida: binding ${index}.${property} sem value string`)
      }
    }
    return raw as SparqlBinding
  })
}

function normalizeText(value: string): string {
  return stripAccents(value)
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

/** P580 ausente: usar P585 ou timestamp Wikidata com só ano (+1989-00-00T00:00:00Z). */
function wikidataTimeToStartIso(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/^\+/, "")
  const iso = cleaned.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (iso) return iso
  const y = cleaned.match(/^(\d{4})/)?.[1]
  return y ? `${y}-01-01` : null
}

function resolveEstadoSigla(label: string): string {
  return extractEstadoFromText(label) ?? ""
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

export async function fetchPartyMemberships(
  qid: string,
  fetcher: JsonFetcher = fetchJSON,
): Promise<FonteWikidata<PartyMembership>> {
  if (!/^Q[1-9]\d*$/.test(qid)) throw new Error(`wikidata_id invalido: ${qid}`)
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
  const json = await fetcher<unknown>(url, HEADERS, 3, 20000)
  const bindings = validarBindingsPoliticos(json, ["party", "partyLabel"])
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

  const items = [...deduped.values()].sort((left, right) => {
    const leftDate = left.startDate ?? "9999-12-31"
    const rightDate = right.startDate ?? "9999-12-31"
    return leftDate.localeCompare(rightDate)
  })
  return { items, sourceRows: bindings.length }
}

export async function fetchOffices(
  qid: string,
  fetcher: JsonFetcher = fetchJSON,
): Promise<FonteWikidata<OfficeHeld>> {
  if (!/^Q[1-9]\d*$/.test(qid)) throw new Error(`wikidata_id invalido: ${qid}`)
  const query = `
SELECT ?office ?officeLabel ?officeStart ?officePoint ?officeEnd WHERE {
  wd:${qid} p:P39 ?officeStmt .
  ?officeStmt ps:P39 ?office .
  OPTIONAL { ?officeStmt pq:P580 ?officeStart }
  OPTIONAL { ?officeStmt pq:P585 ?officePoint }
  OPTIONAL { ?officeStmt pq:P582 ?officeEnd }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en" }
}
ORDER BY ?officeStart ?officePoint
`
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`
  const json = await fetcher<unknown>(url, HEADERS, 3, 20000)
  const bindings = validarBindingsPoliticos(json, ["office", "officeLabel"])
  const deduped = new Map<string, OfficeHeld>()

  for (const row of bindings) {
    const label = row.officeLabel?.value?.trim()
    if (!label) continue
    const startDate =
      extractDate(row.officeStart?.value) ?? wikidataTimeToStartIso(row.officePoint?.value)
    const endDate = extractDate(row.officeEnd?.value)
    const key = [label, startDate ?? "", endDate ?? ""].join("|")
    if (deduped.has(key)) continue
    deduped.set(key, {
      label,
      startDate,
      endDate,
    })
  }

  const items = [...deduped.values()].sort((left, right) => {
    const leftDate = left.startDate ?? "9999-12-31"
    const rightDate = right.startDate ?? "9999-12-31"
    return leftDate.localeCompare(rightDate)
  })
  return { items, sourceRows: bindings.length }
}

async function resolveCandidate(database: typeof supabase, slug: string): Promise<{
  id: string
  wikidata_id: string | null
  partido_sigla: string | null
} | null> {
  const { data, error } = await database
    .from("candidatos")
    .select("id, wikidata_id, partido_sigla")
    .eq("slug", slug)
    .single()

  if (error) throw new Error(`Erro lendo candidato: ${error.message}`)

  return data ?? null
}

async function upsertMudancas(
  database: typeof supabase,
  candidatoId: string,
  slug: string,
  parties: PartyMembership[],
  currentParty: string | null,
  onWrite: () => void,
): Promise<number> {
  let inserted = 0
  let previousParty: string | null = null

  for (const party of parties) {
    const ano = extractYear(party.startDate)
    if (!party.startDate || ano == null) continue

    if (previousParty === null) {
      previousParty = party.sigla

      const { data: existing, error: selectError } = await database
        .from("mudancas_partido")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano", ano)
        .eq("partido_novo", party.sigla)
        .maybeSingle()
      if (selectError) throw new Error(`Erro consultando filiacao inicial: ${selectError.message}`)

      if (!existing) {
        const { error } = await database.from("mudancas_partido").insert({
          candidato_id: candidatoId,
          partido_anterior: "Sem partido",
          partido_novo: party.sigla,
          data_mudanca: party.startDate,
          ano,
          contexto: "Wikidata P102 (filiação inicial conhecida)",
        })
        if (error) {
          throw new Error(`Erro inserindo filiacao inicial: ${error.message}`)
        } else {
          inserted++
          onWrite()
        }
      }

      continue
    }

    if (previousParty === party.sigla) continue

    const { data: existing, error: selectError } = await database
      .from("mudancas_partido")
      .select("id")
      .eq("candidato_id", candidatoId)
      .eq("ano", ano)
      .eq("partido_novo", party.sigla)
      .maybeSingle()
    if (selectError) throw new Error(`Erro consultando mudanca de partido: ${selectError.message}`)

    if (!existing) {
      const { error } = await database.from("mudancas_partido").insert({
        candidato_id: candidatoId,
        partido_anterior: previousParty,
        partido_novo: party.sigla,
        data_mudanca: party.startDate,
        ano,
        contexto: "Wikidata P102",
      })
      if (error) {
        throw new Error(`Erro inserindo mudanca de partido: ${error.message}`)
      } else {
        inserted++
        onWrite()
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
  database: typeof supabase,
  candidatoId: string,
  slug: string,
  offices: OfficeHeld[],
  parties: PartyMembership[],
  onWrite: () => void,
): Promise<number> {
  let inserted = 0

  for (const office of offices) {
    const inicio = extractYear(office.startDate)
    if (inicio == null) continue

    const fim = extractYear(office.endDate)
    const inferred = inferCargo(office.label)
    const party = currentPartyForYear(parties, inicio)
    const cargoCanonico = canonicalCargo(inferred.cargo)

    // -----------------------------------------------------------------------
    // Guard 1: match on (candidato_id, cargo_canonico, periodo_inicio)
    // -----------------------------------------------------------------------
    const { data: existingRows, error: existingError } = await database
      .from("historico_politico")
      .select("id, observacoes")
      .eq("candidato_id", candidatoId)
      .eq("cargo_canonico", cargoCanonico)
      .eq("periodo_inicio", inicio)
      .limit(1)
    if (existingError) throw new Error(`Erro consultando historico existente: ${existingError.message}`)
    const existing = existingRows?.[0]

    if (existing) {
      if ((existing.observacoes || "").includes("TSE")) continue
      const row = {
        candidato_id: candidatoId,
        cargo: inferred.cargo,
        cargo_canonico: cargoCanonico,
        tipo_evento: "mandato",
        periodo_inicio: inicio,
        periodo_fim: fim,
        partido: party,
        estado: inferred.estado || null,
        eleito_por: null,
        observacoes: sanitizeTemplateText(`Importado automaticamente de Wikidata P39 em ${new Date().toISOString().slice(0, 10)}`),
        proveniencia: "wikidata" as const,
      }
      const { error } = await database.from("historico_politico").update(row).eq("id", existing.id)
      if (error) {
        throw new Error(`Erro atualizando historico: ${error.message}`)
      }
      inserted++
      onWrite()
      continue
    }

    // -----------------------------------------------------------------------
    // Guard 2: ano ±1 com mesmo cargo canônico (TSE âncora vs posse Wikidata)
    // -----------------------------------------------------------------------
    const { data: nearby, error: nearbyError } = await database
      .from("historico_politico")
      .select("id, cargo, cargo_canonico, observacoes")
      .eq("candidato_id", candidatoId)
      .gte("periodo_inicio", inicio - 1)
      .lte("periodo_inicio", inicio + 1)
    if (nearbyError) throw new Error(`Erro consultando historico proximo: ${nearbyError.message}`)

    const hasNearbySameCanon = (nearby || []).some((r) => {
      const existingCanon = (r.cargo_canonico && r.cargo_canonico.trim()) || canonicalCargo(r.cargo)
      return existingCanon === cargoCanonico
    })
    if (hasNearbySameCanon) continue

    const row = {
      candidato_id: candidatoId,
      cargo: inferred.cargo,
      cargo_canonico: cargoCanonico,
      tipo_evento: "mandato",
      periodo_inicio: inicio,
      periodo_fim: fim,
      partido: party,
      estado: inferred.estado || null,
      eleito_por: null,
      observacoes: sanitizeTemplateText(`Importado automaticamente de Wikidata P39 em ${new Date().toISOString().slice(0, 10)}`),
      proveniencia: "wikidata" as const,
    }

    const { error } = await database.from("historico_politico").insert(row)
    if (error) {
      throw new Error(`Erro inserindo historico: ${error.message}`)
    }
    inserted++
    onWrite()
  }

  return inserted
}

export async function ingestWikidataPolitico(
  overrides: Partial<IngestWikidataPoliticoDependencies> = {},
): Promise<IngestResult[]> {
  const deps: IngestWikidataPoliticoDependencies = {
    database: supabase,
    loadCandidates: loadCandidatosPublicos,
    fetchJson: fetchJSON,
    wait: sleep,
    ...overrides,
  }
  const candidatos = (await deps.loadCandidates()).filter((cand) => !filterSlugs || filterSlugs.has(cand.slug))
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
      const dbCandidate = await resolveCandidate(deps.database, cand.slug)
      if (!dbCandidate?.id) {
        throw new Error("Candidato nao encontrado no banco")
      }

      if (!dbCandidate.wikidata_id) {
        log("wikidata-politico", `  ${cand.slug}: sem wikidata_id, pulando`)
        result.skipped = true
        result.skip_reason = "sem wikidata_id"
        finalizarColeta(result, {
          aplicavel: false,
          volumeFonte: 0,
          detalhe: "sem wikidata_id: nenhuma consulta remota foi executada",
        })
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const partySource = await fetchPartyMemberships(dbCandidate.wikidata_id, deps.fetchJson)
      await deps.wait(250)
      const officeSource = await fetchOffices(dbCandidate.wikidata_id, deps.fetchJson)
      await deps.wait(250)
      const parties = partySource.items
      const offices = officeSource.items

      const registrarEscrita = (table: "mudancas_partido" | "historico_politico") => {
        result.rows_upserted++
        if (!result.tables_updated.includes(table)) result.tables_updated.push(table)
      }
      const mudancas = await upsertMudancas(
        deps.database,
        dbCandidate.id,
        cand.slug,
        parties,
        dbCandidate.partido_sigla,
        () => registrarEscrita("mudancas_partido"),
      )
      const historico = await upsertHistorico(
        deps.database,
        dbCandidate.id,
        cand.slug,
        offices,
        parties,
        () => registrarEscrita("historico_politico"),
      )

      const sourceRows = partySource.sourceRows + officeSource.sourceRows
      finalizarColeta(result, {
        aplicavel: true,
        volumeFonte: sourceRows,
        detalhe: `${partySource.sourceRows} binding(s) de filiacao e ${officeSource.sourceRows} binding(s) de cargo retornados pela fonte`,
      })
      log(
        "wikidata-politico",
        `  ${cand.slug}: +${mudancas} mudancas_partido, +${historico} historico_politico`
      )
    } catch (err) {
      registrarErroColeta(result, err)
      warn("wikidata-politico", `  ${cand.slug}: ${err instanceof Error ? err.message : String(err)}`)
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    await deps.wait(750)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestWikidataPolitico().then((results) => console.log(JSON.stringify(results, null, 2)))
}
