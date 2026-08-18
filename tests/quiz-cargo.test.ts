/**
 * Allowlist de cargo do quiz (escopo de lancamento 2026-07-26).
 *
 * Antes desta mudanca, /quiz/resultado e o OG dela repassavam o `cargo` cru da
 * querystring para o dataset, e /quiz/resultado?cargo=Senador montava um quiz
 * de senadores mesmo com a UI oferecendo so Presidente e Governador. Com Senado
 * e Camara despublicados (migration 20260726120000), esse caminho passaria a
 * renderizar coorte vazia. O gate aqui e o que garante o fallback.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { QUIZ_CARGOS, isQuizCargo, normalizeQuizCargo } from "../src/lib/quiz-cargo"

describe("quiz-cargo", () => {
  it("cobre apenas os cargos majoritarios do Executivo", () => {
    assert.deepEqual([...QUIZ_CARGOS], ["Presidente", "Governador"])
  })

  it("aceita os cargos da allowlist", () => {
    assert.equal(isQuizCargo("Presidente"), true)
    assert.equal(isQuizCargo("Governador"), true)
    assert.equal(normalizeQuizCargo("Governador"), "Governador")
  })

  it("recusa cargo despublicado e cai em Presidente", () => {
    for (const cargo of ["Senador", "Deputado Federal", "Vice-Governador"]) {
      assert.equal(isQuizCargo(cargo), false)
      assert.equal(normalizeQuizCargo(cargo), "Presidente")
    }
  })

  it("recusa entrada vazia, nula ou arbitraria", () => {
    for (const cargo of ["", "   ", null, undefined, "presidente", "<script>"]) {
      assert.equal(isQuizCargo(cargo), false)
      assert.equal(normalizeQuizCargo(cargo), "Presidente")
    }
  })

  it("tolera espacos em volta de um cargo valido", () => {
    assert.equal(normalizeQuizCargo("  Governador  "), "Governador")
  })
})
