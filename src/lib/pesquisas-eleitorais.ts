import "server-only"

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export type EstadoPesquisa =
  | "publicado"
  | "antigo"
  | "indeterminado"
  | "erro"
  | "sem_pesquisa_qualificada"

export type StatusFonte = "aprovado" | "condicional" | "excluído"
export type StatusVinculo = "exact_alias" | "not_candidate" | "indeterminado"

export interface EscopoAlias {
  year: number
  office: string
  geography: string
  turn: 1 | 2
  scenarioId: string
}

export interface AliasExato {
  rawLabel: string
  candidateSlug: string
  year?: number
  office?: string
  geography?: string
  turn?: 1 | 2
  scenarioId?: string
}

export type ResolucaoAlias =
  | { status: "exact_alias"; candidateSlug: string }
  | { status: "indeterminado"; candidateSlug: null }

export interface ResultadoPesquisaEleitoral {
  rawLabel: string
  candidateSlug: string | null
  matchStatus: StatusVinculo
  valuePercent: number | null
  status: EstadoPesquisa
}

export interface ProvenienciaPesquisaEleitoral {
  resultUrl: string
  supportingUrls: string[]
  registrationUrl: string | null
  sourceKind: string
  routeClass: string
  routeReason: string
  consultedAt: string
  capture: {
    format: string
    sha256: string
    supportingPdfSha256?: string
    status: EstadoPesquisa
  }
}

export interface CenarioPesquisaEleitoral {
  id: string
  turn: 1 | 2
  geography: string
  labelRaw: string
  question: { value: string | null; status: EstadoPesquisa }
  comparabilityKey: string
  resultados: ResultadoPesquisaEleitoral[]
}

export interface PesquisaEleitoral {
  id: string
  sourceId: string
  sourceStatus: StatusFonte
  state: EstadoPesquisa
  electionYear: number
  instituto: { value: string | null; status: EstadoPesquisa }
  contratante: { value: string | null; status: EstadoPesquisa }
  fieldwork: {
    start: { value: string | null; status: EstadoPesquisa }
    end: { value: string | null; status: EstadoPesquisa }
  }
  publicationDate: { value: string | null; status: EstadoPesquisa }
  sample: {
    size: { value: number | null; status: EstadoPesquisa }
    population: { value: string | null; status: EstadoPesquisa }
  }
  marginErrorPp: { value: number | null; status: EstadoPesquisa }
  confidencePercent: { value: number | null; status: EstadoPesquisa }
  method: { value: string | null; status: EstadoPesquisa }
  registration: {
    code: { value: string | null; status: EstadoPesquisa }
    url: { value: string | null; status: EstadoPesquisa }
  }
  geography: { type: string; label: string; code: string }
  office: string
  provenance: ProvenienciaPesquisaEleitoral
  cenarios: CenarioPesquisaEleitoral[]
}

export interface CatalogoPesquisasEleitorais {
  schemaVersion: string
  aliasesVersion: string
  electionScope: { year: number; office: string; geography: string }
  aliases: AliasExato[]
  pesquisas: PesquisaEleitoral[]
}

export interface EscopoComparabilidade {
  electionYear: number
  office: string
  geographyCode: string
  turn: 1 | 2
  comparabilityKey: string
}

export interface PesquisaEleitoralDoCandidato
  extends Omit<PesquisaEleitoral, "cenarios"> {
  cenario: Omit<CenarioPesquisaEleitoral, "resultados">
  resultado: ResultadoPesquisaEleitoral
}

export class ErroValidacaoPesquisasEleitorais extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`Dados de pesquisas eleitorais inválidos: ${issues.join("; ")}`)
    this.name = "ErroValidacaoPesquisasEleitorais"
    this.issues = issues
  }
}

const ESTADOS = new Set<EstadoPesquisa>([
  "publicado",
  "antigo",
  "indeterminado",
  "erro",
  "sem_pesquisa_qualificada",
])
const STATUS_FONTES = new Set<StatusFonte>(["aprovado", "condicional", "excluído"])
const STATUS_VINCULO = new Set<StatusVinculo>([
  "exact_alias",
  "not_candidate",
  "indeterminado",
])

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ErroValidacaoPesquisasEleitorais([`${path} deve ser objeto`])
  }
  return value as Record<string, unknown>
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ErroValidacaoPesquisasEleitorais([`${path} deve ser array`])
  }
  return value
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ErroValidacaoPesquisasEleitorais([`${path} deve ser texto não vazio`])
  }
  return value
}

