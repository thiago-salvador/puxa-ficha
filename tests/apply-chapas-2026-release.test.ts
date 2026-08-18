import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const root = process.cwd()
const runnerPath = join(root, "scripts/audit/apply-chapas-2026-release.sh")
const workflowPath = join(root, ".github/workflows/apply-chapas-2026.yml")

const versions = ["20260813040000", "20260813040100", "20260813040200", "20260816011000"]

test("runner de produção aceita somente o conjunto fechado e aplica readback entre passos", () => {
  const runner = readFileSync(runnerPath, "utf8")
  assert.match(
    runner,
    /versions=\(20260813040000 20260813040100 20260813040200 20260816011000\)/,
  )
  assert.match(
    runner,
    /\[\[ "\$state" != "20260812130000\|0" && "\$state" != "20260816010000\|0" \]\]/,
  )
  assert.match(runner, /INSERT INTO supabase_migrations\.schema_migrations/)
  assert.match(runner, /BEGIN;[\s\S]*schema_migrations[\s\S]*COMMIT;/)
  assert.equal((runner.match(/psql -X -v ON_ERROR_STOP=1 -f -/g) ?? []).length, 1)
  assert.match(runner, /pg_advisory_xact_lock/)
  assert.match(runner, /ledger inicial divergiu sob lock/)
  assert.match(runner, /NOT IN \('20260812130000','20260816010000'\)/)
  assert.match(runner, /esperava quatro quartetos de release/)
  assert.match(
    runner,
    /IF \(SELECT max\(version\) FROM supabase_migrations\.schema_migrations\) <> '20260816011000'[\s\S]*count\(\*\)[\s\S]*<> 4 THEN/,
  )
  assert.match(
    runner,
    /WHERE version IN \('20260813040000','20260813040100','20260813040200','20260816011000'\)/,
  )
  assert.match(runner, /supabase\/readback/)
  assert.match(runner, /readback = pathlib\.Path\(readback_path\)\.read_bytes\(\)/)
  assert.match(runner, /print\(readback\.decode\("utf-8"\)/)
  assert.doesNotMatch(runner, /readback-release-pf-ajustes\.sh/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /git status --porcelain/)
  assert.match(runner, /refs\/heads\/main/)
  assert.doesNotMatch(runner, /supabase db push/)
  for (const version of versions) {
    assert.match(runner, new RegExp(version))
  }
})

test("runner falha antes de conectar sem SHA e banco explícitos", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  const result = spawnSync("bash", [runnerPath], {
    cwd: root,
    env,
    encoding: "utf8",
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /PF_DATABASE_URL e obrigatoria/)
})

test("workflow manual não aceita versões ou comandos arbitrários", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /expected_sha:/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /SUPABASE_DB_URL/)
  assert.match(workflow, /github\.ref/)
  assert.match(workflow, /apply-chapas-2026-release\.sh/)
  assert.doesNotMatch(workflow, /inputs:\s*[\s\S]*versions:/)
  assert.doesNotMatch(workflow, /supabase db push/)
})
