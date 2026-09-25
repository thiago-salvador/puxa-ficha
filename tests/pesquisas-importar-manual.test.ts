import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { baseCenarioSenado, carregarCatalogos, importarRodadas, registrarAusenciasSenado, type RodadaColetada } from "../scripts/pesquisas-importar-manual"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
const { parsePesquisasEleitoraisJson } = require("../src/lib/pesquisas-eleitorais") as typeof import("@/lib/pesquisas-eleitorais")
const { parseSenadoPesquisasJson, selecionarSenadoPolls } = require("../src/lib/senado-polls") as typeof import("@/lib/senado-polls")

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
    assert.equal(poll.cenarios[0].labelRaw, "Intenção de voto estimulada no 1º turno; percentuais do total de entrevistados")
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
    const aliases = (dataset as unknown as { exact_aliases: { raw_label: string; scenario_id?: string }[] }).exact_aliases
    assert.ok(aliases.filter((alias) => alias.raw_label === "Rafael Fonteles" && alias.scenario_id?.startsWith("instituto-exemplo-pi-99999-2026")).length === 1,
      "alias novo fica escopado ao cenário")
  })

  it("falha fechado sem decisão de alias, sem captura ou com registro de outra UF", () => {
    const semAlias = importarRodadas([rodada()], { BR: { "Lula": "lula" } }, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.ok(semAlias.problems.some((problem) => problem.includes("sem decisão de alias")))
    const semCaptura = importarRodadas([rodada({ capture_file: join(dir, "inexistente.txt") })], aliases, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.ok(semCaptura.problems.some((problem) => problem.includes("captura literal ausente")))
    const outraUf = importarRodadas([rodada({ registration: "SP-00001/2026" })], aliases, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.ok(outraUf.problems.some((problem) => problem.includes("registro de outra UF")))
  })

  it("exige nota distinta quando a rodada tem mais de um cenário estimulado", () => {
    const base = rodada().scenarios[0]
    const semNota = importarRodadas([rodada({ scenarios: [base, { ...base }] })], aliases, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.ok(semNota.problems.some((problem) => problem.includes("nota distinta")))
    const comNota = importarRodadas([rodada({ scenarios: [{ ...base, note: "com Fulano" }, { ...base, note: "sem Fulano" }] })], aliases, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.deepEqual(comNota.problems, [])
  })

  it("importa Senado por medida, com alias escopado e sem cenário espontâneo", () => {
    const sen = rodada({
      cargo: "Senador", uf: "SP", registration: "SP-99999/2026", population: "eleitores de SP",
      scenarios: [
        { kind: "estimulado", measure: "primeiro-voto", question: null, results: [{ raw_label: "Simone Tebet", value_percent: 30 }, { raw_label: "Nenhum", value_percent: 20 }] },
        { kind: "estimulado", measure: "agregado", question: null, results: [{ raw_label: "Simone Tebet", value_percent: 90 }, { raw_label: "Salles", value_percent: 80 }] },
        { kind: "espontaneo", question: null, results: [{ raw_label: "Não sabe", value_percent: 70 }] },
      ],
    })
    const decisoes = { "SEN-SP": { "Simone Tebet": "tse-2026-250002551502", "Salles": "tse-2026-250002532794", "Nenhum": null } }
    const { problems, catalogos } = importarRodadas([sen], decisoes, "2026-09-25T12:00:00Z", carregarCatalogos())
    assert.deepEqual(problems, [])
    const entry = (catalogos.sen.datasets as { uf: string; state: string; dataset: unknown }[]).find((item) => item.uf === "SP")!
    assert.equal(entry.state, "com_pesquisa_publicada")
    const catalogo = parseSenadoPesquisasJson(JSON.stringify(entry.dataset), JSON.stringify(catalogos.sen.source_catalog), "SP")
    const poll = catalogo.pesquisas.find((item) => item.registration.code.value === "SP-99999/2026")!
    assert.equal(poll.id, "instituto-exemplo-sp-99999-2026-senado")
    assert.deepEqual(poll.cenarios.map((cenario) => cenario.comparabilityKey.split("|")[4]), ["primeiro-voto", "agregado"])
    assert.deepEqual(poll.cenarios.map((cenario) => cenario.comparabilityKey.split("|")[6]), ["total_amostra", "total_amostra"])
    assert.match(poll.cenarios[0].labelRaw, /Senado, primeiro voto/)
    assert.match(poll.cenarios[1].labelRaw, /total de entrevistados \(a soma dos dois votos passa de 100%\)/)
    const visiveis = selecionarSenadoPolls(catalogo, "SP").filter((item) => item.registration.code.value === "SP-99999/2026")
    assert.equal(visiveis.length, 2, "rodada revisada aparece sem preferência permanente do instituto")
    // Governor aliases for SP are not used for the Senate scope.
    const semEscopo = importarRodadas([sen], { SP: decisoes["SEN-SP"] }, "2026-09-25T12:00:00Z", carregarCatalogos())
    assert.ok(semEscopo.problems.some((problem) => problem.includes("escopo SEN-SP")))
  })

  it("Senado exige medida e registro, e aceita soma até 200% só no agregado", () => {
    const base = rodada({ cargo: "Senador", uf: "SP", registration: "SP-99998/2026" })
    const decisoes = { "SEN-SP": { "Lula": null, "Flávio Bolsonaro": null, "Brancos e nulos": null, "Não sabem": null } }
    const semMedida = importarRodadas([base], decisoes, "2026-09-25T12:00:00Z", carregarCatalogos())
    assert.ok(semMedida.problems.some((problem) => problem.includes("sem medida")))
    const comMedida = base.scenarios.map((scenario) => ({ ...scenario, measure: "primeiro-voto" as const }))
    const semRegistro = importarRodadas([{ ...base, registration: null, scenarios: comMedida }], decisoes, "2026-09-25T12:00:00Z", carregarCatalogos())
    assert.ok(semRegistro.problems.some((problem) => problem.includes("Senado exige registration")))
    const semMetodo = importarRodadas([{ ...base, method: null, population: null, scenarios: comMedida }], decisoes, "2026-09-25T12:00:00Z", carregarCatalogos())
    assert.deepEqual(semMetodo.problems, [], "método e população não publicados ficam nulos, como em Governador")
    const alto = [{ raw_label: "Lula", value_percent: 90 }, { raw_label: "Flávio Bolsonaro", value_percent: 80 }]
    const primeiro = importarRodadas([{ ...base, scenarios: [{ kind: "estimulado", measure: "primeiro-voto", question: null, results: alto }] }], decisoes, "2026-09-25T12:00:00Z", carregarCatalogos())
    assert.ok(primeiro.problems.some((problem) => problem.includes("soma 170.0%")))
    const agregado = importarRodadas([{ ...base, scenarios: [{ kind: "estimulado", measure: "agregado", question: null, results: alto }] }], decisoes, "2026-09-25T12:00:00Z", carregarCatalogos())
    assert.deepEqual(agregado.problems, [])
    const presidenteEmUf = importarRodadas([rodada({ cargo: "Presidente", uf: "SP", registration: "SP-99997/2026" })], { SP: aliases.BR }, "2026-09-25T12:00:00Z", carregarCatalogos())
    assert.ok(presidenteEmUf.problems.some((problem) => problem.includes("incompatível")))
  })

  it("consolidado dos dois votos reduzido a 100% vira base de menções, nunca de entrevistados", () => {
    const reduzido = { kind: "estimulado" as const, measure: "agregado" as const, question: null, results: [{ raw_label: "Simone Tebet", value_percent: 60 }, { raw_label: "Salles", value_percent: 40 }] }
    assert.equal(baseCenarioSenado(reduzido), "total_mencoes")
    assert.equal(baseCenarioSenado({ ...reduzido, results: [{ raw_label: "Simone Tebet", value_percent: 90 }, { raw_label: "Salles", value_percent: 80 }] }), "total_amostra")
    assert.equal(baseCenarioSenado({ ...reduzido, measure: "primeiro-voto" }), "total_amostra")
    const sen = rodada({ cargo: "Senador", uf: "SP", registration: "SP-99996/2026", scenarios: [reduzido] })
    const { problems, catalogos } = importarRodadas([sen], { "SEN-SP": { "Simone Tebet": "tse-2026-250002551502", "Salles": "tse-2026-250002532794" } }, "2026-09-25T12:00:00Z", carregarCatalogos())
    assert.deepEqual(problems, [])
    const entry = (catalogos.sen.datasets as { uf: string; dataset: unknown }[]).find((item) => item.uf === "SP")!
    const cenario = parseSenadoPesquisasJson(JSON.stringify(entry.dataset), JSON.stringify(catalogos.sen.source_catalog), "SP")
      .pesquisas.find((item) => item.registration.code.value === "SP-99996/2026")!.cenarios[0]
    assert.equal(cenario.comparabilityKey.split("|")[6], "total_mencoes")
    assert.match(cenario.labelRaw, /reduzidos a 100%; percentuais do total de menções$/)
  })

  it("registra ausência checada e datada só em UF de Senado sem rodada", () => {
    const catalogos = carregarCatalogos()
    const datasets = catalogos.sen.datasets as { uf: string; dataset: { pesquisas: unknown[] } }[]
    assert.ok(registrarAusenciasSenado([{ uf: "SP", cargo: "Senador", checked_at: "2026-09-25" }], catalogos).problems
      .some((problem) => problem.includes("ausência declarada em UF com pesquisa importada")))
    // In-memory copy only: empty one UF to exercise the absence path.
    datasets.find((item) => item.uf === "AC")!.dataset.pesquisas = []
    const { problems, recorded } = registrarAusenciasSenado([{ uf: "AC", cargo: "Senador", checked_at: "2026-09-25" }], catalogos)
    assert.deepEqual(problems, [])
    assert.deepEqual(recorded, ["AC (2026-09-25)"])
    const entry = (catalogos.sen.datasets as { uf: string; reason: string; checked_at?: string }[]).find((item) => item.uf === "AC")!
    assert.equal(entry.checked_at, "2026-09-25")
    assert.match(entry.reason, /^Checagem de 25\/09\/2026/)
    assert.ok(registrarAusenciasSenado([{ uf: "AC", cargo: "Senador", checked_at: "25/09" }], catalogos).problems.length === 1)
  })

  it("não duplica rodada já catalogada pelo mesmo registro", () => {
    const { planned, skipped } = importarRodadas([rodada({ registration: "BR-00360/2026" })], aliases, "2026-09-24T12:00:00Z", carregarCatalogos())
    assert.equal(planned.length, 0)
    assert.equal(skipped.length, 1)
  })
})
