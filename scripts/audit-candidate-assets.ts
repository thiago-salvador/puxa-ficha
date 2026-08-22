import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { extname, join, relative, resolve } from "node:path"

export type AssetStatus = "referenced" | "ambiguous" | "unreferenced"

export interface ReferenceEvidence {
  file: string
  line: number
  excerpt: string
  kind: "literal" | "dynamic-generator" | "dynamic-input"
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
  dynamicReferences: ReferenceEvidence[]
}

interface SourceFile {
  path: string
  content: string
}

interface AuditOptions {
  root: string
  output?: string
  baseline?: string
  verifyRemovals?: boolean
}

interface DynamicContext {
  generatedJpgSlugs: Set<string>
  generatorEvidence: ReferenceEvidence[]
  inputEvidenceBySlug: Map<string, ReferenceEvidence[]>
}

const CANDIDATES_PREFIX = "public/candidates/"
const SELF_EXCLUDES = new Set([
  "scripts/audit-candidate-assets.ts",
  "tests/audit-candidate-assets.test.ts",
])

function byteSort(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function git(root: string, args: string[]): Buffer {
  return execFileSync("git", ["-C", root, ...args], { maxBuffer: 128 * 1024 * 1024 })
}

function trackedFiles(root: string): string[] {
  return git(root, ["ls-files", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((file) => !file.startsWith(CANDIDATES_PREFIX) && !SELF_EXCLUDES.has(file))
    .sort(byteSort)
}

function loadTextSources(root: string): SourceFile[] {
  const sources: SourceFile[] = []
  for (const file of trackedFiles(root)) {
    const absolute = resolve(root, file)
    if (!existsSync(absolute) || !statSync(absolute).isFile()) continue
    const bytes = readFileSync(absolute)
    if (bytes.includes(0)) continue
    sources.push({ path: file, content: bytes.toString("utf8") })
  }
  return sources
}

function assetFilesFromWorktree(root: string): string[] {
  const directory = resolve(root, CANDIDATES_PREFIX)
  const files: string[] = []
  const visit = (current: string) => {
    for (const name of readdirSync(current).sort(byteSort)) {
      const absolute = join(current, name)
      if (statSync(absolute).isDirectory()) visit(absolute)
      else if (statSync(absolute).isFile()) files.push(relative(directory, absolute))
    }
  }
  visit(directory)
  return files.sort(byteSort)
}

function assetFilesFromRef(root: string, ref: string): string[] {
  return git(root, ["ls-tree", "-r", "--name-only", "-z", ref, "--", CANDIDATES_PREFIX])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((file) => file.slice(CANDIDATES_PREFIX.length))
    .sort(byteSort)
}

function assetBytes(root: string, file: string, baseline?: string): { bytes: Buffer; present: boolean } {
  const current = resolve(root, CANDIDATES_PREFIX, file)
  if (existsSync(current)) return { bytes: readFileSync(current), present: true }
  if (!baseline) throw new Error(`asset ausente sem baseline: ${file}`)
  return {
    bytes: git(root, ["show", `${baseline}:${CANDIDATES_PREFIX}${file}`]),
    present: false,
  }
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

function sourceEvidence(source: SourceFile, needle: string, kind: ReferenceEvidence["kind"]): ReferenceEvidence[] {
  const found: ReferenceEvidence[] = []
  let offset = source.content.indexOf(needle)
  while (offset !== -1) {
    const location = lineFor(source.content, offset)
    found.push(evidence(source.path, location.line, location.excerpt, kind))
    offset = source.content.indexOf(needle, offset + needle.length)
  }
  return found
}

function dynamicContext(sources: SourceFile[]): DynamicContext {
  const generator = sources.find((source) => source.path === "scripts/ingest-fotos-oficiais.ts")
  const manifest = sources.find((source) => source.path === "data/fotos-oficiais-2026.json")
  const generatorNeedle = "/candidates/${slug}.jpg"
  const generatorEvidence = generator
    ? sourceEvidence(generator, generatorNeedle, "dynamic-generator")
    : []
  const generatedJpgSlugs = new Set<string>()
  const inputEvidenceBySlug = new Map<string, ReferenceEvidence[]>()

  if (generatorEvidence.length === 0 || !manifest) {
    return { generatedJpgSlugs, generatorEvidence, inputEvidenceBySlug }
  }

  const parsed = JSON.parse(manifest.content) as { ancoras?: Array<{ slug?: unknown }> }
  for (const anchor of parsed.ancoras ?? []) {
    if (typeof anchor.slug !== "string" || anchor.slug.length === 0) continue
    generatedJpgSlugs.add(anchor.slug)
    inputEvidenceBySlug.set(
      anchor.slug,
      sourceEvidence(manifest, `"slug": "${anchor.slug}"`, "dynamic-input"),
    )
  }
  return { generatedJpgSlugs, generatorEvidence, inputEvidenceBySlug }
}

export function classifyAsset(params: {
  file: string
  literalReferences: ReferenceEvidence[]
  dynamicContext: DynamicContext
}): { status: AssetStatus; dynamicReferences: ReferenceEvidence[] } {
  if (params.literalReferences.length > 0) return { status: "referenced", dynamicReferences: [] }
  const slug = params.file.slice(0, -extname(params.file).length)
  const isGeneratedJpg = extname(params.file).toLowerCase() === ".jpg"
    && params.dynamicContext.generatedJpgSlugs.has(slug)
  if (!isGeneratedJpg) return { status: "unreferenced", dynamicReferences: [] }
  return {
    status: "ambiguous",
    dynamicReferences: [
      ...params.dynamicContext.generatorEvidence,
      ...(params.dynamicContext.inputEvidenceBySlug.get(slug) ?? []),
    ],
  }
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
  const sources = loadTextSources(options.root)
  const dynamic = dynamicContext(sources)
  const files = options.baseline
    ? assetFilesFromRef(options.root, options.baseline)
    : assetFilesFromWorktree(options.root)
  const assets: CandidateAssetAudit[] = files.map((file) => {
    const source = assetBytes(options.root, file, options.baseline)
    const literals = literalReferences(file, sources)
    const classification = classifyAsset({ file, literalReferences: literals, dynamicContext: dynamic })
    return {
      file,
      path: `${CANDIDATES_PREFIX}${file}`,
      extension: extname(file).toLowerCase(),
      sha256: createHash("sha256").update(source.bytes).digest("hex"),
      size: source.bytes.length,
      present: source.present,
      status: classification.status,
      literalReferences: literals,
      dynamicReferences: classification.dynamicReferences,
    }
  })
  const counts = {
    total: assets.length,
    present: assets.filter((asset) => asset.present).length,
    removed: assets.filter((asset) => !asset.present).length,
    referenced: assets.filter((asset) => asset.status === "referenced").length,
    ambiguous: assets.filter((asset) => asset.status === "ambiguous").length,
    unreferenced: assets.filter((asset) => asset.status === "unreferenced").length,
  }
  return {
    schemaVersion: 1,
    baseline: options.baseline ?? null,
    scannedTextFiles: sources.length,
    coverage: coverage(sources),
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

function main() {
  const root = process.cwd()
  const output = argument("output")
  const baseline = argument("baseline")
  const verifyRemovals = process.argv.includes("--verify-removals")
  if (verifyRemovals && !baseline) throw new Error("--verify-removals exige --baseline")
  const inventory = buildInventory({ root, output, baseline, verifyRemovals })
  const serialized = `${JSON.stringify(inventory, null, 2)}\n`
  if (output) writeFileSync(resolve(root, output), serialized)
  else process.stdout.write(serialized)

  if (verifyRemovals) {
    const unsafe = inventory.assets.filter((asset) => !asset.present && asset.status !== "unreferenced")
    if (unsafe.length > 0) {
      for (const asset of unsafe) console.error(`PF21_UNSAFE_REMOVAL ${asset.file} ${asset.status}`)
      process.exitCode = 1
      return
    }
    console.log(`PF21_REMOVALS_SAFE removed=${inventory.counts.removed}`)
    return
  }
  console.log(
    `PF21_INVENTORY total=${inventory.counts.total} referenced=${inventory.counts.referenced} ambiguous=${inventory.counts.ambiguous} unreferenced=${inventory.counts.unreferenced}`,
  )
}

if (process.argv[1]?.endsWith("audit-candidate-assets.ts")) main()
