import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"
import { digest, PREDECESSOR, renderRemediationTransaction } from "../scripts/audit/apply-master-review-remediation"

test("PG17: pacote inteiro e ledger atômicos, dry-run, drift e rollback", {
  skip: process.env.PF_PROVAR_CRON_RECEIPTS_PG17 !== "1", timeout: 180_000,
}, () => {
  const run = (args: string[], input?: string) => spawnSync("docker", args, { input, encoding: "utf8", timeout: 90_000 })
  const started = run(["run", "-d", "--rm", "-e", "POSTGRES_PASSWORD=fixture", "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"])
  assert.equal(started.status, 0, started.stderr)
  const container = started.stdout.trim()
  const query = (sql: string) => run(["exec", "-i", container, "psql", "-X", "-U", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], sql)
  const ok = (sql: string) => { const r = query(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim() }
  const fail = (sql: string, reason: RegExp) => { const r = query(sql); assert.notEqual(r.status, 0); assert.match(r.stderr, reason) }
  const render = (mode: Parameters<typeof renderRemediationTransaction>[0]) => renderRemediationTransaction(mode, "a".repeat(40))
  const pristine = () => {
    assert.equal(ok("SELECT max(version) FROM supabase_migrations.schema_migrations"), PREDECESSOR)
    assert.equal(ok("SELECT to_regclass('public.request_ip_quotas') IS NULL AND to_regclass('public.cron_execution_receipts') IS NULL"), "t")
    assert.equal(ok("SELECT count(*) FROM pg_policies WHERE policyname='publicacao_sem_despublicados'"), "0")
  }
  try {
    assert.equal(run(["exec", container, "bash", "-c", "for i in {1..60}; do pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && psql -U postgres -h 127.0.0.1 -Atqc 'select 1' >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"]).status, 0)
    ok(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[], name text, created_by text, idempotency_key text, rollback text[]);
      CREATE FUNCTION public.is_public_candidate(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
      CREATE FUNCTION public.is_public_attention_point(boolean,text,boolean,text,jsonb) RETURNS boolean LANGUAGE sql AS 'SELECT true';`)
    // Esta fixture prova atomicidade, não reimplementa gates eleitorais; estes
    // são exercitados com funções reais em publication-boundary-pg17.test.ts.
    for (const table of ["mudancas_partido", "patrimonio", "pontos_atencao"]) {
      ok(`CREATE TABLE ${table}(id integer PRIMARY KEY, candidato_id uuid, despublicado_em timestamptz, visivel boolean, gerado_por text, verificado boolean, gravidade text, fontes jsonb);
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON ${table} TO anon, authenticated;
        CREATE POLICY "Leitura pública" ON ${table} FOR SELECT USING(public.is_public_candidate(candidato_id));`)
    }
    const key = digest(readFileSync(`supabase/migrations/${PREDECESSOR}_corrigir_textos_julgamento.sql`, "utf8"))
    ok(`INSERT INTO supabase_migrations.schema_migrations(version,idempotency_key) VALUES ('${PREDECESSOR}','wrong')`)
    fail(render("apply"), /ledger or digest drift/); pristine()
    ok(`UPDATE supabase_migrations.schema_migrations SET idempotency_key='${key}' WHERE version='${PREDECESSOR}'`)
    ok(render("dry-run")); pristine()
    ok("ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT fixture_failure CHECK(version <> '20260905220100')")
    fail(render("apply"), /fixture_failure/); pristine()
    ok("ALTER TABLE supabase_migrations.schema_migrations DROP CONSTRAINT fixture_failure")
    ok(render("apply")); ok(render("verify"))
    assert.equal(ok("SELECT count(*) FROM supabase_migrations.schema_migrations"), "4")
    fail(render("apply"), /ledger or digest drift/)
    ok("INSERT INTO cron_execution_receipts VALUES ('published-consistency',now())")
    ok(render("rollback")); pristine()
    assert.equal(ok("SELECT count(*) FROM cron_execution_receipts_retired_20260905220200"), "1")
  } finally {
    assert.equal(run(["stop", container]).status, 0)
  }
})
