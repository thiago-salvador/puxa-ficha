import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { test } from "node:test"
import { stateProgramTheme } from "../src/lib/state-program-themes"
import type { ProgramaGovernoManifestoPublico } from "../src/lib/programa-governo"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
const { loadStatePrograms } = require("../src/lib/state-programs") as typeof import("../src/lib/state-programs")
const { loadStatePolls } = require("../src/lib/state-polls") as typeof import("../src/lib/state-polls")
const { carregarPesquisasGovernadores } = require("../src/lib/pesquisas-eleitorais") as typeof import("../src/lib/pesquisas-eleitorais")

test("approved program cannot cross candidate, UF, year or review boundaries", async () => {
  const candidate = { slug: "fixture", nome_urna: "Fixture", sqCandidato: "123" }
  const manifest = { estado: "aprovado", fonte: { ano: 2026, cargo: "GOVERNADOR", uf: "SP", slug: "fixture", sqCandidato: "123" }, resumo: { texto: "", temas: [], frases: [] } } as unknown as ProgramaGovernoManifestoPublico
  const load = async () => manifest
  assert.equal((await loadStatePrograms([candidate], "sp", load))[0].manifesto, manifest)
  assert.equal((await loadStatePrograms([candidate], "RJ", load))[0].manifesto, null)
  assert.equal((await loadStatePrograms([{ ...candidate, slug: "other" }], "SP", load))[0].manifesto, null)
  assert.equal((await loadStatePrograms([{ ...candidate, sqCandidato: "456" }], "SP", load))[0].manifesto, null)
  assert.equal((await loadStatePrograms([candidate], "SP", async () => ({ ...manifest, estado: "em_revisao" })))[0].manifesto, null)
})

test("theme grouping preserves unknown IDs and does not classify wording", () => {
  assert.equal(stateProgramTheme({ id: "cameras-corporais", titulo: "Câmeras" }).id, "seguranca")
  assert.equal(stateProgramTheme({ id: "fila-da-saude", titulo: "Fila" }).id, "saude")
  assert.equal(stateProgramTheme({ id: "adaptacao-climatica", titulo: "Adaptação climática" }).id, "clima")
  assert.deepEqual(stateProgramTheme({ id: "unknown", titulo: "Segurança na saúde" }), { id: "unknown", title: "Segurança na saúde" })
})

test("state polls preserve every scenario result and reject wrong scope and unapproved sources", () => {
  const entry = [...carregarPesquisasGovernadores()].find(([, catalog]) => catalog.pesquisas.length > 0)
  assert.ok(entry, "canonical catalog must provide a fixture")
  const [uf, catalog] = entry
  const selected = loadStatePolls(uf, catalog)
  assert.ok(selected.length > 0)
  for (const result of selected) {
    const source = catalog.pesquisas.find(p => p.id === result.id)!.cenarios.find(s => s.id === result.scenario.id)!
    assert.deepEqual(result.scenario.resultados, source.resultados)
  }
  assert.deepEqual(loadStatePolls("INVALID", catalog), [])
  const rejected = { ...catalog, pesquisas: catalog.pesquisas.map(p => ({ ...p, sourceStatus: "excluído" as const })) }
  assert.deepEqual(loadStatePolls(uf, rejected), [])
})
