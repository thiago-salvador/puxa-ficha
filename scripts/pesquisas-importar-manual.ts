/**
 * Imports manually reviewed poll rounds (Presidente BR, Governador and Senador by UF) into the
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

export type CargoPesquisa = "Presidente" | "Governador" | "Senador"
/** Senate 2026 has two seats: each stimulated scenario states which vote it measures. */
export type MedidaSenado = "primeiro-voto" | "segundo-voto" | "agregado"
const MEDIDAS_SENADO: MedidaSenado[] = ["primeiro-voto", "segundo-voto", "agregado"]
const ROTULO_MEDIDA: Record<MedidaSenado, string> = {
  "primeiro-voto": "primeiro voto",
  "segundo-voto": "segundo voto",
  agregado: "soma do primeiro e do segundo voto",
}
export type BaseSenado = "total_amostra" | "total_mencoes"
const BASES_SENADO: BaseSenado[] = ["total_amostra", "total_mencoes"]
const TOTAL_UM_VOTO = 102
/** Two votes over the whole sample: a published aggregate below this is not a sum over respondents. */
const MINIMO_SOMA_DOIS_VOTOS = 130
const MAXIMO_SOMA_DOIS_VOTOS = 202

/**
 * Base of a Senate scenario as declared by the collector from the captured text:
 * "total_mencoes" when the publication says the two votes were summed and rescaled to 100%
 * ("consolidado ... reduzido para 100%"), "total_amostra" for shares of respondents. The sum is
 * never used to infer the base; `validarRodada` uses it only to reject a declaration it contradicts.
 */
export function baseCenarioSenado(scenario: RodadaColetada["scenarios"][number]): BaseSenado {
  return scenario.base ?? "total_amostra"
}

export interface RodadaColetada {
  /** Omitted means Presidente for "BR" and Governador for a UF, as before Senate support. */
  cargo?: CargoPesquisa
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
    /** Required for Senador stimulated scenarios. */
    measure?: MedidaSenado
    /** Senador only, required with measure "agregado": base stated in the captured text. */
    base?: BaseSenado
    /** Collector's own description; never published (headlines are editorial). */
    label_raw?: string
    /** Neutral distinction between stimulated scenarios of the same round, e.g. "sem Fulano". */
    note?: string
    question: string | null
    results: { raw_label: string; value_percent: number }[]
  }[]
  notes?: string
}

/**
 * Per scope ("BR", UF for Governador, "SEN-<UF>" for Senador): printed label -> candidate slug,
 * or null for non-candidate lines.
 */
export type DecisoesAlias = Record<string, Record<string, string | null>>

const PRES = "scripts/data/pesquisas-presidencia-2026.json"
const PRES_FONTES = "scripts/data/pesquisas-eleitorais-fontes.json"
const GOV = "scripts/data/pesquisas-governadores-2026.json"
const GOV_FONTES = "scripts/data/pesquisas-governadores-fontes.json"
/** Senate datasets and their source scorecard live in one root file (see src/lib/senado-polls.ts). */
const SEN = "scripts/data/pesquisas-senado-2026.json"
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

export function cargoDe(rodada: RodadaColetada): CargoPesquisa {
  return rodada.cargo ?? (rodada.uf === "BR" ? "Presidente" : "Governador")
}

/** Alias decisions are scoped by office so a Senate spelling never resolves a governor line. */
export function escopoAlias(rodada: RodadaColetada): string {
  return cargoDe(rodada) === "Senador" ? `SEN-${rodada.uf}` : rodada.uf
}

/** Senate spontaneous answers have no published measure in the site contract, so they are not imported. */
function cenariosImportaveis(rodada: RodadaColetada) {
  return cargoDe(rodada) === "Senador" ? (rodada.scenarios ?? []).filter((scenario) => scenario.kind === "estimulado") : rodada.scenarios ?? []
}

