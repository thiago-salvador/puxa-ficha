import type { DocumentoRealTime } from "./pesquisas-monitoramento-realtime-pdf"
import "server-only"

import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  ADAPTADORES_MONITORAMENTO,
  parsePublicacaoMonitorada,
  type AlvoMonitoramento,
} from "./pesquisas-monitoramento-adapters"
import { margemCompativelComRegistro, type RegistroTseMonitoramento } from "./pesquisas-monitoramento-tse"
import type { ObservacaoPesqele } from "./pesquisas-monitoramento-pesqele"
import type { DocumentoPoderData } from "./pesquisas-monitoramento-poderdata-pdf"
import { carregarIdentidadesCuradas, resolverIdentidadeCurada, aliasSemEscopoEspecifico, type AliasCatalogado } from "./pesquisas-monitoramento-identidades"
import { resolverIdentidadeRevisada } from "./pesquisas-monitoramento-identidades-revisadas"

type ClassificacaoMonitoramento =
  | "novo"
  | "alterado"
  | "inalterado"
  | "vencido"
  | "conflitante"
  | "fonte indisponivel"
  | "identidade nao resolvida"
  | "extração incompleta"

export interface EvidenciaPesquisaCandidata {
  source_id: string
  source_status: string
  url: string
  institute: string
  registration: { id: string; url: string }
  fieldwork: { start: string; end: string }
  publication_date: string
  scenario: {
    id: string
    office: string
    geography: string
    geography_code: string
    turn: 1 | 2
    label: string
    question: string | null
  }
  sample: { size: number; population: string }
  margin_error_pp: number
  confidence_percent: number
  method: string
  results: Array<{
    raw_label: string
    candidate_slug: string | null
    match_status: "exact_alias" | "indeterminado" | "not_candidate"
    value_percent: number
  }>
  observed_at: string
  evidence_sha256: string
  scenario_complete?: boolean
  publication_complete?: boolean
  additional_scenarios?: Array<{
    scenario: EvidenciaPesquisaCandidata["scenario"]
    results: EvidenciaPesquisaCandidata["results"]
    scenario_complete: true
  }>
  registry_observation?: { url: string; observed_at: string; evidence_sha256: string }
  result_document?: { url: string; observed_at: string; evidence_sha256: string; pages: number[] }
  result_notes?: string[]
  identity_observations?: Array<{ raw_label: string; candidate_slug: string; basis: "curated_name_party_office_uf" | "curated_ballot_name_office_uf" | "same_publication_full_name" | "reviewed_documentary_bridge"; source_url: string; source_sha256: string }>
}

export interface SourceContract {
  id: string
  status: string
  roles: { institute: string }
  representative_poll: {
    result_url: string
    registry_url: string
    registration_id: string
    office: string
    geography: string
  } | null
}

interface DecisaoMonitoramento {
  classification: ClassificacaoMonitoramento
  eligible_for_human_review: boolean
  reason: string
}

export interface CasoGoldenMonitoramento {
  case_id: string
  source_id: string
  poll_id?: string
  html_fixture?: string
  registry_fixture: string
  observed_at: string
  network_error?: "timeout"
  html_replacements?: Array<[string, string]>
  registry_registration_override?: string
  registry_institute_override?: string
  baseline?: "same_as_observed"
  baseline_result_values?: number[]
  reference_solution: DecisaoMonitoramento
}

interface ResultadoAvaliacao {
  decision: DecisaoMonitoramento
  evidence: EvidenciaPesquisaCandidata | null
  baseline: EvidenciaPesquisaCandidata | null
  diagnostic?: { detail: string; source_url: string; source_observed_at: string | null; source_sha256: string | null }
}

const STALE_AFTER_DAYS = 45

function loadSources(): Map<string, SourceContract> {
  const paths = [
    "scripts/data/pesquisas-eleitorais-fontes.json",
    "scripts/data/pesquisas-governadores-fontes.json",
  ]
  const sources = paths.flatMap((path) => {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { sources: SourceContract[] }
    return parsed.sources
  })
  return new Map(sources.map((source) => [source.id, source]))
}

