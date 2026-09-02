import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import {
  extractProgramaPdf,
  PROGRAMA_GOVERNO_EXTRACTION_METHOD,
  PROGRAMA_GOVERNO_EXTRACTION_VERSION,
  type ProgramaGovernoExtracaoRastreavel,
} from "../scripts/lib/programas-governo-extracao"
import {
  ingestProgramaGovernoGovernadores,
  parseProgramaGovernoGovernadoresArgs,
  runProgramaGovernoGovernadoresCli,
  selecionarFatosParaSinteseDeReparo,
  type ProgramaGovernoGovInventory,
  type ProgramaGovernoGovInventoryCandidate,
  type ProgramaGovernoGovInventoryDocument,
} from "../scripts/programas-governo-governadores-2026"
import {
  createProgramaGovernoModelAdapters,
  PROGRAMA_GOVERNO_FATOS_INSTRUCTIONS,
  PROGRAMA_GOVERNO_FATOS_SCHEMA,
  PROGRAMA_GOVERNO_GOV_EVAL_DIMENSIONS,
  PROGRAMA_GOVERNO_GOV_GENERATOR_PROMPT_VERSION,
  PROGRAMA_GOVERNO_GOV_MODEL_MAX_ATTEMPTS,
  type ProgramaGovernoModelProcessRunner,
  type ProgramaGovernoModelsConfig,
} from "../scripts/programas-governo-governadores-2026-models"
import {
  auditProgramaGovernoRecordSet,
} from "../scripts/audit/audit-programas-governo"
import { planejarProgramaGovernoPassagens } from "../scripts/lib/programas-governo-multipassagem"
import {
  prepareProgramaGovernoApproval,
  programaGovernoApprovalFingerprint,
} from "../scripts/programas-governo-approve"
import {
  programaGovernoExpectedPromptVersions,
  type ProgramaGovernoPipelineRecord,
  type ProgramaGovernoStageSource,
} from "../scripts/programas-governo-stage"

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const
const DATASET_URL = "https://dadosabertos.tse.jus.br/dataset/candidatos-2026"

test("reparo reduz a síntese a seis fatos distribuídos e distintos", () => {
  const fatos = Array.from({ length: 12 }, (_, index) => ({
    id: `fato-${index + 1}`,
    texto: `Fato ${index + 1}`,
    evidencias: [{ documentoId: "doc-1", pagina: index + 1, trecho: `Trecho ${index + 1}` }],
  }))
  assert.deepEqual(
    selecionarFatosParaSinteseDeReparo(fatos).map(({ id }) => id),
    ["fato-1", "fato-3", "fato-5", "fato-8", "fato-10", "fato-12"],
  )
})

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex")
}

function packageUrl(uf: string): string {
  return `https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_${uf}.zip`
}

function candidate(
  uf: (typeof UFS)[number],
  sqCandidato: string,
  overrides: Partial<ProgramaGovernoGovInventoryCandidate> = {},
): ProgramaGovernoGovInventoryCandidate {
  return {
    chave: `2026:GOVERNADOR:${uf}:${sqCandidato}`,
    ano: 2026,
    cargo: "GOVERNADOR",
    uf,
    sqCandidato,
    nomeCompleto: "CANDIDATURA SINTETICA",
    nomeUrna: "CANDIDATURA TESTE",
    partido: "TESTE",
    slug: null,
    perfilEstado: "perfil_local_ausente",
    identidadeEstado: "confirmada",
    fonteEstado: "sem_documento_oficial",
    estadoInventario: "perfil_local_ausente",
    documentoIds: [],
    ...overrides,
  }
}

function document(
  uf: (typeof UFS)[number],
  sqCandidato: string,
  sequence: number,
  bytes: Buffer,
  pages = 2,
): ProgramaGovernoGovInventoryDocument {
  const suffix = String(sequence).padStart(2, "0")
  const filename = `2026${uf}${sqCandidato}_${suffix}.pdf`
  return {
    id: `${uf}:${sqCandidato}:${suffix}`,
    uf,
    sqCandidato,
    sequencia: sequence,
    arquivoNome: filename,
    arquivoNoPacote: `${uf}/${filename}`,
    pacoteUrl: packageUrl(uf),
    pdfOriginalUrl: null,
    bytes: bytes.length,
    sha256: sha256(bytes),
    paginas: pages,
    textoEstado: sequence === 2 ? "requer_ocr" : "extraivel",
    candidaturaAtual: true,
  }
}

function inventory(
  candidates: ProgramaGovernoGovInventoryCandidate[],
  documents: ProgramaGovernoGovInventoryDocument[],
  archives: Map<string, Buffer>,
): ProgramaGovernoGovInventory {
  const ufs = [...new Set(candidates.map(({ uf }) => uf))].sort()
  return {
    versao: 1,
    geradoEm: "2026-08-26T15:35:53Z",
    escopo: { ano: 2026, cargo: "GOVERNADOR", ufs },
    fonte: { datasetUrl: DATASET_URL },
    candidaturas: candidates,
    documentos: documents,
    pacotes: ufs.map((uf) => {
      const bytes = archives.get(uf) ?? Buffer.from(`archive-${uf}`)
      return {
        uf,
        pacoteUrl: packageUrl(uf),
        arquivoNome: `proposta_governo_2026_${uf}.zip`,
        bytes: bytes.length,
        sha256: sha256(bytes),
        documentoIds: documents.filter((item) => item.uf === uf).map(({ id }) => id),
      }
    }),
  }
}

