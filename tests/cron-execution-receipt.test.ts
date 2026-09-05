import assert from "node:assert/strict"
import { test } from "node:test"
import { withCronExecutionReceipt } from "../src/lib/cron-execution-receipt"

test("recibo só é gravado depois da conclusão bem-sucedida", async () => {
  const events: string[] = []
  const handler = withCronExecutionReceipt("revalidate-public-cache", async () => {
    events.push("completed")
    return new Response("ok")
  }, async (name) => { events.push(name) })
  assert.equal((await handler(new Request("https://example.test"))).status, 200)
  assert.deepEqual(events, ["completed", "revalidate-public-cache"])
})

test("falha e acesso negado não deixam falso recibo de sucesso", async () => {
  for (const status of [401, 500, 503]) {
    let writes = 0
    const handler = withCronExecutionReceipt("published-consistency", async () => new Response(null, { status }), async () => { writes++ })
    assert.equal((await handler(new Request("https://example.test"))).status, status)
    assert.equal(writes, 0)
  }
})

test("falha na persistência não mascara ausência de prova como HTTP200", async () => {
  const handler = withCronExecutionReceipt("published-consistency", async () => new Response("ok"), async () => { throw new Error("offline") })
  const response = await handler(new Request("https://example.test"))
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { ok: false, error: "cron_receipt_unverified" })
})
