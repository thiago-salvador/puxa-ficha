import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { test } from "node:test"

test("todos os workflows agendados constam no inventário operacional", () => {
  const inventory = readFileSync("Settings/AUTOMATIONS_AND_ENVIRONMENTS.md", "utf8")
  for (const file of readdirSync(".github/workflows").filter((name) => /\.ya?ml$/.test(name))) {
    const source = readFileSync(`.github/workflows/${file}`, "utf8")
    if (/^\s+schedule:/m.test(source)) assert.ok(inventory.includes(`\`${file}\``), file)
  }
})

test("DR enumera o bypass exigido pelo release protegido", () => {
  const dr = readFileSync("docs/RUNBOOK-DR.md", "utf8")
  assert.match(dr, /`VERCEL_AUTOMATION_BYPASS_SECRET`/)
})

test("CI executa as regressões funcionais de quiz e interação", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8")
  assert.match(ci, /playwright test tests\/visual\/quiz\.spec\.ts tests\/visual\/interactions\.spec\.ts/)
})