function nullableText(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path)
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ErroValidacaoPesquisasEleitorais([`${path} deve ser número finito`])
  }
  return value
}

function percentage(value: unknown, path: string): number | null {
  if (value === null) return null
  const parsed = finiteNumber(value, path)
  if (parsed < 0 || parsed > 100) {
    throw new ErroValidacaoPesquisasEleitorais([`${path} deve estar entre 0 e 100`])
  }
  return parsed
}

function state(value: unknown, path: string): EstadoPesquisa {
  if (typeof value !== "string" || !ESTADOS.has(value as EstadoPesquisa)) {
    throw new ErroValidacaoPesquisasEleitorais([`${path} tem estado inválido`])
  }
  return value as EstadoPesquisa
}

function url(value: unknown, path: string, nullable = false): string | null {
  if (nullable && (value === null || value === undefined)) return null
  const parsed = text(value, path)
  let candidate: URL
  try {
    candidate = new URL(parsed)
  } catch {
    throw new ErroValidacaoPesquisasEleitorais([`${path} deve ser URL válida`])
  }
  if (candidate.protocol !== "https:" && candidate.protocol !== "http:") {
    throw new ErroValidacaoPesquisasEleitorais([`${path} deve usar HTTP ou HTTPS`])
  }
  return parsed
}

