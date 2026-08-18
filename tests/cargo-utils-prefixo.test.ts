/**
 * Prefixo "Candidatura a X" no cargo canonico (2026-08-05).
 *
 * 185 linhas de `historico_politico` estavam gravadas como "Candidatura a
 * Vereador" e nao casavam com `CARGOS_ELETIVOS` da regua de cobertura, que tem
 * "Vereador". Efeito MEDIDO rodando a regua com e sem normalizacao contra o
 * snapshot de producao de 05/08: 2 celulas mudam, em 1 ficha (jarbas-soares),
 * `financiamento` e `doadores` saem de "na" (nao se aplica) para "missing"
 * (lacuna), e o indice dela cai de 75 para 60. As outras 32 fichas com o
 * prefixo sao salvas pelo SQ_CANDIDATO do seed; a conta cresce com ficha nova
 * sem SQ.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { canonicalCargo } from "@/lib/cargo-utils"
import { formatHistoricoCargoTituloPublico } from "@/lib/historico-display"

describe("canonicalCargo tira o prefixo de candidatura", () => {
  it("as formas que existem no banco viram o cargo canonico", () => {
    assert.equal(canonicalCargo("Candidatura a Vereador"), "Vereador")
    assert.equal(canonicalCargo("Candidatura a Prefeito"), "Prefeito")
    assert.equal(canonicalCargo("Candidatura a Governador"), "Governador")
    assert.equal(canonicalCargo("Candidatura a Senador"), "Senador")
    assert.equal(canonicalCargo("Candidatura a Vice-Prefeito"), "Vice-Prefeito")
    assert.equal(canonicalCargo("Candidatura a Vice-prefeito"), "Vice-Prefeito")
    assert.equal(canonicalCargo("Candidatura a Presidente"), "Presidente")
    assert.equal(canonicalCargo("Candidato a Prefeito"), "Prefeito")
    assert.equal(canonicalCargo("Candidata a Governadora"), "Governador")
    assert.equal(canonicalCargo("Pré-candidatura a Governador"), "Governador")
    assert.equal(canonicalCargo("Pré-candidata a Governadora"), "Governador")
  })

  it("o caso que ja funcionava por acidente continua funcionando", () => {
    // A regra de deputado nao e ancorada em `^`, entao esta forma ja canonizava
    // certo antes do conserto. E o que tornava o defeito assimetrico e dificil
    // de enxergar: parte dos prefixos sumia sozinha, parte ficava.
    assert.equal(canonicalCargo("Candidatura a Deputado Federal"), "Deputado Federal")
    assert.equal(canonicalCargo("Candidatura a Deputado Estadual"), "Deputado Estadual")
  })

  it("cargo sem regra propria perde o prefixo em vez de voltar cru", () => {
    assert.equal(canonicalCargo("Candidatura a 1o Suplente Senador"), "1o Suplente Senador")
  })

  it("cargo que nao e candidatura nao e tocado", () => {
    assert.equal(canonicalCargo("Vereador"), "Vereador")
    assert.equal(canonicalCargo("Ministro da Fazenda"), "Ministro da Fazenda")
    assert.equal(canonicalCargo("Presidente da Alerj"), "Presidente da Alerj")
    // Nao pode comer palavra que so comeca parecido.
    assert.equal(canonicalCargo("Candidatura"), "Candidatura")
  })
})

describe("rotulo publico nao gagueja", () => {
  const linha = (cargo: string) => ({
    cargo,
    tipo_evento: "candidatura" as const,
    observacoes: null,
    periodo_inicio: 2008,
    periodo_fim: 2008,
  })

  it("'Candidatura: Candidatura a Vereador' nao aparece mais na ficha", () => {
    assert.equal(
      formatHistoricoCargoTituloPublico(linha("Candidatura a Vereador")),
      "Candidatura: Vereador",
    )
    assert.equal(
      formatHistoricoCargoTituloPublico(linha("Candidato a Prefeito")),
      "Candidatura: Prefeito",
    )
  })

  it("cargo sem prefixo segue igual", () => {
    assert.equal(formatHistoricoCargoTituloPublico(linha("Vereador")), "Candidatura: Vereador")
  })
})