interface CatalogPoll {
  id: string
  source_id: string
  source_status: string
  office: string
  geography: { label: string; code: string }
  registration: {
    code: { value: string }
    url: { value: string }
  }
  sample: { population: { value: string } }
  provenance: { result_url: string }
  cenarios: Array<{
    id: string
    turn: 1 | 2
    label_raw: string
    question: { value: string | null }
  }>
}

function loadCatalogPolls(): CatalogPoll[] {
  const president = JSON.parse(readFileSync("scripts/data/pesquisas-presidencia-2026.json", "utf8")) as {
    pesquisas: CatalogPoll[]
  }
  const governors = JSON.parse(readFileSync("scripts/data/pesquisas-governadores-2026.json", "utf8")) as {
    datasets: Array<{ pesquisas: CatalogPoll[] }>
  }
  return [...president.pesquisas, ...governors.datasets.flatMap((dataset) => dataset.pesquisas)]
}

function targetFromPoll(poll: CatalogPoll): AlvoMonitoramento {
  const scenario = poll.cenarios[0]
  if (!scenario) throw new Error(`pesquisa sem cenário monitorável: ${poll.id}`)
  return {
    poll_id: poll.id,
    source_id: poll.source_id,
    url: poll.provenance.result_url,
    registration_id: poll.registration.code.value,
    registry_url: poll.registration.url.value,
    office: poll.office,
    geography: poll.geography.label,
    geography_code: poll.geography.code,
    turn: scenario.turn,
    scenario_id: scenario.id,
    scenario_label: scenario.label_raw,
    scenario_question: scenario.question.value,
    population: poll.sample.population.value,
    known_scenarios: poll.cenarios.map((scenario) => ({ id: scenario.id, turn: scenario.turn, label: scenario.label_raw, question: scenario.question.value })),
  }
}

export function listarAlvosMonitoramento(filters: {
  sourceId?: string | null
  uf?: string | null
} = {}): AlvoMonitoramento[] {
  const sourceFilter = filters.sourceId && filters.sourceId !== "all" ? filters.sourceId : null
  const ufFilter = filters.uf && filters.uf !== "ALL" ? filters.uf.toLocaleUpperCase("pt-BR") : null
  const approvedSources = loadSources()
  const adapterIds = new Set(ADAPTADORES_MONITORAMENTO.map((adapter) => adapter.source_id))
  if (sourceFilter && !adapterIds.has(sourceFilter)) {
    throw new Error(`fonte sem adaptador aprovado: ${sourceFilter}`)
  }
  return loadCatalogPolls()
    .filter((poll) => poll.source_status === "aprovado")
    .filter((poll) => approvedSources.get(poll.source_id)?.status === "aprovado")
    .filter((poll) => adapterIds.has(poll.source_id))
    .filter((poll) => !sourceFilter || poll.source_id === sourceFilter)
    .filter((poll) => !ufFilter || poll.geography.code === ufFilter)
    .map(targetFromPoll)
    .sort((left, right) => left.source_id.localeCompare(right.source_id) || left.geography_code.localeCompare(right.geography_code))
}

export function listarFontesAprovadasUtilizadas(): string[] {
  const used = new Set(
    loadCatalogPolls()
      .filter((poll) => poll.source_status === "aprovado")
      .map((poll) => poll.source_id),
  )
  return [...loadSources().values()]
    .filter((source) => source.status === "aprovado" && used.has(source.id))
    .map((source) => source.id)
    .sort()
}

export function obterAlvoMonitoramento(sourceId: string, pollId?: string): AlvoMonitoramento {
  const targets = listarAlvosMonitoramento({ sourceId })
  const target = pollId
    ? targets.find((candidate) => candidate.poll_id === pollId)
    : targets.find((candidate) => candidate.registration_id === loadSources().get(sourceId)?.representative_poll?.registration_id) ?? targets[0]
  if (!target) throw new Error(`fonte aprovada sem alvo publicado: ${sourceId}`)
  return target
}

