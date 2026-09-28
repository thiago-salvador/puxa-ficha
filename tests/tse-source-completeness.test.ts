import assert from "node:assert/strict"
import { test } from "node:test"
import { sourceAssetsComplete } from "../scripts/audit/lib/source-completeness"
import { validateIdentityReviewCoverage } from "../scripts/audit/plan-historico-politico-escrita-local"

test("source_complete requires every expected asset to have been read", () => {
  const expected = ["historico_politico|2022", "patrimonio|2022", "financiamento|2022"]
  assert.equal(sourceAssetsComplete(expected, expected, expected), true)
  assert.equal(sourceAssetsComplete(expected, expected.slice(0, 2), expected.slice(0, 2)), false)
  assert.equal(sourceAssetsComplete(expected, expected, expected.slice(0, 2)), false)
  assert.equal(sourceAssetsComplete([], [], []), false)
})

test("identity review covers classified risk cohort without a fixed count", () => {
  const cells = [{ slug: "a", family: "historico_politico", category: "identity_review" },
    { slug: "b", family: "historico_politico", category: "identity_review" },
    { slug: "safe", family: "historico_politico", category: "stale_not_projected" }]
  assert.deepEqual(validateIdentityReviewCoverage(cells, [{ slug: "a" }, { slug: "b" }]), new Set(["a", "b"]))
  assert.throws(() => validateIdentityReviewCoverage(cells, [{ slug: "a" }]), /revisão de identidade incompleta/)
})
