import assert from "node:assert/strict"
import { test } from "node:test"
import { ESLint } from "eslint"

test("lint bloqueia promise esquecida e callback async usado como void", async () => {
  // lintText fornece uma fixture em memória. A otimização single-run de CI
  // reutiliza o arquivo em disco e não deve substituir essa fixture.
  // Mantém todas as regras da configuração real do projeto.
  const eslint = new ESLint({
    overrideConfig: {
      languageOptions: {
        parserOptions: { disallowAutomaticSingleRunInference: true },
      },
    },
  })
  const [result] = await eslint.lintText(`
    export async function operation(): Promise<void> { return }
    export function call(): void { operation() }
    export function acceptsVoid(callback: () => void): void { callback() }
    acceptsVoid(operation)
  `, { filePath: "src/lib/cron-execution-receipt.ts" })
  const rules = result.messages.map((message) => message.ruleId)
  assert.ok(rules.includes("@typescript-eslint/no-floating-promises"), JSON.stringify(result.messages))
  assert.ok(rules.includes("@typescript-eslint/no-misused-promises"), JSON.stringify(result.messages))
})
