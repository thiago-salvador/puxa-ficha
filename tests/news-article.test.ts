import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { createFixedWindowIpRateLimiter } from "@/lib/request-rate-limit"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never

const { getPublicNewsArticle } = require("../src/lib/news/article") as typeof import("../src/lib/news/article")
const { createNewsArticleHandler } = require("../src/app/api/candidato-profile/[slug]/noticias/[id]/route") as typeof import("../src/app/api/candidato-profile/[slug]/noticias/[id]/route")

const ARTICLE_ID = "aaaaaaaa-1111-4111-8111-111111111111"
const CANDIDATE = { id: "candidate-1", slug: "pessoa-teste", nome_urna: "Pessoa Teste", nome_completo: "Pessoa Teste", publicavel: true }
const ARTICLE = {
  id: ARTICLE_ID,
  candidato_id: CANDIDATE.id,
  titulo: "Pessoa Teste apresenta proposta",
  fonte: "Portal Exemplo",
  url: "https://portal.example/noticia",
  data_publicacao: new Date().toISOString(),
  snippet: "A proposta foi apresentada nesta semana.",
}

type Row = Record<string, unknown>

/** Aplica os filtros e a projeção do select: omitir um deles muda a resposta. */
function fixture(options: {
  candidates?: Row[]
  articles?: Row[]
  failTable?: string
} = {}) {
  const calls: string[] = []
  const client = {
    from(table: string) {
      calls.push(table)
      assert.ok(["candidatos_publico", "noticias_candidato"].includes(table), `consulta inesperada: ${table}`)
      const rows: Row[] = table === "candidatos_publico"
        ? (options.candidates ?? [CANDIDATE]).filter((row) => row.publicavel === true)
        : options.articles ?? [ARTICLE]
      const filters: Array<(row: Row) => boolean> = []
      let fields: string[] = []
      const query = {
        select(columns: string) { fields = columns.split(",").map((field) => field.trim()); return query },
        eq(field: string, value: unknown) { filters.push((row) => row[field] === value); return query },
        not(field: string, operator: string, value: unknown) {
          assert.equal(operator, "is")
          assert.equal(value, null)
          filters.push((row) => row[field] != null)
          return query
        },
        gte(field: string, value: string) {
          filters.push((row) => typeof row[field] === "string" && String(row[field]) >= value)
          return query
        },
        abortSignal(signal: AbortSignal) { assert.ok(signal instanceof AbortSignal); return query },
        async maybeSingle() {
          if (options.failTable === table) return { data: null, error: { message: "source unavailable" } }
          const matches = rows.filter((row) => filters.every((filter) => filter(row)))
          assert.ok(matches.length <= 1, "filtros devem identificar uma única notícia")
          const row = matches[0]
          return { data: row ? Object.fromEntries(fields.map((field) => [field, row[field]])) : null, error: null }
        },
      }
      return query
    },
  }
  const limiter = createFixedWindowIpRateLimiter({ namespace: "news-article-test", max: 60, windowMs: 60_000 })
  const handler = createNewsArticleHandler({
    getArticle: (slug, id) => getPublicNewsArticle(slug, id, client as unknown as Parameters<typeof getPublicNewsArticle>[2]),
    rateLimiter: limiter,
  })
  return {
    calls,
    async request(slug = CANDIDATE.slug, id = ARTICLE_ID) {
      return handler(new Request(`https://puxaficha.com.br/api/candidato-profile/${slug}/noticias/${id}`), {
        params: Promise.resolve({ slug, id }),
      })
    },
  }
}

test("notícia pública retorna somente dados da matéria e indica menção direta", async () => {
  const f = fixture({ articles: [{ ...ARTICLE, secret_field: "não deve sair" }] })
  const response = await f.request()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  const publicArticle = {
    id: ARTICLE.id,
    titulo: ARTICLE.titulo,
    fonte: ARTICLE.fonte,
    url: ARTICLE.url,
    data_publicacao: ARTICLE.data_publicacao,
    snippet: ARTICLE.snippet,
  }
  assert.deepEqual(await response.json(), { data: { ...publicArticle, contexto_do_pleito: false } })
  assert.deepEqual(f.calls, ["candidatos_publico", "noticias_candidato"])
})

