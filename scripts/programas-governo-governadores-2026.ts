import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"

import {
  createProgramaTempWorkspace,
  extractProgramaPdf,
  PROGRAMA_GOVERNO_EXTRACTION_METHOD,
  PROGRAMA_GOVERNO_EXTRACTION_VERSION,
  type ProgramaGovernoExtracaoRastreavel,
} from "./lib/programas-governo-extracao"
import {
  createProgramaGovernoModelAdapters,
  PROGRAMA_GOVERNO_GOV_EVAL_DIMENSIONS,
  type ProgramaGovernoGeneratorInput,
  type ProgramaGovernoJudgeItem,
  type ProgramaGovernoModelAdapters,
  type ProgramaGovernoModelsConfig,
} from "./programas-governo-governadores-2026-models"
import { programaGovernoExpectedPromptVersions } from "./programas-governo-stage"
import {
  assertProgramaGovernoDocumento,
  assertProgramaGovernoFonte,
  assertProgramaGovernoIdentidade,
  assertProgramaGovernoRegistro,
  type ProgramaGovernoDocumento,
  type ProgramaGovernoDocumentoFonte,
  type ProgramaGovernoEvidencia,
  type ProgramaGovernoFonte,
  type ProgramaGovernoFonteSemDocumento,
  type ProgramaGovernoRegistro,
  type ProgramaGovernoResumo,
  type ProgramaGovernoUf,
} from "../src/lib/programa-governo"

const execFileAsync = promisify(execFile)
const UF_PATTERN = /^(?:A[CLMP]|BA|CE|DF|ES|GO|MA|M[GST]|P[ABEIR]|R[JNSOR]|S[CEP]|TO)$/u
const SHA256_PATTERN = /^[a-f0-9]{64}$/u

export type ProgramaGovernoGovInventoryCandidate = {
  chave: string
  ano: 2026
  cargo: "GOVERNADOR"
  uf: Exclude<ProgramaGovernoUf, "BR">
  sqCandidato: string
  nomeCompleto: string
  nomeUrna: string
  partido: string
  slug: string | null
  perfilEstado: string
  identidadeEstado: string
  fonteEstado: string
  estadoInventario: string
  documentoIds: string[]
}

export type ProgramaGovernoGovInventoryDocument = {
  id: string
  uf: string
  sqCandidato: string
  sequencia: number
  arquivoNome: string
  arquivoNoPacote: string
  pacoteUrl: string
  pdfOriginalUrl: string | null
  bytes: number
  sha256: string
  paginas: number
  textoEstado: "extraivel" | "requer_ocr"
  candidaturaAtual: boolean
}

export type ProgramaGovernoGovInventoryPackage = {
  uf: string
  pacoteUrl: string
  arquivoNome: string
  bytes: number
  sha256: string
  documentoIds: string[]
}

export type ProgramaGovernoGovInventory = {
  versao: number
  geradoEm: string
  escopo: { ano: 2026; cargo: "GOVERNADOR"; ufs: string[] }
  fonte: { datasetUrl: string }
  candidaturas: ProgramaGovernoGovInventoryCandidate[]
  documentos: ProgramaGovernoGovInventoryDocument[]
  pacotes: ProgramaGovernoGovInventoryPackage[]
}

export type ProgramaGovernoGovIngestionState = "em_revisao" | "perfil_local_ausente" | "sem_documento_oficial" | "falha_de_extracao"

export type ProgramaGovernoGovIngestionRecord = Omit<ProgramaGovernoRegistro, "julgamento"> & {
  estado: ProgramaGovernoGovIngestionState
  julgamento?: NonNullable<ProgramaGovernoRegistro["julgamento"]> & { promptVersion: string }
  ingestao: {
    identityKey: string
    inventoryVersion: number
    inventoryGeneratedAt: string
    etapa: "ausencia" | "extracao" | "modelos" | "concluida"
    erro: string | null
    documentosInventario: string[]
    modelos: null | {
      generator: { name: string; version: string; promptVersion: string; attempts: number }
      judge: { name: string; version: string; promptVersion: string; attempts: number }
    }
    eval: null | { completo: boolean; blockers: number; dimensoes: readonly string[] }
  }
}

