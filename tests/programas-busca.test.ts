import "./helpers/server-only"
import { strict as assert } from "node:assert"
import test from "node:test"

import {
  buscarProgramasEmRegistros,
  createProgramaBuscaEngine,
  type ProgramaBuscaRegistro,
} from "@/lib/programa-governo-busca"
import {
  buscarProgramas,
  createProgramaBuscaIndexLoader,
  parseProgramaBuscaFiltros,
  ProgramaBuscaFiltroError,
} from "@/lib/programa-governo-busca-server"
import { loadProgramaGoverno2026, programasGoverno2026Identidades } from "@/data/programas-governo-2026"
import { createProgramaTextSearchIndex, findProgramaTextMatches } from "@/lib/programa-governo-text-search"
import { createProgramasGetHandler } from "@/app/api/programas/route"

const candidate = (slug: string, nomeUrna = "ÁÉ Candidato"): ProgramaBuscaRegistro["candidato"] => ({
  slug,
  nomeUrna,
  partido: "TESTE",
  cargo: "PRESIDENTE",
  uf: "BR",
  estado: "aprovado",
})

function fixtureRecord(
  slug: string,
  text: string,
  sourceSha256 = "a".repeat(64),
  sections: Array<Partial<ProgramaBuscaRegistro["documentos"][number]["secoes"][number]>> = [],
): ProgramaBuscaRegistro {
  const secoes = [{
    id: "secao-1",
    titulo: "Seção",
    nivel: 1,
    paginaInicial: 2,
    paginaFinal: 2,
    origem: "pdftotext" as const,
    conteudo: text,
  }, ...sections].map((section, index) => ({
    id: section.id ?? `secao-${index + 1}`,
    titulo: section.titulo ?? "Seção",
    nivel: section.nivel ?? 1,
    paginaInicial: section.paginaInicial ?? index + 2,
    paginaFinal: section.paginaFinal ?? index + 2,
    origem: section.origem ?? "pdftotext",
    conteudo: section.conteudo ?? "",
  }))
  return {
    candidato: candidate(slug),
    version: 2,
    estado: "aprovado",
    documentos: [{
      documentoId: "BR:1:01",
      sourceSha256,
      paginas: 4,
      secoes,
      pacoteUrl: "https://cdn.tse.jus.br/programa.zip",
      pdfOriginalUrl: null,
      coletadoEm: "2026-01-01T00:00:00Z",
    }],
  }
}

test("mantém a busca literal sem acento, pontuação especial e uma ocorrência por trecho", () => {
  const record = fixtureRecord("fixture", Array.from({ length: 25 }, (_, index) => `ação + ${index}`).join(" "))
  const engine = createProgramaBuscaEngine({ registros: [record] })
  const page1 = engine.buscarProgramas({ q: "acao +", uf: "", cargo: "", candidato: "", pagina: 1 })
  const page2 = engine.buscarProgramas({ q: "acao +", uf: "", cargo: "", candidato: "", pagina: 2 })
  assert.equal(page1.total, 25)
  assert.equal(page1.resultados.length, 20)
  assert.equal(page2.resultados.length, 5)
  assert.equal(page1.contagens[0]?.total, 25)
  assert.equal(page1.resultados.every((result) => result.matches.length === 1), true)
  const pastLast = engine.buscarProgramas({ q: "acao +", uf: "", cargo: "", candidato: "", pagina: 99 })
  assert.equal(pastLast.pagina, 2)
  assert.equal(pastLast.resultados.length, 5)
})

