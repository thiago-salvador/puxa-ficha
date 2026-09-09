import "server-only"

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { listarAlvosMonitoramento } from "../lib/pesquisas-monitoramento"
import type { AlvoMonitoramento } from "../lib/pesquisas-monitoramento-adapters"

export const CATALOGOS_PERMITIDOS = [
  "scripts/data/pesquisas-presidencia-2026.json",
  "scripts/data/pesquisas-governadores-2026.json",
] as const

type UnknownObject = Record<string, unknown>

interface StatusValue<T> {
  value: T
  status?: string
}

interface ResultadoPesquisaAgendada extends UnknownObject {
  raw_label: string
  candidate_slug: string | null
  match_status: string
  value_percent: number
}

interface CenarioPesquisaAgendada extends UnknownObject {
  id: string
  turn: number
  geography: string
  label_raw: string
  question: StatusValue<string | null>
  comparability_key?: string
  resultados: ResultadoPesquisaAgendada[]
}

export interface ContratoPesquisaAgendada extends UnknownObject {
  id?: string
  source_id: string
  source_status: string
  publishable_by_default: boolean
  state: string
  instituto: StatusValue<string>
  contratante?: StatusValue<string | null>
  fieldwork: { start: StatusValue<string>; end: StatusValue<string> }
  publication_date: StatusValue<string>
  sample: { size: StatusValue<number>; population: StatusValue<string> }
  margin_error_pp: StatusValue<number>
  confidence_percent: StatusValue<number>
  method: StatusValue<string>
  registration: { code: StatusValue<string>; url: StatusValue<string> }
  geography: { type: string; label: string; code: string }
  office: string
  provenance: {
    result_url: string
    supporting_urls?: string[]
    consulted_at?: string
    capture: { format?: string; sha256: string; status?: string }
    [key: string]: unknown
  }
  cenarios: CenarioPesquisaAgendada[]
  identity_aliases?: Array<{
    raw_label: string
    candidate_slug: string
    year: number
    office: string
    geography: string
    turn: number
    scenario_id: string
    proof: { raw_label: string; candidate_slug: string; basis: string; source_url: string; source_sha256: string }
  }>
}

export interface ItemMatrizAgendada {
  key: string
  source_id: string
  uf: string
  poll_ids: string[]
  new_poll_ids?: string[]
}

export interface ItemPropostaAgendada {
  id: string
  decision: {
    classification: string
    eligible_for_human_review: boolean
    reason: string
  }
  evidence: UnknownObject | null
  normalized_contract: ContratoPesquisaAgendada | null
}

export interface DocumentoPropostaAgendada {
  schema_version: string
  dry_run: boolean
  human_review_required: boolean
  generated_at: string
  items: ItemPropostaAgendada[]
}

export interface OperacaoCatalogoAgendada {
  kind?: "update" | "insert"
  file: typeof CATALOGOS_PERMITIDOS[number]
  poll_id: string
  geography_code: string
  source_id: string
  registration_id: string
  proposed: ContratoPesquisaAgendada
  candidate_diff: Array<{
    scenario_id: string
    turn: number
    geography: string
    candidate_slug: string
    before: number | null
    after: number | null
  }>
}

export interface DocumentoDiffAgendado {
  schema_version: "1.0.0"
  applies_automatically: false
  allowed_files: readonly string[]
  operations: OperacaoCatalogoAgendada[]
}

export interface ResultadoConsolidacaoAgendada {
  status: "blocked" | "no_changes" | "ready"
  alerts: string[]
  proposal: DocumentoPropostaAgendada
  diff: DocumentoDiffAgendado
  summary: string
  prBody: string
}

export interface CatalogosAgendados {
  presidente: UnknownObject & { pesquisas: ContratoPesquisaAgendada[] }
  governadores: UnknownObject & {
    datasets: Array<UnknownObject & { pesquisas: ContratoPesquisaAgendada[] }>
  }
}

