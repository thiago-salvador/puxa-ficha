import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

import { createSingleFlight } from "../src/lib/cache-single-flight"
import { REVALIDATE_ALLOWED_TAGS } from "../src/lib/revalidate-cache"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("cache single-flight", () => {
  it("coalesce chamadas concorrentes com a mesma chave", async () => {
    let calls = 0
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const load = createSingleFlight(async (key: string) => {
      calls += 1
      await blocked
      return { key, call: calls }
    })

    const pending = Array.from({ length: 20 }, () => load("public-candidatos"))
    await Promise.resolve()
    assert.equal(calls, 1)

    release()
    const results = await Promise.all(pending)
    assert.equal(calls, 1)
    assert.deepEqual(results, Array.from({ length: 20 }, () => results[0]))
  })

  it("mantem chaves diferentes independentes", async () => {
    const calls: string[] = []
    const load = createSingleFlight(async (key: string) => {
      calls.push(key)
      return key.toUpperCase()
    })

    const results = await Promise.all([load("sp"), load("rj"), load("sp")])
    assert.deepEqual(results, ["SP", "RJ", "SP"])
    assert.deepEqual(calls.sort(), ["rj", "sp"])
  })

  it("libera a chave depois de rejeicao", async () => {
    let calls = 0
    const load = createSingleFlight(async (key: string) => {
      calls += 1
      if (calls === 1) throw new Error("temporary failure")
      return key
    })

    await assert.rejects(load("ranking-data"), /temporary failure/)
    assert.equal(await load("ranking-data"), "ranking-data")
    assert.equal(calls, 2)
  })
})

describe("cobertura dos caches invalidados pelo cron", () => {
  it("protege todos os wrappers unstable_cache das dez tags publicas", () => {
    const api = readFileSync(join(root, "src/lib/api.ts"), "utf8")
    const donor = readFileSync(join(root, "src/lib/doador-reverse.ts"), "utf8")
    const combined = `${api}\n${donor}`

    assert.doesNotMatch(
      api,
      /import\s*\{[^}]*\bunstable_cache\b[^}]*\}\s*from\s*["']next\/cache["']/
    )
    assert.doesNotMatch(donor, /\bunstable_cache\s*\(/)
    assert.equal((api.match(/unstableCacheWithSingleFlight\s*\(/g) ?? []).length, 12)
    assert.equal((donor.match(/unstableCacheWithSingleFlight\s*\(/g) ?? []).length, 1)

    for (const tag of REVALIDATE_ALLOWED_TAGS) {
      assert.match(combined, new RegExp(`tags:\\s*\\["${tag}"\\]`), `${tag} sem cache protegido`)
    }
  })
})
