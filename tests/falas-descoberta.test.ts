import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { construirConsultas, descobrirPorCandidato, extrairIndiceOriginais } from "../scripts/lib/falas-descoberta"
import { SOURCES, type CandidatoFalas } from "../scripts/lib/falas-monitoramento"

const now = new Date("2026-09-11T12:00:00Z")
const candidate: CandidatoFalas = { id: "a", slug: "ciro-gomes", nome_urna: "Ciro Gomes", nome_completo: "Ciro Ferreira Gomes", cargo_disputado: "Governador", estado: "CE" }
const source = SOURCES.find((s) => s.id === "diario-nordeste")!
const articleUrl = `${source.origin}/pontopoder/ciro-no-debate-1.1234567`
const opaque = "https://news.google.com/rss/articles/CBMiopaque"
const xml = (items: string) => `<rss><channel>${items}</channel></rss>`
const item = (options: { url?: string; date?: string; source?: string; title?: string } = {}) => `<item><title>${options.title ?? "Ciro Gomes no debate - Diário do Nordeste"}</title><link>${options.url ?? opaque}</link><pubDate>${options.date ?? "Thu, 10 Sep 2026 15:00:00 GMT"}</pubDate><source url="${options.source ?? source.origin}">Diário do Nordeste</source></item>`
const client = (body: string) => ({ getText: async () => ({ status: 200, body, observedAt: now.toISOString() }) })

describe("descoberta individual de falas", () => {
  it("gera consultas por nomes conhecidos com 14 datas no fuso de São Paulo", () => {
    const queries = construirConsultas(candidate, now)
    assert.equal(queries.length, 2)
    assert.match(queries[0].query, /"Ciro Gomes"/)
    assert.match(queries[0].query, /after:2026-08-28 before:2026-09-12/)
    assert.equal(construirConsultas({ ...candidate, nome_completo: "CIRO GOMES" }, now).length, 1)
  })
  it("visita todos os candidatos antes das variantes; orçamento não mascara nomes não consultados", async () => {
    const result = await descobrirPorCandidato({ roster: [candidate, { ...candidate, id: "b", slug: "b", nome_urna: "Maria Silva" }], now, client: client(xml("")), maxQueries: 2 })
    assert.deepEqual(result.candidates.map((c) => c.attempts), [1, 1])
    assert.deepEqual(result.candidates.map((c) => c.queries[1].status), ["not_queried", "not_queried"])
    assert.equal(result.all_candidates_queried, true)
    assert.equal(result.coverage_complete, false)
  })
  it("não confunde resultado opaco com aspa nem ausência de resultados", async () => {
    const result = await descobrirPorCandidato({ roster: [candidate], now, client: client(xml(item())), maxQueries: 1 })
    assert.deepEqual(result.urls, [])
    assert.equal(result.candidates[0].status, "queried")
    assert.equal(result.candidates[0].pending_count, 1)
    assert.equal(result.candidates[0].queries[0].results[0].reason, "google_opaque")
  })
  it("resolve título exato no próprio veículo e preserva URL como descoberta", async () => {
    const originals = extrairIndiceOriginais(`<a href="${articleUrl}">Ciro Gomes no debate</a>`, source)
    const result = await descobrirPorCandidato({ roster: [candidate], now, originals, client: client(xml(item())), maxQueries: 1 })
    assert.deepEqual(result.urls, [articleUrl])
    assert.equal(result.candidates[0].queries[0].results[0].reason, "original_title_match")
  })
  it("extrai títulos e URLs literais de news sitemap", () => {
    assert.deepEqual(extrairIndiceOriginais(`<urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"><url><loc>${articleUrl}</loc><news:news><news:title>Ciro Gomes no debate</news:title></news:news></url></urlset>`, source), [{ title: "Ciro Gomes no debate", url: articleUrl }])
  })
  it("não resolve título ambíguo nem título aproximado", async () => {
    const result = await descobrirPorCandidato({ roster: [candidate], now, client: client(xml(item())), maxQueries: 1,
      originals: [{ title: "Ciro Gomes no debate", url: articleUrl }, { title: "Ciro Gomes no debate", url: `${articleUrl}-outro` }] })
    assert.deepEqual(result.urls, [])
  })
  it("recusa origem falsa, URL relativa e credenciais", async () => {
    const body = xml(item({ url: "https://evil.example/pontopoder/ciro" }) + item({ url: "/pontopoder/ciro" }) + item({ url: "https://user:password@diariodonordeste.verdesmares.com.br/pontopoder/ciro" }) + item({ source: "https://evil.example" }))
    const result = await descobrirPorCandidato({ roster: [candidate], now, client: client(body), maxQueries: 1 })
    assert.deepEqual(result.urls, [])
    assert.equal(result.candidates[0].pending_count, 4)
  })
  it("URL direta precisa de origem compatível com o veículo declarado", async () => {
    const result = await descobrirPorCandidato({ roster: [candidate], now, client: client(xml(item({ url: articleUrl, source: "https://evil.example" }))), maxQueries: 1 })
    assert.deepEqual(result.urls, [])
  })
  it("resolve apenas URL literal em identificador legado, sem endpoint privado", async () => {
    const url = `https://news.google.com/rss/articles/${Buffer.from(`\u0012${articleUrl}\u001a`).toString("base64url")}`
    const result = await descobrirPorCandidato({ roster: [candidate], now, client: client(xml(item({ url }))), maxQueries: 1 })
    assert.deepEqual(result.urls, [articleUrl])
  })
  it("preserva falha, feed inválido, futuro e janela sem alegar cobertura completa", async () => {
    const malformed = await descobrirPorCandidato({ roster: [candidate], now, client: client("<html>challenge</html>"), maxQueries: 1 })
    assert.equal(malformed.candidates[0].status, "blocked")
    assert.equal(malformed.all_candidates_attempted, true)
    assert.equal(malformed.all_candidates_queried, false)
    const dates = await descobrirPorCandidato({ roster: [candidate], now, client: client(xml(item({ date: "Thu, 27 Aug 2026 15:00:00 GMT" }) + item({ date: "Sat, 12 Sep 2026 15:00:00 GMT" }))), maxQueries: 1 })
    assert.equal(dates.candidates[0].queries[0].discarded_date_count, 2)
    assert.equal(dates.candidates[0].queries[0].status, "queried")
    const failed = await descobrirPorCandidato({ roster: [candidate], now, client: { getText: async () => { throw new Error("timeout") } }, maxQueries: 1 })
    assert.equal(failed.candidates[0].queries[0].error, "timeout")
    assert.equal(failed.candidates[0].attempts, 1)
  })
  it("limite de resultados registra truncamento e recibo é emitido a cada consulta", async () => {
    let saved = 0
    const result = await descobrirPorCandidato({ roster: [candidate], now, client: client(xml(item() + item())), maxQueries: 1, maxResultsPerQuery: 1, onReceipt: () => { saved++ } })
    assert.equal(saved, 1)
    assert.equal(result.candidates[0].queries[0].truncated, true)
    assert.equal(result.candidates[0].queries[0].result_count, 2)
    assert.equal(result.candidates[0].queries[0].results.length, 1)
  })
  it("zero resultados só vale quando todas as variantes terminaram com RSS vazio", async () => {
    const result = await descobrirPorCandidato({ roster: [candidate], now, client: client(xml("")) })
    assert.equal(result.candidates[0].status, "no_results")
    assert.equal(result.candidates[0].attempts, 2)
  })
})
