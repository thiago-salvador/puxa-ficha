import test from "node:test"
import assert from "node:assert/strict"
import {
  GASTOS_RECENT_ANOS,
  PROJETOS_LEI_INGEST_CAP,
  hasFullVotacaoIdCoverage,
  hasGastosRecentYearsComplete,
  projetosLeiMeetsIngestCap,
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

test("projetosLeiMeetsIngestCap", () => {
  assert.equal(projetosLeiMeetsIngestCap(PROJETOS_LEI_INGEST_CAP - 1), false)
  assert.equal(projetosLeiMeetsIngestCap(PROJETOS_LEI_INGEST_CAP), true)
  assert.equal(projetosLeiMeetsIngestCap(200), true)
})

test("constantes alinhadas ao ingest (documentacao viva)", () => {
  assert.deepEqual(GASTOS_RECENT_ANOS, [2023, 2024, 2025])
  assert.equal(PROJETOS_LEI_INGEST_CAP, 100)
})