/** Returns human-readable problems; an empty list means the round can be imported. */
export function validarRodada(rodada: RodadaColetada, aliases: DecisoesAlias): string[] {
  const problems: string[] = []
  const cargo = cargoDe(rodada)
  const where = `${cargo === "Senador" ? "Senado " : ""}${rodada.uf} ${rodada.instituto} ${rodada.fieldwork_end ?? "?"}`
  if (rodada.uf !== "BR" && !BRAZIL_STATES.some((state) => state.sigla === rodada.uf)) problems.push(`${where}: UF inválida`)
  if ((cargo === "Presidente") !== (rodada.uf === "BR")) problems.push(`${where}: cargo ${cargo} incompatível com ${rodada.uf}`)
  // The Senate page publishes only rounds with a TSE registration (src/lib/senado-polls.ts).
  if (cargo === "Senador" && !rodada.registration) problems.push(`${where}: Senado exige registration publicado`)
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
  const stimulated = (rodada.scenarios ?? []).filter((scenario) => scenario.kind === "estimulado")
  if (cargo === "Senador") {
    for (const scenario of stimulated) {
      if (!scenario.measure || !MEDIDAS_SENADO.includes(scenario.measure)) problems.push(`${where}: cenário do Senado sem medida (primeiro-voto, segundo-voto ou agregado)`)
      if (scenario.base != null && !BASES_SENADO.includes(scenario.base))problems.push(`${where}: base desconhecida (${scenario.base})`)
      if (scenario.measure === "agregado" && !scenario.base) problems.push(`${where}: agregado do Senado sem base declarada (total_amostra ou total_mencoes)`)
      if (scenario.measure !== "agregado" && scenario.base === "total_mencoes") problems.push(`${where}: base de menções só existe na soma dos dois votos`)
    }
  } else if (stimulated.some((scenario) => scenario.base != null || scenario.measure != null)) {
    problems.push(`${where}: medida e base são exclusivas do Senado`)
  }
  // Distinct notes are required among stimulated scenarios that measure the same thing.
  const byMeasure = new Map<string, string[]>()
  for (const scenario of stimulated) {
    const key = cargo === "Senador" ? scenario.measure ?? "" : ""
    byMeasure.set(key, [...(byMeasure.get(key) ?? []), scenario.note?.trim() ?? ""])
  }
  for (const notes of byMeasure.values()) {
    if (notes.length > 1 && (notes.some((note) => !note) || new Set(notes).size !== notes.length)) {
      problems.push(`${where}: cenários estimulados múltiplos exigem nota distinta em cada um`)
    }
  }
  const decisions = aliases[escopoAlias(rodada)] ?? {}
  for (const scenario of cenariosImportaveis(rodada)) {
    const labels = new Set<string>()
    let total = 0
    for (const result of scenario.results) {
      if (typeof result.value_percent !== "number" || result.value_percent < 0 || result.value_percent > 100) {
        problems.push(`${where}: percentual inválido para ${result.raw_label}`)
      }
      total += result.value_percent
      if (labels.has(result.raw_label)) problems.push(`${where}: rótulo duplicado ${result.raw_label}`)
      labels.add(result.raw_label)
      if (!(result.raw_label in decisions)) problems.push(`${where}: sem decisão de alias para "${result.raw_label}" (escopo ${escopoAlias(rodada)})`)
    }
    // Consistency with the declared base: two mentions per respondent add up to well over 100%;
    // mentions rescaled to 100% or a single vote cannot pass it.
    const somaDoisVotos = cargo === "Senador" && scenario.measure === "agregado" && scenario.base === "total_amostra"
    const [minimo, maximo] = somaDoisVotos ? [MINIMO_SOMA_DOIS_VOTOS, MAXIMO_SOMA_DOIS_VOTOS] : [0, TOTAL_UM_VOTO]
    if (total > maximo || total < minimo) {
      problems.push(`${where}: cenário ${scenario.kind} ${scenario.measure ?? ""} ${scenario.base ?? ""} ${scenario.note ?? ""} soma ${total.toFixed(1)}%, incompatível com a base declarada`)
    }
  }
  return problems
}

export interface Catalogos { pres: Json; presFontes: Json; gov: Json; govFontes: Json; sen: Json }

export function carregarCatalogos(): Catalogos {
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Json
  return { pres: read(PRES), presFontes: read(PRES_FONTES), gov: read(GOV), govFontes: read(GOV_FONTES), sen: read(SEN) }
}

function entradaSenado(catalogos: Catalogos, uf: string): Json {
  const entry = (catalogos.sen.datasets as Json[]).find((item) => item.uf === uf)
  if (!entry) throw new Error(`dataset de Senado ausente para ${uf}`)
  return entry
}

