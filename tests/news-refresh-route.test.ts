import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, it } from "node:test"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { NextRequest } = require("next/server") as typeof import("next/server")
const { createNewsRefreshHandler } = require("../src/app/api/news/refresh/route") as typeof import("../src/app/api/news/refresh/route")

const CRON_SECRET = "cron-secret-news-test"
const ROUTE_URL = "https://puxaficha.com.br/api/news/refresh"
const ROOT_EXECUTION_ID = "11111111-1111-4111-8111-111111111111"
const OTHER_EXECUTION_ID = "22222222-2222-4222-8222-222222222222"
const EXECUTION_HEADER = "x-puxaficha-news-execution-id"

interface FakeCandidato {
  id: string
  slug: string
  nome_urna: string
  cargo_disputado: string | null
}

function makeCandidatos(total: number): FakeCandidato[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `id-${i}`,
    slug: `cand-${i}`,
    nome_urna: `Cand ${i}`,
    cargo_disputado: "Deputado Federal",
  }))
}

interface ColetaTentativaFake {
  alvo: string
  candidato_id: string
  resultado: "encontrado" | "vazio_confirmado" | "erro"
  volume: number
  detalhe: string
  url: string
  duracao_ms: number
}

interface Captured {
  afterCallbacks: Array<() => Promise<void> | void>
  revalidatedTags: string[]
  fetchCalls: Array<{ url: string; init?: RequestInit }>
  pageCalls: Array<{ cursor: number; limit: number }>
  refreshedBatches: FakeCandidato[][]
  logCalls: Array<{ event: string; detail: Record<string, unknown> }>
  coletaBatches: ColetaTentativaFake[][]
  coletaExecutionIds: string[]
  coletaCursors: number[]
  coletaWriteKeys: Set<string>
  sleepCalls: number[]
  claimCalls: Array<{ executionId: string; cursor: number }>
  completedKeys: string[]
  retryableKeys: string[]
  continuationClaims: string[]
  nowMs: number
}

interface BatchRecord {
  executionId: string
  cursor: number
  limit: number
  chainDepth: number
  shouldChain: boolean
  revalidateRequested: boolean
  state: "processing" | "retryable" | "completed"
  ownerToken: string | null
  leaseUntil: number
  nextCursor: number | null
  continuationState: "none" | "pending" | "dispatching" | "dispatched"
  continuationToken: string | null
  continuationLeaseUntil: number
}

function coletaDe(cand: FakeCandidato): ColetaTentativaFake {
  return {
    alvo: cand.slug,
    candidato_id: cand.id,
    resultado: "encontrado",
    volume: 20,
    detalhe: "rss respondeu 20 item(ns)",
    url: `https://news.google.com/rss/search?q=${cand.slug}`,
    duracao_ms: 10,
  }
}

