import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("cinco ingests delegam o streaming ao helper único", () => {
  for (const path of [
    "scripts/lib/ingest-filiacao.ts",
    "scripts/lib/ingest-tse-historico.ts",
    "scripts/lib/ingest-tse-situacao.ts",
    "scripts/lib/ingest-tse.ts",
    "scripts/persist-sq-candidato.ts",
  ]) {
    const source = read(path)
    assert.match(source, /downloadToFile/)
    assert.doesNotMatch(source, /createWriteStream/)
  }
})

test("três consumidores usam o matcher nominal compartilhado", () => {
  for (const path of [
    "scripts/check-ids-cohort.ts",
    "scripts/lib/ingest-camara.ts",
    "scripts/lib/ingest-senado.ts",
  ]) {
    assert.match(read(path), /from ["'].+name-match["']/)
  }
})

test("readback usa as réguas de impacto exportadas pela biblioteca pública", () => {
  const source = read("scripts/audit/readback-autoria-dedupe.ts")
  assert.match(source, /EXECUTIVE_LEGISLATION_HIGH_IMPACT_PATTERNS/)
  assert.match(source, /EXECUTIVE_LEGISLATION_LOW_IMPACT_PATTERNS/)
  assert.doesNotMatch(source, /const ALTO_IMPACTO|const BAIXO_IMPACTO/)
})
