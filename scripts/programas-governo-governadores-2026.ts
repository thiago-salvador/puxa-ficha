import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
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
  calcularFingerprintProgramaGovernoPassagens,
  coletarFatosProgramaGovernoPassagens,
  envelopeExcedeLimite,
  filtrarFatosLiterais,
  medirEnvelopeBytes,
  planejarProgramaGovernoPassagens,
  type ProgramaGovernoFato,
} from "./lib/programas-governo-multipassagem"
import {
  createProgramaGovernoModelAdapters,
  PROGRAMA_GOVERNO_FATOS_INSTRUCTIONS,
  PROGRAMA_GOVERNO_FATOS_SCHEMA,
  PROGRAMA_GOVERNO_GOV_EVAL_DIMENSIONS,
  PROGRAMA_GOVERNO_GOV_GENERATOR_INSTRUCTIONS,
  PROGRAMA_GOVERNO_GOV_GENERATOR_SCHEMA,
  PROGRAMA_GOVERNO_GOV_MULTIPASSAGEM_LIMITE_BYTES,
  PROGRAMA_GOVERNO_GOV_MULTIPASSAGEM_PLANNER_VERSION,
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
  numero?: string
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
  textoExtraidoBytes?: number
  textoExtraidoCaracteres?: number
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
      judge?: { name: string; version: string; promptVersion: string; attempts: number }
      geracaoMultipassagem?: {
        planejador: string
        limiteBytes: number
        passagens: number
        passagensCacheadas: number
        chamadasGeracao: number
        retriesPassagem: number
        chamadasSintese: number
        retriesSintese: number
        fingerprint: string
        promptVersoes: { fatosPassagem: string; sinteseFatos: string }
      }
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
  cachePassagensDir?: string
  multipassagemLimiteBytes?: number
  forceFacts?: boolean
  repairGuidance?: string
  repairFactsLimit?: number
  sqCandidato?: string
  planOnly?: boolean
  faseDir?: string
  extractCacheDir?: string
  generatorOnly?: boolean
  generatorCheckpointDir?: string
  resumeGeneratorCheckpoint?: string
}