function loadAliases(target: AlvoMonitoramento): Map<string, string | null> {
  const aliases = new Map<string, string | null>()
  function add(rawLabel: string, candidateSlug: string): void {
    const previous = aliases.get(rawLabel)
    aliases.set(rawLabel, previous === undefined || previous === candidateSlug ? candidateSlug : null)
  }
  const president = JSON.parse(readFileSync("scripts/data/pesquisas-presidencia-2026.json", "utf8")) as {
    exact_aliases: AliasCatalogado[]
  }
  if (target.office === "Presidente") {
    president.exact_aliases.filter(aliasSemEscopoEspecifico).forEach((alias) => add(alias.raw_label, alias.candidate_slug))
    return aliases
  }
  const governors = JSON.parse(readFileSync("scripts/data/pesquisas-governadores-2026.json", "utf8")) as {
    datasets: Array<{
      publication_scope: { geography_code: string }
      exact_aliases: AliasCatalogado[]
    }>
  }
  const dataset = governors.datasets.find((candidate) => candidate.publication_scope.geography_code === target.geography_code)
  dataset?.exact_aliases.filter(aliasSemEscopoEspecifico).forEach((alias) => add(alias.raw_label, alias.candidate_slug))
  return aliases
}

/** Exact identity evidence already curated in this checkout; no fuzzy name matching. */
function enrichAliases(target: AlvoMonitoramento, evidence: EvidenciaPesquisaCandidata, aliases: Map<string, string | null>): Map<string, string | null> {
  const observations: NonNullable<EvidenciaPesquisaCandidata["identity_observations"]> = []
  const allRows = [evidence, ...(evidence.additional_scenarios ?? [])].flatMap((scenario) => scenario.results)
  const candidates = carregarIdentidadesCuradas(target.office, target.geography_code)
  for (const row of allRows) {
    if (aliases.has(row.raw_label) || row.match_status === "not_candidate") continue
    // Governors retain the stricter name+party requirement. Presidential ballot
    // names can be short, but must be explicit in the approved official record.
    if (target.office === "Governador" && !/\([^()]+\)$/.test(row.raw_label)) continue
    const reviewed = resolverIdentidadeRevisada(target, row.raw_label, candidates)
    const candidate = reviewed ?? resolverIdentidadeCurada(row.raw_label, candidates, aliases)
    if (!candidate) continue
    aliases.set(row.raw_label, candidate.slug)
    observations.push({ raw_label: row.raw_label, candidate_slug: candidate.slug, basis: reviewed ? "reviewed_documentary_bridge" : target.office === "Governador" ? "curated_name_party_office_uf" : "curated_ballot_name_office_uf", source_url: candidate.pacoteUrl, source_sha256: candidate.hash })
  }
  // A bare full name in a later scenario may refer to the unique, already
  // resolved name+party printed in this same publication. Never infer a surname.
  for (const row of allRows) {
    if (aliases.has(row.raw_label) || row.match_status === "not_candidate" || /[()]/.test(row.raw_label)) continue
    const matches = allRows.filter((other) => other.raw_label.replace(/\s+\([^()]+\)$/, "") === row.raw_label && /\([^()]+\)$/.test(other.raw_label))
    const slugs = new Set(matches.map((other) => aliases.get(other.raw_label)))
    if (slugs.size !== 1 || ![...slugs][0]) continue
    const slug = [...slugs][0]!
    aliases.set(row.raw_label, slug)
    observations.push({ raw_label: row.raw_label, candidate_slug: slug, basis: "same_publication_full_name", source_url: evidence.url, source_sha256: evidence.evidence_sha256 })
  }
  if (observations.length) evidence.identity_observations = observations
  return aliases
}

