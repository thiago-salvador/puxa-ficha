import assert from "node:assert/strict"
import test from "node:test"
import { reprojectSafeClosures } from "../scripts/audit/reproject-tse-display-cells-local"

test("only safe matched actions close stale display cells; identity review stays open", () => {
  const baseline = { cells: [
    { slug: "a", family: "financiamento", category: "stale_not_projected", reason: "old" },
    { slug: "b", family: "patrimonio", category: "stale_not_projected", reason: "old" },
    { slug: "c", family: "historico_politico", category: "identity_review", reason: "identity" },
  ] }
  const result = reprojectSafeClosures(baseline, { apply_projection: [
    { slug: "a", family: "financiamento", writer_actions: ["atualizar_financiamento"], post_write_readback_matches: true, reason: "ok" },
    { slug: "b", family: "patrimonio", writer_actions: ["substituir_patrimonio"], post_write_readback_matches: false, reason: "coverage_proof_invalid" },
    { slug: "c", family: "historico_politico", writer_actions: ["substituir_historico"], post_write_readback_matches: true, reason: "ok" },
  ] })
  assert.equal(result.baseline_open, 2)
  assert.equal(result.projected_closed, 1)
  assert.equal(result.by_family.patrimonio.still_open_by_reason.coverage_proof_invalid, 1)
  assert.equal(result.cells[2]?.category, "identity_review")
})

test("current display match closes without writer action only when a receipt exists", () => {
  const baseline = { cells: [
    { slug: "a", family: "financiamento", category: "stale_not_projected", reason: "old" },
    { slug: "b", family: "financiamento", category: "stale_not_projected", reason: "old" },
  ] }
  const result = reprojectSafeClosures(baseline, { receipts: [{
    alvo: "a", resultado: "encontrado", volume: 1,
    detalhe: JSON.stringify({ family: "financiamento", materialized_readback: { required: true, provided: true, equal: true }, coverage_proof: { scope_complete: true, matched_rows: 1 } }),
  }] })
  assert.equal(result.by_family.financiamento.closed_now_by_contract, 1)
  assert.equal(result.by_family.financiamento.still_open, 1)
  assert.equal(result.cells[0]?.category, "closed_now")
  assert.equal(result.cells[1]?.category, "stale_not_projected")
})

test("actual collector receipt shape stays open without positive complete readback proof", () => {
  const baseline = { cells: [
    { slug: "a", family: "financiamento", category: "stale_not_projected", reason: "old" },
    { slug: "b", family: "patrimonio", category: "stale_not_projected", reason: "old" },
    { slug: "c", family: "historico_politico", category: "stale_not_projected", reason: "old" },
  ] }
  const result = reprojectSafeClosures(baseline, { receipts: [
    { alvo: "a", resultado: "indeterminado", volume: 0, detalhe: JSON.stringify({ family: "financiamento", materialized_readback: { required: true, provided: true, equal: false }, coverage_proof: { scope_complete: false, matched_rows: 0 } }) },
    { alvo: "b", resultado: "encontrado", volume: 1, detalhe: JSON.stringify({ family: "patrimonio", materialized_readback: { required: true, provided: true, equal: true }, coverage_proof: { scope_complete: false, matched_rows: 1 } }) },
    { alvo: "c", resultado: "encontrado", volume: 1, detalhe: JSON.stringify({ family: "historico_politico", materialized_readback: { required: true, provided: true, equal: true }, coverage_proof: { scope_complete: true, matched_rows: 1 } }) },
  ] })
  assert.equal(result.closed_now_by_contract, 1)
  assert.equal(result.still_open, 2)
  assert.equal(result.cells[2]?.category, "closed_now")
})
