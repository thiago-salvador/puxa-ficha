import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  COMPARADOR_EIXO_DEFAULT,
  COMPARADOR_EIXOS,
  comparadorEixoOgSubtitle,
  normalizeComparadorEixo,
} from "../src/lib/comparador-axis"

describe("comparador axis", () => {
  it("não inclui o eixo de votações", () => {
    assert.deepEqual(COMPARADOR_EIXOS, ["patrimonio", "gastos"])
    assert.equal(COMPARADOR_EIXO_DEFAULT, "patrimonio")
  })

  it("aliases de votos e votações caem no patrimônio, para não quebrar links antigos", () => {
    assert.equal(normalizeComparadorEixo("votos"), "patrimonio")
    assert.equal(normalizeComparadorEixo("votacoes"), "patrimonio")
    assert.equal(normalizeComparadorEixo("votações"), "patrimonio")
    assert.equal(normalizeComparadorEixo("VOTOS"), "patrimonio")
  })

  it("reconhece patrimônio e gastos", () => {
    assert.equal(normalizeComparadorEixo("patrimonio"), "patrimonio")
    assert.equal(normalizeComparadorEixo("patrimônio"), "patrimonio")
    assert.equal(normalizeComparadorEixo("gastos"), "gastos")
    assert.equal(normalizeComparadorEixo(null), "patrimonio")
    assert.equal(normalizeComparadorEixo("inexistente"), "patrimonio")
  })

  it("OG de gastos avisa que Presidência e governo estadual não entram", () => {
    assert.match(comparadorEixoOgSubtitle.gastos, /CEAP\/CEAPS/)
    assert.match(comparadorEixoOgSubtitle.gastos, /Presidência/)
    assert.doesNotMatch(comparadorEixoOgSubtitle.gastos, /Votações/)
  })

  it("copy pública do comparar não promete votações nem destaques no confronto", () => {
    const page = readFileSync("src/app/(site)/comparar/page.tsx", "utf8")
    const panel = readFileSync("src/components/ComparadorPanel.tsx", "utf8")
    assert.doesNotMatch(page, /votações, gastos/)
    assert.doesNotMatch(page, /votações-chave ou gastos/)
    assert.doesNotMatch(page, /processos e destaques/)
    assert.doesNotMatch(page, /gastos da estrutura de governo/)
    assert.doesNotMatch(panel, /label="Destaques"/)
    assert.doesNotMatch(panel, /rowKey="votos"/)
    assert.doesNotMatch(panel, /Gastos da estrutura de governo/)
  })
})