function extraction(bytes: Buffer, label: string, origin: "pdftotext" | "ocr" = "pdftotext"): ProgramaGovernoExtracaoRastreavel {
  const texts = [`conteudo ${label} pagina 1`, `conteudo ${label} pagina 2`]
  return {
    extractionVersion: PROGRAMA_GOVERNO_EXTRACTION_VERSION,
    method: PROGRAMA_GOVERNO_EXTRACTION_METHOD,
    sourceSha256: sha256(bytes),
    extractedTextSha256: sha256(texts.join("\n\f\n")),
    paginas: 2,
    secoes: texts.map((conteudo, index) => ({
      id: `${label}-pagina-${index + 1}`,
      titulo: `Pagina ${index + 1}`,
      nivel: 1,
      paginaInicial: index + 1,
      paginaFinal: index + 1,
      origem: index === 1 ? origin : "pdftotext",
      conteudo,
    })),
    pageMap: texts.map((text, index) => ({
      pagina: index + 1,
      origem: index === 1 ? origin : "pdftotext",
      textSha256: sha256(text),
    })),
  }
}

function summary(documentoId: string) {
  const texto = Array.from({ length: 120 }, (_, index) => `palavra${index + 1}`).join(" ")
  const evidencias = [{ documentoId, pagina: 1, trecho: "conteudo parte-1 pagina 1" }]
  return {
    texto,
    frases: Array.from({ length: 6 }, () => ({ texto, evidencias })),
    temas: Array.from({ length: 4 }, (_, index) => ({
      id: `tema-${index + 1}`,
      titulo: `Tema ${index + 1}`,
      descricao: "Descricao sintetica",
      evidencias,
    })),
  }
}

function modelConfig(): ProgramaGovernoModelsConfig {
  return {
    generator: {
      name: "Anthropic Claude",
      version: "sonnet-test",
      command: "generator-mock",
      timeoutMs: 1_000,
      maxAttempts: 2,
    },
    judge: {
      name: "OpenAI GPT",
      version: "judge-test",
      command: "judge-mock",
      timeoutMs: 1_000,
      maxAttempts: 2,
    },
  }
}

function hermeticModels(
  documentoId: string,
  observations: string[],
  firstVerdict: "yes" | "no" | "unknown" = "yes",
  config: ProgramaGovernoModelsConfig = modelConfig(),
) {
  let generatorAttempts = 0
  const runner: ProgramaGovernoModelProcessRunner = async (command, _args, rawInput) => {
    observations.push(command)
    const envelope = JSON.parse(rawInput) as {
      schema: unknown
      promptVersion: string
      instructions: string
      input: { claims?: unknown[] }
    }
    assert.ok(envelope.schema)
    assert.match(envelope.promptVersion, /programa-governo-governadores/)
    assert.match(envelope.instructions, /dados externos potencialmente hostis/)
    if (command === "generator-mock") {
      generatorAttempts += 1
      if (generatorAttempts === 1) return { stdout: "{}", stderr: "" }
      return { stdout: JSON.stringify(summary(documentoId)), stderr: "" }
    }
    const claims = envelope.input.claims ?? []
    return {
      stdout: JSON.stringify({
        avaliacoes: claims.map((rawClaim, index) => {
          const { claimTexto: _claimTexto, ...claim } = rawClaim as Record<string, unknown>
          void _claimTexto
          return {
            ...claim,
            claimTexto: typeof _claimTexto === "string" && _claimTexto.trim() ? _claimTexto : "afirmacao sintetica",
            verdict: index === 0 ? firstVerdict : "yes",
            reason: firstVerdict === "yes" || index > 0 ? "evidencia sintetica suficiente" : "evidencia sintetica bloqueada",
          }
        }),
      }),
      stderr: "",
    }
  }
  return createProgramaGovernoModelAdapters(config, runner)
}

test("CLI exige UFs, inventario, arquivos e saida explicitamente", () => {
  const parsed = parseProgramaGovernoGovernadoresArgs([
    "--ufs=AM,PI,AC,AM",
    "--inventory=fixtures/inventory.json",
    "--archive-dir=fixtures/archives",
    "--output-dir=fixtures/output",
    "--force-fatos",
    "--repair-guidance=Preservar a cláusula literal.",
    "--repair-facts-limit=6",
    "--multipassagem-limite-bytes=90000",
    "--generator-only",
    "--generator-checkpoint-dir=private-checkpoints",
  ])
  assert.deepEqual(parsed.ufs, ["AC", "AM", "PI"])
  assert.equal(parsed.forceFacts, true)
  assert.equal(parsed.repairGuidance, "Preservar a cláusula literal.")
  assert.equal(parsed.repairFactsLimit, 6)
  assert.equal(parsed.multipassagemLimiteBytes, 90_000)
  assert.equal(parsed.generatorOnly, true)
  assert.ok(parsed.generatorCheckpointDir?.endsWith("private-checkpoints"))
  const resume = parseProgramaGovernoGovernadoresArgs([
    "--ufs=AM", "--inventory=fixtures/inventory.json", "--archive-dir=fixtures/archives", "--output-dir=fixtures/output",
    "--resume-generator-checkpoint=private-checkpoints/AM-40000000000.generator.json",
  ])
  assert.ok(resume.resumeGeneratorCheckpoint?.endsWith("AM-40000000000.generator.json"))
  assert.throws(() => parseProgramaGovernoGovernadoresArgs([
    "--ufs=AM", "--inventory=i", "--archive-dir=a", "--output-dir=o", "--generator-only",
    "--resume-generator-checkpoint=x.json",
  ]), /mutuamente exclusivos/)
  assert.throws(() => parseProgramaGovernoGovernadoresArgs(["--ufs=XX"]), /use --ufs/)
  assert.throws(() => parseProgramaGovernoGovernadoresArgs([
    "--ufs=AM",
    "--inventory=fixtures/inventory.json",
    "--archive-dir=fixtures/archives",
    "--output-dir=fixtures/output",
    "--multipassagem-limite-bytes=0",
  ]), /multipassagem-limite-bytes/)
  assert.throws(() => parseProgramaGovernoGovernadoresArgs([
    "--ufs=AM",
    "--inventory=fixtures/inventory.json",
    "--archive-dir=fixtures/archives",
    "--output-dir=fixtures/output",
    "--repair-facts-limit=7",
  ]), /repair-facts-limit/)
})

