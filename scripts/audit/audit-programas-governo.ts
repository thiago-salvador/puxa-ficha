import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  assertProgramaGovernoFonte,
  assertProgramaGovernoIdentidadeCorresponde,
  assertProgramaGovernoRegistro,
  normalizarProgramaGovernoEstado,
  type ProgramaGovernoFonte,
  type ProgramaGovernoRegistro,
} from "../../src/lib/programa-governo"
import {
  assertProgramaGovernoModelSeparation,
  assertLiteralEvidence,
  assessProgramaGovernoJudgeVerdicts,
  buildProgramaGovernoJudgeClaims,
  assertProgramaGovernoDocumentSetMatchesSource,
  programaGovernoDocumentos,
  programaGovernoExpectedPromptVersions,
  programaGovernoIdentityKey,
  type ProgramaGovernoPipelineRecord,
  type ProgramaGovernoStageSource,
} from "../programas-governo-stage"
import {
  PROGRAMA_GOVERNO_EXTRACTION_METHOD,
  PROGRAMA_GOVERNO_EXTRACTION_VERSION,
  type ProgramaGovernoExtracaoRastreavel,
} from "../lib/programas-governo-extracao"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const LEGACY_SOURCES_PATH = path.join(ROOT, "scripts/data/programas-governo-presidencia-2026-fontes.json")
const LEGACY_RECORDS_DIR = path.join(ROOT, "src/data/programas-governo/presidencia-2026")

export type ProgramaGovernoAuditResult = {
  officialCohort: number
  resolved: number
  absent: number
  extractionFailed: number
  missingProfile: number
  reviewPending: number
  approved: number
  pages: number
  sections: number
  claims: number
  evalItems: number
}

export type ProgramaGovernoAuditOptions = {
  sourcesPath?: string
  recordsDir?: string
  expected?: Partial<Pick<ProgramaGovernoFonte, "ano" | "cargo" | "uf">>
  expectNoApproved?: boolean
  expectAllApproved?: boolean
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T
}

function sourceArray(value: unknown): ProgramaGovernoStageSource[] {
  if (Array.isArray(value)) return value as ProgramaGovernoStageSource[]
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>
    if (Array.isArray(object.fontes)) return object.fontes as ProgramaGovernoStageSource[]
    if (Array.isArray(object.candidatos)) return object.candidatos as ProgramaGovernoStageSource[]
  }
  throw new Error("registro de fontes deve ser array ou conter fontes/candidatos")
}

function assertAuditScope(
  sources: readonly ProgramaGovernoStageSource[],
  expected?: ProgramaGovernoAuditOptions["expected"],
): void {
  assert(sources.length > 0, "coorte oficial vazia")
  const first = sources[0]
  const scope = `${first.ano}:${first.cargo}:${first.uf}`
  const identities = new Set<string>()
  for (const [index, source] of sources.entries()) {
    assertProgramaGovernoFonte(source, `fontes[${index}]`)
    assert(`${source.ano}:${source.cargo}:${source.uf}` === scope, `mistura de escopo em fontes[${index}]`)
    const key = programaGovernoIdentityKey(source)
    assert(!identities.has(key), `identidade duplicada: ${key}`)
    identities.add(key)
  }
  if (expected?.ano !== undefined) assert(first.ano === expected.ano, `ano=${first.ano}; esperado=${expected.ano}`)
  if (expected?.cargo !== undefined) assert(first.cargo === expected.cargo, `cargo=${first.cargo}; esperado=${expected.cargo}`)
  if (expected?.uf !== undefined) assert(first.uf === expected.uf, `uf=${first.uf}; esperado=${expected.uf}`)
}