export type ProgramaGovernoGovIngestionResult = {
  ufs: string[]
  records: ProgramaGovernoGovIngestionRecord[]
  counts: Record<ProgramaGovernoGovIngestionState, number>
  blockers: Array<{
    identityKey: string
    etapa: ProgramaGovernoGovIngestionRecord["ingestao"]["etapa"]
    motivo: string
  }>
}

export type ProgramaGovernoGovCliOptions = {
  ufs: string[]
  inventoryPath: string
  archiveDir: string
  outputDir: string
  modelsConfigPath?: string
}

export type ProgramaGovernoGovIngestionAdapters = {
  readText(path: string): Promise<string>
  readBytes(path: string): Promise<Buffer>
  extractArchiveEntry(archivePath: string, entry: string): Promise<Buffer>
  extractPdf(bytes: Buffer, filename: string): Promise<ProgramaGovernoExtracaoRastreavel>
  ensureDir(path: string): Promise<void>
  writeText(path: string, value: string): Promise<void>
  now(): string
}

const defaultAdapters: ProgramaGovernoGovIngestionAdapters = {
  readText: (path) => readFile(path, "utf8"),
  readBytes: readFile,
  async extractArchiveEntry(archivePath, entry) {
    const result = await execFileAsync("unzip", ["-p", archivePath, entry], {
      encoding: "buffer",
      maxBuffer: 128 * 1024 * 1024,
    })
    return result.stdout as Buffer
  },
  async extractPdf(bytes, filename) {
    const workspace = await createProgramaTempWorkspace()
    try {
      const path = resolve(workspace.directory, basename(filename))
      await writeFile(path, bytes)
      return await extractProgramaPdf(path)
    } finally {
      await workspace.cleanup()
    }
  },
  ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
  writeText: (path, value) => writeFile(path, value, "utf8"),
  now: () => new Date().toISOString(),
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function valueArg(argv: readonly string[], name: string): string | undefined {
  return argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
}

export function parseProgramaGovernoGovernadoresArgs(argv: readonly string[]): ProgramaGovernoGovCliOptions {
  const ufsValue = valueArg(argv, "--ufs")
  const inventoryPath = valueArg(argv, "--inventory")
  const archiveDir = valueArg(argv, "--archive-dir")
  const outputDir = valueArg(argv, "--output-dir")
  if (!ufsValue || !inventoryPath || !archiveDir || !outputDir) {
    throw new Error("use --ufs=AC,AM --inventory=<json> --archive-dir=<dir> --output-dir=<dir> [--models-config=<json>]")
  }
  const ufs = [...new Set(ufsValue.split(",").map((uf) => uf.trim().toLocaleUpperCase("pt-BR")).filter(Boolean))]
  if (ufs.length === 0 || ufs.some((uf) => !UF_PATTERN.test(uf))) throw new Error("--ufs contem UF invalida")
  return {
    ufs: ufs.sort(),
    inventoryPath: resolve(inventoryPath),
    archiveDir: resolve(archiveDir),
    outputDir: resolve(outputDir),
    ...(valueArg(argv, "--models-config") ? { modelsConfigPath: resolve(valueArg(argv, "--models-config")!) } : {}),
  }
}

function parseInventory(raw: string): ProgramaGovernoGovInventory {
  const inventory = JSON.parse(raw) as ProgramaGovernoGovInventory
  if (!inventory || inventory.escopo?.ano !== 2026 || inventory.escopo?.cargo !== "GOVERNADOR") {
    throw new Error("inventario fora do escopo 2026:GOVERNADOR")
  }
  if (!Array.isArray(inventory.candidaturas) || !Array.isArray(inventory.documentos) || !Array.isArray(inventory.pacotes)) {
    throw new Error("inventario incompleto")
  }
  return inventory
}

function assertInventoryScope(inventory: ProgramaGovernoGovInventory, requestedUfs: readonly string[]): void {
  const available = new Set(inventory.escopo.ufs)
  for (const uf of requestedUfs) if (!available.has(uf)) throw new Error(`UF ${uf} ausente do inventario`)
  const identities = new Set<string>()
  const slugs = new Set<string>()
  const candidateUfs = new Set<string>()
  for (const candidate of inventory.candidaturas.filter(({ uf }) => requestedUfs.includes(uf))) {
    const expected = `2026:GOVERNADOR:${candidate.uf}:${candidate.sqCandidato}`
    if (candidate.chave !== expected) throw new Error(`${candidate.chave}: identidade composta divergente`)
    if (identities.has(candidate.chave)) throw new Error(`${candidate.chave}: identidade composta duplicada`)
    identities.add(candidate.chave)
    candidateUfs.add(candidate.uf)
    assertProgramaGovernoIdentidade({
      ano: candidate.ano,
      cargo: candidate.cargo,
      uf: candidate.uf,
      sqCandidato: candidate.sqCandidato,
      slug: candidate.slug,
      nomeUrna: candidate.nomeUrna,
      partido: candidate.partido,
    }, `inventario.${candidate.chave}`)
    if (candidate.slug) {
      if (slugs.has(candidate.slug)) throw new Error(`${candidate.slug}: slug duplicado no inventario`)
      slugs.add(candidate.slug)
    }
  }
  for (const uf of requestedUfs) if (!candidateUfs.has(uf)) throw new Error(`UF ${uf} sem candidaturas no inventario`)
}

function assertSequentialDocuments(
  candidate: ProgramaGovernoGovInventoryCandidate,
  documents: readonly ProgramaGovernoGovInventoryDocument[],
): void {
  if (documents.length !== candidate.documentoIds.length) throw new Error(`${candidate.chave}: conjunto documental incompleto`)
  for (const [index, document] of documents.entries()) {
    const sequence = index + 1
    const suffix = String(sequence).padStart(2, "0")
    const id = `${candidate.uf}:${candidate.sqCandidato}:${suffix}`
    const filename = `2026${candidate.uf}${candidate.sqCandidato}_${suffix}.pdf`
    if (
      candidate.documentoIds[index] !== id
      || document.id !== id
      || document.sequencia !== sequence
      || document.uf !== candidate.uf
      || document.sqCandidato !== candidate.sqCandidato
      || document.arquivoNome !== filename
      || document.arquivoNoPacote !== `${candidate.uf}/${filename}`
      || document.candidaturaAtual !== true
      || !Number.isInteger(document.bytes)
      || document.bytes < 1
      || !Number.isInteger(document.paginas)
      || document.paginas < 1
      || !SHA256_PATTERN.test(document.sha256)
    ) {
      throw new Error(`${candidate.chave}: documento divergente na sequencia ${suffix}`)
    }
  }
}

function sourceFor(
  candidate: ProgramaGovernoGovInventoryCandidate,
  inventory: ProgramaGovernoGovInventory,
  packageInfo: ProgramaGovernoGovInventoryPackage,
  firstDocument?: ProgramaGovernoGovInventoryDocument,
): ProgramaGovernoFonte | ProgramaGovernoFonteSemDocumento {
  return {
    ano: 2026,
    cargo: "GOVERNADOR",
    uf: candidate.uf,
    sqCandidato: candidate.sqCandidato,
    slug: candidate.slug,
    nomeUrna: candidate.nomeUrna,
    partido: candidate.partido,
    ...(firstDocument
      ? { arquivoNome: firstDocument.arquivoNome, arquivoNoPacote: firstDocument.arquivoNoPacote }
      : { arquivoNome: null, arquivoNoPacote: null }),
    pacoteUrl: packageInfo.pacoteUrl,
    datasetUrl: inventory.fonte.datasetUrl,
    pdfOriginalUrl: firstDocument?.pdfOriginalUrl ?? null,
    coletadoEm: inventory.geradoEm,
  }
}

function documentSource(
  document: ProgramaGovernoGovInventoryDocument,
  inventory: ProgramaGovernoGovInventory,
): ProgramaGovernoDocumentoFonte {
  return {
    arquivoNome: document.arquivoNome,
    arquivoNoPacote: document.arquivoNoPacote,
    pacoteUrl: document.pacoteUrl,
    datasetUrl: inventory.fonte.datasetUrl,
    pdfOriginalUrl: document.pdfOriginalUrl,
    coletadoEm: inventory.geradoEm,
  }
}

function assertPageSafeExtraction(
  document: ProgramaGovernoGovInventoryDocument,
  extraction: ProgramaGovernoExtracaoRastreavel,
): void {
  if (extraction.sourceSha256 !== document.sha256) throw new Error(`${document.id}: hash da extracao diverge do inventario`)
  if (extraction.paginas !== document.paginas) throw new Error(`${document.id}: paginas divergem do inventario`)
  if (
    extraction.extractionVersion !== PROGRAMA_GOVERNO_EXTRACTION_VERSION
    || extraction.method !== PROGRAMA_GOVERNO_EXTRACTION_METHOD
  ) {
    throw new Error(`${document.id}: metodo ou versao da extracao divergente`)
  }
  if (extraction.secoes.length !== extraction.paginas || extraction.pageMap.length !== extraction.paginas) {
    throw new Error(`${document.id}: mapa de paginas incompleto`)
  }
  for (let index = 0; index < extraction.paginas; index += 1) {
    const page = index + 1
    const section = extraction.secoes[index]
    const mapped = extraction.pageMap[index]
    if (section.paginaInicial !== page || section.paginaFinal !== page || mapped.pagina !== page) {
      throw new Error(`${document.id}: pagina ${page} fora de ordem`)
    }
    if (!SHA256_PATTERN.test(mapped.textSha256) || mapped.textSha256 !== sha256(section.conteudo)) {
      throw new Error(`${document.id}: hash da pagina ${page} divergente`)
    }
    if (mapped.origem !== section.origem) throw new Error(`${document.id}: origem da pagina ${page} divergente`)
  }
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("pt-BR")
}

function requiredEvidence(value: ProgramaGovernoEvidencia, path: string): Required<ProgramaGovernoEvidencia> {
  if (!value.documentoId) throw new Error(`${path}: documentoId obrigatorio`)
  return { ...value, documentoId: value.documentoId }
}

function assertLiteralEvidence(
  summary: ProgramaGovernoResumo,
  documents: readonly ProgramaGovernoDocumento[],
): void {
  const pages = new Map<string, string>()
  for (const document of documents) {
    for (const section of document.extracao.secoes) {
      pages.set(`${document.documentoId}:${section.paginaInicial}`, normalizeText(section.conteudo))
    }
  }
  const evidence = [
    ...summary.frases.flatMap((sentence) => sentence.evidencias),
    ...summary.temas.flatMap((theme) => theme.evidencias),
  ]
  for (const [index, item] of evidence.entries()) {
    const linked = requiredEvidence(item, `evidencia[${index}]`)
    const page = pages.get(`${linked.documentoId}:${linked.pagina}`)
    if (!page || !page.includes(normalizeText(linked.trecho))) {
      throw new Error(`evidencia[${index}]: documento, pagina ou trecho divergente`)
    }
  }
}

function generatorInput(identityKey: string, documents: readonly ProgramaGovernoDocumento[]): ProgramaGovernoGeneratorInput {
  return {
    identityKey,
    documentos: documents.map((document) => ({
      documentoId: document.documentoId,
      paginas: document.extracao.secoes.map((section) => ({
        pagina: section.paginaInicial,
        origem: section.origem,
        texto: section.conteudo,
      })),
    })),
  }
}

function judgeItems(
  identityKey: string,
  summary: ProgramaGovernoResumo,
): ProgramaGovernoJudgeItem[] {
  const claims = [
    ...summary.frases.map((sentence, index) => ({
      claimId: `frase:${index + 1}`,
      claimTexto: sentence.texto,
      evidencias: sentence.evidencias.map((item, evidenceIndex) => requiredEvidence(item, `frase:${index + 1}:${evidenceIndex}`)),
    })),
    ...summary.temas.map((theme) => ({
      claimId: `tema:${theme.id}`,
      claimTexto: `${theme.titulo}: ${theme.descricao}`,
      evidencias: theme.evidencias.map((item, evidenceIndex) => requiredEvidence(item, `tema:${theme.id}:${evidenceIndex}`)),
    })),
  ]
  return claims.flatMap((claim) => {
    const documentoIds = [...new Set(claim.evidencias.map(({ documentoId }) => documentoId))].sort()
    return PROGRAMA_GOVERNO_GOV_EVAL_DIMENSIONS.map((dimension) => ({
      id: `${identityKey}:${claim.claimId}:documentos:${documentoIds.join("+")}:${dimension}`,
      claimId: claim.claimId,
      dimension,
      identityKey,
      documentoIds,
      claimTexto: claim.claimTexto,
      evidencias: claim.evidencias,
    }))
  })
}

function citedPages(items: readonly ProgramaGovernoJudgeItem[], documents: readonly ProgramaGovernoDocumento[]) {
  const requested = new Set(items.flatMap(({ evidencias }) => evidencias.map(({ documentoId, pagina }) => `${documentoId}:${pagina}`)))
  return documents.flatMap((document) => document.extracao.secoes
    .filter((section) => requested.has(`${document.documentoId}:${section.paginaInicial}`))
    .map((section) => ({ documentoId: document.documentoId, pagina: section.paginaInicial, texto: section.conteudo })))
}

function assertJudgeCoverage(expected: readonly ProgramaGovernoJudgeItem[], actual: Awaited<ReturnType<ProgramaGovernoModelAdapters["judgeClaims"]>>["output"]): void {
  if (actual.avaliacoes.length !== expected.length) throw new Error("judge: cobertura incompleta das seis dimensoes")
  const byId = new Map(actual.avaliacoes.map((item) => [item.id, item]))
  if (byId.size !== actual.avaliacoes.length) throw new Error("judge: id duplicado")
  for (const item of expected) {
    const evaluated = byId.get(item.id)
    if (!evaluated) throw new Error(`judge: id ausente ${item.id}`)
    for (const key of ["claimId", "dimension", "identityKey"] as const) {
      if (evaluated[key] !== item[key]) throw new Error(`judge: ${key} divergente em ${item.id}`)
    }
    if (
      JSON.stringify(evaluated.documentoIds) !== JSON.stringify(item.documentoIds)
      || JSON.stringify(evaluated.evidencias) !== JSON.stringify(item.evidencias)
    ) {
      throw new Error(`judge: vinculo documento/pagina/evidencia divergente em ${item.id}`)
    }
  }
}

function baseIngestion(
  candidate: ProgramaGovernoGovInventoryCandidate,
  inventory: ProgramaGovernoGovInventory,
  etapa: ProgramaGovernoGovIngestionRecord["ingestao"]["etapa"],
  erro: string | null,
) {
  return {
    identityKey: candidate.chave,
    inventoryVersion: inventory.versao,
    inventoryGeneratedAt: inventory.geradoEm,
    etapa,
    erro,
    documentosInventario: [...candidate.documentoIds],
    modelos: null,
    eval: null,
  } satisfies ProgramaGovernoGovIngestionRecord["ingestao"]
}

function terminalRecord(
  state: Exclude<ProgramaGovernoGovIngestionState, "em_revisao">,
  candidate: ProgramaGovernoGovInventoryCandidate,
  inventory: ProgramaGovernoGovInventory,
  source: ProgramaGovernoFonte | ProgramaGovernoFonteSemDocumento,
  error: string | null,
  etapa: ProgramaGovernoGovIngestionRecord["ingestao"]["etapa"] = "ausencia",
  documents?: ProgramaGovernoDocumento[],
): ProgramaGovernoGovIngestionRecord {
  return {
    version: 1,
    estado: state,
    fonte: source,
    ...(documents ? { documentos: documents } : {}),
    ingestao: baseIngestion(candidate, inventory, etapa, error),
  }
}

async function extractDocuments(
  candidate: ProgramaGovernoGovInventoryCandidate,
  inventory: ProgramaGovernoGovInventory,
  documents: readonly ProgramaGovernoGovInventoryDocument[],
  packageInfo: ProgramaGovernoGovInventoryPackage,
  archiveDir: string,
  archiveBytes: Buffer,
  adapters: ProgramaGovernoGovIngestionAdapters,
): Promise<ProgramaGovernoDocumento[]> {
  const archivePath = resolve(archiveDir, packageInfo.arquivoNome)
  const extracted: ProgramaGovernoDocumento[] = []
  const identity = sourceFor(candidate, inventory, packageInfo, documents[0])
  for (const [index, document] of documents.entries()) {
    const bytes = await adapters.extractArchiveEntry(archivePath, document.arquivoNoPacote)
    if (bytes.length !== document.bytes || sha256(bytes) !== document.sha256) {
      throw new Error(`${document.id}: PDF diverge em bytes ou hash`)
    }
    const extraction = await adapters.extractPdf(bytes, document.arquivoNome)
    assertPageSafeExtraction(document, extraction)
    const value = {
      documentoId: document.id,
      fonte: documentSource(document, inventory),
      extracao: extraction,
    }
    assertProgramaGovernoDocumento(value, identity, index + 1, `documentos[${index}]`)
    extracted.push(value)
  }
  return extracted
}

async function ingestCandidate(
  candidate: ProgramaGovernoGovInventoryCandidate,
  inventory: ProgramaGovernoGovInventory,
  documents: readonly ProgramaGovernoGovInventoryDocument[],
  packageInfo: ProgramaGovernoGovInventoryPackage,
  archiveDir: string,
  loadArchive: () => Promise<Buffer>,
  models: ProgramaGovernoModelAdapters | null,
  adapters: ProgramaGovernoGovIngestionAdapters,
): Promise<ProgramaGovernoGovIngestionRecord> {
  const profileMissing = candidate.perfilEstado !== "vinculado" || candidate.slug === null
  if (candidate.fonteEstado !== "documento_oficial_encontrado" || documents.length === 0) {
    const source = sourceFor(candidate, inventory, packageInfo)
    assertProgramaGovernoFonte(source, `fonte.${candidate.chave}`)
    return profileMissing
      ? terminalRecord("perfil_local_ausente", candidate, inventory, source, "perfil local nao vinculado por SQ_CANDIDATO")
      : terminalRecord("sem_documento_oficial", candidate, inventory, source, null)
  }
  const source = sourceFor(candidate, inventory, packageInfo, documents[0]) as ProgramaGovernoFonte
  assertProgramaGovernoFonte(source, `fonte.${candidate.chave}`)
  let extracted: ProgramaGovernoDocumento[]
  try {
    const archiveBytes = await loadArchive()
    extracted = await extractDocuments(candidate, inventory, documents, packageInfo, archiveDir, archiveBytes, adapters)
    if (candidate.identidadeEstado !== "confirmada") {
      return terminalRecord("falha_de_extracao", candidate, inventory, source, "identidade oficial ambigua", "extracao", extracted)
    }
    if (profileMissing) {
      return terminalRecord(
        "perfil_local_ausente",
        candidate,
        inventory,
        source,
        "perfil local nao vinculado por SQ_CANDIDATO",
        "concluida",
        extracted,
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return terminalRecord("falha_de_extracao", candidate, inventory, source, message, "extracao")
  }
  try {
    if (!models) throw new Error("configuracao de generator e judge ausente")
    const expectedPrompts = programaGovernoExpectedPromptVersions(source)
    const generated = await models.generate(generatorInput(candidate.chave, extracted))
    if (generated.metadata.promptVersion !== expectedPrompts.generatorPromptVersion) {
      throw new Error(`generator prompt stale: ${generated.metadata.promptVersion}`)
    }
    assertLiteralEvidence(generated.output, extracted)
    const draft: ProgramaGovernoRegistro = {
      version: 1,
      estado: "em_revisao",
      fonte: source,
      documentos: extracted,
      resumo: generated.output,
      geracao: {
        promptVersion: generated.metadata.promptVersion,
        model: `${generated.metadata.name}@${generated.metadata.version}`,
        generatedAt: adapters.now(),
      },
    }
    assertProgramaGovernoRegistro(draft)
    const claims = judgeItems(candidate.chave, generated.output)
    const judged = await models.judgeClaims({ claims, paginasCitadas: citedPages(claims, extracted) })
    if (judged.metadata.promptVersion !== expectedPrompts.judgePromptVersion) {
      throw new Error(`judge prompt stale: ${judged.metadata.promptVersion}`)
    }
    assertJudgeCoverage(claims, judged.output)
    const blockers = judged.output.avaliacoes.filter(({ verdict }) => verdict !== "yes").length
    const evalCompleto = blockers === 0
    const record: ProgramaGovernoGovIngestionRecord = {
      ...draft,
      estado: "em_revisao",
      julgamento: {
        model: `${judged.metadata.name}@${judged.metadata.version}`,
        promptVersion: judged.metadata.promptVersion,
        judgedAt: adapters.now(),
        verdicts: judged.output.avaliacoes.map(({ id, verdict, reason }) => ({ id, verdict, reason })),
      },
      ingestao: {
        ...baseIngestion(
          candidate,
          inventory,
          evalCompleto ? "concluida" : "modelos",
          evalCompleto ? null : `Eval bloqueado por ${blockers} veredito(s) no/unknown`,
        ),
        modelos: { generator: generated.metadata, judge: judged.metadata },
        eval: {
          completo: evalCompleto,
          blockers,
          dimensoes: PROGRAMA_GOVERNO_GOV_EVAL_DIMENSIONS,
        },
      },
    }
    assertProgramaGovernoRegistro(record)
    return record
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      version: 1,
      estado: "em_revisao",
      fonte: source,
      documentos: extracted,
      ingestao: {
        ...baseIngestion(candidate, inventory, "modelos", message),
        eval: { completo: false, blockers: 1, dimensoes: PROGRAMA_GOVERNO_GOV_EVAL_DIMENSIONS },
      },
    }
  }
}

export async function ingestProgramaGovernoGovernadores(
  options: ProgramaGovernoGovCliOptions,
  dependencies: {
    adapters?: Partial<ProgramaGovernoGovIngestionAdapters>
    models?: ProgramaGovernoModelAdapters | null
  } = {},
): Promise<ProgramaGovernoGovIngestionResult> {
  const adapters = { ...defaultAdapters, ...dependencies.adapters }
  const inventory = parseInventory(await adapters.readText(options.inventoryPath))
  assertInventoryScope(inventory, options.ufs)
  const candidates = inventory.candidaturas
    .filter(({ uf }) => options.ufs.includes(uf))
    .sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"))
  const documentsById = new Map<string, ProgramaGovernoGovInventoryDocument>()
  for (const document of inventory.documentos) {
    if (documentsById.has(document.id)) throw new Error(`${document.id}: documento duplicado no inventario`)
    documentsById.set(document.id, document)
  }
  const packagesByUf = new Map<string, ProgramaGovernoGovInventoryPackage>()
  for (const packageInfo of inventory.pacotes) {
    if (packagesByUf.has(packageInfo.uf)) throw new Error(`${packageInfo.uf}: pacote duplicado no inventario`)
    if (packageInfo.arquivoNome !== `proposta_governo_2026_${packageInfo.uf}.zip`) {
      throw new Error(`${packageInfo.uf}: nome de pacote inesperado`)
    }
    packagesByUf.set(packageInfo.uf, packageInfo)
  }
  const archiveCache = new Map<string, Promise<Buffer>>()
  const loadArchive = (packageInfo: ProgramaGovernoGovInventoryPackage) => {
    const cached = archiveCache.get(packageInfo.uf)
    if (cached) return cached
    const loading = adapters.readBytes(resolve(options.archiveDir, packageInfo.arquivoNome)).then((bytes) => {
      if (
        !Number.isInteger(packageInfo.bytes)
        || packageInfo.bytes < 1
        || !SHA256_PATTERN.test(packageInfo.sha256)
        || bytes.length !== packageInfo.bytes
        || sha256(bytes) !== packageInfo.sha256
      ) {
        throw new Error(`${packageInfo.uf}: pacote oficial diverge em bytes ou hash`)
      }
      return bytes
    })
    archiveCache.set(packageInfo.uf, loading)
    return loading
  }
  const records: ProgramaGovernoGovIngestionRecord[] = []
  await adapters.ensureDir(options.outputDir)
  for (const candidate of candidates) {
    const packageInfo = packagesByUf.get(candidate.uf)
    if (!packageInfo) throw new Error(`${candidate.uf}: pacote ausente do inventario`)
    const documents = candidate.documentoIds.map((id) => {
      const document = documentsById.get(id)
      if (!document) throw new Error(`${candidate.chave}: documento ${id} ausente do inventario`)
      return document
    })
    assertSequentialDocuments(candidate, documents)
    for (const document of documents) {
      if (!packageInfo.documentoIds.includes(document.id) || document.pacoteUrl !== packageInfo.pacoteUrl) {
        throw new Error(`${candidate.chave}: documento diverge do pacote oficial`)
      }
    }
    const record = await ingestCandidate(
      candidate,
      inventory,
      documents,
      packageInfo,
      options.archiveDir,
      () => loadArchive(packageInfo),
      dependencies.models ?? null,
      adapters,
    )
    const ufDir = resolve(options.outputDir, candidate.uf)
    await adapters.ensureDir(ufDir)
    await adapters.writeText(resolve(ufDir, `${candidate.slug ?? candidate.sqCandidato}.json`), `${JSON.stringify(record, null, 2)}\n`)
    records.push(record)
  }
  const counts: ProgramaGovernoGovIngestionResult["counts"] = {
    em_revisao: 0,
    perfil_local_ausente: 0,
    sem_documento_oficial: 0,
    falha_de_extracao: 0,
  }
  for (const record of records) counts[record.estado] += 1
  const blockers = records.flatMap((record) => {
    const failed = record.estado === "falha_de_extracao"
      || record.ingestao.eval?.completo === false
      || (record.ingestao.etapa === "modelos" && record.ingestao.erro !== null)
    return failed
      ? [{
          identityKey: record.ingestao.identityKey,
          etapa: record.ingestao.etapa,
          motivo: record.ingestao.erro ?? "falha sem motivo materializado",
        }]
      : []
  })
  const result = { ufs: [...options.ufs], records, counts, blockers }
  await adapters.writeText(
    resolve(options.outputDir, "manifesto-ingestao.json"),
    `${JSON.stringify({ ufs: result.ufs, counts, blockers }, null, 2)}\n`,
  )
  return result
}

export async function runProgramaGovernoGovernadoresCli(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: {
    adapters?: Partial<ProgramaGovernoGovIngestionAdapters>
    models?: ProgramaGovernoModelAdapters | null
  } = {},
): Promise<ProgramaGovernoGovIngestionResult> {
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error(`Node 24 obrigatorio; atual ${process.versions.node}`)
  const options = parseProgramaGovernoGovernadoresArgs(argv)
  let models = dependencies.models
  if (models === undefined && options.modelsConfigPath) {
    const adapters = { ...defaultAdapters, ...dependencies.adapters }
    const config = JSON.parse(await adapters.readText(options.modelsConfigPath)) as ProgramaGovernoModelsConfig
    models = createProgramaGovernoModelAdapters(config)
  }
  const result = await ingestProgramaGovernoGovernadores(options, { ...dependencies, models: models ?? null })
  if (result.blockers.length > 0) {
    throw new Error(`ingestao materializou ${result.blockers.length} bloqueio(s); consulte manifesto-ingestao.json`)
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void runProgramaGovernoGovernadoresCli().then((result) => {
    console.log(`PROGRAMAS_GOV_INGESTAO_PASS ufs=${result.ufs.length} registros=${result.records.length} aprovados=0`)
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