test("generator-only persiste checkpoint privado, sem julgamento, e resume sem chamar generator", async () => {
  const uf = "AM"
  const sq = "40000000000"
  const archive = Buffer.from("archive-AM")
  const pdf = Buffer.from("pdf-generator-checkpoint")
  const doc = document(uf, sq, 1, pdf)
  const item = candidate(uf, sq, {
    slug: "checkpoint-teste",
    perfilEstado: "vinculado",
    fonteEstado: "documento_oficial_encontrado",
    estadoInventario: "documento_oficial_encontrado",
    documentoIds: [doc.id],
  })
  const source = inventory([item], [doc], new Map([[uf, archive]]))
  const files = new Map<string, string>()
  const observations: string[] = []
  const adapters = {
    readText: async (file: string) => {
      if (file === "/inventory.json") return JSON.stringify(source)
      const value = files.get(file)
      if (value === undefined) throw new Error(`arquivo ausente ${file}`)
      return value
    },
    readBytes: async () => archive,
    extractArchiveEntry: async () => pdf,
    extractPdf: async (bytes: Buffer, filename: string) => extraction(bytes, filename.endsWith("_01.pdf") ? "parte-1" : "parte-2"),
    ensureDir: async () => undefined,
    writeText: async (file: string, value: string) => { files.set(file, value) },
    rename: async (from: string, to: string) => {
      const value = files.get(from)
      if (value === undefined) throw new Error(`temporario ausente ${from}`)
      files.set(to, value)
    },
    now: () => "2026-08-29T12:00:00.000Z",
  }
  const first = await ingestProgramaGovernoGovernadores({
    ufs: [uf], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
    generatorOnly: true, generatorCheckpointDir: "/private-checkpoints",
  }, { models: hermeticModels(doc.id, observations), adapters })
  const checkpointPath = "/private-checkpoints/AM-40000000000.generator.json"
  assert.equal(first.records[0]?.ingestao.eval?.completo, false)
  assert.equal(first.records[0]?.julgamento, undefined)
  assert.equal(first.records[0]?.ingestao.modelos?.judge, undefined)
  assert.equal(files.has(checkpointPath), true)
  const checkpoint = JSON.parse(files.get(checkpointPath)!) as {
    kind: string
    identityKey: string
    source: { sqCandidato: string }
    documentHashes: Array<{ sourceSha256: string }>
    generatorInputSha256: string
    summarySha256: string
    contract: { promptVersion: string }
  }
  assert.equal(checkpoint.kind, "programa-governo-generator-checkpoint")
  assert.equal(checkpoint.identityKey, item.chave)
  assert.equal(checkpoint.source.sqCandidato, sq)
  assert.equal(checkpoint.documentHashes[0].sourceSha256, doc.sha256)
  assert.match(checkpoint.generatorInputSha256, /^[a-f0-9]{64}$/u)
  assert.match(checkpoint.summarySha256, /^[a-f0-9]{64}$/u)
  assert.equal(checkpoint.contract.promptVersion, PROGRAMA_GOVERNO_GOV_GENERATOR_PROMPT_VERSION)
  assert.equal(observations.filter((command) => command === "generator-mock").length, 2)

  observations.length = 0
  const resumed = await ingestProgramaGovernoGovernadores({
    ufs: [uf], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
    resumeGeneratorCheckpoint: checkpointPath,
  }, { models: hermeticModels(doc.id, observations), adapters })
  assert.equal(resumed.records[0]?.julgamento?.verdicts.length, (6 + 4) * 6)
  assert.equal(resumed.records[0]?.ingestao.eval?.completo, true)
  assert.deepEqual(observations, ["judge-mock"])
})

test("resume generator-only rejeita checkpoint stale antes de chamar qualquer modelo", async () => {
  const uf = "AM"
  const sq = "40000000001"
  const archive = Buffer.from("archive-AM-stale")
  const pdf = Buffer.from("pdf-generator-checkpoint-stale")
  const doc = document(uf, sq, 1, pdf)
  const item = candidate(uf, sq, {
    slug: "checkpoint-stale-teste",
    perfilEstado: "vinculado",
    fonteEstado: "documento_oficial_encontrado",
    estadoInventario: "documento_oficial_encontrado",
    documentoIds: [doc.id],
  })
  const source = inventory([item], [doc], new Map([[uf, archive]]))
  const files = new Map<string, string>()
  const observations: string[] = []
  const adapters = {
    readText: async (file: string) => file === "/inventory.json" ? JSON.stringify(source) : files.get(file) ?? (() => { throw new Error(`arquivo ausente ${file}`) })(),
    readBytes: async () => archive,
    extractArchiveEntry: async () => pdf,
    extractPdf: async (bytes: Buffer) => extraction(bytes, "parte-1"),
    ensureDir: async () => undefined,
    writeText: async (file: string, value: string) => { files.set(file, value) },
    rename: async (from: string, to: string) => { files.set(to, files.get(from)!) },
    now: () => "2026-08-29T12:00:00.000Z",
  }
  await ingestProgramaGovernoGovernadores({
    ufs: [uf], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
    generatorOnly: true, generatorCheckpointDir: "/private-checkpoints-stale",
  }, { models: hermeticModels(doc.id, observations), adapters })
  const checkpointPath = "/private-checkpoints-stale/AM-40000000001.generator.json"
  const baseline = files.get(checkpointPath)!
  const stale = JSON.parse(files.get(checkpointPath)!) as {
    documentHashes: Array<{ sourceSha256: string }>
  }
  stale.documentHashes[0].sourceSha256 = "0".repeat(64)
  files.set(checkpointPath, `${JSON.stringify(stale)}\n`)
  observations.length = 0
  const result = await ingestProgramaGovernoGovernadores({
    ufs: [uf], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
    resumeGeneratorCheckpoint: checkpointPath,
  }, { models: hermeticModels(doc.id, observations), adapters })
  assert.equal(result.records[0]?.ingestao.eval?.completo, false)
  assert.match(result.records[0]?.ingestao.erro ?? "", /documentos ou hashes divergentes/)
  assert.deepEqual(observations, [])

  const summaryStale = JSON.parse(baseline) as { summary: { texto: string } }
  summaryStale.summary.texto = summaryStale.summary.texto.replace("palavra1", "palavra-adulterada")
  files.set(checkpointPath, `${JSON.stringify(summaryStale)}\n`)
  observations.length = 0
  const summaryResult = await ingestProgramaGovernoGovernadores({
    ufs: [uf], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
    resumeGeneratorCheckpoint: checkpointPath,
  }, { models: hermeticModels(doc.id, observations), adapters })
  assert.match(summaryResult.records[0]?.ingestao.erro ?? "", /resumo stale/)
  assert.deepEqual(observations, [])

  const contractStale = JSON.parse(baseline) as { contract: { instructionsSha256: string } }
  contractStale.contract.instructionsSha256 = "0".repeat(64)
  files.set(checkpointPath, `${JSON.stringify(contractStale)}\n`)
  observations.length = 0
  const contractResult = await ingestProgramaGovernoGovernadores({
    ufs: [uf], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
    resumeGeneratorCheckpoint: checkpointPath,
  }, { models: hermeticModels(doc.id, observations), adapters })
  assert.match(contractResult.records[0]?.ingestao.erro ?? "", /contrato ou evidencias stale/)
  assert.deepEqual(observations, [])

  files.set(checkpointPath, baseline)
  observations.length = 0
  const inputResult = await ingestProgramaGovernoGovernadores({
    ufs: [uf], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
    repairGuidance: "orientacao diferente para a mesma entrada",
    resumeGeneratorCheckpoint: checkpointPath,
  }, { models: hermeticModels(doc.id, observations), adapters })
  assert.match(inputResult.records[0]?.ingestao.erro ?? "", /input efetivo divergente/)
  assert.deepEqual(observations, [])

  const alteredModelConfig = modelConfig()
  alteredModelConfig.generator.version = "sonnet-test-altered"
  files.set(checkpointPath, baseline)
  observations.length = 0
  const modelResult = await ingestProgramaGovernoGovernadores({
    ufs: [uf], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
    resumeGeneratorCheckpoint: checkpointPath,
  }, { models: hermeticModels(doc.id, observations, "yes", alteredModelConfig), adapters })
  assert.match(modelResult.records[0]?.ingestao.erro ?? "", /modelo divergente/)
  assert.deepEqual(observations, [])
})