function auditExtractionMetadata(
  slug: string,
  documentId: string,
  extractionValue: ProgramaGovernoPipelineRecord["extracao"],
  allowLegacy: boolean,
): void {
  if (!extractionValue) throw new Error(`${slug}:${documentId}: extracao ausente`)
  const extraction = extractionValue as ProgramaGovernoExtracaoRastreavel
  if (allowLegacy && !extraction.extractionVersion) return
  assert(extraction.extractionVersion === PROGRAMA_GOVERNO_EXTRACTION_VERSION, `${slug}:${documentId}: versao de extracao inesperada`)
  assert(extraction.method === PROGRAMA_GOVERNO_EXTRACTION_METHOD, `${slug}:${documentId}: metodo de extracao inesperado`)
  assert(Array.isArray(extraction.pageMap) && extraction.pageMap.length === extraction.paginas, `${slug}:${documentId}: pageMap incompleto`)
  const sectionsByPage = new Map(extraction.secoes.map((section) => [section.paginaInicial, section]))
  for (let page = 1; page <= extraction.paginas; page += 1) {
    const mapped = extraction.pageMap[page - 1]
    const section = sectionsByPage.get(page)
    assert(mapped?.pagina === page && section, `${slug}:${documentId}: pagina ${page} fora do mapa`)
    assert(mapped.origem === section.origem, `${slug}:${documentId}: origem divergente na pagina ${page}`)
    assert(mapped.textSha256 === sha256(section.conteudo), `${slug}:${documentId}: hash divergente na pagina ${page}`)
  }
}

export function auditProgramaGovernoRecordSet(
  sources: readonly ProgramaGovernoStageSource[],
  records: readonly ProgramaGovernoPipelineRecord[],
  options: Omit<ProgramaGovernoAuditOptions, "sourcesPath" | "recordsDir"> = {},
): ProgramaGovernoAuditResult {
  assertAuditScope(sources, options.expected)
  const expectedBySlug = new Map(sources.filter((source) => source.slug).map((source) => [source.slug!, source]))
  assert(records.length === expectedBySlug.size, `registros=${records.length}; perfis resolvidos=${expectedBySlug.size}`)
  const seenIdentities = new Set<string>()
  const seenSlugs = new Set<string>()
  let pages = 0
  let sections = 0
  let claims = 0
  let evalItems = 0

  for (const record of records) {
    const slug = record.fonte.slug
    assert(slug, "registro com conteudo nao pode ter slug nulo")
    const expected = expectedBySlug.get(slug)
    assert(expected, `${slug}: arquivo extra ou slug fora da coorte`)
    assertProgramaGovernoIdentidadeCorresponde(record.fonte, expected, `${slug}.fonte`)
    const identity = programaGovernoIdentityKey(record.fonte)
    assert(!seenIdentities.has(identity), `${slug}: identidade duplicada`)
    assert(!seenSlugs.has(slug), `${slug}: slug duplicado`)
    seenIdentities.add(identity)
    seenSlugs.add(slug)

    const state = normalizarProgramaGovernoEstado(record.estado as ProgramaGovernoRegistro["estado"])
    if (state === "documento_anunciado" || state === "sem_documento_oficial" || state === "falha_de_extracao" || state === "perfil_local_ausente") {
      assertProgramaGovernoRegistro(record)
      continue
    }
    assertProgramaGovernoDocumentSetMatchesSource(expected, record)
    const ingestion = record as ProgramaGovernoPipelineRecord & {
      ingestao?: { etapa?: string; erro?: string | null; eval?: { completo?: boolean; blockers?: number } | null }
    }
    if (ingestion.ingestao?.etapa === "modelos" && ingestion.ingestao.erro) {
      throw new Error(`${slug}: ingestao bloqueada em modelos: ${ingestion.ingestao.erro}`)
    }
    assertProgramaGovernoRegistro(record)
    assert(record.resumo && record.geracao && record.julgamento, `${slug}: conteudo editorial incompleto`)
    assertProgramaGovernoModelSeparation(record)
    assertLiteralEvidence(record)
    const documents = programaGovernoDocumentos(record)
    const legacyPresidency = record.fonte.cargo === "PRESIDENTE" && record.fonte.uf === "BR" && !record.documentos
    for (const document of documents) {
      auditExtractionMetadata(slug, document.documentoId, document.extracao, legacyPresidency)
      pages += document.extracao.paginas
      sections += document.extracao.secoes.length
    }
    const rawClaims = record.resumo.frases.length + record.resumo.temas.length
    claims += rawClaims
    const presidency = record.fonte.cargo === "PRESIDENTE" && record.fonte.uf === "BR"
    const judgmentPromptVersion = (record.julgamento as NonNullable<ProgramaGovernoPipelineRecord["julgamento"]>).promptVersion
    if (presidency && !judgmentPromptVersion) {
      assert(record.julgamento.verdicts.length === rawClaims, `${slug}: cobertura incompleta do judge legado`)
      assert(record.julgamento.verdicts.every((item) => item.verdict === "yes"), `${slug}: judge legado bloqueou claim`)
      evalItems += record.julgamento.verdicts.length
    } else {
      const expectedPrompts = programaGovernoExpectedPromptVersions(record.fonte)
      assert(record.geracao.promptVersion === expectedPrompts.generatorPromptVersion, `${slug}: prompt do gerador inesperado`)
      assert(judgmentPromptVersion === expectedPrompts.judgePromptVersion, `${slug}: rubric do judge inesperada`)
      const expectedClaims = buildProgramaGovernoJudgeClaims([record])
      const assessment = assessProgramaGovernoJudgeVerdicts(expectedClaims, record.julgamento.verdicts)
      assert(assessment.eligible, `${slug}: Eval tem ${assessment.blockers.length} bloqueio(s)`)
      assert(ingestion.ingestao?.eval?.completo !== false, `${slug}: Eval marcado como incompleto`)
      evalItems += expectedClaims.length
    }
  }

  assert(seenSlugs.size === expectedBySlug.size, "cobertura de perfis resolvidos incompleta")
  const stateCount = (state: ReturnType<typeof normalizarProgramaGovernoEstado>) => records.filter((record) => normalizarProgramaGovernoEstado(record.estado as ProgramaGovernoRegistro["estado"]) === state).length
  const result = {
    officialCohort: sources.length,
    resolved: records.length,
    absent: stateCount("sem_documento_oficial"),
    extractionFailed: stateCount("falha_de_extracao"),
    missingProfile: stateCount("perfil_local_ausente") + sources.filter((source) => source.slug === null).length,
    reviewPending: stateCount("em_revisao") + stateCount("documento_anunciado"),
    approved: stateCount("aprovado"),
    pages,
    sections,
    claims,
    evalItems,
  }
  if (options.expectNoApproved) assert(result.approved === 0, `aprovados=${result.approved}; esperado=0`)
  if (options.expectAllApproved) {
    assert(result.reviewPending === 0, `pendentes de revisao=${result.reviewPending}; esperado=0`)
    assert(result.approved === records.length, `aprovados=${result.approved}; esperado=${records.length}`)
  }
  return result
}

