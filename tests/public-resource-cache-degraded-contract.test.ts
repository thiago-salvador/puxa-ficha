import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, test } from "node:test"

describe("public candidate cache degradation contract", () => {
  test("never persists degraded metadata or profile resources", async () => {
    const source = await readFile("src/lib/api.ts", "utf8")

    assert.match(source, /function requireLiveResourceForCache/)
    assert.match(source, /resource\.sourceStatus !== "live"/)
    assert.match(source, /degraded resource must not enter the public data cache/)
    assert.match(
      source,
      /requireLiveResourceForCache\(await getCandidatoMetadataResourceUncached\(slug\)\)/,
    )
    assert.match(
      source,
      /requireLiveResourceForCache\(await getCandidatoBySlugResourceUncached\(slug\)\)/,
    )
  })

  test("falls back to a fresh uncached read and busts prior poisoned entries", async () => {
    const source = await readFile("src/lib/api.ts", "utf8")

    assert.match(source, /catch \{\s*return getCandidatoMetadataResourceUncached\(slug\)/)
    assert.match(source, /catch \{\s*return getCandidatoBySlugResourceUncached\(slug\)/)
    assert.match(source, /"no-cache-degraded-v1"/)
  })
})
