import assert from "node:assert/strict"
import { describe, it } from "node:test"

import rawChecks from "../scripts/data/checagens-atribuidas.json"
import {
  CLASSES_TOM_VEREDITO,
  normalizarRotuloVeredito,
  tomDoVeredito,
  type TomVeredito,
} from "../src/lib/checagem-veredito-cor"

describe("tomDoVeredito", () => {
  it("normaliza caixa, acento e hashtag", () => {
    assert.equal(normalizarRotuloVeredito("#NÃOÉBEMASSIM"), "naoebemassim")
    assert.equal(normalizarRotuloVeredito("  É  Falso "), "e falso")
  })

  const casos: [string, TomVeredito][] = [
    ["falso", "vermelho"],
    ["FALSO", "vermelho"],
    ["FALSA", "vermelho"],
    ["é falso", "vermelho"],
    ["#FAKE", "vermelho"],
    ["é enganoso", "ambar"],
    ["enganoso", "ambar"],
    ["FALTA CONTEXTO", "ambar"],
    ["falta contexto", "ambar"],
    ["#NÃOÉBEMASSIM", "ambar"],
    ["Não é bem assim", "ambar"],
    ["NÃO É BEM ASSIM", "ambar"],
    ["IMPRECISO", "ambar"],
    ["é impreciso", "ambar"],
    ["distorcido", "ambar"],
    ["EXAGERADO", "ambar"],
    ["é exagerado", "ambar"],
    ["sem contexto", "ambar"],
    ["SUBESTIMADO", "ambar"],
    ["VERDADEIRO, MAS", "ambar"],
    ["é verdadeiro, mas com uma imprecisão", "ambar"],
    ["é verdade, mas falta contexto", "ambar"],
    ["verdadeiro, porém incompleto", "ambar"],
    ["verdadeiro", "verde"],
    ["VERDADEIRO", "verde"],
    ["é verdadeiro", "verde"],
    ["#FATO", "verde"],
    ["#É FATO", "verde"],
    ["não há evidências", "cinza"],
    ["sem evidências", "cinza"],
    ["INSUSTENTÁVEL", "cinza"],
    ["é insustentável", "cinza"],
    ["CONTRADITÓRIO", "cinza"],
    ["está correto", "cinza"],
    ["", "cinza"],
    ["rótulo inédito", "cinza"],
  ]

  for (const [rotulo, esperado] of casos) {
    it(`"${rotulo}" vira ${esperado}`, () => {
      assert.equal(tomDoVeredito(rotulo), esperado)
    })
  }

  it("classifica todo rótulo publicado sem lançar erro e com classe definida", () => {
    const checks = (Array.isArray(rawChecks) ? rawChecks : []) as { originalLabel?: string }[]
    for (const check of checks) {
      const tom = tomDoVeredito(check.originalLabel ?? "")
      assert.ok(CLASSES_TOM_VEREDITO[tom], `sem classe para ${check.originalLabel}`)
    }
  })

  it("nenhum rótulo com 'falso' ou 'fake' cai em verde", () => {
    for (const rotulo of ["falso", "é falso", "#FAKE", "FALSA"]) {
      assert.notEqual(tomDoVeredito(rotulo), "verde")
    }
  })
})
