import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parse } from "yaml"

const workflow = readFileSync(".github/workflows/data-quality.yml", "utf8")

test("workflow mantém validade temporal informativa sem falso gate permanente", () => {
  const parsed = parse(workflow) as {
    jobs?: Record<string, { steps?: Array<{ run?: string; "continue-on-error"?: boolean }> }>
  }
  const informative = parsed.jobs?.["validade-temporal"]
  assert.ok(informative)
  assert.equal(informative.steps?.some((step) => step["continue-on-error"] === true), true)
  assert.equal(parsed.jobs?.["validade-temporal-strict"], undefined)
  assert.match(workflow, /baseline\/delta confiável/i)
  const temporalSection = workflow.split("\n  validade-temporal:")[1]?.split("\n  sq-identity:")[0] ?? ""
  assert.match(temporalSection, /SUPABASE_ACCESS_TOKEN/)
  assert.doesNotMatch(temporalSection, /SUPABASE_SERVICE_ROLE_KEY/)
})

test("workflow conecta strict-all manual ao snapshot e preserva receipt", () => {
  const surfaceSection = workflow.split("\n  superficie-fichas:")[1] ?? ""
  assert.match(surfaceSection, /args\+=\(--strict-all\)/)
  assert.match(surfaceSection, /--json=superficie-report\.json/)
  assert.match(surfaceSection, /upload-artifact@[a-f0-9]{40}/)
  assert.match(surfaceSection, /path: superficie-report\.json/)
})
