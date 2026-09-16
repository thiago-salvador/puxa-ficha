import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ingestGoogleNews } from "../scripts/lib/ingest-google-news"
import type { CandidatoConfig } from "../scripts/lib/types"

const candidate: CandidatoConfig = {
  slug: "lula",
  nome_completo: "LUIZ INACIO LULA DA SILVA",
  nome_urna: "LULA",
  cargo_disputado: "Presidente",
  estado: "BR",
  ids: { camara: null, senado: null, tse_sq_candidato: {}, tse_uf_candidatura: {} },
}

function databaseFake() {
  const urls = new Set<string>()
  const calls: Array<{ rows: Array<{ url: string }>; options: Record<string, unknown> }> = []
  return {
    calls,
    urls,
    from() {
      return {
        async upsert(rows: Array<{ url: string }>, options: Record<string, unknown>) {
          calls.push({ rows, options })
          for (const row of rows) urls.add(row.url)
          return { error: null }
        },
      }
    },
  }
}

const run = (fetchImpl: typeof fetch, database = databaseFake()) => ingestGoogleNews({
  database: database as never,
  loadCandidates: async () => [candidate],
  resolveCandidateId: async () => "candidate-id",
  fetchImpl,
  sleep: async () => {},
  timeoutMs: 20,
  sleepMs: 0,
})

describe("ingest Google News", () => {
  it("registra HTTP não-OK como erro com URL e não como vazio", async () => {
    const [result] = await run(async () => new Response("blocked", { status: 403 }))
    assert.equal(result.coleta_resultado, "erro")
    assert.deepEqual(result.errors, ["HTTP 403"])
    assert.match(result.coleta_detalhe ?? "", /HTTP 403.*url=https:\/\/news\.google\.com/)
    assert.ok(result.coleta_url)
  })

  it("registra AbortError como timeout explícito", async () => {
    const [result] = await run(async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }) })
    assert.equal(result.coleta_resultado, "erro")
    assert.deepEqual(result.errors, ["timeout"])
    assert.match(result.coleta_detalhe ?? "", /timeout após 20ms/)
  })

  it("rejeita resposta 2xx que não é RSS", async () => {
    const [result] = await run(async () => new Response("<html>captcha</html>", { status: 200 }))
    assert.equal(result.coleta_resultado, "erro")
    assert.deepEqual(result.errors, ["RSS inválido"])
  })

  it("rejeita RSS truncado como erro de parsing, nunca como vazio", async () => {
    const [result] = await run(async () => new Response("<rss><channel><item><title>Registro interrompido</channel>", { status: 200 }))
    assert.equal(result.coleta_resultado, "erro")
    assert.deepEqual(result.errors, ["RSS inválido"])
    assert.match(result.coleta_detalhe ?? "", /RSS inválido/)
  })

  it("separa RSS válido vazio de falha", async () => {
    const [result] = await run(async () => new Response("<rss><channel></channel></rss>", { status: 200 }))
    assert.equal(result.coleta_resultado, "vazio_confirmado")
    assert.deepEqual(result.errors, [])
    assert.equal(result.coleta_volume, 0)
    assert.match(result.coleta_detalhe ?? "", /rss_items=0.*0 enviados ao upsert/)
  })

  it("grava notícia positiva com volume, URL e filtro declarado", async () => {
    const xml = `<rss><channel><item><title>Lula anuncia nova agenda</title><link>https://g1.globo.com/lula</link><pubDate>Mon, 02 Jun 2026 10:00:00 GMT</pubDate><source>G1</source></item></channel></rss>`
    const db = databaseFake()
    const [result] = await run(async () => new Response(xml, { status: 200 }), db)
    assert.equal(result.coleta_resultado, "encontrado")
    assert.equal(result.coleta_volume, 1)
    assert.equal(result.rows_upserted, 1)
    assert.equal(db.calls.length, 1)
    assert.deepEqual(db.calls[0].options, { onConflict: "candidato_id,url", ignoreDuplicates: true })
    assert.match(result.coleta_detalhe ?? "", /rss_items=1.*citam_nome=1/)
  })

  it("mantém rerun idempotente pelo conflito candidato_id/url", async () => {
    const xml = `<rss><channel><item><title>Lula anuncia nova agenda</title><link>https://g1.globo.com/lula</link></item></channel></rss>`
    const db = databaseFake()
    await run(async () => new Response(xml, { status: 200 }), db)
    await run(async () => new Response(xml, { status: 200 }), db)
    assert.equal(db.urls.size, 1)
    assert.equal(db.calls.length, 2)
    assert.ok(db.calls.every((call) => call.options.ignoreDuplicates === true))
  })
})