export type ProgramaGovernoGovIngestionAdapters = {
  readText(path: string): Promise<string>
  readBytes(path: string): Promise<Buffer>
  extractArchiveEntry(archivePath: string, entry: string): Promise<Buffer>
  extractPdf(bytes: Buffer, filename: string): Promise<ProgramaGovernoExtracaoRastreavel>
  ensureDir(path: string): Promise<void>
  writeText(path: string, value: string): Promise<void>
  rename(from: string, to: string): Promise<void>
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
  rename: (from, to) => rename(from, to),
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
  const sqCandidato = valueArg(argv, "--sq-candidato")
  if (sqCandidato !== undefined && !/^\d{11,12}$/u.test(sqCandidato.trim())) {
    throw new Error("--sq-candidato deve ser o SQ_CANDIDATO oficial de 11 ou 12 digitos")
  }
  const rawMultipassagemLimite = valueArg(argv, "--multipassagem-limite-bytes")
  const multipassagemLimiteBytes = rawMultipassagemLimite === undefined ? undefined : Number(rawMultipassagemLimite)
  if (multipassagemLimiteBytes !== undefined && (!Number.isInteger(multipassagemLimiteBytes) || multipassagemLimiteBytes < 1_024)) {
    throw new Error("--multipassagem-limite-bytes deve ser um inteiro de pelo menos 1024")
  }
  const repairGuidance = valueArg(argv, "--repair-guidance")?.trim()
  if (repairGuidance !== undefined && (
    repairGuidance.length === 0
    || repairGuidance.length > 2_000
    || /[\u0000-\u001f\u007f]/u.test(repairGuidance)
  )) {
    throw new Error("--repair-guidance deve ter entre 1 e 2000 caracteres, sem controles")
  }
  const rawRepairFactsLimit = valueArg(argv, "--repair-facts-limit")
  const repairFactsLimit = rawRepairFactsLimit === undefined ? undefined : Number(rawRepairFactsLimit)
  if (repairFactsLimit !== undefined && repairFactsLimit !== 6) {
    throw new Error("--repair-facts-limit deve ser 6")
  }
  const generatorOnly = argv.includes("--generator-only")
  const generatorCheckpointDir = valueArg(argv, "--generator-checkpoint-dir")
  const resumeGeneratorCheckpoint = valueArg(argv, "--resume-generator-checkpoint")
  if (generatorOnly && resumeGeneratorCheckpoint) {
    throw new Error("--generator-only e --resume-generator-checkpoint sao mutuamente exclusivos")
  }
  if (resumeGeneratorCheckpoint !== undefined && resumeGeneratorCheckpoint.trim() === "") {
    throw new Error("--resume-generator-checkpoint exige um caminho")
  }
  if (generatorCheckpointDir !== undefined && generatorCheckpointDir.trim() === "") {
    throw new Error("--generator-checkpoint-dir exige um caminho")
  }
  return {
    ufs: ufs.sort(),
    inventoryPath: resolve(inventoryPath),
    archiveDir: resolve(archiveDir),
    outputDir: resolve(outputDir),
    ...(sqCandidato !== undefined ? { sqCandidato: sqCandidato.trim() } : {}),
    ...(multipassagemLimiteBytes !== undefined ? { multipassagemLimiteBytes } : {}),
    ...(argv.includes("--force-fatos") ? { forceFacts: true } : {}),
    ...(repairGuidance !== undefined ? { repairGuidance } : {}),
    ...(repairFactsLimit !== undefined ? { repairFactsLimit } : {}),
    ...(argv.includes("--plan-only") ? { planOnly: true } : {}),
    ...(valueArg(argv, "--models-config") ? { modelsConfigPath: resolve(valueArg(argv, "--models-config")!) } : {}),
    ...(valueArg(argv, "--cache-dir") ? { cachePassagensDir: resolve(valueArg(argv, "--cache-dir")!) } : {}),
    ...(valueArg(argv, "--fase-dir") ? { faseDir: resolve(valueArg(argv, "--fase-dir")!) } : {}),
    ...(valueArg(argv, "--extract-cache-dir") ? { extractCacheDir: resolve(valueArg(argv, "--extract-cache-dir")!) } : {}),
    ...(generatorOnly ? { generatorOnly: true } : {}),
    ...(generatorCheckpointDir !== undefined ? { generatorCheckpointDir: resolve(generatorCheckpointDir) } : {}),
    ...(resumeGeneratorCheckpoint !== undefined ? { resumeGeneratorCheckpoint: resolve(resumeGeneratorCheckpoint) } : {}),
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

export type ProgramaGovernoGovFilaDocumento = {
  documentoId: string
  sha256: string
  bytes: number
  paginas: number
  textoExtraidoBytes: number
  textoEstado: string
}

export type ProgramaGovernoGovFilaItem = {
  chave: string
  uf: string
  sqCandidato: string
  slug: string | null
  nomeCompleto: string
  nomeUrna: string
  partido: string
  numero: string
  fonteEstado: string
  perfilEstado: string
  identidadeEstado: string
  documentos: ProgramaGovernoGovFilaDocumento[]
  totalPaginas: number
  bytesTextoExtraidos: number
  bytesEntradaEstimados: number
  multipassagem: boolean
  passagensPlanejadas: number
  chaveCacheDir: string
  usaModelos: boolean
  custoEstimado: number
}

function estimarPassagens(
  documentos: readonly { paginas: number; textoExtraidoBytes: number }[],
  limite: number,
  identityKey: string,
): { multipassagem: boolean; passagens: number; bytesEntrada: number } {
  const entradaEstrutural = documentos.map((documento, indice) => ({
    documentoId: `${indice}`,
    paginas: Array.from({ length: documento.paginas }, (_, pagina) => ({ pagina: pagina + 1, origem: "planejamento", texto: "" })),
  }))
  const bytesEstruturais = medirEnvelopeBytes(
    PROGRAMA_GOVERNO_GOV_GENERATOR_INSTRUCTIONS,
    PROGRAMA_GOVERNO_GOV_GENERATOR_SCHEMA,
    { identityKey, documentos: entradaEstrutural },
  )
  const bytesTexto = documentos.reduce((total, documento) => total + Math.max(0, documento.textoExtraidoBytes), 0)
  const bytesEntrada = bytesEstruturais + bytesTexto
  if (documentos.length === 0 || bytesEntrada < limite) {
    return { multipassagem: false, passagens: 1, bytesEntrada }
  }
  const custoFixoPorEnvelope = medirEnvelopeBytes(
    PROGRAMA_GOVERNO_FATOS_INSTRUCTIONS,
    PROGRAMA_GOVERNO_FATOS_SCHEMA,
    { identityKey, documentos: [] },
  )
  const capacidadeUtil = Math.max(1, limite - custoFixoPorEnvelope)
  const bytesDistribuiveis = Math.max(1, bytesEntrada - custoFixoPorEnvelope)
  const passagens = Math.max(2, Math.ceil(bytesDistribuiveis / capacidadeUtil))
  return { multipassagem: true, passagens, bytesEntrada }
}

export function planejarFilaProgramaGovernoGovernadores(
  options: Pick<ProgramaGovernoGovCliOptions, "ufs" | "sqCandidato" | "multipassagemLimiteBytes" | "forceFacts">,
  inventory: ProgramaGovernoGovInventory,
): ProgramaGovernoGovFilaItem[] {
  assertInventoryScope(inventory, options.ufs)
  const documentsById = new Map(inventory.documentos.map((documento) => [documento.id, documento]))
  const limite = options.multipassagemLimiteBytes ?? PROGRAMA_GOVERNO_GOV_MULTIPASSAGEM_LIMITE_BYTES
  let candidates = inventory.candidaturas
    .filter(({ uf }) => options.ufs.includes(uf))
    .sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"))
  if (options.sqCandidato !== undefined) {
    const achados = candidates.filter(({ sqCandidato }) => sqCandidato === options.sqCandidato)
    if (achados.length !== 1) {
      throw new Error(`--sq-candidato ${options.sqCandidato}: ${achados.length} correspondencia(s) nas UFs solicitadas; esperado exatamente 1`)
    }
    candidates = achados
  }
  return candidates.map((candidate) => {
    const documentos = candidate.documentoIds.map((id) => {
      const documento = documentsById.get(id)
      if (!documento) throw new Error(`${candidate.chave}: documento ${id} ausente do inventario`)
      return {
        documentoId: documento.id,
        sha256: documento.sha256,
        bytes: documento.bytes,
        paginas: documento.paginas,
        textoExtraidoBytes: documento.textoExtraidoBytes
          ?? Math.max(documento.bytes * 4, documento.paginas * 4_000),
        textoEstado: documento.textoEstado,
      }
    })
    const totalPaginas = documentos.reduce((acumulado, documento) => acumulado + documento.paginas, 0)
    const bytesTextoExtraidos = documentos.reduce((acumulado, documento) => acumulado + documento.textoExtraidoBytes, 0)
    const estimativa = estimarPassagens(documentos, limite, candidate.chave)
    const fatosForcados = options.forceFacts === true && !estimativa.multipassagem
    const usaPipelineFatos = options.forceFacts === true || estimativa.multipassagem
    const usaModelos = candidate.fonteEstado === "documento_oficial_encontrado"
      && candidate.identidadeEstado === "confirmada"
      && candidate.perfilEstado === "vinculado"
      && candidate.slug !== null
    return {
      chave: candidate.chave,
      uf: candidate.uf,
      sqCandidato: candidate.sqCandidato,
      slug: candidate.slug,
      nomeCompleto: candidate.nomeCompleto,
      nomeUrna: candidate.nomeUrna,
      partido: candidate.partido,
      numero: candidate.numero ?? "",
      fonteEstado: candidate.fonteEstado,
      perfilEstado: candidate.perfilEstado,
      identidadeEstado: candidate.identidadeEstado,
      documentos,
      totalPaginas,
      bytesTextoExtraidos,
      bytesEntradaEstimados: estimativa.bytesEntrada,
      multipassagem: usaPipelineFatos,
      passagensPlanejadas: estimativa.passagens,
      chaveCacheDir: createHash("sha256").update(candidate.chave).digest("hex").slice(0, 16),
      usaModelos,
      custoEstimado: Number((estimativa.passagens + (fatosForcados ? 1 : 0) + totalPaginas / 300).toFixed(3)),
    }
  })
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

function generatorInput(
  identityKey: string,
  documents: readonly ProgramaGovernoDocumento[],
  repairGuidance?: string,
): ProgramaGovernoGeneratorInput {
  return {
    identityKey,
    ...(repairGuidance ? { repairGuidance } : {}),
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

const PROGRAMA_GOVERNO_PASSAGENS_CONCORRENCIA = 3

export type ProgramaGovernoMultipassagemMetrics = {
  planejador: string
  limiteBytes: number
  passagens: number
  passagensCacheadas: number
  chamadasGeracao: number
  retriesPassagem: number
  chamadasSintese: number
  retriesSintese: number
  fingerprint: string
  promptVersoes: { fatosPassagem: string; sinteseFatos: string }
}

async function mapearComConcorrencia<TItem, TResult>(
  itens: readonly TItem[],
  limite: number,
  tarefa: (item: TItem, indice: number) => Promise<TResult>,
): Promise<TResult[]> {
  const resultados = new Array<TResult>(itens.length)
  let proximoIndice = 0
  let primeiraFalha: unknown = null
  const worker = async (): Promise<void> => {
    while (proximoIndice < itens.length && primeiraFalha === null) {
      const indice = proximoIndice
      proximoIndice += 1
      try {
        resultados[indice] = await tarefa(itens[indice]!, indice)
      } catch (error) {
        primeiraFalha ??= error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, worker))
  if (primeiraFalha !== null) throw primeiraFalha
  return resultados
}

function entradaMultipassagem(extracted: readonly ProgramaGovernoDocumento[]) {
  return extracted.map((documento) => ({
    documentoId: documento.documentoId,
    paginas: documento.extracao.secoes.map((secao) => ({
      pagina: secao.paginaInicial,
      origem: secao.origem,
      texto: secao.conteudo,
    })),
  }))
}

export function validarFatosCacheadosProgramaGoverno(
  fatos: unknown,
  documentos: Parameters<typeof filtrarFatosLiterais>[1],
): ProgramaGovernoFato[] | null {
  if (!Array.isArray(fatos) || fatos.length === 0) return null
  const fatosValidados = filtrarFatosLiterais(fatos as ProgramaGovernoFato[], documentos)
  return fatosValidados.length === fatos.length ? fatosValidados : null
}

export function selecionarFatosParaSinteseDeReparo(
  fatos: readonly ProgramaGovernoFato[],
  limite = 6,
): ProgramaGovernoFato[] {
  if (fatos.length <= limite) return [...fatos]
  return Array.from({ length: limite }, (_, index) => fatos[Math.round(index * (fatos.length - 1) / (limite - 1))])
}

async function gerarResumoProgramaGovernoMultipassagem(params: {
  identityKey: string
  nomeUrna: string
  partido: string
  documentosHashes: readonly string[]
  extracted: readonly ProgramaGovernoDocumento[]
  promptVersion: string
  cacheDir: string
  modelos: ProgramaGovernoModelAdapters
  adapters: ProgramaGovernoGovIngestionAdapters
  limiteBytes: number
  repairGuidance?: string
  repairFactsLimit?: number
}): Promise<{ output: ProgramaGovernoResumo; metrics: ProgramaGovernoMultipassagemMetrics; metadata: { promptVersion: string } }> {
  const { identityKey, extracted, modelos, adapters } = params
  const extrairFatos = modelos.extrairFatosPassagem
  const sintetizarDeFatos = modelos.sintetizarDeFatos
  if (!extrairFatos || !sintetizarDeFatos) {
    throw new Error("multipassagem: configuracao do generator nao suporta extrairFatosPassagem/sintetizarDeFatos")
  }
  const limiteBytes = params.limiteBytes
  const documentosEntrada = entradaMultipassagem(extracted)
  const planos = planejarProgramaGovernoPassagens(documentosEntrada, {
    limiteBytes,
    instructions: PROGRAMA_GOVERNO_FATOS_INSTRUCTIONS,
    schema: PROGRAMA_GOVERNO_FATOS_SCHEMA,
    criarInput: (docs) => ({ identityKey, documentos: docs, ...(params.repairGuidance ? { repairGuidance: params.repairGuidance } : {}) }),
  })
  const subDiretorio = resolve(params.cacheDir, createHash("sha256").update(identityKey).digest("hex").slice(0, 16))
  await adapters.ensureDir(subDiretorio)
  const metrics: ProgramaGovernoMultipassagemMetrics = {
    planejador: PROGRAMA_GOVERNO_GOV_MULTIPASSAGEM_PLANNER_VERSION,
    limiteBytes,
    passagens: planos.length,
    passagensCacheadas: 0,
    chamadasGeracao: 0,
    retriesPassagem: 0,
    chamadasSintese: 0,
    retriesSintese: 0,
    fingerprint: sha256(JSON.stringify({
      passagens: calcularFingerprintProgramaGovernoPassagens(planos, {
        name: modelos.generator.name,
        version: modelos.generator.version,
        promptVersion: params.promptVersion,
      }),
      repairGuidance: params.repairGuidance ?? null,
      repairFactsLimit: params.repairFactsLimit ?? null,
    })),
    promptVersoes: {
      fatosPassagem: `${params.promptVersion}/fatos-passagem`,
      sinteseFatos: `${params.promptVersion}/sintese-fatos`,
    },
  }

  async function chaveCacheDaPassagem(plano: ReturnType<typeof planejarProgramaGovernoPassagens>[number]): Promise<{ chave: string; caminho: string }> {
    const hashPassagem = calcularFingerprintProgramaGovernoPassagens([plano])
    const chave = sha256(JSON.stringify({
      identityKey,
      nomeUrna: params.nomeUrna,
      partido: params.partido,
      documentosHashes: params.documentosHashes,
      modelo: { name: modelos.generator.name, version: modelos.generator.version },
      promptVersion: params.promptVersion,
      repairGuidance: params.repairGuidance ?? null,
      repairFactsLimit: params.repairFactsLimit ?? null,
      planejador: PROGRAMA_GOVERNO_GOV_MULTIPASSAGEM_PLANNER_VERSION,
      limiteBytes,
      indice: plano.indice,
      hashPassagem,
    }))
    return { chave, caminho: resolve(subDiretorio, `${chave}.json`) }
  }

  const porPassagem = new Map<number, ProgramaGovernoFato[]>()
  await mapearComConcorrencia(planos, PROGRAMA_GOVERNO_PASSAGENS_CONCORRENCIA, async (plano) => {
    const { chave, caminho } = await chaveCacheDaPassagem(plano)
    try {
      const cru = JSON.parse(await adapters.readText(caminho)) as unknown
      if (
        cru && typeof cru === "object"
        && (cru as Record<string, unknown>).chaveCache === chave
        && (cru as Record<string, unknown>).promptVersion === metrics.promptVersoes.fatosPassagem
        && Array.isArray((cru as Record<string, unknown>).fatos)
        && ((cru as Record<string, unknown>).fatos as unknown[]).length > 0
      ) {
        const fatosValidados = validarFatosCacheadosProgramaGoverno(
          (cru as { fatos: ProgramaGovernoFato[] }).fatos,
          plano.documentos,
        )
        if (fatosValidados) {
          porPassagem.set(plano.indice, fatosValidados)
          metrics.passagensCacheadas += 1
          return
        }
      }
    } catch {
      // cache miss ou corrompido: reexecuta apenas esta passagem
    }
    const resultado = await extrairFatos.call(modelos, {
      identityKey,
      documentos: plano.documentos,
      ...(params.repairGuidance ? { repairGuidance: params.repairGuidance } : {}),
    })
    if (resultado.metadata.promptVersion !== metrics.promptVersoes.fatosPassagem) {
      throw new Error(`multipassagem: prompt de fatos stale ${resultado.metadata.promptVersion}`)
    }
    metrics.chamadasGeracao += resultado.metadata.attempts
    if (resultado.metadata.attempts > 1) metrics.retriesPassagem += 1
    if (resultado.output.length === 0) {
      throw new Error(`multipassagem: passagem ${plano.indice + 1}/${planos.length} nao produziu fato literal`)
    }
    porPassagem.set(plano.indice, resultado.output)
    const registro = `${JSON.stringify({
      chaveCache: chave,
      identityKey,
      indice: plano.indice,
      hashPassagem: calcularFingerprintProgramaGovernoPassagens([plano]),
      modelo: `${modelos.generator.name}@${modelos.generator.version}`,
      promptVersion: resultado.metadata.promptVersion,
      fatos: resultado.output,
    }, null, 2)}\n`
    const temporario = `${caminho}.tmp-${process.pid}`
    await adapters.writeText(temporario, registro)
    await adapters.rename(temporario, caminho)
  })

  const fatosLiterais = filtrarFatosLiterais(
    coletarFatosProgramaGovernoPassagens(porPassagem, planos),
    documentosEntrada,
  )
  if (fatosLiterais.length === 0) {
    throw new Error(`multipassagem: nenhum fato literal sobreviveu das ${planos.length} passagem(oes)`)
  }
  const fatosParaSintese = params.repairFactsLimit
    ? selecionarFatosParaSinteseDeReparo(fatosLiterais, params.repairFactsLimit)
    : fatosLiterais
  const sintese = await sintetizarDeFatos.call(modelos, {
    identityKey,
    fatos: fatosParaSintese,
    ...(params.repairGuidance ? { repairGuidance: params.repairGuidance } : {}),
    ...(params.repairFactsLimit ? { requireDistinctSentenceFacts: true } : {}),
  })
  if (sintese.metadata.promptVersion !== metrics.promptVersoes.sinteseFatos) {
    throw new Error(`multipassagem: prompt de sintese stale ${sintese.metadata.promptVersion}`)
  }
  metrics.chamadasSintese += sintese.metadata.attempts
  if (sintese.metadata.attempts > 1) metrics.retriesSintese += 1
  return {
    output: sintese.output,
    metrics,
    metadata: { promptVersion: sintese.metadata.promptVersion },
  }
}

function assertJudgeCoverage(expected: readonly ProgramaGovernoJudgeItem[], actual: Awaited<ReturnType<ProgramaGovernoModelAdapters["judgeClaims"]>>["output"]): void {
  if (actual.avaliacoes.length !== expected.length) throw new Error("judge: cobertura incompleta das seis dimensoes")
  const byId = new Map(actual.avaliacoes.map((item) => [item.id, item]))
  if (byId.size !== actual.avaliacoes.length) throw new Error("judge: id duplicado")
  for (const item of expected) {
    const evaluated = byId.get(item.id)
    if (!evaluated) throw new Error(`judge: id ausente ${item.id}`)
    for (const key of ["claimId", "dimension", "identityKey", "claimTexto"] as const) {
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

async function extrairDocumentoComCache(
  document: ProgramaGovernoGovInventoryDocument,
  bytes: Buffer,
  adapters: ProgramaGovernoGovIngestionAdapters,
  extractCacheDir: string | undefined,
): Promise<{ extracao: ProgramaGovernoExtracaoRastreavel; cacheHit: boolean }> {
  if (!extractCacheDir) {
    return { extracao: await adapters.extractPdf(bytes, document.arquivoNome), cacheHit: false }
  }
  const chaveCache = `${document.sha256}:${PROGRAMA_GOVERNO_EXTRACTION_METHOD}:${PROGRAMA_GOVERNO_EXTRACTION_VERSION}`
  const caminhoCache = resolve(extractCacheDir, `${sha256(chaveCache)}.json`)
  try {
    const cru = JSON.parse(await adapters.readText(caminhoCache)) as unknown
    const valido = !!cru
      && typeof cru === "object"
      && (cru as Record<string, unknown>).sourceSha256 === document.sha256
      && (cru as Record<string, unknown>).paginas === document.paginas
      && Array.isArray((cru as Record<string, unknown>).pageMap)
      && ((cru as Record<string, unknown>).pageMap as unknown[]).length === document.paginas
      && Array.isArray((cru as Record<string, unknown>).secoes)
      && typeof (cru as Record<string, unknown>).extractedTextSha256 === "string"
    if (valido) return { extracao: cru as ProgramaGovernoExtracaoRastreavel, cacheHit: true }
  } catch {
    // cache ausente ou corrompido: extrai e grava uma unica vez
  }
  const extracao = await adapters.extractPdf(bytes, document.arquivoNome)
  await adapters.ensureDir(extractCacheDir)
  const temporario = `${caminhoCache}.tmp-${process.pid}`
  await adapters.writeText(temporario, JSON.stringify(extracao))
  await adapters.rename(temporario, caminhoCache)
  return { extracao, cacheHit: false }
}

async function extractDocuments(
  candidate: ProgramaGovernoGovInventoryCandidate,
  inventory: ProgramaGovernoGovInventory,
  documents: readonly ProgramaGovernoGovInventoryDocument[],
  packageInfo: ProgramaGovernoGovInventoryPackage,
  archiveDir: string,
  archiveBytes: Buffer,
  adapters: ProgramaGovernoGovIngestionAdapters,
  extractCacheDir?: string,
): Promise<{ documentos: ProgramaGovernoDocumento[]; cacheHits: number }> {
  const archivePath = resolve(archiveDir, packageInfo.arquivoNome)
  const extracted: ProgramaGovernoDocumento[] = []
  let cacheHits = 0
  const identity = sourceFor(candidate, inventory, packageInfo, documents[0])
  for (const [index, document] of documents.entries()) {
    const bytes = await adapters.extractArchiveEntry(archivePath, document.arquivoNoPacote)
    if (bytes.length !== document.bytes || sha256(bytes) !== document.sha256) {
      throw new Error(`${document.id}: PDF diverge em bytes ou hash`)
    }
    const { extracao, cacheHit } = await extrairDocumentoComCache(document, bytes, adapters, extractCacheDir)
    if (cacheHit) cacheHits += 1
    assertPageSafeExtraction(document, extracao)
    const value = {
      documentoId: document.id,
      fonte: documentSource(document, inventory),
      extracao,
    }
    assertProgramaGovernoDocumento(value, identity, index + 1, `documentos[${index}]`)
    extracted.push(value)
  }
  return { documentos: extracted, cacheHits }
}

async function gravarFase(
  adapters: ProgramaGovernoGovIngestionAdapters,
  faseDir: string | undefined,
  candidate: ProgramaGovernoGovInventoryCandidate,
  fase: "extracao.concluida" | "gerador.iniciado" | "gerador.concluido" | "julgamento.iniciado",
  conteudo: Record<string, unknown> = {},
): Promise<void> {
  if (!faseDir) return
  const destino = resolve(faseDir, `${candidate.uf}-${candidate.sqCandidato}.${fase}.json`)
  const registro = JSON.stringify({ identityKey: candidate.chave, fase, em: adapters.now(), ...conteudo })
  await adapters.ensureDir(faseDir)
  const temporario = `${destino}.tmp-${process.pid}`
  await adapters.writeText(temporario, registro)
  await adapters.rename(temporario, destino)
}

const GENERATOR_CHECKPOINT_VERSION = 1 as const
const GENERATOR_CONTRACT_VERSION = "programa-governo-governadores-generator-contract-v1" as const

type ProgramaGovernoGeneratorCheckpoint = {
  version: typeof GENERATOR_CHECKPOINT_VERSION
  kind: "programa-governo-generator-checkpoint"
  identityKey: string
  identity: Pick<ProgramaGovernoGovInventoryCandidate, "ano" | "cargo" | "uf" | "sqCandidato" | "slug" | "nomeUrna" | "partido">
  source: ProgramaGovernoFonte
  documents: ProgramaGovernoDocumento[]
  documentHashes: Array<{ documentoId: string; sourceSha256: string; extractedTextSha256: string; paginas: number }>
  generatorInputSha256: string
  summary: ProgramaGovernoResumo
  summarySha256: string
  generation: {
    name: string
    version: string
    promptVersion: string
    model: string
    generatedAt: string
    attempts: number
  }
  contract: {
    version: typeof GENERATOR_CONTRACT_VERSION
    promptVersion: string
    instructionsSha256: string
    schemaSha256: string
    modelConfigSha256: string
    evidenceSha256: string
  }
  createdAt: string
}

function jsonSha256(value: unknown): string {
  return sha256(JSON.stringify(value))
}

function generatorContract(models: ProgramaGovernoModelAdapters, promptVersion: string, summary: ProgramaGovernoResumo) {
  return {
    version: GENERATOR_CONTRACT_VERSION,
    promptVersion,
    instructionsSha256: jsonSha256(PROGRAMA_GOVERNO_GOV_GENERATOR_INSTRUCTIONS),
    schemaSha256: jsonSha256(PROGRAMA_GOVERNO_GOV_GENERATOR_SCHEMA),
    modelConfigSha256: jsonSha256(models.generator),
    evidenceSha256: jsonSha256([
      ...summary.frases.flatMap(({ evidencias }) => evidencias),
      ...summary.temas.flatMap(({ evidencias }) => evidencias),
    ]),
  } as const
}

function documentHashes(documents: readonly ProgramaGovernoDocumento[]) {
  return documents.map((document) => ({
    documentoId: document.documentoId,
    sourceSha256: document.extracao.sourceSha256,
    extractedTextSha256: document.extracao.extractedTextSha256,
    paginas: document.extracao.paginas,
  }))
}

function generatorInputSha256(
  input: ProgramaGovernoGeneratorInput,
  strategy: { forceFacts: boolean; repairFactsLimit?: number; multipassagemLimiteBytes: number; multipassagem: boolean },
): string {
  return jsonSha256({
    input,
    strategy: {
      forceFacts: strategy.forceFacts,
      repairFactsLimit: strategy.repairFactsLimit ?? null,
      multipassagemLimiteBytes: strategy.multipassagemLimiteBytes,
      multipassagem: strategy.multipassagem,
    },
  })
}

function checkpointPath(pathValue: string, candidate: ProgramaGovernoGovInventoryCandidate): string {
  return pathValue.endsWith(".json")
    ? resolve(pathValue)
    : resolve(pathValue, `${candidate.uf}-${candidate.sqCandidato}.generator.json`)
}

async function writeGeneratorCheckpoint(
  adapters: ProgramaGovernoGovIngestionAdapters,
  destination: string,
  checkpoint: ProgramaGovernoGeneratorCheckpoint,
): Promise<void> {
  await adapters.ensureDir(resolve(destination, ".."))
  const temporary = `${destination}.tmp-${process.pid}`
  await adapters.writeText(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`)
  await adapters.rename(temporary, destination)
}

async function readGeneratorCheckpoint(
  adapters: ProgramaGovernoGovIngestionAdapters,
  destination: string,
): Promise<ProgramaGovernoGeneratorCheckpoint> {
  const value = JSON.parse(await adapters.readText(destination)) as Partial<ProgramaGovernoGeneratorCheckpoint>
  if (value.version !== GENERATOR_CHECKPOINT_VERSION || value.kind !== "programa-governo-generator-checkpoint") {
    throw new Error("generator checkpoint: versao ou tipo invalido")
  }
  if (!value.identityKey || !value.source || !Array.isArray(value.documents) || !Array.isArray(value.documentHashes) || !value.generatorInputSha256 || !value.summary || !value.summarySha256 || !value.generation || !value.contract) {
    throw new Error("generator checkpoint: campos obrigatorios ausentes")
  }
  return value as ProgramaGovernoGeneratorCheckpoint
}

function assertGeneratorCheckpointCurrent(
  checkpoint: ProgramaGovernoGeneratorCheckpoint,
  candidate: ProgramaGovernoGovInventoryCandidate,
  source: ProgramaGovernoFonte,
  documents: readonly ProgramaGovernoDocumento[],
  models: ProgramaGovernoModelAdapters,
  expectedPromptVersion: string,
  expectedGeneratorInputSha256: string,
): void {
  const identity = {
    ano: candidate.ano,
    cargo: candidate.cargo,
    uf: candidate.uf,
    sqCandidato: candidate.sqCandidato,
    slug: candidate.slug,
    nomeUrna: candidate.nomeUrna,
    partido: candidate.partido,
  }
  if (checkpoint.identityKey !== candidate.chave || JSON.stringify(checkpoint.identity) !== JSON.stringify(identity)) {
    throw new Error("generator checkpoint: identidade divergente")
  }
  if (checkpoint.generatorInputSha256 !== expectedGeneratorInputSha256) {
    throw new Error("generator checkpoint: input efetivo divergente")
  }
  if (checkpoint.summarySha256 !== jsonSha256(checkpoint.summary)) {
    throw new Error("generator checkpoint: resumo stale")
  }
  if (JSON.stringify(checkpoint.source) !== JSON.stringify(source)) throw new Error("generator checkpoint: fonte divergente")
  if (JSON.stringify(checkpoint.documentHashes) !== JSON.stringify(documentHashes(documents))) {
    throw new Error("generator checkpoint: documentos ou hashes divergentes")
  }
  if (checkpoint.documents.length !== documents.length || checkpoint.documents.some((document, index) => JSON.stringify(document) !== JSON.stringify(documents[index]))) {
    throw new Error("generator checkpoint: evidencia documental divergente")
  }
  if (checkpoint.generation.promptVersion !== expectedPromptVersion) throw new Error("generator checkpoint: prompt stale")
  if (
    checkpoint.generation.name !== models.generator.name
    || checkpoint.generation.version !== models.generator.version
    || checkpoint.generation.model !== `${models.generator.name}@${models.generator.version}`
  ) {
    throw new Error("generator checkpoint: modelo divergente")
  }
  const contract = generatorContract(models, expectedPromptVersion, checkpoint.summary)
  if (
    checkpoint.contract.version !== GENERATOR_CONTRACT_VERSION
    || checkpoint.contract.promptVersion !== contract.promptVersion
    || checkpoint.contract.instructionsSha256 !== contract.instructionsSha256
    || checkpoint.contract.schemaSha256 !== contract.schemaSha256
    || checkpoint.contract.modelConfigSha256 !== contract.modelConfigSha256
    || checkpoint.contract.evidenceSha256 !== contract.evidenceSha256
  ) {
    throw new Error("generator checkpoint: contrato ou evidencias stale")
  }
  assertLiteralEvidence(checkpoint.summary, documents)
  const record = {
    version: 1,
    estado: "em_revisao",
    fonte: source,
    documentos: [...documents],
    resumo: checkpoint.summary,
    geracao: {
      promptVersion: checkpoint.generation.promptVersion,
      model: checkpoint.generation.model,
      generatedAt: checkpoint.generation.generatedAt,
    },
  } satisfies ProgramaGovernoRegistro
  assertProgramaGovernoRegistro(record)
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
  passagensCacheDir: string,
  multipassagemLimiteBytes: number,
  forceFacts: boolean,
  repairGuidance?: string,
  repairFactsLimit?: number,
  faseDir?: string,
  extractCacheDir?: string,
  generatorOnly = false,
  generatorCheckpointDir?: string,
  resumeGeneratorCheckpoint?: string,
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
  let cacheHits = 0
  try {
    const archiveBytes = await loadArchive()
    const resultadoExtracao = await extractDocuments(candidate, inventory, documents, packageInfo, archiveDir, archiveBytes, adapters, extractCacheDir)
    extracted = resultadoExtracao.documentos
    cacheHits = resultadoExtracao.cacheHits
    await gravarFase(adapters, faseDir, candidate, "extracao.concluida", {
      documentos: documents.map(({ id }) => id),
      cacheHits,
      total: documents.length,
    })
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
    const entradaCompleta = generatorInput(candidate.chave, extracted, repairGuidance)
    const multipassagem = forceFacts || envelopeExcedeLimite(
      PROGRAMA_GOVERNO_GOV_GENERATOR_INSTRUCTIONS,
      PROGRAMA_GOVERNO_GOV_GENERATOR_SCHEMA,
      entradaCompleta,
      multipassagemLimiteBytes,
    )
    const inputSha256 = generatorInputSha256(entradaCompleta, {
      forceFacts,
      repairFactsLimit,
      multipassagemLimiteBytes,
      multipassagem,
    })
    let generated: { output: ProgramaGovernoResumo; metadata: { name: string; version: string; promptVersion: string; attempts: number } }
    let metricasMultipassagem: ProgramaGovernoMultipassagemMetrics | undefined
    let checkpointGeneratedAt: string | undefined
    if (resumeGeneratorCheckpoint) {
      const checkpoint = await readGeneratorCheckpoint(adapters, checkpointPath(resumeGeneratorCheckpoint, candidate))
      assertGeneratorCheckpointCurrent(checkpoint, candidate, source, extracted, models, expectedPrompts.generatorPromptVersion, inputSha256)
      generated = {
        output: checkpoint.summary,
        metadata: {
          name: checkpoint.generation.name,
          version: checkpoint.generation.version,
          promptVersion: checkpoint.generation.promptVersion,
          attempts: checkpoint.generation.attempts,
        },
      }
      checkpointGeneratedAt = checkpoint.generation.generatedAt
    } else {
      await gravarFase(adapters, faseDir, candidate, "gerador.iniciado")
      if (multipassagem) {
        const multipass = await gerarResumoProgramaGovernoMultipassagem({
          identityKey: candidate.chave,
          nomeUrna: candidate.nomeUrna,
          partido: candidate.partido,
          documentosHashes: documents.map(({ sha256 }) => sha256),
          extracted,
          promptVersion: expectedPrompts.generatorPromptVersion,
          cacheDir: passagensCacheDir,
          modelos: models,
          adapters,
          limiteBytes: multipassagemLimiteBytes,
          repairGuidance,
          repairFactsLimit,
        })
        generated = {
          output: multipass.output,
          metadata: {
            name: models.generator.name,
            version: models.generator.version,
            promptVersion: expectedPrompts.generatorPromptVersion,
            attempts: Math.min(2, multipass.metrics.retriesPassagem + multipass.metrics.retriesSintese + 1),
          },
        }
        metricasMultipassagem = multipass.metrics
      } else {
        generated = await models.generate(entradaCompleta)
        if (generated.metadata.promptVersion !== expectedPrompts.generatorPromptVersion) {
          throw new Error(`generator prompt stale: ${generated.metadata.promptVersion}`)
        }
      }
    }
    assertLiteralEvidence(generated.output, extracted)
    const geracao = {
      promptVersion: generated.metadata.promptVersion,
      model: `${generated.metadata.name}@${generated.metadata.version}`,
      generatedAt: checkpointGeneratedAt ?? adapters.now(),
    }
    const draft: ProgramaGovernoRegistro = {
      version: 1,
      estado: "em_revisao",
      fonte: source,
      documentos: extracted,
      resumo: generated.output,
      geracao,
    }
    assertProgramaGovernoRegistro(draft)
    if (generatorOnly) {
      if (!generatorCheckpointDir) throw new Error("generator-only exige diretorio de checkpoint privado")
      const checkpoint: ProgramaGovernoGeneratorCheckpoint = {
        version: GENERATOR_CHECKPOINT_VERSION,
        kind: "programa-governo-generator-checkpoint",
        identityKey: candidate.chave,
        identity: {
          ano: candidate.ano,
          cargo: candidate.cargo,
          uf: candidate.uf,
          sqCandidato: candidate.sqCandidato,
          slug: candidate.slug,
          nomeUrna: candidate.nomeUrna,
          partido: candidate.partido,
        },
        source,
        documents: extracted,
        documentHashes: documentHashes(extracted),
        generatorInputSha256: inputSha256,
        summary: generated.output,
        summarySha256: jsonSha256(generated.output),
        generation: {
          name: generated.metadata.name,
          version: generated.metadata.version,
          promptVersion: generated.metadata.promptVersion,
          model: geracao.model,
          generatedAt: geracao.generatedAt,
          attempts: generated.metadata.attempts,
        },
        contract: generatorContract(models, expectedPrompts.generatorPromptVersion, generated.output),
        createdAt: adapters.now(),
      }
      await writeGeneratorCheckpoint(adapters, checkpointPath(generatorCheckpointDir, candidate), checkpoint)
      await gravarFase(adapters, faseDir, candidate, "gerador.concluido", {
        checkpoint: checkpointPath(generatorCheckpointDir, candidate),
        multipassagem: metricasMultipassagem ? metricasMultipassagem.passagens > 1 : false,
        passagens: metricasMultipassagem?.passagens ?? 1,
        chamadasGeracao: metricasMultipassagem
          ? metricasMultipassagem.chamadasGeracao + metricasMultipassagem.chamadasSintese
          : generated.metadata.attempts,
      })
      return {
        version: 1,
        estado: "em_revisao",
        fonte: source,
        documentos: extracted,
        resumo: generated.output,
        geracao,
        ingestao: {
          ...baseIngestion(candidate, inventory, "modelos", "generator-only: julgamento pendente"),
          modelos: {
            generator: generated.metadata,
            ...(metricasMultipassagem ? { geracaoMultipassagem: metricasMultipassagem } : {}),
          },
          eval: { completo: false, blockers: 1, dimensoes: PROGRAMA_GOVERNO_GOV_EVAL_DIMENSIONS },
        },
      }
    }
    if (!resumeGeneratorCheckpoint) {
      await gravarFase(adapters, faseDir, candidate, "gerador.concluido", {
        multipassagem: metricasMultipassagem ? metricasMultipassagem.passagens > 1 : false,
        passagens: metricasMultipassagem?.passagens ?? 1,
        chamadasGeracao: metricasMultipassagem
          ? metricasMultipassagem.chamadasGeracao + metricasMultipassagem.chamadasSintese
          : generated.metadata.attempts,
      })
    }
    const claims = judgeItems(candidate.chave, generated.output)
    await gravarFase(adapters, faseDir, candidate, "julgamento.iniciado")
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
        modelos: {
          generator: generated.metadata,
          judge: judged.metadata,
          ...(metricasMultipassagem ? { geracaoMultipassagem: metricasMultipassagem } : {}),
        },
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
  let candidates = inventory.candidaturas
    .filter(({ uf }) => options.ufs.includes(uf))
    .sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"))
  if (options.sqCandidato !== undefined) {
    const achados = candidates.filter(({ sqCandidato }) => sqCandidato === options.sqCandidato)
    if (achados.length !== 1) {
      throw new Error(`--sq-candidato ${options.sqCandidato}: ${achados.length} correspondencia(s) nas UFs solicitadas; esperado exatamente 1`)
    }
    candidates = achados
  }
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
      options.cachePassagensDir ? resolve(options.cachePassagensDir) : resolve(options.outputDir, ".cache-passagens"),
      options.multipassagemLimiteBytes ?? PROGRAMA_GOVERNO_GOV_MULTIPASSAGEM_LIMITE_BYTES,
      options.forceFacts === true,
      options.repairGuidance,
      options.repairFactsLimit,
      options.faseDir ? resolve(options.faseDir) : undefined,
      options.extractCacheDir ? resolve(options.extractCacheDir) : undefined,
      options.generatorOnly === true,
      options.generatorCheckpointDir
        ? resolve(options.generatorCheckpointDir)
        : options.generatorOnly === true
          ? resolve(options.outputDir, ".generator-checkpoints")
          : undefined,
      options.resumeGeneratorCheckpoint ? resolve(options.resumeGeneratorCheckpoint) : undefined,
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
  const geracaoMultipassagem = records.reduce((acumulado, record) => {
    const metricas = record.ingestao.modelos?.geracaoMultipassagem
    if (!metricas) return acumulado
    return {
      candidaturasComMultipassagem: acumulado.candidaturasComMultipassagem + 1,
      passagens: acumulado.passagens + metricas.passagens,
      passagensCacheadas: acumulado.passagensCacheadas + metricas.passagensCacheadas,
      chamadasGeracao: acumulado.chamadasGeracao + metricas.chamadasGeracao,
      retriesPassagem: acumulado.retriesPassagem + metricas.retriesPassagem,
      chamadasSintese: acumulado.chamadasSintese + metricas.chamadasSintese,
      retriesSintese: acumulado.retriesSintese + metricas.retriesSintese,
    }
  }, {
    candidaturasComMultipassagem: 0,
    passagens: 0,
    passagensCacheadas: 0,
    chamadasGeracao: 0,
    retriesPassagem: 0,
    chamadasSintese: 0,
    retriesSintese: 0,
  })
  const result = { ufs: [...options.ufs], records, counts, blockers }
  await adapters.writeText(
    resolve(options.outputDir, "manifesto-ingestao.json"),
    `${JSON.stringify({
      ufs: result.ufs,
      counts,
      blockers,
      nodeVersion: process.versions.node,
      geracaoMultipassagem,
    }, null, 2)}\n`,
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
  if (options.planOnly) {
    const adapters = { ...defaultAdapters, ...dependencies.adapters }
    const inventory = parseInventory(await adapters.readText(options.inventoryPath))
    const itens = planejarFilaProgramaGovernoGovernadores(options, inventory)
    for (const item of itens) console.log(JSON.stringify(item))
    return { ufs: options.ufs, records: [], counts: { em_revisao: 0, perfil_local_ausente: 0, sem_documento_oficial: 0, falha_de_extracao: 0 }, blockers: [] }
  }
  let models = dependencies.models
  if (models === undefined && options.modelsConfigPath) {
    const adapters = { ...defaultAdapters, ...dependencies.adapters }
    const config = JSON.parse(await adapters.readText(options.modelsConfigPath)) as ProgramaGovernoModelsConfig
    models = createProgramaGovernoModelAdapters(config)
  }
  const result = await ingestProgramaGovernoGovernadores(options, { ...dependencies, models: models ?? null })
  if (result.blockers.length > 0 && options.generatorOnly !== true) {
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
