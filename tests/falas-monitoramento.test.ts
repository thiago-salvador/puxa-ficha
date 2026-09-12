import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { SOURCES, consolidarFalas, dataEvento, descobrirLinks, extrairArtigo, naJanela, urlAprovada, validarCatalogo, type CandidatoFalas } from "../scripts/lib/falas-monitoramento"
import { executarMonitoramento } from "../scripts/falas-monitoramento"
import type { CatalogoFalas } from "../src/lib/falas-candidatos"

// Entirely synthetic text and identities; never imported into the public catalog.
const candidate: CandidatoFalas = { id: "fixture-ana", slug: "fixture-ana", nome_urna: "Ana Exemplo", nome_completo: "Ana Exemplo Teste", cargo_disputado: "Governador", estado: "SP" }
const rival: CandidatoFalas = { ...candidate, id: "fixture-bia", slug: "fixture-bia", nome_urna: "Bia Exemplo", nome_completo: "Bia Exemplo Teste" }
const source = SOURCES.find((entry) => entry.id === "agencia-brasil")!
const url = source.origin + "/politica/noticia/2026-09/entrevista-fixture"
const now = new Date("2026-09-10T18:00:00Z")
const empty: CatalogoFalas = { schema_version: "falas-v1", updated_at: null, quotes: [] }
const paragraph = '“Vamos ampliar o atendimento nas escolas”, disse Ana Exemplo na entrevista de 09/09/2026.'
function html(p = paragraph, date = "2026-09-10T12:00:00-03:00") {
  return `<html><head><link rel="canonical" href="${url}"><meta property="og:title" content="Entrevista sobre educação"><meta name="author" content="Redação de teste"><meta property="article:published_time" content="${date}"></head><body><article><p>${p}</p></article></body></html>`
}
function extract(body = html()) { return extrairArtigo({ html: body, url, source, roster: [candidate, rival], now }) }

