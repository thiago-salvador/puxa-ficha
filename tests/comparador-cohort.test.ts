/**
 * Coorte de /comparar a partir dos slugs da URL (auditoria de integridade
 * 2026-07-24). Antes desta correcao, a pagina lia c1..c4 so para pre-selecionar
 * e carregava sempre a coorte default "Presidente", entao um link de dois
 * governadores abria com os 13 presidenciaveis e nenhum dos dois marcados.
 *
 * Os cargos e estados usados aqui sao os que existiam em `candidatos_publico`
 * em 2026-07-25: Governador 168, Presidente 13, Senador 7, Deputado Federal 4,
 * Vice-Governador 3. Desde a migration 20260726120000, Senado e Camara estao
 * despublicados (184 publicados: Governador 168, Presidente 13,
 * Vice-Governador 3). Os casos com cargo Senador seguem aqui de proposito:
 * `resolveComparadorCohort` e funcao pura sobre a coorte que recebe, e deve
 * continuar correta se esses cargos voltarem ao ar.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isComparadorSlugParam, resolveComparadorCohort } from "@/lib/comparador-cohort"

describe("isComparadorSlugParam", () => {
  it("aceita slug publico e rejeita lixo de query string", () => {
    assert.equal(isComparadorSlugParam("acm-neto"), true)
    assert.equal(isComparadorSlugParam("lula"), true)
    assert.equal(isComparadorSlugParam("ACM-Neto"), false)
    assert.equal(isComparadorSlugParam("-lula"), false)
    assert.equal(isComparadorSlugParam("lula lima"), false)
    assert.equal(isComparadorSlugParam(""), false)
    assert.equal(isComparadorSlugParam(null), false)
    assert.equal(isComparadorSlugParam("a".repeat(200)), false)
  })
})

describe("resolveComparadorCohort", () => {
  it("sem slug resolvido devolve coorte vazia (mantem o default da pagina)", () => {
    assert.deepEqual(resolveComparadorCohort([]), {})
    assert.deepEqual(resolveComparadorCohort([null, undefined]), {})
    assert.deepEqual(resolveComparadorCohort([{ cargo_disputado: "   " }]), {})
  })

  it("dois governadores da mesma UF viram coorte daquela UF", () => {
    assert.deepEqual(
      resolveComparadorCohort([
        { cargo_disputado: "Governador", estado: "BA" },
        { cargo_disputado: "Governador", estado: "ba" },
      ]),
      { cargo: "Governador", estado: "BA" },
    )
  })

  it("governadores de UFs diferentes viram coorte nacional, sem perder ninguem", () => {
    assert.deepEqual(
      resolveComparadorCohort([
        { cargo_disputado: "Governador", estado: "BA" },
        { cargo_disputado: "Governador", estado: "SP" },
      ]),
      { cargo: "Governador", estado: undefined },
    )
  })

  it("governador sem estado preenchido nao restringe a coorte", () => {
    assert.deepEqual(
      resolveComparadorCohort([
        { cargo_disputado: "Governador", estado: "MG" },
        { cargo_disputado: "Governador", estado: null },
      ]),
      { cargo: "Governador", estado: undefined },
    )
  })

  it("presidenciaveis nunca ganham recorte de UF", () => {
    assert.deepEqual(
      resolveComparadorCohort([
        { cargo_disputado: "Presidente", estado: null },
        { cargo_disputado: "Presidente", estado: null },
      ]),
      { cargo: "Presidente", estado: undefined },
    )
  })

  it("o cargo vem do primeiro slug valido, que e a intencao expressa na URL", () => {
    assert.deepEqual(
      resolveComparadorCohort([
        null,
        { cargo_disputado: "Senador", estado: "PE" },
        { cargo_disputado: "Presidente", estado: null },
      ]),
      { cargo: "Senador", estado: undefined },
    )
  })
})
