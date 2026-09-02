/**
 * Gate das queries PostgREST diretas fora de `src/lib/api.ts`: toda cadeia
 * `<client>.from("t").<verbo>(...)` ou `<client>.rpc("fn")` precisa encadear
 * `.abortSignal(...)`. Sem prazo, uma conexão pendurada segurava um slot do
 * semáforo até o `maxDuration` da função.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { auditDirectQueryChains } from "../scripts/audit-supabase-abort-signal"

const COM_PRAZO = `
const { data } = await supabase
  .from("alert_subscribers")
  .select("id")
  .abortSignal(supabaseQueryTimeoutSignal())
  .eq("id", id)
const r = await supabase.rpc("reserve", { a: 1 }).abortSignal(supabaseQueryTimeoutSignal())
`

const SEM_PRAZO = `
const { data } = await supabase.from("alert_subscribers").select("id").eq("id", id)
const r = await supabase.rpc("reserve", { a: 1 })
const bytes = Buffer.from("abc")
const list = Array.from({ length: 2 })
`

test("cadeias com abortSignal passam, uma por raiz de cadeia", () => {
  const chains = auditDirectQueryChains(COM_PRAZO, "src/app/api/x/route.ts")
  assert.equal(chains.length, 2)
  assert.deepEqual(chains.map((chain) => chain.chainsAbortSignal), [true, true])
  assert.deepEqual(chains.map((chain) => chain.head), ["supabase.from(alert_subscribers)", "supabase.rpc(reserve)"])
})

test("cadeias sem abortSignal são apontadas; Buffer.from e Array.from não contam", () => {
  const chains = auditDirectQueryChains(SEM_PRAZO, "src/lib/x.ts")
  assert.equal(chains.length, 2)
  assert.deepEqual(chains.map((chain) => chain.chainsAbortSignal), [false, false])
  assert.deepEqual(chains.map((chain) => chain.line), [2, 3])
})

test("query dentro do callback de withSupabaseRetry fica com a primeira auditoria", () => {
  const source = `
const r = await withSupabaseRetry("x", (signal) => supabase.from("t").select("*").abortSignal(signal))
`
  assert.equal(auditDirectQueryChains(source, "src/lib/y.ts").length, 0)
})