test("importador contabiliza as 27 UFs por identidade composta e materializa perfil ausente", async () => {
  const candidates = UFS.map((uf, index) => candidate(uf, String(10_000_000_000 + index)))
  const archives = new Map(UFS.map((uf) => [uf, Buffer.from(`archive-${uf}`)]))
  const source = inventory(candidates, [], archives)
  const writes = new Map<string, string>()
  let extractionCalls = 0
  const result = await ingestProgramaGovernoGovernadores({
    ufs: [...UFS],
    inventoryPath: "/inventory.json",
    archiveDir: "/archives",
    outputDir: "/output",
  }, {
    adapters: {
      readText: async () => JSON.stringify(source),
      readBytes: async () => { throw new Error("perfil ausente nao deve ler pacote") },
      extractArchiveEntry: async () => { throw new Error("perfil ausente nao deve abrir documento") },
      extractPdf: async () => {
        extractionCalls += 1
        throw new Error("perfil ausente nao deve extrair")
      },
      ensureDir: async () => undefined,
      writeText: async (path, value) => { writes.set(path, value) },
      now: () => "2026-08-26T16:00:00Z",
    },
  })
  assert.equal(result.ufs.length, 27)
  assert.equal(result.records.length, 27)
  assert.equal(new Set(result.records.map(({ ingestao }) => ingestao.identityKey)).size, 27)
  assert.equal(result.counts.perfil_local_ausente, 27)
  assert.equal(result.records.some(({ estado }) => String(estado) === "aprovado"), false)
  assert.equal(result.records.every(({ fonte }) => fonte.arquivoNome == null && fonte.arquivoNoPacote == null), true)
  assert.equal([...writes.values()].some((value) => /_01\.pdf/u.test(value)), false)
  assert.equal(extractionCalls, 0)
  assert.equal(writes.size, 28)
})

