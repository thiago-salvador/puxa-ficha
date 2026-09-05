import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"
import { buildCloseoutCrosswalk } from "../scripts/audit/build-freshness-closeout-crosswalk"

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"))
const universe = json("tests/fixtures/freshness-closeout/universe.json")
const source = json("tests/fixtures/freshness-closeout/source.json")
const previous = json("data/candidate-roster-active-20260829.json")

test("snapshot atual deriva das 28 listagens reais, preservando a única quarentena", () => {
  const result = buildCloseoutCrosswalk(universe.current_official, source, previous)
  assert.equal(result.metadata.active_registration_count, 208)
  assert.equal(result.metadata.active_profile_count, 207)
  assert.equal(result.metadata.checked_at, source.divulgacand.checked_at)
  assert.equal(result.metadata.source_urls.length, 28)
  assert.equal(result.profiles.filter(p => p.publication_status === "active").length, 206)
  assert.equal(result.profiles.find(p => p.profile_slug === "ruth-reis")?.canonical_registration_sq, "140002554434")
  assert.equal(result.profiles.some(p => ["jose-moita", "subtenente-luiz-carlos"].includes(p.profile_slug)), false)
  assert.deepEqual(result.profiles.filter(p => p.publication_status !== "active"), previous.profiles.filter((p: { publication_status: string }) => p.publication_status !== "active"))
  assert.deepEqual(json("data/candidate-roster-active-20260905.json"), result)
})

test("snapshot falha fechado para fonte incompleta, status desconhecido e colisão SQ", () => {
  assert.throws(() => buildCloseoutCrosswalk(universe.current_official, {...source, divulgacand: {...source.divulgacand, sources: []}}, previous), /28/)
  assert.throws(() => buildCloseoutCrosswalk([...universe.current_official, universe.current_official[0]], source, previous), /duplicad/)
  assert.throws(() => buildCloseoutCrosswalk(universe.current_official.map((r: { sq_candidato: string }) => r.sq_candidato === "140002554434" ? {...r, status: "desconhecido"} : r), source, previous), /status/)
})

test("seed acrescenta exclusivamente a inscrição titular de Ruth e não altera o snapshot histórico", () => {
  const seed = json("data/candidatos.json")
  const ruth = seed.filter((r: { slug: string }) => r.slug === "ruth-reis")
  assert.equal(ruth.length, 1)
  assert.deepEqual(ruth[0].ids.tse_sq_candidato, { "2026": "140002554434" })
  assert.equal(ruth[0].nome_completo, "RUTH HELENA FERREIRA REIS")
  assert.equal(createHash("sha256").update(readFileSync("data/candidate-roster-active-20260829.json")).digest("hex"), "8eefd9f8baed86f5f907bd04f66d29baeb5b3847d637fe7be64ec07fc2c09fcd")
})
