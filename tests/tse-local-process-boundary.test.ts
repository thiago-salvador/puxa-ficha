import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("launcher exports secrets in a subshell, never in command arguments", () => {
  const launcher = source("scripts/tse-local/ingest-tse-local.sh")
  assert.doesNotMatch(launcher, /\benv\s+(?:\\\s*)?SUPABASE_SERVICE_ROLE_KEY=/)
  assert.doesNotMatch(launcher, /\benv\s+(?:\\\s*)?PF_DOADOR_CPF_HASH_SALT=/)
  assert.match(launcher, /export SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(launcher, /export PF_DOADOR_CPF_HASH_SALT/)
})

test("Chrome and every ZIP subprocess receive an explicit minimal environment", () => {
  const files = [
    "scripts/tse-local/chrome-fetch.ts",
    "scripts/tse-local/official-uf.ts",
    "scripts/tse-local/ingest-tse-local.ts",
    "scripts/audit/plan-patrimonio-writers-local.ts",
    "scripts/audit/plan-historico-politico-escrita-local.ts",
    "scripts/audit/collect-tse-family-receipts-local.ts",
  ]
  for (const file of files) {
    const content = source(file)
    const calls = [...content.matchAll(/(?:spawn|spawnSync|execFileSync|execFileAsync)\("unzip",[\s\S]*?\{[^}]*\}\)/g)]
    assert.ok(calls.length > 0, file)
    for (const [call] of calls) assert.match(call, /env:\s*(?:minimalChildEnv|chromeChildEnv)\(/, file)
  }
  assert.match(source("scripts/tse-local/chrome-fetch.ts"), /chromium\.launch\(\{[^}]*env:\s*chromeChildEnv\(/)
})

test("public ingest report uses neutral linking terminology", () => {
  const orchestrator = source("scripts/tse-local/ingest-tse-local.ts")
  assert.doesNotMatch(orchestrator, /jev_name_linking/)
  assert.match(orchestrator, /vinculo_por_nome_revisado/)
})
