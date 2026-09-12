import "server-only"

import { createHash } from "node:crypto"
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { basename, resolve } from "node:path"
import { GEOGRAFIAS_DESCOBERTA } from "../lib/pesquisas-monitoramento-pesqele"
import { construirCoberturaDescoberta, LISTAGENS_PESQUISAS } from "../lib/pesquisas-monitoramento-descoberta"
import { isObservedPollPublication } from "../lib/pesquisas-publication-observation"
import { obterAdaptadorMonitoramento } from "../lib/pesquisas-monitoramento-adapters"

import {
  aplicarOperacoesAgendadas,
  carregarCatalogosAgendados,
  consolidarPropostasAgendadas,
  construirMatrizAgendada,
  type DocumentoColetadoAgendado,
  type DocumentoPropostaAgendada,
  type ItemPropostaAgendada,
  type ItemMatrizAgendada,
  validarDocumentoDiffAgendado,
} from "./model"

function parseOptions(argv: string[]): Map<string, string> {
  const options = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const separator = argv[index].indexOf("=")
    const key = separator >= 0 ? argv[index].slice(0, separator) : argv[index]
    const inline = separator >= 0 ? argv[index].slice(separator + 1) : undefined
    if (!key.startsWith("--")) throw new Error(`argumento inesperado: ${argv[index]}`)
    const value = inline ?? argv[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`valor ausente para ${key}`)
    options.set(key, value)
    if (inline === undefined) index += 1
  }
  return options
}

function required(options: Map<string, string>, key: string): string {
  const value = options.get(key)
  if (!value) throw new Error(`opção obrigatória ausente: ${key}`)
  return value
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function appendGithubOutput(name: string, value: string | number): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
}

function matrixCommand(options: Map<string, string>): void {
  const sourceId = options.get("--source") ?? "all"
  const uf = options.get("--uf") ?? "all"
  const discoveredPath = options.get("--discovered-targets")
  const discovered = discoveredPath ? JSON.parse(readFileSync(resolve(discoveredPath), "utf8")).targets : []
  if (!Array.isArray(discovered)) throw new Error("alvos descobertos inválidos")
  const matrix = construirMatrizAgendada({ sourceId, uf }, discovered)
  if (matrix.length === 0) throw new Error("matriz agendada vazia")
  const payload = { include: matrix }
  if (options.get("--out")) writeJson(resolve(options.get("--out")!), payload)
  appendGithubOutput("matrix", JSON.stringify(payload))
  appendGithubOutput("expected", matrix.length)
  console.log(JSON.stringify(payload))
}

type DocumentoComRecibos = DocumentoColetadoAgendado & { source_html_paths?: Record<string, string> }

