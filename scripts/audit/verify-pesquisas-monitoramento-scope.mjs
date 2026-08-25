import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const allowed = new Set([
  ".github/workflows/pesquisas-monitoramento.yml",
  "GATES.md",
  "PLAN.md",
  "docs/operations/pesquisas-monitoramento-automatizado-eval.md",
  "docs/operations/pesquisas-monitoramento-automatizado.md",
  "package.json",
  "scripts/audit/audit-pesquisas-monitoramento.ts",
  "scripts/audit/verify-pesquisas-monitoramento-scope.mjs",
  "scripts/lib/pesquisas-monitoramento-rede.ts",
  "scripts/lib/pesquisas-monitoramento-tse.ts",
  "scripts/lib/pesquisas-monitoramento.ts",
  "scripts/pesquisas-monitoramento.ts",
  "tests/fixtures/pesquisas-monitoramento-golden.jsonl",
  "tests/fixtures/pesquisas-monitoramento/html-inesperado.html",
  "tests/fixtures/pesquisas-monitoramento/poderdata-publicacao.html",
  "tests/fixtures/pesquisas-monitoramento/tse-registros.csv",
  "tests/pesquisas-monitoramento-golden.test.ts",
  "tests/pesquisas-monitoramento-isolamento.test.ts",
  "tests/pesquisas-monitoramento-rede.test.ts",
  "tests/pesquisas-monitoramento-tse.test.ts",
  "tests/pesquisas-monitoramento-workflow.test.ts",
])

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").map((line) => line.trim()).filter(Boolean)
}

const forkPoint = git(["merge-base", "HEAD", "origin/main"])[0]
if (!forkPoint) throw new Error("nao foi possivel resolver o fork point com origin/main")
const changed = new Set([
  ...git(["diff", "--name-only", forkPoint]),
  ...git(["ls-files", "--others", "--exclude-standard"]),
])
const unexpected = [...changed].filter((path) => !allowed.has(path)).sort()
if (unexpected.length > 0) throw new Error(`arquivos fora do escopo: ${unexpected.join(", ")}`)
if ([...changed].some((path) => path.startsWith("src/") || path.startsWith("supabase/") || path === "package-lock.json")) {
  throw new Error("escopo nao permite runtime publico, banco, migration ou dependencia")
}
const workflow = readFileSync(".github/workflows/pesquisas-monitoramento.yml", "utf8")
if (/^\s*schedule:/m.test(workflow)) throw new Error("agendamento nao pode ser ativado neste PR")
console.log(`MONITORAMENTO_SCOPE_PASS: ${changed.size} arquivos permitidos`)