export async function auditProgramasGoverno(
  options: ProgramaGovernoAuditOptions = {},
): Promise<ProgramaGovernoAuditResult> {
  const sourcesPath = path.resolve(options.sourcesPath ?? LEGACY_SOURCES_PATH)
  const recordsDir = path.resolve(options.recordsDir ?? LEGACY_RECORDS_DIR)
  const sources = sourceArray(await readJson<unknown>(sourcesPath))
  const expectedSlugs = sources.map((source) => source.slug).filter((slug): slug is string => Boolean(slug)).sort()
  const files = (await readdir(recordsDir)).filter((file) => file.endsWith(".json")).sort()
  assert(files.length === expectedSlugs.length, `arquivos=${files.length}; perfis resolvidos=${expectedSlugs.length}`)
  assert(files.every((file, index) => file === `${expectedSlugs[index]}.json`), "arquivos divergem da coorte oficial resolvida")
  const records = await Promise.all(files.map((file) => readJson<ProgramaGovernoPipelineRecord>(path.join(recordsDir, file))))
  return auditProgramaGovernoRecordSet(sources, records, options)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void auditProgramasGoverno({
    sourcesPath: argument("sources"),
    recordsDir: argument("records-dir"),
    expected: {
      ano: argument("ano") ? Number(argument("ano")) as 2026 : undefined,
      cargo: argument("cargo") as ProgramaGovernoFonte["cargo"] | undefined,
      uf: argument("uf") as ProgramaGovernoFonte["uf"] | undefined,
    },
    expectNoApproved: process.argv.includes("--expect-no-approved"),
    expectAllApproved: process.argv.includes("--expect-all-approved"),
  })
    .then((result) => {
      console.log(`PROGRAMAS_DADOS_PASS candidatos=${result.resolved} paginas=${result.pages} secoes=${result.sections} claims=${result.claims} eval_items=${result.evalItems} aprovados=${result.approved}`)
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