export interface DocumentoColetadoAgendado {
  key: string
  proposal: DocumentoPropostaAgendada
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as UnknownObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function resultComparable(result: ResultadoPesquisaAgendada): UnknownObject {
  return {
    raw_label: result.raw_label,
    candidate_slug: result.candidate_slug,
    match_status: result.match_status,
    value_percent: result.value_percent,
  }
}

function contractComparable(contract: ContratoPesquisaAgendada): UnknownObject {
  return {
    source_id: contract.source_id,
    source_status: contract.source_status,
    institute: contract.instituto?.value,
    fieldwork_start: contract.fieldwork?.start?.value,
    fieldwork_end: contract.fieldwork?.end?.value,
    publication_date: contract.publication_date?.value,
    sample_size: contract.sample?.size?.value,
    sample_population: contract.sample?.population?.value,
    margin_error_pp: contract.margin_error_pp?.value,
    confidence_percent: contract.confidence_percent?.value,
    method: contract.method?.value,
    registration_id: contract.registration?.code?.value,
    registration_url: contract.registration?.url?.value,
    geography: contract.geography,
    office: contract.office,
    result_url: contract.provenance?.result_url,
    cenarios: contract.cenarios.map((scenario) => ({
      id: scenario.id,
      turn: scenario.turn,
      geography: scenario.geography,
      label_raw: scenario.label_raw,
      question: scenario.question?.value,
      resultados: (scenario.resultados ?? []).map(resultComparable),
    })),
  }
}

function requiredMetadata(contract: ContratoPesquisaAgendada | null): string[] {
  if (!contract) return ["normalized_contract"]
  const missing: string[] = []
  const required: Array<[string, unknown]> = [
    ["source_id", contract.source_id],
    ["instituto", contract.instituto?.value],
    ["fieldwork.start", contract.fieldwork?.start?.value],
    ["fieldwork.end", contract.fieldwork?.end?.value],
    ["publication_date", contract.publication_date?.value],
    ["sample.population", contract.sample?.population?.value],
    ["registration.code", contract.registration?.code?.value],
    ["registration.url", contract.registration?.url?.value],
    ["geography.code", contract.geography?.code],
    ["office", contract.office],
    ["provenance.result_url", contract.provenance?.result_url],
    ["provenance.capture.sha256", contract.provenance?.capture?.sha256],
  ]
  for (const [path, value] of required) if (!isNonEmptyString(value)) missing.push(path)
  if (!Number.isFinite(contract.sample?.size?.value) || contract.sample.size.value <= 0) missing.push("sample.size")
  if (!Number.isFinite(contract.margin_error_pp?.value)) missing.push("margin_error_pp")
  if (!Array.isArray(contract.cenarios) || contract.cenarios.length === 0) missing.push("cenarios")
  for (const scenario of contract.cenarios ?? []) {
    if (!isNonEmptyString(scenario.id)) missing.push("cenario.id")
    if (!Array.isArray(scenario.resultados) || scenario.resultados.length === 0) missing.push("cenario.resultados")
    for (const result of scenario.resultados ?? []) {
      if (!isNonEmptyString(result.raw_label)) missing.push("resultado.raw_label")
      const resolvedCandidate = result.match_status === "exact_alias" && isNonEmptyString(result.candidate_slug)
      const resolvedNonCandidate = result.match_status === "not_candidate" && result.candidate_slug === null
      if (!resolvedCandidate && !resolvedNonCandidate) {
        missing.push(`resultado.identidade:${result.raw_label ?? "desconhecido"}`)
      }
      if (!Number.isFinite(result.value_percent)) missing.push(`resultado.valor:${result.raw_label ?? "desconhecido"}`)
    }
  }
  for (const alias of contract.identity_aliases ?? []) {
    const scenario = contract.cenarios.find((entry) => entry.id === alias.scenario_id)
    if (!scenario || alias.year !== 2026 || alias.office !== contract.office || alias.geography !== contract.geography.label || alias.turn !== scenario.turn
      || !scenario.resultados.some((row) => row.raw_label === alias.raw_label && row.candidate_slug === alias.candidate_slug && row.match_status === "exact_alias")
      || alias.proof?.raw_label !== alias.raw_label || alias.proof.candidate_slug !== alias.candidate_slug
      || !["curated_name_party_office_uf", "curated_ballot_name_office_uf", "same_publication_full_name"].includes(alias.proof.basis)
      || !/^https:\/\//.test(alias.proof.source_url) || !/^[a-f0-9]{64}$/.test(alias.proof.source_sha256)) missing.push("identity_aliases.proof_or_scope")
    if (alias.proof?.basis === "same_publication_full_name" && alias.proof.source_url !== contract.provenance.result_url) missing.push("identity_aliases.publication_mismatch")
    if (["curated_name_party_office_uf", "curated_ballot_name_office_uf"].includes(alias.proof?.basis) && alias.proof.source_url !== `https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_${contract.geography.code}.zip`) missing.push("identity_aliases.geography_mismatch")
  }
  return [...new Set(missing)]
}

function pollIdFromItem(item: ItemPropostaAgendada): string {
  return item.id.endsWith("-live") ? item.id.slice(0, -5) : item.id
}

interface PesquisaLocalizadaAgendada {
  file: typeof CATALOGOS_PERMITIDOS[number]
  poll: ContratoPesquisaAgendada
  datasetIndex: number | null
}

function findPollMatches(catalogs: CatalogosAgendados, pollId: string): PesquisaLocalizadaAgendada[] {
  const matches: PesquisaLocalizadaAgendada[] = []
  for (const poll of catalogs.presidente.pesquisas) {
    if (poll.id === pollId) matches.push({ file: CATALOGOS_PERMITIDOS[0], poll, datasetIndex: null })
  }
  for (const [datasetIndex, dataset] of (catalogs.governadores.datasets ?? []).entries()) {
    for (const poll of dataset.pesquisas) {
      if (poll.id === pollId) matches.push({ file: CATALOGOS_PERMITIDOS[1], poll, datasetIndex })
    }
  }
  return matches
}

function findPoll(catalogs: CatalogosAgendados, pollId: string): PesquisaLocalizadaAgendada | null {
  const matches = findPollMatches(catalogs, pollId)
  return matches.length === 1 ? matches[0] : null
}

function prepararPesquisaNova(catalogs: CatalogosAgendados, proposed: ContratoPesquisaAgendada, pollId: string): ContratoPesquisaAgendada {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pollId)) throw new Error("identificador da pesquisa nova inválido")
  const all = [...catalogs.presidente.pesquisas, ...catalogs.governadores.datasets.flatMap((dataset) => dataset.pesquisas)]
  if (all.some((poll) => poll.registration.code.value === proposed.registration.code.value && poll.source_id === proposed.source_id && poll.office === proposed.office && poll.geography.code === proposed.geography.code)) throw new Error("registro já cadastrado com outro identificador")
  const sourcePeer = all.find((poll) => poll.source_id === proposed.source_id && poll.office === proposed.office && poll.source_status === "aprovado")
  if (!sourcePeer || proposed.source_status !== "aprovado") throw new Error("pesquisa nova sem fonte aprovada no catálogo")
  const registry = proposed.provenance.registry_observation as UnknownObject | undefined
  if (!registry || typeof registry.url !== "string" || !registry.url.startsWith("https://pesqele-divulgacao.tse.jus.br/") || !/^[a-f0-9]{64}$/.test(String(registry.evidence_sha256))) throw new Error("pesquisa nova sem comprovação do registro público")
  if (!((proposed.office === "Presidente" && proposed.geography.code === "BR") || (proposed.office === "Governador" && /^[A-Z]{2}$/.test(proposed.geography.code) && proposed.geography.code !== "BR"))) throw new Error("cargo ou geografia de pesquisa nova inválido")
  return { ...proposed, id: pollId, publishable_by_default: sourcePeer.publishable_by_default, state: "indeterminado", contratante: { value: null, status: "indeterminado" }, provenance: { ...proposed.provenance, source_kind: sourcePeer.provenance.source_kind, route_class: "direta_automatizavel", route_reason: "Publicação capturada e conciliada com o registro público PesqEle; proposta sujeita a revisão humana." } }
}