function parseTseRegistryCsv(csv: string): RegistroTseMonitoramento[] {
  const lines = csv.trim().split(/\r?\n/)
  const header = lines.shift()?.split(";") ?? []
  const required = [
    "registration_id",
    "office",
    "geography",
    "field_start",
    "field_end",
    "sample_size",
    "margin_error_pp",
    "institute",
  ]
  const index = Object.fromEntries(required.map((key) => [key, header.indexOf(key)]))
  if (Object.values(index).some((value) => value < 0)) throw new Error("CSV TSE inesperado")
  return lines.filter(Boolean).map((line) => {
    const values = line.split(";")
    return {
      registration_id: values[index.registration_id],
      office: values[index.office],
      geography: values[index.geography],
      field_start: values[index.field_start],
      field_end: values[index.field_end],
      sample_size: Number(values[index.sample_size]),
      margin_error_pp: Number(values[index.margin_error_pp]),
      institute: values[index.institute],
    }
  })
}

function fingerprint(evidence: EvidenciaPesquisaCandidata): string {
  const stable: Partial<EvidenciaPesquisaCandidata> = { ...evidence }
  delete stable.observed_at
  delete stable.evidence_sha256
  delete stable.registry_observation
  delete stable.identity_observations
  if (stable.result_document) stable.result_document = { ...stable.result_document, observed_at: "" }
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex")
}

function decision(
  classification: ClassificacaoMonitoramento,
  eligible: boolean,
  reason: string,
): DecisaoMonitoramento {
  return { classification, eligible_for_human_review: eligible, reason }
}

function classify(input: {
  source: SourceContract
  evidence: EvidenciaPesquisaCandidata | null
  registry: RegistroTseMonitoramento[]
  aliases: Map<string, string | null>
  baseline: EvidenciaPesquisaCandidata | null
  observedAt: string
  networkError?: "timeout"
  parseError?: boolean
}): ResultadoAvaliacao {
  if (input.source.status !== "aprovado") {
    return { decision: decision("conflitante", false, "source_not_approved"), evidence: null, baseline: input.baseline }
  }
  if (input.networkError === "timeout") {
    return { decision: decision("fonte indisponivel", false, "source_timeout"), evidence: null, baseline: input.baseline }
  }
  if (input.parseError || !input.evidence) {
    return { decision: decision("fonte indisponivel", false, "unexpected_html"), evidence: null, baseline: input.baseline }
  }

  const registry = input.registry.find((entry) => entry.registration_id === input.evidence?.registration.id)
  if (
    !registry ||
    !registry.office.toLocaleLowerCase("pt-BR").includes(input.evidence.scenario.office.toLocaleLowerCase("pt-BR")) ||
    ![input.evidence.scenario.geography, input.evidence.scenario.geography_code]
      .map((value) => value.toLocaleLowerCase("pt-BR"))
      .includes(registry.geography.toLocaleLowerCase("pt-BR")) ||
    registry.field_start !== input.evidence.fieldwork.start ||
    registry.field_end !== input.evidence.fieldwork.end ||
    registry.sample_size !== input.evidence.sample.size ||
    !margemCompativelComRegistro(registry, input.evidence.margin_error_pp) ||
    !(
      registry.institute.toLocaleLowerCase("pt-BR").includes(input.evidence.institute.toLocaleLowerCase("pt-BR")) ||
      input.evidence.institute.toLocaleLowerCase("pt-BR").includes(registry.institute.toLocaleLowerCase("pt-BR"))
    )
  ) {
    return { decision: decision("conflitante", false, "registry_conflict"), evidence: input.evidence, baseline: input.baseline }
  }

  const resolveResults = (results: EvidenciaPesquisaCandidata["results"]): EvidenciaPesquisaCandidata["results"] => results.map((result) => {
    if (result.match_status === "not_candidate") return result
    const candidateSlug = input.aliases.get(result.raw_label)
    return candidateSlug
      ? { ...result, candidate_slug: candidateSlug, match_status: "exact_alias" as const }
      : { ...result, candidate_slug: null, match_status: "indeterminado" as const }
  })
  const resolvedEvidence: EvidenciaPesquisaCandidata = {
    ...input.evidence,
    results: resolveResults(input.evidence.results),
    ...(input.evidence.additional_scenarios ? {
      additional_scenarios: input.evidence.additional_scenarios.map((entry) => ({ ...entry, results: resolveResults(entry.results) })),
    } : {}),
  }
  if ([resolvedEvidence, ...(resolvedEvidence.additional_scenarios ?? [])].some((entry) => entry.results.some((result) => result.match_status === "indeterminado"))) {
    return { decision: decision("identidade nao resolvida", false, "identity_unresolved"), evidence: resolvedEvidence, baseline: input.baseline }
  }

  const ageDays = (Date.parse(input.observedAt) - Date.parse(resolvedEvidence.publication_date)) / 86_400_000
  if (!Number.isFinite(ageDays) || ageDays > STALE_AFTER_DAYS) {
    return { decision: decision("vencido", false, "evidence_stale"), evidence: resolvedEvidence, baseline: input.baseline }
  }
  if (!input.baseline) {
    return { decision: decision("novo", true, "approved_new_evidence"), evidence: resolvedEvidence, baseline: null }
  }
  const resolvedBaseline: EvidenciaPesquisaCandidata = {
    ...input.baseline,
    results: resolveResults(input.baseline.results),
    ...(input.baseline.additional_scenarios ? {
      additional_scenarios: input.baseline.additional_scenarios.map((entry) => ({ ...entry, results: resolveResults(entry.results) })),
    } : {}),
  }
  if (fingerprint(resolvedBaseline) === fingerprint(resolvedEvidence)) {
    return { decision: decision("inalterado", false, "evidence_unchanged"), evidence: resolvedEvidence, baseline: resolvedBaseline }
  }
  return { decision: decision("alterado", true, "retroactive_change"), evidence: resolvedEvidence, baseline: resolvedBaseline }
}