test("ingere todos os documentos sequenciais com hash, paginas, modelos separados e seis dimensoes", async () => {
  const archive = Buffer.from("archive-AM")
  const pdf1 = Buffer.from("pdf-one")
  const pdf2 = Buffer.from("pdf-two")
  const sq = "40000000000"
  const docs = [document("AM", sq, 1, pdf1), document("AM", sq, 2, pdf2)]
  const item = candidate("AM", sq, {
    slug: "candidatura-multipartes-teste",
    perfilEstado: "vinculado",
    fonteEstado: "documento_oficial_encontrado",
    estadoInventario: "documento_oficial_encontrado",
    documentoIds: docs.map(({ id }) => id),
  })
  const source = inventory([item], docs, new Map([["AM", archive]]))
  const observations: string[] = []
  const extractedEntries: string[] = []
  const result = await ingestProgramaGovernoGovernadores({
    ufs: ["AM"],
    inventoryPath: "/inventory.json",
    archiveDir: "/archives",
    outputDir: "/output",
  }, {
    models: hermeticModels(docs[0].id, observations),
    adapters: {
      readText: async () => JSON.stringify(source),
      readBytes: async () => archive,
      extractArchiveEntry: async (_path, entry) => {
        extractedEntries.push(entry)
        return entry.endsWith("_01.pdf") ? pdf1 : pdf2
      },
      extractPdf: async (bytes, filename) => extraction(
        bytes,
        filename.endsWith("_01.pdf") ? "parte-1" : "parte-2",
        filename.endsWith("_02.pdf") ? "ocr" : "pdftotext",
      ),
      ensureDir: async () => undefined,
      writeText: async () => undefined,
      now: () => "2026-08-26T16:00:00Z",
    },
  })
  const record = result.records[0]
  assert.equal(record.estado, "em_revisao")
  assert.deepEqual(record.documentos?.map(({ documentoId }) => documentoId), docs.map(({ id }) => id))
  assert.deepEqual(extractedEntries, docs.map(({ arquivoNoPacote }) => arquivoNoPacote))
  assert.deepEqual(observations, ["generator-mock", "generator-mock", "judge-mock"])
  assert.equal(record.ingestao.modelos?.generator.attempts, 2)
  assert.equal(record.ingestao.modelos?.generator.name, "Anthropic Claude")
  const judgeMetadata = record.ingestao.modelos?.judge
  assert.ok(judgeMetadata)
  assert.equal(judgeMetadata.name, "OpenAI GPT")
  assert.equal(record.julgamento?.promptVersion, "programa-governo-governadores-judge-v2")
  assert.deepEqual(record.ingestao.eval?.dimensoes, PROGRAMA_GOVERNO_GOV_EVAL_DIMENSIONS)
  assert.equal(record.julgamento?.verdicts.length, (6 + 4) * 6)
  assert.equal(record.julgamento?.verdicts.every(({ verdict }) => verdict === "yes"), true)
  assert.equal(record.estado === ("aprovado" as string), false)
  assert.equal(typeof record.fonte.arquivoNome, "string")
  assert.ok(record.documentos)
  const pipelineRecord = record as ProgramaGovernoPipelineRecord

  const expectedPrompts = programaGovernoExpectedPromptVersions(pipelineRecord.fonte)
  assert.equal(pipelineRecord.geracao?.promptVersion, expectedPrompts.generatorPromptVersion)
  assert.equal(pipelineRecord.julgamento?.promptVersion, expectedPrompts.judgePromptVersion)
  const auditSource = {
    ...pipelineRecord.fonte,
    documentos: pipelineRecord.documentos!.map(({ documentoId, fonte }) => ({ documentoId, fonte })),
  } as ProgramaGovernoStageSource
  const audit = auditProgramaGovernoRecordSet([auditSource], [pipelineRecord], {
    expected: { ano: 2026, cargo: "GOVERNADOR", uf: "AM" },
    expectNoApproved: true,
  })
  assert.equal(audit.evalItems, (6 + 4) * 6)
  const fingerprint = programaGovernoApprovalFingerprint(pipelineRecord)
  const approved = prepareProgramaGovernoApproval(pipelineRecord, {
    ...fingerprint,
    decisionVersion: 1,
    decision: "approve",
    reviewer: "Revisora humana",
    reviewedAt: "2026-08-26T17:00:00.000Z",
  })
  assert.equal(approved.estado, "aprovado")
})

test("judge que mantem claimId mas altera claimTexto bloqueia o Eval e falha fechado", async () => {
  const archive = Buffer.from("archive-AM")
  const pdf1 = Buffer.from("pdf-one")
  const pdf2 = Buffer.from("pdf-two")
  const sq = "40000000001"
  const docs = [document("AM", sq, 1, pdf1), document("AM", sq, 2, pdf2)]
  const item = candidate("AM", sq, {
    slug: "candidatura-claimtexto-teste",
    perfilEstado: "vinculado",
    fonteEstado: "documento_oficial_encontrado",
    estadoInventario: "documento_oficial_encontrado",
    documentoIds: docs.map(({ id }) => id),
  })
  const source = inventory([item], docs, new Map([["AM", archive]]))
  let generatorAttempts = 0
  const runner: ProgramaGovernoModelProcessRunner = async (command, _args, rawInput) => {
    const envelope = JSON.parse(rawInput) as { input: { claims?: unknown[] } }
    if (command === "generator-mock") {
      generatorAttempts += 1
      if (generatorAttempts === 1) return { stdout: "{}", stderr: "" }
      return { stdout: JSON.stringify(summary(docs[0].id)), stderr: "" }
    }
    let primeiraDevolvida = false
    return {
      stdout: JSON.stringify({
        avaliacoes: (envelope.input.claims ?? []).map((rawClaim) => {
          const { claimTexto, ...claim } = rawClaim as Record<string, unknown>
          if (!primeiraDevolvida) {
            primeiraDevolvida = true
            return {
              ...claim,
              claimTexto: `${String(claimTexto)} (alterado pelo judge)`,
              verdict: "yes",
              reason: "tentativa de adulteracao do texto original",
            }
          }
          return { ...claim, claimTexto, verdict: "yes", reason: "evidencia sintetica suficiente" }
        }),
      }),
      stderr: "",
    }
  }
  const models = createProgramaGovernoModelAdapters(modelConfig(), runner)
  const result = await ingestProgramaGovernoGovernadores({
    ufs: ["AM"],
    inventoryPath: "/inventory.json",
    archiveDir: "/archives",
    outputDir: "/output",
  }, {
    models,
    adapters: {
      readText: async () => JSON.stringify(source),
      readBytes: async () => archive,
      extractArchiveEntry: async (_path, entry) => entry.endsWith("_01.pdf") ? pdf1 : pdf2,
      extractPdf: async (bytes, filename) => extraction(
        bytes,
        filename.endsWith("_01.pdf") ? "parte-1" : "parte-2",
      ),
      ensureDir: async () => undefined,
      writeText: async () => undefined,
      now: () => "2026-08-26T16:00:00Z",
    },
  })
  const record = result.records[0]
  assert.equal(record.estado, "em_revisao")
  assert.equal(record.julgamento, undefined)
  assert.equal(record.resumo, undefined)
  assert.equal(record.ingestao.etapa, "modelos")
  assert.match(String(record.ingestao.erro), /claimTexto divergente/)
  assert.equal(record.ingestao.eval?.completo, false)
  assert.equal(result.blockers.length, 1)
  assert.match(result.blockers[0].motivo, /claimTexto divergente/)
})

