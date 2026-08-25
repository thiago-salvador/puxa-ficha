import { execFileSync } from "node:child_process"

const ALLOWED = new Set([
  "scripts/audit/allowlist-issue-96-link-check-20260825.json",
  "scripts/audit/falhas-replay-linear.json",
  "scripts/audit/recortes.json",
  "scripts/verify-issue-96-scope.mjs",
  "src/lib/fonte-substancia.ts",
  "supabase/migrations/20260825123000_fix_public_attention_sources_issue_96.sql",
  "tests/fixtures/issue-96-post-migration-snapshot.json",
  "tests/fonte-substancia.test.ts",
  "tests/candidatos-publico-view-contrato.test.ts",
  "tests/issue-96-link-check-sources.test.ts",
  "tests/migrations-classificacao.test.ts",
])

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

const files = new Set(
  [
    git("diff", "--name-only", "origin/main...HEAD"),
    git("diff", "--name-only"),
    git("diff", "--cached", "--name-only"),
  ]
    .join("\n")
    .split("\n")
    .filter(Boolean),
)

const unexpected = [...files].filter((file) => !ALLOWED.has(file))
const sensitive = [...files].filter((file) => /(^|\/)(?:\.env|credentials?|secrets?)(?:\.|\/|$)/i.test(file))

if (unexpected.length > 0) {
  throw new Error(`issue #96 fora do allowlist:\n${unexpected.join("\n")}`)
}
if (sensitive.length > 0) {
  throw new Error(`issue #96 inclui arquivo sensível:\n${sensitive.join("\n")}`)
}
if (files.size !== ALLOWED.size || [...ALLOWED].some((file) => !files.has(file))) {
  throw new Error(`issue #96 diff incompleto:\n${[...files].sort().join("\n")}`)
}

console.log("ISSUE_96_SCOPE_OK")