export function avaliarCasoMonitoramento(
  goldenCase: CasoGoldenMonitoramento,
  fixturesDir: string,
): ResultadoAvaliacao {
  const source = loadSources().get(goldenCase.source_id)
  if (!source) throw new Error(`fonte inexistente no scorecard: ${goldenCase.source_id}`)
  if (source.status !== "aprovado") {
    return classify({ source, evidence: null, registry: [], aliases: new Map(), baseline: null, observedAt: goldenCase.observed_at })
  }
  if (goldenCase.network_error) {
    return classify({ source, evidence: null, registry: [], aliases: new Map(), baseline: null, observedAt: goldenCase.observed_at, networkError: goldenCase.network_error })
  }

  let html = readFileSync(resolve(fixturesDir, goldenCase.html_fixture ?? ""), "utf8")
  for (const [before, after] of goldenCase.html_replacements ?? []) html = html.replace(before, after)
  let evidence: EvidenciaPesquisaCandidata | null = null
  let parseError = false
  const target = obterAlvoMonitoramento(source.id, goldenCase.poll_id)
  try {
    evidence = parsePublicacaoMonitorada({ html, observedAt: goldenCase.observed_at, source, target })
  } catch {
    parseError = true
  }
  const registry = parseTseRegistryCsv(readFileSync(resolve(fixturesDir, goldenCase.registry_fixture), "utf8"))
  if (goldenCase.registry_registration_override) registry[0].registration_id = goldenCase.registry_registration_override
  if (goldenCase.registry_institute_override) {
    const expected = registry.find((entry) => entry.registration_id === evidence?.registration.id)
    if (expected) expected.institute = goldenCase.registry_institute_override
  }

  let baseline: EvidenciaPesquisaCandidata | null = null
  if (evidence && goldenCase.baseline === "same_as_observed") baseline = structuredClone(evidence)
  if (evidence && goldenCase.baseline_result_values) {
    baseline = structuredClone(evidence)
    baseline.results = baseline.results.map((result, index) => ({
      ...result,
      value_percent: goldenCase.baseline_result_values?.[index] ?? result.value_percent,
    }))
  }
  return classify({
    source,
    evidence,
    registry,
    aliases: loadAliases(target),
    baseline,
    observedAt: goldenCase.observed_at,
    parseError,
  })
}