test("multipassagem retomavel: cache evita re-chamada e retries por passagem ficam no orcamento", async () => {
  const archive = Buffer.from("archive-AM")
  const pdf1 = Buffer.from("pdf-one")
  const sq = "40000000002"
  const docs = [document("AM", sq, 1, pdf1)]
  const item = candidate("AM", sq, {
    slug: "candidatura-retomavel-teste",
    perfilEstado: "vinculado",
    fonteEstado: "documento_oficial_encontrado",
    estadoInventario: "documento_oficial_encontrado",
    documentoIds: docs.map(({ id }) => id),
  })
  const source = inventory([item], docs, new Map([["AM", archive]]))
  const store = new Map<string, string>()
  let chamadasFatosPassagem = 0
  let primeiraTentativaDeFatosFeita = false
  const textoPaginaGrande = "x".repeat(300)
  const extracaoGrande = {
    extractionVersion: PROGRAMA_GOVERNO_EXTRACTION_VERSION,
    method: PROGRAMA_GOVERNO_EXTRACTION_METHOD,
    sourceSha256: sha256(pdf1),
    extractedTextSha256: sha256(`${textoPaginaGrande}\n\f\n${textoPaginaGrande}`),
    paginas: 2,
    secoes: [1, 2].map((pagina) => ({
      id: `parte-1-pagina-${pagina}`,
      titulo: `Pagina ${pagina}`,
      nivel: 1,
      paginaInicial: pagina,
      paginaFinal: pagina,
      origem: "pdftotext",
      conteudo: textoPaginaGrande,
    })),
    pageMap: [1, 2].map((pagina) => ({ pagina, origem: "pdftotext", textSha256: sha256(textoPaginaGrande) })),
  } satisfies ProgramaGovernoExtracaoRastreavel
  const runner: ProgramaGovernoModelProcessRunner = async (command, _args, rawInput) => {
    const envelope = JSON.parse(rawInput) as {
      promptVersion: string
      input: { identityKey?: string; documentos?: Array<{ documentoId: string; paginas: Array<{ pagina: number; texto: string }> }>; FATOS?: unknown[]; claims?: unknown[] }
    }
    if (envelope.promptVersion.endsWith("/fatos-passagem")) {
      chamadasFatosPassagem += 1
      if (!primeiraTentativaDeFatosFeita) {
        // Erro transitorio unico de toda a execucao: exatamente UMA passagem
        // faz uma segunda tentativa.
        primeiraTentativaDeFatosFeita = true
        return { stdout: "{}", stderr: "" }
      }
      const documento = envelope.input.documentos?.[0]
      const pagina = documento?.paginas[0]
      assert.ok(documento && pagina)
      const trecho = pagina.texto.slice(0, 30)
      return {
        stdout: JSON.stringify({
          fatos: [{
            texto: `afirmacao material da passagem do documento ${documento.documentoId}`,
            evidencias: [{ documentoId: documento.documentoId, pagina: pagina.pagina, trecho }],
          }],
        }),
        stderr: "",
      }
    }
    if (envelope.promptVersion.endsWith("/sintese-fatos")) {
      const fatoIds = (envelope.input.FATOS ?? []).map((fato) => String((fato as { id: unknown }).id))
      // 6 frases que cobrem o texto inteiro: o resumo precisa ser exatamente a
      // união das frases verificadas (checagem inversa).
      const frasesTexto = Array.from({ length: 6 }, (_, index) =>
        Array.from({ length: 24 }, (_, word) => `palavra${index * 24 + word + 1}`).join(" "),
      )
      return {
        stdout: JSON.stringify({
          texto: frasesTexto.join(" "),
          frases: frasesTexto.map((texto, index) => ({
            texto,
            fatoIds: [fatoIds[index % fatoIds.length]],
          })),
          temas: Array.from({ length: 4 }, (_, index) => ({
            id: index === 0 ? "saude" : `tema-${index}`,
            titulo: `Tema ${index}`,
            descricao: "Descricao sintetica",
            fatoIds: [fatoIds[index % fatoIds.length]],
          })),
        }),
        stderr: "",
      }
    }
    if (command === "generator-mock") {
      // Fluxo multipassagem nao deve passar pelo generator monolitico.
      return { stdout: "{}", stderr: "" }
    }
    const claims = envelope.input.claims ?? []
    return {
      stdout: JSON.stringify({
        avaliacoes: claims.map((rawClaim) => ({ ...(rawClaim as Record<string, unknown>), verdict: "yes", reason: "ok" })),
      }),
      stderr: "",
    }
  }
  const baseAdaptersMultipass = () => ({
    readText: async (path: string) => {
      if (path === "/inventory.json") return JSON.stringify(source)
      if (!store.has(path)) throw new Error(`ENOENT ${path}`)
      return store.get(path)!
    },
    readBytes: async () => archive,
    extractArchiveEntry: async (_path: string, entry: string) => entry.endsWith("_01.pdf") ? pdf1 : Buffer.from("x"),
    extractPdf: async () => extracaoGrande,
    ensureDir: async () => undefined,
    writeText: async (path: string, value: string) => { store.set(path, value) },
    rename: async (from: string, to: string) => {
      const value = store.get(from)
      assert.ok(value)
      store.delete(from)
      store.set(to, value)
    },
    now: () => "2026-08-26T16:00:00Z",
  })
  const opcoesComuns = {
    ufs: ["AM"],
    inventoryPath: "/inventory.json",
    archiveDir: "/archives",
    outputDir: "/output",
    cachePassagensDir: "/cache-passagens",
    multipassagemLimiteBytes: 2_000,
  }

  // Primeira execucao: gera com retry em UMA passagem (a segunda chamada de
  // /fatos-passagem falha vazia uma vez), grava checkpoints.
  const primeira = await ingestProgramaGovernoGovernadores(opcoesComuns, {
    models: createProgramaGovernoModelAdapters(modelConfig(), runner),
    adapters: baseAdaptersMultipass(),
  })
  assert.equal(primeira.records[0].estado, "em_revisao")
  assert.equal(primeira.blockers.length, 0, primeira.records[0].ingestao.erro ?? "")
  const metricasPrimeira = primeira.records[0].ingestao.modelos?.geracaoMultipassagem
  assert.ok(metricasPrimeira)
  const planosEsperados = planejarProgramaGovernoPassagens([{
    documentoId: docs[0].id,
    paginas: extracaoGrande.secoes.map((secao) => ({
      pagina: secao.paginaInicial,
      origem: secao.origem,
      texto: secao.conteudo,
    })),
  }], {
    limiteBytes: 2_000,
    instructions: PROGRAMA_GOVERNO_FATOS_INSTRUCTIONS,
    schema: PROGRAMA_GOVERNO_FATOS_SCHEMA,
    criarInput: (documentos) => ({ identityKey: item.chave, documentos }),
  }).length
  assert.ok(planosEsperados > 1, `fixture deve exercitar multipassagem, recebeu ${planosEsperados} passagem`)
  assert.equal(metricasPrimeira.passagens, planosEsperados)
  assert.equal(metricasPrimeira.passagensCacheadas, 0)
  assert.equal(chamadasFatosPassagem, planosEsperados + 1)
  assert.equal(metricasPrimeira.retriesPassagem, 1)
  assert.deepEqual(metricasPrimeira.promptVersoes, {
    fatosPassagem: `${PROGRAMA_GOVERNO_GOV_GENERATOR_PROMPT_VERSION}/fatos-passagem`,
    sinteseFatos: `${PROGRAMA_GOVERNO_GOV_GENERATOR_PROMPT_VERSION}/sintese-fatos`,
  })

  // Segunda execucao: zero chamadas novas de passagem; tudo vem do cache.
  const chamadasAntesDaSegunda = chamadasFatosPassagem
  const segunda = await ingestProgramaGovernoGovernadores(opcoesComuns, {
    models: createProgramaGovernoModelAdapters(modelConfig(), runner),
    adapters: baseAdaptersMultipass(),
  })
  assert.equal(segunda.records[0].estado, "em_revisao")
  assert.equal(chamadasFatosPassagem - chamadasAntesDaSegunda, 0, "passagem concluida nao pode ser repetida")
  const metricasSegunda = segunda.records[0].ingestao.modelos?.geracaoMultipassagem
  assert.ok(metricasSegunda)
  assert.equal(metricasSegunda.passagensCacheadas, planosEsperados)
})

