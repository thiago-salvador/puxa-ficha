import "server-only"

import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import type { RegistroTseMonitoramento } from "./pesquisas-monitoramento-tse"

export type ClassificacaoMonitoramento =
  | "novo"
  | "alterado"
  | "inalterado"
  | "vencido"
  | "conflitante"
  | "fonte indisponivel"
  | "identidade nao resolvida"

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
    match_status: "exact_alias" | "indeterminado"
    value_percent: number
  }>
  observed_at: string
  evidence_sha256: string
}

interface SourceContract {
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

export interface DecisaoMonitoramento {
  classification: ClassificacaoMonitoramento
  eligible_for_human_review: boolean
  reason: string
}

export interface CasoGoldenMonitoramento {
  case_id: string
  source_id: string
  html_fixture?: string
  registry_fixture: string
  observed_at: string
  network_error?: "timeout"
  html_replacements?: Array<[string, string]>
  registry_registration_override?: string
  baseline?: "same_as_observed"
  baseline_result_values?: number[]
  reference_solution: DecisaoMonitoramento
}

interface ResultadoAvaliacao {
  decision: DecisaoMonitoramento
  evidence: EvidenciaPesquisaCandidata | null
  baseline: EvidenciaPesquisaCandidata | null
}

const RESULT_URL = "https://www.poder360.com.br/poderdata/leia-os-resultados-da-pesquisa-poderdata-aya-para-presidente/"
const REGISTRY_URL = "https://pesqele-divulgacao.tse.jus.br/"
const SUPPORTED_SOURCE_ID = "poderdata-aya-nacional-2026"
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

function loadAliases(): Map<string, string | null> {
  const paths = [
    "scripts/data/pesquisas-presidencia-2026.json",
    "scripts/data/pesquisas-governadores-2026.json",
  ]
  const aliases = new Map<string, string | null>()
  function add(rawLabel: string, candidateSlug: string): void {
    const previous = aliases.get(rawLabel)
    aliases.set(rawLabel, previous === undefined || previous === candidateSlug ? candidateSlug : null)
  }
  const president = JSON.parse(readFileSync(paths[0], "utf8")) as {
    exact_aliases: Array<{ raw_label: string; candidate_slug: string }>
  }
  president.exact_aliases.forEach((alias) => add(alias.raw_label, alias.candidate_slug))
  const governors = JSON.parse(readFileSync(paths[1], "utf8")) as {
    datasets: Array<{ exact_aliases: Array<{ raw_label: string; candidate_slug: string }> }>
  }
  governors.datasets.flatMap((dataset) => dataset.exact_aliases).forEach((alias) => add(alias.raw_label, alias.candidate_slug))
  return aliases
}

function stripExternalMarkup(html: string): string {
  const withoutExecutable = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  return withoutExecutable
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&ordm;|&#186;/gi, "o")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim()
}

const MONTHS: Record<string, string> = {
  jan: "01",
  janeiro: "01",
  fev: "02",
  fevereiro: "02",
  mar: "03",
  marco: "03",
  março: "03",
  abr: "04",
  abril: "04",
  maio: "05",
  jun: "06",
  junho: "06",
  jul: "07",
  julho: "07",
  ago: "08",
  agosto: "08",
  set: "09",
  setembro: "09",
  out: "10",
  outubro: "10",
  nov: "11",
  novembro: "11",
  dez: "12",
  dezembro: "12",
}

function isoDate(day: string, month: string, year: string): string {
  const normalizedMonth = MONTHS[month.toLocaleLowerCase("pt-BR")]
  if (!normalizedMonth) throw new Error(`mes invalido: ${month}`)
  return `${year}-${normalizedMonth}-${day.padStart(2, "0")}`
}

function extractPublicationDate(html: string, text: string): string {
  const machine = html.match(/(?:datePublished|datetime)[^0-9]{0,20}(20\d{2}-\d{2}-\d{2})/i)?.[1]
  if (machine) return machine
  const human = text.match(/publicad[oa]\s+em\s+(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(20\d{2})/i)
  if (human) return isoDate(human[1], human[2], human[3])
  const compact = text.match(/\b(\d{1,2})\.([a-zçã]{3,9})\.(20\d{2})\b/i)
  if (compact) return isoDate(compact[1], compact[2], compact[3])
  throw new Error("data de publicacao ausente")
}

function normalizeNumber(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."))
}

function requireMatch(text: string, pattern: RegExp, label: string): RegExpMatchArray {
  const match = text.match(pattern)
  if (!match) throw new Error(`HTML inesperado: ${label} ausente`)
  return match
}

function requireFirstMatch(text: string, patterns: RegExp[], label: string): RegExpMatchArray {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match
  }
  throw new Error(`HTML inesperado: ${label} ausente`)
}

function assertPoderDataSource(source: SourceContract): void {
  if (source.id !== SUPPORTED_SOURCE_ID || source.status !== "aprovado") {
    throw new Error("adaptador exige fonte PoderData aprovada")
  }
}

function resultUrlFor(input: { source: SourceContract; url?: string }): string {
  if (input.url) return input.url
  if (input.source.representative_poll) return input.source.representative_poll.result_url
  return RESULT_URL
}

export function parsePoderDataPublicacao(input: {
  html: string
  observedAt: string
  source: SourceContract
  url?: string
}): EvidenciaPesquisaCandidata {
  assertPoderDataSource(input.source)
  const text = stripExternalMarkup(input.html)
  if (!/PoderData/i.test(text)) throw new Error("HTML inesperado: instituto ausente")
  const publicationDate = extractPublicationDate(input.html, text)
  const registration = requireMatch(text, /\b(?:BR|[A-Z]{2})-\d{5}\/2026\b/, "registro")[0]
  const fieldwork = requireMatch(text, /(\d{1,2})\s+a\s+(\d{1,2})\s+de\s+([a-zçã]+)(?:\s+de\s+(20\d{2}))?/i, "periodo de campo")
  const sample = requireFirstMatch(text, [
    /(?:ouviu|ouvidos|entrevistou|entrevistados|foram ouvidos)[^0-9]{0,30}(\d{1,3}(?:\.\d{3})+|\d{3,6})\s+(?:eleitores|pessoas|entrevistas)/i,
    /(?:foram|total de)[^0-9]{0,20}(\d{1,3}(?:\.\d{3})+|\d{3,6})\s+entrevistas/i,
  ], "amostra")[1]
  const margin = requireMatch(text, /margem de erro[^0-9]{0,20}(\d+(?:[,.]\d+)?)\s+pontos?/i, "margem de erro")[1]
  const confidence = requireMatch(text, /(?:intervalo|nivel) de confian[cç]a[^0-9]{0,20}(\d+(?:[,.]\d+)?)%/i, "confianca")[1]
  const result = requireMatch(text, /([A-ZÀ-Ü][^.%]{1,80}?\([A-ZÀ-Ü]{2,20}\))\s+(?:aparece\s+)?com\s+(\d+(?:[,.]\d+)?)%[^.]{0,100}?contra\s+(\d+(?:[,.]\d+)?)%\s+(?:do|da|de)\s+(?:senador(?:a)?\s+|presidente\s+)?([A-ZÀ-Ü][^.%]{1,80}?\([A-ZÀ-Ü]{2,20}\))\s+no\s+cen[aá]rio\s+de\s+1[oº]\s+turno/i, "resultados")
  const method = /\bURA\b/i.test(text) ? "telefonico por URA" : "indeterminado"
  const resultUrl = resultUrlFor(input)
  const evidenceSha = createHash("sha256").update(input.html).digest("hex")
  const fieldYear = fieldwork[4] ?? publicationDate.slice(0, 4)
  return {
    source_id: input.source.id,
    source_status: input.source.status,
    url: resultUrl,
    institute: input.source.roles.institute,
    registration: {
      id: registration,
      url: input.source.representative_poll?.registry_url ?? REGISTRY_URL,
    },
    fieldwork: {
      start: isoDate(fieldwork[1], fieldwork[3], fieldYear),
      end: isoDate(fieldwork[2], fieldwork[3], fieldYear),
    },
    publication_date: publicationDate,
    scenario: {
      id: `${registration.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-")}-1t-principal`,
      office: "Presidente",
      geography: "Brasil",
      geography_code: "BR",
      turn: 1,
      label: "cenario de 1o turno",
      question: null,
    },
    sample: { size: normalizeNumber(sample), population: "eleitorado brasileiro" },
    margin_error_pp: normalizeNumber(margin),
    confidence_percent: normalizeNumber(confidence),
    method,
    results: [
      { raw_label: result[1].trim(), candidate_slug: null, match_status: "indeterminado", value_percent: normalizeNumber(result[2]) },
      { raw_label: result[4].trim(), candidate_slug: null, match_status: "indeterminado", value_percent: normalizeNumber(result[3]) },
    ],
    observed_at: input.observedAt,
    evidence_sha256: evidenceSha,
  }
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
    (registry.margin_error_pp !== null && registry.margin_error_pp !== input.evidence.margin_error_pp)
  ) {
    return { decision: decision("conflitante", false, "registry_conflict"), evidence: input.evidence, baseline: input.baseline }
  }

