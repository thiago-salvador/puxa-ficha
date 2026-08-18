/**
 * Camada de fetch do Supabase: propagacao do AbortSignal e disciplina da fila
 * do semaforo.
 *
 * Regressoes cobertas aqui:
 * 1. A cadeia PostgREST -> fetch configurado -> fetch global tem que entregar o
 *    MESMO objeto de signal que `.abortSignal()` recebeu. Sem isso o abort do
 *    `withSupabaseRetry` nao cancela nada e a tentativa abandonada segura o slot.
 * 2. Abort com requisicao em voo devolve o slot e nao gera nova tentativa.
 * 3. A espera na fila nao tinha teto: um slot vazado pendurava todo caller
 *    seguinte ate o limite da plataforma.
 * 4. Waiter que desistia continuava na fila e recebia um slot que ninguem
 *    devolveria.
 */

import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { afterEach, describe, it } from "node:test"

// `@supabase/postgrest-js` e dependencia transitiva, nao declarada no
// package.json: importar dela direto quebra o gate do knip. `createClient` da
// o mesmo builder (`.from().select().abortSignal()`) por uma dependencia
// declarada, e ainda por cima e o caminho literal que a producao monta.
import { createClient } from "@supabase/supabase-js"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

// Import dinamico dentro de cada teste, depois do stub de `server-only` acima: o
// modulo lanca no carregamento fora do runtime React Server, e o runner compila
// este arquivo para CJS (sem top-level await).

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function stubFetch(handler: (input: unknown, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = handler as unknown as typeof fetch
  return handler
}

function okResponse(): Response {
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
}

/** Espera a fila do limiter chegar no tamanho esperado sem depender de timing fixo. */
async function waitForPending(
  limiter: { pending: number },
  expected: number,
  timeoutMs = 1000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (limiter.pending !== expected) {
    if (Date.now() > deadline) {
      throw new Error(`fila nao chegou a ${expected} waiters (atual: ${limiter.pending})`)
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe("cadeia PostgREST -> fetch configurado -> fetch global", () => {
  it("entrega ao fetch global o mesmo objeto de signal passado em .abortSignal()", async () => {
    const { createConfiguredFetch, createSupabaseFetchLimiter } = await import("../src/lib/supabase")
    const seen: Array<AbortSignal | null | undefined> = []
    stubFetch(async (_input, init) => {
      seen.push(init?.signal)
      return okResponse()
    })

    const limiter = createSupabaseFetchLimiter({ maxConcurrent: 2, queueTimeoutMs: 500 })
    const configuredFetch = createConfiguredFetch({ cacheMode: "no-store" }, limiter)

    // Cliente Supabase real apontado para o fetch configurado: e exatamente o
    // caminho que `createServerSupabaseClient` monta em producao.
    const postgrest = createClient("https://project.supabase.co", "anon-key-de-teste", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: configuredFetch as unknown as typeof fetch },
    })

    const controller = new AbortController()
    const { error } = await postgrest.from("candidatos").select("id").abortSignal(controller.signal)

    assert.equal(error, null, "a consulta stubada precisa responder sem erro")
    assert.equal(seen.length, 1, "fetch global deve ter sido chamado uma vez")
    assert.equal(
      seen[0],
      controller.signal,
      "o signal do .abortSignal() precisa chegar ao fetch global como o MESMO objeto"
    )
    assert.equal(limiter.active, 0, "slot precisa voltar ao semaforo")
  })

  it("abort em voo devolve o slot e nao dispara nova tentativa", async () => {
    const { createConfiguredFetch, createSupabaseFetchLimiter } = await import("../src/lib/supabase")

    let calls = 0
    // Fetch que so termina quando o signal aborta, como o fetch real faz.
    stubFetch(async (_input, init) => {
      calls += 1
      const signal = init?.signal
      return new Promise<Response>((_resolve, reject) => {
        const fail = () => {
          const abortError = new Error("The operation was aborted")
          abortError.name = "AbortError"
          reject(abortError)
        }
        if (signal?.aborted) {
          fail()
          return
        }
        signal?.addEventListener("abort", fail, { once: true })
      })
    })

    const limiter = createSupabaseFetchLimiter({ maxConcurrent: 1, queueTimeoutMs: 5_000 })
    const configuredFetch = createConfiguredFetch({}, limiter)

    const postgrest = createClient("https://project.supabase.co", "anon-key-de-teste", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: configuredFetch as unknown as typeof fetch },
    })

    const controller = new AbortController()
    // O builder do postgrest-js e lazy: so dispara o fetch quando alguem chama
    // `.then`. O `.then` abaixo poe a requisicao em voo sem bloquear o teste.
    const emVoo = postgrest
      .from("candidatos")
      .select("id")
      .abortSignal(controller.signal)
      .then((result) => result)

    // So aborta depois que a requisicao realmente ocupou o slot.
    const deadline = Date.now() + 1000
    while (limiter.active === 0) {
      if (Date.now() > deadline) throw new Error("a requisicao nunca ocupou slot do semaforo")
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(limiter.active, 1, "a requisicao em voo ocupa exatamente um slot")

    const abortadoEm = Date.now()
    controller.abort()
    const { error } = await emVoo
    const decorrido = Date.now() - abortadoEm

    assert.ok(error, "o abort precisa virar erro para o caller")
    assert.equal(calls, 1, "abort em voo nao pode gerar retentativa no fetch configurado")
    assert.equal(limiter.active, 0, "o slot da tentativa abortada precisa voltar")
    assert.equal(limiter.pending, 0)
    // O backoff da primeira retentativa e de 250ms. Um abort que ainda paga esse
    // backoff antes de desistir significa que o laco tratou o abort como falha
    // comum, e ai o caller espera a toa por uma tentativa que nunca acontece.
    assert.ok(
      decorrido < 150,
      `abort em voo precisa desistir sem pagar backoff (decorrido: ${decorrido}ms)`
    )
  })

  it("falha rapido quando o signal ja esta abortado, sem consumir slot nem chamar fetch", async () => {
    const { createConfiguredFetch, createSupabaseFetchLimiter } = await import("../src/lib/supabase")
    let calls = 0
    stubFetch(async () => {
      calls += 1
      return okResponse()
    })

    const controller = new AbortController()
    controller.abort()

    const limiter = createSupabaseFetchLimiter({ maxConcurrent: 1, queueTimeoutMs: 50 })
    const configuredFetch = createConfiguredFetch({}, limiter)

    await assert.rejects(
      configuredFetch("https://project.supabase.co/rest/v1/candidatos", {
        signal: controller.signal,
      }),
      (error: Error) => error.name === "AbortError"
    )

    assert.equal(calls, 0, "fetch global nao pode ser chamado com signal ja abortado")
    assert.equal(limiter.active, 0, "nenhum slot pode ter sido consumido")
    assert.equal(limiter.pending, 0, "nada pode ter entrado na fila")
  })
})

describe("semaforo de fetches do Supabase: barreira de abort", () => {
  // A barreira de abort do caminho feliz mora inteira dentro de `acquire`: e ela
  // que decide nao consumir vaga. O teste cobre a barreira sozinha, sem passar
  // pelo fetch configurado.
  it("acquire com signal ja abortado rejeita sem ocupar slot nem entrar na fila", async () => {
    const { createSupabaseFetchLimiter } = await import("../src/lib/supabase")
    const limiter = createSupabaseFetchLimiter({ maxConcurrent: 4, queueTimeoutMs: 50 })
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(limiter.acquire(controller.signal), (error: Error) => error.name === "AbortError")

    assert.equal(limiter.active, 0, "signal abortado nao pode consumir slot livre")
    assert.equal(limiter.pending, 0, "signal abortado nao pode virar waiter")
  })

  it("preserva o reason do caller quando ele e um Error", async () => {
    const { createSupabaseFetchLimiter } = await import("../src/lib/supabase")
    const limiter = createSupabaseFetchLimiter({ maxConcurrent: 1, queueTimeoutMs: 50 })
    const motivo = new Error("cancelado pelo teste")
    const controller = new AbortController()
    controller.abort(motivo)

    await assert.rejects(limiter.acquire(controller.signal), (error: Error) => error === motivo)
  })
})

describe("semaforo de fetches do Supabase: teto da fila", () => {
  it("rejeita a espera no teto configurado em vez de pendurar para sempre", async () => {
    const { createSupabaseFetchLimiter } = await import("../src/lib/supabase")
    const limiter = createSupabaseFetchLimiter({ maxConcurrent: 1, queueTimeoutMs: 40 })

    await limiter.acquire()
    assert.equal(limiter.active, 1)

    const started = Date.now()
    await assert.rejects(
      limiter.acquire(),
      (error: Error) =>
        error.name === "SupabaseFetchQueueTimeoutError" && /timed out after 40ms/.test(error.message)
    )
    assert.ok(Date.now() - started >= 30, "a espera precisa respeitar o teto antes de rejeitar")
    assert.equal(limiter.pending, 0, "waiter que estourou o teto sai da fila")
  })

  it("waiter que desiste some da fila e nao rouba o slot liberado depois", async () => {
    const { createSupabaseFetchLimiter } = await import("../src/lib/supabase")
    const limiter = createSupabaseFetchLimiter({ maxConcurrent: 1, queueTimeoutMs: 30 })

    await limiter.acquire()

    const desistente = limiter.acquire()
    await waitForPending(limiter, 1)

    await assert.rejects(desistente, (error: Error) => error.name === "SupabaseFetchQueueTimeoutError")
    assert.equal(limiter.pending, 0, "a fila precisa estar limpa apos a desistencia")

    // O slot liberado tem que ir para quem ainda espera, nunca para o desistente.
    let vencedorEntrou = false
    const vencedor = limiter.acquire().then(() => {
      vencedorEntrou = true
    })
    await waitForPending(limiter, 1)

    limiter.release()
    await vencedor

    assert.equal(vencedorEntrou, true, "o proximo waiter vivo recebe o slot")
    assert.equal(limiter.active, 1, "o slot foi transferido, nao duplicado nem perdido")
    assert.equal(limiter.pending, 0)

    limiter.release()
    assert.equal(limiter.active, 0)
  })

  it("aborto do caller enquanto ele espera na fila encerra a espera e limpa o waiter", async () => {
    const { createSupabaseFetchLimiter } = await import("../src/lib/supabase")
    const limiter = createSupabaseFetchLimiter({ maxConcurrent: 1, queueTimeoutMs: 5_000 })
    const controller = new AbortController()

    await limiter.acquire()
    const esperando = limiter.acquire(controller.signal)
    await waitForPending(limiter, 1)

    controller.abort()
    await assert.rejects(esperando, (error: Error) => error.name === "AbortError")
    assert.equal(limiter.pending, 0, "waiter abortado sai da fila")
    assert.equal(limiter.active, 1, "abortar na fila nao mexe nos slots em uso")
  })
})

describe("defaults do semaforo", () => {
  it("a concorrencia default cobre as 13 queries paralelas da ficha", async () => {
    const { DEFAULT_SUPABASE_FETCH_CONCURRENCY } = await import("../src/lib/supabase")
    assert.ok(
      DEFAULT_SUPABASE_FETCH_CONCURRENCY > 13,
      `default precisa ser maior que as 13 queries da ficha (atual: ${DEFAULT_SUPABASE_FETCH_CONCURRENCY})`
    )
  })

  it("o teto de fila default fica abaixo do timeout por tentativa do withSupabaseRetry", async () => {
    const { DEFAULT_SUPABASE_FETCH_QUEUE_TIMEOUT_MS } = await import("../src/lib/supabase")
    // `SUPABASE_ATTEMPT_TIMEOUT_MS` em src/lib/supabase-retry.ts e 15_000 e nao e
    // exportado. Enquanto `SupabaseFetchQueueTimeoutError` nao for classificado
    // como nao-retryable la, este teto e o que garante que a fila sature MAIS
    // rapido do que o timeout por tentativa, ou seja o pior caso sob contencao
    // so pode cair em relacao ao comportamento anterior.
    assert.ok(Number.isFinite(DEFAULT_SUPABASE_FETCH_QUEUE_TIMEOUT_MS))
    assert.ok(DEFAULT_SUPABASE_FETCH_QUEUE_TIMEOUT_MS > 0)
    assert.ok(
      DEFAULT_SUPABASE_FETCH_QUEUE_TIMEOUT_MS < 15_000,
      `teto de fila (${DEFAULT_SUPABASE_FETCH_QUEUE_TIMEOUT_MS}ms) precisa ficar abaixo dos 15000ms da tentativa`
    )
  })
})
