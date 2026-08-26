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
  const matrix = construirMatrizAgendada({ sourceId, uf })
  if (matrix.length === 0) throw new Error("matriz agendada vazia")
  const payload = { include: matrix }
  if (options.get("--out")) writeJson(resolve(options.get("--out")!), payload)
  appendGithubOutput("matrix", JSON.stringify(payload))
  appendGithubOutput("expected", matrix.length)
  console.log(JSON.stringify(payload))
}

function findDocuments(inputDir: string): DocumentoColetadoAgendado[] {
  if (!existsSync(inputDir)) return []
  const documents: DocumentoColetadoAgendado[] = []
  for (const entry of readdirSync(inputDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const proposalPath = resolve(inputDir, entry.name, "proposal.json")
    if (!existsSync(proposalPath)) continue
    const prefix = "pesquisas-monitoramento-part-"
    const key = basename(entry.name).startsWith(prefix) ? basename(entry.name).slice(prefix.length) : basename(entry.name)
    documents.push({
      key,
      proposal: JSON.parse(readFileSync(proposalPath, "utf8")) as DocumentoPropostaAgendada,
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
  const result = consolidarPropostasAgendadas({
    matrix: matrixPayload.include,
    documents: findDocuments(inputDir),
    catalogs: carregarCatalogosAgendados(),
  })
  mkdirSync(outputDir, { recursive: true })
  writeJson(resolve(outputDir, "proposal.json"), result.proposal)
  writeJson(resolve(outputDir, "diff.json"), result.diff)
  writeFileSync(resolve(outputDir, "summary.md"), result.summary)
  writeFileSync(resolve(outputDir, "pr-body.md"), `${result.prBody}\n`)
  appendGithubOutput("status", result.status)
  appendGithubOutput("change_count", result.diff.operations.length)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.summary)
  console.log(`PESQUISAS_CONSOLIDATION_STATUS=${result.status}`)
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
