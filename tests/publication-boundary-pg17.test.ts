import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

// Opt-in local PG17. No secrets, remote database, published port or real identities.
test("PG17: despublicação restrictive, preservação, controles negativos e rollback", { skip: process.env.PF_PROVAR_PUBLICATION_PG17 !== "1", timeout: 180_000 }, () => {
  const version = "20260905220000"
  const name = "publicacao_tabelas_filhas"
  const migration = `supabase/migrations/${version}_${name}.sql`
  const file = (path: string) => readFileSync(path, "utf8")
  const run = (args: string[], input?: string) => spawnSync("docker", args, { input, encoding: "utf8", timeout: 90_000 })
  const started = run(["run", "-d", "--rm", "-e", "POSTGRES_PASSWORD=fixture", "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"])
  assert.equal(started.status, 0, started.stderr)
  const container = started.stdout.trim()
  const q = (sql: string) => run(["exec", "-i", container, "psql", "-X", "-U", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], sql)
  const ok = (sql: string) => { const r = q(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim() }
  const fail = (sql: string, reason: RegExp) => { const r = q(sql); assert.notEqual(r.status, 0); assert.match(r.stderr, reason) }
  const tables = ["mudancas_partido", "patrimonio", "pontos_atencao"]
  const hash = () => tables.map((table) => ok(`SELECT md5(string_agg(to_jsonb(t)::text,'|' ORDER BY id)) FROM ${table} t`)).join(":")
  try {
    const ready = run(["exec", container, "bash", "-c", "for i in {1..60}; do pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && psql -U postgres -h 127.0.0.1 -Atqc 'select 1' >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"])
    assert.equal(ready.status, 0, ready.stderr)
    ok(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
      CREATE TABLE candidatos(id uuid PRIMARY KEY, publicavel boolean, status text);
      INSERT INTO candidatos VALUES ('00000000-0000-4000-8000-000000000001',true,'candidato'),('00000000-0000-4000-8000-000000000002',false,'candidato');
      GRANT SELECT ON candidatos TO anon, authenticated;`)
    // Gates reais versionados, não uma aproximação da regra editorial no teste.
    const loadFunctions = (path: string, names: string[], expected: number) => {
      const sql = file(`supabase/migrations/${path}`)
      const pattern = new RegExp(`^CREATE OR REPLACE FUNCTION public\\.(?:${names.join("|")})\\([\\s\\S]*?^\\$\\$;`, "gm")
      const definitions = [...sql.matchAll(pattern)].map((match) => match[0])
      assert.equal(definitions.length, expected, "extração dos gates reais deve falhar fechada")
      for (const definition of definitions) ok(definition)
    }
    loadFunctions("20260403113000_harden_child_rls_and_uniques.sql", ["is_public_candidate"], 1)
    loadFunctions("20260403234500_gate_unverified_ai_attention_points.sql", ["is_public_attention_point"], 1)
    loadFunctions("20260725160000_gate_gravidade_fonte_pontos_atencao.sql", ["fonte_url_tem_caminho", "pontos_atencao_tem_fonte_com_caminho", "is_public_attention_point"], 3)
    loadFunctions("20260725190000_fonte_substancia_documento_pontos_atencao.sql", ["fonte_url_e_raiz_de_aplicacao", "fonte_url_aponta_para_documento", "pontos_atencao_tem_fonte_com_caminho"], 3)
    for (const table of tables) {
      ok(`CREATE TABLE ${table}(id int PRIMARY KEY,candidato_id uuid,despublicado_em timestamptz,visivel boolean,gerado_por text,verificado boolean,gravidade text,fontes jsonb);
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON ${table} TO anon, authenticated;
        CREATE POLICY "Leitura pública" ON ${table} FOR SELECT USING (is_public_candidate(candidato_id) ${table === "pontos_atencao" ? "AND is_public_attention_point(visivel,gerado_por,verificado,gravidade,fontes)" : ""});
        INSERT INTO ${table} VALUES
        (1,'00000000-0000-4000-8000-000000000001',NULL,true,'curadoria',true,'baixa','[]'),
        (2,'00000000-0000-4000-8000-000000000001','2026-08-01',true,'curadoria',true,'baixa','[]'),
        (3,'00000000-0000-4000-8000-000000000002',NULL,true,'curadoria',true,'baixa','[]');`)
    }
    ok("INSERT INTO pontos_atencao VALUES (4,'00000000-0000-4000-8000-000000000001',NULL,false,'curadoria',true,'baixa','[]'),(5,'00000000-0000-4000-8000-000000000001',NULL,true,'ia',false,'baixa','[]'),(6,'00000000-0000-4000-8000-000000000001',NULL,true,'curadoria',false,'alta','[]')")
    ok(`INSERT INTO pontos_atencao VALUES
      (7,'00000000-0000-4000-8000-000000000001',NULL,true,'curadoria',true,'critica','[{"url":"https://example.test/processos/123"}]'),
      (8,'00000000-0000-4000-8000-000000000001',NULL,true,'curadoria',true,'critica','[]')`)
    const before = hash()
    const baselinePolicies = ok("SELECT string_agg(policyname || ':' || tablename || ':' || qual, '|' ORDER BY tablename) FROM pg_policies WHERE schemaname='public'")
    for (const table of tables) assert.equal(ok(`SET ROLE anon; SELECT string_agg(id::text,',' ORDER BY id) FROM ${table}; RESET ROLE;`), table === "pontos_atencao" ? "1,2,7" : "1,2", "fixture reproduz despublicado acessível")
    if (existsSync(migration)) ok(file(migration))
    for (const role of ["anon", "authenticated"]) for (const table of tables) {
      assert.equal(ok(`SET ROLE ${role}; SELECT string_agg(id::text,',' ORDER BY id) FROM ${table}; RESET ROLE;`), table === "pontos_atencao" ? "1,7" : "1", `${role}/${table}: válido retido, despublicado e candidato privado excluídos`)
    }
    assert.equal(hash(), before, "forward não altera uma coluna de dado")
    ok(`INSERT INTO supabase_migrations.schema_migrations VALUES ('${version}')`)
    const readback = file(`supabase/readback/${version}_${name}.readback.sql`)
    ok(readback)
    ok(file(migration))
    assert.equal(hash(), before, "replay idempotente preserva o acervo")
    ok(`DELETE FROM supabase_migrations.schema_migrations WHERE version='${version}'`)
    fail(readback, /ledger/)
    ok(`INSERT INTO supabase_migrations.schema_migrations VALUES ('${version}'),('29990101000000')`)
    ok(readback)
    ok("DELETE FROM supabase_migrations.schema_migrations WHERE version='29990101000000'")
    ok('ALTER TABLE patrimonio DISABLE ROW LEVEL SECURITY')
    fail(readback, /RLS/)
    fail(file(migration), /RLS/)
    ok('ALTER TABLE patrimonio ENABLE ROW LEVEL SECURITY')
    // Outra policy permissiva não pode reabrir a quarentena.
    ok('CREATE POLICY adversarial ON mudancas_partido FOR SELECT USING (true)')
    assert.equal(ok("SET ROLE anon; SELECT count(*) FROM mudancas_partido WHERE despublicado_em IS NOT NULL; RESET ROLE;"), "0")
    fail(readback, /publicacao|publicação|drift/)
    ok('DROP POLICY adversarial ON mudancas_partido')
    ok('ALTER POLICY publicacao_sem_despublicados ON patrimonio USING (true)')
    fail(readback, /publicacao|publicação|drift/)
    fail(file(migration), /drift/)
    fail(file(`supabase/rollback/${version}_${name}.rollback.sql`), /drift/)
    ok('ALTER POLICY publicacao_sem_despublicados ON patrimonio USING (despublicado_em IS NULL)')
    ok(readback)
    ok(file(`supabase/rollback/${version}_${name}.rollback.sql`))
    ok(file(`supabase/readback/${version}_${name}.rollback.readback.sql`))
    assert.equal(hash(), before, "rollback preserva todos os registros e timestamps")
    assert.equal(ok("SELECT string_agg(policyname || ':' || tablename || ':' || qual, '|' ORDER BY tablename) FROM pg_policies WHERE schemaname='public'"), baselinePolicies)
    for (const table of tables) assert.equal(ok(`SET ROLE anon; SELECT string_agg(id::text,',' ORDER BY id) FROM ${table}; RESET ROLE;`), table === "pontos_atencao" ? "1,2,7" : "1,2")
  } finally {
    const stopped = run(["stop", container])
    assert.equal(stopped.status, 0, stopped.stderr)
  }
})
