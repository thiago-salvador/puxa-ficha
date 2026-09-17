import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { INCREMENTAL_SCHEMA_VERSION, scanIncremental, type IncrementalManifestDocument, type IncrementalState } from "./incremental"

type ObjectValue = Record<string, unknown>
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const object = (value: unknown): ObjectValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {}
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"))

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().filter(key => !["consulted_at", "observed_at"].includes(key)).map(key => `${JSON.stringify(key)}:${stable(object(value)[key])}`).join(",")}}`
  return JSON.stringify(value)
}

function polls(value: unknown): ObjectValue[] {
  if (Array.isArray(value)) return value.flatMap(polls)
  const row = object(value)
  if (row.id && row.provenance && Array.isArray(row.cenarios)) return [row]
  return Object.values(row).flatMap(polls)
}

function files(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(resolve(root, entry.name)) : [resolve(root, entry.name)])
}

export function buildPreflightManifest(root: string, evidenceDirectory: string) {
  const parserVersion = hash(readFileSync(resolve(root, "src/lib/pesquisas-eleitorais.ts")))
  const policyVersion = hash(["scripts/data/pesquisas-buscas-alternativas.json", "data/candidate-roster-active-20260905.json", "scripts/data/pesquisas-eleitorais-fontes.json", "scripts/data/pesquisas-governadores-fontes.json"].map(path => readFileSync(resolve(root, path), "utf8")).join("\n"))
  const byHash = new Map<string, string>()
  for (const path of files(evidenceDirectory).filter(path => /\.(txt|html|pdf|md)$/.test(path))) byHash.set(hash(readFileSync(path)), path)
  const documents: IncrementalManifestDocument[] = []
  const warnings: Array<{ id: string; reason: string }> = []
  for (const path of ["scripts/data/pesquisas-presidencia-2026.json", "scripts/data/pesquisas-governadores-2026.json"]) {
    for (const poll of polls(read(resolve(root, path)))) {
      const provenance = object(poll.provenance)
      const capture = object(provenance.capture)
      if (!capture.path && poll.source_status !== "condicional") continue
      const id = String(poll.id)
      const candidatePath = typeof capture.path === "string" ? resolve(root, capture.path) : byHash.get(String(capture.sha256))
      const actualHash = candidatePath && existsSync(candidatePath) ? hash(readFileSync(candidatePath)) : null
      const matches = actualHash !== null && actualHash === capture.sha256
      if (!matches) warnings.push({ id, reason: candidatePath ? "capture_hash_mismatch_or_missing" : "capture_not_located" })
      // A summary is never promoted to literal evidence because it has a hash.
      const literal = ["text", "html", "pdf"].includes(String(capture.format)) && matches
      if (!literal) warnings.push({ id, reason: "literal_capture_required" })
      const evidencePath = matches && candidatePath ? candidatePath : resolve(evidenceDirectory, "missing", id)
      documents.push({
        id,
        registry: String(object(object(poll.registration).code).value ?? id),
        office: String(poll.office),
        geography: String(object(poll.geography).code),
        source_url: String(provenance.result_url),
        evidence_path: evidencePath,
        evidence_kind: literal ? "literal" : "summary",
        parser_version: parserVersion,
        policy_version: policyVersion,
        extraction_sha256: hash(stable(poll.cenarios)),
        context_sha256: hash(stable(poll)),
      })
    }
  }
  return { schema_version: INCREMENTAL_SCHEMA_VERSION, documents, warnings }
}

function write(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`)
  renameSync(temporary, path)
}

export function runPreflight(root: string, evidenceDirectory: string, output: string) {
  const manifest = buildPreflightManifest(root, evidenceDirectory)
  const statePath = resolve(output, "state.json")
  const prior: IncrementalState = existsSync(statePath) ? read(statePath) as IncrementalState : { schema_version: INCREMENTAL_SCHEMA_VERSION, documents: {}, receipts: [] }
  if (prior.schema_version !== INCREMENTAL_SCHEMA_VERSION || !prior.documents || !Array.isArray(prior.receipts)) throw new Error("Estado incremental incompatível; preserve-o para diagnóstico")
  const result = scanIncremental(manifest, prior, resolve(output, "manifest.json"))
  write(resolve(output, "manifest.json"), manifest)
  write(statePath, result.state)
  write(resolve(output, "queue.json"), result.digest)
  return { ...result.digest.summary, warnings: manifest.warnings.length, manifest: resolve(output, "manifest.json"), queue: resolve(output, "queue.json") }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = new Map<string, string>()
    for (let i = 2; i < process.argv.length; i += 2) {
      if (!["--root", "--evidence", "--out"].includes(process.argv[i]) || !process.argv[i + 1] || process.argv[i + 1].startsWith("--")) throw new Error("Use --root, --evidence e --out com valores")
      options.set(process.argv[i], process.argv[i + 1])
    }
    if (!options.has("--evidence")) throw new Error("--evidence é obrigatório")
    const result = runPreflight(resolve(options.get("--root") ?? "."), resolve(options.get("--evidence")!), resolve(options.get("--out") ?? ".artifacts/pesquisas-economia"))
    console.log(JSON.stringify(result))
    if (result.failed > 0) process.exitCode = 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
