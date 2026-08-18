import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, test } from "node:test"

import { withSupabaseRetry } from "../src/lib/supabase-retry"

type Row = { ok: boolean }

/**
 * Query fake com a semantica do PostgREST: so termina quando a resposta chega OU
 * quando o signal registrado via `.abortSignal()` dispara. Sem `.abortSignal()`
 * ela fica pendurada para sempre, que era exatamente o bug observado em producao
 * (wrapper desistia em 15s, fetch HTTP seguia vivo ~177s ate morrer sozinho).
 */
function createHangingQuery() {
  const state = { registeredSignal: null as AbortSignal | null, settled: false, aborted: false }

  const builder = {
    abortSignal(signal: AbortSignal) {
      state.registeredSignal = signal
      return builder
    },
    then(
      resolve: (value: { data: Row | null; error: { message?: string } | null }) => unknown,
      reject: (reason: unknown) => unknown,
    ) {
      const promise = new Promise<{ data: Row | null; error: { message?: string } | null }>(
        (_, rejectInner) => {
          state.registeredSignal?.addEventListener("abort", () => {
            state.settled = true
            state.aborted = true
            rejectInner(new DOMException("The user aborted a request.", "AbortError"))
          })
        },
      )
      return promise.then(resolve, reject)
    },
  }

  return { builder, state }
}

describe("withSupabaseRetry propaga o AbortSignal para a query", () => {
  test("o caller recebe um signal e o timeout da tentativa aborta a query", async () => {
    const queries: ReturnType<typeof createHangingQuery>[] = []

    const result = await withSupabaseRetry<Row>(
      "abort-aware-query",
      async (signal) => {
        const query = createHangingQuery()
        queries.push(query)
        assert.ok(signal instanceof AbortSignal, "o caller precisa receber um AbortSignal")
        assert.equal(signal.aborted, false, "o signal chega ativo, nao ja abortado")
        return query.builder.abortSignal(signal)
      },
      { attemptTimeoutMs: 5 },
    )

    assert.equal(queries.length, 3, "as 3 tentativas rodam antes de degradar")
    for (const [index, query] of queries.entries()) {
      assert.ok(query.state.registeredSignal, `tentativa ${index + 1} nao registrou o signal`)
      assert.equal(
        query.state.aborted,
        true,
        `tentativa ${index + 1} ficou pendurada: o signal nao encerrou a query`,
      )
      assert.equal(query.state.registeredSignal?.aborted, true)
    }

    assert.match(result.error?.message ?? "", /timed out/)
    assert.equal(result.data, null)
  })

  test("cada tentativa recebe um signal proprio, sem herdar o abort da anterior", async () => {
    const signals: AbortSignal[] = []

    const result = await withSupabaseRetry<Row>(
      "signal-por-tentativa",
      async (signal) => {
        signals.push(signal)
        if (signals.length < 2) {
          const query = createHangingQuery()
          return query.builder.abortSignal(signal)
        }
        return { data: { ok: true }, error: null }
      },
      { attemptTimeoutMs: 5 },
    )

    assert.equal(signals.length, 2)
    assert.equal(signals[0].aborted, true, "a tentativa que estourou o timeout foi abortada")
    assert.equal(signals[1].aborted, false, "a tentativa seguinte comeca com um signal limpo")
    assert.notEqual(signals[0], signals[1])
    assert.deepEqual(result.data, { ok: true })
  })

  test("uma query que ignora o signal ainda degrada, mas segue pendurada", async () => {
    // Documenta o comportamento anterior: o wrapper devolve o erro de timeout, so
    // que sem `.abortSignal()` nada encerra o fetch. E o motivo de o contrato de
    // fonte abaixo existir.
    const query = createHangingQuery()

    const result = await withSupabaseRetry<Row>(
      "legacy-caller",
      async () => query.builder as unknown as Promise<{ data: Row | null; error: null }>,
      { attemptTimeoutMs: 5 },
    )

    assert.match(result.error?.message ?? "", /timed out/)
    assert.equal(query.state.settled, false, "sem abortSignal a query nunca termina")
  })
})

describe("contrato de fonte: todo caller de withSupabaseRetry repassa o signal", () => {
  test("nenhum caller em src/lib/api.ts usa a assinatura antiga sem signal", async () => {
    const source = await readFile("src/lib/api.ts", "utf8")

    // Callback sem parametro: `withSupabaseRetry("x", async () =>` ou `, async () =>`
    // na linha seguinte ao label.
    const legacyCallbacks = source.match(/withSupabaseRetry[^\n]*\n?\s*async \(\) =>/g) ?? []
    assert.deepEqual(
      legacyCallbacks,
      [],
      `callers sem signal deixam a query do Supabase pendurada apos o timeout: ${legacyCallbacks.join(" | ")}`,
    )

    const callers = source.match(/withSupabaseRetry(?:<[^>]*>)?\(/g) ?? []
    const forwarded =
      (source.match(/\.abortSignal\(signal\)/g) ?? []).length +
      // O nome do argumento do id varia por call site (`id` na ficha, `candidatoId`
      // na rota do inventario do Executivo); o que o contrato exige e que o
      // `signal` chegue ao helper paginado.
      (source.match(/RowsPaged\(supabase, \w+, signal\)/g) ?? []).length
    assert.equal(
      forwarded,
      callers.length,
      "cada withSupabaseRetry precisa de um abortSignal(signal) (ou repasse do signal ao helper paginado)",
    )
  })
})
