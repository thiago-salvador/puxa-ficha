import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import type {
  ErroValidacaoPesquisasEleitorais as ErroValidacaoPesquisasEleitoraisExport,
  parsePesquisasEleitoraisJson as ParsePesquisasEleitoraisJsonExport,
} from "@/lib/pesquisas-eleitorais"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const {
  ErroValidacaoPesquisasEleitorais,
  carregarPesquisasEleitorais,
  parsePesquisasEleitoraisJson,
} = require("../src/lib/pesquisas-eleitorais") as typeof import("@/lib/pesquisas-eleitorais") & {
  ErroValidacaoPesquisasEleitorais: typeof ErroValidacaoPesquisasEleitoraisExport
  parsePesquisasEleitoraisJson: typeof ParsePesquisasEleitoraisJsonExport
}

const pesquisasText = readFileSync("scripts/data/pesquisas-presidencia-2026.json", "utf8")
const fontesText = readFileSync("scripts/data/pesquisas-eleitorais-fontes.json", "utf8")

interface PesquisaFixture {
  id: string
  source_id?: string
  source_status: string
  publishable_by_default: boolean
  publication_date: { value: string }
  cenarios: Array<{
    comparability_key?: string
    resultados: Array<{ value_percent: number; [key: string]: unknown }>
    [key: string]: unknown
  }>
  [key: string]: unknown
}

interface FonteFixture {
  id: string
  status: string
  representative_poll: { result_url: string | null; [key: string]: unknown } | null
  [key: string]: unknown
}

function inputs() {
  return {
    pesquisas: JSON.parse(pesquisasText) as { pesquisas: PesquisaFixture[]; [key: string]: unknown },
    fontes: JSON.parse(fontesText) as {
      preferred_source_ids: string[]
      sources: FonteFixture[]
      [key: string]: unknown
    },
  }
}

function parse(pesquisas: unknown, fontes: unknown) {
  return parsePesquisasEleitoraisJson(JSON.stringify(pesquisas), JSON.stringify(fontes))
}

function rejects(run: () => unknown, pattern: RegExp) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ErroValidacaoPesquisasEleitorais)
    assert.match(error.message, pattern)
    return true
  })
}