test("notícia individual limpa texto público, mantém UUID e não expõe candidato_id", async () => {
  const response = await fixture({ articles: [{
    ...ARTICLE,
    titulo: "Pessoa Teste apresenta proposta SQ_CANDIDATO 280000625869",
    snippet: "Documento 123.456.789-01. SQ_CANDIDATO=280000625869",
  }] }).request()
  assert.equal(response.status, 200)
  const { data } = await response.json()
  assert.equal(data.id, ARTICLE_ID)
  assert.equal(data.titulo, "Pessoa Teste apresenta proposta identificador oficial do TSE")
  assert.equal("candidato_id" in data, false)
  assert.ok(data.snippet.includes("[documento mascarado]"))
  assert.doesNotMatch(JSON.stringify(data), /123\.456\.789-01|SQ_CANDIDATO|280000625869/)
})

test("notícia de contexto continua identificada como contexto do pleito", async () => {
  const response = await fixture({ articles: [{ ...ARTICLE, titulo: "Calendário das eleições é divulgado" }] }).request()
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.contexto_do_pleito, true)
})

test("ID de notícia de outro candidato não vaza na ficha consultada", async () => {
  const response = await fixture({ articles: [{ ...ARTICLE, candidato_id: "candidate-other" }] }).request()
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { data: null })
})

test("outro ID da mesma ficha não é usado como substituto silencioso", async () => {
  const response = await fixture({ articles: [{ ...ARTICLE, id: "bbbbbbbb-2222-4222-8222-222222222222" }] }).request()
  assert.equal(response.status, 404)
})

test("candidato privado e candidato inexistente não permitem consulta de notícias", async () => {
  for (const candidates of [[], [{ ...CANDIDATE, publicavel: false }], [{ ...CANDIDATE, slug: "outra-pessoa" }]]) {
    const f = fixture({ candidates })
    const response = await f.request()
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { data: null })
    assert.deepEqual(f.calls, ["candidatos_publico"])
  }
})

test("notícias sem data ou fora da retenção não são recuperadas pelo link antigo", async () => {
  for (const data_publicacao of [null, new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString()]) {
    const response = await fixture({ articles: [{ ...ARTICLE, data_publicacao }] }).request()
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { data: null })
  }
})

test("link direto preserva o bloqueio editorial por candidato", async () => {
  const response = await fixture({
    candidates: [{ ...CANDIDATE, slug: "orleans-brandao", nome_urna: "Orleans Brandao" }],
    articles: [{ ...ARTICLE, fonte: "carlosbrandao.com.br" }],
  }).request("orleans-brandao")
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { data: null })
})

test("falha em qualquer fonte retorna 503 e não se passa por notícia ausente", async () => {
  for (const failTable of ["candidatos_publico", "noticias_candidato"]) {
    const response = await fixture({ failTable }).request()
    assert.equal(response.status, 503)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.equal((await response.json()).data, null)
  }
})

test("UUID ou slug inválido retorna 400 antes de consultar fonte", async () => {
  for (const [slug, id] of [[CANDIDATE.slug, "id-invalido"], ["../privado", ARTICLE_ID]]) {
    const f = fixture()
    const response = await f.request(slug, id)
    assert.equal(response.status, 400)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.deepEqual(f.calls, [])
  }
})

test("limite de requisições e indisponibilidade do limitador param antes da consulta", async () => {
  for (const unavailable of [false, true]) {
    let reads = 0
    const handler = createNewsArticleHandler({
      getArticle: async () => { reads += 1; return null },
      rateLimiter: { check: () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000, unavailable }), reset() {} },
    })
    const response = await handler(new Request("https://puxaficha.com.br/api/candidato-profile/pessoa-teste/noticias/" + ARTICLE_ID), {
      params: Promise.resolve({ slug: CANDIDATE.slug, id: ARTICLE_ID }),
    })
    assert.equal(response.status, unavailable ? 503 : 429)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.ok(Number(response.headers.get("retry-after")) > 0)
    assert.equal(reads, 0)
  }
})
