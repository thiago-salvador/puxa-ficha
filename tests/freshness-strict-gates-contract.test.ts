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

test("workflow deixa recuperação manual no gate da coorte e exige opt-in para strict-all", () => {
  const parsed = parse(qualityWorkflow) as {
    on?: {
      workflow_dispatch?: {
        inputs?: Record<string, { type?: string; default?: boolean }>
      }
    }
  }
  const surfaceSection = qualityWorkflow.split("\n  superficie-fichas:")[1] ?? ""
  assert.deepEqual(parsed.on?.workflow_dispatch?.inputs?.strict_all, {
    description: "Incluir backlog fora da coorte no gate de superfície",
    required: false,
    type: "boolean",
    default: false,
  })
  assert.match(surfaceSection, /inputs\.strict_all/)
  assert.match(surfaceSection, /args\+=\(--strict-all\)/)
  assert.match(surfaceSection, /--json=superficie-report\.json/)
  assert.match(surfaceSection, /npm run audit:completude-publica/)
  assert.match(surfaceSection, /public-profile-completeness-report\.json/)
  assert.match(surfaceSection, /upload-artifact@[a-f0-9]{40}/)
  assert.match(surfaceSection, /\n\s+superficie-report\.json/)
})