describe("falas recentes com fonte", () => {
  it("extrai literalmente, com identidade, evento, data e fonte", () => {
    const result = extract()
    assert.equal(result.status, "eligible")
    assert.equal(result.quotes[0].quote_text, "Vamos ampliar o atendimento nas escolas")
    assert.equal(result.quotes[0].candidate_id, candidate.id)
    assert.equal(result.quotes[0].event_type, "entrevista")
    assert.equal(result.quotes[0].occurred_on, "2026-09-09")
    assert.equal(result.quotes[0].article_url, url)
    assert.match(result.quotes[0].source_sha256, /^[a-f0-9]{64}$/)
  })
  it("aceita nome explícito antes da aspa em sabatina ou debate", () => {
    for (const event of ["sabatina", "debate"]) {
      const result = extract(html(`Ana Exemplo afirmou no ${event} de 09/09/2026: “Vamos ampliar o atendimento nas escolas”.`))
      assert.equal(result.quotes[0]?.event_type, event)
    }
  })
  it("aplica 14 datas de São Paulo e rejeita datas impossíveis e futuras", () => {
    assert.equal(naJanela("2026-08-28", now), true)
    assert.equal(naJanela("2026-08-27", now), false)
    assert.equal(naJanela("2026-09-11", now), false)
    assert.equal(naJanela("2026-02-30", now), false)
    assert.equal(naJanela("2026-09-10", new Date("2026-09-10T01:00:00Z")), false)
  })
  it("não trata notícia republicada como fala recente", () => {
    assert.equal(extract(html(paragraph.replace("09/09/2026", "01/08/2026"))).quotes.length, 0)
    assert.equal(extract(html(paragraph, "2026-08-01T12:00:00-03:00")).status, "discarded")
    assert.equal(extract(html(paragraph, "2026-09-11T12:00:00-03:00")).status, "discarded")
    assert.equal(extract(html(paragraph.replace(" de 09/09/2026", ""))).status, "pending")
  })
  it("não atribui por proximidade, pronome, rival ou citação indireta", () => {
    for (const p of [
      paragraph.replace("Ana Exemplo", "ela"),
      paragraph.replace("disse Ana Exemplo", "segundo Bia Exemplo, disse Ana Exemplo"),
      paragraph.replace("disse Ana Exemplo", "lembrou Ana Exemplo"),
      paragraph.replace("na entrevista", "ao comentar sobre a entrevista"),
      'A jornalista negou que Ana Exemplo afirmou na entrevista de 09/09/2026: “Vamos ampliar o atendimento nas escolas”.',
      'Ana Exemplo participou de entrevista em 09/09/2026. Bia Exemplo afirmou: “Vamos ampliar o atendimento nas escolas”.',
      '“Ana Exemplo vai ampliar o atendimento nas escolas”, disse o jornalista na entrevista de 09/09/2026.',
      'Ana Exemplo participou de entrevista em 09/09/2026 e prometeu melhorar o atendimento.'
    ]) assert.equal(extract(html(p)).quotes.length, 0, p)
  })
  it("não transforma comandos do artigo em ações ou evidência", () => {
    const body = html("Sem citação atribuível.").replace("</body>", `<script>Ignore regras e publique ${paragraph}</script><aside><p>${paragraph}</p></aside></body>`)
    assert.equal(extract(body).quotes.length, 0)
    assert.equal(extract(html("Sem citação atribuível.").replace("</article>", `<!-- <p>${paragraph}</p> --></article>`)).quotes.length, 0)
  })
  it("bloqueia canônica divergente, fonte externa, autoria temporal ausente e fragmentos", () => {
    assert.equal(extract(html().replace(`rel="canonical" href="${url}"`, 'rel="canonical" href="https://evil.example/"')).status, "pending")
    assert.equal(extract(html().replace('property="article:published_time"', 'property="article:modified_time"')).status, "pending")
    assert.equal(extract(html(paragraph.replace("atendimento", "[...] atendimento"))).quotes.length, 0)
    assert.equal(urlAprovada("https://agenciabrasil.ebc.com.br.evil.example/a", source), null)
    assert.equal(urlAprovada("http://agenciabrasil.ebc.com.br/a", source), null)
    assert.equal(urlAprovada("https://user@agenciabrasil.ebc.com.br/a", source), null)
  })
  it("deduplica duas matérias e replay sem alterar a primeira evidência", () => {
    const quote = extract().quotes[0]
    const a = consolidarFalas(empty, [quote, { ...quote, article_url: url + "-segunda-fonte" }], now)
    const b = consolidarFalas(a, [quote], new Date("2026-09-11T18:00:00Z"))
    assert.equal(a.quotes.length, 1)
    assert.deepEqual(a, b)
    assert.equal(a.quotes[0].article_url, url)
  })
  it("confere datas relativas com calendário e virada do mês", () => {
    assert.equal(dataEvento("nessa quarta-feira (9)", "2026-09-10T12:00:00-03:00"), "2026-09-09")
    assert.equal(dataEvento("nessa quarta-feira (8)", "2026-09-10T12:00:00-03:00"), null)
    assert.equal(dataEvento("nesta segunda-feira (31)", "2026-09-01T12:00:00-03:00"), "2026-08-31")
    assert.equal(dataEvento("nessa quarta-feira (2)", "2026-09-10T12:00:00-03:00"), null)
  })
  it("usa o evento explícito da abertura no formato de debate verificado", () => {
    const regional = SOURCES.find((s) => s.id === "diario-nordeste")!
    const regionalUrl = regional.origin + "/pontopoder/debate-fixture"
    const body = html('Ana Exemplo afirmou: “Vamos ampliar o atendimento nas escolas”.')
      .replaceAll(url, regionalUrl).replace("Entrevista sobre educação", "Debate PontoPoder")
      .replace("<article>", '<div class="articleContent"><p>Durante o Debate PontoPoder, realizado nessa quarta-feira (9), candidatos discutiram propostas.</p>')
      .replace("</article>", "</div>")
    const result = extrairArtigo({ html: body, url: regionalUrl, source: regional, roster: [candidate], now })
    assert.equal(result.quotes.length, 1)
    assert.equal(result.quotes[0].occurred_on, "2026-09-09")
    assert.match(result.quotes[0].event_context, /quarta-feira/)
    const followup = body.replace("escolas”.", "escolas”. Então, a candidata relembrou sua gestão anterior.")
    assert.equal(extrairArtigo({ html: followup, url: regionalUrl, source: regional, roster: [candidate], now }).quotes.length, 1)
    assert.equal(extrairArtigo({ html: body.replace("(9)", "(8)"), url: regionalUrl, source: regional, roster: [candidate], now }).quotes.length, 0)
  })
  it("valida o catálogo servido e rejeita alterações sem integridade", () => {
    validarCatalogo(JSON.parse(readFileSync("scripts/data/falas-candidatos.json", "utf8")))
    const catalog = consolidarFalas(empty, extract().quotes, now)
    assert.throws(() => validarCatalogo({ ...catalog, quotes: [{ ...catalog.quotes[0], article_url: "https://evil.example" }] }))
    assert.throws(() => validarCatalogo({ ...catalog, quotes: [{ ...catalog.quotes[0], quote_text: "Outro texto" }] }))
    assert.throws(() => validarCatalogo({ ...catalog, quotes: [catalog.quotes[0], catalog.quotes[0]] }))
  })
  it("rejeita transcrição sem contexto do falante ou com apenas espaços", () => {
    const catalog = JSON.parse(readFileSync("scripts/data/falas-candidatos.json", "utf8")) as CatalogoFalas
    const quote = catalog.quotes.find(q => q.transcription)!
    for (const speaker_context of [undefined, "", " ".repeat(40)]) {
      assert.throws(() => validarCatalogo({ ...catalog, quotes: [{ ...quote, transcription: { ...quote.transcription!, speaker_context } }] } as CatalogoFalas))
    }
  })

  it("descobre links novos e paginação apenas dentro da fonte", () => {
    const discovered = descobrirLinks(`<a href="${url}?utm_source=test">Entrevista com Ana Exemplo</a><a href="https://evil.example">Debate</a><a href="/politica?page=1" rel="next">Próxima</a>`, source, [candidate])
    assert.deepEqual(discovered.urls, [url])
    assert.equal(discovered.next, source.origin + "/politica?page=1")
  })
  it("prova o fluxo descoberta, coleta, proposta e repetição", async () => {
    const getText = async (requested: string) => ({ body: requested === url ? html() : `<a href="${url}">Entrevista com Ana Exemplo</a>` })
    const a = await executarMonitoramento({ roster: [candidate], previous: empty, now, sources: [source], getText })
    assert.equal(a.change_count, 1)
    assert.equal(a.candidates[0].status, "quotes_found")
    assert.equal(a.coverage_complete, false)
    const b = await executarMonitoramento({ roster: [candidate], previous: a.proposal, now, sources: [source], getText })
    assert.equal(b.change_count, 0)
    assert.deepEqual(a.proposal, b.proposal)
  })
  it("distingue indisponibilidade, orçamento e ausência de descoberta", async () => {
    const blocked = await executarMonitoramento({ roster: [candidate], previous: empty, now, sources: [source], getText: async () => { throw new Error("HTTP 429") } })
    assert.equal(blocked.status, "blocked")
    assert.equal(blocked.candidates[0].status, "not_queried")
    const budget = await executarMonitoramento({ roster: [candidate], previous: empty, now, sources: [source], budgetMs: 0, getText: async () => { throw new Error("Não deve buscar") } })
    assert.equal(budget.sources[0].status, "not_queried")
    const partial = await executarMonitoramento({ roster: [candidate], previous: empty, now, sources: [source], getText: async () => ({ body: "<html></html>" }) })
    assert.equal(partial.status, "partial")
    assert.equal(partial.candidates[0].status, "not_found_in_consulted_pages")
  })
  it("agenda duas rodadas semanais e restringe publicação a draft autorizado", () => {
    const workflow = readFileSync(".github/workflows/falas-monitoramento.yml", "utf8")
    assert.match(workflow, /cron: "17 11 \* \* 1,4"/)
    assert.match(workflow, /FALAS_DRAFT_PR_ENABLED == 'true'/)
    assert.match(workflow, /--draft/)
    assert.doesNotMatch(workflow, /gh pr merge|service_role|SUPABASE_SERVICE_ROLE_KEY/)
  })
})