function isoDate(value: unknown, path: string, nullable = false): string | null {
  if (nullable && value === null) return null
  const parsed = text(value, path)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    throw new ErroValidacaoPesquisasEleitorais([`${path} deve usar YYYY-MM-DD`])
  }
  const date = new Date(`${parsed}T00:00:00Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== parsed) {
    throw new ErroValidacaoPesquisasEleitorais([`${path} tem data inválida`])
  }
  return parsed
}

function isoDateTime(value: unknown, path: string): string {
  const parsed = text(value, path)
  if (Number.isNaN(Date.parse(parsed))) {
    throw new ErroValidacaoPesquisasEleitorais([`${path} tem data/hora inválida`])
  }
  return parsed
}

function valueStatus<T>(
  value: unknown,
  path: string,
  parseValue: (raw: unknown, valuePath: string) => T,
): { value: T; status: EstadoPesquisa } {
  const raw = object(value, path)
  const parsedValue = parseValue(raw.value, `${path}.value`)
  const parsedState = state(raw.status, `${path}.status`)
  if (raw.value === null && parsedState === "publicado") {
    throw new ErroValidacaoPesquisasEleitorais([
      `${path} não pode publicar valor ausente`,
    ])
  }
  return { value: parsedValue, status: parsedState }
}

function assertUnique(values: string[], path: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) {
      throw new ErroValidacaoPesquisasEleitorais([`${path} contém chave duplicada: ${value}`])
    }
    seen.add(value)
  }
}

/** Detecta propriedades JSON repetidas antes de JSON.parse descartar a primeira. */
function assertNoDuplicateJsonKeys(raw: string, label: string): void {
  const stack: Array<{ kind: "object" | "array"; keys?: Set<string>; expectingKey?: boolean }> = []
  let index = 0

  const skipWhitespace = () => {
    while (/\s/.test(raw[index] ?? "")) index += 1
  }
  const readString = (): string => {
    const start = index
    index += 1
    let escaped = false
    while (index < raw.length) {
      const char = raw[index]
      if (!escaped && char === '"') {
        index += 1
        return JSON.parse(raw.slice(start, index)) as string
      }
      escaped = !escaped && char === "\\"
      if (char !== "\\") escaped = false
      index += 1
    }
    throw new ErroValidacaoPesquisasEleitorais([`${label} contém string JSON incompleta`])
  }

  while (index < raw.length) {
    skipWhitespace()
    const char = raw[index]
    const context = stack.at(-1)
    if (char === "{") {
      stack.push({ kind: "object", keys: new Set(), expectingKey: true })
      index += 1
    } else if (char === "[") {
      stack.push({ kind: "array" })
      index += 1
    } else if (char === "}" || char === "]") {
      stack.pop()
      index += 1
    } else if (char === ',') {
      if (context?.kind === "object") context.expectingKey = true
      index += 1
    } else if (char === '"') {
      const value = readString()
      skipWhitespace()
      if (context?.kind === "object" && context.expectingKey && raw[index] === ":") {
        if (context.keys?.has(value)) {
          throw new ErroValidacaoPesquisasEleitorais([
            `${label} contém propriedade JSON duplicada: ${value}`,
          ])
        }
        context.keys?.add(value)
        context.expectingKey = false
      }
    } else {
      index += 1
    }
  }
}

function parseJson(raw: string, label: string): unknown {
  assertNoDuplicateJsonKeys(raw, label)
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    throw new ErroValidacaoPesquisasEleitorais([
      `${label} não é JSON válido: ${error instanceof Error ? error.message : "erro desconhecido"}`,
    ])
  }
}

function aliasApplies(alias: AliasExato, scope: EscopoAlias): boolean {
  return (
    (alias.year === undefined || alias.year === scope.year) &&
    (alias.office === undefined || alias.office === scope.office) &&
    (alias.geography === undefined || alias.geography === scope.geography) &&
    (alias.turn === undefined || alias.turn === scope.turn) &&
    (alias.scenarioId === undefined || alias.scenarioId === scope.scenarioId)
  )
}

export function resolverAliasExato(
  rawLabel: string,
  scope: EscopoAlias,
  aliases: readonly AliasExato[],
): ResolucaoAlias {
  const slugs = new Set(
    aliases
      .filter((alias) => alias.rawLabel === rawLabel && aliasApplies(alias, scope))
      .map((alias) => alias.candidateSlug),
  )
  if (slugs.size !== 1) return { status: "indeterminado", candidateSlug: null }
  return { status: "exact_alias", candidateSlug: [...slugs][0] }
}

function parseAliases(root: Record<string, unknown>): {
  aliases: AliasExato[]
  aliasesVersion: string
  scope: { year: number; office: string; geography: string }
} {
  const election = object(root.election_scope, "pesquisas.election_scope")
  const scope = {
    year: finiteNumber(election.year, "pesquisas.election_scope.year"),
    office: text(election.office, "pesquisas.election_scope.office"),
    geography: text(election.geography, "pesquisas.election_scope.geography"),
  }
  const aliasScope = object(root.alias_scope, "pesquisas.alias_scope")
  if (
    aliasScope.year !== scope.year ||
    aliasScope.office !== scope.office ||
    aliasScope.geography !== scope.geography
  ) {
    throw new ErroValidacaoPesquisasEleitorais([
      "pesquisas.alias_scope é incompatível com election_scope",
    ])
  }
  const aliases = array(root.exact_aliases, "pesquisas.exact_aliases").map((entry, index) => {
    const raw = object(entry, `pesquisas.exact_aliases[${index}]`)
    const turn = raw.turn === undefined ? undefined : finiteNumber(raw.turn, `pesquisas.exact_aliases[${index}].turn`)
    if (turn !== undefined && turn !== 1 && turn !== 2) {
      throw new ErroValidacaoPesquisasEleitorais([`pesquisas.exact_aliases[${index}].turn inválido`])
    }
    return {
      rawLabel: text(raw.raw_label, `pesquisas.exact_aliases[${index}].raw_label`),
      candidateSlug: text(raw.candidate_slug, `pesquisas.exact_aliases[${index}].candidate_slug`),
      year: raw.year === undefined ? undefined : finiteNumber(raw.year, `pesquisas.exact_aliases[${index}].year`),
      office: raw.office === undefined ? undefined : text(raw.office, `pesquisas.exact_aliases[${index}].office`),
      geography: raw.geography === undefined ? undefined : text(raw.geography, `pesquisas.exact_aliases[${index}].geography`),
      turn: turn as 1 | 2 | undefined,
      scenarioId: raw.scenario_id === undefined ? undefined : text(raw.scenario_id, `pesquisas.exact_aliases[${index}].scenario_id`),
    }
  })
  return {
    aliases,
    aliasesVersion: text(root.exact_aliases_version, "pesquisas.exact_aliases_version"),
    scope,
  }
}

interface FonteValidada {
  id: string
  status: StatusFonte
  name: string
  office: string | null
  geography: string | null
  rounds: number[] | null
}

function parseSources(raw: unknown): Map<string, FonteValidada> {
  const root = object(raw, "fontes")
  text(root.schema_version, "fontes.schema_version")
  const parsed = array(root.sources, "fontes.sources").map((entry, index): FonteValidada => {
    const source = object(entry, `fontes.sources[${index}]`)
    const id = text(source.id, `fontes.sources[${index}].id`)
    if (typeof source.status !== "string" || !STATUS_FONTES.has(source.status as StatusFonte)) {
      throw new ErroValidacaoPesquisasEleitorais([`fontes.sources[${index}].status inválido`])
    }
    const representative = source.representative_poll === null && source.status === "excluído"
      ? {}
      : object(source.representative_poll, `fontes.sources[${index}].representative_poll`)
    const resultUrl = url(representative.result_url, `fontes.sources[${index}].representative_poll.result_url`, source.status !== "aprovado")
    if (source.status === "aprovado" && resultUrl === null) {
      throw new ErroValidacaoPesquisasEleitorais([`fonte aprovada ${id} não possui URL de resultado`])
    }
    if (representative.registry_url !== null && representative.registry_url !== undefined) {
      url(representative.registry_url, `fontes.sources[${index}].representative_poll.registry_url`)
    }
    const roles = object(source.roles, `fontes.sources[${index}].roles`)
    const rounds = representative.rounds === null || representative.rounds === undefined
      ? null
      : array(representative.rounds, `fontes.sources[${index}].representative_poll.rounds`).map((round, roundIndex) => finiteNumber(round, `fontes.sources[${index}].representative_poll.rounds[${roundIndex}]`))
    return {
      id,
      status: source.status as StatusFonte,
      name: nullableText(roles.institute, `fontes.sources[${index}].roles.institute`) ?? id,
      office: representative.office === undefined ? null : nullableText(representative.office, `fontes.sources[${index}].representative_poll.office`),
      geography: representative.geography === undefined ? null : nullableText(representative.geography, `fontes.sources[${index}].representative_poll.geography`),
      rounds,
    }
  })
  assertUnique(parsed.map((source) => source.id), "fontes.sources.id")
  return new Map(parsed.map((source) => [source.id, source]))
}

function parseResult(
  value: unknown,
  path: string,
  aliases: AliasExato[],
  scope: EscopoAlias,
): ResultadoPesquisaEleitoral {
  const raw = object(value, path)
  if (typeof raw.match_status !== "string" || !STATUS_VINCULO.has(raw.match_status as StatusVinculo)) {
    throw new ErroValidacaoPesquisasEleitorais([`${path}.match_status inválido`])
  }
  const rawLabel = text(raw.raw_label, `${path}.raw_label`)
  const candidateSlug = nullableText(raw.candidate_slug, `${path}.candidate_slug`)
  const matchStatus = raw.match_status as StatusVinculo
  const resolved = resolverAliasExato(rawLabel, scope, aliases)
  if (matchStatus === "exact_alias") {
    if (resolved.status !== "exact_alias" || resolved.candidateSlug !== candidateSlug) {
      throw new ErroValidacaoPesquisasEleitorais([`${path} contradiz o alias exato escopado`])
    }
  } else if (candidateSlug !== null) {
    throw new ErroValidacaoPesquisasEleitorais([`${path}.candidate_slug exige exact_alias`])
  }
  const parsedState = state(raw.status, `${path}.status`)
  const valuePercent = percentage(raw.value_percent, `${path}.value_percent`)
  if (valuePercent === null && parsedState === "publicado") {
    throw new ErroValidacaoPesquisasEleitorais([`${path} não pode publicar percentual ausente`])
  }
  return { rawLabel, candidateSlug, matchStatus, valuePercent, status: parsedState }
}

function parsePoll(
  value: unknown,
  path: string,
  source: FonteValidada,
  electionScope: { year: number; office: string; geography: string },
  aliases: AliasExato[],
): PesquisaEleitoral {
  const raw = object(value, path)
  const sourceStatus = text(raw.source_status, `${path}.source_status`)
  if (sourceStatus !== source.status) {
    throw new ErroValidacaoPesquisasEleitorais([`${path}.source_status diverge do scorecard`])
  }
  if (raw.publishable_by_default !== (source.status === "aprovado")) {
    throw new ErroValidacaoPesquisasEleitorais([`${path}.publishable_by_default diverge do scorecard`])
  }
  const office = text(raw.office, `${path}.office`)
  const geography = object(raw.geography, `${path}.geography`)
  const geographyParsed = {
    type: text(geography.type, `${path}.geography.type`),
    label: text(geography.label, `${path}.geography.label`),
    code: text(geography.code, `${path}.geography.code`),
  }
  if (
    office !== electionScope.office ||
    geographyParsed.label !== electionScope.geography ||
    (source.office !== null && source.office.toLocaleLowerCase("pt-BR") !== office.toLocaleLowerCase("pt-BR")) ||
    (source.geography !== null && source.geography !== geographyParsed.label)
  ) {
    throw new ErroValidacaoPesquisasEleitorais([`${path} possui cenário incompatível com o piloto ou a fonte`])
  }

  const fieldworkRaw = object(raw.fieldwork, `${path}.fieldwork`)
  const fieldwork = {
    start: valueStatus(fieldworkRaw.start, `${path}.fieldwork.start`, (entry, entryPath) => isoDate(entry, entryPath, true)),
    end: valueStatus(fieldworkRaw.end, `${path}.fieldwork.end`, (entry, entryPath) => isoDate(entry, entryPath, true)),
  }
  const publicationDate = valueStatus(raw.publication_date, `${path}.publication_date`, (entry, entryPath) => isoDate(entry, entryPath, true))
  if (fieldwork.start.value && fieldwork.end.value && fieldwork.start.value > fieldwork.end.value) {
    throw new ErroValidacaoPesquisasEleitorais([`${path}.fieldwork tem período invertido`])
  }
  if (fieldwork.end.value && publicationDate.value && fieldwork.end.value > publicationDate.value) {
    throw new ErroValidacaoPesquisasEleitorais([`${path}.publication_date antecede o campo`])
  }

  const registrationRaw = object(raw.registration, `${path}.registration`)
  const registration = {
    code: valueStatus(registrationRaw.code, `${path}.registration.code`, nullableText),
    url: valueStatus(registrationRaw.url, `${path}.registration.url`, (entry, entryPath) => url(entry, entryPath, true)),
  }
  const provenanceRaw = object(raw.provenance, `${path}.provenance`)
  const captureRaw = object(provenanceRaw.capture, `${path}.provenance.capture`)
  const captureSha = text(captureRaw.sha256, `${path}.provenance.capture.sha256`)
  if (!/^[a-f0-9]{64}$/i.test(captureSha)) {
    throw new ErroValidacaoPesquisasEleitorais([`${path}.provenance.capture.sha256 inválido`])
  }
  const provenance: ProvenienciaPesquisaEleitoral = {
    resultUrl: url(provenanceRaw.result_url, `${path}.provenance.result_url`) as string,
    supportingUrls: array(provenanceRaw.supporting_urls, `${path}.provenance.supporting_urls`).map((entry, index) => url(entry, `${path}.provenance.supporting_urls[${index}]`) as string),
    registrationUrl: registration.url.value,
    sourceKind: text(provenanceRaw.source_kind, `${path}.provenance.source_kind`),
    routeClass: text(provenanceRaw.route_class, `${path}.provenance.route_class`),
    routeReason: text(provenanceRaw.route_reason, `${path}.provenance.route_reason`),
    consultedAt: isoDateTime(provenanceRaw.consulted_at, `${path}.provenance.consulted_at`),
    capture: {
      format: text(captureRaw.format, `${path}.provenance.capture.format`),
      sha256: captureSha,
      ...(captureRaw.supporting_pdf_sha256 === undefined
        ? {}
        : { supportingPdfSha256: text(captureRaw.supporting_pdf_sha256, `${path}.provenance.capture.supporting_pdf_sha256`) }),
      status: state(captureRaw.status, `${path}.provenance.capture.status`),
    },
  }

  const scenarios = array(raw.cenarios, `${path}.cenarios`).map((entry, scenarioIndex): CenarioPesquisaEleitoral => {
    const scenarioPath = `${path}.cenarios[${scenarioIndex}]`
    const scenario = object(entry, scenarioPath)
    const turnNumber = finiteNumber(scenario.turn, `${scenarioPath}.turn`)
    if (turnNumber !== 1 && turnNumber !== 2) {
      throw new ErroValidacaoPesquisasEleitorais([`${scenarioPath}.turn inválido`])
    }
    const turn = turnNumber as 1 | 2
    if (source.rounds !== null && !source.rounds.includes(turn)) {
      throw new ErroValidacaoPesquisasEleitorais([`${scenarioPath}.turn incompatível com a fonte`])
    }
    const id = text(scenario.id, `${scenarioPath}.id`)
    const scenarioGeography = text(scenario.geography, `${scenarioPath}.geography`)
    const comparabilityKey = text(scenario.comparability_key, `${scenarioPath}.comparability_key`)
    const expectedPrefix = `${electionScope.year}|${office}|${geographyParsed.code}|${turn}|`
    if (scenarioGeography !== geographyParsed.label || !comparabilityKey.startsWith(expectedPrefix)) {
      throw new ErroValidacaoPesquisasEleitorais([`${scenarioPath} é incompatível com o escopo declarado`])
    }
    const question = valueStatus(scenario.question, `${scenarioPath}.question`, nullableText)
    const aliasScope: EscopoAlias = {
      year: electionScope.year,
      office,
      geography: geographyParsed.label,
      turn,
      scenarioId: id,
    }
    const parsedResults = array(scenario.resultados, `${scenarioPath}.resultados`).map((result, resultIndex) => parseResult(result, `${scenarioPath}.resultados[${resultIndex}]`, aliases, aliasScope))
    const byRawLabel = new Map<string, ResultadoPesquisaEleitoral>()
    for (const result of parsedResults) {
      const previous = byRawLabel.get(result.rawLabel)
      if (previous && JSON.stringify(previous) !== JSON.stringify(result)) {
        throw new ErroValidacaoPesquisasEleitorais([`${scenarioPath}.resultados contém chave duplicada conflitante: ${result.rawLabel}`])
      }
      byRawLabel.set(result.rawLabel, result)
    }
    const resultados = [...byRawLabel.values()]
    return {
      id,
      turn,
      geography: scenarioGeography,
      labelRaw: text(scenario.label_raw, `${scenarioPath}.label_raw`),
      question,
      comparabilityKey,
      resultados,
    }
  })
  assertUnique(scenarios.map((scenario) => scenario.id), `${path}.cenarios.id`)

  const sampleRaw = object(raw.sample, `${path}.sample`)
  return {
    id: text(raw.id, `${path}.id`),
    sourceId: source.id,
    sourceStatus: source.status,
    state: state(raw.state, `${path}.state`),
    electionYear: electionScope.year,
    instituto: valueStatus(raw.instituto, `${path}.instituto`, nullableText),
    contratante: valueStatus(raw.contratante, `${path}.contratante`, nullableText),
    fieldwork,
    publicationDate,
    sample: {
      size: valueStatus(sampleRaw.size, `${path}.sample.size`, (entry, entryPath) => entry === null ? null : finiteNumber(entry, entryPath)),
      population: valueStatus(sampleRaw.population, `${path}.sample.population`, nullableText),
    },
    marginErrorPp: valueStatus(raw.margin_error_pp, `${path}.margin_error_pp`, percentage),
    confidencePercent: valueStatus(raw.confidence_percent, `${path}.confidence_percent`, percentage),
    method: valueStatus(raw.method, `${path}.method`, nullableText),
    registration,
    geography: geographyParsed,
    office,
    provenance,
    cenarios: scenarios,
  }
}

export function parsePesquisasEleitoraisJson(
  pesquisasJson: string,
  fontesJson: string,
): CatalogoPesquisasEleitorais {
  const pesquisasRoot = object(parseJson(pesquisasJson, "pesquisas"), "pesquisas")
  const fontes = parseSources(parseJson(fontesJson, "fontes"))
  const schemaVersion = text(pesquisasRoot.schema_version, "pesquisas.schema_version")
  const { aliases, aliasesVersion, scope } = parseAliases(pesquisasRoot)
  const polls = array(pesquisasRoot.pesquisas, "pesquisas.pesquisas").map((entry, index) => {
    const raw = object(entry, `pesquisas.pesquisas[${index}]`)
    const sourceId = text(raw.source_id, `pesquisas.pesquisas[${index}].source_id`)
    const source = fontes.get(sourceId)
    if (!source) {
      throw new ErroValidacaoPesquisasEleitorais([`pesquisas.pesquisas[${index}].source_id não existe no scorecard`])
    }
    return { source, poll: parsePoll(entry, `pesquisas.pesquisas[${index}]`, source, scope, aliases) }
  })
  assertUnique(polls.map(({ poll }) => poll.id), "pesquisas.pesquisas.id")
  assertUnique(polls.flatMap(({ poll }) => poll.cenarios.map((scenario) => scenario.id)), "pesquisas.cenarios.id")

  return {
    schemaVersion,
    aliasesVersion,
    electionScope: scope,
    aliases,
    pesquisas: polls.filter(({ source }) => source.status === "aprovado").map(({ poll }) => poll),
  }
}

let catalogoCache: CatalogoPesquisasEleitorais | null = null

export function carregarPesquisasEleitorais(): CatalogoPesquisasEleitorais {
  if (catalogoCache) return catalogoCache
  const pesquisasPath = resolve(process.cwd(), "scripts/data/pesquisas-presidencia-2026.json")
  const fontesPath = resolve(process.cwd(), "scripts/data/pesquisas-eleitorais-fontes.json")
  try {
    const catalogo = parsePesquisasEleitoraisJson(
      readFileSync(pesquisasPath, "utf8"),
      readFileSync(fontesPath, "utf8"),
    )
    catalogoCache = catalogo
    return catalogo
  } catch (error) {
    if (error instanceof ErroValidacaoPesquisasEleitorais) throw error
    throw new ErroValidacaoPesquisasEleitorais([
      `falha fechada ao carregar JSONs versionados: ${error instanceof Error ? error.message : "erro desconhecido"}`,
    ])
  }
}

function sameScope(poll: PesquisaEleitoral, scenario: CenarioPesquisaEleitoral, scope: EscopoComparabilidade): boolean {
  return (
    poll.electionYear === scope.electionYear &&
    poll.office === scope.office &&
    poll.geography.code === scope.geographyCode &&
    scenario.turn === scope.turn &&
    scenario.comparabilityKey === scope.comparabilityKey
  )
}

export function selecionarPesquisasMaisRecentesComparaveis(
  catalogo: CatalogoPesquisasEleitorais,
  candidateSlug: string,
  scope: EscopoComparabilidade,
): PesquisaEleitoralDoCandidato[] {
  if (!candidateSlug) return []
  const bySource = new Map<string, PesquisaEleitoralDoCandidato>()
  for (const poll of catalogo.pesquisas) {
    for (const scenario of poll.cenarios) {
      if (!sameScope(poll, scenario, scope)) continue
      const result = scenario.resultados.find(
        (entry) => entry.matchStatus === "exact_alias" && entry.candidateSlug === candidateSlug,
      )
      if (!result) continue
      const { cenarios: _cenarios, ...pollWithoutScenarios } = poll
      void _cenarios
      const candidate: PesquisaEleitoralDoCandidato = {
        ...pollWithoutScenarios,
        cenario: {
          id: scenario.id,
          turn: scenario.turn,
          geography: scenario.geography,
          labelRaw: scenario.labelRaw,
          question: scenario.question,
          comparabilityKey: scenario.comparabilityKey,
        },
        resultado: result,
      }
      const previous = bySource.get(poll.sourceId)
      if (!previous || (poll.publicationDate.value ?? "") > (previous.publicationDate.value ?? "")) {
        bySource.set(poll.sourceId, candidate)
      }
    }
  }
  return [...bySource.values()].sort((left, right) =>
    (right.publicationDate.value ?? "").localeCompare(left.publicationDate.value ?? ""),
  )
}

export function listarPesquisasPresidenciaisPorSlug(
  candidateSlug: string,
  scope?: EscopoComparabilidade,
): PesquisaEleitoralDoCandidato[] {
  const catalogo = carregarPesquisasEleitorais()
  if (scope) {
    return selecionarPesquisasMaisRecentesComparaveis(catalogo, candidateSlug, scope)
  }

  const scopes = new Map<string, EscopoComparabilidade>()
  for (const poll of catalogo.pesquisas) {
    for (const scenario of poll.cenarios) {
      const candidateResult = scenario.resultados.some(
        (result) => result.matchStatus === "exact_alias" && result.candidateSlug === candidateSlug,
      )
      if (!candidateResult) continue
      const comparableScope = {
        electionYear: poll.electionYear,
        office: poll.office,
        geographyCode: poll.geography.code,
        turn: scenario.turn,
        comparabilityKey: scenario.comparabilityKey,
      }
      scopes.set(JSON.stringify(comparableScope), comparableScope)
    }
  }
  return [...scopes.values()].flatMap((comparableScope) =>
    selecionarPesquisasMaisRecentesComparaveis(catalogo, candidateSlug, comparableScope),
  )
}
