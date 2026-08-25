import { execFileSync } from "node:child_process"

const allowed = new Set([
  "GATES.md",
  "PLAN.md",
  "docs/operations/pesquisas-governadores-cobertura-21-ufs-eval.md",
  "package.json",
  "scripts/audit/audit-pesquisas-eleitorais.ts",
  "scripts/audit/verify-pesquisas-governadores-scope.mjs",
  "scripts/data/pesquisas-governadores-2026.json",
  "scripts/data/pesquisas-governadores-cobertura-21-ufs.json",
  "scripts/data/pesquisas-governadores-fontes.json",
  "tests/pesquisas-eleitorais-selecao.test.ts",
  "tests/pesquisas-governadores-cobertura.test.ts",
  "tests/visual/pesquisas-eleitorais.spec.ts",
])

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

const changed = new Set([
  ...git(["diff", "--name-only", "origin/main"]),
  ...git(["ls-files", "--others", "--exclude-standard"]),
])
const unexpected = [...changed].filter((file) => !allowed.has(file)).sort()

if (unexpected.length > 0) {
  throw new Error(`arquivos fora do escopo: ${unexpected.join(", ")}`)
}
if ([...changed].some((file) => file.startsWith("src/") || file.includes("migration"))) {
  throw new Error("o escopo não permite design, runtime, migration ou escrita em banco")
}

console.log(`escopo do PR verificado: ${changed.size} arquivos permitidos`)
