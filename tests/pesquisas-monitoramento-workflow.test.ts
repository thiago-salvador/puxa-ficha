import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const workflow = readFileSync(".github/workflows/pesquisas-monitoramento.yml", "utf8")

test("workflow e manual, read-only e diagnosticavel", () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.doesNotMatch(workflow, /^\s*schedule:/m)
  assert.match(workflow, /source_id:/)
  assert.match(workflow, /uf:/)
  assert.match(workflow, /contents:\s*read/)
  assert.match(workflow, /GITHUB_STEP_SUMMARY/)
  assert.match(workflow, /upload-artifact@[a-f0-9]{40}/)
  assert.match(workflow, /retention-days:\s*14/)
  assert.doesNotMatch(workflow, /SUPABASE|SERVICE_ROLE|secrets\./i)
  console.log("MONITORAMENTO_WORKFLOW_PASS")
})
