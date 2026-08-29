import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parse } from "yaml"

const workflow = readFileSync(".github/workflows/data-quality.yml", "utf8")

test("workflow mantém gate temporal strict separado da fila informativa", () => {
  const parsed = parse(workflow) as {
    jobs?: Record<string, { steps?: Array<{ run?: string; "continue-on-error"?: boolean }> }>
  }
  const strict = parsed.jobs?.["validade-temporal-strict"]
  const informative = parsed.jobs?.["validade-temporal"]
  assert.ok(strict)
  assert.ok(informative)
  assert.ok(strict.steps?.some((step) => step.run === "npm run audit:validade-temporal"))
  assert.equal(strict.steps?.some((step) => step["continue-on-error"] === true), false)
  assert.equal(informative.steps?.some((step) => step["continue-on-error"] === true), true)
})
