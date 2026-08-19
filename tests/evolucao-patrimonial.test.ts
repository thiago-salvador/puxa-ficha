import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  evolucaoPatrimonialVs2026,
  formatEvolucaoPatrimonialPct,
} from "../src/lib/evolucao-patrimonial"

describe("evolucaoPatrimonialVs2026", () => {
  it("calcula ((2026 - último ano anterior) / anterior) * 100", () => {
    assert.equal(
      evolucaoPatrimonialVs2026([
        { ano_eleicao: 2026, valor_total: 120 },
        { ano_eleicao: 2022, valor_total: 100 },
        { ano_eleicao: 2018, valor_total: 50 },
      ]),
      20,
    )
  })

  it("usa o ano mais recente antes de 2026, não o mais antigo", () => {
    assert.equal(
      evolucaoPatrimonialVs2026([
        { ano_eleicao: 2014, valor_total: 10 },
        { ano_eleicao: 2022, valor_total: 200 },
        { ano_eleicao: 2026, valor_total: 100 },
      ]),
      -50,
    )
  })

  it("devolve null quando só há 2026", () => {
    assert.equal(
      evolucaoPatrimonialVs2026([{ ano_eleicao: 2026, valor_total: 80_000 }]),
      null,
    )
  })

  it("devolve null quando 2026 não existe", () => {
    assert.equal(
      evolucaoPatrimonialVs2026([
        { ano_eleicao: 2022, valor_total: 100 },
        { ano_eleicao: 2018, valor_total: 80 },
      ]),
      null,
    )
  })

  it("devolve null quando o ano anterior é 0 (não inventa %)", () => {
    assert.equal(
      evolucaoPatrimonialVs2026([
        { ano_eleicao: 2022, valor_total: 0 },
        { ano_eleicao: 2026, valor_total: 150 },
      ]),
      null,
    )
  })

  it("aceita 2026 igual a 0 quando o ano anterior tem valor (declaração vazia)", () => {
    assert.equal(
      evolucaoPatrimonialVs2026([
        { ano_eleicao: 2022, valor_total: 100 },
        { ano_eleicao: 2026, valor_total: 0 },
      ]),
      -100,
    )
  })
})

describe("formatEvolucaoPatrimonialPct", () => {
  it("formata N/A, positivo, negativo e zero", () => {
    assert.equal(formatEvolucaoPatrimonialPct(null), "N/A")
    assert.equal(formatEvolucaoPatrimonialPct(12.4), "+12%")
    assert.equal(formatEvolucaoPatrimonialPct(-8.2), "-8%")
    assert.equal(formatEvolucaoPatrimonialPct(0), "0%")
  })
})
