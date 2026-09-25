import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  casaDaFonte,
  causaDivergencia,
  centavos,
  classificarLinha,
  dentroDaTolerancia,
  identidadeConfere,
  legislaturasDoAno,
  statusVaiParaQuarentena,
  toleranciaCents,
} from "../scripts/audit/lib/gastos-parlamentares-conferencia"

describe("conferência de gastos parlamentares", () => {
  it("tolerância é o maior entre R$ 50 e 1% do oficial", () => {
    assert.equal(toleranciaCents(0), 5000)
    assert.equal(toleranciaCents(400_000), 5000)
    assert.equal(toleranciaCents(500_000), 5000)
    assert.equal(toleranciaCents(10_000_000), 100_000)
    assert.equal(dentroDaTolerancia(10_100_000, 10_000_000), true)
    assert.equal(dentroDaTolerancia(10_100_001, 10_000_000), false)
    assert.equal(dentroDaTolerancia(105_000, 100_000), true)
    assert.equal(dentroDaTolerancia(105_001, 100_000), false)
  })

  it("ano de posse cobre duas legislaturas", () => {
    assert.deepEqual(legislaturasDoAno(2011), [53, 54])
    assert.deepEqual(legislaturasDoAno(2013), [54])
    assert.deepEqual(legislaturasDoAno(2019), [55, 56])
    assert.deepEqual(legislaturasDoAno(2023), [56, 57])
    assert.deepEqual(legislaturasDoAno(2026), [57])
    assert.deepEqual(legislaturasDoAno(1991), [49])
    assert.throws(() => legislaturasDoAno(1990))
  })

  it("identifica a casa pela fonte gravada", () => {
    assert.equal(casaDaFonte("Senado"), "senado")
    assert.equal(casaDaFonte("CEAPS/Senado"), "senado")
    assert.equal(casaDaFonte("Camara CEAP CSV"), "camara")
    assert.equal(casaDaFonte("https://dadosabertos.camara.leg.br/api/v2/deputados/1/despesas"), "camara")
    assert.equal(casaDaFonte("Portal da Transparência — viagens por CPF"), "fora_da_regra")
    assert.equal(casaDaFonte(null), "fora_da_regra")
  })

  it("converte valores da fonte em centavos", () => {
    assert.equal(centavos("111.3"), 11130)
    assert.equal(centavos("12,5"), 1250)
    assert.equal(centavos(0.1 + 0.2), 30)
    assert.throws(() => centavos("abc"))
  })

  it("classifica pela API, depois pelo CSV anual, e manda o resto para quarentena", () => {
    const api = { cents: 10_000_000, rows: 10 }
    assert.equal(classificarLinha({ dbCents: 10_050_000, idOficial: 1, api }), "confere_api")
    assert.equal(
      classificarLinha({ dbCents: 12_000_000, idOficial: 1, api, csv: { cents: 12_000_100, rows: 12 } }),
      "confere_csv",
    )
    assert.equal(classificarLinha({ dbCents: 12_000_000, idOficial: 1, api, csv: { cents: 0, rows: 0 } }), "diverge")
    assert.equal(classificarLinha({ dbCents: 675_320, idOficial: 1, api: { cents: 0, rows: 0 }, csv: { cents: 0, rows: 0 } }), "fonte_sem_linhas")
    assert.equal(classificarLinha({ dbCents: 27, idOficial: 1, api: { cents: 0, rows: 0 } }), "fonte_sem_linhas")
    assert.equal(classificarLinha({ dbCents: 100, idOficial: null, api: null }), "sem_id_oficial")
    assert.equal(statusVaiParaQuarentena("confere_api"), false)
    assert.equal(statusVaiParaQuarentena("confere_csv"), false)
    for (const status of ["diverge", "fonte_sem_linhas", "sem_id_oficial"] as const) {
      assert.equal(statusVaiParaQuarentena(status), true)
    }
  })

  it("aponta a causa provável da divergência", () => {
    const api = { cents: 3_309_500, rows: 40 }
    assert.equal(causaDivergencia({ dbCents: 2_700, ano: 2019, anoCorrente: 2026, api: { cents: 0, rows: 0 } }), "sem_lancamentos_na_fonte")
    assert.equal(
      causaDivergencia({ dbCents: 3_000_000, ano: 2019, anoCorrente: 2026, api, porLegislatura: { 55: 309_500, 56: 3_000_000 } }),
      "ano_de_posse_com_uma_legislatura_so",
    )
    assert.equal(causaDivergencia({ dbCents: 1_000_000, ano: 2026, anoCorrente: 2026, api }), "coleta_defasada_ano_em_curso")
    assert.equal(causaDivergencia({ dbCents: 9_000_000, ano: 2026, anoCorrente: 2026, api }), "banco_acima_da_fonte")
    assert.equal(causaDivergencia({ dbCents: 1_000_000, ano: 2015, anoCorrente: 2026, api }), "banco_abaixo_da_fonte")
  })

  it("identidade exige nascimento igual e dois nomes em comum", () => {
    const ficha = { nome: "Antônio Carlos Peixoto de Magalhães Neto", nascimento: "1979-01-26" }
    assert.equal(identidadeConfere({ nome: "ANTÔNIO CARLOS PEIXOTO DE MAGALHÃES NETO", nascimento: "1979-01-26" }, ficha), true)
    assert.equal(identidadeConfere({ nome: "Zacharias Calil Hamu", nascimento: "1953-11-05" }, { nome: "ZACARIAS CALIL HAMU", nascimento: "1953-11-05" }), true)
    // Mesmo nascimento, outra pessoa: o caso que gravou gastos de um deputado na ficha de outro.
    assert.equal(
      identidadeConfere({ nome: "DANIEL RICARDO SORANZ PINTO", nascimento: "1979-02-16" }, { nome: "Daniel Barbosa Santos", nascimento: "1979-02-16" }),
      false,
    )
    assert.equal(identidadeConfere({ nome: "Maria dos Santos", nascimento: "1970-01-01" }, { nome: "Maria das Dores dos Santos", nascimento: "1970-01-01" }), true)
    assert.equal(identidadeConfere({ nome: "Maria dos Anjos", nascimento: "1970-01-01" }, { nome: "Maria dos Santos", nascimento: "1970-01-01" }), false)
    assert.equal(identidadeConfere({ nome: "ANTÔNIO CARLOS PEIXOTO", nascimento: "1979-01-27" }, ficha), false)
    assert.equal(identidadeConfere({ nome: null, nascimento: "1979-01-26" }, ficha), false)
    assert.equal(identidadeConfere({ nome: "ANTÔNIO CARLOS", nascimento: null }, ficha), false)
  })
})
