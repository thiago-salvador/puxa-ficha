import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { carregarCatalogos, importarRodadas, type RodadaColetada } from "../scripts/pesquisas-importar-manual"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
const { parsePesquisasEleitoraisJson } = require("../src/lib/pesquisas-eleitorais") as typeof import("@/lib/pesquisas-eleitorais")

const dir = mkdtempSync(join(tmpdir(), "pesquisas-importar-"))
const capture = join(dir, "captura.txt")
writeFileSync(capture, "https://example.org/pesquisa\nLula 40%, Flávio Bolsonaro 35%, brancos e nulos 10%, não sabem 15%.\n")

function rodada(overrides: Partial<RodadaColetada> = {}): RodadaColetada {
  return {
    uf: "BR", instituto: "Instituto Exemplo", contratante: null, registration: "BR-99999/2026",
    fieldwork_start: "2026-09-20", fieldwork_end: "2026-09-22", publication_date: "2026-09-23",
    sample_size: 2000, population: "eleitores", margin_error_pp: 2, confidence_percent: 95,
    method: "Entrevistas presenciais", result_url: "https://example.org/pesquisa", capture_file: capture,
    scenarios: [{ kind: "estimulado", label_raw: "Primeiro turno estimulado", question: null, results: [
      { raw_label: "Lula", value_percent: 40 }, { raw_label: "Flávio Bolsonaro", value_percent: 35 },
      { raw_label: "Brancos e nulos", value_percent: 10 }, { raw_label: "Não sabem", value_percent: 15 },
    ] }],
    ...overrides,
  }
}
const aliases = { BR: { "Lula": "lula", "Flávio Bolsonaro": "flavio-bolsonaro", "Brancos e nulos": null, "Não sabem": null } }

describe("importação manual auditada de pesquisas", () => {
  it("gera rodada que o parser do site aceita e publica", () => {
    const { problems, planned, catalogos } = importarRodadas([rodada()], aliases, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.deepEqual(problems, [])
    assert.equal(planned.length, 1)
    const catalogo = parsePesquisasEleitoraisJson(JSON.stringify(catalogos.pres), JSON.stringify(catalogos.presFontes))
    const poll = catalogo.pesquisas.find((entry) => entry.registration.code.value === "BR-99999/2026")
    assert.ok(poll, "rodada importada visível no catálogo")
    const resultados = poll.cenarios[0].resultados
    assert.equal(resultados.find((entry) => entry.rawLabel === "Lula")?.candidateSlug, "lula")
    assert.equal(resultados.find((entry) => entry.rawLabel === "Não sabem")?.matchStatus, "not_candidate")
  })

  it("aceita governador e reaproveita o dataset da UF", () => {
    const gov = rodada({ uf: "PI", registration: "PI-99999/2026", scenarios: [{ kind: "estimulado", label_raw: "Estimulada", question: null, results: [
      { raw_label: "Rafael Fonteles", value_percent: 50 }, { raw_label: "Brancos e nulos", value_percent: 8 },
    ] }] })
    const { problems, catalogos } = importarRodadas([gov], { PI: { "Rafael Fonteles": "rafael-fonteles", "Brancos e nulos": null } }, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.deepEqual(problems, [])
    const dataset = (catalogos.gov.datasets as { publication_scope: { geography_code: string } }[]).find((entry) => entry.publication_scope.geography_code === "PI")
    const catalogo = parsePesquisasEleitoraisJson(JSON.stringify(dataset), JSON.stringify(catalogos.govFontes))
    assert.ok(catalogo.pesquisas.some((entry) => entry.registration.code.value === "PI-99999/2026"))
  })

  it("falha fechado sem decisão de alias, sem captura ou com registro de outra UF", () => {
    const semAlias = importarRodadas([rodada()], { BR: { "Lula": "lula" } }, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.ok(semAlias.problems.some((problem) => problem.includes("sem decisão de alias")))
    const semCaptura = importarRodadas([rodada({ capture_file: join(dir, "inexistente.txt") })], aliases, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.ok(semCaptura.problems.some((problem) => problem.includes("captura literal ausente")))
    const outraUf = importarRodadas([rodada({ registration: "SP-00001/2026" })], aliases, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.ok(outraUf.problems.some((problem) => problem.includes("registro de outra UF")))
  })

  it("não duplica rodada já catalogada pelo mesmo registro", () => {
    const { planned, skipped } = importarRodadas([rodada({ registration: "BR-00360/2026" })], aliases, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.equal(planned.length, 0)
    assert.equal(skipped.length, 1)
  })
})
