import assert from "node:assert/strict"
import test from "node:test"
import { camaraLegislatureForYear, filterCandidatesBySlugs, parseSenadoVoteIds, parseSlugList } from "../scripts/audit/fetch-parliamentary-family-sources-local"

test("lista privada seleciona candidatos e falha em slug desconhecido", () => {
  const candidates = [{ slug: "ana-silva" }, { slug: "bia-souza" }]
  assert.deepEqual(parseSlugList("bia-souza\nana-silva\n"), ["bia-souza", "ana-silva"])
  assert.deepEqual(filterCandidatesBySlugs(candidates, ["bia-souza"]), [candidates[1]])
  assert.throws(() => filterCandidatesBySlugs(candidates, ["nao-existe"]), /slug ausente/)
  assert.throws(() => parseSlugList("ana-silva\nana-silva"), /duplicado/)
})

test("legislatura da Câmara é mapeada pelo ano consultado", () => {
  assert.deepEqual([2008, 2010, 2011, 2014, 2015, 2018, 2019, 2022, 2023, 2026].map(camaraLegislatureForYear), [53, 53, 54, 54, 55, 55, 56, 56, 57, 57])
  assert.throws(() => camaraLegislatureForYear(2007), /sem legislatura/)
})

test("IDs exatos das votações Senado exigem array numérico sem duplicatas", () => {
  assert.deepEqual(parseSenadoVoteIds('["123", "456"]'), ["123", "456"])
  assert.throws(() => parseSenadoVoteIds("[]"), /array não vazio/)
  assert.throws(() => parseSenadoVoteIds('["123", "123"]'), /duplicado/)
  assert.throws(() => parseSenadoVoteIds('["123", "abc"]'), /inválido/)
})
