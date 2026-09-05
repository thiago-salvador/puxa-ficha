import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, test } from "node:test"
import { NextRequest } from "next/server"

// Mesmo padrão dos outros testes de rota: o módulo importa `server-only`, que
// só resolve sob a condição `react-server`. O `npm test` roda sem ela.
const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never
const { CRON_FRESHNESS_CHECKS, createCronFreshnessHandler } =
  require("../src/app/api/internal/cron-freshness/route") as typeof import("../src/app/api/internal/cron-freshness/route")

const SECRET = "cron-secret"
const NOW = new Date("2026-09-02T12:00:00.000Z")
const URL_ = "https://puxaficha.com.br/api/internal/cron-freshness"

function request(secret: string | null = SECRET) {
  return new NextRequest(URL_, { headers: secret ? { authorization: `Bearer ${secret}` } : {} })
}

describe("cron freshness", () => {
  test("falha fechado sem o segredo", async () => {
    const handler = createCronFreshnessHandler({ expectedSecret: SECRET, readLatest: async () => null, now: () => NOW })
    assert.equal((await handler(request(null))).status, 401)
    assert.equal((await handler(request("errado"))).status, 401)
  })

  test("devolve o último instante e a idade em horas por cron com rastro", async () => {
    const handler = createCronFreshnessHandler({
      expectedSecret: SECRET,
      readLatest: async (check) =>
        check.name === "news-refresh" ? "2026-09-02T08:00:00.000Z" : "2026-09-01T12:00:00.000Z",
      now: () => NOW,
    })
    const response = await handler(request())
    assert.equal(response.status, 200)
    const body = (await response.json()) as { ok: boolean; checks: Array<{ name: string; age_hours: number | null }> }
    assert.equal(body.ok, true)
    assert.deepEqual(body.checks.map((check) => [check.name, check.age_hours]), [
      ["news-refresh", 4],
      ["send-digest", 24],
      ["published-consistency", 24],
      ["revalidate-public-cache", 24],
    ])
    assert.deepEqual(
      CRON_FRESHNESS_CHECKS.map((check) => check.name),
      ["news-refresh", "send-digest", "published-consistency", "revalidate-public-cache"],
    )
  })

  test("sem rastro devolve idade nula sem falhar; erro de leitura vira 500 com ok:false", async () => {
    const vazio = createCronFreshnessHandler({ expectedSecret: SECRET, readLatest: async () => null, now: () => NOW })
    const semRastro = (await vazio(request())) as Response
    assert.equal(semRastro.status, 200)
    const body = (await semRastro.json()) as { checks: Array<{ age_hours: number | null }> }
    assert.deepEqual(body.checks.map((check) => check.age_hours), [null, null, null, null])

    const quebrado = createCronFreshnessHandler({
      expectedSecret: SECRET,
      readLatest: async () => {
        throw new Error("timeout")
      },
      now: () => NOW,
    })
    const response = await quebrado(request())
    assert.equal(response.status, 500)
    assert.equal(((await response.json()) as { ok: boolean }).ok, false)
  })
})
