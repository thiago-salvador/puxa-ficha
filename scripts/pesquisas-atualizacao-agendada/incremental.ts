import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"

export const INCREMENTAL_SCHEMA_VERSION = "pesquisas-incremental-v1"
export const INCREMENTAL_STAGES = ["capture", "extract", "review"] as const
export type IncrementalStage = (typeof INCREMENTAL_STAGES)[number]
export type EvidenceKind = "literal" | "summary"
export type ReceiptStatus = "completed" | "approved" | "unresolved"

export interface IncrementalManifestDocument {
  id?: string
  registry?: string
  office?: string
  geography?: string
  source_url: string
  evidence_path: string
  evidence_kind: EvidenceKind
  parser_version: string
  policy_version: string
  /** Hash of a normalized/extracted payload, when one already exists. */
  extraction_sha256?: string
  /** Hash of catalog context used to judge this document, when available. */
  context_sha256?: string
}

export interface IncrementalManifest {
  schema_version?: string
  documents: IncrementalManifestDocument[]
}

export interface IncrementalReceipt {
  identity: string
  fingerprint: string
  stage: IncrementalStage
  status: ReceiptStatus
  content_sha256?: string | null
  judge_identity?: string
  extraction_sha256?: string | null
  context_sha256?: string | null
  parser_version?: string
  policy_version?: string
}

interface StateDocument {
  identity: string
  id: string | null
  registry: string | null
  office: string | null
  geography: string | null
  source_url: string
  evidence_path: string
  evidence_kind: EvidenceKind
  content_sha256: string | null
  parser_version: string
  policy_version: string
  extraction_sha256: string | null
  context_sha256: string | null
  fingerprint: string
  pending_stages: IncrementalStage[]
  error?: string
}

export interface IncrementalState {
  schema_version: typeof INCREMENTAL_SCHEMA_VERSION
  documents: Record<string, StateDocument>
  receipts: IncrementalReceipt[]
}

export interface IncrementalQueueItem {
  identity: string
  id: string | null
  registry: string | null
  office: string | null
  geography: string | null
  source_url: string
  evidence_path: string
  evidence_kind: EvidenceKind
  fingerprint: string
  content_sha256: string | null
  parser_version: string
  policy_version: string
  extraction_sha256: string | null
  context_sha256: string | null
  pending_stages: IncrementalStage[]
  reason: "new" | "changed" | "unresolved" | "failed"
  error?: string
}

export interface IncrementalDigest {
  schema_version: typeof INCREMENTAL_SCHEMA_VERSION
  action: "scan"
  summary: {
    documents: number
    queued: number
    unchanged: number
    failed: number
    pending_stages: number
  }
  queue: IncrementalQueueItem[]
  failures: Array<{ identity: string; error: string }>
}

export interface IncrementalReceiptResult {
  schema_version: typeof INCREMENTAL_SCHEMA_VERSION
  action: "acknowledge"
  accepted: boolean
  identity: string
  stage: IncrementalStage
  status: ReceiptStatus
  content_sha256?: string | null
  judge_identity?: string
  fingerprint: string
  pending_stages: IncrementalStage[]
}

