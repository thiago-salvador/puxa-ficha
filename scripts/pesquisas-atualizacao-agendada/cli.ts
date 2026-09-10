import "server-only"

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
import { construirCoberturaDescoberta } from "../lib/pesquisas-monitoramento-descoberta"

import {
  aplicarOperacoesAgendadas,
  carregarCatalogosAgendados,
  consolidarPropostasAgendadas,
  construirMatrizAgendada,
  type DocumentoColetadoAgendado,
  type DocumentoPropostaAgendada,
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

function findDocuments(inputDir: string, matrix: ItemMatrizAgendada[]): DocumentoColetadoAgendado[] {
  if (!existsSync(inputDir)) return []
  const documents: DocumentoColetadoAgendado[] = []
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
      ...discoveryReceipt(inputDir),
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
      ...discoveryReceipt(resolve(inputDir, entry.name)),
    })
  }
  return documents.sort((left, right) => left.key.localeCompare(right.key))
}

function consolidateCommand(options: Map<string, string>): void {
  const inputDir = resolve(required(options, "--input"))
  const outputDir = resolve(required(options, "--out"))
  const matrixPayload = JSON.parse(readFileSync(resolve(required(options, "--matrix")), "utf8")) as {
    include: ItemMatrizAgendada[]
  }
  const discoveryPath = options.get("--discovery")
  const discoveryAlerts: string[] = []
  let coverage = construirCoberturaDescoberta({ observations: [], targets: [] })
  try {
    if (!discoveryPath) throw new Error("manifesto de descoberta ausente")
    const discovery = JSON.parse(readFileSync(resolve(discoveryPath), "utf8"))
    if (!Array.isArray(discovery.coverage) || discovery.coverage.length !== GEOGRAFIAS_DESCOBERTA.length
      || new Set(discovery.coverage.map((row: { geography_code: string }) => row.geography_code)).size !== 28
      || GEOGRAFIAS_DESCOBERTA.some((geo) => !discovery.coverage.some((row: { geography_code: string }) => row.geography_code === geo))
      || discovery.coverage.some((row: Record<string, unknown>) => row.schema_version !== "pesquisas-cobertura-v1" || ![row.registration_ids_found, row.publications_located, row.errors, row.discovery_exceptions].every(Array.isArray))) throw new Error("cobertura deve conter BR e 27 UFs sem duplicação e com schema válido")
    coverage = discovery.coverage
    for (const row of discovery.coverage) {
      if (row.registry_query_status !== "observed" || row.registry_query_exhausted !== true) discoveryAlerts.push(`${row.geography_code}: consulta de registros incompleta`)
      for (const error of row.errors ?? []) discoveryAlerts.push(`${row.geography_code}: ${error}`)
      for (const exception of row.discovery_exceptions ?? []) discoveryAlerts.push(`${row.geography_code}: ${exception.reason}`)
    }
    discoveryAlerts.push(`Descoberta ${discovery.status}: inventário de resultados e atualidade não comprovados`)
  } catch (error) {
    discoveryAlerts.push(`Descoberta indisponível: ${error instanceof Error ? error.message : String(error)}`)
  }
  const result = consolidarPropostasAgendadas({
    matrix: matrixPayload.include,
    documents: findDocuments(inputDir, matrixPayload.include),
    catalogs: carregarCatalogosAgendados(),
    discovery: { status: "partial", alerts: [...new Set(discoveryAlerts)] },
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
  writeJson(resolve(outputDir, "status.json"), { status: result.status, operation_status: result.operation_status,
    coverage: result.coverage, promotion: result.promotion, global_alerts: result.global_alerts, poll_alerts: result.poll_alerts })
  writeJson(resolve(outputDir, "coverage.json"), coverage)
  writeFileSync(resolve(outputDir, "summary.md"), result.summary)
  writeFileSync(resolve(outputDir, "pr-body.md"), `${result.prBody}\n`)
  appendGithubOutput("status", result.status)
  appendGithubOutput("change_count", result.diff.operations.length)
  appendGithubOutput("operation_status", result.operation_status)
  appendGithubOutput("coverage_status", result.coverage.status)
  appendGithubOutput("promotion_authorized", String(result.promotion.authorized))
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.summary)
  console.log(`PESQUISAS_CONSOLIDATION_STATUS=${result.status}`)
  if (result.status === "blocked") process.exitCode = 1
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