function createDeps(allCandidatos: FakeCandidato[]) {
  const captured: Captured = {
    afterCallbacks: [],
    revalidatedTags: [],
    fetchCalls: [],
    pageCalls: [],
    refreshedBatches: [],
    logCalls: [],
    coletaBatches: [],
    coletaExecutionIds: [],
    coletaCursors: [],
    coletaWriteKeys: new Set<string>(),
    sleepCalls: [],
    claimCalls: [],
    completedKeys: [],
    retryableKeys: [],
    continuationClaims: [],
    nowMs: 0,
  }
  const batches = new Map<string, BatchRecord>()
  let tokenSequence = 0
  const keyOf = (executionId: string, cursor: number) => `${executionId}:${cursor}`
  const nextToken = (prefix: string) => `${prefix}-${++tokenSequence}`

  const runStore = {
    acquireBatch: async (
      config: {
        executionId: string
        cursor: number
        limit: number
        chainDepth: number
        shouldChain: boolean
        revalidateRequested: boolean
      },
      leaseSeconds: number,
    ) => {
      captured.claimCalls.push({ executionId: config.executionId, cursor: config.cursor })
      const key = keyOf(config.executionId, config.cursor)
      let record = batches.get(key)
      const canTake =
        !record ||
        record.state === "retryable" ||
        (record.state === "processing" && record.leaseUntil <= captured.nowMs)
      if (canTake) {
        record = record ?? {
          ...config,
          state: "processing",
          ownerToken: null,
          leaseUntil: 0,
          nextCursor: null,
          continuationState: "none",
          continuationToken: null,
          continuationLeaseUntil: 0,
        }
        record.state = "processing"
        record.ownerToken = nextToken("owner")
        record.leaseUntil = captured.nowMs + leaseSeconds * 1000
        batches.set(key, record)
      }
      if (!record) throw new Error("in-memory claim missing record")
      return {
        executionId: record.executionId,
        cursor: record.cursor,
        limit: record.limit,
        chainDepth: record.chainDepth,
        shouldChain: record.shouldChain,
        revalidateRequested: record.revalidateRequested,
        acquired: canTake,
        state: record.state,
        ownerToken: canTake ? record.ownerToken : null,
        nextCursor: record.nextCursor,
        continuationState: record.continuationState,
      }
    },
    renewBatchLease: async ({
      executionId,
      cursor,
      ownerToken,
      leaseSeconds,
    }: {
      executionId: string
      cursor: number
      ownerToken: string
      leaseSeconds: number
    }) => {
      const record = batches.get(keyOf(executionId, cursor))
      if (!record || record.state !== "processing" || record.ownerToken !== ownerToken) return false
      record.leaseUntil = captured.nowMs + leaseSeconds * 1000
      return true
    },
    completeBatch: async ({
      executionId,
      cursor,
      ownerToken,
      nextCursor,
    }: {
      executionId: string
      cursor: number
      ownerToken: string
      nextCursor: number | null
    }) => {
      const key = keyOf(executionId, cursor)
      const record = batches.get(key)
      if (!record || record.state !== "processing" || record.ownerToken !== ownerToken) return false
      record.state = "completed"
      record.ownerToken = null
      record.nextCursor = nextCursor
      record.continuationState = nextCursor !== null && record.shouldChain ? "pending" : "none"
      captured.completedKeys.push(key)
      return true
    },
    markBatchRetryable: async ({
      executionId,
      cursor,
      ownerToken,
    }: {
      executionId: string
      cursor: number
      ownerToken: string
      error: string
    }) => {
      const key = keyOf(executionId, cursor)
      const record = batches.get(key)
      if (!record || record.state !== "processing" || record.ownerToken !== ownerToken) return false
      record.state = "retryable"
      record.ownerToken = null
      captured.retryableKeys.push(key)
      return true
    },
    claimContinuation: async ({
      executionId,
      cursor,
      leaseSeconds,
    }: {
      executionId: string
      cursor: number
      leaseSeconds: number
    }) => {
      const key = keyOf(executionId, cursor)
      const record = batches.get(key)
      const acquired = Boolean(
        record &&
          record.state === "completed" &&
          record.nextCursor !== null &&
          (record.continuationState === "pending" ||
            (record.continuationState === "dispatching" &&
              record.continuationLeaseUntil <= captured.nowMs)),
      )
      if (record && acquired) {
        record.continuationState = "dispatching"
        record.continuationToken = nextToken("continuation")
        record.continuationLeaseUntil = captured.nowMs + leaseSeconds * 1000
        captured.continuationClaims.push(key)
      }
      return {
        acquired,
        token: acquired ? record?.continuationToken ?? null : null,
        nextCursor: record?.nextCursor ?? null,
        limit: record?.limit ?? 0,
        chainDepth: record?.chainDepth ?? 0,
        revalidateRequested: record?.revalidateRequested ?? false,
      }
    },
    finishContinuation: async ({
      executionId,
      cursor,
      token,
      accepted,
    }: {
      executionId: string
      cursor: number
      token: string
      accepted: boolean
    }) => {
      const record = batches.get(keyOf(executionId, cursor))
      if (!record || record.continuationToken !== token) return false
      record.continuationState = accepted ? "dispatched" : "pending"
      record.continuationToken = null
      return true
    },
    listRecoverable: async () => [],
  }

  const deps = {
    fetchCandidatoPage: async ({ cursor, limit }: { cursor: number; limit: number }) => {
      captured.pageCalls.push({ cursor, limit })
      return {
        candidatos: allCandidatos.slice(cursor, cursor + limit),
        total: allCandidatos.length,
      }
    },
    refreshNews: async (candidatos: FakeCandidato[]) => {
      captured.refreshedBatches.push(candidatos)
      return {
        processed: candidatos.length,
        withNews: candidatos.length,
        rowsUpserted: candidatos.length * 20,
        discardedByName: 0,
        discardedByDenylist: 0,
        errors: [] as Array<{ slug: string; error: string }>,
        coletas: candidatos.map(coletaDe),
      }
    },
    registrarColetas: async (
      tentativas: ColetaTentativaFake[],
      executionId: string,
      batchCursor: number,
    ) => {
      captured.coletaBatches.push(tentativas)
      captured.coletaExecutionIds.push(executionId)
      captured.coletaCursors.push(batchCursor)
      for (const tentativa of tentativas) {
        captured.coletaWriteKeys.add(
          `google-news:${executionId}:${batchCursor}:${tentativa.candidato_id}`,
        )
      }
    },
    runStore,
    revalidate: (tag: string) => {
      captured.revalidatedTags.push(tag)
    },
    afterResponse: (cb: () => Promise<void> | void) => {
      captured.afterCallbacks.push(cb)
    },
    fetchImpl: (async (url: string | URL, init?: RequestInit) => {
      captured.fetchCalls.push({ url: String(url), init })
      const requestUrl = new URL(String(url))
      const headers = init?.headers as Record<string, string>
      return Response.json(
        {
          accepted: true,
          alreadyAccepted: false,
          workScheduled: true,
          state: "processing",
          executionId: headers[EXECUTION_HEADER],
          cursor: Number(requestUrl.searchParams.get("cursor")),
        },
        { status: 200 },
      )
    }) as unknown as typeof fetch,
    sleep: async (ms: number) => {
      captured.sleepCalls.push(ms)
    },
    log: (event: string, detail: Record<string, unknown>) => {
      captured.logCalls.push({ event, detail })
    },
    createExecutionId: () => ROOT_EXECUTION_ID,
    now: () => captured.nowMs,
    // 0 força uma página por invocação: é o modo que exercita o encadeamento
    // nos testes. O orçamento real (240s) é coberto pelos testes de orçamento.
    invocationBudgetMs: 0,
  }

  return { deps, captured, batches }
}

