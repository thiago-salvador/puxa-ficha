import assert from "node:assert/strict"
import test from "node:test"
import {
  buildUpdatesView,
  computeUpdatesFacets,
  filterUpdates,
  formatDayMonth,
  joinUpdates,
  latestDetection,
  parseUpdatesQuery,
  updatesHref,
} from "../src/components/imprensa/updates/updates-view"
import type { VerifiedCandidateUpdate } from "../src/lib/verified-candidate-updates"

const base: VerifiedCandidateUpdate = {
  id: "1",
  candidate_slug: "ana-sp",
  candidate_name: "ANA DE SOUZA",
  field: "situacao",
  year: 2026,
  before_value: "deferido",
  after_value: "indeferido com recurso",
  source_url: "https://www.tse.jus.br/x",
  detected_at: "2026-09-23T02:30:00.000Z",
}

const updates: VerifiedCandidateUpdate[] = [
  base,
  { ...base, id: "2", candidate_slug: "bruno-rj", field: "patrimonio", before_value: "10.00", after_value: "20.00", detected_at: "2026-09-16T12:00:00.000Z" },
  { ...base, id: "3", candidate_slug: "carla-pres", detected_at: "2026-09-16T13:00:00.000Z" },
  { ...base, id: "4", candidate_slug: "fora-da-coorte", candidate_name: "JOSE FORA", detected_at: "2026-09-10T13:00:00.000Z" },
]

const candidates = [
  { slug: "ana-sp", nome: "Ana de Souza", cargo: "Governador", uf: "SP" },
  { slug: "bruno-rj", nome: "Bruno Lima", cargo: "Senador", uf: "rj" },
  { slug: "carla-pres", nome: "Carla Reis", cargo: "Presidente", uf: null },
]
const cargos = ["Presidente", "Governador", "Senador"]

test("junta cargo e UF pelo slug e não inventa dado para quem está fora do dataset", () => {
  const rows = joinUpdates(updates, candidates)
  assert.deepEqual(rows.map((row) => [row.nome, row.cargo, row.uf]), [
    ["Ana de Souza", "Governador", "SP"],
    ["Bruno Lima", "Senador", "RJ"],
    ["Carla Reis", "Presidente", null],
    ["Jose Fora", null, null],
  ])
})

test("query aceita só valores conhecidos e página válida", () => {
  assert.deepEqual(parseUpdatesQuery({ uf: "sp", cargo: "Governador", tipo: "patrimonio", page: "2" }, cargos), { uf: "SP", cargo: "Governador", tipo: "patrimonio", page: 2 })
  assert.deepEqual(parseUpdatesQuery({ uf: "XX", cargo: "Prefeito", tipo: "nome", page: "-1" }, cargos), { uf: null, cargo: null, tipo: null, page: 1 })
  assert.deepEqual(parseUpdatesQuery({ uf: ["RJ", "SP"], page: "99999" }, cargos), { uf: "RJ", cargo: null, tipo: null, page: 1 })
})

test("filtra por UF, cargo e tipo e conta cada opção mantendo os outros filtros", () => {
  const rows = joinUpdates(updates, candidates)
  const filters = { uf: null, cargo: null, tipo: "situacao" as const }
  assert.deepEqual(filterUpdates(rows, filters).map((row) => row.id), ["1", "3", "4"])
  const facets = computeUpdatesFacets(rows, filters, cargos)
  assert.equal(facets.uf.length, 27)
  assert.equal(facets.uf.find((item) => item.value === "SP")?.count, 1)
  assert.equal(facets.uf.find((item) => item.value === "RJ")?.count, 0)
  assert.deepEqual(facets.cargo, [{ value: "Presidente", count: 1 }, { value: "Governador", count: 1 }, { value: "Senador", count: 0 }])
  // Tipo ignora o próprio filtro: mostra quantas haveria em cada tipo.
  assert.deepEqual(facets.tipo.map((item) => [item.value, item.count]), [["situacao", 3], ["patrimonio", 1], ["partido", 0]])
})

test("última detecção sai dos dados e some sem linhas", () => {
  const rows = joinUpdates(updates, candidates)
  assert.equal(latestDetection(rows), "2026-09-23T02:30:00.000Z")
  assert.equal(latestDetection([]), null)
  // 02:30 UTC de 23/09 ainda é 22/09 em Brasília.
  assert.equal(formatDayMonth("2026-09-23T02:30:00.000Z"), "22/09")
})

test("link leva UF e cargo pelo recorte da seção, mais tipo e página", () => {
  assert.equal(updatesHref({ uf: "SP", cargo: "Governador", tipo: "situacao" }, 2), "/imprensa/atualizacoes?cargo=Governador&uf=SP&tipo=situacao&page=2")
  assert.equal(updatesHref({ uf: null, cargo: null, tipo: null }), "/imprensa/atualizacoes")
})

test("com o dataset disponível, a view aplica UF e cargo como antes", () => {
  const view = buildUpdatesView({ uf: "SP" }, updates, candidates, cargos)
  assert.equal(view.recorteDisponivel, true)
  assert.equal(view.recorteIgnorado, false)
  assert.equal(view.query.uf, "SP")
  assert.deepEqual(view.filtered.map((row) => row.id), ["1"])
  assert.equal(view.facets.uf.length, 27)
})

test("sem o dataset, UF e cargo não filtram nem viram zero; tipo continua valendo", () => {
  const view = buildUpdatesView({ uf: "SP", cargo: "Governador", tipo: "situacao" }, updates, null, [])
  assert.equal(view.recorteDisponivel, false)
  assert.equal(view.recorteIgnorado, true)
  assert.deepEqual(view.query, { uf: null, cargo: null, tipo: "situacao", page: 1 })
  // Todas as mudanças de situação aparecem, só com o nome; nada de "0 de N".
  assert.deepEqual(view.filtered.map((row) => row.id), ["1", "3", "4"])
  assert.equal(view.rows.length, updates.length)
  assert.ok(view.rows.every((row) => row.cargo === null && row.uf === null))
  assert.deepEqual(view.rows.map((row) => row.nome), ["Ana de Souza", "Ana de Souza", "Ana de Souza", "Jose Fora"])
  // Sem facetas de UF e cargo: uma contagem de falha nunca aparece como (0).
  assert.deepEqual(view.facets.uf, [])
  assert.deepEqual(view.facets.cargo, [])
  assert.deepEqual(view.facets.tipo.map((item) => [item.value, item.count]), [["situacao", 3], ["patrimonio", 1], ["partido", 0]])
})

test("sem o dataset e sem UF ou cargo na URL, não avisa filtro ignorado", () => {
  const view = buildUpdatesView({ tipo: "patrimonio" }, updates, null, [])
  assert.equal(view.recorteIgnorado, false)
  assert.deepEqual(view.filtered.map((row) => row.id), ["2"])
})
