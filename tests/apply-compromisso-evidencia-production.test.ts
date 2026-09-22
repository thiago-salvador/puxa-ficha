import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

const version = "20260922130000"
const runnerPath = "scripts/audit/apply-compromisso-evidencia-production.sh"
const runner = readFileSync(runnerPath, "utf8")
const workflow = readFileSync(".github/workflows/apply-compromisso-evidencia-production.yml", "utf8")
const migration = readFileSync(`supabase/migrations/${version}_compromisso_evidencia.sql`, "utf8")
const rollback = readFileSync(`supabase/rollback/${version}_compromisso_evidencia.rollback.sql`, "utf8")
const readback = readFileSync(`supabase/readback/${version}_compromisso_evidencia.readback.sql`, "utf8")
const pgProof = readFileSync("tests/compromisso-evidencia.pg.sql", "utf8")
const sha256 = (path: string) => `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`

test("apply fixa a migration, o topo atual do ledger e o projeto de producao", () => {
  const predecessor = "supabase/migrations/20260921220000_issue_400_vice_to_capitao_osmar_deferido.sql"
  for (const value of [
    `version=${version}`,
    "previous_version=20260921220000",
    `previous_digest=${sha256(predecessor)}`,
    "wskpzsobvqwhnbsdsmok",
    "pg_advisory_xact_lock",
    "INSERT INTO supabase_migrations.schema_migrations",
    "PGSSLMODE=verify-full",
    "git ls-remote",
    "checkout sujo",
    "BEGIN/COMMIT externos unicos",
  ]) {
    assert.ok(runner.includes(value), value)
  }
  assert.doesNotMatch(runner, /supabase db push|apply_migration|verified_candidate/)
  assert.match(runner, /compromisso_evidencia\.rollback\.sql/)
  assert.match(runner, /compromisso_evidencia\.readback\.sql/)
})

test("workflow e manual, so em main, e prova o comportamento antes de aplicar", () => {
  for (const value of [
    "workflow_dispatch:",
    "environment: production",
    "production-db-migrations",
    'test "$PF_EXPECTED_SHA" = "$DISPATCH_SHA"',
    "persist-credentials: false",
    "if: github.ref == 'refs/heads/main'",
  ]) {
    assert.ok(workflow.includes(value), value)
  }
  assert.ok(
    workflow.indexOf("provar-compromisso-evidencia-pg17.sh") < workflow.indexOf("apply-compromisso-evidencia-production.sh"),
  )
  assert.equal((workflow.match(/secrets\.SUPABASE_DB_URL/g) ?? []).length, 2)
  const jobEnv = workflow.slice(workflow.indexOf("    env:"), workflow.indexOf("    steps:"))
  assert.doesNotMatch(jobEnv, /SUPABASE_DB_URL/)
})

test("migration mantem a tabela privada e a view com o filtro definitivo", () => {
  assert.match(migration, /ALTER TABLE public\.compromisso_evidencia ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON public\.compromisso_evidencia FROM PUBLIC, anon, authenticated, service_role/)
  assert.doesNotMatch(migration, /CREATE POLICY/)
  assert.doesNotMatch(migration, /ON public\.compromisso_evidencia TO (anon|authenticated)/)
  assert.doesNotMatch(migration, /GRANT SELECT \([^)]*\)\s+ON public\.compromisso_evidencia\b/)
  assert.match(migration, /WITH \(security_barrier = true, security_invoker = true\)/)
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/)
  const filtro = migration.slice(migration.indexOf("CREATE FUNCTION public.is_public_compromisso_evidencia"), migration.indexOf("CREATE VIEW"))
  assert.match(filtro, /AND e\.verificado\b/)
  assert.match(filtro, /AND e\.relacao IN \('sustenta', 'relacionada'\)/)
  assert.match(filtro, /public\.is_public_candidate\(e\.candidato_id\)/)
  const view = migration.slice(migration.indexOf("CREATE VIEW"), migration.indexOf("REVOKE ALL ON public.compromisso_evidencia_publica"))
  for (const privado of ["probabilidade", "revisado_por", "motivo", "origem", "verificado"]) {
    assert.doesNotMatch(view.split("FROM")[0], new RegExp(`\\be\\.${privado}\\b`), privado)
  }
  for (const valor of ["votacao_chave", "posicao_declarada", "fala", "projeto_lei", "contradicao"]) {
    assert.ok(migration.includes(`'${valor}'`), valor)
  }
  assert.doesNotMatch(migration, /cumpriu|descumpriu/)
})

test("rollback, readbacks e prova cobrem ledger, ACL, filtro e remocao", () => {
  assert.match(rollback, /DROP VIEW IF EXISTS public\.compromisso_evidencia_publica/)
  assert.match(rollback, /DROP TABLE IF EXISTS public\.compromisso_evidencia/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations WHERE version='20260922130000'/)
  assert.match(readback, /has_any_column_privilege\('anon', 'public\.compromisso_evidencia', 'SELECT'\)/)
  assert.match(readback, /nao exige verificado/)
  for (const trecho of ["'v-sustenta'", "'p-contradiz'", "'pd-pendente'", "'f-privado'", "abertura_simulada", "esperava 6 rejeicoes"]) {
    assert.ok(pgProof.includes(trecho), trecho)
  }
})

test("runner recusa conectar sem contexto explicito de deploy", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  delete env.GITHUB_REF
  const result = spawnSync("bash", [runnerPath], { env, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /PF_DATABASE_URL e obrigatoria/)
})