interface CandidateScenarioValue {
  scenario_id: string
  turn: number
  geography: string
  candidate_slug: string
  value: number
}

function candidateValues(contract: ContratoPesquisaAgendada): Map<string, CandidateScenarioValue> {
  const values = new Map<string, CandidateScenarioValue>()
  for (const scenario of contract.cenarios ?? []) {
    for (const result of scenario.resultados ?? []) {
      if (isNonEmptyString(result.candidate_slug) && Number.isFinite(result.value_percent)) {
        const key = `${scenario.id}\u0000${result.candidate_slug}`
        values.set(key, {
          scenario_id: scenario.id,
          turn: scenario.turn,
          geography: scenario.geography,
          candidate_slug: result.candidate_slug,
          value: result.value_percent,
        })
      }
    }
  }
  return values
}

function candidateDiff(before: ContratoPesquisaAgendada, after: ContratoPesquisaAgendada): OperacaoCatalogoAgendada["candidate_diff"] {
  const previous = candidateValues(before)
  const proposed = candidateValues(after)
  const keys = [...new Set([...previous.keys(), ...proposed.keys()])].sort()
  return keys
    .filter((key) => previous.get(key)?.value !== proposed.get(key)?.value)
    .map((key) => {
      const identity = proposed.get(key) ?? previous.get(key)!
      return {
        scenario_id: identity.scenario_id,
        turn: identity.turn,
        geography: identity.geography,
        candidate_slug: identity.candidate_slug,
        before: previous.get(key)?.value ?? null,
        after: proposed.get(key)?.value ?? null,
      }
    })
}

