import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  alertaEvolucaoPatrimonialVs2026,
  PATRIMONIO_EVOLUCAO_ALERTA_LIMITE,
} from "../src/lib/evolucao-patrimonial"

describe("alertaEvolucaoPatrimonialVs2026", () => {
  it("identifica aumento estritamente maior que R$ 1 milhão", () => {
    assert.deepEqual(
      alertaEvolucaoPatrimonialVs2026([
        { ano_eleicao: 2018, valor_total: 50_000 },
        { ano_eleicao: 2022, valor_total: 500_000 },
        { ano_eleicao: 2026, valor_total: 1_500_001 },
      ]),
      {
        anoAnterior: 2022,
        anoAlvo: 2026,
        valorAnterior: 500_000,
        valorAlvo: 1_500_001,
        aumento: 1_000_001,
      },
    )
  })

  it("não passa no limite exato nem abaixo dele", () => {
    for (const aumento of [PATRIMONIO_EVOLUCAO_ALERTA_LIMITE - 1, PATRIMONIO_EVOLUCAO_ALERTA_LIMITE]) {
      assert.equal(
        alertaEvolucaoPatrimonialVs2026([
          { ano_eleicao: 2022, valor_total: 500_000 },
          { ano_eleicao: 2026, valor_total: 500_000 + aumento },
        ]),
        null,
      )
    }
  })

  it("não passa em queda ou estabilidade patrimonial", () => {
    for (const valorAlvo of [500_000, 1_500_000]) {
      assert.equal(
        alertaEvolucaoPatrimonialVs2026([
          { ano_eleicao: 2022, valor_total: 1_500_000 },
          { ano_eleicao: 2026, valor_total: valorAlvo },
        ]),
        null,
      )
    }
  })

  it("aceita zero declarado como base para o aumento absoluto", () => {
    assert.equal(
      alertaEvolucaoPatrimonialVs2026([
        { ano_eleicao: 2022, valor_total: 0 },
        { ano_eleicao: 2026, valor_total: 1_000_001 },
      ])?.aumento,
      1_000_001,
    )
  })

  it("não inventa alerta sem o par 2026 e ano anterior", () => {
    assert.equal(
      alertaEvolucaoPatrimonialVs2026([{ ano_eleicao: 2026, valor_total: 2_000_000 }]),
      null,
    )
    assert.equal(
      alertaEvolucaoPatrimonialVs2026([{ ano_eleicao: 2022, valor_total: 2_000_000 }]),
      null,
    )
  })

  it("ignora linhas inválidas sem perder uma referência válida", () => {
    assert.deepEqual(
      alertaEvolucaoPatrimonialVs2026([
        { ano_eleicao: 2022, valor_total: 500_000 },
        { ano_eleicao: 2024, valor_total: Number.NaN },
        { ano_eleicao: 2025, valor_total: null },
        { ano_eleicao: Number.POSITIVE_INFINITY, valor_total: 9_000_000 },
        { ano_eleicao: 2026, valor_total: 1_500_001 },
      ]),
      {
        anoAnterior: 2022,
        anoAlvo: 2026,
        valorAnterior: 500_000,
        valorAlvo: 1_500_001,
        aumento: 1_000_001,
      },
    )

    assert.equal(
      alertaEvolucaoPatrimonialVs2026([
        { ano_eleicao: 2022, valor_total: null },
        { ano_eleicao: 2025, valor_total: Number.NaN },
        { ano_eleicao: 2026, valor_total: Number.POSITIVE_INFINITY },
      ]),
      null,
    )
  })
})
