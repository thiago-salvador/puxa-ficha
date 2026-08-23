import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import {
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs"
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path"

export type AssetStatus = "referenced" | "indeterminate" | "unreferenced"

export interface ReferenceEvidence {
  file: string
  line: number
  excerpt: string
  kind: "literal" | "runtime"
}

export interface CandidateAssetAudit {
  file: string
  path: string
  extension: string
  sha256: string
  size: number
  present: boolean
  status: AssetStatus
  literalReferences: ReferenceEvidence[]
  runtimeReferences: ReferenceEvidence[]
}

interface SourceFile {
  path: string
  content: string
}

interface GitEntry {
  mode: string
  oid: string
  path: string
}

interface AuditOptions {
  root: string
  output?: string
  baseline?: string
  runtimeReferencesFile?: string
  verifyRemovals?: boolean
}

interface RuntimeReferenceContext {
  provided: boolean
  source: string | null
  references: Set<string>
}

interface RuntimeReferenceManifest {
  schemaVersion: 1
  references: string[]
}

const CANDIDATES_PREFIX = "public/candidates/"
const RUNTIME_MANIFEST = "data/candidate-runtime-asset-references.json"
const MAX_TRACKED_FILES = 20_000
const MAX_TEXT_FILE_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_TEXT_BYTES = 96 * 1024 * 1024
const MAX_RUNTIME_MANIFEST_BYTES = 1024 * 1024
const MAX_RUNTIME_REFERENCES = 5000
const MAX_REPO_PATH_BYTES = 4096
const SELF_EXCLUDES = new Set([
  "scripts/audit-candidate-assets.ts",
  "tests/audit-candidate-assets.test.ts",
  RUNTIME_MANIFEST,
])

function byteSort(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function git(root: string, args: string[]): Buffer {
  return execFileSync("git", ["-C", root, ...args], { maxBuffer: 128 * 1024 * 1024 })
}

function validateRepoPath(file: string): string {
  const segments = file.split("/")
  if (
    file.length === 0
    || Buffer.byteLength(file) > MAX_REPO_PATH_BYTES
    || file.includes("\0")
    || file.includes("\\")
    || file.includes("\n")
    || file.includes("\r")
    || file.includes("\t")
    || isAbsolute(file)
    || segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`path de repositorio invalido: ${JSON.stringify(file)}`)
  }
  return file
}

function isContained(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target)
  return pathFromRoot === ""
    || (!isAbsolute(pathFromRoot) && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`))
}

function repoPath(root: string, file: string): string {
  const rootReal = realpathSync(root)
  const absolute = resolve(rootReal, validateRepoPath(file))
  if (!isContained(rootReal, absolute)) throw new Error(`path fora do repositorio: ${file}`)
  return absolute
}

function readRegularFile(root: string, file: string, maxBytes: number): Buffer {
  const rootReal = realpathSync(root)
  const absolute = repoPath(rootReal, file)
  const metadata = lstatSync(absolute)
  if (metadata.isSymbolicLink()) throw new Error(`symlink rejeitado: ${file}`)
  if (!metadata.isFile()) throw new Error(`arquivo regular esperado: ${file}`)
  if (metadata.size > maxBytes) throw new Error(`arquivo excede limite de ${maxBytes} bytes: ${file}`)
  const real = realpathSync(absolute)
  if (!isContained(rootReal, real)) throw new Error(`realpath fora do repositorio: ${file}`)
  return readFileSync(real)
}

function parseIndexEntries(root: string): Map<string, GitEntry> {
  const records = git(root, ["ls-files", "--stage", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
  if (records.length > MAX_TRACKED_FILES) {
    throw new Error(`indice excede limite de ${MAX_TRACKED_FILES} arquivos`)
  }
  const entries = new Map<string, GitEntry>()
  for (const record of records) {
    const separator = record.indexOf("\t")
    if (separator === -1) throw new Error("entrada invalida no indice Git")
    const [mode, oid, stage] = record.slice(0, separator).split(" ")
    const path = validateRepoPath(record.slice(separator + 1))
    if (!mode || !oid || stage !== "0") throw new Error(`indice Git nao resolvido: ${path}`)
    entries.set(path, { mode, oid, path })
  }
  return entries
}

function parseTreeEntries(root: string, ref: string): Map<string, GitEntry> {
  const records = git(root, ["ls-tree", "-r", "-z", ref])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
  if (records.length > MAX_TRACKED_FILES) {
    throw new Error(`tree excede limite de ${MAX_TRACKED_FILES} arquivos`)
  }
  const entries = new Map<string, GitEntry>()
  for (const record of records) {
    const separator = record.indexOf("\t")
    if (separator === -1) throw new Error("entrada invalida no tree Git")
    const [mode, type, oid] = record.slice(0, separator).split(" ")
    const path = validateRepoPath(record.slice(separator + 1))
    if (type !== "blob" || !mode || !oid) continue
    entries.set(path, { mode, oid, path })
  }
  return entries
}

function assertRegularGitEntry(entry: GitEntry): void {
  if (entry.mode === "120000") throw new Error(`symlink rejeitado no Git: ${entry.path}`)
  if (entry.mode !== "100644" && entry.mode !== "100755") {
    throw new Error(`modo Git nao suportado ${entry.mode}: ${entry.path}`)
  }
}

function loadTextSources(
  root: string,
  index: Map<string, GitEntry>,
  runtimeReferencesFile?: string,
): SourceFile[] {
  const excludes = new Set(SELF_EXCLUDES)
  if (runtimeReferencesFile) excludes.add(validateRepoPath(runtimeReferencesFile))
  const sourcePaths = [...index.keys()]
    .filter((file) => !file.startsWith(CANDIDATES_PREFIX) && !excludes.has(file))
    .sort(byteSort)
  const sources: SourceFile[] = []
  let totalBytes = 0
  for (const file of sourcePaths) {
    const entry = index.get(file)
    if (!entry) throw new Error(`entrada ausente no indice: ${file}`)
    assertRegularGitEntry(entry)
    const bytes = readRegularFile(root, file, MAX_TEXT_FILE_BYTES)
    totalBytes += bytes.length
    if (totalBytes > MAX_TOTAL_TEXT_BYTES) {
      throw new Error(`fontes excedem limite total de ${MAX_TOTAL_TEXT_BYTES} bytes`)
    }
    if (bytes.includes(0)) continue
    sources.push({ path: file, content: bytes.toString("utf8") })
  }
  return sources
}

function candidateEntries(entries: Map<string, GitEntry>): Map<string, GitEntry> {
  const candidates = new Map<string, GitEntry>()
  for (const [path, entry] of entries) {
    if (!path.startsWith(CANDIDATES_PREFIX)) continue
    assertRegularGitEntry(entry)
    candidates.set(path, entry)
  }
  return candidates
}

function assertFullCommitSha(root: string, baseline: string): void {
  if (!/^[0-9a-f]{40}$/.test(baseline)) {
    throw new Error("--baseline exige SHA completo de 40 caracteres")
  }
  const resolved = git(root, ["rev-parse", "--verify", `${baseline}^{commit}`]).toString("utf8").trim()
  if (resolved !== baseline) throw new Error(`baseline nao resolve para o SHA informado: ${baseline}`)
}

function assetBytes(
  root: string,
  path: string,
  current: Map<string, GitEntry>,
  baseline?: string,
): { bytes: Buffer; present: boolean } {
  if (current.has(path)) return { bytes: git(root, ["show", `:${path}`]), present: true }
  if (!baseline) throw new Error(`asset ausente sem baseline: ${path}`)
  return { bytes: git(root, ["show", `${baseline}:${path}`]), present: false }
}

function evidence(file: string, line: number, excerpt: string, kind: ReferenceEvidence["kind"]): ReferenceEvidence {
  return { file, line, excerpt: excerpt.trim().slice(0, 240), kind }
}

function lineFor(content: string, offset: number): { line: number; excerpt: string } {
  const start = content.lastIndexOf("\n", offset - 1) + 1
  const endIndex = content.indexOf("\n", offset)
  const end = endIndex === -1 ? content.length : endIndex
  return {
    line: content.slice(0, offset).split("\n").length,
    excerpt: content.slice(start, end),
  }
}

function literalReferences(file: string, sources: SourceFile[]): ReferenceEvidence[] {
  const references: ReferenceEvidence[] = []
  for (const source of sources) {
    let offset = source.content.indexOf(file)
    while (offset !== -1) {
      const previous = offset === 0 ? "" : source.content[offset - 1]
      const next = source.content[offset + file.length] ?? ""
      const tokenCharacter = /[A-Za-z0-9._-]/
      if (!tokenCharacter.test(previous) && !tokenCharacter.test(next)) {
        const location = lineFor(source.content, offset)
        references.push(evidence(source.path, location.line, location.excerpt, "literal"))
      }
      offset = source.content.indexOf(file, offset + file.length)
    }
  }
  return references.sort((a, b) => byteSort(`${a.file}:${a.line}`, `${b.file}:${b.line}`))
}

function parseRuntimeManifestBytes(bytes: Buffer, source: string): RuntimeReferenceContext {
  if (bytes.length > MAX_RUNTIME_MANIFEST_BYTES) {
    throw new Error(`arquivo excede limite de ${MAX_RUNTIME_MANIFEST_BYTES} bytes: ${source}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString("utf8"))
  } catch {
    throw new Error(`fonte runtime nao e JSON valido: ${source}`)
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`formato runtime desconhecido: ${source}`)
  }
  const candidate = parsed as Partial<RuntimeReferenceManifest>
  const keys = Object.keys(parsed).sort(byteSort)
  if (
    candidate.schemaVersion !== 1
    || !Array.isArray(candidate.references)
    || keys.join(",") !== "references,schemaVersion"
    || candidate.references.length > MAX_RUNTIME_REFERENCES
  ) {
    throw new Error(`formato runtime desconhecido: ${source}`)
  }
  const references = new Set<string>()
  for (const value of candidate.references) {
    if (typeof value !== "string") throw new Error(`referencia runtime invalida: ${source}`)
    const path = validateRepoPath(value)
    if (!path.startsWith(CANDIDATES_PREFIX) || path.length === CANDIDATES_PREFIX.length) {
      throw new Error(`referencia runtime fora de ${CANDIDATES_PREFIX}: ${path}`)
    }
    if (references.has(path)) throw new Error(`referencia runtime duplicada: ${path}`)
    references.add(path)
  }
  return { provided: true, source, references }
}

