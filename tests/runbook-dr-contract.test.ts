import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runbookPath = path.join(repoRoot, "docs/RUNBOOK-DR.md")

test("runbook DR mantém links internos válidos", async () => {
  const runbook = await readFile(runbookPath, "utf8")
  const links = [...runbook.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((href) => !/^(?:https?:|#)/.test(href))

  assert.ok(links.length > 0)
  await Promise.all(
    links.map((href) => access(path.resolve(path.dirname(runbookPath), href.split("#")[0])))
  )
})

test("runbook DR lista somente nomes e placeholders de segredos", async () => {
  const runbook = await readFile(runbookPath, "utf8")
  assert.doesNotMatch(runbook, /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/)
  assert.doesNotMatch(runbook, /\bsb_(?:secret|publishable)_[a-zA-Z0-9_-]{12,}/)
  assert.doesNotMatch(runbook, /\b(?:postgres(?:ql)?):\/\/(?!<)[^\s`]+/i)
  assert.doesNotMatch(
    runbook,
    /\b(?:SECRET|TOKEN|PASSWORD|SERVICE_ROLE_KEY)\s*=\s*(?!\$\{)[^\s`]+/
  )
})

test("runbook DR explicita dono dos pontos não confirmáveis pelo código", async () => {
  const runbook = await readFile(runbookPath, "utf8")
  assert.match(runbook, /## 4\. Confirmar no painel/)
  assert.match(runbook, /Responsável por confirmar:\s*\*\*Thiago\*\*/)
})