function makeRequest(
  params: Record<string, string> = {},
  opts: { secret?: string | null; origin?: string; executionId?: string | null } = {},
) {
  const url = new URL(opts.origin ? `${opts.origin}/api/news/refresh` : ROUTE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = {}
  const secret = opts.secret === undefined ? CRON_SECRET : opts.secret
  if (secret !== null) headers.Authorization = `Bearer ${secret}`
  if (opts.executionId) headers[EXECUTION_HEADER] = opts.executionId
  return new NextRequest(url, { method: "POST", headers })
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

describe("news refresh route", () => {
  const savedSecret = process.env.CRON_SECRET
  const savedVercelEnv = process.env.VERCEL_ENV
  const savedChainOrigin = process.env.PF_CRON_CHAIN_ORIGIN

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET
    delete process.env.VERCEL_ENV
    delete process.env.PF_CRON_CHAIN_ORIGIN
  })

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = savedSecret
    if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = savedVercelEnv
    if (savedChainOrigin === undefined) delete process.env.PF_CRON_CHAIN_ORIGIN
    else process.env.PF_CRON_CHAIN_ORIGIN = savedChainOrigin
  })

  it("rejects requests without a valid CRON_SECRET", async () => {
    const { deps, captured } = createDeps(makeCandidatos(10))
    const handler = createNewsRefreshHandler(deps)

    const noSecret = await handler(makeRequest({}, { secret: null }))
    assert.equal(noSecret.status, 401)

    const wrongSecret = await handler(makeRequest({}, { secret: "wrong" }))
    assert.equal(wrongSecret.status, 401)

    // Nenhum trabalho roda quando a auth falha.
    assert.equal(captured.pageCalls.length, 0)
    assert.equal(captured.refreshedBatches.length, 0)
    assert.equal(captured.claimCalls.length, 0)
    assert.equal(captured.afterCallbacks.length, 0)
  })

  it("returns 503 when the candidate page query fails", async () => {
    const { deps } = createDeps(makeCandidatos(10))
    deps.fetchCandidatoPage = async () => {
      throw new Error("db down")
    }
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(makeRequest())
    assert.equal(res.status, 503)
  })

  it("processes a single batch, does not chain, and does not flush the global ficha cache by default", async () => {
    const { deps, captured } = createDeps(makeCandidatos(4))
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(makeRequest({ limit: "5" }))
    const body = await readJson(res)

    assert.equal(res.status, 200)
    assert.equal(body.processed, 4)
    assert.equal(body.nextCursor, null)
    assert.equal(body.chainScheduled, false)
    assert.equal(body.revalidated, null)
    assert.equal(body.revalidateRequested, false)
    // total <= limit: sem encadeamento e sem flush global automatico.
    assert.equal(captured.afterCallbacks.length, 0)
    assert.deepEqual(captured.revalidatedTags, [])
  })

  it("schedules a chained self-invocation and does NOT flush while more remain", async () => {
    const { deps, captured } = createDeps(makeCandidatos(13))
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(makeRequest({ limit: "5" }))
    const body = await readJson(res)

    assert.equal(res.status, 200)
    assert.equal(body.processed, 5)
    assert.equal(body.nextCursor, 5)
    assert.equal(body.chainScheduled, true)
    assert.equal(body.revalidated, null)
    // hasMore: nao revalida ainda.
    assert.deepEqual(captured.revalidatedTags, [])
    assert.equal(captured.afterCallbacks.length, 1)

    // O callback agendado chama a propria rota com o proximo cursor + bearer.
    await captured.afterCallbacks[0]()
    assert.equal(captured.fetchCalls.length, 1)
    const chained = captured.fetchCalls[0]
    assert.match(chained.url, /cursor=5/)
    assert.match(chained.url, /depth=1/)
    assert.match(chained.url, /chain=1/)
    assert.equal(chained.init?.method, "POST")
    assert.equal(
      (chained.init?.headers as Record<string, string>).Authorization,
      `Bearer ${CRON_SECRET}`,
    )
    assert.equal(
      (chained.init?.headers as Record<string, string>)[EXECUTION_HEADER],
      ROOT_EXECUTION_ID,
    )
  })

  it("preserves explicit manual revalidation across chained self-invocations", async () => {
    const { deps, captured } = createDeps(makeCandidatos(13))
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(makeRequest({ limit: "5", revalidate: "1" }))
    const body = await readJson(res)

    assert.equal(res.status, 200)
    assert.equal(body.chainScheduled, true)
    assert.equal(body.revalidated, null)
    assert.equal(body.revalidateRequested, true)
    assert.deepEqual(captured.revalidatedTags, [])
    assert.equal(captured.afterCallbacks.length, 1)

    await captured.afterCallbacks[0]()
    assert.equal(captured.fetchCalls.length, 1)
    assert.match(captured.fetchCalls[0].url, /revalidate=1/)
  })

  it("does not flush cache on the last batch of a chain unless explicitly requested", async () => {
    const { deps, captured } = createDeps(makeCandidatos(13))
    const handler = createNewsRefreshHandler(deps)

    // cursor=10, limit=5 cobre os candidatos 10..12 (3), encerrando o universo.
    const res = await handler(makeRequest({ cursor: "10", limit: "5", depth: "2" }))
    const body = await readJson(res)

    assert.equal(body.processed, 3)
    assert.equal(body.nextCursor, null)
    assert.equal(body.chainScheduled, false)
    assert.equal(body.revalidated, null)
    assert.equal(body.revalidateRequested, false)
    assert.deepEqual(captured.revalidatedTags, [])
  })

  it("flushes the global ficha cache on the final batch when manual revalidation is requested", async () => {
    const { deps, captured } = createDeps(makeCandidatos(13))
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(makeRequest({ cursor: "10", limit: "5", depth: "2", revalidate: "1" }))
    const body = await readJson(res)

    assert.equal(body.processed, 3)
    assert.equal(body.nextCursor, null)
    assert.equal(body.chainScheduled, false)
    assert.equal(body.revalidated, "public-candidato-ficha")
    assert.equal(body.revalidateRequested, true)
    assert.deepEqual(captured.revalidatedTags, ["public-candidato-ficha"])
  })

  it("chains against the canonical origin in production even when invoked via *.vercel.app", async () => {
    // Cenario real do incidente de 2026-08-04: o cron da Vercel invoca a rota
    // pela URL do deployment, que fica atras do SSO. Encadear contra ela morre
    // num 302 silencioso, entao o chain deve mirar a origem canonica.
    process.env.VERCEL_ENV = "production"
    const { deps, captured } = createDeps(makeCandidatos(13))
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(
      makeRequest({ limit: "5" }, { origin: "https://puxa-ficha-abc123-thiagosalvador.vercel.app" }),
    )
    assert.equal(res.status, 200)
    assert.equal(captured.afterCallbacks.length, 1)

    await captured.afterCallbacks[0]()
    assert.equal(captured.fetchCalls.length, 1)
    const chainedUrl = new URL(captured.fetchCalls[0].url)
    assert.equal(chainedUrl.origin, "https://puxaficha.com.br")
    assert.equal(chainedUrl.pathname, "/api/news/refresh")
    assert.equal(chainedUrl.searchParams.get("cursor"), "5")
  })

  it("prefers PF_CRON_CHAIN_ORIGIN over the canonical fallback when set", async () => {
    process.env.VERCEL_ENV = "production"
    process.env.PF_CRON_CHAIN_ORIGIN = "https://staging.puxaficha.com.br"
    const { deps, captured } = createDeps(makeCandidatos(13))
    const handler = createNewsRefreshHandler(deps)

    await handler(
      makeRequest({ limit: "5" }, { origin: "https://puxa-ficha-abc123-thiagosalvador.vercel.app" }),
    )
    await captured.afterCallbacks[0]()
    assert.equal(new URL(captured.fetchCalls[0].url).origin, "https://staging.puxaficha.com.br")
  })

  it("keeps chaining against the request origin outside production", async () => {
    // Dev local e preview: sem VERCEL_ENV=production e sem override, o chain
    // continua apontando pra propria origem (preview nunca dispara producao).
    const { deps, captured } = createDeps(makeCandidatos(13))
    const handler = createNewsRefreshHandler(deps)

    await handler(makeRequest({ limit: "5" }, { origin: "http://localhost:3000" }))
    await captured.afterCallbacks[0]()
    assert.equal(new URL(captured.fetchCalls[0].url).origin, "http://localhost:3000")
  })

  it("logs chain_fetch_failed when the chained fetch answers non-2xx (e.g. SSO 302)", async () => {
    const { deps, captured } = createDeps(makeCandidatos(13))
    deps.fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      captured.fetchCalls.push({ url: String(url), init })
      return new Response(null, { status: 302, headers: { Location: "https://vercel.com/sso-api" } })
    }) as unknown as typeof fetch
    const handler = createNewsRefreshHandler(deps)

    await handler(makeRequest({ limit: "5" }))
    await captured.afterCallbacks[0]()

    const failure = captured.logCalls.find((c) => c.event === "chain_fetch_failed")
    assert.ok(failure, "esperava log chain_fetch_failed para resposta 302")
    assert.equal(failure.detail.status, 302)
    assert.equal(failure.detail.nextCursor, 5)
  })

  it("does not log chain_fetch_failed when the chained fetch answers 2xx", async () => {
    const { deps, captured } = createDeps(makeCandidatos(13))
    const handler = createNewsRefreshHandler(deps)

    await handler(makeRequest({ limit: "5" }))
    await captured.afterCallbacks[0]()

    assert.equal(captured.logCalls.filter((c) => c.event === "chain_fetch_failed").length, 0)
  })

  it("processes the whole universe in one invocation when the budget allows, without chaining", async () => {
    // O motivo de existir do orçamento: a proteção anti-recursão da Vercel
    // devolve 508 no ~5º fetch encadeado (medido em produção em 2026-08-05),
    // então cobrir 194 candidatos com 39 hops nunca fecha. Com orçamento, a
    // invocação processa várias páginas e o chain quase não é usado.
    const { deps, captured } = createDeps(makeCandidatos(13))
    deps.invocationBudgetMs = 60_000
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(makeRequest({ limit: "5" }))
    const body = await readJson(res)

    assert.equal(res.status, 200)
    assert.equal(body.processed, 13)
    assert.equal(body.paginas, 3)
    assert.equal(body.nextCursor, null)
    assert.equal(body.chainScheduled, false)
    assert.deepEqual(
      captured.pageCalls.map((p) => p.cursor),
      [0, 5, 10],
    )
    // Pausa entre páginas, mas nenhuma após a última.
    assert.deepEqual(captured.sleepCalls, [1500, 1500])
    // Uma escrita de coleta_log por página, cobrindo todos os candidatos.
    assert.equal(captured.coletaBatches.flat().length, 13)
    assert.equal(captured.afterCallbacks.length, 0)
  })

  it("chains from the right cursor when the budget runs out mid-universe", async () => {
    const { deps } = createDeps(makeCandidatos(13))
    // Orçamento 0: esgota após a primeira página, o resto vai pelo chain.
    deps.invocationBudgetMs = 0
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(makeRequest({ limit: "5" }))
    const body = await readJson(res)

    assert.equal(res.status, 200)
    assert.equal(body.processed, 5)
    assert.equal(body.paginas, 1)
    assert.equal(body.nextCursor, 5)
    assert.equal(body.chainScheduled, true)
  })

  it("keeps the processed head and chains the tail when a mid-run page query fails", async () => {
    const { deps, captured } = createDeps(makeCandidatos(13))
    deps.invocationBudgetMs = 60_000
    const original = deps.fetchCandidatoPage
    let calls = 0
    deps.fetchCandidatoPage = async (args: { cursor: number; limit: number }) => {
      calls += 1
      if (calls === 2) throw new Error("db flake")
      return original(args)
    }
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(makeRequest({ limit: "5" }))
    const body = await readJson(res)

    // A cabeça processada não é perdida num 503: a resposta é 200 e a cauda
    // fica com o encadeamento, que retoma do cursor onde a consulta falhou.
    assert.equal(res.status, 200)
    assert.equal(body.processed, 5)
    assert.equal(body.nextCursor, 5)
    assert.equal(body.chainScheduled, true)
    const failure = captured.logCalls.find((c) => c.event === "candidato_page_failed")
    assert.ok(failure, "esperava log candidato_page_failed")
    assert.equal(failure.detail.cursor, 5)
  })

  it("records one coleta_log tentativa per processed candidate", async () => {
    const { deps, captured } = createDeps(makeCandidatos(4))
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(makeRequest({ limit: "5" }))
    const body = await readJson(res)

    assert.equal(res.status, 200)
    assert.equal(body.coletaLinhas, 4)
    assert.equal(body.coletaLogOk, true)
    assert.equal(captured.coletaBatches.length, 1)
    assert.equal(captured.coletaBatches[0].length, 4)
    assert.deepEqual(
      captured.coletaBatches[0].map((t) => t.alvo),
      ["cand-0", "cand-1", "cand-2", "cand-3"],
    )
    assert.deepEqual(captured.coletaExecutionIds, [ROOT_EXECUTION_ID])
  })

  it("keeps the batch alive when coleta_log write fails, logging coleta_log_failed", async () => {
    const { deps, captured } = createDeps(makeCandidatos(4))
    deps.registrarColetas = async () => {
      throw new Error("insert denied")
    }
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(makeRequest({ limit: "5" }))
    const body = await readJson(res)

    // Telemetria nunca derruba o lote: resposta segue 200, com a falha visivel.
    assert.equal(res.status, 200)
    assert.equal(body.coletaLogOk, false)
    const failure = captured.logCalls.find((c) => c.event === "coleta_log_failed")
    assert.ok(failure, "esperava log coleta_log_failed")
    assert.equal(failure.detail.linhas, 4)
  })

  it("retries the chained fetch once before declaring chain_fetch_failed", async () => {
    const { deps, captured } = createDeps(makeCandidatos(13))
    let calls = 0
    deps.fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      captured.fetchCalls.push({ url: String(url), init })
      calls += 1
      if (calls === 1) throw new Error("socket hang up")
      const requestUrl = new URL(String(url))
      const headers = init?.headers as Record<string, string>
      return Response.json(
        {
          accepted: true,
          alreadyAccepted: false,
          workScheduled: true,
          state: "processing",
          executionId: headers[EXECUTION_HEADER],
          cursor: Number(requestUrl.searchParams.get("cursor")),
        },
        { status: 200 },
      )
    }) as unknown as typeof fetch
    const handler = createNewsRefreshHandler(deps)

    await handler(makeRequest({ limit: "5" }))
    await captured.afterCallbacks[0]()

    // Primeiro elo falhou, o retry salvou a fila do dia.
    assert.equal(captured.fetchCalls.length, 2)
    assert.equal(captured.logCalls.filter((c) => c.event === "chain_fetch_retry").length, 1)
    assert.equal(captured.logCalls.filter((c) => c.event === "chain_fetch_failed").length, 0)
    assert.deepEqual(captured.sleepCalls, [3000])
  })

  it("keeps the continuation pending when a duplicate child is still processing", async () => {
    const { deps, captured, batches } = createDeps(makeCandidatos(10))
    deps.fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      captured.fetchCalls.push({ url: String(url), init })
      const requestUrl = new URL(String(url))
      const headers = init?.headers as Record<string, string>
      return Response.json(
        {
          accepted: true,
          alreadyAccepted: true,
          workScheduled: false,
          state: "processing",
          executionId: headers[EXECUTION_HEADER],
          cursor: Number(requestUrl.searchParams.get("cursor")),
        },
        { status: 202 },
      )
    }) as unknown as typeof fetch
    const handler = createNewsRefreshHandler(deps)

    assert.equal((await handler(makeRequest({ cursor: "0", limit: "5" }))).status, 200)
    const dispatch = captured.afterCallbacks.shift()
    assert.ok(dispatch)
    await dispatch()

    assert.equal(batches.get(`${ROOT_EXECUTION_ID}:0`)?.continuationState, "pending")
    assert.equal(captured.refreshedBatches.length, 1)
    assert.equal(captured.coletaBatches.length, 1)
    assert.ok(captured.logCalls.some((entry) => entry.event === "chain_ack_ambiguous"))
  })

  it("accepts a child ACK only when execution id and cursor match", async () => {
    const { deps, captured, batches } = createDeps(makeCandidatos(10))
    let calls = 0
    deps.fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      captured.fetchCalls.push({ url: String(url), init })
      calls += 1
      const requestUrl = new URL(String(url))
      const headers = init?.headers as Record<string, string>
      return Response.json(
        {
          accepted: true,
          alreadyAccepted: false,
          workScheduled: true,
          state: "processing",
          executionId:
            calls === 1 ? "33333333-3333-4333-8333-333333333333" : headers[EXECUTION_HEADER],
          cursor: Number(requestUrl.searchParams.get("cursor")),
        },
        { status: 202 },
      )
    }) as unknown as typeof fetch
    const handler = createNewsRefreshHandler(deps)

    assert.equal((await handler(makeRequest({ cursor: "0", limit: "5" }))).status, 200)
    const dispatch = captured.afterCallbacks.shift()
    assert.ok(dispatch)
    await dispatch()

    assert.equal(calls, 2)
    assert.equal(batches.get(`${ROOT_EXECUTION_ID}:0`)?.continuationState, "dispatched")
    assert.equal(captured.logCalls.filter((entry) => entry.event === "chain_ack_ambiguous").length, 1)
  })

  it("stops chaining when MAX_CHAIN_DEPTH is reached even if more remain", async () => {
    const { deps, captured } = createDeps(makeCandidatos(100))
    const handler = createNewsRefreshHandler(deps)

    const res = await handler(makeRequest({ cursor: "0", limit: "5", depth: "40" }))
    const body = await readJson(res)

    // Ainda ha mais candidatos, mas o encadeamento para no teto de profundidade.
    assert.equal(body.chainScheduled, false)
    assert.equal(captured.afterCallbacks.length, 0)
    // hasMore segue true, entao NAO revalida (lote nao-final).
    assert.deepEqual(captured.revalidatedTags, [])
  })

  it("aceita o filho antes de 15s e torna o retry da mesma execução + cursor inofensivo", async () => {
    const { deps, captured } = createDeps(makeCandidatos(13))
    let refreshCalls = 0
    let releaseRefresh!: () => void
    let signalStarted!: () => void
    const refreshReleased = new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })
    const refreshStarted = new Promise<void>((resolve) => {
      signalStarted = resolve
    })
    const originalRefresh = deps.refreshNews
    deps.refreshNews = async (candidatos: FakeCandidato[]) => {
      refreshCalls += 1
      captured.nowMs += 16_001
      signalStarted()
      await refreshReleased
      return originalRefresh(candidatos)
    }
    const handler = createNewsRefreshHandler(deps)
    const request = () =>
      makeRequest(
        { cursor: "5", limit: "5", chain: "1", depth: "1" },
        { executionId: ROOT_EXECUTION_ID },
      )

    const accepted = await handler(request())
    const acceptedBody = await readJson(accepted)
    assert.equal(accepted.status, 202)
    assert.equal(acceptedBody.accepted, true)
    assert.equal(acceptedBody.alreadyAccepted, false)
    assert.equal(refreshCalls, 0, "o trabalho não começa antes do handshake")
    assert.equal(captured.afterCallbacks.length, 1)

    const worker = Promise.resolve(captured.afterCallbacks.shift()?.())
    await refreshStarted
    assert.equal(captured.nowMs, 16_001, "o processamento ultrapassou o timeout de 15s")

    const duplicate = await handler(request())
    const duplicateBody = await readJson(duplicate)
    assert.equal(duplicate.status, 202)
    assert.equal(duplicateBody.alreadyAccepted, true)
    assert.equal(captured.afterCallbacks.length, 0, "a duplicata não agenda outro worker")

    releaseRefresh()
    await worker

    assert.equal(refreshCalls, 1)
    assert.equal(captured.coletaBatches.length, 1)
    assert.deepEqual(captured.coletaExecutionIds, [ROOT_EXECUTION_ID])
    assert.equal(captured.continuationClaims.length, 1)
    assert.equal(captured.fetchCalls.length, 1, "há uma única continuação lógica")
    assert.equal(new URL(captured.fetchCalls[0].url).searchParams.get("cursor"), "10")
    assert.equal(
      (captured.fetchCalls[0].init?.headers as Record<string, string>)[EXECUTION_HEADER],
      ROOT_EXECUTION_ID,
    )
  })

  it("permite outra execução processar o mesmo cursor", async () => {
    const { deps, captured } = createDeps(makeCandidatos(4))
    const handler = createNewsRefreshHandler(deps)

    for (const executionId of [ROOT_EXECUTION_ID, OTHER_EXECUTION_ID]) {
      const response = await handler(
        makeRequest({ cursor: "0", limit: "5", chain: "1" }, { executionId }),
      )
      assert.equal(response.status, 202)
      const callback = captured.afterCallbacks.shift()
      assert.ok(callback)
      await callback()
    }

    assert.equal(captured.refreshedBatches.length, 2)
    assert.deepEqual(captured.coletaExecutionIds, [ROOT_EXECUTION_ID, OTHER_EXECUTION_ID])
  })

  it("permite outro cursor da mesma execução", async () => {
    const { deps, captured } = createDeps(makeCandidatos(4))
    const handler = createNewsRefreshHandler(deps)

    const first = await handler(
      makeRequest({ cursor: "0", limit: "5", chain: "0" }, { executionId: ROOT_EXECUTION_ID }),
    )
    const second = await handler(
      makeRequest({ cursor: "2", limit: "5", chain: "0" }, { executionId: ROOT_EXECUTION_ID }),
    )

    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.deepEqual(
      captured.pageCalls.map((call) => call.cursor),
      [0, 2],
    )
  })

  it("retoma lease vencida com novo owner e impede o owner antigo de executar", async () => {
    const { deps, captured } = createDeps(makeCandidatos(10))
    const handler = createNewsRefreshHandler(deps)
    const request = () =>
      makeRequest({ cursor: "0", limit: "5", chain: "1" }, { executionId: ROOT_EXECUTION_ID })

    assert.equal((await handler(request())).status, 202)
    const staleWorker = captured.afterCallbacks.shift()
    assert.ok(staleWorker)

    captured.nowMs = 601_000
    const resumed = await handler(request())
    const resumedBody = await readJson(resumed)
    assert.equal(resumed.status, 202)
    assert.equal(resumedBody.alreadyAccepted, false)
    const currentWorker = captured.afterCallbacks.shift()
    assert.ok(currentWorker)

    await currentWorker()
    await staleWorker()

    assert.equal(captured.refreshedBatches.length, 1)
    assert.equal(captured.coletaBatches.length, 1)
    assert.equal(captured.completedKeys.length, 1)
  })

  it("retoma lote marcado como retryable", async () => {
    const { deps, captured } = createDeps(makeCandidatos(4))
    const originalFetchPage = deps.fetchCandidatoPage
    deps.fetchCandidatoPage = async () => {
      throw new Error("db unavailable")
    }
    const handler = createNewsRefreshHandler(deps)
    const request = () =>
      makeRequest({ cursor: "0", limit: "5", chain: "1" }, { executionId: ROOT_EXECUTION_ID })

    assert.equal((await handler(request())).status, 202)
    const failedWorker = captured.afterCallbacks.shift()
    assert.ok(failedWorker)
    await failedWorker()
    assert.equal(captured.retryableKeys.length, 1)

    deps.fetchCandidatoPage = originalFetchPage
    const retried = await handler(request())
    const retriedBody = await readJson(retried)
    assert.equal(retried.status, 202)
    assert.equal(retriedBody.alreadyAccepted, false)
    const recoveredWorker = captured.afterCallbacks.shift()
    assert.ok(recoveredWorker)
    await recoveredWorker()

    assert.equal(captured.refreshedBatches.length, 1)
    assert.equal(captured.coletaBatches.length, 1)
  })

  it("rearma uma vez o mesmo filho quando o trabalho aceito falha", async () => {
    const { deps, captured } = createDeps(makeCandidatos(4))
    deps.fetchCandidatoPage = async () => {
      throw new Error("db unavailable")
    }
    const handler = createNewsRefreshHandler(deps)

    const accepted = await handler(
      makeRequest({ cursor: "0", limit: "5", chain: "1" }, { executionId: ROOT_EXECUTION_ID }),
    )
    assert.equal(accepted.status, 202)
    const worker = captured.afterCallbacks.shift()
    assert.ok(worker)
    await worker()

    assert.equal(captured.retryableKeys.length, 1)
    assert.equal(captured.fetchCalls.length, 1)
    assert.equal(new URL(captured.fetchCalls[0].url).searchParams.get("cursor"), "0")
    const headers = captured.fetchCalls[0].init?.headers as Record<string, string>
    assert.equal(headers[EXECUTION_HEADER], ROOT_EXECUTION_ID)
    assert.equal(headers["x-puxaficha-news-recovery-attempt"], "1")
  })

  it("retoma a mesma continuação pending sem reprocessar o lote concluído", async () => {
    const { deps, captured } = createDeps(makeCandidatos(10))
    deps.fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      captured.fetchCalls.push({ url: String(url), init })
      return new Response(null, { status: 503 })
    }) as unknown as typeof fetch
    const handler = createNewsRefreshHandler(deps)
    const request = () =>
      makeRequest({ cursor: "0", limit: "5" }, { executionId: ROOT_EXECUTION_ID })

    assert.equal((await handler(request())).status, 200)
    const firstDispatch = captured.afterCallbacks.shift()
    assert.ok(firstDispatch)
    await firstDispatch()
    assert.equal(captured.fetchCalls.length, 4)
    assert.equal(captured.refreshedBatches.length, 1)
    assert.equal(captured.coletaBatches.length, 1)

    deps.fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      captured.fetchCalls.push({ url: String(url), init })
      const requestUrl = new URL(String(url))
      const headers = init?.headers as Record<string, string>
      return Response.json(
        {
          accepted: true,
          alreadyAccepted: false,
          workScheduled: true,
          state: "processing",
          executionId: headers[EXECUTION_HEADER],
          cursor: Number(requestUrl.searchParams.get("cursor")),
        },
        { status: 202 },
      )
    }) as unknown as typeof fetch
    const duplicate = await handler(request())
    const duplicateBody = await readJson(duplicate)
    assert.equal(duplicate.status, 200)
    assert.equal(duplicateBody.alreadyAccepted, true)
    const recoveryDispatch = captured.afterCallbacks.shift()
    assert.ok(recoveryDispatch)
    await recoveryDispatch()

    assert.equal(captured.fetchCalls.length, 5)
    assert.equal(captured.refreshedBatches.length, 1, "a recuperação não repete refreshNews")
    assert.equal(captured.coletaBatches.length, 1, "a recuperação não repete coleta_log")
  })

  it("retoma continuação dispatching somente depois de a lease vencer", async () => {
    const { deps, captured, batches } = createDeps(makeCandidatos(10))
    const originalFinish = deps.runStore.finishContinuation
    let loseFirstFinishResponse = true
    deps.runStore.finishContinuation = async (args) => {
      if (loseFirstFinishResponse) {
        loseFirstFinishResponse = false
        throw new Error("continuation finish response lost")
      }
      return originalFinish(args)
    }
    const handler = createNewsRefreshHandler(deps)
    const request = () =>
      makeRequest({ cursor: "0", limit: "5" }, { executionId: ROOT_EXECUTION_ID })

    assert.equal((await handler(request())).status, 200)
    const firstDispatch = captured.afterCallbacks.shift()
    assert.ok(firstDispatch)
    await firstDispatch()
    assert.equal(captured.fetchCalls.length, 1)
    assert.equal(batches.get(`${ROOT_EXECUTION_ID}:0`)?.continuationState, "dispatching")

    // A duplicata pode agendar o callback, mas o claim atomico recusa a lease ativa.
    assert.equal((await handler(request())).status, 200)
    const activeLeaseRecovery = captured.afterCallbacks.shift()
    assert.ok(activeLeaseRecovery)
    await activeLeaseRecovery()
    assert.equal(captured.fetchCalls.length, 1)

    captured.nowMs = 1_000_000
    assert.equal((await handler(request())).status, 200)
    const expiredLeaseRecovery = captured.afterCallbacks.shift()
    assert.ok(expiredLeaseRecovery)
    await expiredLeaseRecovery()

    assert.equal(captured.fetchCalls.length, 2)
    assert.equal(captured.continuationClaims.length, 2)
    assert.equal(captured.refreshedBatches.length, 1)
    assert.equal(captured.coletaBatches.length, 1)
    assert.equal(batches.get(`${ROOT_EXECUTION_ID}:0`)?.continuationState, "dispatched")
  })

  it("não duplica linhas de coleta se falhar após o append e retomar o lote", async () => {
    const { deps, captured } = createDeps(makeCandidatos(4))
    const originalComplete = deps.runStore.completeBatch
    let failFirstCompletion = true
    deps.runStore.completeBatch = async (args) => {
      if (failFirstCompletion) {
        failFirstCompletion = false
        throw new Error("completion unavailable after coleta append")
      }
      return originalComplete(args)
    }
    const handler = createNewsRefreshHandler(deps)
    const request = () =>
      makeRequest({ cursor: "0", limit: "5", chain: "1" }, { executionId: ROOT_EXECUTION_ID })

    assert.equal((await handler(request())).status, 202)
    const failedWorker = captured.afterCallbacks.shift()
    assert.ok(failedWorker)
    await failedWorker()
    assert.equal(captured.retryableKeys.length, 1)
    assert.equal(captured.coletaWriteKeys.size, 4)

    assert.equal((await handler(request())).status, 202)
    const recoveredWorker = captured.afterCallbacks.shift()
    assert.ok(recoveredWorker)
    await recoveredWorker()

    assert.equal(captured.refreshedBatches.length, 2, "o upsert de notícias pode ser refeito")
    assert.equal(captured.coletaBatches.length, 2, "a retomada tenta persistir a mesma página")
    assert.deepEqual(captured.coletaCursors, [0, 0])
    assert.equal(captured.coletaWriteKeys.size, 4, "a chave única mantém uma linha por candidato")
  })

  it("owner vencido durante refresh não consegue duplicar coleta_log", async () => {
    const { deps, captured } = createDeps(makeCandidatos(4))
    const originalRefresh = deps.refreshNews
    let refreshCalls = 0
    let releaseFirst!: () => void
    let signalFirst!: () => void
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const firstStarted = new Promise<void>((resolve) => {
      signalFirst = resolve
    })
    deps.refreshNews = async (candidatos: FakeCandidato[]) => {
      refreshCalls += 1
      if (refreshCalls === 1) {
        captured.nowMs = 601_000
        signalFirst()
        await firstReleased
      }
      return originalRefresh(candidatos)
    }
    const handler = createNewsRefreshHandler(deps)
    const request = () =>
      makeRequest({ cursor: "0", limit: "5", chain: "1" }, { executionId: ROOT_EXECUTION_ID })

    assert.equal((await handler(request())).status, 202)
    const staleWorker = captured.afterCallbacks.shift()
    assert.ok(staleWorker)
    const stalePromise = Promise.resolve(staleWorker())
    await firstStarted

    assert.equal((await handler(request())).status, 202)
    const currentWorker = captured.afterCallbacks.shift()
    assert.ok(currentWorker)
    releaseFirst()
    await stalePromise
    assert.equal(captured.coletaBatches.length, 0)

    await currentWorker()
    assert.equal(refreshCalls, 2)
    assert.equal(captured.coletaBatches.length, 1)
  })

  it("não expõe o segredo em URL nem em logs, inclusive quando o erro contém o token", async () => {
    const { deps, captured } = createDeps(makeCandidatos(10))
    deps.fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      captured.fetchCalls.push({ url: String(url), init })
      throw new Error(`socket failed with Bearer ${CRON_SECRET}`)
    }) as unknown as typeof fetch
    const handler = createNewsRefreshHandler(deps)

    await handler(makeRequest({ limit: "5" }))
    const callback = captured.afterCallbacks.shift()
    assert.ok(callback)
    await callback()

    assert.equal(captured.fetchCalls.length, 4)
    assert.ok(captured.fetchCalls.every((call) => !call.url.includes(CRON_SECRET)))
    assert.ok(!JSON.stringify(captured.logCalls).includes(CRON_SECRET))
  })
})