function datasetDe(catalogos: Catalogos, rodada: RodadaColetada): Json {
  const cargo = cargoDe(rodada)
  if (cargo === "Presidente") return catalogos.pres
  if (cargo === "Senador") return entradaSenado(catalogos, rodada.uf).dataset as Json
  const dataset = (catalogos.gov.datasets as Json[]).find((entry) => (entry.publication_scope as Json).geography_code === rodada.uf)
  if (!dataset) throw new Error(`dataset de governador ausente para ${rodada.uf}`)
  return dataset
}

function fontesDe(catalogos: Catalogos, cargo: CargoPesquisa): Json {
  if (cargo === "Presidente") return catalogos.presFontes
  if (cargo === "Senador") return catalogos.sen.source_catalog as Json
  return catalogos.govFontes
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
  const office = cargoDe(rodada)
  const geography = rodada.uf === "BR" ? "Brasil" : BRAZIL_STATES.find((state) => state.sigla === rodada.uf)!.name
  const fontes = fontesDe(catalogos, office)
  const capture = readFileSync(rodada.capture_file)
  const captureSha = createHash("sha256").update(capture).digest("hex")
  const parts = registrationParts(rodada.registration)
  const instituteSlug = slugify(rodada.instituto)
  const roundKey = parts ? `${parts.uf.toLowerCase()}-${parts.number}-${parts.year}` : `${rodada.uf.toLowerCase()}-${rodada.fieldwork_end}`
  // One registration usually covers governor and Senate; the office suffix keeps both ids distinct.
  const id = `${instituteSlug}-${roundKey}${office === "Senador" ? "-senado" : ""}`
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
  const decisions = aliases[escopoAlias(rodada)]
  const newAliases: Json[] = []
  let estimulados = 0
  const senado = office === "Senador"
  const porMedida = new Map<string, number>()
  const cenarios = cenariosImportaveis(rodada).map((scenario) => {
    const index = scenario.kind === "estimulado" ? ++estimulados : 0
    const indexMedida = senado ? (porMedida.get(scenario.measure!) ?? 0) + 1 : 0
    if (senado) porMedida.set(scenario.measure!, indexMedida)
    const scenarioId = senado
      ? `${id}-${scenario.measure}${indexMedida > 1 ? `-cenario-${indexMedida}` : ""}`
      : `${id}-1t${scenario.kind === "espontaneo" ? "-espontaneo" : estimulados > 1 ? `-cenario-${index}` : ""}`
    const list = createHash("sha256").update(stable(scenario.results.map((result) => decisions[result.raw_label]).filter(Boolean).sort())).digest("hex")
    const mode = senado ? scenario.measure! : scenario.kind === "estimulado" ? "estimulada" : "espontanea"
    const note = scenario.note ? `, ${scenario.note.trim()}` : ""
    const base = senado ? baseCenarioSenado(scenario) : "total_amostra"
    const senadoLabel = base === "total_mencoes"
      ? `Intenção de voto estimulada para o Senado, primeiro e segundo voto somados e reduzidos a 100%${note}; percentuais do total de menções`
      : `Intenção de voto estimulada para o Senado, ${ROTULO_MEDIDA[scenario.measure!]}${note}; percentuais do total de entrevistados${scenario.measure === "agregado" ? " (a soma dos dois votos passa de 100%)" : ""}`
    return {
      id: scenarioId,
      turn: 1,
      geography,
      label_raw: senado
        ? senadoLabel
        : `Intenção de voto ${scenario.kind === "estimulado" ? "estimulada" : "espontânea"} no 1º turno${note}; percentuais do total de entrevistados`,
      question: vs(scenario.question),
      comparability_key: `2026|${office}|${rodada.uf}|1|${mode}|${list}|${base}`,
      resultados: scenario.results.map((result) => {
        const slug = decisions[result.raw_label]
        if (slug) {
          // Scoped to the scenario so a reviewed spelling never becomes a UF-wide alias for the monitor.
          newAliases.push({ raw_label: result.raw_label, candidate_slug: slug, year: 2026, office, geography, turn: 1, scenario_id: scenarioId })
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
    const cargo = cargoDe(rodada)
    const dataset = datasetDe(catalogos, rodada)
    const polls = dataset.pesquisas as Json[]
    const built = montarRodada(rodada, aliases, catalogos, reviewedAt)
    const sameRegistration = rodada.registration && polls.some((poll) => {
      const known = registrationParts(((poll.registration as Json).code as Json).value as string | null)
      const mine = registrationParts(rodada.registration)
      return known && mine && known.uf === mine.uf && known.number === mine.number && known.year === mine.year
    })
    if (sameRegistration || polls.some((poll) => poll.id === built.poll.id)) { skipped.push(`${built.poll.id}: já no catálogo`); continue }
    polls.push(built.poll)
    const fontes = fontesDe(catalogos, cargo)
    if (built.source) fontes.sources = [...(fontes.sources as Json[]), built.source]
    if (cargo === "Senador") {
      const entry = entradaSenado(catalogos, rodada.uf)
      entry.state = "com_pesquisa_publicada"
      entry.reason = "Rodadas importadas por revisão manual auditada, com resultado, metodologia e registro lidos na publicação."
      delete entry.checked_at
    }
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

export interface AusenciaChecada { uf: string; cargo: CargoPesquisa; checked_at: string }

/**
 * Records a dated, checked absence for Senate UFs that still have no imported round, so the
 * catalog states when the search happened instead of carrying an undated default.
 */
export function registrarAusenciasSenado(ausencias: AusenciaChecada[], catalogos: Catalogos) {
  const problems: string[] = []
  const recorded: string[] = []
  for (const ausencia of ausencias) {
    if (ausencia.cargo !== "Senador") continue
    if (!DATE.test(ausencia.checked_at ?? "")) { problems.push(`${ausencia.uf}: checked_at inválido`); continue }
    const entry = entradaSenado(catalogos, ausencia.uf)
    if (((entry.dataset as Json).pesquisas as Json[]).length) { problems.push(`${ausencia.uf}: ausência declarada em UF com pesquisa importada`); continue }
    const [year, month, day] = ausencia.checked_at.split("-")
    entry.state = "sem_pesquisa_qualificada"
    entry.reason = `Checagem de ${day}/${month}/${year}: nenhuma pesquisa com resultado, metodologia e registro verificáveis foi encontrada para o Senado nesta UF.`
    entry.checked_at = ausencia.checked_at
    recorded.push(`${ausencia.uf} (${ausencia.checked_at})`)
  }
  return { problems, recorded }
}

function main() {
  const args = process.argv.slice(2)
  const values = (flag: string) => args.flatMap((arg, index) => (arg === flag ? [args[index + 1]] : []))
  const inputs = values("--input")
  const aliasesPaths = values("--aliases")
  if (!inputs.length || !aliasesPaths.length) {
    throw new Error("uso: --input rodadas.json [--input ...] --aliases aliases.json [--aliases ...] [--ausencias ausencias.json] [--write]")
  }
  const rodadas = inputs.flatMap((path) => JSON.parse(readFileSync(path, "utf8")) as RodadaColetada[])
  const aliases: DecisoesAlias = {}
  for (const path of aliasesPaths) {
    for (const [scope, decisions] of Object.entries(JSON.parse(readFileSync(path, "utf8")) as DecisoesAlias)) {
      for (const [label, slug] of Object.entries(decisions)) {
        if (label in (aliases[scope] ?? {}) && aliases[scope][label] !== slug) throw new Error(`decisões de alias divergentes para "${label}" em ${scope}`)
        aliases[scope] = { ...aliases[scope], [label]: slug }
      }
    }
  }
  const reviewedAt = values("--reviewed-at")[0] ?? new Date().toISOString().replace(/\.\d+Z$/, "Z")
  const { catalogos, ...result } = importarRodadas(rodadas, aliases, reviewedAt, carregarCatalogos())
  const ausencias = values("--ausencias").flatMap((path) => JSON.parse(readFileSync(path, "utf8")) as AusenciaChecada[])
  const absence = registrarAusenciasSenado(ausencias, catalogos)
  console.log(JSON.stringify({ ...result, ausencias: absence }, null, 2))
  if (result.problems.length || absence.problems.length) { process.exitCode = 1; return }
  if (args.includes("--write")) {
    const save = (path: string, value: Json) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
    save(PRES, catalogos.pres); save(PRES_FONTES, catalogos.presFontes); save(GOV, catalogos.gov); save(GOV_FONTES, catalogos.govFontes)
    save(SEN, catalogos.sen)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