function fail(message: string): never {
  throw new Error(message)
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${field} ausente ou inválido`)
  return value.trim()
}

function evidenceKind(value: unknown): EvidenceKind {
  if (value === "literal" || value === "summary") return value
  return fail("evidence_kind deve ser literal ou summary")
}

function stage(value: unknown): IncrementalStage {
  if (typeof value === "string" && (INCREMENTAL_STAGES as readonly string[]).includes(value)) return value as IncrementalStage
  return fail(`stage inválido: ${String(value)}`)
}

function receiptStatus(value: unknown): ReceiptStatus {
  if (value === "completed" || value === "approved" || value === "unresolved") return value
  return fail("status deve ser completed, approved ou unresolved")
}

function documentIdentity(document: IncrementalManifestDocument): string {
  // The URL is part of the identity deliberately: two publications may share
  // a registry code while carrying different source material.
  return sha256(canonical({
    id: document.id?.trim() || null,
    registry: document.registry?.trim() || null,
    office: document.office?.trim() || null,
    geography: document.geography?.trim() || null,
    source_url: document.source_url,
  }))
}

function documentFingerprint(document: IncrementalManifestDocument, contentSha256: string | null): string {
  return sha256(canonical({
    identity: documentIdentity(document),
    content_sha256: contentSha256,
    evidence_kind: document.evidence_kind,
    parser_version: document.parser_version,
    policy_version: document.policy_version,
    extraction_sha256: document.extraction_sha256 ?? null,
    context_sha256: document.context_sha256 ?? null,
  }))
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown
}

function normalizeManifest(value: unknown): IncrementalManifest {
  const raw = Array.isArray(value) ? { documents: value } : value
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { documents?: unknown }).documents)) {
    return fail("manifesto deve conter documents[]")
  }
  const documents = (raw as { documents: unknown[] }).documents.map((entry, index) => {
    if (!entry || typeof entry !== "object") return fail(`documento ${index} inválido`)
    const input = entry as Record<string, unknown>
    const sourceUrl = text(input.source_url, `documento ${index}.source_url`)
    const evidencePath = text(input.evidence_path ?? input.local_evidence_path, `documento ${index}.evidence_path`)
    const id = input.id === undefined || input.id === null ? undefined : text(input.id, `documento ${index}.id`)
    const registry = input.registry === undefined || input.registry === null ? undefined : text(input.registry, `documento ${index}.registry`)
    const office = input.office === undefined || input.office === null ? undefined : text(input.office, `documento ${index}.office`)
    const geography = input.geography === undefined || input.geography === null ? undefined : text(input.geography, `documento ${index}.geography`)
    if (!id && !registry) fail(`documento ${index} precisa de id ou registry`)
    return {
      id,
      registry,
      office,
      geography,
      source_url: sourceUrl,
      evidence_path: evidencePath,
      evidence_kind: evidenceKind(input.evidence_kind),
      parser_version: text(input.parser_version, `documento ${index}.parser_version`),
      policy_version: text(input.policy_version, `documento ${index}.policy_version`),
      extraction_sha256: input.extraction_sha256 === undefined && input.extracted_hash === undefined
        ? undefined : text(input.extraction_sha256 ?? input.extracted_hash, `documento ${index}.extraction_sha256`),
      context_sha256: input.context_sha256 === undefined && input.context_hash === undefined
        ? undefined : text(input.context_sha256 ?? input.context_hash, `documento ${index}.context_sha256`),
    } satisfies IncrementalManifestDocument
  })
  const identities = new Set<string>()
  for (const document of documents) {
    const identity = documentIdentity(document)
    if (identities.has(identity)) fail(`documento duplicado: ${identity}`)
    identities.add(identity)
  }
  return { schema_version: INCREMENTAL_SCHEMA_VERSION, documents }
}

function emptyState(): IncrementalState {
  return { schema_version: INCREMENTAL_SCHEMA_VERSION, documents: {}, receipts: [] }
}

function normalizeState(value: unknown): IncrementalState {
  if (!value || typeof value !== "object") fail("estado incremental inválido")
  const input = value as Partial<IncrementalState>
  if (input.schema_version !== INCREMENTAL_SCHEMA_VERSION) fail("schema do estado incremental incompatível")
  const documents = input.documents && typeof input.documents === "object" ? input.documents : {}
  if (!input.documents || typeof input.documents !== "object" || Array.isArray(input.documents)) fail("documents do estado incremental inválidos")
  if (!Array.isArray(input.receipts)) fail("receipts do estado incremental inválidos")
  const receipts = input.receipts
  return {
    schema_version: INCREMENTAL_SCHEMA_VERSION,
    documents: documents as Record<string, StateDocument>,
    receipts: receipts.filter((item): item is IncrementalReceipt => {
      if (!item || typeof item !== "object") return false
      const receipt = item as Partial<IncrementalReceipt>
      return typeof receipt.identity === "string" && typeof receipt.fingerprint === "string"
        && INCREMENTAL_STAGES.includes(receipt.stage as IncrementalStage)
        && ["completed", "approved", "unresolved"].includes(receipt.status as string)
    }),
  }
}

function pathForManifest(manifestPath: string, evidencePath: string): string {
  return isAbsolute(evidencePath) ? evidencePath : resolve(dirname(manifestPath), evidencePath)
}

function receiptsFor(state: IncrementalState, identity: string, fingerprint: string): IncrementalReceipt[] {
  return state.receipts.filter((receipt) => receipt.identity === identity && receipt.fingerprint === fingerprint)
}

function pendingStages(receipts: IncrementalReceipt[]): IncrementalStage[] {
  const latest = new Map<IncrementalStage, IncrementalReceipt>()
  for (const receipt of receipts) latest.set(receipt.stage, receipt)
  let blocked = false
  return INCREMENTAL_STAGES.filter((candidate) => {
    const current = latest.get(candidate)
    const pending = blocked || !current || current.status === "unresolved"
    if (pending) blocked = true
    return pending
  })
}

export function fingerprintForDocument(document: IncrementalManifestDocument, contentSha256: string | null): string {
  return documentFingerprint(document, contentSha256)
}

export function identityForDocument(document: IncrementalManifestDocument): string {
  return documentIdentity(document)
}

export function scanIncremental(manifest: IncrementalManifest | IncrementalManifestDocument[], prior: IncrementalState, manifestPath = process.cwd()): { state: IncrementalState; digest: IncrementalDigest } {
  const normalized = normalizeManifest(manifest)
  const state: IncrementalState = {
    schema_version: INCREMENTAL_SCHEMA_VERSION,
    documents: { ...prior.documents },
    receipts: [...prior.receipts],
  }
  const queue: IncrementalQueueItem[] = []
  const failures: Array<{ identity: string; error: string }> = []
  let unchanged = 0

  for (const document of normalized.documents) {
    const identity = documentIdentity(document)
    const evidencePath = pathForManifest(manifestPath, document.evidence_path)
    let contentSha256: string | null = null
    let error: string | undefined
    try {
      if (!existsSync(evidencePath)) throw new Error("evidence_missing")
      contentSha256 = sha256(readFileSync(evidencePath))
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "evidence_read_failed"
    }
    const fingerprint = documentFingerprint(document, contentSha256)
    const receipts = receiptsFor(state, identity, fingerprint)
    const pending = pendingStages(receipts)
    const previous = state.documents[identity]
    const fingerprintChanged = !previous || previous.fingerprint !== fingerprint
    const hasFailedEvidence = Boolean(error)
    const reason: IncrementalQueueItem["reason"] = hasFailedEvidence ? "failed" : fingerprintChanged ? (previous ? "changed" : "new") : pending.length ? "unresolved" : "new"
    const record: StateDocument = {
      identity,
      id: document.id ?? null,
      registry: document.registry ?? null,
      office: document.office ?? null,
      geography: document.geography ?? null,
      source_url: document.source_url,
      evidence_kind: document.evidence_kind,
      evidence_path: document.evidence_path,
      content_sha256: contentSha256,
      parser_version: document.parser_version,
      policy_version: document.policy_version,
      extraction_sha256: document.extraction_sha256 ?? null,
      context_sha256: document.context_sha256 ?? null,
      fingerprint,
      pending_stages: hasFailedEvidence ? [...INCREMENTAL_STAGES] : pending,
      ...(error ? { error } : {}),
    }
    state.documents[identity] = record
    if (hasFailedEvidence || fingerprintChanged || pending.length) {
      const item: IncrementalQueueItem = {
        identity,
        id: record.id,
        registry: record.registry,
        office: record.office,
        geography: record.geography,
        source_url: record.source_url,
        evidence_path: record.evidence_path,
        evidence_kind: record.evidence_kind,
        fingerprint,
        content_sha256: contentSha256,
        parser_version: record.parser_version,
        policy_version: record.policy_version,
        extraction_sha256: record.extraction_sha256,
        context_sha256: record.context_sha256,
        pending_stages: record.pending_stages,
        reason,
        ...(error ? { error } : {}),
      }
      queue.push(item)
      if (error) failures.push({ identity, error })
    } else {
      unchanged += 1
    }
  }

  queue.sort((left, right) => left.identity.localeCompare(right.identity))
  return {
    state,
    digest: {
      schema_version: INCREMENTAL_SCHEMA_VERSION,
      action: "scan",
      summary: {
        documents: normalized.documents.length,
        queued: queue.length,
        unchanged,
        failed: failures.length,
        pending_stages: queue.reduce((total, item) => total + item.pending_stages.length, 0),
      },
      queue,
      failures,
    },
  }
}

function currentDocument(manifest: IncrementalManifest, identity: string, manifestPath: string): { document: IncrementalManifestDocument; fingerprint: string; contentSha256: string | null } {
  const document = manifest.documents.find((candidate) => documentIdentity(candidate) === identity)
  if (!document) fail("documento não encontrado no manifesto atual")
  const path = pathForManifest(manifestPath, document.evidence_path)
  if (!existsSync(path)) fail("evidence_missing")
  const contentSha256 = sha256(readFileSync(path))
  return { document, contentSha256, fingerprint: documentFingerprint(document, contentSha256) }
}

export function acknowledgeIncremental(manifest: IncrementalManifest | IncrementalManifestDocument[], prior: IncrementalState, receipt: IncrementalReceipt, expectedFingerprint: string, manifestPath = process.cwd()): { state: IncrementalState; result: IncrementalReceiptResult } {
  const normalized = normalizeManifest(manifest)
  const normalizedReceipt: IncrementalReceipt = {
    identity: text(receipt.identity, "receipt.identity"),
    fingerprint: text(receipt.fingerprint, "receipt.fingerprint"),
    stage: stage(receipt.stage),
    status: receiptStatus(receipt.status),
    ...(receipt.content_sha256 === undefined ? {} : { content_sha256: receipt.content_sha256 }),
    ...(receipt.judge_identity === undefined ? {} : { judge_identity: text(receipt.judge_identity, "receipt.judge_identity") }),
    ...(receipt.extraction_sha256 === undefined ? {} : { extraction_sha256: receipt.extraction_sha256 }),
    ...(receipt.context_sha256 === undefined ? {} : { context_sha256: receipt.context_sha256 }),
    ...(receipt.parser_version === undefined ? {} : { parser_version: text(receipt.parser_version, "receipt.parser_version") }),
    ...(receipt.policy_version === undefined ? {} : { policy_version: text(receipt.policy_version, "receipt.policy_version") }),
  }
  const current = currentDocument(normalized, normalizedReceipt.identity, manifestPath)
  if (expectedFingerprint !== current.fingerprint || normalizedReceipt.fingerprint !== current.fingerprint) {
    fail("stale receipt: fingerprint divergente do manifesto/evidência atual")
  }
  if ((normalizedReceipt.parser_version !== undefined && normalizedReceipt.parser_version !== current.document.parser_version)
    || (normalizedReceipt.policy_version !== undefined && normalizedReceipt.policy_version !== current.document.policy_version)) {
    fail("stale receipt: versão divergente")
  }
  if (normalizedReceipt.content_sha256 !== undefined && normalizedReceipt.content_sha256 !== current.contentSha256) {
    fail("stale receipt: hash do artefato divergente")
  }
  if (normalizedReceipt.status === "completed" || normalizedReceipt.status === "approved") {
    if (normalizedReceipt.content_sha256 !== current.contentSha256) fail("receipt exige hash explícito do artefato")
    if (!normalizedReceipt.judge_identity) fail("receipt exige judge_identity")
  }
  if (normalizedReceipt.stage === "review" && (normalizedReceipt.status === "completed" || normalizedReceipt.status === "approved")) {
    if (current.document.evidence_kind !== "literal") fail("review só pode concluir evidência literal")
    if (!current.document.extraction_sha256 || !current.document.context_sha256) fail("review exige hashes de extração e contexto")
    if (normalizedReceipt.content_sha256 !== current.contentSha256) fail("review exige hash explícito do artefato")
    if (!normalizedReceipt.judge_identity) fail("review exige judge_identity")
    if (normalizedReceipt.extraction_sha256 !== current.document.extraction_sha256
      || normalizedReceipt.context_sha256 !== current.document.context_sha256) fail("review exige hashes de extração/contexto correspondentes")
  } else if (normalizedReceipt.status === "approved" && !normalizedReceipt.judge_identity) {
    fail("receipt approved exige judge_identity")
  }
  const state: IncrementalState = {
    schema_version: INCREMENTAL_SCHEMA_VERSION,
    documents: { ...prior.documents },
    receipts: prior.receipts.filter((item) => {
      if (item.identity !== normalizedReceipt.identity || item.fingerprint !== normalizedReceipt.fingerprint) return true
      if (item.stage === normalizedReceipt.stage) return false
      // Reopening capture or extraction invalidates every later-stage receipt.
      // Keeping one would let an old review reappear after the source changed.
      if (normalizedReceipt.status === "unresolved") {
        const currentIndex = INCREMENTAL_STAGES.indexOf(normalizedReceipt.stage)
        return INCREMENTAL_STAGES.indexOf(item.stage) <= currentIndex
      }
      return true
    }),
  }
  state.receipts.push({
    ...normalizedReceipt,
    parser_version: current.document.parser_version,
    policy_version: current.document.policy_version,
  })
  const pending = pendingStages(receiptsFor(state, normalizedReceipt.identity, current.fingerprint))
  state.documents[normalizedReceipt.identity] = {
    identity: normalizedReceipt.identity,
    id: current.document.id ?? null,
    registry: current.document.registry ?? null,
    office: current.document.office ?? null,
    geography: current.document.geography ?? null,
    source_url: current.document.source_url,
    evidence_kind: current.document.evidence_kind,
    evidence_path: current.document.evidence_path,
    content_sha256: current.contentSha256,
    parser_version: current.document.parser_version,
    policy_version: current.document.policy_version,
    extraction_sha256: current.document.extraction_sha256 ?? null,
    context_sha256: current.document.context_sha256 ?? null,
    fingerprint: current.fingerprint,
    pending_stages: pending,
  }
  return {
    state,
    result: {
      schema_version: INCREMENTAL_SCHEMA_VERSION,
      action: "acknowledge",
      accepted: true,
      identity: normalizedReceipt.identity,
      stage: normalizedReceipt.stage,
      status: normalizedReceipt.status,
      fingerprint: current.fingerprint,
      pending_stages: pending,
    },
  }
}

function parseArgs(argv: string[]): Map<string, string> {
  const options = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith("--")) fail(`argumento inesperado: ${token}`)
    const separator = token.indexOf("=")
    const key = separator >= 0 ? token.slice(0, separator) : token
    const value = separator >= 0 ? token.slice(separator + 1) : argv[++index]
    if (!value || value.startsWith("--")) fail(`valor ausente para ${key}`)
    options.set(key, value)
  }
  return options
}

function required(options: Map<string, string>, key: string): string {
  const value = options.get(key)
  if (!value) fail(`opção obrigatória ausente: ${key}`)
  return value
}

function writeJson(path: string, value: unknown): void {
  const output = resolve(path)
  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, output)
}

function runCli(): void {
  const [command, ...rawArgs] = process.argv.slice(2)
  const options = parseArgs(rawArgs)
  if (command !== "scan" && command !== "acknowledge" && command !== "receipt") fail(`comando desconhecido: ${command ?? "ausente"}`)
  const manifestPath = resolve(required(options, "--manifest"))
  const statePath = resolve(required(options, "--state"))
  const manifest = normalizeManifest(readJson(manifestPath))
  const prior = existsSync(statePath) ? normalizeState(readJson(statePath)) : emptyState()
  if (command === "scan") {
    const scanned = scanIncremental(manifest, prior, manifestPath)
    writeJson(statePath, scanned.state)
    const out = options.get("--out")
    if (out) writeJson(out, scanned.digest)
    process.stdout.write(`${JSON.stringify(scanned.digest)}\n`)
    if (scanned.digest.summary.failed > 0) process.exitCode = 1
    return
  }
  let receipt: IncrementalReceipt
  if (options.has("--receipt")) receipt = readJson(resolve(options.get("--receipt")!)) as IncrementalReceipt
  else {
    receipt = {
      identity: required(options, "--identity"),
      fingerprint: required(options, "--fingerprint"),
      stage: required(options, "--stage") as IncrementalStage,
      status: (options.get("--status") ?? "completed") as ReceiptStatus,
      ...(options.has("--content-sha256") ? { content_sha256: options.get("--content-sha256")! } : {}),
      ...(options.has("--judge-identity") ? { judge_identity: options.get("--judge-identity")! } : {}),
      ...(options.has("--extraction-sha256") ? { extraction_sha256: options.get("--extraction-sha256")! } : {}),
      ...(options.has("--context-sha256") ? { context_sha256: options.get("--context-sha256")! } : {}),
      ...(options.has("--parser-version") ? { parser_version: options.get("--parser-version")! } : {}),
      ...(options.has("--policy-version") ? { policy_version: options.get("--policy-version")! } : {}),
    }
  }
  const expectedFingerprint = required(options, "--expected-fingerprint")
  const acknowledged = acknowledgeIncremental(manifest, prior, receipt, expectedFingerprint, manifestPath)
  writeJson(statePath, acknowledged.state)
  const out = options.get("--out")
  if (out) writeJson(out, acknowledged.result)
  process.stdout.write(`${JSON.stringify(acknowledged.result)}\n`)
}

if (process.argv[1] && /incremental\.(?:ts|js|mjs)$/.test(process.argv[1])) {
  try { runCli() } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
