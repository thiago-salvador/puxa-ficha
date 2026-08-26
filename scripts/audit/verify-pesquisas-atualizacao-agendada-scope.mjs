import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const allowedExact = new Set([
  ".github/workflows/pesquisas-monitoramento.yml",
  "GATES.md",
  "docs/operations/pesquisas-monitoramento-automatizado-eval.md",
  "package.json",
  "scripts/audit/verify-pesquisas-atualizacao-agendada-scope.mjs",
  "tests/pesquisas-atualizacao-agendada.test.ts",
  "tests/pesquisas-monitoramento-workflow.test.ts",
])
const allowedPrefixes = [
  "scripts/pesquisas-atualizacao-agendada/",
  "tests/fixtures/pesquisas-atualizacao-agendada/",
]

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

const forkPoint = git(["merge-base", "HEAD", "origin/main"])[0]
if (!forkPoint) throw new Error("não foi possível resolver o fork point com origin/main")
const changed = new Set([
  ...git(["diff", "--name-only", forkPoint]),
  ...git(["ls-files", "--others", "--exclude-standard"]),
])
const unexpected = [...changed]
  .filter((path) => !allowedExact.has(path) && !allowedPrefixes.some((prefix) => path.startsWith(prefix)))
  .sort()
if (unexpected.length > 0) throw new Error(`arquivos fora do escopo: ${unexpected.join(", ")}`)
if ([...changed].some((path) => path.startsWith("src/") || path.startsWith("supabase/") || path === "package-lock.json")) {
  throw new Error("escopo não permite runtime público, banco, migration ou dependência")
}

const workflow = readFileSync(".github/workflows/pesquisas-monitoramento.yml", "utf8")
if (!/^\s*workflow_dispatch:/m.test(workflow)) throw new Error("workflow_dispatch ausente")
const cronEnabled = /^\s*schedule:/m.test(workflow)
const cronDisabledForDevelopment = /^\s*# schedule:/m.test(workflow)
if (!cronEnabled && process.env.PESQUISAS_CRON_DISABLED !== "1") throw new Error("cron diário ainda não foi habilitado")
if (!cronEnabled && !cronDisabledForDevelopment) throw new Error("expressão de cron de desenvolvimento ausente")
if (/secrets\.|SUPABASE|SERVICE_ROLE|revalidate|deploy|gh\s+pr\s+merge|git\s+merge|--force(?:-with-lease)?/i.test(workflow)) {
  throw new Error("workflow contém caminho proibido de secret, banco, deploy, merge ou force-push")
}
if ((workflow.match(/contents:\s*write/g) ?? []).length !== 1) throw new Error("contents: write deve existir uma única vez")
if ((workflow.match(/pull-requests:\s*write/g) ?? []).length !== 1) throw new Error("pull-requests: write deve existir uma única vez")
if ((workflow.match(/gh\s+pr\s+create/g) ?? []).length !== 1 || !/gh\s+pr\s+create[\s\\\n]+--draft/m.test(workflow)) {
  throw new Error("workflow deve abrir exatamente um PR e somente como draft")
}

console.log(`PESQUISAS_ATUALIZACAO_SCOPE_PASS: ${changed.size} arquivos permitidos; cron=${cronEnabled ? "enabled" : "development-disabled"}`)