describe("news refresh route: prazo e origem do encadeamento", () => {
  const savedSecret = process.env.CRON_SECRET
  const savedVercelEnv = process.env.VERCEL_ENV
  const savedChainOrigin = process.env.PF_CRON_CHAIN_ORIGIN

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET
    delete process.env.VERCEL_ENV
    delete process.env.PF_CRON_CHAIN_ORIGIN
  })

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = savedSecret
    if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = savedVercelEnv
    if (savedChainOrigin === undefined) delete process.env.PF_CRON_CHAIN_ORIGIN
    else process.env.PF_CRON_CHAIN_ORIGIN = savedChainOrigin
  })

  it("o fetch de encadeamento leva signal com prazo", async () => {
    const { deps, captured } = createDeps(makeCandidatos(10))
    const handler = createNewsRefreshHandler(deps)

    await handler(makeRequest({ limit: "5" }))
    for (const cb of captured.afterCallbacks) await cb()

    assert.equal(captured.fetchCalls.length, 1)
    // Sem signal, um POST interno travado nunca voltava: sem retry, sem
    // chain_fetch_failed e sem nova invocação para o resto da fila.
    assert.ok(captured.fetchCalls[0].init?.signal instanceof AbortSignal)
  })

  it("abort do prazo é registrado como timeout e ainda tenta de novo", async () => {
    const { deps, captured } = createDeps(makeCandidatos(10))
    deps.fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      captured.fetchCalls.push({ url: String(url), init })
      throw Object.assign(new Error("aborted"), { name: "AbortError" })
    }) as unknown as typeof fetch
    const handler = createNewsRefreshHandler(deps)

    await handler(makeRequest({ limit: "5" }))
    for (const cb of captured.afterCallbacks) await cb()

    const eventos = captured.logCalls.filter((l) => l.event.startsWith("chain_fetch_"))
    assert.deepEqual(
      eventos.map((e) => e.event),
      [
        "chain_fetch_retry",
        "chain_fetch_failed",
        "chain_fetch_retry",
        "chain_fetch_failed",
      ],
    )
    for (const e of eventos) assert.equal(e.detail.message, "timeout")
  })

  it("origem http fora de loopback não recebe o CRON_SECRET", async () => {
    process.env.PF_CRON_CHAIN_ORIGIN = "http://puxaficha.com.br"
    const { deps, captured, batches } = createDeps(makeCandidatos(10))
    const handler = createNewsRefreshHandler(deps)

    const response = await handler(makeRequest({ limit: "5" }))
    for (const cb of captured.afterCallbacks) await cb()

    // Falha alta, mas a cauda persiste pending para o sweeper recuperar depois.
    assert.equal(response.status, 500)
    assert.equal(captured.fetchCalls.length, 0)
    assert.equal(batches.get(`${ROOT_EXECUTION_ID}:0`)?.nextCursor, 5)
    assert.equal(batches.get(`${ROOT_EXECUTION_ID}:0`)?.continuationState, "pending")
    const rejeicao = captured.logCalls.find((l) => l.event === "chain_origin_rejected")
    assert.ok(rejeicao, "esperado chain_origin_rejected")
    assert.equal(rejeicao.detail.motivo, "sem_https")
  })

  it("origem https configurada continua encadeando normalmente", async () => {
    process.env.PF_CRON_CHAIN_ORIGIN = "https://staging.puxaficha.com.br"
    const { deps, captured } = createDeps(makeCandidatos(10))
    const handler = createNewsRefreshHandler(deps)

    await handler(makeRequest({ limit: "5" }))
    for (const cb of captured.afterCallbacks) await cb()

    assert.equal(captured.fetchCalls.length, 1)
    assert.ok(captured.fetchCalls[0].url.startsWith("https://staging.puxaficha.com.br/"))
    assert.equal(captured.logCalls.filter((l) => l.event === "chain_origin_rejected").length, 0)
  })

  it("loopback em http segue liberado, para o desenvolvimento local", async () => {
    const { deps, captured } = createDeps(makeCandidatos(10))
    const handler = createNewsRefreshHandler(deps)

    await handler(makeRequest({ limit: "5" }, { origin: "http://localhost:3000" }))
    for (const cb of captured.afterCallbacks) await cb()

    assert.equal(captured.fetchCalls.length, 1)
    assert.ok(captured.fetchCalls[0].url.startsWith("http://localhost:3000/"))
  })
})
