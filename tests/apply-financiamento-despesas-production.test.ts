import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

const version = "20260929100000"
const runnerPath = "scripts/audit/apply-financiamento-despesas-production.sh"
const runner = readFileSync(runnerPath, "utf8")
const applyWorkflow = readFileSync(".github/workflows/apply-financiamento-despesas-production.yml", "utf8")
const proof = readFileSync("scripts/audit/provar-financiamento-despesas-pg17.sh", "utf8")
const readback = readFileSync("scripts/audit/readback-financiamento-despesas.sql", "utf8")
const rollback = readFileSync("scripts/audit/rollback-financiamento-despesas.sql", "utf8")
const sha256 = (path: string) => `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`

test("apply das despesas fixa a migration, o topo atual do ledger e o projeto de produção", () => {
  const predecessor = "supabase/migrations/20260929020000_l8_mesa_processos_promessas.sql"
  for (const value of [
    `version=${version}`,
    "previous_version=20260929020000",
    `previous_digest=${sha256(predecessor)}`,
    "wskpzsobvqwhnbsdsmok",
    "pg_advisory_xact_lock",
    "puxa-ficha:financiamento-despesas-production",
    "INSERT INTO supabase_migrations.schema_migrations",
    "PGSSLMODE=verify-full",
    "default_transaction_read_only=on",
    "git ls-remote",
    "checkout sujo",
    "BEGIN/COMMIT externos unicos",
  ]) {
    assert.ok(runner.includes(value), value)
  }
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  assert.match(runner, /\$\{version\}_financiamento_despesas\.sql/)
  assert.match(runner, /scripts\/audit\/rollback-financiamento-despesas\.sql/)
  assert.match(runner, /scripts\/audit\/readback-financiamento-despesas\.sql/)
  assert.doesNotMatch(runner, /doador/i)
})

test("workflow de apply é manual, só main, e prova em PostgreSQL 17 antes de aplicar", () => {
  for (const value of [
    "workflow_dispatch:",
    "environment: production",
    "production-db-migrations",
    "cancel-in-progress: false",
    'test "$PF_EXPECTED_SHA" = "$DISPATCH_SHA"',
    "persist-credentials: false",
    "if: github.ref == 'refs/heads/main'",
    "permissions:\n  contents: read",
  ]) {
    assert.ok(applyWorkflow.includes(value), value)
  }
  // Só dispatch manual: nada de push, schedule ou pull_request disparando apply.
  assert.doesNotMatch(applyWorkflow, /^\s+(push|schedule|pull_request|pull_request_target):/m)
  assert.ok(
    applyWorkflow.indexOf("provar-financiamento-despesas-pg17.sh") > 0 &&
      applyWorkflow.indexOf("provar-financiamento-despesas-pg17.sh") <
        applyWorkflow.indexOf("apply-financiamento-despesas-production.sh"),
  )
  assert.equal((applyWorkflow.match(/secrets\.SUPABASE_DB_URL/g) ?? []).length, 2)
  const jobEnv = applyWorkflow.slice(applyWorkflow.indexOf("    env:"), applyWorkflow.indexOf("    steps:"))
  assert.doesNotMatch(jobEnv, /SUPABASE_DB_URL/)
  // Nenhuma action de terceiro sem pin por SHA.
  for (const uses of applyWorkflow.match(/uses: [^\s]+/g) ?? []) {
    if (uses.startsWith("uses: ./")) continue
    assert.match(uses, /@[0-9a-f]{40}$/, uses)
  }
})