  const resolvedEvidence: EvidenciaPesquisaCandidata = {
    ...input.evidence,
    results: input.evidence.results.map((result) => {
      const candidateSlug = input.aliases.get(result.raw_label)
      return candidateSlug
        ? { ...result, candidate_slug: candidateSlug, match_status: "exact_alias" as const }
        : { ...result, candidate_slug: null, match_status: "indeterminado" as const }
    }),
  }
  if (resolvedEvidence.results.some((result) => result.match_status !== "exact_alias")) {
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
    results: input.baseline.results.map((result) => {
      const candidateSlug = input.aliases.get(result.raw_label)
      return candidateSlug
        ? { ...result, candidate_slug: candidateSlug, match_status: "exact_alias" as const }
        : { ...result, candidate_slug: null, match_status: "indeterminado" as const }
    }),
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
  try {
    evidence = parsePoderDataPublicacao({ html, observedAt: goldenCase.observed_at, source })
  } catch {
    parseError = true
  }
  const registry = parseTseRegistryCsv(readFileSync(resolve(fixturesDir, goldenCase.registry_fixture), "utf8"))
  if (goldenCase.registry_registration_override) registry[0].registration_id = goldenCase.registry_registration_override

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
    aliases: loadAliases(),
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
    geography: { type: "pais", label: evidence.scenario.geography, code: evidence.scenario.geography_code },
    office: evidence.scenario.office,
    provenance: {
      result_url: evidence.url,
      supporting_urls: [],
      consulted_at: evidence.observed_at,
      capture: { format: "html", sha256: evidence.evidence_sha256, status: "indeterminado" },
    },
    cenarios: [{
      id: evidence.scenario.id,
      turn: evidence.scenario.turn,
      geography: evidence.scenario.geography,
      label_raw: evidence.scenario.label,
      question: { value: evidence.scenario.question, status: "indeterminado" },
      comparability_key: `2026|${evidence.scenario.office}|${evidence.scenario.geography_code}|${evidence.scenario.turn}|${evidence.scenario.id}`,
      resultados: evidence.results.map((entry) => ({ ...entry, status: "indeterminado" })),
    }],
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
  html: string
  observedAt: string
  registry?: RegistroTseMonitoramento[]
}): ResultadoAvaliacao {
  const evidence = parsePoderDataPublicacao({ html: input.html, observedAt: input.observedAt, source: input.source })
  const representative = input.source.representative_poll
  if (!representative) throw new Error("fonte aprovada sem rodada representativa")
  const registry: RegistroTseMonitoramento[] = input.registry ?? [{
    registration_id: representative.registration_id,
    office: "Presidente",
    geography: "Brasil",
    field_start: evidence.fieldwork.start,
    field_end: evidence.fieldwork.end,
    sample_size: evidence.sample.size,
    margin_error_pp: evidence.margin_error_pp,
    institute: input.source.roles.institute,
  }]
  return classify({
    source: input.source,
    evidence,
    registry,
    aliases: loadAliases(),
    baseline: null,
    observedAt: input.observedAt,
  })
}

export function resultadoFonteIndisponivel(reason: string): ResultadoAvaliacao {
  return {
    decision: decision("fonte indisponivel", false, reason),
    evidence: null,
    baseline: null,
  }
}
