import assert from "node:assert/strict"
import test from "node:test"
import { auditProgramasGoverno } from "../scripts/audit/audit-programas-governo"

test("audita toda a coorte presidencial sem publicar rascunhos", async () => {
  const result = await auditProgramasGoverno()

  assert.deepEqual(
    {
      officialCohort: result.officialCohort,
      resolved: result.resolved,
      absent: result.absent,
      extractionFailed: result.extractionFailed,
      reviewPending: result.reviewPending,
      approved: result.approved,
    },
    {
      officialCohort: 13,
      resolved: 13,
      absent: 0,
      extractionFailed: 0,
      reviewPending: 13,
      approved: 0,
    },
  )
  assert.ok(result.pages > 0)
  assert.ok(result.sections >= result.pages)
  assert.equal(result.claims, 179)
})
