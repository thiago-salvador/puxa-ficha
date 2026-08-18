import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildApplyGuardSnapshot,
  defaultApplyEligibleMax,
  formatApplyGuardAbortMessage,
  resolveApplyEligibleMax,
} from "../scripts/lib/historico-proveniencia-apply-guard"

test("P2f: default caps por modo", () => {
  assert.equal(defaultApplyEligibleMax("p2d"), 80)
  assert.equal(defaultApplyEligibleMax("p2e"), 25)
})

test("P2f: resolveApplyEligibleMax — flag explícita ou default", () => {
  assert.equal(resolveApplyEligibleMax("p2d", null), 80)
  assert.equal(resolveApplyEligibleMax("p2d", 120), 120)
  assert.equal(resolveApplyEligibleMax("p2e", 5), 5)
  assert.equal(resolveApplyEligibleMax("p2d", Number.NaN), 80)
  assert.equal(resolveApplyEligibleMax("p2e", -3), 25)
})

test("P2f: buildApplyGuardSnapshot — abaixo do limite", () => {
  assert.deepEqual(buildApplyGuardSnapshot("p2d", 29, 80), {
    apply_eligible_max: 80,
    eligible_row_count: 29,
    would_block_apply: false,
  })
})

test("P2f: buildApplyGuardSnapshot — acima do limite (simulação)", () => {
  assert.deepEqual(buildApplyGuardSnapshot("p2e", 30, 25), {
    apply_eligible_max: 25,
    eligible_row_count: 30,
    would_block_apply: true,
  })
})

test("P2f: mensagem de abort legível", () => {
  const m = formatApplyGuardAbortMessage("p2d", 100, 80)
  assert.match(m, /ABORT/)
  assert.match(m, /eligible_row_count=100/)
  assert.match(m, /apply_eligible_max=80/)
})