function parseRuntimeManifest(
  root: string,
  index: Map<string, GitEntry>,
  file?: string,
): RuntimeReferenceContext {
  if (!file) return { provided: false, source: null, references: new Set() }
  const safeFile = validateRepoPath(file)
  const entry = index.get(safeFile)
  if (!entry) throw new Error(`fonte runtime nao rastreada no indice Git: ${safeFile}`)
  assertRegularGitEntry(entry)
  const bytes = readRegularFile(root, safeFile, MAX_RUNTIME_MANIFEST_BYTES)
  return parseRuntimeManifestBytes(bytes, safeFile)
}

function parseBaselineRuntimeManifest(
  root: string,
  baseline: string,
  tree: Map<string, GitEntry>,
  file: string,
): RuntimeReferenceContext | undefined {
  const entry = tree.get(file)
  if (!entry) return undefined
  assertRegularGitEntry(entry)
  const size = Number(git(root, ["cat-file", "-s", entry.oid]).toString("utf8").trim())
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_RUNTIME_MANIFEST_BYTES) {
    throw new Error(`arquivo excede limite de ${MAX_RUNTIME_MANIFEST_BYTES} bytes: ${baseline}:${file}`)
  }
  const bytes = git(root, ["cat-file", "blob", entry.oid])
  return parseRuntimeManifestBytes(bytes, `${baseline}:${file}`)
}

