import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildGoogleNewsSearchUrl,
  normalizeNewsUrl,
  parseGoogleNewsRss,
} from "../src/lib/news/google-news"

const FIXED_NOW = () => new Date("2026-06-03T12:00:00.000Z")

describe("buildGoogleNewsSearchUrl", () => {
  it("quotes the nome de urna and appends the cargo", () => {
    const url = buildGoogleNewsSearchUrl("Lula", "Presidente")
    assert.match(url, /^https:\/\/news\.google\.com\/rss\/search\?q=/)
    assert.match(url, /hl=pt-BR&gl=BR&ceid=BR:pt-419$/)
    // %22 = aspas; %22Lula%22 garante match exato do nome
    assert.ok(url.includes("%22Lula%22"))
    assert.ok(url.includes("Presidente"))
  })

  it("tolerates a null or missing cargo without leaking 'null'", () => {
    const url = buildGoogleNewsSearchUrl("Ciro Gomes", null)
    assert.ok(!url.toLowerCase().includes("null"))
    assert.ok(url.includes("%22Ciro%20Gomes%22") || url.includes("%22Ciro+Gomes%22"))
  })
})

describe("normalizeNewsUrl", () => {
  it("keeps https URLs and rejects non-https or malformed", () => {
    assert.equal(normalizeNewsUrl("https://g1.globo.com/a"), "https://g1.globo.com/a")
    assert.equal(normalizeNewsUrl("http://insecure.example/a"), null)
    assert.equal(normalizeNewsUrl("not a url"), null)
  })
})

describe("parseGoogleNewsRss", () => {
  it("parses items, normalizes CDATA titles and resolves source/pubDate", () => {
    const xml = `<rss><channel>
      <item>
        <title><![CDATA[Candidato faz comicio]]></title>
        <link>https://g1.globo.com/noticia-1</link>
        <pubDate>Mon, 02 Jun 2026 10:00:00 GMT</pubDate>
        <source url="https://g1.globo.com">G1</source>
      </item>
      <item>
        <title>Segunda noticia</title>
        <link>https://folha.uol.com.br/noticia-2</link>
      </item>
    </channel></rss>`

    const { items, discardedUrls } = parseGoogleNewsRss(xml, FIXED_NOW)

    assert.equal(discardedUrls, 0)
    assert.equal(items.length, 2)
    assert.deepEqual(items[0], {
      titulo: "Candidato faz comicio",
      fonte: "G1",
      url: "https://g1.globo.com/noticia-1",
      data_publicacao: new Date("Mon, 02 Jun 2026 10:00:00 GMT").toISOString(),
    })
    // Sem pubDate: usa o `now` injetado (deterministico no teste)
    assert.equal(items[1].data_publicacao, "2026-06-03T12:00:00.000Z")
    assert.equal(items[1].fonte, "")
  })

  it("discards non-https links and counts them", () => {
    const xml = `<rss><channel>
      <item><title>Insegura</title><link>http://insecure.example/x</link></item>
      <item><title>Segura</title><link>https://secure.example/y</link></item>
    </channel></rss>`

    const { items, discardedUrls } = parseGoogleNewsRss(xml, FIXED_NOW)

    assert.equal(discardedUrls, 1)
    assert.equal(items.length, 1)
    assert.equal(items[0].url, "https://secure.example/y")
  })

  it("returns nothing for an empty or itemless feed", () => {
    assert.deepEqual(parseGoogleNewsRss("", FIXED_NOW), { items: [], discardedUrls: 0 })
    assert.deepEqual(parseGoogleNewsRss("<rss><channel></channel></rss>", FIXED_NOW), {
      items: [],
      discardedUrls: 0,
    })
  })

  it("uses the deterministic fallback when pubDate is malformed", () => {
    const xml = `<rss><channel>
      <item>
        <title>Data inválida</title>
        <link>https://example.com/noticia</link>
        <pubDate>definitely-not-a-date</pubDate>
      </item>
    </channel></rss>`

    const { items } = parseGoogleNewsRss(xml, FIXED_NOW)
    assert.equal(items.length, 1)
    assert.equal(items[0].data_publicacao, "2026-06-03T12:00:00.000Z")
  })
})
