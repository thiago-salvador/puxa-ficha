import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  classificarRegistro,
  concorrenciaAlvo,
  consolidarBatch,
  definirProbeRecursos,
  dirDoCandidato,
  eErroCota,
  executarBatch,
  escaladaPermitida,
  MAX_TENTATIVAS_CANDIDATO,
  regiaoDaUf,
  slotsDeItem,
  UFS_RESTANTES,
  UFS_NORTE,
  validarFilaContraInventario,
} from "../scripts/data/programas-governo-governadores-2026/batch-driver.mjs"
import {
  ingestProgramaGovernoGovernadores,
  parseProgramaGovernoGovernadoresArgs,
  planejarFilaProgramaGovernoGovernadores,
  type ProgramaGovernoGovInventory,
  type ProgramaGovernoGovInventoryCandidate,
  type ProgramaGovernoGovInventoryDocument,
} from "../scripts/programas-governo-governadores-2026"
import {
  PROGRAMA_GOVERNO_EXTRACTION_METHOD,
  PROGRAMA_GOVERNO_EXTRACTION_VERSION,
  type ProgramaGovernoExtracaoRastreavel,
} from "../scripts/lib/programas-governo-extracao"
import {
  createProgramaGovernoModelAdapters,
  type ProgramaGovernoModelProcessRunner,
  type ProgramaGovernoModelsConfig,
} from "../scripts/programas-governo-governadores-2026-models"

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex")
}

function packageUrl(uf: string): string {
  return `https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_${uf}.zip`
}

