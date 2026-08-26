import "server-only"

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { listarAlvosMonitoramento } from "../lib/pesquisas-monitoramento"

export const CATALOGOS_PERMITIDOS = [
  "scripts/data/pesquisas-presidencia-2026.json",
  "scripts/data/pesquisas-governadores-2026.json",
] as const

type UnknownObject = Record<string, unknown>

interface StatusValue<T> {
  value: T
  status?: string
}

export interface ResultadoPesquisaAgendada extends UnknownObject {
  raw_label: string
  candidate_slug: string | null
  match_status: string
  value_percent: number
}

export interface CenarioPesquisaAgendada extends UnknownObject {
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
  contratante?: StatusValue<string>
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
}

export interface ItemMatrizAgendada {
  key: string
  source_id: string
  uf: string
  poll_ids: string[]
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
  file: typeof CATALOGOS_PERMITIDOS[number]
  poll_id: string
  source_id: string
  registration_id: string
  proposed: ContratoPesquisaAgendada
  candidate_diff: Array<{
    candidate_slug: string
    before: number | null
    after: number | null
  }>
}

export interface ResultadoConsolidacaoAgendada {
  status: "blocked" | "no_changes" | "ready"
  alerts: string[]
  proposal: DocumentoPropostaAgendada
  diff: {
    schema_version: "1.0.0"
    applies_automatically: false
    allowed_files: readonly string[]
    operations: OperacaoCatalogoAgendada[]
  }
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
  return [...new Set(missing)]
}

function pollIdFromItem(item: ItemPropostaAgendada): string {
  return item.id.endsWith("-live") ? item.id.slice(0, -5) : item.id
}

function findPoll(catalogs: CatalogosAgendados, pollId: string): {
  file: typeof CATALOGOS_PERMITIDOS[number]
  poll: ContratoPesquisaAgendada
} | null {
  const president = catalogs.presidente.pesquisas.find((poll) => poll.id === pollId)
  if (president) return { file: CATALOGOS_PERMITIDOS[0], poll: president }
  for (const dataset of catalogs.governadores.datasets ?? []) {
    const poll = dataset.pesquisas.find((candidate) => candidate.id === pollId)
    if (poll) return { file: CATALOGOS_PERMITIDOS[1], poll }
  }
  return null
}

function candidateValues(contract: ContratoPesquisaAgendada): Map<string, number> {
  const values = new Map<string, number>()
  for (const scenario of contract.cenarios ?? []) {
    for (const result of scenario.resultados ?? []) {
      if (isNonEmptyString(result.candidate_slug) && Number.isFinite(result.value_percent)) {
        values.set(result.candidate_slug, result.value_percent)
      }
    }
  }
  return values
}

function candidateDiff(before: ContratoPesquisaAgendada, after: ContratoPesquisaAgendada): OperacaoCatalogoAgendada["candidate_diff"] {
  const previous = candidateValues(before)
  const proposed = candidateValues(after)
  const slugs = [...new Set([...previous.keys(), ...proposed.keys()])].sort()
  return slugs
    .filter((slug) => previous.get(slug) !== proposed.get(slug))
    .map((slug) => ({
      candidate_slug: slug,
      before: previous.get(slug) ?? null,
      after: proposed.get(slug) ?? null,
    }))
}

export function construirMatrizAgendada(filters: { sourceId?: string | null; uf?: string | null } = {}): ItemMatrizAgendada[] {
  const grouped = new Map<string, ItemMatrizAgendada>()
  const normalizedUf = filters.uf?.toLocaleUpperCase("pt-BR")
  const normalizedFilters = {
    sourceId: filters.sourceId,
    uf: normalizedUf === "ALL" ? null : normalizedUf,
  }
  for (const target of listarAlvosMonitoramento(normalizedFilters)) {
    const pair = `${target.source_id}|${target.geography_code}`
    const current = grouped.get(pair)
    if (current) {
      current.poll_ids.push(target.poll_id)
      continue
    }
    grouped.set(pair, {
      key: `${target.source_id}-${target.geography_code.toLocaleLowerCase("pt-BR")}`.replace(/[^a-z0-9-]/g, "-"),
      source_id: target.source_id,
      uf: target.geography_code,
      poll_ids: [target.poll_id],
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
        lines.push(`- ${entry.candidate_slug}: ${entry.before ?? "ausente"} -> ${entry.after ?? "ausente"}`)
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
      alerts.push(`${item.id}: inventário base ausente`)
      continue
    }
    if (stable(contractComparable(baseline.poll)) === stable(contractComparable(item.normalized_contract))) continue
    operations.push({
      file: baseline.file,
      poll_id: pollId,
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

function mergeProposedPoll(current: ContratoPesquisaAgendada, proposed: ContratoPesquisaAgendada): ContratoPesquisaAgendada {
  return {
    ...current,
    source_id: proposed.source_id,
    source_status: proposed.source_status,
    publishable_by_default: false,
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
      supporting_urls: current.provenance?.supporting_urls ?? [],
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

export function aplicarOperacoesAgendadas(
  operations: OperacaoCatalogoAgendada[],
  baseDir = process.cwd(),
): string[] {
  const catalogs = carregarCatalogosAgendados(baseDir)
  const touched = new Set<string>()
  for (const operation of operations) {
    if (!CATALOGOS_PERMITIDOS.includes(operation.file)) throw new Error(`arquivo fora da allowlist: ${operation.file}`)
    const located = findPoll(catalogs, operation.poll_id)
    if (!located || located.file !== operation.file) throw new Error(`pesquisa base ausente: ${operation.poll_id}`)
    const replacement = mergeProposedPoll(located.poll, operation.proposed)
    if (operation.file === CATALOGOS_PERMITIDOS[0]) {
      const index = catalogs.presidente.pesquisas.findIndex((poll) => poll.id === operation.poll_id)
      catalogs.presidente.pesquisas[index] = replacement
    } else {
      for (const dataset of catalogs.governadores.datasets) {
        const index = dataset.pesquisas.findIndex((poll) => poll.id === operation.poll_id)
        if (index >= 0) dataset.pesquisas[index] = replacement
      }
    }
    touched.add(operation.file)
  }
  for (const file of touched) {
    const value = file === CATALOGOS_PERMITIDOS[0] ? catalogs.presidente : catalogs.governadores
    writeFileSync(resolve(baseDir, file), `${JSON.stringify(value, null, 2)}\n`)
  }
  return [...touched].sort()
}

export function branchAtualizacaoAgendada(date = new Date()): string {
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
