import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parse } from "yaml"

const freshnessWorkflow = readFileSync(".github/workflows/data-freshness-audit.yml", "utf8")
const qualityWorkflow = readFileSync(".github/workflows/data-quality.yml", "utf8")

test("workflow de freshness executa strict por membro e preserva artefatos", () => {
  const parsed = parse(freshnessWorkflow) as {
    jobs?: Record<string, { steps?: Array<{ run?: string; "continue-on-error"?: boolean }> }>
  }
  const auditJob = parsed.jobs?.auditar
  assert.ok(auditJob)
  assert.equal(auditJob.steps?.some((step) => step.run?.includes("audit:data-freshness -- --strict")), true)
  assert.equal(auditJob.steps?.some((step) => step["continue-on-error"] === true), true)
  assert.match(freshnessWorkflow, /upload-artifact@[a-f0-9]{40}/)
  assert.match(freshnessWorkflow, /reports\/data-freshness\//)
})

test("workflow conecta strict-all manual ao snapshot e preserva receipt", () => {
  const surfaceSection = qualityWorkflow.split("\n  superficie-fichas:")[1] ?? ""
  assert.match(surfaceSection, /args\+=\(--strict-all\)/)
  assert.match(surfaceSection, /--json=superficie-report\.json/)
  assert.match(surfaceSection, /upload-artifact@[a-f0-9]{40}/)
  assert.match(surfaceSection, /path: superficie-report\.json/)
})