export function classifyAsset(params: {
  file: string
  literalReferences: ReferenceEvidence[]
  runtimeReferences?: ReadonlySet<string>
  runtimeSource?: string
  baselineRuntimeReferences?: ReadonlySet<string>
  baselineRuntimeSource?: string
}): { status: AssetStatus; runtimeReferences: ReferenceEvidence[] } {
  if (params.literalReferences.length > 0) return { status: "referenced", runtimeReferences: [] }
  const path = `${CANDIDATES_PREFIX}${params.file}`
  if (params.runtimeReferences?.has(path)) {
    return {
      status: "referenced",
      runtimeReferences: [
        evidence(params.runtimeSource ?? "<runtime-references>", 1, path, "runtime"),
      ],
    }
  }
  if (params.baselineRuntimeReferences?.has(path)) {
    return {
      status: "referenced",
      runtimeReferences: [
        evidence(params.baselineRuntimeSource ?? "<baseline-runtime-references>", 1, path, "runtime"),
      ],
    }
  }
  if (!params.runtimeReferences) return { status: "indeterminate", runtimeReferences: [] }
  return { status: "unreferenced", runtimeReferences: [] }
}

function coverage(sources: SourceFile[]): Record<string, number> {
  const counts: Record<string, number> = {
    code: 0,
    data: 0,
    seeds: 0,
    sql: 0,
    manifests: 0,
    snapshots: 0,
    otherText: 0,
  }
  const codeExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".py", ".sh", ".ts", ".tsx"])
  for (const source of sources) {
    const lower = source.path.toLowerCase()
    const extension = extname(lower)
    let matched = false
    if (codeExtensions.has(extension)) { counts.code += 1; matched = true }
    if (lower.startsWith("data/") || [".csv", ".json", ".jsonl"].includes(extension)) { counts.data += 1; matched = true }
    if (lower.includes("seed")) { counts.seeds += 1; matched = true }
    if (extension === ".sql") { counts.sql += 1; matched = true }
    if (lower.includes("manifest") || [".yaml", ".yml"].includes(extension)) { counts.manifests += 1; matched = true }
    if (lower.includes("snapshot")) { counts.snapshots += 1; matched = true }
    if (!matched) counts.otherText += 1
  }
  return counts
}

