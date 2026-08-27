import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parse } from "yaml"

const workflow = readFileSync(".github/workflows/data-freshness-audit.yml", "utf8")
const sql = readFileSync("scripts/audit/data-freshness-snapshot.sql", "utf8")

test("workflow diário é estritamente observacional", () => {
  const parsed = parse(workflow) as { permissions?: { contents?: string }; jobs?: { auditar?: unknown } }
  assert.equal(parsed.permissions?.contents, "read")
  assert.ok(parsed.jobs?.auditar)
  assert.match(workflow, /cron:\s*"37 11 \* \* \*"/)
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /permissions:\n\s+contents:\s*read/)
  assert.match(workflow, /persist-credentials:\s*false/)
  assert.doesNotMatch(workflow, /contents:\s*write|pull-requests:\s*write|git\s+(push|commit|merge)|gh\s+pr|deploy/i)
})

test("snapshot força leitura e auditoria preserva quatro artefatos", () => {
  assert.match(sql, /default_transaction_read_only\s*=\s*on/i)
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i)
  assert.match(workflow, /audit:data-freshness/)
  assert.match(workflow, /if:\s*always\(\)/)
  assert.match(workflow, /upload-artifact@[a-f0-9]{40}/)
  assert.match(workflow, /reports\/data-freshness\//)
})

test("workflow não publica correção automática", () => {
  assert.doesNotMatch(workflow, /pull request|issue|migration|revalidate|SUPABASE_SERVICE_ROLE_KEY/i)
  assert.match(workflow, /DATA_FRESHNESS|auditoria exige revisão/i)
  console.log("DATA_FRESHNESS_WORKFLOW_PASS")
})
