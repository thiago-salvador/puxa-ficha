import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { aggregateCamaraCotaCsv, selecionarCandidatosCotaCamara } from "../scripts/lib/ingest-camara-cota-csv"

const header = '"txNomeParlamentar";"cpf";"ideCadastro";"nuDeputadoId";"numAno";"txtDescricao";"vlrDocumento";"vlrGlosa";"vlrLiquido";"txtCNPJCPF"'

describe("CSV oficial de cotas da Câmara", () => {
  it("respeita alvos explícitos vazios e o predicado de coorte futuro", () => {
    const candidates = [{ slug: "a", elegivel: true }, { slug: "b", elegivel: false }]
    assert.deepEqual(selecionarCandidatosCotaCamara(candidates, { targetSlugs: [] }), [])
    assert.deepEqual(
      selecionarCandidatosCotaCamara(candidates, { cohortPredicate: (candidate) => candidate.elegivel }),
      [candidates[0]],
    )
  })

  it("agrega por ID oficial e exclui CPF, CNPJ, fornecedor e nome", () => {
    const csv = `\uFEFF${header}\n"NOME EXEMPLO";"11122233344";"42";"2812";"2026";"DIVULGAÇÃO";"120";"20";"100";"00123456000199"\n"NOME EXEMPLO";"11122233344";"42";"2812";"2026";"PASSAGEM";"50";"0";"50";"00123456000199"\n"LIDERANÇA";"";"";"";"2026";"ESCRITÓRIO";"10";"0";"10";""`
    const result = aggregateCamaraCotaCsv(csv, 2026)
    assert.deepEqual([...result.keys()], ["42"])
    const aggregate = result.get("42")!
    assert.equal(aggregate.rowCount, 2)
    assert.equal(aggregate.totalLiquido, 150)
    assert.deepEqual([...aggregate.categories], [["DIVULGAÇÃO", 100], ["PASSAGEM", 50]])
    assert.equal(JSON.stringify(aggregate).includes("11122233344"), false)
    assert.equal(JSON.stringify(aggregate).includes("00123456000199"), false)
    assert.equal(JSON.stringify(aggregate).includes("NOME EXEMPLO"), false)
  })

  it("falha fechado para arquivo vazio, colunas ausentes, ano divergente e valores não numéricos", () => {
    assert.throws(() => aggregateCamaraCotaCsv(`${header}\n`, 2026), /sem linhas/)
    assert.throws(() => aggregateCamaraCotaCsv('"nuDeputadoId";"numAno"\n"1234";"2026"', 2026), /coluna ausente/)
    assert.throws(() => aggregateCamaraCotaCsv(`${header}\n"N";"";"";"1234";"2025";"G";"10";"0";"10";""`, 2026), /fora do ano/)
    assert.throws(() => aggregateCamaraCotaCsv(`${header}\n"N";"";"42";"1234";"2026";"G";"dez";"0";"10";""`, 2026), /não numérico/)
  })
})