export function construirMatrizAgendada(filters: { sourceId?: string | null; uf?: string | null } = {}, discovered: AlvoMonitoramento[] = []): ItemMatrizAgendada[] {
  const grouped = new Map<string, ItemMatrizAgendada>()
  const normalizedUf = filters.uf?.toLocaleUpperCase("pt-BR")
  const normalizedFilters = {
    sourceId: filters.sourceId,
    uf: normalizedUf === "ALL" ? null : normalizedUf,
  }
  const known = listarAlvosMonitoramento(normalizedFilters)
  const knownIds = new Set(listarAlvosMonitoramento().map((target) => target.poll_id))
  const targets = new Map(known.map((target) => [target.poll_id, target]))
  for (const target of discovered) {
    if ((!filters.sourceId || filters.sourceId === "all" || target.source_id === filters.sourceId) && (!normalizedFilters.uf || target.geography_code === normalizedFilters.uf)) targets.set(target.poll_id, target)
  }
  for (const target of targets.values()) {
    const pair = `${target.source_id}|${target.geography_code}`
    const current = grouped.get(pair)
    if (current) {
      current.poll_ids.push(target.poll_id)
      if (!knownIds.has(target.poll_id)) current.new_poll_ids = [...(current.new_poll_ids ?? []), target.poll_id]
      continue
    }
    grouped.set(pair, {
      key: `${target.source_id}-${target.geography_code.toLocaleLowerCase("pt-BR")}`.replace(/[^a-z0-9-]/g, "-"),
      source_id: target.source_id,
      uf: target.geography_code,
      poll_ids: [target.poll_id],
      ...(!knownIds.has(target.poll_id) ? { new_poll_ids: [target.poll_id] } : {}),
    })
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, poll_ids: [...item.poll_ids].sort() }))
    .sort((left, right) => left.source_id.localeCompare(right.source_id) || left.uf.localeCompare(right.uf))
}

export function carregarCatalogosAgendados(baseDir = process.cwd()): CatalogosAgendados {
  return {
    presidente: JSON.parse(readFileSync(resolve(baseDir, CATALOGOS_PERMITIDOS[0]), "utf8")),
    governadores: JSON.parse(readFileSync(resolve(baseDir, CATALOGOS_PERMITIDOS[1]), "utf8")),
  }
}

function buildSummary(input: {
  status: ResultadoConsolidacaoAgendada["status"]
  alerts: string[]
  expected: number
  received: number
  items: ItemPropostaAgendada[]
  operations: OperacaoCatalogoAgendada[]
}): string {
  const lines = [
    "# Atualização agendada de pesquisas eleitorais",
    "",
    `Status: ${input.status}`,
    `Artefatos esperados: ${input.expected}. Recebidos: ${input.received}.`,
    `Mudanças validadas: ${input.operations.length}.`,
    "",
    "## Alertas",
    "",
    ...(input.alerts.length > 0 ? input.alerts.map((alert) => `- ${alert}`) : ["- nenhum"]),
    "",
    "## Itens observados",
    "",
    ...input.items.map((item) => `- ${item.id}: ${item.decision.classification} (${item.decision.reason})`),
  ]
  if (input.operations.length > 0) {
    lines.push("", "## Diff por candidato", "")
    for (const operation of input.operations) {
      lines.push(`### ${operation.poll_id}`)
      if (operation.candidate_diff.length === 0) lines.push("- metadados alterados, sem mudança percentual por candidato")
      for (const entry of operation.candidate_diff) {
        lines.push(`- cenário ${entry.scenario_id}, turno ${entry.turn}, ${entry.geography}, ${entry.candidate_slug}: ${entry.before ?? "ausente"} -> ${entry.after ?? "ausente"}`)
      }
    }
  }
  return `${lines.join("\n")}\n`
}

