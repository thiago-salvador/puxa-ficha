import assert from "node:assert/strict"
import test from "node:test"
import { camaraLegislatureForYear, familySource, filterBundlePages, filterCandidatesBySlugs, parseSenadoVoteIds, parseSlugList, senateAuthorshipRows } from "../scripts/audit/fetch-parliamentary-family-sources-local"

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

test("autorías do Senado preservam a lista integral em uma resposta e validam envelope e parlamentar", () => {
  const sourceRows = Array.from({ length: 313 }, (_, index) => ({
    IndicadorAutorPrincipal: index % 2 === 0 ? "Sim" : "Não",
    Materia: { Codigo: String(index + 1), Ano: 2020 },
  }))
  const payload = { MateriasAutoriaParlamentar: { Parlamentar: { Codigo: "4529", Autorias: { Autoria: sourceRows } } } }
  const rows = senateAuthorshipRows(payload, "4529")
  assert.equal(rows.length, 313)
  assert.equal((rows.at(-1) as Record<string, unknown>).CodigoParlamentar, "4529")
  assert.equal((rows.at(-1) as Record<string, unknown>).Materia && ((rows.at(-1) as { Materia: { Codigo: string } }).Materia.Codigo), "313")
  assert.throws(() => senateAuthorshipRows(payload, "1234"), /CodigoParlamentar consultado/)
  assert.throws(() => senateAuthorshipRows({ MateriasAutoriaParlamentar: { Parlamentar: { Codigo: "4529", Autorias: { Autoria: null } } } }, "4529"), /lista completa/)
})

test("votos nominais Câmara preservam ausência como lista completa sem linha sintética", () => {
  const empty = filterBundlePages([{
    page: 1, url: "https://dadosabertos.camara.leg.br/api/v2/votacoes/123-4/votos?itens=100&pagina=1",
    path: "/tmp/votos.json", bytes: 2, sha256: "a".repeat(64), rows: 0, complete: true,
    value: { dados: [], links: [] },
  }], "456")
  assert.deepEqual((empty[0]?.value as { dados: unknown[] }).dados, [])
  assert.equal(empty[0]?.complete, true)
  assert.match(familySource("camara", "votos_candidato", "456"), /\/votacoes\/\{votacao_id\}\/votos$/)

  const present = filterBundlePages([{
    page: 1, url: "https://dadosabertos.camara.leg.br/api/v2/votacoes/123-4/votos?itens=100&pagina=1",
    path: "/tmp/votos.json", bytes: 20, sha256: "b".repeat(64), rows: 1, complete: true,
    value: { dados: [{ deputado_: { id: 456 }, voto: "Sim" }], links: [] },
  }], "456")
  assert.deepEqual((present[0]?.value as { dados: Array<Record<string, unknown>> }).dados, [{ deputado_: { id: 456 }, voto: "Sim", vote_id_api: "123-4" }])
})
