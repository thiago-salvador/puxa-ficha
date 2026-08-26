import assert from "node:assert/strict"
import test from "node:test"
import { auditProgramasGoverno } from "../scripts/audit/audit-programas-governo"

test("audita toda a coorte presidencial sem publicar rascunhos", async () => {
  const result = await auditProgramasGoverno()

  assert.equal(result.officialCohort, 13)
  assert.equal(result.resolved, 13)
  assert.equal(
    result.absent + result.extractionFailed + result.reviewPending + result.approved,
    13,
  )
  assert.ok(result.pages > 0)
  assert.ok(result.sections >= result.pages)
  assert.equal(result.claims, 179)
})

test("checkpoint pré-revisão confirma zero aprovação automática", async () => {
  const result = await auditProgramasGoverno({ expectNoApproved: true })
  assert.equal(result.reviewPending, 13)
  assert.equal(result.approved, 0)
})