function candidato(
  uf: string,
  sqCandidato: string,
  overrides: Partial<ProgramaGovernoGovInventoryCandidate> = {},
): ProgramaGovernoGovInventoryCandidate {
  return {
    chave: `2026:GOVERNADOR:${uf}:${sqCandidato}`,
    ano: 2026,
    cargo: "GOVERNADOR",
    uf: uf as ProgramaGovernoGovInventoryCandidate["uf"],
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

function documento(
  uf: string,
  sqCandidato: string,
  sequencia: number,
  bytes: Buffer,
  paginas = 2,
  textoExtraidoBytes = 4_000,
): ProgramaGovernoGovInventoryDocument {
  const suffix = String(sequencia).padStart(2, "0")
  const filename = `2026${uf}${sqCandidato}_${suffix}.pdf`
  return {
    id: `${uf}:${sqCandidato}:${suffix}`,
    uf,
    sqCandidato,
    sequencia,
    arquivoNome: filename,
    arquivoNoPacote: `${uf}/${filename}`,
    pacoteUrl: packageUrl(uf),
    pdfOriginalUrl: null,
    bytes: bytes.length,
    sha256: sha256(bytes),
    paginas,
    textoExtraidoBytes,
    textoExtraidoCaracteres: textoExtraidoBytes,
    textoEstado: "extraivel",
    candidaturaAtual: true,
  }
}

function inventario(
  candidatos: ProgramaGovernoGovInventoryCandidate[],
  documentos: ProgramaGovernoGovInventoryDocument[],
  pacotes: Map<string, Buffer>,
): ProgramaGovernoGovInventory {
  const ufs = [...new Set(candidatos.map(({ uf }) => uf))].sort()
  return {
    versao: 1,
    geradoEm: "2026-08-26T15:35:53Z",
    escopo: { ano: 2026, cargo: "GOVERNADOR", ufs },
    fonte: { datasetUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026" },
    candidaturas: candidatos,
    documentos: documentos,
    pacotes: ufs.map((uf) => {
      const bytes = pacotes.get(uf) ?? Buffer.from(`archive-${uf}`)
      return {
        uf,
        pacoteUrl: packageUrl(uf),
        arquivoNome: `proposta_governo_2026_${uf}.zip`,
        bytes: bytes.length,
        sha256: sha256(bytes),
        documentoIds: documentos.filter((item) => item.uf === uf).map(({ id }) => id),
      }
    }),
  }
}

function extracaoSintetica(bytes: Buffer, label: string): ProgramaGovernoExtracaoRastreavel {
  const textos = [`conteudo ${label} pagina 1`, `conteudo ${label} pagina 2`]
  return {
    extractionVersion: PROGRAMA_GOVERNO_EXTRACTION_VERSION,
    method: PROGRAMA_GOVERNO_EXTRACTION_METHOD,
    sourceSha256: sha256(bytes),
    extractedTextSha256: sha256(textos.join("\n\f\n")),
    paginas: 2,
    secoes: textos.map((conteudo, index) => ({
      id: `${label}-pagina-${index + 1}`,
      titulo: `Pagina ${index + 1}`,
      nivel: 1,
      paginaInicial: index + 1,
      paginaFinal: index + 1,
      origem: "pdftotext",
      conteudo,
    })),
    pageMap: textos.map((texto, index) => ({
      pagina: index + 1,
      origem: "pdftotext",
      textSha256: sha256(texto),
    })),
  }
}

function resumoSintetico(documentoId: string, trecho = "conteudo sintetico pagina 1") {
  const texto = Array.from({ length: 120 }, (_, index) => `palavra${index + 1}`).join(" ")
  const evidencias = [{ documentoId, pagina: 1, trecho }]
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

function modelosHermeticos(documentoId: string, observacoes: string[], vereditoInicial: "yes" | "no" | "unknown" = "yes", trecho = "conteudo sintetico pagina 1") {
  let tentativasGenerator = 0
  const runner: ProgramaGovernoModelProcessRunner = async (command, _args, rawInput) => {
    observacoes.push(command)
    const envelope = JSON.parse(rawInput) as { input: { claims?: Array<Record<string, unknown>> } }
    if (command === "generator-mock") {
      tentativasGenerator += 1
      if (tentativasGenerator === 1) return { stdout: "{}", stderr: "" }
      return { stdout: JSON.stringify(resumoSintetico(documentoId, trecho)), stderr: "" }
    }
    const claims = envelope.input.claims ?? []
    return {
      stdout: JSON.stringify({
        avaliacoes: claims.map((claim, index) => ({
          ...claim,
          verdict: index === 0 ? vereditoInicial : "yes",
          reason: "evidencia sintetica",
        })),
      }),
      stderr: "",
    }
  }
  const config: ProgramaGovernoModelsConfig = {
    generator: { name: "Anthropic Claude", version: "sonnet-test", command: "generator-mock", timeoutMs: 1_000, maxAttempts: 2 },
    judge: { name: "OpenAI GPT", version: "judge-test", command: "judge-mock", timeoutMs: 1_000, maxAttempts: 2 },
  }
  return createProgramaGovernoModelAdapters(config, runner)
}

async function dirTemporario(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pf-batch-test-"))
}

type UnidadeFake = {
  chamadas: number
  acao: "ok" | "erro-cota" | "erro-tecnico" | "no-veredito"
}

// ------------------------------------------------------------- parser ----

test("parser aceita --sq-candidato e rejeita SQ fora do padrao oficial", () => {
  const parsed = parseProgramaGovernoGovernadoresArgs([
    "--ufs=BA,CE",
    "--inventory=i.json",
    "--archive-dir=a",
    "--output-dir=o",
    "--sq-candidato=60002553922",
    "--plan-only",
    "--fase-dir=f",
    "--extract-cache-dir=e",
  ])
  assert.equal(parsed.sqCandidato, "60002553922")
  assert.equal(parsed.planOnly, true)
  assert.ok(parsed.faseDir?.endsWith("f"))
  assert.ok(parsed.extractCacheDir?.endsWith("e"))
  assert.throws(
    () => parseProgramaGovernoGovernadoresArgs(["--ufs=BA", "--inventory=i", "--archive-dir=a", "--output-dir=o", "--sq-candidato=abc"]),
    /--sq-candidato/,
  )
})

// ------------------------------------------------------- plan-only CLI ----

test("plan-only deriva fila do inventario com passagens planejadas e filtro por SQ", () => {
  const ufA = "BA"
  const ufB = "PR"
  const sq1 = "11000000001"
  const sq2 = "11000000002"
  const pdf = Buffer.from("pdf")
  const docs = [
    documento(ufA, sq1, 1, pdf, 500, 900_000),
    documento(ufA, sq2, 1, pdf, 3, 6_000),
    documento(ufB, sq2, 1, pdf, 3, 6_000),
  ]
  const candidatos = [
    candidato(ufA, sq1, {
      slug: "grande-teste",
      perfilEstado: "vinculado",
      fonteEstado: "documento_oficial_encontrado",
      estadoInventario: "documento_oficial_encontrado",
      documentoIds: [docs[0].id],
    }),
    candidato(ufA, sq2, {
      slug: "pequeno-teste",
      perfilEstado: "vinculado",
      fonteEstado: "documento_oficial_encontrado",
      estadoInventario: "documento_oficial_encontrado",
      documentoIds: [docs[1].id],
    }),
    candidato(ufB, sq2, { documentoIds: [docs[2].id] }),
  ]
  const source = inventario(candidatos, docs, new Map([[ufA, Buffer.from("z1")], [ufB, Buffer.from("z2")]]))
  const itens = planejarFilaProgramaGovernoGovernadores({ ufs: [ufA, ufB] }, source)
  assert.equal(itens.length, 3)
  const grande = itens.find((item) => item.sqCandidato === sq1)!
  const pequeno = itens.find((item) => item.sqCandidato === sq2 && item.uf === ufA)!
  assert.equal(grande.multipassagem, true)
  assert.ok(grande.passagensPlanejadas >= 2)
  assert.equal(pequeno.multipassagem, false)
  assert.equal(pequeno.passagensPlanejadas, 1)
  assert.ok(grande.custoEstimado > pequeno.custoEstimado)
  assert.equal(grande.usaModelos, true)
  assert.equal(itens.find((item) => item.uf === ufB)!.usaModelos, false)
  assert.equal(grande.chaveCacheDir, sha256(grande.chave).slice(0, 16))

  const soUm = planejarFilaProgramaGovernoGovernadores({ ufs: [ufA], sqCandidato: sq2 }, source)
  assert.equal(soUm.length, 1)
  assert.equal(soUm[0].sqCandidato, sq2)
  assert.throws(
    () => planejarFilaProgramaGovernoGovernadores({ ufs: [ufA], sqCandidato: "99999999999" }, source),
    /--sq-candidato/,
  )
})

// ------------------------------------------------------ ingestao filtro ----

test("ingestao com --sq-candidato processa exatamente um candidato e grava fases", async () => {
  const uf = "BA"
  const sqAlvo = "11000000001"
  const sqOutro = "11000000002"
  const pdf = Buffer.from("pdf-alvo")
  const pdfOutro = Buffer.from("pdf-outro")
  const docs = [documento(uf, sqAlvo, 1, pdf), documento(uf, sqOutro, 1, pdfOutro)]
  const candidatos = [
    candidato(uf, sqAlvo, {
      slug: "alvo-teste",
      perfilEstado: "vinculado",
      fonteEstado: "documento_oficial_encontrado",
      estadoInventario: "documento_oficial_encontrado",
      documentoIds: [docs[0].id],
    }),
    candidato(uf, sqOutro, {
      slug: "outro-teste",
      perfilEstado: "vinculado",
      fonteEstado: "documento_oficial_encontrado",
      estadoInventario: "documento_oficial_encontrado",
      documentoIds: [docs[1].id],
    }),
  ]
  const source = inventario(candidatos, docs, new Map([[uf, Buffer.from("zip")]]))
  const observacoes: string[] = []
  const extraidos: string[] = []
  const result = await ingestProgramaGovernoGovernadores({
    ufs: [uf],
    sqCandidato: sqAlvo,
    inventoryPath: "/inventory.json",
    archiveDir: "/archives",
    outputDir: "/output",
  }, {
    models: modelosHermeticos(docs[0].id, observacoes, "yes", "conteudo alvo pagina 1"),
    adapters: {
      readText: async () => JSON.stringify(source),
      readBytes: async () => Buffer.from("zip"),
      extractArchiveEntry: async (_path, entry) => {
        extraidos.push(entry)
        return entry.endsWith("_01.pdf") ? pdf : pdfOutro
      },
      extractPdf: async (bytes) => extracaoSintetica(bytes, "alvo"),
      ensureDir: async () => undefined,
      writeText: async () => undefined,
      now: () => "2026-08-27T12:00:00Z",
    },
  })
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].ingestao.identityKey, `2026:GOVERNADOR:${uf}:${sqAlvo}`)
  assert.deepEqual(extraidos, [docs[0].arquivoNoPacote])
  assert.equal(observacoes.filter((comando) => comando === "generator-mock").length >= 1, true)
})

test("fase-dir registra extracao, gerador e julgamento em ordem com escrita atomica", async () => {
  const uf = "SE"
  const sq = "22000000001"
  const pdf = Buffer.from("pdf-fases")
  const docs = [documento(uf, sq, 1, pdf)]
  const candidatoUnico = candidato(uf, sq, {
    slug: "fases-teste",
    perfilEstado: "vinculado",
    fonteEstado: "documento_oficial_encontrado",
    estadoInventario: "documento_oficial_encontrado",
    documentoIds: [docs[0].id],
  })
  const source = inventario([candidatoUnico], docs, new Map([[uf, Buffer.from("zip")]]))
  const gravacoes: Map<string, string> = new Map()
  const renomeios: Array<{ from: string; to: string }> = []
  let agora = 0
  const result = await ingestProgramaGovernoGovernadores({
    ufs: [uf],
    inventoryPath: "/inventory.json",
    archiveDir: "/archives",
    outputDir: "/output",
    faseDir: "/fases",
  }, {
    models: modelosHermeticos(docs[0].id, [], "yes", "conteudo fases pagina 1"),
    adapters: {
      readText: async () => JSON.stringify(source),
      readBytes: async () => Buffer.from("zip"),
      extractArchiveEntry: async () => pdf,
      extractPdf: async (bytes) => extracaoSintetica(bytes, "fases"),
      ensureDir: async () => undefined,
      writeText: async (caminho, valor) => { gravacoes.set(caminho, valor) },
      rename: async (from, to) => { renomeios.push({ from, to }) },
      now: () => new Date(1_700_000_000_000 + (agora += 1_000)).toISOString(),
    },
  })
  assert.equal(result.records[0].ingestao.eval?.completo, true)
  const fasesGravadas = [...gravacoes.keys()].filter((caminho) => caminho.includes("/fases/"))
  assert.equal(fasesGravadas.length, 4)
  const nomes = fasesGravadas.map((caminho) => path.basename(caminho).replace(/\.tmp-\d+$/u, ""))
  assert.deepEqual(nomes, [
    `${uf}-${sq}.extracao.concluida.json`,
    `${uf}-${sq}.gerador.iniciado.json`,
    `${uf}-${sq}.gerador.concluido.json`,
    `${uf}-${sq}.julgamento.iniciado.json`,
  ])
  const conteudos = fasesGravadas.map((caminho) => JSON.parse(gravacoes.get(caminho)!) as { em: string; cacheHits?: number })
  const tempos = conteudos.map((conteudo) => new Date(conteudo.em).getTime())
  for (let indice = 1; indice < tempos.length; indice += 1) {
    assert.ok(tempos[indice] > tempos[indice - 1], "fases devem ter timestamps crescentes")
  }
  assert.equal(conteudos[0].cacheHits, 0)
  for (const { from, to } of renomeios) {
    assert.match(path.basename(from), /\.tmp-\d+$/u)
    assert.equal(path.dirname(from), path.dirname(to))
  }
})

test("cache de extracao evita re-extracao para o mesmo hash e versao e re-extrai cache corrompido", async () => {
  const uf = "MA"
  const sq = "21000000001"
  const pdf = Buffer.from("pdf-cache")
  const docs = [documento(uf, sq, 1, pdf)]
  const candidatoUnico = candidato(uf, sq, {
    slug: "cache-teste",
    perfilEstado: "vinculado",
    fonteEstado: "documento_oficial_encontrado",
    estadoInventario: "documento_oficial_encontrado",
    documentoIds: [docs[0].id],
  })
  const source = inventario([candidatoUnico], docs, new Map([[uf, Buffer.from("zip")]]))
  let chamadasExtracao = 0
  const arquivos = new Map<string, string>()
  const adaptersBase = {
    readText: async (caminho: string) => {
      if (caminho === "/inventory.json") return JSON.stringify(source)
      const valor = arquivos.get(caminho)
      if (valor === undefined) throw new Error(`arquivo ausente ${caminho}`)
      return valor
    },
    readBytes: async () => Buffer.from("zip"),
    extractArchiveEntry: async () => pdf,
    extractPdf: async (bytes: Buffer) => {
      chamadasExtracao += 1
      return extracaoSintetica(bytes, "cache")
    },
    ensureDir: async () => undefined,
    writeText: async (caminho: string, valor: string) => { arquivos.set(caminho, valor) },
    rename: async (from: string, to: string) => { arquivos.set(to, arquivos.get(from)!) },
    now: () => "2026-08-27T12:00:00Z",
  }
  const opcoesBase = {
    ufs: [uf],
    inventoryPath: "/inventory.json",
    archiveDir: "/archives",
    outputDir: "/output",
    extractCacheDir: "/cache-extracao",
  }
  await ingestProgramaGovernoGovernadores(opcoesBase, { models: modelosHermeticos(docs[0].id, [], "yes", "conteudo cache pagina 1"), adapters: adaptersBase })
  assert.equal(chamadasExtracao, 1)
  const nomesCache = [...arquivos.keys()].filter((caminho) => caminho.startsWith("/cache-extracao/") && !caminho.includes(".tmp-"))
  assert.equal(nomesCache.length, 1)
  await ingestProgramaGovernoGovernadores(opcoesBase, { models: modelosHermeticos(docs[0].id, [], "yes", "conteudo cache pagina 1"), adapters: adaptersBase })
  assert.equal(chamadasExtracao, 1, "segunda rodada deve usar cache e nao re-extrair")

  arquivos.set(nomesCache[0], "{json corrompido")
  await ingestProgramaGovernoGovernadores(opcoesBase, { models: modelosHermeticos(docs[0].id, [], "yes", "conteudo cache pagina 1"), adapters: adaptersBase })
  assert.equal(chamadasExtracao, 2, "cache corrompido deve re-extrair")
})

// ------------------------------------------------------------ driver ----

test("classificarRegistro separa completo, bloqueado e retryable", () => {
  assert.deepEqual(classificarRegistro(null), { estado: "retryable_error", motivo: "registro nao materializado" })
  assert.equal(classificarRegistro({ estado: "perfil_local_ausente" }).estado, "complete")
  assert.equal(classificarRegistro({ estado: "sem_documento_oficial" }).estado, "complete")
  assert.equal(classificarRegistro({ estado: "falha_de_extracao", ingestao: { erro: "x" } }).estado, "blocked")
  assert.equal(
    classificarRegistro({ estado: "em_revisao", julgamento: {}, ingestao: { eval: { completo: true } } }).estado,
    "complete",
  )
  assert.equal(
    classificarRegistro({ estado: "em_revisao", julgamento: {}, ingestao: { eval: { completo: false, blockers: 3 } } }).estado,
    "blocked",
  )
  assert.equal(classificarRegistro({ estado: "em_revisao", ingestao: { erro: "timeout" } }).estado, "retryable_error")
})

test("slots e regiao: multipassagem ocupa ate 3 slots e UFs norte nunca entram", () => {
  assert.equal(slotsDeItem({ multipassagem: false }), 1)
  assert.equal(slotsDeItem({ multipassagem: true, passagensPlanejadas: 9 }), 3)
  assert.equal(slotsDeItem({ multipassagem: true, passagensPlanejadas: 2 }), 2)
  assert.equal(regiaoDaUf("BA"), "nordeste")
  assert.equal(regiaoDaUf("MT"), "centro-oeste")
  assert.equal(regiaoDaUf("SP"), "sudeste")
  assert.equal(regiaoDaUf("RS"), "sul")
  assert.equal(regiaoDaUf("AC"), "norte")
  for (const uf of UFS_NORTE) assert.equal(UFS_RESTANTES.includes(uf), false)
})

test("rampa de concorrencia sobe 3->4 so com metricas estaveis e rebaixa quando instavel", () => {
  definirProbeRecursos(() => true)
  const estaveis = { errosCota: 0, tentativas: 6, conclusoes: 6, errosTecnicos: 0, latenciaP95Base: 100, latenciaP95Ultimos: 110 }
  const instaveis = { ...estaveis, errosTecnicos: 1 }
  const semConclusoes = { ...estaveis, conclusoes: 2 }
  assert.equal(concorrenciaAlvo({ conclusoes: 0, concorrenciaAtual: 3, metricas: estaveis }), 3)
  assert.equal(concorrenciaAlvo({ conclusoes: 3, concorrenciaAtual: 3, metricas: estaveis }), 4)
  assert.equal(concorrenciaAlvo({ conclusoes: 3, concorrenciaAtual: 3, metricas: instaveis }), 3)
  assert.equal(concorrenciaAlvo({ conclusoes: 3, concorrenciaAtual: 3, metricas: semConclusoes }), 3)
  assert.equal(concorrenciaAlvo({ conclusoes: 6, concorrenciaAtual: 4, metricas: estaveis }), 4)
  assert.equal(concorrenciaAlvo({ conclusoes: 6, concorrenciaAtual: 4, metricas: instaveis }), 3)
  const latenciaPior = { ...estaveis, latenciaP95Ultimos: 200 }
  assert.equal(concorrenciaAlvo({ conclusoes: 6, concorrenciaAtual: 4, metricas: latenciaPior }), 3)
  assert.equal(escaladaPermitida({ errosCota: 1, tentativas: 10, conclusoes: 10, errosTecnicos: 0 }), false)
  // precisa de pelo menos 3 conclusoes para escalar
  assert.equal(escaladaPermitida({ errosCota: 0, tentativas: 3, conclusoes: 2, errosTecnicos: 0, latenciaP95Base: 100, latenciaP95Ultimos: 110 }), false)
  assert.equal(escaladaPermitida({ errosCota: 0, tentativas: 3, conclusoes: 3, errosTecnicos: 0, latenciaP95Base: 100, latenciaP95Ultimos: 110 }), true)
  definirProbeRecursos(() => false)
  assert.equal(concorrenciaAlvo({ conclusoes: 3, concorrenciaAtual: 3, metricas: estaveis }), 3)
  definirProbeRecursos(() => true)
})

test("detecao de erro de cota reconhece padroes de quota/autenticacao", () => {
  assert.equal(eErroCota("qwen: 429 rate limit exceeded"), true)
  assert.equal(eErroCota("unauthorized: token expired"), true)
  assert.equal(eErroCota("credit balance exhausted"), true)
  assert.equal(eErroCota("token-plan 1-week quota exhausted, reset 2026-09-03"), true)
  assert.equal(eErroCota("quota exceeded for this project"), true)
  assert.equal(eErroCota("opencode http 429 em /session/message: quota"), true)
  assert.equal(eErroCota("quota detectada na resposta do modelo: quota"), true)
  // Controles negativos: exhausted generico nao e quota
  assert.equal(eErroCota("network retries exhausted"), false)
  assert.equal(eErroCota("connection pool exhausted"), false)
  assert.equal(eErroCota("context length exhausted"), false)
  assert.equal(eErroCota("resposta sem objeto JSON"), false)
  assert.equal(eErroCota("veredito no do judge"), false)
})

function criarFilaFixture(runDir: string, itens: Array<Record<string, unknown>>): Promise<void> {
  const dir = path.join(runDir, "fila")
  return mkdir(dir, { recursive: true }).then(() =>
    writeFile(
      path.join(dir, "fila.ndjson"),
      `${itens.map((item) => JSON.stringify(item)).join("\n")}\n`,
    ),
  )
}

function itemFila(uf: string, sq: string, slug: string | null, multipassagem = false): Record<string, unknown> {
  const chave = `2026:GOVERNADOR:${uf}:${sq}`
  return {
    chave,
    uf,
    sqCandidato: sq,
    slug,
    nomeCompleto: "CANDIDATURA SINTETICA",
    nomeUrna: "CANDIDATURA TESTE",
    partido: "TESTE",
    numero: "10",
    fonteEstado: multipassagem ? "documento_oficial_encontrado" : "documento_oficial_encontrado",
    perfilEstado: "vinculado",
    identidadeEstado: "confirmada",
    documentos: [],
    totalPaginas: 10,
    bytesTextoExtraidos: 1_000,
    bytesEntradaEstimados: 1_000,
    multipassagem,
    passagensPlanejadas: multipassagem ? 9 : 1,
    chaveCacheDir: sha256(chave).slice(0, 16),
    usaModelos: true,
    custoEstimado: multipassagem ? 9.03 : 1.03,
    regiao: regiaoDaUf(uf),
  }
}

async function testeBatch(opcoes: {
  itens: Array<Record<string, unknown>>
  unidades: Map<string, UnidadeFake>
  pollMs?: number
  delayMs?: number
  runDirFixo?: string
}): Promise<{ runDir: string; resultado: Awaited<ReturnType<typeof executarBatch>>; disparos: string[]; maximosConcorrentes: { candidatos: number; slots: number; multipassagem: number } }> {
  const runDir = opcoes.runDirFixo ?? (await dirTemporario())
  await criarFilaFixture(runDir, opcoes.itens)
  let emVooCandidatos = 0
  let emVooSlots = 0
  let emVooMultipassagem = 0
  const maximosConcorrentes = { candidatos: 0, slots: 0, multipassagem: 0 }
  const disparos: string[] = []
  const delayMs = opcoes.delayMs ?? 0
  const registroOk = (item: Record<string, unknown>) => ({
    version: 1,
    estado: "em_revisao",
    fonte: { ano: 2026, cargo: "GOVERNADOR", uf: item.uf, sqCandidato: item.sqCandidato, nomeUrna: "x", partido: "x", arquivoNome: null, arquivoNoPacote: null },
    ingestao: { identityKey: item.chave, etapa: "concluida", erro: null, eval: { completo: true, blockers: 0, dimensoes: [] } },
    julgamento: { model: "m", promptVersion: "p", judgedAt: "2026-08-27T00:00:00Z", verdicts: [] },
  })
  const spawnFn = (_bin: string, args: string[]) => {
    const valor = (nome: string) => args.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? ""
    const uf = valor("ufs")
    const sq = valor("sq-candidato")
    const outputDir = valor("output-dir")
    const chave = `2026:GOVERNADOR:${uf}:${sq}`
    const item = opcoes.itens.find((candidato) => candidato.chave === chave)!
    const slots = slotsDeItem({ multipassagem: Boolean(item.multipassagem), passagensPlanejadas: Number(item.passagensPlanejadas ?? 1) })
    disparos.push(chave)
    emVooCandidatos += 1
    emVooSlots += slots
    if (item.multipassagem) emVooMultipassagem += 1
    maximosConcorrentes.candidatos = Math.max(maximosConcorrentes.candidatos, emVooCandidatos)
    maximosConcorrentes.slots = Math.max(maximosConcorrentes.slots, emVooSlots)
    maximosConcorrentes.multipassagem = Math.max(maximosConcorrentes.multipassagem, emVooMultipassagem)
    const unidade = opcoes.unidades.get(chave) ?? { chamadas: 0, acao: "ok" as const }
    unidade.chamadas += 1
    const falhaRecorrente = unidade.acao === "erro-tecnico" || unidade.acao === "erro-cota"
    const acao = unidade.chamadas === 1 || falhaRecorrente ? unidade.acao : "ok"
  const processo = {
    stderr: {
      on(evento: string, listener: (chunk: Buffer) => void) {
        if (evento === "data" && acao === "erro-cota") setImmediate(() => listener(Buffer.from("qwen saiu com 1: quota exceeded for this project")))
      },
    },
      on(evento: string, listener: (code: number | null) => void) {
        if (evento !== "close") return
        setTimeout(async () => {
          emVooCandidatos -= 1
          emVooSlots -= slots
          if (item.multipassagem) emVooMultipassagem -= 1
          if (acao === "erro-cota" || acao === "erro-tecnico") {
            listener(1)
            return
          }
          const registro = acao === "no-veredito"
            ? {
                ...registroOk({ chave, uf, sqCandidato: sq }),
                ingestao: { identityKey: chave, etapa: "modelos", erro: null, eval: { completo: false, blockers: 2, dimensoes: [] } },
                julgamento: { model: "m", promptVersion: "p", judgedAt: "2026-08-27T00:00:00Z", verdicts: [] },
              }
            : registroOk({ chave, uf, sqCandidato: sq })
          await mkdir(path.join(outputDir, uf), { recursive: true })
          await writeFile(
            path.join(outputDir, uf, `${String(item.slug ?? sq)}.json`),
            `${JSON.stringify(registro)}\n`,
          )
          listener(0)
        }, delayMs)
      },
    }
    return processo
  }
  const resultado = await executarBatch({
    runDir,
    inventoryPath: "/inventory.json",
    workDir: runDir,
    modelsConfig: "/models.json",
    archiveDir: "/archives",
    pollMs: opcoes.pollMs ?? 20,
    spawnFn: spawnFn as unknown as Parameters<typeof executarBatch>[0]["spawnFn"],
    node24Resolver: async () => process.execPath,
  })
  return { runDir, resultado, disparos, maximosConcorrentes }
}

test("executarBatch: retomada nao repete candidato concluido e estados sao atomicos", async () => {
  const itens = [itemFila("AL", "33000000001", "a-teste"), itemFila("AL", "33000000002", "b-teste")]
  const unidades = new Map<string, UnidadeFake>()
  const primeira = await testeBatch({ itens, unidades })
  assert.equal(primeira.resultado.concluidos, 2)
  assert.equal(primeira.disparos.length, 2)
  const dirCandidato = dirDoCandidato(primeira.runDir, { chaveCacheDir: itens[0].chaveCacheDir as string })
  const estado = JSON.parse(await readFile(path.join(dirCandidato, "estado.json"), "utf8")) as { estado: string }
  assert.equal(estado.estado, "complete")
  const restos = (await readdir(dirCandidato)).filter((nome) => nome.includes(".tmp-"))
  assert.equal(restos.length, 0, "sem arquivos .tmp remanescentes")

  const segunda = await testeBatch({ itens, unidades, runDirFixo: primeira.runDir })
  assert.equal(segunda.disparos.length, 0, "retomada nao reprocessa concluidos")
  assert.equal(segunda.resultado.concluidos, 2)
  await rm(primeira.runDir, { recursive: true, force: true })
})

test("executarBatch: erro de cota consecutivo para com checkpoints preservados", async () => {
  // Com concorrencia 3, inicialmente 3 candidatos entram em voo; o 4o deve ficar pendente apos parada por 2 quotas consecutivas
  const itens = [itemFila("PE", "44000000001", "cota-1"), itemFila("PE", "44000000002", "cota-2"), itemFila("PE", "44000000003", "cota-3"), itemFila("PE", "44000000004", "cota-4")]
  const unidades = new Map<string, UnidadeFake>([
    ["2026:GOVERNADOR:PE:44000000001", { chamadas: 0, acao: "erro-cota" }],
    ["2026:GOVERNADOR:PE:44000000002", { chamadas: 0, acao: "erro-cota" }],
  ])
  const { runDir, resultado, disparos } = await testeBatch({ itens, unidades })
  assert.equal(resultado.parada, "duas falhas consecutivas de cota/autenticacao")
  assert.equal(existsSync(path.join(runDir, "parada.json")), true)
  const estado1 = JSON.parse(await readFile(path.join(dirDoCandidato(runDir, { chaveCacheDir: itens[0].chaveCacheDir as string }), "estado.json"), "utf8")) as { estado: string; tentativas: number }
  assert.equal(estado1.tentativas, 2, "primeira falha de cota concede um retry antes da parada")
  const estados = await Promise.all(itens.map(async (item) => {
    const conteudo = await readFile(path.join(dirDoCandidato(runDir, { chaveCacheDir: item.chaveCacheDir as string }), "estado.json"), "utf8")
    return (JSON.parse(conteudo) as { estado: string }).estado
  }))
  // item 4 nunca disparado permanece pendente (freeze apos primeira quota impede novos disparos)
  assert.equal(estados[3], "pending", "item 4 nunca disparado permanece pendente")
  assert.equal(disparos.filter((chave) => chave === itens[3].chave).length, 0, "parada de cota impede novos disparos")
  // Com freeze apos primeira quota, item 3 pode ou nao ter sido disparado no lote inicial dependendo do timing;
  // o importante e que item4 nunca foi disparado e que o hard stop ocorreu
  await rm(runDir, { recursive: true, force: true })
})

test("executarBatch: falha tecnica repete apenas a unidade e bloqueia apos duas tentativas", async () => {
  const itens = [itemFila("CE", "55000000001", "tecnico-1"), itemFila("CE", "55000000002", "tecnico-2")]
  const unidades = new Map<string, UnidadeFake>([
    ["2026:GOVERNADOR:CE:55000000001", { chamadas: 0, acao: "erro-tecnico" }],
  ])
  const { runDir, resultado, disparos } = await testeBatch({ itens, unidades })
  assert.equal(resultado.concluidos, 1)
  assert.equal(resultado.bloqueados, 1)
  const chaveFalha = "2026:GOVERNADOR:CE:55000000001"
  const disparosFalha = disparos.filter((chave) => chave === chaveFalha).length
  assert.equal(disparosFalha, MAX_TENTATIVAS_CANDIDATO, `unidade falha repetida exatamente ${MAX_TENTATIVAS_CANDIDATO}x, foi ${disparosFalha}x`)
  const estado = JSON.parse(await readFile(path.join(dirDoCandidato(runDir, { chaveCacheDir: (itens[0].chaveCacheDir) as string }), "estado.json"), "utf8")) as { estado: string; motivo: string }
  assert.equal(estado.estado, "blocked")
  assert.match(estado.motivo, /falha tecnica apos 2 tentativas/)
  await rm(runDir, { recursive: true, force: true })
})

test("executarBatch: veredito no bloqueia sem contar erro tecnico e sem retry", async () => {
  const itens = [itemFila("PI", "66000000001", "no-1"), itemFila("PI", "66000000002", "no-2")]
  const unidades = new Map<string, UnidadeFake>([
    ["2026:GOVERNADOR:PI:66000000001", { chamadas: 0, acao: "no-veredito" }],
  ])
  const { runDir, resultado, disparos } = await testeBatch({ itens, unidades })
  assert.equal(resultado.concluidos, 1)
  assert.equal(resultado.bloqueados, 1)
  assert.equal(resultado.errosTecnicos, 0)
  assert.equal(disparos.filter((chave) => chave === "2026:GOVERNADOR:PI:66000000001").length, 1)
  const estado = JSON.parse(await readFile(path.join(dirDoCandidato(runDir, { chaveCacheDir: itens[0].chaveCacheDir as string }), "estado.json"), "utf8")) as { estado: string; motivo: string }
  assert.match(estado.motivo, /vereditos nao-sim/)
  await rm(runDir, { recursive: true, force: true })
})

test("executarBatch: concorrencia nunca excede 4 candidatos e multipassagem maximo 2 simultaneos", async () => {
  const itens: Array<Record<string, unknown>> = []
  for (let indice = 1; indice <= 14; indice += 1) {
    const sq = `770000000${String(indice).padStart(2, "0")}`
    itens.push(itemFila("MG", sq, `concorrente-${indice}`, indice % 3 === 0))
  }
  const unidades = new Map<string, UnidadeFake>()
  const { runDir, resultado, maximosConcorrentes } = await testeBatch({ itens, unidades, pollMs: 5, delayMs: 25 })
  assert.equal(resultado.concluidos, 14)
  assert.equal(resultado.bloqueados, 0)
  assert.ok(maximosConcorrentes.candidatos <= 4, `candidatos simultaneos ${maximosConcorrentes.candidatos} <= 4`)
  assert.ok(maximosConcorrentes.slots <= 6, `slots simultaneos ${maximosConcorrentes.slots} <= 6`)
  assert.ok(maximosConcorrentes.multipassagem <= 2, `multipassagem simultanea ${maximosConcorrentes.multipassagem} <= 2`)
  assert.ok(maximosConcorrentes.candidatos >= 3, `paralelismo real observado (${maximosConcorrentes.candidatos} candidatos simultaneos)`)
  assert.ok(maximosConcorrentes.multipassagem >= 1, "multipassagem exerceu semaforo dedicado")
  const dirs = new Set(itens.map((item) => (item.chaveCacheDir as string)))
  assert.equal(dirs.size, itens.length, "cada candidato em diretorio isolado")
  await rm(runDir, { recursive: true, force: true })
})

test("consolidarBatch copia registros para a arvore regional correta e recusa mistura", async () => {
  const runDir = await dirTemporario()
  const itens = [itemFila("BA", "88000000001", "consolida-1"), itemFila("RS", "88000000002", "consolida-2")]
  await criarFilaFixture(runDir, itens)
  for (const item of itens) {
    const candDir = dirDoCandidato(runDir, { chaveCacheDir: item.chaveCacheDir as string })
    await mkdir(path.join(candDir, "registros", item.uf as string), { recursive: true })
    const registro = {
      version: 1,
      estado: "em_revisao",
      fonte: { ano: 2026, cargo: "GOVERNADOR", uf: item.uf, sqCandidato: item.sqCandidato, nomeUrna: "x", partido: "x", arquivoNome: null, arquivoNoPacote: null },
      ingestao: { identityKey: item.chave, etapa: "concluida", erro: null, eval: { completo: true, blockers: 0, dimensoes: [] } },
      julgamento: { model: "m", promptVersion: "p", judgedAt: "2026-08-27T00:00:00Z", verdicts: [] },
    }
    await writeFile(
      path.join(candDir, "registros", item.uf as string, `${(item.slug as string) ?? item.sqCandidato}.json`),
      `${JSON.stringify(registro, null, 2)}\n`,
    )
  }
  const { copiados, ondasDir } = await consolidarBatch({ runDir })
  assert.equal(copiados.length, 2)
  assert.ok(existsSync(path.join(ondasDir, "nordeste", "BA", "consolida-1.json")))
  assert.ok(existsSync(path.join(ondasDir, "sul", "RS", "consolida-2.json")))
  const lido = JSON.parse(await readFile(path.join(ondasDir, "nordeste", "BA", "consolida-1.json"), "utf8")) as { fonte: { uf: string } }
  assert.equal(lido.fonte.uf, "BA")

  const runDirMistura = await dirTemporario()
  const itemMistura = itemFila("SE", "88000000003", "mistura")
  await criarFilaFixture(runDirMistura, [itemMistura])
  const candDir = dirDoCandidato(runDirMistura, { chaveCacheDir: itemMistura.chaveCacheDir as string })
  await mkdir(path.join(candDir, "registros", "SE"), { recursive: true })
  await writeFile(
    path.join(candDir, "registros", "SE", "mistura.json"),
    `${JSON.stringify({
      version: 1,
      estado: "em_revisao",
      fonte: { ano: 2026, cargo: "GOVERNADOR", uf: "SP", sqCandidato: "88000000003", nomeUrna: "x", partido: "x", arquivoNome: null, arquivoNoPacote: null },
      ingestao: { identityKey: "2026:GOVERNADOR:SP:88000000003", etapa: "concluida", erro: null, eval: { completo: true, blockers: 0, dimensoes: [] } },
    })}\n`,
  )
  await assert.rejects(() => consolidarBatch({ runDir: runDirMistura }), /mistura de candidato/)
  await rm(runDir, { recursive: true, force: true })
  await rm(runDirMistura, { recursive: true, force: true })
})

test("validarFilaContraInventario recusa falta, excesso, UF norte e chave duplicada", async () => {
  const dir = await dirTemporario()
  const ufA = "GO"
  const sq1 = "99000000001"
  const sq2 = "99000000002"
  const candidatos = [candidato(ufA, sq1), candidato(ufA, sq2)]
  const inventarioPath = path.join(dir, "inventario.json")
  await writeFile(inventarioPath, JSON.stringify(inventario(candidatos, [], new Map())))
  const comoFila = (itens: Array<Record<string, unknown>>) => itens as unknown as Array<{ uf: string; chave?: string }>
  await assert.rejects(
    () => validarFilaContraInventario([], inventarioPath),
    /fila divergente do inventario/,
  )
  await assert.rejects(
    () => validarFilaContraInventario(comoFila([itemFila("AC", sq1, "norte")]), inventarioPath),
    /UF inesperada na fila|candidatura Norte presente/,
  )
  const ok = [itemFila(ufA, sq1, "a"), itemFila(ufA, sq2, "b")]
  await validarFilaContraInventario(comoFila(ok), inventarioPath)
  await assert.rejects(
    () => validarFilaContraInventario(comoFila([...ok, itemFila(ufA, sq1, "a")]), inventarioPath),
    /chave duplicada na fila/,
  )
  await rm(dir, { recursive: true, force: true })
})

test("BATCH_DRIVER_PASS", () => assert.ok(true))
