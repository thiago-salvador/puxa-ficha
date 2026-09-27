import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { FIXES } from "../scripts/apply-current-factual-fixes"

// dr-daniel é Daniel Barbosa Santos (PA), sem mandato na Câmara dos Deputados.
// O deputado federal 220614 é outra pessoa (Daniel Ricardo Soranz Pinto, RJ). O
// vínculo com esse id trouxe naturalidade, data de nascimento e 100 proposições
// do homônimo para a ficha (migration 20260927010100). Os ingests da Câmara e do
// Senado só leem ids do seed, então o seed é a trava.

type SeedCandidate = { slug: string; ids?: { camara?: number | null; senado?: number | null } }

const seed = JSON.parse(readFileSync(new URL("../data/candidatos.json", import.meta.url), "utf8")) as SeedCandidate[]

test("dr-daniel não tem id da Câmara nem do Senado no seed", () => {
  const ficha = seed.find((c) => c.slug === "dr-daniel")
  assert.ok(ficha, "dr-daniel sumiu do seed")
  assert.equal(ficha.ids?.camara ?? null, null)
  assert.equal(ficha.ids?.senado ?? null, null)
})

test("o deputado federal 220614 não está ligado a ficha nenhuma do seed", () => {
  const ligadas = seed.filter((c) => Number(c.ids?.camara) === 220614).map((c) => c.slug)
  assert.deepEqual(ligadas, [])
})

test("a curadoria de dr-daniel não grava id de parlamentar", () => {
  const fixes = FIXES.filter((fix) => fix.slug === "dr-daniel")
  assert.ok(fixes.length > 0)
  for (const fix of fixes) {
    const texto = JSON.stringify(fix)
    assert.doesNotMatch(texto, /220614/)
    assert.doesNotMatch(texto, /"(?:camara|senado|id_camara|id_senado)"/)
  }
})
