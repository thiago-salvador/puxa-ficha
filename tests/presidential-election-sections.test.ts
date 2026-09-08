import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { test } from "node:test"
import type { ProgramaGovernoManifestoPublico } from "../src/lib/programa-governo"
import { stateProgramTheme } from "../src/lib/state-program-themes"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
const { loadPresidentialPrograms, loadPresidentialPolls } = require("../src/lib/presidential-election-sections") as typeof import("../src/lib/presidential-election-sections")
const { carregarPesquisasEleitorais } = require("../src/lib/pesquisas-eleitorais") as typeof import("../src/lib/pesquisas-eleitorais")

test("verified presidential themes use display groups while joint themes remain explicit", () => {
  assert.equal(stateProgramTheme({ id: "seguranca-publica-desmilitarizacao", titulo: "Segurança pública e desmilitarização das polícias" }).id, "seguranca")
  assert.equal(stateProgramTheme({ id: "saude-sus", titulo: "Saúde e SUS" }).id, "saude")
  assert.equal(stateProgramTheme({ id: "meio-ambiente-clima", titulo: "Meio ambiente e transição climática" }).id, "clima")
  assert.equal(stateProgramTheme({ id: "saude-e-educacao-publicas", titulo: "Saúde e educação públicas" }).id, "saude-e-educacao-publicas")
})

test("presidential programs retain missing candidates alphabetically and enforce electoral identity", async () => {
  const candidate = { slug: "fixture", nome_urna: "Ana", sqCandidato: "123" }
  const manifesto = { estado: "aprovado", fonte: { ano: 2026, cargo: "PRESIDENTE", uf: "BR", slug: "fixture", sqCandidato: "123" }, resumo: { texto: "", temas: [], frases: [] } } as unknown as ProgramaGovernoManifestoPublico
  const rows = await loadPresidentialPrograms([{ slug: "missing", nome_urna: "Zeca" }, candidate], async slug => slug === "fixture" ? manifesto : null)
  assert.deepEqual(rows.map(r => r.nome_urna), ["Ana", "Zeca"])
  assert.equal(rows[0].manifesto, manifesto)
  assert.equal(rows[1].manifesto, null)
  for (const fonte of [{ ...manifesto.fonte, cargo: "GOVERNADOR" as const }, { ...manifesto.fonte, uf: "SP" as const }, { ...manifesto.fonte, slug: "other" }, { ...manifesto.fonte, sqCandidato: "456" }]) {
    assert.equal((await loadPresidentialPrograms([candidate], async () => ({ ...manifesto, fonte })))[0].manifesto, null)
  }
  assert.equal((await loadPresidentialPrograms([candidate], async () => ({ ...manifesto, estado: "em_revisao" })))[0].manifesto, null)
})

test("presidential polls preserve scenario outcomes and require exact approved national scope", () => {
  const catalog = carregarPesquisasEleitorais()
  const rows = loadPresidentialPolls(catalog)
  assert.ok(rows.length > 0)
  for (const row of rows) {
    const original = catalog.pesquisas.find(p => p.id === row.id)!
    assert.deepEqual(row.scenario.resultados, original.cenarios.find(s => s.id === row.scenario.id)!.resultados)
    assert.equal(row.provenance.resultUrl, original.provenance.resultUrl)
  }
  assert.deepEqual(rows.map(r => r.publicationDate.value), [...rows.map(r => r.publicationDate.value)].sort((a,b) => (b ?? "").localeCompare(a ?? "")))
  assert.deepEqual(loadPresidentialPolls({ ...catalog, publicationScope: { ...catalog.publicationScope, geographyCode: "SP" } }), [])
  for (const patch of [{ office: "Governador" }, { sourceStatus: "excluído" as const }, { sourceId: "unapproved-source" }, { geography: { ...catalog.pesquisas[0].geography, code: "SP" } }]) {
    assert.deepEqual(loadPresidentialPolls({ ...catalog, pesquisas: catalog.pesquisas.map(p => ({ ...p, ...patch })) }), [])
  }
  assert.deepEqual(loadPresidentialPolls({ ...catalog, pesquisas: catalog.pesquisas.map(p => ({ ...p, cenarios: p.cenarios.map(s => ({ ...s, comparabilityKey: "2026|Governador|SP|1|different" })) })) }), [])
  const poll = catalog.pesquisas[0]
  const secondTurn = { ...poll.cenarios[0], id: "fixture-second-turn", turn: 2 as const, comparabilityKey: "2026|Presidente|BR|2|fixture" }
  const bothTurns = loadPresidentialPolls({ ...catalog, pesquisas: [{ ...poll, cenarios: [...poll.cenarios, secondTurn] }] })
  assert.ok(bothTurns.some(p => p.scenario.id === secondTurn.id))
  assert.deepEqual(bothTurns.find(p => p.scenario.id === secondTurn.id)!.scenario.resultados, secondTurn.resultados)
})