export function buildInventory(options: AuditOptions) {
  const root = realpathSync(options.root)
  if (options.baseline) assertFullCommitSha(root, options.baseline)
  if (options.verifyRemovals && options.runtimeReferencesFile !== RUNTIME_MANIFEST) {
    throw new Error(`--verify-removals exige manifesto runtime canonico: ${RUNTIME_MANIFEST}`)
  }
  const index = parseIndexEntries(root)
  const currentCandidates = candidateEntries(index)
  const baselineTree = options.baseline ? parseTreeEntries(root, options.baseline) : undefined
  const baselineCandidates = baselineTree ? candidateEntries(baselineTree) : currentCandidates
  const runtime = parseRuntimeManifest(root, index, options.runtimeReferencesFile)
  const baselineRuntime = options.baseline && baselineTree && runtime.source
    ? parseBaselineRuntimeManifest(root, options.baseline, baselineTree, runtime.source)
    : undefined
  const runtimeBootstrap = Boolean(options.baseline && runtime.provided && !baselineRuntime)
  const removedRuntimeReferences = baselineRuntime
    ? [...baselineRuntime.references]
        .filter((path) => !runtime.references.has(path))
        .sort(byteSort)
    : []
  const sources = loadTextSources(root, index, options.runtimeReferencesFile)
  const files = [...baselineCandidates.keys()].sort(byteSort)
  const assets: CandidateAssetAudit[] = files.map((path) => {
    const file = path.slice(CANDIDATES_PREFIX.length)
    const source = assetBytes(root, path, currentCandidates, options.baseline)
    const literals = literalReferences(file, sources)
    const classification = classifyAsset({
      file,
      literalReferences: literals,
      runtimeReferences: runtime.provided ? runtime.references : undefined,
      runtimeSource: runtime.source ?? undefined,
      baselineRuntimeReferences: baselineRuntime?.references,
      baselineRuntimeSource: baselineRuntime?.source ?? undefined,
    })
    return {
      file,
      path,
      extension: extname(file).toLowerCase(),
      sha256: createHash("sha256").update(source.bytes).digest("hex"),
      size: source.bytes.length,
      present: source.present,
      status: classification.status,
      literalReferences: literals,
      runtimeReferences: classification.runtimeReferences,
    }
  })
  const counts = {
    total: assets.length,
    currentCandidateAssets: currentCandidates.size,
    present: assets.filter((asset) => asset.present).length,
    removed: assets.filter((asset) => !asset.present).length,
    referenced: assets.filter((asset) => asset.status === "referenced").length,
    indeterminate: assets.filter((asset) => asset.status === "indeterminate").length,
    unreferenced: assets.filter((asset) => asset.status === "unreferenced").length,
  }
  return {
    schemaVersion: 2,
    baseline: options.baseline ?? null,
    runtimeReferences: {
      provided: runtime.provided,
      source: runtime.source,
      count: runtime.references.size,
      baseline: {
        provided: Boolean(baselineRuntime),
        source: baselineRuntime?.source ?? null,
        count: baselineRuntime?.references.size ?? 0,
        bootstrap: runtimeBootstrap,
        removedReferences: removedRuntimeReferences,
      },
    },
    scannedTextFiles: sources.length,
    coverage: coverage(sources),
    limits: {
      trackedFiles: MAX_TRACKED_FILES,
      textFileBytes: MAX_TEXT_FILE_BYTES,
      totalTextBytes: MAX_TOTAL_TEXT_BYTES,
      runtimeManifestBytes: MAX_RUNTIME_MANIFEST_BYTES,
      runtimeReferences: MAX_RUNTIME_REFERENCES,
    },
    counts,
    assets,
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`--${name} exige valor`)
  return value
}