function normalizedContract(result: ResultadoAvaliacao): Record<string, unknown> | null {
  if (!result.evidence) return null
  const evidence = result.evidence
  return {
    source_id: evidence.source_id,
    source_status: evidence.source_status,
    publishable_by_default: false,
    state: "indeterminado",
    instituto: { value: evidence.institute, status: "indeterminado" },
    fieldwork: {
      start: { value: evidence.fieldwork.start, status: "indeterminado" },
      end: { value: evidence.fieldwork.end, status: "indeterminado" },
    },
    publication_date: { value: evidence.publication_date, status: "indeterminado" },
    sample: { size: { value: evidence.sample.size, status: "indeterminado" }, population: { value: evidence.sample.population, status: "indeterminado" } },
    margin_error_pp: { value: evidence.margin_error_pp, status: "indeterminado" },
    confidence_percent: { value: evidence.confidence_percent, status: "indeterminado" },
    method: { value: evidence.method, status: "indeterminado" },
    registration: { code: { value: evidence.registration.id, status: "indeterminado" }, url: { value: evidence.registration.url, status: "indeterminado" } },
    geography: {
      type: evidence.scenario.geography_code === "BR" ? "nacional" : "unidade_federativa",
      label: evidence.scenario.geography,
      code: evidence.scenario.geography_code,
    },
    office: evidence.scenario.office,
    identity_aliases: [evidence, ...(evidence.additional_scenarios ?? [])].flatMap(({ scenario, results }) => results.flatMap((row) => {
      const proof = evidence.identity_observations?.find((entry) => entry.raw_label === row.raw_label && entry.candidate_slug === row.candidate_slug)
      return proof ? [{ raw_label: row.raw_label, candidate_slug: row.candidate_slug, year: 2026, office: scenario.office, geography: scenario.geography, turn: scenario.turn, scenario_id: scenario.id, proof }] : []
    })),
    provenance: {
      result_url: evidence.url,
      ...(evidence.result_notes?.length ? { result_notes: evidence.result_notes } : {}),
      ...(evidence.registry_observation ? { registry_observation: evidence.registry_observation } : {}),
      supporting_urls: [evidence.registry_observation?.url, evidence.result_document?.url].filter((url): url is string => Boolean(url)),
      consulted_at: evidence.observed_at,
      capture: { format: evidence.result_document ? "html+pdf" : "html", sha256: evidence.evidence_sha256, ...(evidence.result_document ? { supporting_pdf_sha256: evidence.result_document.evidence_sha256 } : {}), status: "indeterminado" },
    },
    cenarios: [evidence, ...(evidence.additional_scenarios ?? [])].map(({ scenario, results }) => ({
      id: scenario.id,
      turn: scenario.turn,
      geography: scenario.geography,
      label_raw: scenario.label,
      question: { value: scenario.question, status: "indeterminado" },
      comparability_key: `2026|${scenario.office}|${scenario.geography_code}|${scenario.turn}|${scenario.id}`,
      resultados: results.map((entry) => ({ ...entry, status: "indeterminado" })),
    })),
  }
}

