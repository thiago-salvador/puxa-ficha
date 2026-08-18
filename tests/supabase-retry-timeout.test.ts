import assert from "node:assert/strict"
import test from "node:test"
import { withSupabaseRetry } from "../src/lib/supabase-retry"

type Row = { ok: boolean }

test("withSupabaseRetry degrades to a timeout error when every attempt hangs", async () => {
  let calls = 0
  const result = await withSupabaseRetry<Row>(
    "hanging-query",
    () => {
      calls += 1
      return new Promise<{ data: Row | null; error: { message?: string } | null }>(() => {})
    },
    { attemptTimeoutMs: 5 }
  )
  assert.equal(calls, 3) // SUPABASE_RETRY_ATTEMPTS: a hang is retried, then degrades instead of blocking to the 300s platform limit
  assert.ok(result.error, "expected a degraded error result, not a hang")
  assert.match(result.error?.message ?? "", /timed out/)
  assert.equal(result.data, null)
})

test("withSupabaseRetry resolves with data when the query beats the timeout", async () => {
  const result = await withSupabaseRetry<Row>(
    "fast-query",
    async () => ({ data: { ok: true }, error: null }),
    { attemptTimeoutMs: 1_000 }
  )
  assert.deepEqual(result.data, { ok: true })
  assert.equal(result.error, null)
})

test("withSupabaseRetry retries a transient error before succeeding", async () => {
  let calls = 0
  const result = await withSupabaseRetry<Row>("flaky-query", async () => {
    calls += 1
    if (calls < 2) return { data: null, error: { message: "transient" } }
    return { data: { ok: true }, error: null }
  })
  assert.equal(calls, 2)
  assert.deepEqual(result.data, { ok: true })
  assert.equal(result.error, null)
})