function writeOutput(root: string, output: string, serialized: string): void {
  const rootReal = realpathSync(root)
  const safeOutput = validateRepoPath(output)
  const absolute = repoPath(rootReal, safeOutput)
  const parentReal = realpathSync(dirname(absolute))
  if (!isContained(rootReal, parentReal)) throw new Error(`output fora do repositorio: ${output}`)
  try {
    const metadata = lstatSync(absolute)
    if (metadata.isSymbolicLink()) throw new Error(`symlink rejeitado no output: ${output}`)
    if (!metadata.isFile()) throw new Error(`output nao e arquivo regular: ${output}`)
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
  }
  writeFileSync(absolute, serialized)
}

function main() {
  const root = process.cwd()
  const output = argument("output")
  const baseline = argument("baseline")
  const runtimeReferencesFile = argument("runtime-references")
  const verifyRemovals = process.argv.includes("--verify-removals")
  if (verifyRemovals && !baseline) throw new Error("--verify-removals exige --baseline")
  if (verifyRemovals && !runtimeReferencesFile) {
    throw new Error("--verify-removals exige --runtime-references")
  }
  const inventory = buildInventory({ root, output, baseline, runtimeReferencesFile, verifyRemovals })
  const serialized = `${JSON.stringify(inventory, null, 2)}\n`
  if (output) writeOutput(root, output, serialized)
  else process.stdout.write(serialized)

  if (verifyRemovals) {
    if (inventory.runtimeReferences.baseline.removedReferences.length > 0) {
      for (const path of inventory.runtimeReferences.baseline.removedReferences) {
        console.error(`PF21_RUNTIME_REFERENCE_REMOVAL_REQUIRES_INDEPENDENT_PROOF ${path}`)
      }
      process.exitCode = 1
      return
    }
    const unsafe = inventory.assets.filter((asset) => !asset.present && asset.status !== "unreferenced")
    if (unsafe.length > 0) {
      for (const asset of unsafe) console.error(`PF21_UNSAFE_REMOVAL ${asset.file} ${asset.status}`)
      process.exitCode = 1
      return
    }
    console.error(`PF21_REMOVALS_SAFE removed=${inventory.counts.removed}`)
    return
  }
  console.error(
    `PF21_INVENTORY total=${inventory.counts.total} referenced=${inventory.counts.referenced} indeterminate=${inventory.counts.indeterminate} unreferenced=${inventory.counts.unreferenced}`,
  )
}

if (process.argv[1]?.endsWith("audit-candidate-assets.ts")) main()
