import assert from "node:assert/strict"
import { test } from "node:test"
import { ESLint } from "eslint"

test("lint bloqueia promise esquecida e callback async usado como void", async () => {
  const eslint = new ESLint()
  const [result] = await eslint.lintText(`
    export async function operation(): Promise<void> { return }
    export function call(): void { operation() }
    export function acceptsVoid(callback: () => void): void { callback() }
    acceptsVoid(operation)
  `, { filePath: "src/lib/cron-execution-receipt.ts" })
  const rules = result.messages.map((message) => message.ruleId)
  assert.ok(rules.includes("@typescript-eslint/no-floating-promises"))
  assert.ok(rules.includes("@typescript-eslint/no-misused-promises"))
})
