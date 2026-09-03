import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const scriptPath = join(root, "scripts/audit/drill-restore-backup.sh")
const runbookPath = join(root, "docs/RUNBOOK-DR.md")

test("o ensaio de restauração só aceita arquivo local e recusa URL de banco", () => {
  const script = readFileSync(scriptPath, "utf8")
  assert.match(script, /postgres\(ql\)\?:\/\//)
  assert.match(script, /SOMENTE em container local/)
  assert.match(script, /pg_restore -U postgres --no-owner --no-privileges -d postgres/)
  assert.match(script, /openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000/)
  assert.match(script, /DRILL_RESTORE_OK=/)
  assert.match(script, /docker rm -f/)
  assert.doesNotMatch(script, /supabase\.co|SUPABASE_DB_URL/)

  const semArgumento = spawnSync("bash", [scriptPath], { cwd: root, encoding: "utf8" })
  assert.equal(semArgumento.status, 2)

  const url = spawnSync("bash", [scriptPath, "postgresql://user:pass@db.example.invalid:5432/postgres"], { cwd: root, encoding: "utf8" })
  assert.equal(url.status, 2)
  assert.match(`${url.stdout}${url.stderr}`, /SOMENTE em container local/)

  const sintaxe = spawnSync("bash", ["-n", scriptPath], { cwd: root, encoding: "utf8" })
  assert.equal(sintaxe.status, 0, sintaxe.stderr)
})

test("o runbook de DR declara RTO e RPO e aponta para o ensaio", () => {
  const runbook = readFileSync(runbookPath, "utf8")
  assert.match(runbook, /## 5\. RTO, RPO e ensaio de restauração/)
  assert.match(runbook, /\| RPO \(perda máxima de dado\)/)
  assert.match(runbook, /\| RTO do banco/)
  assert.match(runbook, /\| RTO da aplicação/)
  assert.match(runbook, /scripts\/audit\/drill-restore-backup\.sh/)
  assert.match(runbook, /### Ensaios realizados/)
  // A cadência do backup citada no runbook tem que ser a do workflow.
  const workflow = readFileSync(join(root, ".github/workflows/backup-db.yml"), "utf8")
  assert.match(workflow, /cron: "30 5 \* \* \*"/)
  assert.match(runbook, /05:30 UTC/)
  assert.match(workflow, /retention-days: 14/)
  assert.match(runbook, /14 dias de artifacts/)
})
