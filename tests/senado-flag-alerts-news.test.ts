import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, it } from "node:test"
import { createFixedWindowIpRateLimiter } from "@/lib/request-rate-limit"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never

const { findPublicCandidateBySlug } = require("../src/lib/alerts") as typeof import("../src/lib/alerts")
const { getPublicNewsArticle } = require("../src/lib/news/article") as typeof import("../src/lib/news/article")
const { createNewsArticleHandler } = require("../src/app/api/candidato-profile/[slug]/noticias/[id]/route") as typeof import("../src/app/api/candidato-profile/[slug]/noticias/[id]/route")

const env = process.env as Record<string, string | undefined>
let savedFlag: string | undefined

const ARTICLE_ID = "bbbbbbbb-2222-4222-8222-222222222222"
const SENADOR = {
  id: "cand-senado",
  slug: "pessoa-senado-teste",
  nome_urna: "Pessoa Senado Teste",
  nome_completo: "Pessoa Senado Teste",
  partido_sigla: "PX",
  cargo_disputado: "Senador",
}
const GOVERNADOR = {
  id: "cand-governo",
  slug: "pessoa-governo-teste",
  nome_urna: "Pessoa Governo Teste",
  nome_completo: "Pessoa Governo Teste",
  partido_sigla: "PX",
  cargo_disputado: "Governador",
}
const ARTICLES = [SENADOR, GOVERNADOR].map((candidate, index) => ({
  id: index === 0 ? ARTICLE_ID : "cccccccc-3333-4333-8333-333333333333",
  candidato_id: candidate.id,
  titulo: `${candidate.nome_urna} apresenta proposta`,
  fonte: "Portal Exemplo",
  url: `https://portal.example/noticia-${index}`,
  data_publicacao: new Date().toISOString(),
  snippet: "A proposta foi apresentada nesta semana.",
}))

type Row = Record<string, unknown>

/** Cliente mínimo que respeita filtros e projeção do select. */
function fakeClient() {
  return {
    from(table: string) {
      const rows: Row[] = table === "candidatos_publico" ? [SENADOR, GOVERNADOR] : table === "noticias_candidato" ? ARTICLES : []
      assert.ok(rows.length > 0, `consulta inesperada: ${table}`)
      const filters: Array<(row: Row) => boolean> = []
      let fields: string[] = []
      const query = {
        select(columns: string) { fields = columns.split(",").map((field) => field.trim()); return query },
        eq(field: string, value: unknown) { filters.push((row) => row[field] === value); return query },
        not(field: string) { filters.push((row) => row[field] != null); return query },
        gte(field: string, value: string) { filters.push((row) => String(row[field]) >= value); return query },
        abortSignal() { return query },
        async maybeSingle() {
          const row = rows.find((candidate) => filters.every((filter) => filter(candidate)))
          return { data: row ? Object.fromEntries(fields.map((field) => [field, row[field]])) : null, error: null }
        },
      }
      return query
    },
  }
}

type AlertsClient = NonNullable<Parameters<typeof findPublicCandidateBySlug>[1]>
type NewsClient = Parameters<typeof getPublicNewsArticle>[2]

function newsHandler() {
  return createNewsArticleHandler({
    getArticle: (slug, id) => getPublicNewsArticle(slug, id, fakeClient() as unknown as NewsClient),
    rateLimiter: createFixedWindowIpRateLimiter({ namespace: "senado-flag-news-test", max: 60, windowMs: 60_000 }),
  })
}

async function requestNews(slug: string, id: string) {
  return newsHandler()(new Request(`https://puxaficha.com.br/api/candidato-profile/${slug}/noticias/${id}`), {
    params: Promise.resolve({ slug, id }),
  })
}

describe("flag do Senado em alertas e notícias", () => {
  beforeEach(() => {
    savedFlag = env.SENADO_ENABLED
  })

  afterEach(() => {
    if (savedFlag === undefined) delete env.SENADO_ENABLED
    else env.SENADO_ENABLED = savedFlag
  })

  it("findPublicCandidateBySlug trata Senador como inexistente com a flag desligada", async () => {
    delete env.SENADO_ENABLED
    const client = fakeClient() as unknown as AlertsClient
    assert.equal(await findPublicCandidateBySlug(SENADOR.slug, client), null)
    const governador = await findPublicCandidateBySlug(GOVERNADOR.slug, client)
    assert.equal(governador?.slug, GOVERNADOR.slug)
  })

  it("findPublicCandidateBySlug devolve Senador com a flag ligada", async () => {
    env.SENADO_ENABLED = "true"
    const senador = await findPublicCandidateBySlug(SENADOR.slug, fakeClient() as unknown as AlertsClient)
    assert.deepEqual(senador, {
      id: SENADOR.id,
      slug: SENADOR.slug,
      nome_urna: SENADOR.nome_urna,
      partido_sigla: SENADOR.partido_sigla,
      cargo_disputado: "Senador",
    })
  })

  it("rota de notícia responde 404 para Senador com a flag desligada", async () => {
    delete env.SENADO_ENABLED
    const response = await requestNews(SENADOR.slug, ARTICLE_ID)
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { data: null })

    const governador = await requestNews(GOVERNADOR.slug, ARTICLES[1].id)
    assert.equal(governador.status, 200)
  })

  it("rota de notícia responde 200 para Senador com a flag ligada", async () => {
    env.SENADO_ENABLED = "true"
    const response = await requestNews(SENADOR.slug, ARTICLE_ID)
    assert.equal(response.status, 200)
    const { data } = await response.json()
    assert.equal(data.id, ARTICLE_ID)
    assert.equal("cargo_disputado" in data, false)
  })
})
