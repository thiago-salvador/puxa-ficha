import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import { createFixedWindowIpRateLimiter } from "@/lib/request-rate-limit"
import { formatPublicNewsCursor, nextPublicNewsCursor, parsePublicNewsCursor, PUBLIC_NEWS_PAGE_SIZE } from "@/lib/news/news-cursor"
import type { NoticiaCandidato } from "@/lib/types"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never

const { fetchPublicNewsPage, getPublicNewsPageBySlug, toPublicNewsItems, PUBLIC_NEWS_FETCH_LIMIT } =
  require("../src/lib/news/public-page") as typeof import("../src/lib/news/public-page")
const { splitNewsByDenylist } = require("../src/lib/news/denylist") as typeof import("../src/lib/news/denylist")
const { newsTitleMentionsCandidate } = require("../src/lib/news/name-match") as typeof import("../src/lib/news/name-match")
const { createNewsPageHandler } =
  require("../src/app/api/candidato-profile/[slug]/noticias/route") as typeof import("../src/app/api/candidato-profile/[slug]/noticias/route")

// Ficha com regra real na denylist editorial: publisher inteiro bloqueado.
const CANDIDATO = {
  id: "cand-orleans",
  slug: "orleans-brandao",
  nome_urna: "Orleans Brandao",
  nome_completo: "Carlos Orleans Braide Brandao",
  cargo_disputado: "Governador",
}
const FONTE_BLOQUEADA = "carlosbrandao.com.br"

type Row = Record<string, unknown>

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`
}

/**
 * `total` notícias na ordem do banco (data desc, id desc), com empates de horário (três
 * por segundo) para exercitar o desempate por id. `bloqueada(i)` escolhe quais
 * saem pela denylist.
 */
function makeRows(total: number, bloqueada: (index: number) => boolean): NoticiaCandidato[] {
  const base = Date.now() - 60_000
  return Array.from({ length: total }, (_, index) => ({
    id: uuid(100_000 - index), // decrescente: a lista já sai na ordem do banco
    candidato_id: CANDIDATO.id,
    titulo: index % 4 === 0 ? `Calendário eleitoral ${index}` : `Orleans Brandao comenta pauta ${index}`,
    fonte: bloqueada(index) ? FONTE_BLOQUEADA : "Portal Exemplo",
    url: `https://portal.example/n-${index}`,
    data_publicacao: new Date(base - Math.floor(index / 3) * 1000).toISOString(),
    snippet: null,
  }))
}

/** Cliente mínimo que respeita filtros, cursor, ordem, limite, contagem e projeção. */
function fakeClient(rowsByTable: Record<string, readonly object[]>) {
  const calls: string[] = []
  const client = {
    from(table: string) {
      calls.push(table)
      const rows = (rowsByTable[table] ?? []) as Row[]
      const filters: Array<(row: Row) => boolean> = []
      let fields: string[] = []
      let countMode = false
      let head = false
      let limit = Infinity
      let range: [number, number] | null = null
      const run = () => {
        const matched = rows.filter((row) => filters.every((filter) => filter(row)))
          .sort((a, b) => String(b.data_publicacao).localeCompare(String(a.data_publicacao)) || String(b.id).localeCompare(String(a.id)))
        const sliced = range ? matched.slice(range[0], range[1] + 1) : matched.slice(0, limit)
        const projected = sliced.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])))
        return { data: head ? null : projected, error: null, count: countMode ? matched.length : null }
      }
      const query = {
        select(columns: string, options?: { count?: string; head?: boolean }) {
          fields = columns.split(",").map((field) => field.trim())
          countMode = options?.count === "exact"
          head = options?.head === true
          return query
        },
        abortSignal() { return query },
        eq(field: string, value: unknown) { filters.push((row) => row[field] === value); return query },
        not(field: string) { filters.push((row) => row[field] != null); return query },
        gte(field: string, value: string) { filters.push((row) => new Date(String(row[field])) >= new Date(value)); return query },
        or(expression: string) {
          const match = /^data_publicacao\.lt\."([^"]+)",and\(data_publicacao\.eq\."([^"]+)",id\.lt\.([0-9a-f-]+)\)$/.exec(expression)
          assert.ok(match, `filtro de cursor inesperado: ${expression}`)
          const [, data, dataEq, id] = match
          assert.equal(data, dataEq)
          const cut = new Date(data).getTime()
          filters.push((row) => {
            const t = new Date(String(row.data_publicacao)).getTime()
            return t < cut || (t === cut && String(row.id) < id)
          })
          return query
        },
        order() { return query },
        limit(value: number) { limit = value; return query },
        range(from: number, to: number) { range = [from, to]; return query },
        async maybeSingle() {
          const { data } = run()
          assert.ok((data ?? []).length <= 1)
          return { data: data?.[0] ?? null, error: null }
        },
        then<T>(resolve: (value: ReturnType<typeof run>) => T) { return Promise.resolve(run()).then(resolve) },
      }
      return query
    },
  }
  return { client: client as never, calls }
}

