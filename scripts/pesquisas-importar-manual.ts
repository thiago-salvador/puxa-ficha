/**
 * Imports manually reviewed poll rounds (Presidente BR and Governador by UF) into the
 * versioned catalogs read by the site.
 *
 * Input rounds use the flat collection format documented in
 * docs/operations/pesquisas-importacao-manual.md. Every round needs a literal capture file
 * and every printed name needs an alias decision (candidate slug or not-candidate), so an
 * unknown name fails closed instead of becoming an unattributed result.
 *
 * Usage:
 *   node --import tsx scripts/pesquisas-importar-manual.ts --input rounds.json [--input more.json]
 *     --aliases aliases.json [--reviewed-at 2026-09-24T12:00:00Z] [--write]
 * Without --write it only validates and prints the plan.
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { BRAZIL_STATES } from "../src/data/brazil-states"

type Json = Record<string, unknown>

export interface RodadaColetada {
  uf: string
  status?: string
  instituto: string
  contratante: string | null
  registration: string | null
  fieldwork_start: string | null
  fieldwork_end: string | null
  publication_date: string | null
  sample_size: number | null
  population: string | null
  margin_error_pp: number | null
  confidence_percent: number | null
  method: string | null
  result_url: string
  supporting_urls?: string[]
  capture_file: string
  scenarios: {
    kind: "estimulado" | "espontaneo"
    label_raw: string
    question: string | null
    results: { raw_label: string; value_percent: number }[]
  }[]
  notes?: string
}

/** Per scope ("BR" or UF): printed label -> candidate slug, or null for non-candidate lines. */
export type DecisoesAlias = Record<string, Record<string, string | null>>

const PRES = "scripts/data/pesquisas-presidencia-2026.json"
const PRES_FONTES = "scripts/data/pesquisas-eleitorais-fontes.json"
const GOV = "scripts/data/pesquisas-governadores-2026.json"
const GOV_FONTES = "scripts/data/pesquisas-governadores-fontes.json"
const PESQELE = "https://pesqele-divulgacao.tse.jus.br/app/pesquisa/listar.xhtml"
const DATE = /^\d{4}-\d{2}-\d{2}$/

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Json).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

const slugify = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const vs = <T>(value: T | null | undefined) =>
  value === null || value === undefined || value === "" ? { value: null, status: "indeterminado" } : { value, status: "publicado" }
const norm = (value: string) => slugify(value).replace(/-/g, "")

function registrationParts(code: string | null) {
  const match = code?.match(/^([A-Z]{2})-?(\d{5})\/(?:20)?(\d{2})$/i)
  return match ? { uf: match[1].toUpperCase(), number: match[2], year: `20${match[3]}` } : null
}