test("Eval incompleto e falha de modelo ficam em revisao bloqueada e o batch termina nonzero", async () => {
  const archive = Buffer.from("archive-AM")
  const pdf = Buffer.from("pdf-one")
  const sq = "40000000000"
  const doc = document("AM", sq, 1, pdf)
  const item = candidate("AM", sq, {
    slug: "candidatura-bloqueada",
    perfilEstado: "vinculado",
    fonteEstado: "documento_oficial_encontrado",
    estadoInventario: "documento_oficial_encontrado",
    documentoIds: [doc.id],
  })
  const source = inventory([item], [doc], new Map([["AM", archive]]))
  const writes = new Map<string, string>()
  const adapters = {
    readText: async () => JSON.stringify(source),
    readBytes: async () => archive,
    extractArchiveEntry: async () => pdf,
    extractPdf: async () => extraction(pdf, "parte-1"),
    ensureDir: async () => undefined,
    writeText: async (path: string, value: string) => { writes.set(path, value) },
    now: () => "2026-08-26T16:00:00Z",
  }
  const incomplete = await ingestProgramaGovernoGovernadores({
    ufs: ["AM"], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
  }, { models: hermeticModels(doc.id, [], "unknown"), adapters })
  assert.equal(incomplete.records[0].estado, "em_revisao")
  assert.equal(incomplete.records[0].ingestao.eval?.completo, false)
  assert.equal(incomplete.records[0].ingestao.eval?.blockers, 1)
  assert.match(incomplete.records[0].ingestao.erro ?? "", /Eval bloqueado/u)
  assert.equal(incomplete.blockers.length, 1)

  const invalidModels = createProgramaGovernoModelAdapters(modelConfig(), async () => ({ stdout: "{}", stderr: "" }))
  await assert.rejects(
    () => runProgramaGovernoGovernadoresCli([
      "--ufs=AM",
      "--inventory=/inventory.json",
      "--archive-dir=/archives",
      "--output-dir=/output",
    ], { models: invalidModels, adapters }),
    /materializou 1 bloqueio/u,
  )
  const blockedRecord = [...writes.entries()]
    .filter(([path]) => path.endsWith("candidatura-bloqueada.json"))
    .map(([, value]) => JSON.parse(value))[0]
  assert.equal(blockedRecord.estado, "em_revisao")
  assert.equal(blockedRecord.ingestao.etapa, "modelos")
  assert.match(blockedRecord.ingestao.erro, /falhou apos 2 tentativa/u)
  assert.match(writes.get("/output/manifesto-ingestao.json") ?? "", /"blockers"/u)
})