describe("contrato dos dados de pesquisas eleitorais", () => {
  it("publica somente fontes preferenciais e aprovadas pelo scorecard", () => {
    const catalogo = carregarPesquisasEleitorais()
    const fontes = JSON.parse(fontesText) as {
      preferred_source_ids: string[]
      sources: Array<{ id: string; status: string }>
    }
    const aprovadas = new Set(fontes.sources.filter((source) => source.status === "aprovado").map((source) => source.id))
    const preferenciais = new Set(fontes.preferred_source_ids)

    assert.ok(catalogo.schemaVersion)
    assert.ok(catalogo.aliasesVersion)
    assert.ok(catalogo.pesquisas.length > 0)
    assert.ok(catalogo.pesquisas.every((poll) => aprovadas.has(poll.sourceId)))
    assert.ok(catalogo.pesquisas.every((poll) => preferenciais.has(poll.sourceId)))
    assert.ok(catalogo.pesquisas.every((poll) => poll.sourceStatus === "aprovado"))
    assert.deepEqual(catalogo.preferredSourceIds, fontes.preferred_source_ids)
    assert.deepEqual(catalogo.pesquisas.map((poll) => poll.sourceId), [
      "datafolha-folha-globo-nacional-2026",
    ])
    assert.strictEqual(carregarPesquisasEleitorais(), catalogo)
  })

  it("rejeita percentual fora do intervalo, sem converter falha em zero", () => {
    const { pesquisas, fontes } = inputs()
    pesquisas.pesquisas[0].cenarios[0].resultados[0].value_percent = 101
    rejects(() => parse(pesquisas, fontes), /entre 0 e 100/)
  })

  it("rejeita data impossível", () => {
    const { pesquisas, fontes } = inputs()
    pesquisas.pesquisas[0].publication_date.value = "2026-02-30"
    rejects(() => parse(pesquisas, fontes), /data inválida/)
  })

  it("rejeita fonte aprovada sem URL pública", () => {
    const { pesquisas, fontes } = inputs()
    const sourceId = pesquisas.pesquisas[0].source_id
    const source = fontes.sources.find((entry) => entry.id === sourceId)
    assert.ok(source?.representative_poll)
    source.status = "aprovado"
    source.representative_poll.result_url = null
    pesquisas.pesquisas[0].source_status = "aprovado"
    pesquisas.pesquisas[0].publishable_by_default = true
    rejects(() => parse(pesquisas, fontes), /result_url|URL de resultado/)
  })

  it("rejeita cenário incompleto ou incompatível", () => {
    let { pesquisas, fontes } = inputs()
    delete pesquisas.pesquisas[0].cenarios[0].comparability_key
    rejects(() => parse(pesquisas, fontes), /comparability_key/)

    const next = inputs()
    pesquisas = next.pesquisas
    fontes = next.fontes
    pesquisas.pesquisas[0].cenarios[0].comparability_key = "2026|Governador|SP|1|outro"
    rejects(() => parse(pesquisas, fontes), /incompatível/)
  })

  it("rejeita source_id ausente ou inexistente", () => {
    const { pesquisas, fontes } = inputs()
    delete pesquisas.pesquisas[0].source_id
    rejects(() => parse(pesquisas, fontes), /source_id/)

    const next = inputs()
    next.pesquisas.pesquisas[0].source_id = "fonte-inexistente"
    rejects(() => parse(next.pesquisas, next.fontes), /source_id não existe/)
  })

  it("deduplica resultado integralmente idêntico e rejeita colisão conflitante", () => {
    const { pesquisas, fontes } = inputs()
    const scenario = pesquisas.pesquisas[0].cenarios[0]
    scenario.resultados.push(structuredClone(scenario.resultados[0]))
    const parsed = parse(pesquisas, fontes)
    const parsedScenario = parsed.pesquisas.find((poll) => poll.id === pesquisas.pesquisas[0].id)?.cenarios[0]
    assert.equal(parsedScenario?.resultados.length, scenario.resultados.length - 1)

    const duplicate = scenario.resultados.at(-1)
    assert.ok(duplicate)
    duplicate.value_percent += 1
    rejects(() => parse(pesquisas, fontes), /duplicada conflitante/)
  })

  it("rejeita propriedade JSON duplicada antes de JSON.parse", () => {
    const duplicate = pesquisasText.replace(
      /"schema_version": "[^"]+",/,
      '"schema_version": "1.1.0", "schema_version": "2.0.0",',
    )
    rejects(() => parsePesquisasEleitoraisJson(duplicate, fontesText), /propriedade JSON duplicada/)
  })

  it("exclui fonte condicional mesmo quando a pesquisa é estruturalmente válida", () => {
    const { pesquisas, fontes } = inputs()
    const sourceId = pesquisas.pesquisas[0].source_id
    const source = fontes.sources.find((entry) => entry.id === sourceId)
    assert.ok(source)
    source.status = "condicional"
    pesquisas.pesquisas[0].source_status = "condicional"
    pesquisas.pesquisas[0].publishable_by_default = false
    const parsed = parse(pesquisas, fontes)
    assert.equal(parsed.pesquisas.some((poll) => poll.sourceId === sourceId), false)
  })

  it("mantém AtlasIntel fail-closed enquanto o scorecard estiver condicional", () => {
    const { pesquisas, fontes } = inputs()
    const atlas = fontes.sources.find((source) => source.id === "atlasintel-bloomberg-nacional-2026")
    assert.equal(atlas?.status, "condicional")
    assert.equal(
      parse(pesquisas, fontes).pesquisas.some(
        (poll) => poll.sourceId === "atlasintel-bloomberg-nacional-2026",
      ),
      false,
    )
  })

  it("não substitui fonte preferencial ausente por instituto aprovado fora do conjunto", () => {
    const { pesquisas, fontes } = inputs()
    assert.equal(
      fontes.sources.find((source) => source.id === "poderdata-aya-nacional-2026")?.status,
      "aprovado",
    )
    assert.equal(
      parse(pesquisas, fontes).pesquisas.some(
        (poll) => poll.sourceId === "poderdata-aya-nacional-2026",
      ),
      false,
    )
  })

  it("rejeita fonte preferencial inexistente no scorecard", () => {
    const { pesquisas, fontes } = inputs()
    fontes.preferred_source_ids.push("fonte-inexistente")
    rejects(() => parse(pesquisas, fontes), /preferred_source_ids referencia fonte inexistente/)
  })
})