/** Returns human-readable problems; an empty list means the round can be imported. */
export function validarRodada(rodada: RodadaColetada, aliases: DecisoesAlias): string[] {
  const problems: string[] = []
  const where = `${rodada.uf} ${rodada.instituto} ${rodada.fieldwork_end ?? "?"}`
  if (rodada.uf !== "BR" && !BRAZIL_STATES.some((state) => state.sigla === rodada.uf)) problems.push(`${where}: UF inválida`)
  if (!rodada.instituto?.trim()) problems.push(`${where}: instituto ausente`)
  for (const key of ["fieldwork_end", "publication_date"] as const) {
    if (!rodada[key] || !DATE.test(rodada[key]!)) problems.push(`${where}: ${key} ausente ou inválido`)
  }
  if (rodada.fieldwork_start && !DATE.test(rodada.fieldwork_start)) problems.push(`${where}: fieldwork_start inválido`)
  if (rodada.fieldwork_start && rodada.fieldwork_end && rodada.fieldwork_start > rodada.fieldwork_end) problems.push(`${where}: campo invertido`)
  if (rodada.fieldwork_end && rodada.publication_date && rodada.publication_date < rodada.fieldwork_end) problems.push(`${where}: publicação antes do fim do campo`)
  if (rodada.registration) {
    const parts = registrationParts(rodada.registration)
    if (!parts) problems.push(`${where}: registro em formato desconhecido (${rodada.registration})`)
    else if (parts.uf !== rodada.uf) problems.push(`${where}: registro de outra UF (${rodada.registration})`)
  }
  if (!/^https:\/\//.test(rodada.result_url ?? "")) problems.push(`${where}: result_url ausente`)
  if (!rodada.capture_file || !existsSync(rodada.capture_file)) problems.push(`${where}: captura literal ausente`)
  if (!rodada.scenarios?.some((scenario) => scenario.kind === "estimulado")) problems.push(`${where}: sem cenário estimulado`)
  for (const scenario of rodada.scenarios ?? []) {
    const labels = new Set<string>()
    let total = 0
    for (const result of scenario.results) {
      if (typeof result.value_percent !== "number" || result.value_percent < 0 || result.value_percent > 100) {
        problems.push(`${where}: percentual inválido para ${result.raw_label}`)
      }
      total += result.value_percent
      if (labels.has(result.raw_label)) problems.push(`${where}: rótulo duplicado ${result.raw_label}`)
      labels.add(result.raw_label)
      if (!(result.raw_label in (aliases[rodada.uf] ?? {}))) problems.push(`${where}: sem decisão de alias para "${result.raw_label}"`)
    }
    if (total > 102) problems.push(`${where}: cenário "${scenario.label_raw}" soma ${total.toFixed(1)}%`)
  }
  return problems
}

export interface Catalogos { pres: Json; presFontes: Json; gov: Json; govFontes: Json }

export function carregarCatalogos(): Catalogos {
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Json
  return { pres: read(PRES), presFontes: read(PRES_FONTES), gov: read(GOV), govFontes: read(GOV_FONTES) }
}

function datasetDe(catalogos: Catalogos, uf: string): Json {
  if (uf === "BR") return catalogos.pres
  const dataset = (catalogos.gov.datasets as Json[]).find((entry) => (entry.publication_scope as Json).geography_code === uf)
  if (!dataset) throw new Error(`dataset de governador ausente para ${uf}`)
  return dataset
}

function reusableSource(fontes: Json, instituto: string, office: string, geography: string) {
  return (fontes.sources as Json[]).find((source) => {
    const roles = source.roles as Json | undefined
    const poll = source.representative_poll as Json | undefined
    return source.status === "aprovado" && source.reviewed_registration_ids === undefined &&
      typeof roles?.institute === "string" && norm(roles.institute) === norm(instituto) &&
      (poll?.office === office) && (poll?.geography === null || poll?.geography === geography)
  })
}

/** Builds the catalog entries for one validated round. Pure: does not touch the catalogs. */
export function montarRodada(rodada: RodadaColetada, aliases: DecisoesAlias, catalogos: Catalogos, reviewedAt: string) {
  const office = rodada.uf === "BR" ? "Presidente" : "Governador"
  const geography = rodada.uf === "BR" ? "Brasil" : BRAZIL_STATES.find((state) => state.sigla === rodada.uf)!.name
  const fontes = rodada.uf === "BR" ? catalogos.presFontes : catalogos.govFontes
  const capture = readFileSync(rodada.capture_file)
  const captureSha = createHash("sha256").update(capture).digest("hex")
  const parts = registrationParts(rodada.registration)
  const instituteSlug = slugify(rodada.instituto)
  const roundKey = parts ? `${parts.uf.toLowerCase()}-${parts.number}-${parts.year}` : `${rodada.uf.toLowerCase()}-${rodada.fieldwork_end}`
  const id = `${instituteSlug}-${roundKey}`
  const existing = reusableSource(fontes, rodada.instituto, office, geography)
  const preferred = (fontes.preferred_source_ids as string[]) ?? []
  const sourceId = existing ? String(existing.id) : `${instituteSlug}-${roundKey}-revisao-${reviewedAt.slice(0, 10).replace(/-/g, "")}`
  const evidence = [rodada.result_url, ...(rodada.supporting_urls ?? [])]
  const source = existing ? null : {
    id: sourceId,
    status: "aprovado",
    source_kind: "instituto_com_veiculo_como_fonte_do_resultado",
    roles: {
      institute: rodada.instituto,
      commissioner: rodada.contratante,
      official_registry: parts ? "TSE/PesqEle (registro informado na publicação)" : null,
      publication_vehicle: new URL(rodada.result_url).hostname.replace(/^www\d?\./, ""),
      dissemination_partner: null,
    },
    representative_poll: {
      field_period: { start: rodada.fieldwork_start, end: rodada.fieldwork_end },
      published_at: rodada.publication_date,
      sample_size: rodada.sample_size,
      method: rodada.method,
      margin_of_error_pp: rodada.margin_error_pp,
      confidence_level_pct: rodada.confidence_percent,
      office,
      geography,
      rounds: [1],
      registration_id: rodada.registration,
      result_url: rodada.result_url,
      registry_url: PESQELE,
    },
    reviewed_registration_ids: [rodada.registration ?? ""],
    review: {
      reviewed_at: reviewedAt,
      reviewer: "revisão manual auditada",
      basis: "Resultados e metodologia lidos na publicação indicada; captura literal preservada por hash.",
      capture_sha256: captureSha,
      scope: "Somente o registro listado, não aprovação irrestrita de rodadas futuras.",
    },
    criteria: {
      methodology_transparency: { pass: true, evidence_urls: evidence },
      result_access: { pass: true, evidence_urls: evidence },
      sample_identification: { pass: true, evidence_urls: evidence },
      publication_stability: { pass: true, evidence_urls: evidence },
      corrections: { pass: false, evidence_urls: [], note: "Política de correções não examinada; inclusão restrita a esta rodada." },
    },
    consulted_at: reviewedAt,
  }
  const decisions = aliases[rodada.uf]
  const newAliases: Json[] = []
  let estimulados = 0
  const cenarios = rodada.scenarios.map((scenario) => {
    const index = scenario.kind === "estimulado" ? ++estimulados : 0
    const scenarioId = `${id}-1t${scenario.kind === "espontaneo" ? "-espontaneo" : estimulados > 1 ? `-cenario-${index}` : ""}`
    const list = createHash("sha256").update(stable(scenario.results.map((result) => decisions[result.raw_label]).filter(Boolean).sort())).digest("hex")
    const mode = scenario.kind === "estimulado" ? "estimulada" : "espontanea"
    return {
      id: scenarioId,
      turn: 1,
      geography,
      label_raw: scenario.label_raw,
      question: vs(scenario.question),
      comparability_key: `2026|${office}|${rodada.uf}|1|${mode}|${list}|total_amostra`,
      resultados: scenario.results.map((result) => {
        const slug = decisions[result.raw_label]
        if (slug) {
          newAliases.push(rodada.uf === "BR"
            ? { raw_label: result.raw_label, candidate_slug: slug, year: 2026, office, geography, turn: 1, scenario_id: scenarioId }
            : { raw_label: result.raw_label, candidate_slug: slug })
        }
        return {
          raw_label: result.raw_label,
          candidate_slug: slug ?? null,
          match_status: slug ? "exact_alias" : "not_candidate",
          value_percent: result.value_percent,
          status: "publicado",
        }
      }),
    }
  })
  const poll = {
    id,
    source_id: sourceId,
    source_status: "aprovado",
    publishable_by_default: preferred.includes(sourceId),
    state: "publicado",
    instituto: vs(rodada.instituto),
    contratante: vs(rodada.contratante),
    fieldwork: { start: vs(rodada.fieldwork_start), end: vs(rodada.fieldwork_end) },
    publication_date: vs(rodada.publication_date),
    sample: { size: vs(rodada.sample_size), population: vs(rodada.population) },
    margin_error_pp: vs(rodada.margin_error_pp),
    confidence_percent: vs(rodada.confidence_percent),
    method: vs(rodada.method),
    registration: { code: vs(rodada.registration), url: parts ? vs(PESQELE) : vs(null) },
    geography: rodada.uf === "BR" ? { type: "nacional", label: "Brasil", code: "BR" } : { type: "unidade_federativa", label: geography, code: rodada.uf },
    office,
    provenance: {
      result_url: rodada.result_url,
      supporting_urls: rodada.supporting_urls ?? [],
      source_kind: "divulgacao_jornalistica_publica",
      route_class: "importacao_manual_auditada",
      route_reason: "Resultados e metodologia lidos na publicação; revisão restrita à rodada identificada. Registro conforme informado na publicação.",
      consulted_at: reviewedAt,
      capture: { format: "text", sha256: captureSha, status: "publicado" },
    },
    cenarios,
  }
  return { poll, source, aliases: newAliases }
}

export function importarRodadas(rodadas: RodadaColetada[], aliases: DecisoesAlias, reviewedAt: string, catalogos: Catalogos) {
  const problems: string[] = []
  const planned: string[] = []
  const skipped: string[] = []
  for (const rodada of rodadas) {
    if (rodada.status === "nao_confirmada") { skipped.push(`${rodada.uf} ${rodada.instituto}: não confirmada`); continue }
    const found = validarRodada(rodada, aliases)
    if (found.length) { problems.push(...found); continue }
    const dataset = datasetDe(catalogos, rodada.uf)
    const polls = dataset.pesquisas as Json[]
    const built = montarRodada(rodada, aliases, catalogos, reviewedAt)
    const sameRegistration = rodada.registration && polls.some((poll) => {
      const known = registrationParts(((poll.registration as Json).code as Json).value as string | null)
      const mine = registrationParts(rodada.registration)
      return known && mine && known.uf === mine.uf && known.number === mine.number && known.year === mine.year
    })
    if (sameRegistration || polls.some((poll) => poll.id === built.poll.id)) { skipped.push(`${built.poll.id}: já no catálogo`); continue }
    polls.push(built.poll)
    if (built.source) (rodada.uf === "BR" ? catalogos.presFontes : catalogos.govFontes).sources = [
      ...((rodada.uf === "BR" ? catalogos.presFontes : catalogos.govFontes).sources as Json[]), built.source]
    const datasetAliases = dataset.exact_aliases as Json[]
    for (const alias of built.aliases) {
      if (datasetAliases.some((known) => known.raw_label === alias.raw_label && known.candidate_slug !== alias.candidate_slug &&
        (known.scenario_id === undefined || known.scenario_id === alias.scenario_id))) {
        problems.push(`${built.poll.id}: alias conflitante para "${alias.raw_label}"`)
      }
      if (!datasetAliases.some((known) => stable(known) === stable(alias))) datasetAliases.push(alias)
    }
    dataset.exact_aliases_version = `monitor-2026-${createHash("sha256").update(stable(datasetAliases)).digest("hex").slice(0, 16)}`
    planned.push(`${built.poll.id} (${rodada.fieldwork_end}, ${built.poll.cenarios.length} cenário(s), fonte ${built.source ? "nova" : "reutilizada"})`)
  }
  return { problems, planned, skipped, catalogos }
}

function main() {
  const args = process.argv.slice(2)
  const values = (flag: string) => args.flatMap((arg, index) => (arg === flag ? [args[index + 1]] : []))
  const inputs = values("--input")
  const [aliasesPath] = values("--aliases")
  if (!inputs.length || !aliasesPath) throw new Error("uso: --input rodadas.json [--input ...] --aliases aliases.json [--write]")
  const rodadas = inputs.flatMap((path) => JSON.parse(readFileSync(path, "utf8")) as RodadaColetada[])
  const aliases = JSON.parse(readFileSync(aliasesPath, "utf8")) as DecisoesAlias
  const reviewedAt = values("--reviewed-at")[0] ?? new Date().toISOString().replace(/\.\d+Z$/, "Z")
  const { catalogos, ...result } = importarRodadas(rodadas, aliases, reviewedAt, carregarCatalogos())
  console.log(JSON.stringify(result, null, 2))
  if (result.problems.length) { process.exitCode = 1; return }
  if (args.includes("--write")) {
    const save = (path: string, value: Json) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
    save(PRES, catalogos.pres); save(PRES_FONTES, catalogos.presFontes); save(GOV, catalogos.gov); save(GOV_FONTES, catalogos.govFontes)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