test("depois do apply, o workflow revalida a ficha pública e falha sem confirmação", () => {
  const inicio = applyWorkflow.indexOf("  revalidate:")
  assert.ok(inicio > applyWorkflow.indexOf("apply-financiamento-despesas-production.sh"), "job revalidate depois do apply")
  const job = applyWorkflow.slice(inicio)
  for (const value of [
    "needs: [apply]",
    "https://puxaficha.com.br/api/revalidate",
    "secrets.PF_REVALIDATE_SECRET",
    "x-pf-revalidate-secret",
    '["public-candidato-ficha"]',
    'if [ "$status" != "200" ]; then exit 1; fi',
    '.ok == true and (.revalidated | index("public-candidato-ficha"))',
  ]) {
    assert.ok(job.includes(value), value)
  }
  // O segredo de revalidação não chega ao job que tem a URL do banco.
  assert.doesNotMatch(applyWorkflow.slice(0, inicio), /PF_REVALIDATE_SECRET/)
  assert.doesNotMatch(job, /SUPABASE_DB_URL/)
  assert.match(runner, /job `revalidate` do workflow revalida a tag/)
})

test("prova PG17 reprova documento com separadores e aceita valor decimal grande", () => {
  for (const nome of ["MEI 123 456 789 09", "MEI 123.456.789/09", "EMPRESA 12 345 678 0001 90"]) {
    assert.ok(proof.includes(`"nome":"${nome}"`), nome)
  }
  assert.match(proof, /"valor":123456789\.12/)
  assert.match(proof, /CHECK recusou valor decimal grande legitimo/)
})

test("prova PG17 roda forward duas vezes, readback, anon real, CHECKs e rollback", () => {
  assert.equal((proof.match(/file_db prova "\$FORWARD"/g) ?? []).length, 2, "idempotência: forward aplicado duas vezes")
  assert.match(proof, /file_db prova "\$READBACK"/)
  assert.match(proof, /file_db prova "\$ROLLBACK"/)
  assert.match(proof, /SET LOCAL ROLE anon/)
  assert.match(proof, /ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon/)
  assert.match(proof, /EXCEPTION WHEN insufficient_privilege/)
  assert.match(proof, /EXCEPTION WHEN check_violation/)
  for (const alvo of ["INSERT INTO public.financiamento_despesas_publico", "UPDATE public.financiamento_despesas_publico", "DELETE FROM public.financiamento_despesas_publico", "TRUNCATE public.financiamento_despesas"]) {
    assert.ok(proof.includes(alvo), alvo)
  }
  assert.match(proof, /12345678909/, "nome com CPF de MEI precisa ser reprovado pelo CHECK")
  assert.match(proof, /"cpf_hash"/)
})

test("readback confere ACL por função e lê como anon sem abrir transação", () => {
  assert.doesNotMatch(readback, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im)
  assert.match(readback, /version = '20260929100000'/)
  assert.match(readback, /security_invoker=true/)
  assert.match(readback, /relrowsecurity/)
  assert.match(readback, /has_column_privilege/)
  assert.match(readback, /has_any_column_privilege/)
  assert.match(readback, /SET LOCAL ROLE anon;[\s\S]*RESET ROLE;/)
  assert.match(readback, /PERFORM updated_at FROM public\.financiamento_despesas/)
  assert.match(readback, /PERFORM \* FROM public\.financiamento_despesas/)
  assert.doesNotMatch(readback, /\b(INSERT|UPDATE|DELETE)\s+(INTO\s+)?public\./i, "readback roda em transação somente leitura")
})

test("rollback derruba view e tabela e limpa só a própria versão do ledger", () => {
  assert.match(rollback, /^BEGIN;/m)
  assert.match(rollback, /^COMMIT;/m)
  assert.ok(rollback.indexOf("DROP VIEW IF EXISTS public.financiamento_despesas_publico") < rollback.indexOf("DROP TABLE IF EXISTS public.financiamento_despesas;"))
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations WHERE version = '20260929100000';/)
  assert.equal((rollback.match(/DELETE FROM/g) ?? []).length, 1)
})

test("runner recusa conectar sem contexto explícito de deploy", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  delete env.GITHUB_REF
  const result = spawnSync("bash", [runnerPath], { env, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /PF_DATABASE_URL e obrigatoria/)
})
