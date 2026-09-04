import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import test from "node:test"

// Execução separada: o teste comum não sobe Docker. O workflow chama o prover.
test("drivers reais em PG17: schema medido, CAS, ledger, readback, rollback e replay", { skip: process.env.PF_PROVAR_PROFISSAO_PG17 !== "1" }, () => {
  const root = process.cwd()
  const image = "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
  const version = "20260904220000"
  const previous = "20260903220000"
  const name = "corrigir_profissao_alvaro_dias_rn"
  const migration = `supabase/migrations/${version}_${name}.sql`
  const readback = `supabase/readback/${version}_${name}.readback.sql`
  const rbReadback = `supabase/readback/${version}_${name}.rollback.readback.sql`
  const schema = readFileSync("tests/fixtures/profissao-tse-2026-schema.sql", "utf8")
  assert.equal(createHash("sha256").update(schema).digest("hex"), "419b990c6cfef823451be1fee308cc8e1d1bda0726c9cd12276efafb5fb84b73", "contrato extraído da fonte real deve permanecer íntegro")
  const run = (cmd: string, args: string[], input?: string, env = process.env) => spawnSync(cmd, args, { cwd: root, env, input, encoding: "utf8", timeout: 90_000 })
  const started = run("docker", ["run", "-d", "--rm", "-e", "POSTGRES_PASSWORD=fixture", "-v", `${root}:${root}:ro`, image])
  assert.equal(started.status, 0, started.stderr)
  const container = started.stdout.trim()
  const q = (sql: string) => run("docker", ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], sql)
  const ok = (sql: string) => { const r = q(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim() }
  const fail = (sql: string, pattern: RegExp) => { const r = q(sql); assert.notEqual(r.status, 0); assert.match(r.stderr, pattern) }
  const file = (path: string) => readFileSync(path, "utf8")
  const beforeHash = () => ok("select md5(string_agg(to_jsonb(c)::text,'|' order by slug)) from public.candidatos c")
  try {
    const ready = run("docker", ["exec", container, "bash", "-c", "for i in {1..60}; do pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && psql -U postgres -h 127.0.0.1 -Atqc 'select 1' >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"])
    assert.equal(ready.status, 0, ready.stderr)
    ok(schema)
    ok("create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text,rollback text[])")
    const predecessorHash = createHash("sha256").update(readFileSync(`supabase/migrations/${previous}_despublicar_alvaro_dias_rn_homonimo.sql`)).digest("hex")
    ok(`insert into supabase_migrations.schema_migrations(version,idempotency_key) values('${previous}','sha256:${predecessorHash}')`)
    // Ausência em replay não cria recibo fantasma.
    ok(file(migration))
    assert.equal(ok(`select count(*) from coleta_log where execucao='migration:${version}'`), "0")
    // Dados sintéticos necessários ao CHECK real; não são fatos publicados.
    ok(`insert into candidatos(id,slug,nome_completo,nome_urna,cargo_disputado,estado,sq_candidato_2026,profissao_declarada,partido_atual,partido_sigla,publicavel,status,foto_url,biografia,naturalidade,data_nascimento,formacao,genero,estado_civil,cor_raca,situacao_candidatura,verificacao_campos,ultima_atualizacao)
      values('c89aaf3b-a9a7-4a95-856a-5b65df38cc80','alvaro-dias-rn','Alvaro Costa Dias','Alvaro Dias','Governador','RN','200002534442','SENADOR','fixture','FIX',true,'candidato','https://example.test/foto','fixture','fixture','2000-01-01','fixture','fixture','fixture','fixture','aguardando julgamento','{"candidate_registration":"fixture","candidate_complement":"fixture"}','2026-08-29 23:21:37.891653+00'),
      ('00000000-0000-4000-8000-000000000002','controle','Controle','Controle','Governador','SP',null,'Professora','fixture','FIX',false,'pre-candidato',null,null,null,null,null,null,null,null,null,'{}','2026-08-01 12:00:00+00')`)
    const before = beforeHash()
    fail(file(readback), /recibo ausente/)
    // Shims trocam apenas transporte e Git; drivers e SQL são os de produção.
    // Nenhuma URL real é acessada: psql sempre executa no container criado acima.
    const bin = mkdtempSync(resolve(tmpdir(), "pf-profissao-drivers-"))
    writeFileSync(resolve(bin, "git"), '#!/bin/sh\ncase "$1" in\nrev-parse) printf "%s\\n" "$PF_EXPECTED_SHA";;\nstatus) exit 0;;\nls-remote) printf "%s\\trefs/heads/main\\n" "$PF_EXPECTED_SHA";;\n*) echo "git inesperado" >&2; exit 2;;\nesac\n', { mode: 0o700 })
    writeFileSync(resolve(bin, "psql"), '#!/bin/sh\nexec docker exec -i "$PF_PROVA_CONTAINER" psql -U postgres -d postgres "$@"\n', { mode: 0o700 })
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PF_DATABASE_URL: "postgresql://postgres:fixture@db.wskpzsobvqwhnbsdsmok.supabase.co:5432/postgres", PF_EXPECTED_SHA: "a".repeat(40), GITHUB_REF: "refs/heads/main", PF_PROVA_CONTAINER: container }
    const driver = (mode: "apply" | "rollback") => run("bash", [`scripts/audit/${mode}-profissao-alvaro-dias-rn-production.sh`], undefined, env)
    let result = driver("apply")
    assert.equal(result.status, 0, result.stderr)
    assert.equal(ok("select profissao_declarada from candidatos_publico where slug='alvaro-dias-rn'"), "MÉDICO")
    assert.equal(ok(`select count(*) from coleta_log where execucao='migration:${version}'`), "1")
    result = driver("apply")
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /ja aplicada/)
    assert.equal(ok(`select count(*) from coleta_log where execucao='migration:${version}'`), "1")
    const appliedTime = ok("select ultima_atualizacao from candidatos where slug='alvaro-dias-rn'")
    ok("update candidatos set profissao_declarada='ADVOGADO' where slug='alvaro-dias-rn'")
    fail(file(readback), /posestado/)
    assert.notEqual(driver("rollback").status, 0)
    ok("update candidatos set profissao_declarada='MÉDICO',ultima_atualizacao=ultima_atualizacao+interval '1 second' where slug='alvaro-dias-rn'")
    assert.notEqual(driver("rollback").status, 0, "timestamp posterior bloqueia rollback")
    ok(`update candidatos set ultima_atualizacao='${appliedTime}' where slug='alvaro-dias-rn'`)
    ok("update candidatos set nome_urna='Alteração posterior' where slug='alvaro-dias-rn'")
    assert.notEqual(driver("rollback").status, 0, "outro campo posterior também bloqueia")
    ok("update candidatos set nome_urna='Alvaro Dias' where slug='alvaro-dias-rn'")
    ok("insert into supabase_migrations.schema_migrations(version) values('20260905220000')")
    assert.notEqual(driver("rollback").status, 0, "migration posterior bloqueia rollback")
    ok("delete from supabase_migrations.schema_migrations where version='20260905220000'")
    ok(`update supabase_migrations.schema_migrations set idempotency_key='sha256:errado' where version='${previous}'`)
    assert.notEqual(driver("rollback").status, 0, "digest predecessor divergente bloqueia antes da escrita")
    ok(`update supabase_migrations.schema_migrations set idempotency_key='sha256:${predecessorHash}' where version='${previous}'`)
    result = driver("rollback")
    assert.equal(result.status, 0, result.stderr)
    ok(file(rbReadback))
    assert.equal(beforeHash(), before, "rollback restaura todas as colunas byte a byte, inclusive controle e timestamps")
    result = driver("apply")
    assert.notEqual(result.status, 0, "novo apply após rollback exige decisão/nova migration")
    assert.match(result.stderr, /recibo\/posestado divergiu/)
    assert.equal(beforeHash(), before)
    assert.equal(ok(`select count(*) from supabase_migrations.schema_migrations where version='${version}'`), "0", "falha reverte ledger atomicamente")
    // Guard de identidade e preestado antes da captura do recibo.
    ok("delete from coleta_log; update candidatos set sq_candidato_2026='200002534443' where slug='alvaro-dias-rn'")
    fail(file(migration), /identidade\/publicacao/)
    assert.equal(ok("select count(*) from coleta_log"), "0")
    ok("update candidatos set sq_candidato_2026='200002534442',profissao_declarada='ADVOGADO' where slug='alvaro-dias-rn'")
    fail(file(migration), /preestado/)
    assert.equal(ok("select count(*) from coleta_log"), "0")
  } finally {
    run("docker", ["stop", container])
  }
})