test("exclui seções sem texto e muda o link quando o hash da fonte muda", () => {
  const first = fixtureRecord("fixture", "saúde", "a".repeat(64), [{ origem: "sem-texto", conteudo: "saúde" }])
  const second = fixtureRecord("fixture-2", "saúde", "b".repeat(64))
  second.candidato = first.candidato
  const result = buscarProgramasEmRegistros({ q: "saude", uf: "", cargo: "", candidato: "", pagina: 1 }, [first, second])
  assert.equal(result.total, 2)
  assert.equal(result.resultados.every((item) => item.paginasSemTexto === 1 || item.paginasSemTexto === 0), true)
  assert.match(result.resultados[0].fichaUrl, /sourceSha256=[a-f0-9]{64}&secao=secao-1#programa-[a-f0-9]{64}-secao-1$/)
  assert.notEqual(result.resultados[0].fichaUrl, result.resultados[1].fichaUrl)
})

test("materializa somente seções com ocorrência na página pedida", () => {
  const record = fixtureRecord("fixture", "6×1")
  const emptySection = {
    id: "sem-ocorrencia", titulo: "Outro capítulo", nivel: 1,
    paginaInicial: 3, paginaFinal: 3, origem: "pdftotext" as const,
    conteudo: "Outro assunto", searchIndex: createProgramaTextSearchIndex("Outro assunto", { withOffsets: false }),
  }
  Object.defineProperty(emptySection, "conteudo", { get() { throw new Error("Texto sem ocorrência não deve ser materializado") } })
  const indexedRecord = { ...record, documentos: [{ ...record.documentos[0], secoes: [...record.documentos[0].secoes, emptySection] }] }
  const response = buscarProgramasEmRegistros({ q: "6×1", uf: "", cargo: "", candidato: "", pagina: 1 }, [indexedRecord])
  assert.equal(response.total, 1)
  assert.equal(response.resultados.length, 1)
  assert.equal(response.resultados[0].trecho, "6×1")
})

test("preserva os offsets UTF-16 para emoji e combinações Unicode", () => {
  assert.deepEqual(findProgramaTextMatches("😀saúde", "saude"), [{ start: 2, end: 7 }])
  assert.deepEqual(findProgramaTextMatches("e\u0301 saúde", "é"), [{ start: 0, end: 1 }, { start: 7, end: 8 }])
})

test("índice sem offsets preserva o matcher da ficha em Unicode e todo o acervo aprovado", async () => {
  for (const text of ["ação e EDUCAÇÃO", "😀 Saúde e\u0301", "AΣ AΣa Σ", "İstanbul Çalışma"]) {
    assert.equal(createProgramaTextSearchIndex(text, { withOffsets: false }).searchable, createProgramaTextSearchIndex(text).searchable)
  }
  let verifiedSections = 0
  for (const identity of programasGoverno2026Identidades) {
    if (!identity.slug) continue
    const record = await loadProgramaGoverno2026(identity.slug)
    if (record?.estado !== "aprovado") continue
    const sections = record.documentos?.flatMap((document) => document.extracao.secoes) ?? record.extracao?.secoes ?? []
    for (const section of sections) {
      assert.equal(createProgramaTextSearchIndex(section.conteudo, { withOffsets: false }).searchable, createProgramaTextSearchIndex(section.conteudo).searchable, `${identity.slug}:${section.id}`)
      verifiedSections += 1
    }
  }
  assert.ok(verifiedSections > 11_000)
})

test("parser aceita q vazio para a UI e recusa tema e filtros inválidos", () => {
  assert.deepEqual(parseProgramaBuscaFiltros(new URLSearchParams()), { q: "", uf: "", cargo: "", candidato: "", pagina: 1 })
  assert.equal(parseProgramaBuscaFiltros(new URLSearchParams(`q=${"a".repeat(100)}`)).q.length, 100)
  assert.throws(() => parseProgramaBuscaFiltros(new URLSearchParams(`q=${"a".repeat(101)}`)), ProgramaBuscaFiltroError)
  for (const params of ["tema=saude", "uf=XX", "cargo=SENADOR", "pagina=0", "pagina=100001"]) {
    assert.throws(() => parseProgramaBuscaFiltros(new URLSearchParams(params)), ProgramaBuscaFiltroError)
  }
})

test("cache de índice compartilha promessa e permite retry depois de falha", async () => {
  let calls = 0
  const loader = createProgramaBuscaIndexLoader(async () => {
    calls += 1
    if (calls === 1) throw new Error("falha transitória")
    return { registros: [], candidatos: [] }
  })
  await assert.rejects(loader.get(), /falha transitória/)
  assert.deepEqual(await Promise.all([loader.get(), loader.get()]), [{ registros: [], candidatos: [] }, { registros: [], candidatos: [] }])
  assert.equal(calls, 2)
})

test("rota aplica q mínimo, no-store, rate limit e resposta sem payload de erro bruto", async () => {
  const rateLimiter = {
    check: () => ({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }),
    reset: () => undefined,
  }
  const handler = createProgramasGetHandler({
    rateLimiter,
    buscarProgramas: async (filtros) => ({ total: 0, pagina: filtros.pagina, paginas: 0, resultados: [], contagens: [], semDocumento: [] }),
  })
  const invalid = await handler(new Request("https://puxaficha.test/api/programas?q=ab"))
  assert.equal(invalid.status, 400)
  assert.equal(invalid.headers.get("cache-control"), "no-store")
  assert.deepEqual(await invalid.json(), { error: "Parâmetros inválidos", message: "A busca deve ter entre 3 e 100 caracteres." })

  const valid = await handler(new Request("https://puxaficha.test/api/programas?q=abc"))
  assert.equal(valid.status, 200)
  assert.equal(valid.headers.get("cache-control"), "no-store")

  let called = false
  const limited = createProgramasGetHandler({
    rateLimiter: { check: () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 }), reset: () => undefined },
    buscarProgramas: async () => { called = true; throw new Error("não deveria carregar") },
  })
  assert.equal((await limited(new Request("https://puxaficha.test/api/programas?q=abc"))).status, 429)
  assert.equal(called, false)
  const unavailable = createProgramasGetHandler({
    rateLimiter,
    buscarProgramas: async () => { throw new Error("loader secreto") },
  })
  const failed = await unavailable(new Request("https://puxaficha.test/api/programas?q=abc"))
  assert.equal(failed.status, 503)
  assert.deepEqual(await failed.json(), { error: "Busca indisponível", message: "A busca pública está temporariamente indisponível." })
})

