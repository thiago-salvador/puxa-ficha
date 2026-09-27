import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { FIXES } from "../scripts/apply-current-factual-fixes"

type SeedCandidate = { slug: string; ids?: { camara?: number | null; senado?: number | null } }

const seed = JSON.parse(readFileSync(new URL("../data/candidatos.json", import.meta.url), "utf8")) as SeedCandidate[]

test("pedro-cunha-lima não tem id do Senado no seed", () => {
  const ficha = seed.find((c) => c.slug === "pedro-cunha-lima")
  assert.ok(ficha, "pedro-cunha-lima sumiu do seed")
  assert.equal(ficha.ids?.senado ?? null, null)
})

test("o código Senado 1757 não está ligado a ficha nenhuma do seed", () => {
  const ligadas = seed.filter((c) => Number(c.ids?.senado) === 1757).map((c) => c.slug)
  assert.deepEqual(ligadas, [])
})

test("a curadoria de pedro-cunha-lima não grava o código Senado 1757", () => {
  const fixes = FIXES.filter((fix) => fix.slug === "pedro-cunha-lima")
  assert.ok(fixes.length > 0, "curadoria de pedro-cunha-lima sumiu")
  for (const fix of fixes) {
    assert.doesNotMatch(JSON.stringify(fix), /1757/)
  }
})