function findDocuments(inputDir: string, matrix: ItemMatrizAgendada[]): DocumentoComRecibos[] {
  if (!existsSync(inputDir)) return []
  const documents: DocumentoComRecibos[] = []
  const discoveryReceipt = (dir: string): Pick<DocumentoColetadoAgendado, "discovery"> => {
    const path = resolve(dir, "discovered-targets.json")
    return existsSync(path) ? { discovery: JSON.parse(readFileSync(path, "utf8")) } : {}
  }
  // download-artifact can flatten a single matching artifact into the input root.
  // Only a single expected source/UF can identify that document unambiguously.
  const flatProposalPath = resolve(inputDir, "proposal.json")
  if (existsSync(flatProposalPath)) {
    documents.push({
      key: matrix.length === 1 ? matrix[0].key : "unmapped-flat-artifact",
      proposal: JSON.parse(readFileSync(flatProposalPath, "utf8")) as DocumentoPropostaAgendada,
      ...discoveryReceipt(inputDir), ...sourceReceipts(inputDir),
    })
  }
  for (const entry of readdirSync(inputDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const proposalPath = resolve(inputDir, entry.name, "proposal.json")
    if (!existsSync(proposalPath)) continue
    const prefix = "pesquisas-monitoramento-part-"
    const key = basename(entry.name).startsWith(prefix) ? basename(entry.name).slice(prefix.length) : basename(entry.name)
    documents.push({
      key,
      proposal: JSON.parse(readFileSync(proposalPath, "utf8")) as DocumentoPropostaAgendada,
      ...discoveryReceipt(resolve(inputDir, entry.name)), ...sourceReceipts(resolve(inputDir, entry.name)),
    })
  }
  return documents.sort((left, right) => left.key.localeCompare(right.key))
}

function sourceReceipts(dir: string): Pick<DocumentoComRecibos, "source_html_paths"> {
  const htmlDir = resolve(dir, "source-html")
  const source_html_paths: Record<string, string> = {}
  if (existsSync(htmlDir)) for (const entry of readdirSync(htmlDir)) if (entry.endsWith(".html.txt")) source_html_paths[entry.slice(0, -9)] = resolve(htmlDir, entry)
  return { source_html_paths }
}

export function validarRecibosPublicacao(documents: DocumentoComRecibos[], matrix: ItemMatrizAgendada[]): import("./model").ExecutionAlert[] {
  const alerts: import("./model").ExecutionAlert[] = []
  for (const document of documents) for (const item of document.proposal.items) {
    if (/^(?:source_timeout|source_unavailable|tse_registry_unavailable|source_failure)$/.test(item.decision.reason)) continue
    const pollId = item.id.endsWith("-live") ? item.id.slice(0, -5) : item.id
    const path = document.source_html_paths?.[pollId]
    const evidence = (item.evidence ?? {}) as Record<string, unknown>
    const diagnostic = (item as ItemPropostaAgendada & { diagnostic?: Record<string, unknown> }).diagnostic ?? {}
    const sourceSha = typeof evidence.evidence_sha256 === "string" ? evidence.evidence_sha256 : typeof diagnostic.source_sha256 === "string" ? diagnostic.source_sha256 : undefined
    const observedAt = typeof evidence.observed_at === "string" ? evidence.observed_at : typeof diagnostic.source_observed_at === "string" ? diagnostic.source_observed_at : undefined
    const sourceUrl = typeof evidence.url === "string" ? evidence.url : typeof diagnostic.source_url === "string" ? diagnostic.source_url : undefined
    const sourceId = matrix.find((entry) => entry.key === document.key)?.source_id
    const fail = (message: string) => alerts.push({ code: "artifact_invalid", message: `${pollId}: ${message}` })
    if (!path || !existsSync(path)) { fail("recibo source-html ausente"); continue }
    const html = readFileSync(path, "utf8")
    const hash = createHash("sha256").update(html).digest("hex")
    if (!/^[a-f0-9]{64}$/.test(sourceSha ?? "") || sourceSha !== hash) { fail("hash do recibo divergente ou ausente"); continue }
    if (!isObservedPollPublication(html)) { fail("HTML não reconhecido como publicação"); continue }
    if (!observedAt || !Number.isFinite(Date.parse(observedAt))) { fail("timestamp de observação ausente ou inválido"); continue }
    if (!sourceUrl || !/^https:\/\//.test(sourceUrl)) { fail("URL de origem ausente ou inválida"); continue }
    if (!sourceId || (typeof evidence.source_id === "string" && evidence.source_id !== sourceId)) { fail("fonte ausente ou divergente da matriz"); continue }
    try { if (!obterAdaptadorMonitoramento(sourceId).allowed_origins.includes(new URL(sourceUrl).origin)) fail("origem fora do adaptador") } catch { fail("fonte sem adaptador aprovado") }
  }
  return alerts
}

function consolidateCommand(options: Map<string, string>): void {
  const inputDir = resolve(required(options, "--input"))
  const outputDir = resolve(required(options, "--out"))
  const matrixPayload = JSON.parse(readFileSync(resolve(required(options, "--matrix")), "utf8")) as {
    include: ItemMatrizAgendada[]
  }
  const discoveryPath = options.get("--discovery")
  const discoveryAlerts: string[] = []
  const executionAlerts: import("./model").ExecutionAlert[] = []
  let discoveryStatus: "partial" | "not_assessed" | "source_failure" = "partial"
  let coverage = construirCoberturaDescoberta({ observations: [], targets: [] })
  try {
    if (!discoveryPath) throw new Error("manifesto de descoberta ausente")
    const discovery = JSON.parse(readFileSync(resolve(discoveryPath), "utf8"))
    if (!Array.isArray(discovery.coverage) || discovery.coverage.length !== GEOGRAFIAS_DESCOBERTA.length
      || new Set(discovery.coverage.map((row: { geography_code: string }) => row.geography_code)).size !== 28
      || GEOGRAFIAS_DESCOBERTA.some((geo) => !discovery.coverage.some((row: { geography_code: string }) => row.geography_code === geo))
      || discovery.coverage.some((row: Record<string, unknown>) => row.schema_version !== "pesquisas-cobertura-v1" || ![row.registration_ids_found, row.publications_located, row.errors, row.discovery_exceptions].every(Array.isArray))) throw new Error("cobertura deve conter BR e 27 UFs sem duplicação e com schema válido")
    if (!["partial", "not_assessed", "source_failure"].includes(discovery.status)) throw new Error("status de descoberta inválido")
    discoveryStatus = discovery.status
    coverage = discovery.coverage
    const expectedListings = LISTAGENS_PESQUISAS.filter((listing) => discovery.source_filter === "all" || (listing.source_ids as readonly string[]).includes(discovery.source_filter))
    if (!expectedListings.length || !Array.isArray(discovery.observations)
      || expectedListings.some((listing) => discovery.observations.filter((row: Record<string, unknown>) => row.id === listing.id).length !== 1)) throw new Error("recibos das listagens ausentes ou duplicados")
    for (const observation of discovery.observations) {
      if (observation.status !== "observed" || observation.error || observation.pagination_status === "failed"
        || !/^[a-f0-9]{64}$/.test(observation.evidence_sha256 ?? "") || !Number.isFinite(Date.parse(observation.observed_at ?? ""))) {
        executionAlerts.push({ code: "discovery_source_failure", message: `${observation.id}: listagem não observada integralmente` })
      }
    }
    const inventory = discovery.inventory?.geographies
    if (!Array.isArray(inventory) || inventory.length !== GEOGRAFIAS_DESCOBERTA.length
      || GEOGRAFIAS_DESCOBERTA.some((geo) => inventory.filter((row: Record<string, unknown>) => row.geography_code === geo).length !== 1)) throw new Error("inventário de registros ausente ou inválido")
    for (const row of inventory) {
      if (row.status !== "observed" || row.query_exhausted !== true || !Array.isArray(row.errors) || row.errors.length
        || !Array.isArray(row.records) || !Array.isArray(row.pages) || !row.pages.length) {
        executionAlerts.push({ code: "discovery_source_failure", message: `${row.geography_code}: inventário de registros não observado integralmente` })
      }
    }
    if (discovery.status === "source_failure") executionAlerts.push({ code: "discovery_source_failure", message: "descoberta reportou falha operacional" })
    const entries = discovery.intake?.entries
    if (!Array.isArray(entries) || entries.some((entry: Record<string, unknown>) => entry.execution_status !== "complete" && entry.execution_status !== "failed")) throw new Error("intake sem estados operacionais válidos")
    if (entries.some((entry: Record<string, unknown>) => entry.execution_status === "failed")) executionAlerts.push({ code: "discovery_source_failure", message: "intake contém fonte/recibo operacionalmente falho" })
    for (const row of discovery.coverage) {
      if (row.registry_query_status !== "observed" || row.registry_query_exhausted !== true) {
        const message = `${row.geography_code}: consulta de registros incompleta`
        discoveryAlerts.push(message)
        executionAlerts.push({ code: "discovery_source_failure", message })
      }
      for (const error of row.errors ?? []) discoveryAlerts.push(`${row.geography_code}: ${error}`)
      for (const exception of row.discovery_exceptions ?? []) discoveryAlerts.push(`${row.geography_code}: ${exception.reason}`)
    }
    discoveryAlerts.push(`Descoberta ${discovery.status}: inventário de resultados e atualidade não comprovados`)
  } catch (error) {
    discoveryStatus = "source_failure"
    executionAlerts.push({ code: "artifact_invalid", message: "manifesto de descoberta ausente ou inválido" })
    discoveryAlerts.push(`Descoberta indisponível: ${error instanceof Error ? error.message : String(error)}`)
  }
  const documents = findDocuments(inputDir, matrixPayload.include)
  executionAlerts.push(...validarRecibosPublicacao(documents, matrixPayload.include))
  const expectedKeys = new Set(matrixPayload.include.map((entry) => entry.key))
  const receivedKeys = new Set(documents.map((document) => document.key))
  for (const key of expectedKeys) if (!receivedKeys.has(key)) executionAlerts.push({ code: "artifact_missing", message: `artefato ausente para ${key}` })
  const result = consolidarPropostasAgendadas({
    matrix: matrixPayload.include,
    documents,
    catalogs: carregarCatalogosAgendados(),
    discovery: { status: discoveryStatus, alerts: [...new Set(discoveryAlerts)] },
    executionAlerts,

  })
  // Only the current, atomically validated contracts can advance result status.
  coverage = coverage.map((row) => {
    const validated = result.global_alerts.length ? [] : result.proposal.items.flatMap((item) => {
      const evidence = item.evidence
      const registry = evidence?.registry_observation as { evidence_sha256?: string } | undefined
      const contract = item.normalized_contract
      if (!item.decision.eligible_for_human_review || !contract || contract.geography.code !== row.geography_code
        || result.poll_alerts.some((alert) => `${alert.poll_id}-live` === item.id)
        || typeof evidence?.evidence_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(evidence.evidence_sha256)
        || !registry?.evidence_sha256 || !/^[a-f0-9]{64}$/.test(registry.evidence_sha256)) return []
      return [{ geography_code: row.geography_code, registration_id: contract.registration.code.value,
        source_sha256: evidence.evidence_sha256, registry_sha256: registry.evidence_sha256, evidence_path: `proposal.json#${item.id}` }]
    })
    const ids = [...new Set([...(row.registration_ids_found ?? []), ...validated.map((item) => item.registration_id)])].sort()
    return { ...row, registration_ids_found: ids, validated_results: validated, coverage_complete: false, absence_of_poll_confirmed: false, freshness_status: "not_assessed" as const,
      records: ids.map((registration_id) => ({ registration_id,
        status: validated.some((item) => item.registration_id === registration_id) ? "result_validated" as const : (row.publications_located ?? []).some((item) => item.registration_id === registration_id) ? "publication_located" as const : "registration_found" as const,
        publication_urls: (row.publications_located ?? []).filter((item) => item.registration_id === registration_id).map((item) => item.url) })) }
  })
  mkdirSync(outputDir, { recursive: true })
  writeJson(resolve(outputDir, "proposal.json"), result.proposal)
  writeJson(resolve(outputDir, "diff.json"), result.diff)
  writeJson(resolve(outputDir, "status.json"), { execution_status: result.execution_status, execution_alerts: result.execution_alerts, status: result.status, operation_status: result.operation_status,
    coverage: result.coverage, promotion: result.promotion, global_alerts: result.global_alerts, poll_alerts: result.poll_alerts })
  writeJson(resolve(outputDir, "coverage.json"), coverage)
  writeFileSync(resolve(outputDir, "summary.md"), result.summary)
  writeFileSync(resolve(outputDir, "pr-body.md"), `${result.prBody}\n`)
  appendGithubOutput("status", result.status)
  appendGithubOutput("execution_status", result.execution_status)
  appendGithubOutput("execution_alert_count", result.execution_alerts.length)
  appendGithubOutput("change_count", result.diff.operations.length)
  appendGithubOutput("operation_status", result.operation_status)
  appendGithubOutput("coverage_status", result.coverage.status)
  appendGithubOutput("promotion_authorized", String(result.promotion.authorized))
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.summary)
  console.log(`PESQUISAS_CONSOLIDATION_STATUS=${result.status}`)
  if (result.execution_status === "failed") process.exitCode = 1
}

function applyCommand(options: Map<string, string>): void {
  const diff = validarDocumentoDiffAgendado(
    JSON.parse(readFileSync(resolve(required(options, "--diff")), "utf8")) as unknown,
  )
  const touched = aplicarOperacoesAgendadas(diff.operations)
  console.log(`PESQUISAS_APPLY_TOUCHED=${touched.join(",") || "none"}`)
}

function main(): void {
  const [command, ...argv] = process.argv.slice(2)
  const options = parseOptions(argv)
  if (command === "matrix") return matrixCommand(options)
  if (command === "consolidate") return consolidateCommand(options)
  if (command === "apply") return applyCommand(options)
  throw new Error(`comando desconhecido: ${command ?? "ausente"}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