export function escreverRelatorios(results: Array<{ case_id: string; result: ResultadoAvaliacao }>, outputDir: string): void {
  const resolvedOutput = resolve(outputDir)
  mkdirSync(resolvedOutput, { recursive: true })
  const proposal = {
    schema_version: "1.0.0",
    dry_run: true,
    human_review_required: true,
    generated_at: new Date().toISOString(),
    items: results.map(({ case_id, result }) => ({
      id: case_id,
      decision: result.decision,
      evidence: result.evidence,
      normalized_contract: normalizedContract(result),
      ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}),
    })),
  }
  const diff = {
    schema_version: "1.0.0",
    applies_automatically: false,
    operations: results
      .filter(({ result }) => result.decision.eligible_for_human_review)
      .map(({ case_id, result }) => ({
        id: case_id,
        classification: result.decision.classification,
        before: result.baseline,
        proposed: normalizedContract(result),
      })),
  }
  const counts = Object.fromEntries(
    [...new Set(results.map(({ result }) => result.decision.classification))]
      .sort()
      .map((classification) => [classification, results.filter(({ result }) => result.decision.classification === classification).length]),
  )
  const summary = [
    "# Monitoramento de pesquisas eleitorais",
    "",
    "Dry-run: sim. Revisao humana: obrigatoria. Nenhum dado foi publicado.",
    "",
    ...Object.entries(counts).map(([classification, count]) => `- ${classification}: ${count}`),
    "",
    `Propostas elegiveis para revisao: ${diff.operations.length}`,
    "",
    "## Itens observados",
    "",
    ...results.map(({ case_id, result }) => (
      `- ${case_id}: ${result.decision.classification} (${result.decision.reason})`
    )),
  ].join("\n")
  writeFileSync(resolve(resolvedOutput, "proposal.json"), `${JSON.stringify(proposal, null, 2)}\n`)
  writeFileSync(resolve(resolvedOutput, "diff.json"), `${JSON.stringify(diff, null, 2)}\n`)
  writeFileSync(resolve(resolvedOutput, "summary.md"), `${summary}\n`)
}

export function executarMonitoramentoComFixtures(input: {
  goldenPath: string
  fixturesDir: string
  outputDir: string
}): void {
  const cases = readFileSync(input.goldenPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as CasoGoldenMonitoramento)
  escreverRelatorios(
    cases.map((goldenCase) => ({
      case_id: goldenCase.case_id,
      result: avaliarCasoMonitoramento(goldenCase, input.fixturesDir),
    })),
    input.outputDir,
  )
}

export function obterContratoFonte(sourceId: string): SourceContract {
  const source = loadSources().get(sourceId)
  if (!source) throw new Error(`fonte inexistente no scorecard: ${sourceId}`)
  return source
}

export function avaliarEvidenciaAoVivo(input: {
  source: SourceContract
  target: AlvoMonitoramento
  html: string
  observedAt: string
  registry?: RegistroTseMonitoramento[]
  registrySupplement?: ObservacaoPesqele
  resultDocument?: DocumentoPoderData | DocumentoRealTime
}): ResultadoAvaliacao {
  const evidence = parsePublicacaoMonitorada({
    html: input.html,
    observedAt: input.observedAt,
    source: input.source,
    target: input.target,
    registrySupplement: input.registrySupplement,
    resultDocument: input.resultDocument,
  })
  const registry: RegistroTseMonitoramento[] = input.registry ?? []
  const result = classify({
    source: input.source,
    evidence,
    registry,
    aliases: enrichAliases(input.target, evidence, loadAliases(input.target)),
    baseline: null,
    observedAt: input.observedAt,
  })
  if (result.decision.eligible_for_human_review && (!evidence.scenario_complete || !evidence.publication_complete)) {
    return { ...result, decision: decision("conflitante", false, "scenario_incomplete") }
  }
  return result
}

export function resultadoFonteIndisponivel(reason: string): ResultadoAvaliacao {
  return {
    decision: decision("fonte indisponivel", false, reason),
    evidence: null,
    baseline: null,
  }
}

export function resultadoFalhaColeta(input: { detail: string; source_url: string; source_observed_at: string | null; source_sha256: string | null }): ResultadoAvaliacao {
  const conflict = /conflitant|divergente|duelo conflitante/i.test(input.detail)
  const parsedSource = input.source_sha256 !== null
  return {
    decision: conflict ? decision("conflitante", false, "source_metadata_conflict")
      : parsedSource ? decision("extração incompleta", false, "extraction_incomplete")
        : decision("fonte indisponivel", false, /timeout/i.test(input.detail) ? "source_timeout" : "source_unavailable"),
    evidence: null, baseline: null, diagnostic: input,
  }
}

export function resultadoEvidenciaBloqueada(
  evidence: EvidenciaPesquisaCandidata,
  reason: string,
): ResultadoAvaliacao {
  return {
    decision: decision("fonte indisponivel", false, reason),
    evidence,
    baseline: null,
  }
}
