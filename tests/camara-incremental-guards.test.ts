import test from "node:test"
import assert from "node:assert/strict"
import {
  CORTE_HISTORICO_PROJETOS,
  GASTOS_RECENT_ANOS,
  hasFullVotacaoIdCoverage,
  hasGastosRecentYearsComplete,
  pareceCorteHistorico,
  projetosLeiSincronizado,
} from "../scripts/lib/camara-incremental-guards"

test("hasFullVotacaoIdCoverage: vazio requerido e sempre completo", () => {
  assert.equal(hasFullVotacaoIdCoverage([], ["a"]), true)
})

test("hasFullVotacaoIdCoverage: todos presentes", () => {
  assert.equal(hasFullVotacaoIdCoverage(["a", "b"], ["a", "b"]), true)
})

test("hasFullVotacaoIdCoverage: falta um", () => {
  assert.equal(hasFullVotacaoIdCoverage(["a", "b", "c"], ["a", "b"]), false)
})

test("hasGastosRecentYearsComplete: exige todos os anos padrao", () => {
  assert.equal(hasGastosRecentYearsComplete([2023, 2024]), false)
  assert.equal(hasGastosRecentYearsComplete([2023, 2024, 2025]), true)
  assert.equal(hasGastosRecentYearsComplete([2025, 2023, 2024]), true)
})

test("hasGastosRecentYearsComplete: lista required customizada", () => {
  assert.equal(hasGastosRecentYearsComplete([2024], [2024]), true)
  assert.equal(hasGastosRecentYearsComplete([], [2024]), false)
})

test("projetosLeiSincronizado: so pula quando o banco alcanca o declarado", () => {
  assert.equal(projetosLeiSincronizado(2089, 2089), true)
  assert.equal(projetosLeiSincronizado(2090, 2089), true, "acervo curado alem da fonte nao rebusca")
  assert.equal(projetosLeiSincronizado(2088, 2089), false)
})

test("projetosLeiSincronizado: sem cardinalidade declarada, nunca pula", () => {
  assert.equal(projetosLeiSincronizado(100, null), false)
  assert.equal(projetosLeiSincronizado(100, undefined), false)
  assert.equal(projetosLeiSincronizado(100, Number.NaN), false)
  assert.equal(projetosLeiSincronizado(100, -1), false)
})

test("projetosLeiSincronizado: zero declarado e zero no banco e sincronizado", () => {
  assert.equal(projetosLeiSincronizado(0, 0), true)
})

/**
 * Regressao da issue #138. Estes cinco sao os candidatos publicaveis medidos
 * contra a API da Camara no corpo da issue: todos tinham exatamente 100 linhas
 * no banco, e o guard antigo (`count >= 100`) dizia "sincronizado" para os
 * cinco, o que os congelava truncados para sempre.
 */
test("#138: os 100 do corte historico deixam de contar como sincronizado", () => {
  const medidos = [
    { slug: "efraim-filho", declarado: 2089 },
    { slug: "ronaldo-caiado", declarado: 1849 },
    { slug: "professora-dorinha", declarado: 1639 },
    { slug: "wellington-fagundes", declarado: 927 },
    { slug: "cabo-daciolo", declarado: 204 },
  ]

  for (const { slug, declarado } of medidos) {
    assert.equal(
      projetosLeiSincronizado(CORTE_HISTORICO_PROJETOS, declarado),
      false,
      `${slug}: 100 no banco contra ${declarado} na fonte nao pode ser sincronizado`
    )
  }
})

test("pareceCorteHistorico: reconhece a assinatura do slice(0, 100)", () => {
  assert.equal(pareceCorteHistorico(100), true)
  assert.equal(pareceCorteHistorico(99), false)
  assert.equal(pareceCorteHistorico(102), false, "da-vitoria tem 102 e nao e o corte puro")
})

test("constantes alinhadas ao ingest (documentacao viva)", () => {
  assert.deepEqual(GASTOS_RECENT_ANOS, [2023, 2024, 2025])
  assert.equal(CORTE_HISTORICO_PROJETOS, 100)
})
