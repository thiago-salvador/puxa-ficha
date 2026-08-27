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
  type ProgramaGovernoGovInventory,
  type ProgramaGovernoGovInventoryCandidate,
  type ProgramaGovernoGovInventoryDocument,
} from "../scripts/programas-governo-governadores-2026"
import {
  createProgramaGovernoModelAdapters,
  PROGRAMA_GOVERNO_GOV_EVAL_DIMENSIONS,
  PROGRAMA_GOVERNO_GOV_MODEL_MAX_ATTEMPTS,
  type ProgramaGovernoModelProcessRunner,
  type ProgramaGovernoModelsConfig,
} from "../scripts/programas-governo-governadores-2026-models"
import { auditProgramaGovernoRecordSet } from "../scripts/audit/audit-programas-governo"
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

function hermeticModels(documentoId: string, observations: string[], firstVerdict: "yes" | "no" | "unknown" = "yes") {
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
  return createProgramaGovernoModelAdapters(modelConfig(), runner)
}

test("CLI exige UFs, inventario, arquivos e saida explicitamente", () => {
  const parsed = parseProgramaGovernoGovernadoresArgs([
    "--ufs=AM,PI,AC,AM",
    "--inventory=fixtures/inventory.json",
    "--archive-dir=fixtures/archives",
    "--output-dir=fixtures/output",
  ])
  assert.deepEqual(parsed.ufs, ["AC", "AM", "PI"])
  assert.throws(() => parseProgramaGovernoGovernadoresArgs(["--ufs=XX"]), /use --ufs/)
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
  assert.equal(record.ingestao.modelos?.judge.name, "OpenAI GPT")
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
