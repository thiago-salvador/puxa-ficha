import assert from "node:assert/strict"
import test from "node:test"

import { downloadOfficialCandidacies, OfficialSourceError } from "../scripts/lib/data-freshness/tse-source"

test("duas superfícies oficiais indisponíveis produzem source_error", async () => {
  const failingFetch = async () => new Response("blocked", { status: 403 })
  await assert.rejects(
    () => downloadOfficialCandidacies(failingFetch as typeof fetch),
    (error: unknown) => {
      assert.ok(error instanceof OfficialSourceError)
      assert.equal(error.attempts.length, 2)
      assert.deepEqual(error.attempts.map((attempt) => attempt.surface), ["cdn", "catalog"])
      return true
    },
  )
})

test("resposta 200 que não é ZIP também falha fechada", async () => {
  const responses = [
    new Response("html", { status: 200 }),
    new Response(JSON.stringify({ success: false }), { status: 200, headers: { "content-type": "application/json" } }),
  ]
  await assert.rejects(
    () => downloadOfficialCandidacies((async () => responses.shift() as Response) as typeof fetch),
    OfficialSourceError,
  )
})