/** O mapeamento que a ficha fazia antes da extração, copiado como referência. */
function legacySsrMapping(rows: NoticiaCandidato[]) {
  return splitNewsByDenylist(rows, CANDIDATO.slug).permitidos
    .slice(0, 20)
    .map((noticia) => ({ ...noticia, contexto_do_pleito: !newsTitleMentionsCandidate(noticia.titulo, CANDIDATO) }))
}

describe("lista pública de notícias: prévia e páginas seguintes", () => {
  it("prévia compartilhada é idêntica ao mapeamento antigo da ficha e à primeira página da rota", async () => {
    const rows = makeRows(60, (index) => index === 2 || index === 7 || index === 19 || index === 20)
    const primeiras = rows.slice(0, PUBLIC_NEWS_FETCH_LIMIT)
    const ssr = toPublicNewsItems(primeiras, CANDIDATO)
    assert.deepEqual(ssr, legacySsrMapping(primeiras))
    assert.equal(ssr.length, PUBLIC_NEWS_PAGE_SIZE)
    assert.ok(ssr.some((item) => item.contexto_do_pleito) && ssr.some((item) => !item.contexto_do_pleito))

    const { client } = fakeClient({ noticias_candidato: rows })
    const page = await fetchPublicNewsPage(client, CANDIDATO, null)
    assert.deepEqual(page.items, ssr)
  })

  it("serialização pública entrega o cursor da prévia com o ID real da última notícia", () => {
    const rows = makeRows(25, () => false)
    const previa = toPublicNewsItems(rows, CANDIDATO)
    assert.equal(nextPublicNewsCursor(previa), formatPublicNewsCursor(previa[19]))
    assert.ok(parsePublicNewsCursor(nextPublicNewsCursor(previa) ?? ""))
    assert.equal(nextPublicNewsCursor(previa.slice(0, 19)), null, "prévia incompleta já é a janela inteira")
    const dto = readFileSync("src/lib/public-profile-dto.ts", "utf8")
    assert.match(dto, /noticias_cursor: nextPublicNewsCursor\(ficha\.noticias \?\? \[\]\)/)
  })

  it("ficha usa a mesma consulta e o mesmo mapeamento compartilhados", () => {
    const api = readFileSync("src/lib/api.ts", "utf8")
    assert.match(api, /publicNewsWindowQuery\(supabase, id, null, PUBLIC_NEWS_FETCH_LIMIT, signal\)/)
    assert.match(api, /noticias: toPublicNewsItems\(/)
  })

  it("páginas por cursor cobrem a janela inteira sem repetir nem pular, com bloqueios no meio e na borda", async () => {
    const blocos = new Set([0, 5, 19, 20, 21, 39, 40, 41, 77])
    for (let index = 90; index < 160; index++) blocos.add(index) // trecho maior que uma leitura inteira
    const rows = makeRows(230, (index) => blocos.has(index))
    const esperado = splitNewsByDenylist(rows, CANDIDATO.slug).permitidos.map((row) => row.id)
    const { client } = fakeClient({ noticias_candidato: rows })

    const vistos = toPublicNewsItems(rows.slice(0, PUBLIC_NEWS_FETCH_LIMIT), CANDIDATO).map((item) => item)
    let cursor = parsePublicNewsCursor(formatPublicNewsCursor(vistos[vistos.length - 1]))
    let paginas = 0
    while (cursor) {
      const page = await fetchPublicNewsPage(client, CANDIDATO, cursor)
      assert.ok(page.items.length <= PUBLIC_NEWS_PAGE_SIZE)
      if (page.nextCursor) assert.equal(page.items.length, PUBLIC_NEWS_PAGE_SIZE, "página intermediária sai cheia")
      vistos.push(...page.items)
      cursor = page.nextCursor
      assert.ok(++paginas < 50, "paginação precisa terminar")
    }
    const ids = vistos.map((item) => item.id)
    assert.equal(new Set(ids).size, ids.length, "nenhuma notícia repetida")
    assert.deepEqual(ids, esperado, "nenhuma notícia pulada e ordem preservada")
    assert.ok(vistos.every((item) => item.fonte !== FONTE_BLOQUEADA))
  })

  it("trecho bloqueado maior que o teto de leituras não trava o cursor", async () => {
    const rows = makeRows(260, (index) => index >= 21 && index < 250)
    const { client } = fakeClient({ noticias_candidato: rows })
    const primeira = await fetchPublicNewsPage(client, CANDIDATO, null)
    assert.equal(primeira.items.length, 20)
    const segunda = await fetchPublicNewsPage(client, CANDIDATO, primeira.nextCursor)
    assert.ok(segunda.nextCursor, "teto de leituras devolve cursor além das linhas bloqueadas")
    const terceira = await fetchPublicNewsPage(client, CANDIDATO, segunda.nextCursor)
    const ids = [...primeira.items, ...segunda.items, ...terceira.items].map((item) => item.id)
    assert.deepEqual(ids, splitNewsByDenylist(rows, CANDIDATO.slug).permitidos.map((row) => row.id))
    assert.equal(terceira.nextCursor, null)
  })

  it("total desconta a denylist e respeita a janela de retenção", async () => {
    const base = makeRows(50, (index) => index % 10 === 0)
    const rows: object[] = [
      ...base,
      { ...base[1], id: uuid(9), data_publicacao: new Date(Date.now() - 400 * 86_400_000).toISOString() },
      { ...base[1], id: uuid(8), data_publicacao: null },
    ]
    const { client } = fakeClient({ candidatos_publico: [CANDIDATO], noticias_candidato: rows })
    const resource = await getPublicNewsPageBySlug(CANDIDATO.slug, null, 20, client)
    assert.ok(resource.known)
    assert.equal(resource.total, 45)
  })
})

describe("rota GET /api/candidato-profile/[slug]/noticias", () => {
  const rows = makeRows(70, (index) => index === 25)
  const primeiraPagina = toPublicNewsItems(rows.slice(0, PUBLIC_NEWS_FETCH_LIMIT), CANDIDATO)
  const cursorValido = formatPublicNewsCursor(primeiraPagina[primeiraPagina.length - 1])

  function route(candidates: Row[] = [CANDIDATO], env: Record<string, string | undefined> = {}) {
    const { client, calls } = fakeClient({ candidatos_publico: candidates, noticias_candidato: rows })
    const handler = createNewsPageHandler({
      getPage: (slug, cursor, limit) => {
        const saved = process.env.SENADO_ENABLED
        process.env.SENADO_ENABLED = env.SENADO_ENABLED
        try {
          return getPublicNewsPageBySlug(slug, cursor, limit, client)
        } finally {
          if (saved === undefined) delete process.env.SENADO_ENABLED
          else process.env.SENADO_ENABLED = saved
        }
      },
      rateLimiter: createFixedWindowIpRateLimiter({ namespace: `news-page-test-${Math.random()}`, max: 60, windowMs: 60_000 }),
    })
    return {
      calls,
      get(slug: string, query: string) {
        return handler(new Request(`https://puxaficha.com.br/api/candidato-profile/${slug}/noticias${query}`), {
          params: Promise.resolve({ slug }),
        })
      },
    }
  }

  it("devolve a página seguinte com cache de CDN, DTO público e próximo cursor", async () => {
    const r = route()
    const response = await r.get(CANDIDATO.slug, `?cursor=${encodeURIComponent(cursorValido)}`)
    assert.equal(response.status, 200)
    const cache = response.headers.get("cache-control") ?? ""
    assert.match(cache, /^public,/)
    assert.match(cache, /s-maxage=\d+/)
    assert.match(cache, /stale-while-revalidate=\d+/)
    const body = await response.json() as { data: Row[]; nextCursor: string | null; total: number }
    assert.equal(body.total, 69)
    assert.equal(body.data.length, 20)
    assert.equal(body.data[0].id, rows[20].id, "começa logo depois da prévia")
    assert.ok(body.data.every((item) => item.id !== rows[25].id), "item bloqueado fica de fora")
    assert.ok(body.data.every((item) => !("candidato_id" in item) && typeof item.contexto_do_pleito === "boolean"))
    assert.ok(body.nextCursor && parsePublicNewsCursor(body.nextCursor))
  })

  it("rejeita entrada inválida sem consultar o banco e sem cache", async () => {
    const casos: Array<[string, string]> = [
      ["Lula", `?cursor=${encodeURIComponent(cursorValido)}`],
      ["lula--x", `?cursor=${encodeURIComponent(cursorValido)}`],
      ["a".repeat(121), `?cursor=${encodeURIComponent(cursorValido)}`],
      [CANDIDATO.slug, ""],
      [CANDIDATO.slug, "?cursor=abc"],
      [CANDIDATO.slug, `?cursor=${encodeURIComponent(`2026-09-01T00:00:00Z_${"x".repeat(36)}`)}`],
      [CANDIDATO.slug, `?cursor=${encodeURIComponent(`2026-09-01",id.gt.0_${uuid(1)}`)}`],
      [CANDIDATO.slug, `?cursor=${encodeURIComponent(cursorValido)}&limite=0`],
      [CANDIDATO.slug, `?cursor=${encodeURIComponent(cursorValido)}&limite=21`],
      [CANDIDATO.slug, `?cursor=${encodeURIComponent(cursorValido)}&limite=2.5`],
    ]
    for (const [slug, query] of casos) {
      const r = route()
      const response = await r.get(slug, query)
      assert.equal(response.status, 400, `${slug} ${query}`)
      assert.equal(response.headers.get("cache-control"), "no-store")
      assert.deepEqual(r.calls, [])
    }
  })

  it("candidatura inexistente ou fora da publicação responde 404", async () => {
    const senadora = { ...CANDIDATO, slug: "pessoa-senado-teste", cargo_disputado: "Senador" }
    for (const [candidates, slug] of [[[], CANDIDATO.slug], [[senadora], senadora.slug]] as const) {
      const r = route([...candidates])
      const response = await r.get(slug, `?cursor=${encodeURIComponent(cursorValido)}`)
      assert.equal(response.status, 404)
      assert.deepEqual(r.calls, ["candidatos_publico"])
    }
  })

  it("falha de consulta vira 503 sem cache", async () => {
    const handler = createNewsPageHandler({
      getPage: async () => { throw new Error("banco fora") },
      rateLimiter: createFixedWindowIpRateLimiter({ namespace: "news-page-test-503", max: 60, windowMs: 60_000 }),
    })
    const response = await handler(new Request(`https://puxaficha.com.br/api/candidato-profile/lula/noticias?cursor=${encodeURIComponent(cursorValido)}`), {
      params: Promise.resolve({ slug: "lula" }),
    })
    assert.equal(response.status, 503)
    assert.equal(response.headers.get("cache-control"), "no-store")
  })
})
