import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim()
if (!branch || branch === "main") throw new Error(`branch insegura para esta mudança: ${branch || "detached"}`)

const localOnlyCommits = Number(
  execFileSync("git", ["rev-list", "--count", "origin/main..HEAD"], { encoding: "utf8" }).trim(),
)
if (localOnlyCommits !== 0) throw new Error("o escopo exige zero commit local antes da revisão humana")

const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" })
const files = status
  .split("\n")
  .filter(Boolean)
  .map((line) => line.slice(3))
const allowed = [
  /^\.github\/workflows\/data-freshness-audit\.yml$/,
  /^docs\/operations\/data-freshness-workflow\/(EVAL|GATES|PLAN)\.md$/,
  /^package\.json$/,
  /^scripts\/audit\/(audit-data-freshness\.ts|data-freshness-snapshot\.sql|sync-data-freshness-issue\.sh|verify-data-freshness-scope\.mjs)$/,
  /^scripts\/data\/data-freshness-sources\.json$/,
  /^scripts\/lib\/data-freshness\/(candidaturas|recommendations|registry|tse-source|types)\.ts$/,
  /^tests\/data-freshness-(alerts|artifacts|candidaturas|fail-closed|golden|registry|workflow)\.test\.ts$/,
  /^tests\/fixtures\/data-freshness\/cases\.jsonl$/,
]
const outside = files.filter((file) => !allowed.some((pattern) => pattern.test(file)))
if (outside.length) throw new Error(`arquivos fora do escopo: ${outside.join(", ")}`)

const workflow = readFileSync(".github/workflows/data-freshness-audit.yml", "utf8")
if (/contents:\s*write|pull-requests:\s*write|git\s+(push|commit|merge)|gh\s+pr|deploy|supabase\s+db/i.test(workflow)) {
  throw new Error("workflow contém operação remota de escrita")
}
const sql = readFileSync("scripts/audit/data-freshness-snapshot.sql", "utf8")
if (/\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i.test(sql)) {
  throw new Error("snapshot SQL contém comando de escrita")
}
if (!/default_transaction_read_only\s*=\s*on/i.test(sql)) {
  throw new Error("snapshot SQL não força transação somente leitura")
}

console.log("DATA_FRESHNESS_SCOPE_PASS")
