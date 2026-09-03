import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const version = "20260902200000"
const runnerPath = join(root, "scripts/audit/apply-revoke-dml-views-publicas-production.sh")
const workflowPath = join(root, ".github/workflows/apply-revoke-dml-views-publicas-production.yml")
const migrationPath = join(root, `supabase/migrations/${version}_revoke_dml_views_publicas.sql`)
const readbackPath = join(root, `supabase/readback/${version}_revoke_dml_views_publicas.readback.sql`)
const rollbackPath = join(root, `supabase/rollback/${version}_revoke_dml_views_publicas.rollback.sql`)
const rollbackReadbackPath = join(root, `supabase/readback/${version}_revoke_dml_views_publicas.rollback.readback.sql`)

test("runner aplica somente a migration 20260902200000 com predecessor e ledger exatos", () => {
  const runner = readFileSync(runnerPath, "utf8")
  assert.match(runner, /version=20260902200000/)
  assert.match(runner, /previous_version=20260901180000/)
  assert.match(runner, /previous_digest=sha256:5657c95cc8398e7a214455204c0973326ad7dd351d7084e9724c196010474353/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /pg_advisory_xact_lock/)
  assert.match(runner, /revoke-dml-views-publicas-production/)
  assert.match(runner, /INSERT INTO supabase_migrations\.schema_migrations/)
  assert.match(runner, /idempotency_key/)
  assert.match(runner, /supabase\/readback\/\$\{version\}_revoke_dml_views_publicas\.readback\.sql/)
  assert.match(runner, /supabase\/rollback\/\$\{version\}_revoke_dml_views_publicas\.rollback\.sql/)
  assert.match(runner, /BEGIN\/COMMIT externos unicos/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  assert.doesNotMatch(runner, /patrimonio|elizeu/i)
})

test("workflow limita a escrita a main, produção e um SHA fechado, e prova em PG17 antes", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /expected_sha:/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /production-db-migrations/)
  assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
  assert.match(workflow, /bash scripts\/audit\/provar-revoke-dml-views-publicas-pg17\.sh/)
  assert.match(workflow, /bash scripts\/audit\/apply-revoke-dml-views-publicas-production\.sh/)
  assert.equal((workflow.match(/SUPABASE_DB_URL/g) ?? []).length, 1)
  assert.doesNotMatch(workflow, /inputs:\s*[\s\S]*migration:/)
})

test("migration só revoga: nenhuma escrita em tabela de conteúdo e SELECT público preservado", () => {
  const migration = readFileSync(migrationPath, "utf8")
  assert.match(migration, /REVOKE ALL ON public\.candidatos_identidade_tier1_auditavel FROM anon, authenticated;/)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON public\.financiamento_publico FROM anon, authenticated;/)
  assert.doesNotMatch(migration, /\b(INSERT INTO|UPDATE public\.|DELETE FROM)\b/)
  assert.match(migration, /perdeu SELECT em financiamento_publico/)
  // service_role fica fora da migration (o replay em banco vazio nao tem os
  // default privileges do Supabase) e entra no readback.
  assert.doesNotMatch(migration, /has_table_privilege\('service_role'/)
  assert.match(readFileSync(readbackPath, "utf8"), /service_role sem SELECT/)
  assert.equal((migration.match(/^BEGIN;$/gm) ?? []).length, 1)
  assert.equal((migration.match(/^COMMIT;$/gm) ?? []).length, 1)
})

test("readbacks e rollback fecham o estado dos dois lados", () => {
  const readback = readFileSync(readbackPath, "utf8")
  assert.match(readback, /version = '20260902200000'/)
  assert.match(readback, /has_table_privilege\(papel, 'public\.candidatos_identidade_tier1_auditavel', priv\)/)
  assert.match(readback, /sem SELECT em financiamento_publico/)

  const rollback = readFileSync(rollbackPath, "utf8")
  assert.match(rollback, /GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON public\.candidatos_identidade_tier1_auditavel TO anon, authenticated;/)
  assert.match(rollback, /GRANT TRUNCATE, REFERENCES, TRIGGER\s+ON public\.financiamento_publico TO anon, authenticated;/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations\s+WHERE version = '20260902200000';/)
  assert.match(rollback, /20260603013042 nao pode ser desfeita aqui/)

  const rollbackReadback = readFileSync(rollbackReadbackPath, "utf8")
  assert.match(rollbackReadback, /versao ainda no ledger/)
  assert.match(rollbackReadback, /com SELECT em tier1/)
})

test("runner falha antes de conectar sem contexto explícito", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  delete env.GITHUB_REF
  const result = spawnSync("bash", [runnerPath], { cwd: root, env, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /PF_DATABASE_URL e obrigatoria/)
})