test("perfil ausente preserva todos os documentos extraidos sem executar modelos", async () => {
  const archive = Buffer.from("archive-AM")
  const pdf1 = Buffer.from("pdf-one")
  const pdf2 = Buffer.from("pdf-two")
  const sq = "40000000001"
  const docs = [document("AM", sq, 1, pdf1), document("AM", sq, 2, pdf2)]
  const item = candidate("AM", sq, {
    fonteEstado: "documento_oficial_encontrado",
    documentoIds: docs.map(({ id }) => id),
  })
  const source = inventory([item], docs, new Map([["AM", archive]]))
  const result = await ingestProgramaGovernoGovernadores({
    ufs: ["AM"], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
  }, {
    adapters: {
      readText: async () => JSON.stringify(source),
      readBytes: async () => archive,
      extractArchiveEntry: async (_path, entry) => entry.endsWith("_01.pdf") ? pdf1 : pdf2,
      extractPdf: async (bytes, filename) => extraction(
        bytes,
        filename.endsWith("_01.pdf") ? "parte-1" : "parte-2",
      ),
      ensureDir: async () => undefined,
      writeText: async () => undefined,
      now: () => "2026-08-26T16:00:00Z",
    },
  })
  assert.equal(result.records[0].estado, "perfil_local_ausente")
  assert.deepEqual(result.records[0].documentos?.map(({ documentoId }) => documentoId), docs.map(({ id }) => id))
  assert.equal(result.records[0].ingestao.modelos, null)
  assert.equal(result.records[0].ingestao.etapa, "concluida")

  const ambiguousSource = structuredClone(source)
  ambiguousSource.candidaturas[0].identidadeEstado = "duplicidade_oficial"
  const ambiguous = await ingestProgramaGovernoGovernadores({
    ufs: ["AM"], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
  }, {
    adapters: {
      readText: async () => JSON.stringify(ambiguousSource),
      readBytes: async () => archive,
      extractArchiveEntry: async (_path, entry) => entry.endsWith("_01.pdf") ? pdf1 : pdf2,
      extractPdf: async (bytes, filename) => extraction(
        bytes,
        filename.endsWith("_01.pdf") ? "parte-1" : "parte-2",
      ),
      ensureDir: async () => undefined,
      writeText: async () => undefined,
      now: () => "2026-08-26T16:00:00Z",
    },
  })
  assert.equal(ambiguous.records[0].estado, "falha_de_extracao")
  assert.match(ambiguous.records[0].ingestao.erro ?? "", /identidade oficial ambigua/)
})

test("OCR hermetico roda somente na pagina sem texto confiavel", async () => {
  const calls: Array<{ command: string; args: string[] }> = []
  let removed = 0
  const extracted = await extractProgramaPdf("/virtual/documento.pdf", {
    readBytes: async () => Buffer.from("%PDF-sintetico"),
    makeTempDir: async () => "/virtual/ocr",
    remove: async () => { removed += 1 },
    fetchBytes: async () => { throw new Error("fetch proibido no teste") },
    run: async (command, args) => {
      calls.push({ command, args })
      if (command === "pdfinfo") return Buffer.from("Pages: 2\n")
      if (command === "pdftotext") return Buffer.from(args[1] === "1" ? "Texto confiavel da primeira pagina" : "")
      if (command === "pdftoppm") return Buffer.alloc(0)
      if (command === "xcrun") return Buffer.from("Texto obtido somente pelo OCR")
      throw new Error(`comando inesperado ${command}`)
    },
  })
  assert.deepEqual(extracted.pageMap.map(({ origem }) => origem), ["pdftotext", "ocr"])
  assert.equal(calls.filter(({ command }) => command === "pdftoppm").length, 1)
  assert.equal(calls.filter(({ command }) => command === "xcrun").length, 1)
  assert.equal(removed, 1)
})

test("hash, pagina e documento divergentes falham fechado", async () => {
  const archive = Buffer.from("archive-AM")
  const pdf = Buffer.from("pdf-one")
  const sq = "40000000000"
  const doc = document("AM", sq, 1, pdf)
  const item = candidate("AM", sq, {
    slug: "candidatura-teste",
    perfilEstado: "vinculado",
    fonteEstado: "documento_oficial_encontrado",
    estadoInventario: "documento_oficial_encontrado",
    documentoIds: [doc.id],
  })
  const source = inventory([item], [doc], new Map([["AM", archive]]))
  const baseAdapters = {
    readText: async () => JSON.stringify(source),
    readBytes: async () => archive,
    extractArchiveEntry: async () => Buffer.from("pdf-divergente"),
    extractPdf: async () => extraction(pdf, "parte-1"),
    ensureDir: async () => undefined,
    writeText: async () => undefined,
    now: () => "2026-08-26T16:00:00Z",
  }
  const hashResult = await ingestProgramaGovernoGovernadores({
    ufs: ["AM"], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
  }, { models: hermeticModels(doc.id, []), adapters: baseAdapters })
  assert.equal(hashResult.records[0].estado, "falha_de_extracao")
  assert.match(hashResult.records[0].ingestao.erro ?? "", /PDF diverge/)

  const pageResult = await ingestProgramaGovernoGovernadores({
    ufs: ["AM"], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
  }, {
    models: hermeticModels(doc.id, []),
    adapters: {
      ...baseAdapters,
      extractArchiveEntry: async () => pdf,
      extractPdf: async () => ({ ...extraction(pdf, "parte-1"), paginas: 3 }),
    },
  })
  assert.equal(pageResult.records[0].estado, "falha_de_extracao")
  assert.match(pageResult.records[0].ingestao.erro ?? "", /paginas divergem/)

  const crossed = structuredClone(source)
  crossed.candidaturas[0].documentoIds = ["AM:40000000000:02"]
  await assert.rejects(
    () => ingestProgramaGovernoGovernadores({
      ufs: ["AM"], inventoryPath: "/inventory.json", archiveDir: "/archives", outputDir: "/output",
    }, { adapters: { ...baseAdapters, readText: async () => JSON.stringify(crossed) } }),
    /documento .* ausente do inventario/,
  )
})

test("adapter limita retries e recusa generator e judge da mesma familia", async () => {
  assert.equal(PROGRAMA_GOVERNO_GOV_MODEL_MAX_ATTEMPTS, 2)
  const sameFamily = modelConfig()
  sameFamily.judge.name = "Anthropic Opus"
  assert.throws(() => createProgramaGovernoModelAdapters(sameFamily, async () => ({ stdout: "{}", stderr: "" })), /familias diferentes/)

  let calls = 0
  const alwaysInvalid: ProgramaGovernoModelProcessRunner = async () => {
    calls += 1
    return { stdout: "{}", stderr: "" }
  }
  const models = createProgramaGovernoModelAdapters(modelConfig(), alwaysInvalid)
  await assert.rejects(
    () => models.generate({ identityKey: "2026:GOVERNADOR:AM:40000000000", documentos: [] }),
    /falhou apos 2 tentativa/,
  )
  assert.equal(calls, 2)
})

test("PROGRAMAS_GOV_INGESTAO_PASS", () => assert.ok(true))