test("integra o índice canônico para PDF longo, OCR, páginas sem texto e múltiplos documentos", async () => {
  const saulo = await buscarProgramas({ q: "Maranhão", uf: "", cargo: "", candidato: "saulo-arcangeli", pagina: 1 })
  assert.ok(saulo.total > 0)
  assert.equal(saulo.resultados.every((result) => result.slug === "saulo-arcangeli"), true)
  assert.equal(saulo.resultados.every((result) => result.paginaInicial <= 290), true)
  const firstSaulo = await buscarProgramas({ q: "Preta Lu", uf: "", cargo: "", candidato: "saulo-arcangeli", pagina: 1 })
  const lastSaulo = await buscarProgramas({ q: "Preta Lu", uf: "", cargo: "", candidato: "saulo-arcangeli", pagina: firstSaulo.paginas })
  assert.ok(lastSaulo.resultados.some((result) => result.paginaInicial === 290))
  const contract = saulo.resultados[0]
  assert.equal(contract.nomeUrna, "SAULO ARCANGELI")
  assert.equal(contract.version, 2)
  assert.match(contract.sourceSha256, /^[a-f0-9]{64}$/)
  assert.match(contract.coletadoEm, /^2026-/)
  assert.match(contract.fichaUrl, /sourceSha256=[a-f0-9]{64}&secao=/)
  assert.match(contract.originalUrl, /proposta_governo_2026_MA\.zip$/)
  for (const result of saulo.resultados) {
    assert.ok(result.trecho.length > 0)
    assert.ok(result.paginaInicial > 0 && result.paginaFinal >= result.paginaInicial)
    assert.equal(result.cargo, "GOVERNADOR")
    assert.equal(result.uf, "MA")
    assert.ok(result.nomeUrna && result.partido && result.documentoId && result.secaoId)
    assert.equal(result.version, 2)
    assert.match(result.sourceSha256, /^[a-f0-9]{64}$/)
    assert.ok(result.coletadoEm && result.originalUrl && result.fichaUrl)
  }

  const pabloPlaceholder = await buscarProgramas({ q: "página sem conteúdo textual", uf: "", cargo: "", candidato: "pablo-marcal", pagina: 1 })
  assert.equal(pabloPlaceholder.total, 0)

  const vivian = await buscarProgramas({ q: "reindustrialização", uf: "", cargo: "", candidato: "vivian-mendes", pagina: 1 })
  assert.ok(vivian.total > 0)
  assert.equal(vivian.resultados.every((result) => result.documentosTotal === 3), true)

  const ocr = await buscarProgramas({ q: "Eduardo Girão", uf: "", cargo: "", candidato: "romeu-zema", pagina: 1 })
  assert.ok(ocr.resultados.some((result) => result.origem === "ocr"))

  const fiveTerms = ["saude", "educacao", "trabalho", "moradia", "seguranca"]
  for (const q of fiveTerms) {
    const response = await buscarProgramas({ q, uf: "", cargo: "", candidato: "vivian-mendes", pagina: 1 })
    const record = await loadProgramaGoverno2026("vivian-mendes")
    const sections = record?.documentos?.flatMap((document) => document.extracao.secoes) ?? record?.extracao?.secoes ?? []
    const expected = sections
      .filter((section) => section.origem !== "sem-texto")
      .reduce((total, section) => total + findProgramaTextMatches(section.conteudo, q).length, 0)
    assert.equal(response.total, expected, `paridade ${q}`)
  }
})
