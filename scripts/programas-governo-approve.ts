import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  assertProgramaGovernoRegistro,
  programaGovernoRevisaoHashes,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"
import {
  assertProgramaGovernoModelSeparation,
  assessProgramaGovernoJudgeVerdicts,
  buildProgramaGovernoJudgeClaims,
  programaGovernoDocumentos,
  programaGovernoExpectedPromptVersions,
  programaGovernoIdentityKey,
  type ProgramaGovernoPipelineRecord,
} from "./programas-governo-stage"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const LEGACY_RECORDS_DIR = path.join(ROOT, "src/data/programas-governo/presidencia-2026")
const APPROVAL_DECISION_VERSION = 1 as const

export type ProgramaGovernoApprovalFingerprint = {
  identityKey: string
  slug: string
  recordVersion: number
  sourceSha256: string
  extractedTextSha256: string
  documentCount: number
  documentSetSha256: string
  generatorPromptVersion: string
  generatorModel: string
  judgePromptVersion: string
  judgeModel: string
  contentSha256: string
}

export type ProgramaGovernoApprovalDecision = ProgramaGovernoApprovalFingerprint & {
  decisionVersion: typeof APPROVAL_DECISION_VERSION
  decision: "approve"
  reviewer: string
  reviewedAt: string
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

type ProgramaGovernoApprovalWriteAdapters = {
  mkdir(path: string): Promise<void>
  readFile(path: string): Promise<string>
  writeFile(path: string, value: string): Promise<void>
  rename(from: string, to: string): Promise<void>
}

const approvalWriteAdapters: ProgramaGovernoApprovalWriteAdapters = {
  mkdir: (directory) => mkdir(directory, { recursive: true }).then(() => undefined),
  readFile: (file) => readFile(file, "utf8"),
  writeFile: (file, value) => writeFile(file, value, "utf8"),
  rename,
}

function judgePromptVersion(record: ProgramaGovernoPipelineRecord): string {
  return record.julgamento?.promptVersion ?? "programa-governo-judge-v1-legacy"
}

export function programaGovernoApprovalFingerprint(
  record: ProgramaGovernoPipelineRecord,
): ProgramaGovernoApprovalFingerprint {
  assert(record.fonte.slug, "registro sem slug")
  assertProgramaGovernoRegistro(record)
  assert(record.resumo && record.geracao && record.julgamento, `${record.fonte.slug}: conteudo incompleto`)
  assertProgramaGovernoModelSeparation(record)
  const documents = programaGovernoDocumentos(record)
  const documentSet = documents.map((document) => ({
    documentoId: document.documentoId,
    fonte: document.fonte,
    extracao: document.extracao,
  }))
  const firstDocument = documents[0]
  const stableContent = {
    version: record.version,
    fonte: record.fonte,
    documentos: documentSet,
    resumo: record.resumo,
    geracao: record.geracao,
    julgamento: record.julgamento,
  }
  const reviewHashes = record.documentos
    ? programaGovernoRevisaoHashes(record as ProgramaGovernoRegistro)
    : {
        documentCount: documents.length,
        documentSetSha256: hashJson(documentSet),
        contentSha256: hashJson(stableContent),
      }
  return {
    identityKey: programaGovernoIdentityKey(record.fonte),
    slug: record.fonte.slug,
    recordVersion: record.version,
    sourceSha256: firstDocument.extracao.sourceSha256,
    extractedTextSha256: firstDocument.extracao.extractedTextSha256,
    documentCount: reviewHashes.documentCount,
    documentSetSha256: reviewHashes.documentSetSha256,
    generatorPromptVersion: record.geracao.promptVersion,
    generatorModel: record.geracao.model,
    judgePromptVersion: judgePromptVersion(record),
    judgeModel: record.julgamento.model,
    contentSha256: reviewHashes.contentSha256,
  }
}

function assertDecisionMatches(
  fingerprint: ProgramaGovernoApprovalFingerprint,
  decision: ProgramaGovernoApprovalDecision,
): void {
  assert(decision.decisionVersion === APPROVAL_DECISION_VERSION, "decisionVersion nao suportada")
  assert(decision.decision === "approve", "decisao humana explicita deve ser approve")
  assert(decision.reviewer.trim().length > 0, "reviewer deve ser texto nao vazio")
  assert(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(decision.reviewedAt)
      && !Number.isNaN(Date.parse(decision.reviewedAt)),
    "reviewedAt deve ser data ISO UTC valida",
  )
  for (const key of Object.keys(fingerprint) as Array<keyof ProgramaGovernoApprovalFingerprint>) {
    assert(decision[key] === fingerprint[key], `${fingerprint.slug}: decisao stale em ${key}`)
  }
}

function assertEligibleForApproval(record: ProgramaGovernoPipelineRecord): void {
  assert(record.resumo && record.geracao && record.julgamento, `${record.fonte.slug}: conteudo incompleto`)
  programaGovernoDocumentos(record)
  const presidency = record.fonte.cargo.toLocaleUpperCase("pt-BR") === "PRESIDENTE"
    && record.fonte.uf.toLocaleUpperCase("pt-BR") === "BR"
  if (presidency && record.estado === "aguardando_revisao") {
    assert(record.julgamento.verdicts.length > 0, `${record.fonte.slug}: julgamento vazio`)
    assert(record.julgamento.verdicts.every((item) => item.verdict === "yes"), `${record.fonte.slug}: existe claim sem verdict yes`)
    return
  }
  assert(record.estado === "em_revisao", `${record.fonte.slug}: estado=${record.estado}; esperado=em_revisao`)
  const expectedPrompts = programaGovernoExpectedPromptVersions(record.fonte)
  assert(record.geracao.promptVersion === expectedPrompts.generatorPromptVersion, `${record.fonte.slug}: prompt do gerador ausente ou stale`)
  assert(record.julgamento.promptVersion === expectedPrompts.judgePromptVersion, `${record.fonte.slug}: rubric do judge ausente ou stale`)
  const assessment = assessProgramaGovernoJudgeVerdicts(buildProgramaGovernoJudgeClaims([record]), record.julgamento.verdicts)
  assert(assessment.eligible, `${record.fonte.slug}: Eval tem ${assessment.blockers.length} bloqueio(s)`)
  const ingestion = record as ProgramaGovernoPipelineRecord & {
    ingestao?: { etapa?: string; erro?: string | null; eval?: { completo?: boolean; blockers?: number } | null }
  }
  if (ingestion.ingestao) {
    assert(
      ingestion.ingestao.etapa === "concluida"
        && ingestion.ingestao.erro === null
        && ingestion.ingestao.eval?.completo === true
        && ingestion.ingestao.eval.blockers === 0,
      `${record.fonte.slug}: ingestao ou Eval nao esta completa`,
    )
  }
}

export function prepareProgramaGovernoApproval(
  record: ProgramaGovernoPipelineRecord,
  decision: ProgramaGovernoApprovalDecision,
): ProgramaGovernoRegistro {
  assertProgramaGovernoRegistro(record)
  assertEligibleForApproval(record)
  const fingerprint = programaGovernoApprovalFingerprint(record)
  assertDecisionMatches(fingerprint, decision)
  const next = {
    ...record,
    estado: "aprovado",
    revisao: {
      reviewer: decision.reviewer,
      reviewedAt: decision.reviewedAt,
      sourceSha256: fingerprint.sourceSha256,
      extractedTextSha256: fingerprint.extractedTextSha256,
      documentCount: fingerprint.documentCount,
      documentSetSha256: fingerprint.documentSetSha256,
      contentSha256: fingerprint.contentSha256,
    },
  }
  assertProgramaGovernoRegistro(next)
  return next
}

export async function writeProgramaGovernoApprovals(
  prepared: readonly { file: string; record: ProgramaGovernoRegistro }[],
  options: {
    apply: boolean
    recordsDir: string
    backupDir: string
    receiptPath: string
    readAt: string
  },
  adapters: ProgramaGovernoApprovalWriteAdapters = approvalWriteAdapters,
): Promise<{ applied: boolean }> {
  for (const { record } of prepared) {
    assertProgramaGovernoRegistro(record)
    assert(record.estado === "aprovado", `${record.fonte.slug}: escrita de approval exige estado aprovado`)
  }
  if (!options.apply) return { applied: false }

  await adapters.mkdir(options.backupDir)
  for (const { file } of prepared) {
    const finalPath = path.join(options.recordsDir, file)
    try {
      const existing = await adapters.readFile(finalPath)
      await adapters.writeFile(path.join(options.backupDir, file), existing)
    } catch (error) {
      if (!isMissingFile(error)) throw error
    }
  }
  const temporary = await Promise.all(prepared.map(async ({ file, record }) => {
    const finalPath = path.join(options.recordsDir, file)
    const temporaryPath = `${finalPath}.approval-${process.pid}.tmp`
    await adapters.writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`)
    return { file, record, finalPath, temporaryPath }
  }))
  for (const item of temporary) await adapters.rename(item.temporaryPath, item.finalPath)
  for (const item of temporary) {
    const readback = JSON.parse(await adapters.readFile(item.finalPath)) as ProgramaGovernoRegistro
    assertProgramaGovernoRegistro(readback)
    assert(hashJson(readback) === hashJson(item.record), `${item.file}: readback divergiu da aprovacao`)
  }
  const receipt = {
    operation: "programas-governo-approve",
    applied: true,
    readAt: options.readAt,
    records: temporary.map(({ file, record }) => ({
      file,
      fingerprint: programaGovernoApprovalFingerprint(record as ProgramaGovernoPipelineRecord),
      reviewer: record.revisao?.reviewer,
      reviewedAt: record.revisao?.reviewedAt,
    })),
  }
  await adapters.mkdir(path.dirname(options.receiptPath))
  await adapters.writeFile(options.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  return { applied: true }
}

function parseDecisionFile(value: unknown): ProgramaGovernoApprovalDecision[] {
  const decisions = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { decisions?: unknown }).decisions)
      ? (value as { decisions: unknown[] }).decisions
      : null
  assert(decisions, "decision file deve conter um array decisions")
  return decisions as ProgramaGovernoApprovalDecision[]
}

async function approve(): Promise<void> {
  const apply = process.argv.includes("--apply")
  if (apply && process.argv.includes("--dry-run")) throw new Error("use somente --apply ou --dry-run")
  const recordsDir = path.resolve(argument("records-dir") ?? LEGACY_RECORDS_DIR)
  const files = (await readdir(recordsDir)).filter((file) => file.endsWith(".json")).sort()
  assert(files.length > 0, "nenhum registro para aprovar")
  const loaded = await Promise.all(files.map(async (file) => ({
    file,
    record: JSON.parse(await readFile(path.join(recordsDir, file), "utf8")) as ProgramaGovernoPipelineRecord,
  })))

  const decisionFile = argument("decision-file")
  let decisions: ProgramaGovernoApprovalDecision[]
  if (decisionFile) {
    decisions = parseDecisionFile(JSON.parse(await readFile(path.resolve(decisionFile), "utf8")))
  } else {
    assert(recordsDir === LEGACY_RECORDS_DIR, "modo legado aceita somente o diretorio presidencial canonico")
    assert(loaded.length === 13, `registros presidenciais encontrados=${loaded.length}; esperado=13`)
    const reviewer = argument("reviewer")
    const reviewedAt = argument("reviewed-at")
    assert(reviewer && reviewedAt, "modo legado exige --reviewer e --reviewed-at")
    decisions = loaded.map(({ record }) => ({
      ...programaGovernoApprovalFingerprint(record),
      decisionVersion: APPROVAL_DECISION_VERSION,
      decision: "approve",
      reviewer,
      reviewedAt,
    }))
  }

  const decisionByIdentity = new Map(decisions.map((decision) => [decision.identityKey, decision]))
  assert(decisionByIdentity.size === decisions.length, "decision file contem identidade duplicada")
  assert(decisions.length === loaded.length, `decisoes=${decisions.length}; registros=${loaded.length}`)
  const prepared = loaded.map(({ file, record }) => {
    const identity = programaGovernoIdentityKey(record.fonte)
    const decision = decisionByIdentity.get(identity)
    assert(decision, `${file}: decisao humana ausente para ${identity}`)
    return { file, record: prepareProgramaGovernoApproval(record, decision) }
  })

  const readAt = new Date().toISOString()
  const parentDir = path.dirname(recordsDir)
  const backupDir = path.resolve(argument("backup-dir") ?? path.join(parentDir, ".programas-governo-backups", `approval-${readAt.replace(/[:.]/gu, "-")}`))
  const receiptPath = path.resolve(argument("receipt") ?? path.join(parentDir, `programas-governo-approval-receipt-${readAt.replace(/[:.]/gu, "-")}.json`))
  const result = await writeProgramaGovernoApprovals(prepared, {
    apply,
    recordsDir,
    backupDir,
    receiptPath,
    readAt,
  })
  const marker = result.applied ? "PROGRAMAS_APPROVAL_PASS" : "PROGRAMAS_APPROVAL_DRY_RUN_PASS"
  console.log(`${marker} candidatos=${prepared.length} decision_file=${decisionFile ? path.resolve(decisionFile) : "legacy-presidential-batch"}${result.applied ? ` backup=${backupDir} receipt=${receiptPath}` : ""}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void approve().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
