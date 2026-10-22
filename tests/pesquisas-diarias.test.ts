import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Pesquisa2TurnoLinha } from "../src/lib/segundo-turno-2026"
import {
  agruparPesquisasDiarias,
  filtrarPesquisasDiarias,
  formatarMediaPesquisa,
} from "../src/lib/pesquisas-diarias"

type PesquisaFixture = Pesquisa2TurnoLinha & {
  comparabilidade?: { chave: string; rotulo: string } | null
  registro?: string | null
}

function pesquisa(
  id: string,
  instituto: string,
  data: string | null,
  percentuais: [number, number],
  extras: Partial<Pick<PesquisaFixture, "comparabilidade" | "registro">> = {},
): PesquisaFixture {
  return {
    id,
    instituto,
    data,
    percentuais,
    margem: 2,
    url: `https://exemplo.test/${id}`,
    ...extras,
  }
}

describe("timeline de médias diárias de pesquisas", () => {
  it("calcula média simples entre institutos no mesmo dia e mantém as pesquisas individuais", () => {
    const linhas = [
      pesquisa("a", "Instituto A", "2026-10-01", [50, 40], { comparabilidade: { chave: "base-x", rotulo: "Base X" } }),
      pesquisa("b", "Instituto B", "2026-10-01", [54, 38], { comparabilidade: { chave: "base-x", rotulo: "Base X" } }),
    ]

    const [serie] = agruparPesquisasDiarias(linhas)
    assert.equal(serie.rotulo, "Base X")
    assert.equal(serie.comparavel, true)
    assert.deepEqual(serie.dias[0].percentuais, [52, 39])
    assert.deepEqual(serie.dias[0].pesquisas.map(({ id }) => id), ["a", "b"])
    assert.deepEqual(serie.linhas.map(({ id }) => id), ["a", "b"])
  })

  it("mantém datas separadas e não cria pontos nos dias sem publicação", () => {
    const linhas = [
      pesquisa("mais-antiga", "A", "2026-10-01", [40, 50], { comparabilidade: { chave: "x", rotulo: "X" } }),
      pesquisa("mais-recente", "B", "2026-10-04", [44, 48], { comparabilidade: { chave: "x", rotulo: "X" } }),
    ]
    const [serie] = agruparPesquisasDiarias(linhas)
    assert.deepEqual(serie.dias.map(({ data }) => data), ["2026-10-01", "2026-10-04"])
    assert.deepEqual(serie.linhas.map(({ id }) => id), ["mais-recente", "mais-antiga"])
  })

  it("separa bases incompatíveis e isola pesquisas sem chave", () => {
    const series = agruparPesquisasDiarias([
      pesquisa("a", "Instituto A", "2026-10-01", [50, 40], { comparabilidade: { chave: "x", rotulo: "X" } }),
      pesquisa("b", "Instituto B", "2026-10-01", [60, 30], { comparabilidade: { chave: "y", rotulo: "Y" } }),
      pesquisa("c", "Instituto C", "2026-10-01", [70, 20]),
      pesquisa("d", "Instituto D", "2026-10-01", [80, 10]),
    ])
    assert.equal(series.length, 4)
    assert.deepEqual(series.map(({ comparavel }) => comparavel), [true, true, false, false])
    assert.equal(series.find(({ id }) => id === "c")?.rotulo, "Pesquisa individual · Instituto C")
  })

  it("deduplica registro normalizado e mantém a reedição com publicação mais recente", () => {
    const series = agruparPesquisasDiarias([
      pesquisa("edicao-antiga", "Instituto A", "2026-10-01", [45, 45], { comparabilidade: { chave: "x", rotulo: "X" }, registro: "BR- 00123/2026" }),
      pesquisa("edicao-nova", "Instituto A", "2026-10-03", [47, 43], { comparabilidade: { chave: "x", rotulo: "X" }, registro: "br00123/26" }),
      pesquisa("outra", "Instituto B", "2026-10-03", [53, 39], { comparabilidade: { chave: "x", rotulo: "X" }, registro: "BR-00999/2026" }),
    ])
    assert.deepEqual(series[0].linhas.map(({ id }) => id), ["edicao-nova", "outra"])
    assert.deepEqual(series[0].dias[0].percentuais, [50, 41])
  })

  it("registros malformados não colapsam pesquisas distintas", () => {
    const comparabilidade = { chave: "x", rotulo: "X" }
    const [serie] = agruparPesquisasDiarias([
      pesquisa("a", "A", "2026-10-22", [48, 44], { comparabilidade, registro: "não informado" }),
      pesquisa("b", "B", "2026-10-22", [50, 42], { comparabilidade, registro: "não informado" }),
    ])
    assert.equal(serie.linhas.length, 2)
    assert.deepEqual(serie.dias[0].percentuais, [49, 43])
  })

  it("preserva linhas sem data ou com data inválida sem criar ponto, ignora valores inválidos e aceita zero real", () => {
    const linhas = [
      pesquisa("sem-data", "A", null, [0, 0], { comparabilidade: { chave: "x", rotulo: "X" } }),
      pesquisa("data-invalida", "A", "2026-02-30", [10, 20], { comparabilidade: { chave: "x", rotulo: "X" } }),
      pesquisa("percentual-invalido", "A", "2026-10-01", [101, 20], { comparabilidade: { chave: "x", rotulo: "X" } }),
      pesquisa("zero", "B", "2026-10-01", [0, 0], { comparabilidade: { chave: "x", rotulo: "X" } }),
    ]
    const [serie] = agruparPesquisasDiarias(linhas)
    assert.equal(serie.linhas.length, 4)
    assert.deepEqual(serie.dias.map(({ data }) => data), ["2026-10-01"])
    assert.deepEqual(serie.dias[0].percentuais, [0, 0])
    assert.deepEqual(serie.dias[0].pesquisas.map(({ id }) => id), ["zero"])
  })

  it("filtra por instituto e por janela inclusiva ancorada na data válida mais recente antes do filtro", () => {
    const linhas = [
      pesquisa("limite-30", "Instituto A", "2026-09-22", [40, 50]),
      pesquisa("dentro-30", "Instituto A", "2026-09-23", [41, 49]),
      pesquisa("ancora", "Instituto B", "2026-10-23", [42, 48]),
      pesquisa("sem-data", "Instituto A", null, [43, 47]),
    ]
    assert.deepEqual(filtrarPesquisasDiarias(linhas, { instituto: "Instituto A", periodo: "30" }).map(({ id }) => id), ["dentro-30"])
    assert.deepEqual(filtrarPesquisasDiarias(linhas, { instituto: "all", periodo: "30" }).map(({ id }) => id), ["dentro-30", "ancora"])
    assert.deepEqual(filtrarPesquisasDiarias(linhas, { instituto: "Instituto A", periodo: "all" }).map(({ id }) => id), ["limite-30", "dentro-30", "sem-data"])
  })

  it("formata percentual em pt-BR com uma casa decimal", () => {
    assert.equal(formatarMediaPesquisa(52), "52,0%")
  })
})