function buildPrBody(operations: OperacaoCatalogoAgendada[], summary: string): string {
  const sources = [...new Map(operations.map((operation) => [
    `${operation.source_id}|${operation.proposed.provenance.result_url}`,
    { id: operation.source_id, url: operation.proposed.provenance.result_url },
  ])).values()].sort((left, right) => left.id.localeCompare(right.id) || left.url.localeCompare(right.url))
  const registrations = [...new Set(operations.map((operation) => operation.registration_id))].sort()
  return [
    "## Fontes",
    "",
    ...sources.map((source) => `- ${source.id}: ${source.url}`),
    "",
    "## Registros TSE",
    "",
    ...registrations.map((registration) => `- ${registration}`),
    "",
    summary.trim(),
    "",
    "## Revisão humana obrigatória",
    "",
    "- conferir cada URL pública e registro TSE;",
    "- revisar identidade e percentuais por candidato;",
    "- decidir os campos e estados que podem sair de `indeterminado`;",
    "- rodar `npm run verify:pesquisas` após qualquer ajuste;",
    "- não mergear enquanto houver dúvida, alerta ou metadado incompleto.",
    "",
    "Este PR é draft. A automação não faz merge nem publica em produção.",
  ].join("\n")
}

export function consolidarPropostasAgendadas(input: {
  matrix: ItemMatrizAgendada[]
  documents: DocumentoColetadoAgendado[]
  catalogs: CatalogosAgendados
  generatedAt?: string
}): ResultadoConsolidacaoAgendada {
  const alerts: string[] = []
  const expectedKeys = new Set(input.matrix.map((item) => item.key))
  const receivedKeys = new Set(input.documents.map((item) => item.key))
  for (const key of expectedKeys) if (!receivedKeys.has(key)) alerts.push(`artefato ausente: ${key}`)
  for (const key of receivedKeys) if (!expectedKeys.has(key)) alerts.push(`artefato inesperado: ${key}`)
  if (receivedKeys.size !== input.documents.length) alerts.push("artefato duplicado na consolidação")
  for (const document of input.documents) {
    if (document.proposal.dry_run !== true || document.proposal.human_review_required !== true) {
      alerts.push(`artefato inseguro: ${document.key}`)
    }
  }

  const items = input.documents.flatMap((document) => document.proposal.items)
  const expectedPollIds = new Set(input.matrix.flatMap((item) => item.poll_ids).map((id) => `${id}-live`))
  const receivedPollIds = new Set(items.map((item) => item.id))
  for (const id of expectedPollIds) if (!receivedPollIds.has(id)) alerts.push(`item ausente: ${id}`)
  for (const id of receivedPollIds) if (!expectedPollIds.has(id)) alerts.push(`item inesperado: ${id}`)
  if (receivedPollIds.size !== items.length) alerts.push("item duplicado na consolidação")

  const operations: OperacaoCatalogoAgendada[] = []
  for (const item of items) {
    if (!item.decision.eligible_for_human_review) {
      if (item.decision.classification !== "inalterado") {
        alerts.push(`${item.id}: ${item.decision.reason}`)
      }
      continue
    }
    const missing = requiredMetadata(item.normalized_contract)
    if (missing.length > 0) {
      alerts.push(`${item.id}: metadado ausente (${missing.join(", ")})`)
      continue
    }
    const pollId = pollIdFromItem(item)
    const baseline = findPoll(input.catalogs, pollId)
    if (!baseline || !item.normalized_contract) {
      const contract = item.normalized_contract
      const manifest = input.matrix.find((entry) => entry.new_poll_ids?.includes(pollId) && entry.source_id === contract?.source_id && entry.uf === contract?.geography.code)
      if (!manifest || !contract || findPollMatches(input.catalogs, pollId).length || item.evidence?.scenario_complete !== true || item.evidence?.publication_complete !== true) { alerts.push(`${item.id}: inventário base ausente`); continue }
      try {
        const proposed = prepararPesquisaNova(input.catalogs, contract, pollId)
        operations.push({ kind: "insert", file: contract.office === "Presidente" ? CATALOGOS_PERMITIDOS[0] : CATALOGOS_PERMITIDOS[1], poll_id: pollId, geography_code: contract.geography.code, source_id: contract.source_id, registration_id: contract.registration.code.value, proposed, candidate_diff: candidateDiff({ ...proposed, cenarios: [] }, proposed) })
      } catch (error) { alerts.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`) }
      continue
    }
    if (stable(contractComparable(baseline.poll)) === stable(contractComparable(item.normalized_contract))) continue
    operations.push({
      file: baseline.file,
      poll_id: pollId,
      geography_code: item.normalized_contract.geography.code,
      source_id: item.normalized_contract.source_id,
      registration_id: item.normalized_contract.registration.code.value,
      proposed: item.normalized_contract,
      candidate_diff: candidateDiff(baseline.poll, item.normalized_contract),
    })
  }

  const status: ResultadoConsolidacaoAgendada["status"] = alerts.length > 0
    ? "blocked"
    : operations.length > 0 ? "ready" : "no_changes"
  const safeOperations = status === "ready" ? operations : []
  const summary = buildSummary({
    status,
    alerts,
    expected: input.matrix.length,
    received: input.documents.length,
    items,
    operations: safeOperations,
  })
  return {
    status,
    alerts,
    proposal: {
      schema_version: "1.0.0",
      dry_run: true,
      human_review_required: true,
      generated_at: input.generatedAt ?? new Date().toISOString(),
      items,
    },
    diff: {
      schema_version: "1.0.0",
      applies_automatically: false,
      allowed_files: CATALOGOS_PERMITIDOS,
      operations: safeOperations,
    },
    summary,
    prBody: buildPrBody(safeOperations, summary),
  }
}

export function validarDocumentoDiffAgendado(value: unknown): DocumentoDiffAgendado {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("diff.json deve ser um objeto")
  const diff = value as Record<string, unknown>
  if (diff.schema_version !== "1.0.0") throw new Error("schema_version incompatível no diff.json")
  if (diff.applies_automatically !== false) throw new Error("diff.json não pode autorizar aplicação automática")
  if (!Array.isArray(diff.allowed_files) || stable(diff.allowed_files) !== stable(CATALOGOS_PERMITIDOS)) {
    throw new Error("allowed_files incompatível no diff.json")
  }
  if (!Array.isArray(diff.operations)) throw new Error("operations ausente no diff.json")
  for (const [index, entry] of diff.operations.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`operação ${index} inválida`)
    const operation = entry as Partial<OperacaoCatalogoAgendada>
    if (!operation.file || !CATALOGOS_PERMITIDOS.includes(operation.file)) throw new Error(`arquivo fora da allowlist na operação ${index}`)
    if (!isNonEmptyString(operation.poll_id)) throw new Error(`poll_id ausente na operação ${index}`)
    if (!isNonEmptyString(operation.geography_code)) throw new Error(`geography_code ausente na operação ${index}`)
    if (!isNonEmptyString(operation.source_id)) throw new Error(`source_id ausente na operação ${index}`)
    if (!isNonEmptyString(operation.registration_id)) throw new Error(`registration_id ausente na operação ${index}`)
    if (!operation.proposed || typeof operation.proposed !== "object") throw new Error(`proposed ausente na operação ${index}`)
    const missing = requiredMetadata(operation.proposed)
    if (missing.length > 0) throw new Error(`metadado ausente na operação ${index}: ${missing.join(", ")}`)
    if (operation.proposed.source_id !== operation.source_id) throw new Error(`source_id divergente na operação ${index}`)
    if (operation.proposed.registration.code.value !== operation.registration_id) throw new Error(`registration_id divergente na operação ${index}`)
    if (operation.proposed.geography.code !== operation.geography_code) throw new Error(`geography_code divergente na operação ${index}`)
    if (!Array.isArray(operation.candidate_diff)) throw new Error(`candidate_diff ausente na operação ${index}`)
  }
  return diff as unknown as DocumentoDiffAgendado
}

function mergeProposedPoll(current: ContratoPesquisaAgendada, proposed: ContratoPesquisaAgendada): ContratoPesquisaAgendada {
  return {
    ...current,
    source_id: proposed.source_id,
    source_status: proposed.source_status,
    // This flag describes the source scorecard, not approval of this capture.
    // The proposed data remains indeterminado until human review.
    publishable_by_default: current.publishable_by_default,
    state: "indeterminado",
    instituto: proposed.instituto,
    fieldwork: proposed.fieldwork,
    publication_date: proposed.publication_date,
    sample: proposed.sample,
    margin_error_pp: proposed.margin_error_pp,
    confidence_percent: proposed.confidence_percent,
    method: proposed.method,
    registration: proposed.registration,
    geography: proposed.geography,
    office: proposed.office,
    provenance: {
      ...current.provenance,
      ...proposed.provenance,
      supporting_urls: [...new Set([...(current.provenance?.supporting_urls ?? []), ...(proposed.provenance?.supporting_urls ?? [])])],
    },
    cenarios: proposed.cenarios.map((scenario) => {
      const previous = current.cenarios.find((candidate) => candidate.id === scenario.id)
      return {
        ...scenario,
        comparability_key: previous?.comparability_key ?? scenario.comparability_key,
      }
    }),
  }
}

function applyDocumentedAliases(dataset: UnknownObject, proposed: ContratoPesquisaAgendada): void {
  if (!proposed.identity_aliases?.length) return
  if (!Array.isArray(dataset.exact_aliases)) throw new Error("inventário de aliases ausente")
  const aliases = dataset.exact_aliases as UnknownObject[]
  let added = false
  for (const entry of proposed.identity_aliases) {
    if (aliases.some((alias) => alias.raw_label === entry.raw_label && alias.candidate_slug !== entry.candidate_slug)) throw new Error(`alias conflitante: ${entry.raw_label}`)
    const alias = { raw_label: entry.raw_label, candidate_slug: entry.candidate_slug, year: entry.year, office: entry.office, geography: entry.geography, turn: entry.turn, scenario_id: entry.scenario_id }
    if (!aliases.some((existing) => stable(existing) === stable(alias))) {
      aliases.push(alias)
      added = true
    }
  }
  if (added) dataset.exact_aliases_version = `monitor-2026-${createHash("sha256").update(stable(aliases)).digest("hex").slice(0, 16)}`
}

export function aplicarOperacoesAgendadas(
  operations: OperacaoCatalogoAgendada[],
  baseDir = process.cwd(),
): string[] {
  const catalogs = carregarCatalogosAgendados(baseDir)
  const touched = new Set<string>()
  const expectedReadback = new Map<string, ContratoPesquisaAgendada>()
  for (const operation of operations) {
    if (requiredMetadata(operation.proposed).length) throw new Error(`proposta incompleta: ${operation.poll_id}`)
    if (!CATALOGOS_PERMITIDOS.includes(operation.file)) throw new Error(`arquivo fora da allowlist: ${operation.file}`)
    const matches = findPollMatches(catalogs, operation.poll_id)
    if (operation.kind === "insert" && matches.length === 0) {
      const replacement = prepararPesquisaNova(catalogs, operation.proposed, operation.poll_id)
      const expectedFile = replacement.office === "Presidente" ? CATALOGOS_PERMITIDOS[0] : CATALOGOS_PERMITIDOS[1]
      if (operation.file !== expectedFile || replacement.geography.code !== operation.geography_code || replacement.source_id !== operation.source_id || replacement.registration.code.value !== operation.registration_id) throw new Error("escopo da inserção divergente")
      if (expectedFile === CATALOGOS_PERMITIDOS[0]) {
        applyDocumentedAliases(catalogs.presidente, replacement)
        catalogs.presidente.pesquisas.push(replacement)
      } else {
        let dataset = catalogs.governadores.datasets.find((entry) => (entry.publication_scope as UnknownObject)?.geography_code === replacement.geography.code)
        if (!dataset) {
          dataset = { schema_version: "1.0.0", election_scope: { year: 2026, office: "Governador", geography: replacement.geography.label }, alias_scope: { year: 2026, office: "Governador", geography: replacement.geography.label }, publication_scope: { election_year: 2026, office: "Governador", geography_code: replacement.geography.code, turn: 1, comparability_key: replacement.cenarios.find((scenario) => scenario.turn === 1)?.comparability_key }, exact_aliases_version: "monitor-2026", exact_aliases: [], pesquisas: [] }
          catalogs.governadores.datasets.push(dataset)
        }
        applyDocumentedAliases(dataset, replacement)
        dataset.pesquisas.push(replacement)
      }
      touched.add(operation.file)
      expectedReadback.set(`${operation.file}\u0000${operation.poll_id}`, replacement)
      continue
    }
    if (matches.length === 0) throw new Error(`pesquisa base ausente: ${operation.poll_id}`)
    if (matches.length > 1) throw new Error(`poll_id ambíguo em múltiplos datasets: ${operation.poll_id}`)
    const located = matches[0]
    if (located.file !== operation.file) throw new Error(`arquivo divergente para pesquisa: ${operation.poll_id}`)
    if (located.poll.geography.code !== operation.geography_code) throw new Error(`geografia divergente para pesquisa: ${operation.poll_id}`)
    const replacement = mergeProposedPoll(located.poll, operation.proposed)
    if (operation.file === CATALOGOS_PERMITIDOS[0]) {
      applyDocumentedAliases(catalogs.presidente, operation.proposed)
      const index = catalogs.presidente.pesquisas.findIndex((poll) => poll.id === operation.poll_id)
      catalogs.presidente.pesquisas[index] = replacement
    } else {
      if (located.datasetIndex === null) throw new Error(`dataset estadual ausente: ${operation.poll_id}`)
      const dataset = catalogs.governadores.datasets[located.datasetIndex]
      applyDocumentedAliases(dataset, operation.proposed)
      const index = dataset.pesquisas.findIndex((poll) => poll.id === operation.poll_id)
      dataset.pesquisas[index] = replacement
    }
    touched.add(operation.file)
    expectedReadback.set(`${operation.file}\u0000${operation.poll_id}`, replacement)
  }
  for (const file of touched) {
    const value = file === CATALOGOS_PERMITIDOS[0] ? catalogs.presidente : catalogs.governadores
    writeFileSync(resolve(baseDir, file), `${JSON.stringify(value, null, 2)}\n`)
  }
  const persisted = carregarCatalogosAgendados(baseDir)
  for (const [key, expected] of expectedReadback) {
    const [, pollId] = key.split("\u0000")
    const matches = findPollMatches(persisted, pollId)
    if (matches.length !== 1 || stable(contractComparable(matches[0].poll)) !== stable(contractComparable(expected))) {
      throw new Error(`readback falhou após gravar pesquisa: ${pollId}`)
    }
  }
  return [...touched].sort()
}

function branchAtualizacaoAgendada(date = new Date()): string {
  return `automation/pesquisas-refresh-${date.toISOString().slice(0, 10)}`
}

export interface DependenciasPromocaoAgendada {
  existingDraft(): Promise<boolean>
  apply(): Promise<void>
  hasChanges(): Promise<boolean>
  verify(): Promise<void>
  createBranch(branch: string): Promise<void>
  commit(): Promise<void>
  push(branch: string): Promise<void>
  createDraftPr(branch: string): Promise<void>
}

export async function executarPromocaoAgendada(input: {
  status: ResultadoConsolidacaoAgendada["status"]
  date?: Date
}, dependencies: DependenciasPromocaoAgendada): Promise<{
  status: "blocked" | "existing_draft" | "no_changes" | "draft_created"
  draftPrCount: number
}> {
  if (input.status !== "ready") return { status: input.status === "blocked" ? "blocked" : "no_changes", draftPrCount: 0 }
  if (await dependencies.existingDraft()) return { status: "existing_draft", draftPrCount: 0 }
  await dependencies.apply()
  if (!await dependencies.hasChanges()) return { status: "no_changes", draftPrCount: 0 }
  await dependencies.verify()
  const branch = branchAtualizacaoAgendada(input.date)
  await dependencies.createBranch(branch)
  await dependencies.commit()
  await dependencies.push(branch)
  await dependencies.createDraftPr(branch)
  return { status: "draft_created", draftPrCount: 1 }
}
