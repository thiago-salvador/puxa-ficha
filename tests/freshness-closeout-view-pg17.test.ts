import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

test("PG17: chapa pública exige titular público e preserva o acervo histórico", {
  skip: process.env.PF_PROVAR_FRESHNESS_CLOSEOUT_PG17 !== "1", timeout: 120_000,
}, () => {
  const run = (args: string[], input?: string) => spawnSync("docker", args, { input, encoding: "utf8", timeout: 60_000 })
  const start = run(["run", "-d", "--rm", "-e", "POSTGRES_PASSWORD=fixture", "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"])
  assert.equal(start.status, 0, start.stderr)
  const id = start.stdout.trim()
  const q = (sql: string) => run(["exec", "-i", id, "psql", "-X", "-U", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], sql)
  const ok = (sql: string) => { const r = q(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim() }
  const file = (path: string) => readFileSync(path, "utf8")
  try {
    assert.equal(run(["exec", id, "bash", "-c", "for i in {1..40}; do pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && psql -U postgres -h 127.0.0.1 -Atqc 'select 1' >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"]).status, 0)
    ok("CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE candidatos(id uuid PRIMARY KEY, slug text, publicavel boolean, status text); ALTER TABLE candidatos ENABLE ROW LEVEL SECURITY; GRANT SELECT ON candidatos TO anon,authenticated; CREATE POLICY public_candidate ON candidatos FOR SELECT USING(publicavel AND status<>'removido'); CREATE VIEW candidatos_publico WITH(security_invoker=true) AS SELECT id,slug FROM candidatos WHERE publicavel AND status<>'removido'; GRANT SELECT ON candidatos_publico TO anon,authenticated;")
    ok(file("supabase/migrations/20260813040000_chapas_2026_schema.sql"))
    const previous = file("supabase/migrations/20260829030001_candidate_roster_publication_integrity_schema.sql")
    ok(previous.slice(previous.indexOf("CREATE OR REPLACE VIEW"), previous.indexOf("DO $$", previous.indexOf("CREATE OR REPLACE VIEW"))))
    ok("INSERT INTO candidatos VALUES ('00000000-0000-4000-8000-000000000001','active',true,'candidato'),('00000000-0000-4000-8000-000000000002','removed',false,'removido');")
    for (const [key, titular] of [["active", "00000000-0000-4000-8000-000000000001"], ["historical", "00000000-0000-4000-8000-000000000002"]]) {
      ok(`INSERT INTO chapas_2026(chave,eleicao_codigo,eleicao_data,uf,cargo_titular,sq_coligacao,identidade_status,vinculo_titular_status,tse_situacao_codigo,tse_situacao_titular_codigo,tse_situacao_vice_codigo,tipo_agremiacao,composicao,titular_candidato_id,titular_nome_completo,titular_nome_urna,titular_partido_sigla,vice_nome_completo,vice_nome_urna,vice_partido_sigla,fonte_url,fonte_sha256,snapshot_em) VALUES('${key}','6259','2026-10-04','PA','Governador','fixture','confirmada','confirmado','fixture','fixture','fixture','fixture','fixture','${titular}','Fixture','Fixture','Fixture','Vice','Vice','Fixture','https://example.test','fixture',now());`)
    }
    const before = ok("SELECT md5(string_agg(to_jsonb(ch)::text,'|' ORDER BY chave)) FROM chapas_2026 ch")
    assert.equal(ok("SET ROLE anon; SELECT count(*) FROM chapas_2026_publico; RESET ROLE;"), "2", "baseline reproduces historical chapa still public")
    ok(file("supabase/migrations/20260905230739_chapas_publicas_titular_publico.sql"))
    for (const role of ["anon", "authenticated"]) assert.equal(ok(`SET ROLE ${role}; SELECT string_agg(chave,',') FROM chapas_2026_publico; RESET ROLE;`), "active")
    assert.equal(ok("SELECT md5(string_agg(to_jsonb(ch)::text,'|' ORDER BY chave)) FROM chapas_2026 ch"), before)
    ok(file("supabase/readback/20260905230739_chapas_publicas_titular_publico.readback.sql"))
    ok("REVOKE SELECT ON candidatos_publico FROM anon")
    assert.notEqual(q(file("supabase/readback/20260905230739_chapas_publicas_titular_publico.readback.sql")).status, 0, "readback exercises dependent permissions as anon")
    ok("GRANT SELECT ON candidatos_publico TO anon")
    const exactView = ok("SELECT pg_get_viewdef('public.chapas_2026_publico'::regclass,true)")
    ok(`CREATE OR REPLACE VIEW chapas_2026_publico WITH(security_invoker=true) AS ${exactView.replace('ch.titular_nome_urna,', 'NULL::text AS titular_nome_urna,')}`)
    assert.notEqual(q(file("supabase/readback/20260905230739_chapas_publicas_titular_publico.readback.sql")).status, 0, "readback rejects projection drift with unchanged key set")
    ok(`CREATE OR REPLACE VIEW chapas_2026_publico WITH(security_invoker=true) AS ${exactView}`)
    ok("ALTER VIEW chapas_2026_publico SET(security_invoker=false)")
    assert.notEqual(q(file("supabase/readback/20260905230739_chapas_publicas_titular_publico.readback.sql")).status, 0)
    assert.notEqual(q(file("supabase/rollback/20260905230739_chapas_publicas_titular_publico.rollback.sql")).status, 0, "rollback refuses intervening security drift")
    ok("ALTER VIEW chapas_2026_publico SET(security_invoker=true)")
    ok(file("supabase/rollback/20260905230739_chapas_publicas_titular_publico.rollback.sql"))
    assert.equal(ok("SET ROLE anon; SELECT count(*) FROM chapas_2026_publico; RESET ROLE;"), "2")
    assert.equal(ok("SELECT md5(string_agg(to_jsonb(ch)::text,'|' ORDER BY chave)) FROM chapas_2026 ch"), before)
    assert.notEqual(q(file("supabase/readback/20260905230739_chapas_publicas_titular_publico.readback.sql")).status, 0, "readback rejects baseline missing publication predicate")
    ok("ALTER VIEW chapas_2026_publico SET(security_invoker=false)")
    assert.notEqual(q(file("supabase/migrations/20260905230739_chapas_publicas_titular_publico.sql")).status, 0, "forward refuses unexpected view state")
  } finally {
    assert.equal(run(["stop", id]).status, 0)
  }
})
