import "./helpers/server-only"
import assert from "node:assert/strict"
import test from "node:test"
import { construirCoberturaDescoberta, descobrirPublicacoesPesquisas, extrairLinksDePesquisas, LISTAGENS_PESQUISAS } from "../scripts/lib/pesquisas-monitoramento-descoberta"
import { criarClienteHttpMonitoramento } from "../scripts/lib/pesquisas-monitoramento-rede"

const listing = LISTAGENS_PESQUISAS[0]
const known = "https://noticias.r7.com/eleicoes/2026/pesquisa-anterior/"
const fresh = "https://noticias.r7.com/eleicoes/2026/pesquisa-nova/"
test("título decodifica entidades uma única vez", () => {
  const title = "Real Time: governador &amp;#65; &#38;amp; &#65; &amp;nbsp;"
  const links = extrairLinksDePesquisas(`<a href="${fresh}">${title}</a>`, listing, new Set())
  assert.equal(links[0].title, "Real Time: governador &#65; &amp; A &nbsp;")
})

const html = `<a href="${known}">Real Time: governador do Amazonas lidera no primeiro turno</a>
<a href="${fresh}?utm_source=feed#resultado">Real Time: candidata tem 40% para o Governo da Bahia</a>
<a href="${fresh}">Real Time: candidata tem 40% para o Governo da Bahia</a>
<a href="https://outside.example/eleicoes/2026/roubo/">Real Time: pesquisa para governador</a>
<a href="https://noticias.r7.com/eleicoes/2026/senado/">Real Time: pesquisa para o Senado</a>
<script><a href="https://noticias.r7.com/eleicoes/2026/falso/">Real Time: governo de Goiás</a></script>`

test("descoberta identifica nova URL sem catalogo, deduplica e limita origem e cargo", () => {
  const links = extrairLinksDePesquisas(html, listing, new Set([known]))
  assert.equal(links.length, 2)
  assert.equal(links.find((link) => link.url === fresh)?.state, "pending_validation")
  assert.equal(links.find((link) => link.url === fresh)?.geography_hint, "BA")
  assert.equal(links.find((link) => link.url === known)?.state, "known_url")
  assert.equal(extrairLinksDePesquisas(html, listing, new Set([known, fresh])).every((link) => link.state === "known_url"), true)
})

test("UF no titulo permanece indicio; pesquisa presidencial estadual nao vira nacional", () => {
  const snippets = [
    ["Real Time: Lula tem 40% no primeiro turno no Amazonas", "AM", "Presidente"],
    ["Real Time: disputa para o governo do ES", "ES", "Governador"],
    ["Real Time: disputa para o governo de Mato Grosso do Sul", "MS", "Governador"],
    ["Real Time: pesquisa para governador", null, "Governador"],
  ] as const
  for (const [title, geography, office] of snippets) {
    const result = extrairLinksDePesquisas(`<a href="${fresh}">${title}</a>`, listing, new Set())[0]
    assert.equal(result.geography_hint, geography)
    assert.equal(result.office_hint, office)
  }
})

test("falha da listagem e mudanca de layout sao registradas, nunca como ausencia de pesquisa", async () => {
  for (const mode of ["unavailable", "layout_changed"] as const) {
    const client = criarClienteHttpMonitoramento({ allowedOrigins: [new URL(listing.url).origin], minIntervalMs: 0, maxAttempts: 1,
      fetchImpl: async (input) => String(input).endsWith("robots.txt") ? new Response("") : mode === "unavailable" ? new Response("bloqueado", { status: 403 }) : new Response("layout desconhecido"),
    })
    const observations = await descobrirPublicacoesPesquisas({ sourceId: listing.source_ids[0], knownUrls: new Set(), client })
    assert.equal(observations[0].status, mode)
    const coverage = construirCoberturaDescoberta({ observations, targets: [{ geography_code: "AM" }] })
    assert.equal(coverage.length, 28)
    assert.equal(new Set(coverage.map((item) => item.geography_code)).size, 28)
    assert.equal(coverage.every((item) => !item.absence_of_poll_confirmed && item.freshness_status === "not_assessed"), true)
    assert.equal(coverage.find((item) => item.geography_code === "AM")?.monitored_catalog_polls, 1)
    assert.equal(coverage.find((item) => item.geography_code === "AC")?.monitored_catalog_polls, 0)
  }
})

test("rejeicao, aprovacao e podcasts nao entram na fila de intencao de voto", () => {
  const page = LISTAGENS_PESQUISAS[1]
  const snippets = ["PoderDataCast: eleições para presidente", "PoderData: Lula é aprovado por 50%", "PoderData: Lula tem rejeição de 49%"]
  assert.equal(extrairLinksDePesquisas(snippets.map((title, index) => `<a href="https://www.poder360.com.br/poderdata/${index}/">${title}</a>`).join(""), page, new Set()).length, 0)
})
