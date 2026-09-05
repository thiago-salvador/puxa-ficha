import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import test from "node:test"

interface Alvo {
  tabela: string; id: string; candidato_id: string; slug: string; nome_completo: string
  sq: string; situacao: string; cargo_candidato: string; uf_candidato: string
  ano?: number; fim?: number; tipo?: string; cargo?: string; estado?: string; proveniencia?: string
  antes: string; depois: string
}

test("SQL e drivers reais em PG17: lote188, preimagem, rollback CAS e schema medido", { skip: process.env.PF_PROVAR_TEXTOS_JULGAMENTO_PG17 !== "1" }, () => {
  const root = process.cwd()
  const image = "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
  const targets = JSON.parse(readFileSync("scripts/audit/dados-textos-julgamento-20260905.json", "utf8")) as Alvo[]
  const base = "20260905150000_corrigir_textos_julgamento"
  const file = (p: string) => readFileSync(p, "utf8")
  const migration = file(`supabase/migrations/${base}.sql`)
  const rb = file(`supabase/rollback/${base}.rollback.sql`)
  const readback = file(`supabase/readback/${base}.readback.sql`)
  const rbReadback = file(`supabase/readback/${base}.rollback.readback.sql`)
  const schema = file("tests/fixtures/textos-julgamento-schema.sql")
  assert.equal(createHash("sha256").update(schema).digest("hex"), "9addc67f78838d0072daffb9c3f80a17cc120d28768947527ea17463b3d807c4")
  const run = (cmd: string, args: string[], input?: string, env = process.env) => spawnSync(cmd, args, { cwd: root, env, input, encoding: "utf8", timeout: 90_000, maxBuffer: 16 * 1024 * 1024 })
  const started = run("docker", ["run", "-d", "--rm", "-e", "POSTGRES_PASSWORD=fixture", "-v", `${root}:${root}:ro`, image])
  assert.equal(started.status, 0, started.stderr)
  const container = started.stdout.trim()
  const q = (sql: string) => run("docker", ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], sql)
  const ok = (sql: string) => { const r = q(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim() }
  const fail = (sql: string, pattern: RegExp) => { const r = q(sql); assert.notEqual(r.status, 0); assert.match(r.stderr, pattern) }
  const lit = (v: unknown): string => v == null ? "NULL" : "'" + String(v).replaceAll("'", "''") + "'"
  const hashRows = () => ok("select md5((select string_agg(to_jsonb(c)::text,'|' order by id) from candidatos c)||(select string_agg(to_jsonb(h)::text,'|' order by id) from historico_politico h))")
  const hashUntouched = () => ok("select md5((select string_agg((to_jsonb(c)-'biografia')::text,'|' order by id) from candidatos c)||(select string_agg((to_jsonb(h)-'observacoes')::text,'|' order by id) from historico_politico h))")
  const first = targets.find(x => x.tabela === "candidatos")!
  const last = targets.at(-1)!
  try {
    assert.equal(run("docker", ["exec", container, "bash", "-c", "for i in {1..60}; do pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && psql -U postgres -h 127.0.0.1 -Atqc 'select 1' >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"]).status, 0)
    ok(schema)
    ok("create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text,rollback text[])")
    const previousDigest = createHash("sha256").update(file("supabase/migrations/20260904220000_corrigir_profissao_alvaro_dias_rn.sql")).digest("hex")
    ok(`insert into supabase_migrations.schema_migrations(version,idempotency_key) values('20260904220000','sha256:${previousDigest}')`)
    ok(migration)
    assert.equal(ok("select count(*) from coleta_log"), "0", "replay vazio não deixa recibo")
    const candidateSql = (a: Alvo) => {
      const bio = targets.find(x => x.tabela === "candidatos" && x.id === a.candidato_id)?.antes ?? "Fixture sintética para CHECK de publicação"
      return `insert into candidatos(id,slug,nome_completo,nome_urna,sq_candidato_2026,cargo_disputado,estado,situacao_candidatura,partido_atual,partido_sigla,publicavel,status,foto_url,biografia,naturalidade,data_nascimento,formacao,profissao_declarada,genero,estado_civil,cor_raca,verificacao_campos,ultima_atualizacao)
        values(${lit(a.candidato_id)},${lit(a.slug)},${lit(a.nome_completo)},${lit(a.nome_completo)},${lit(a.sq)},${lit(a.cargo_candidato)},${lit(a.uf_candidato)},${lit(a.situacao)},'Fixture','FIX',true,'candidato','https://example.test/foto',${lit(bio)},'Fixture','2000-01-01','Fixture','Fixture','Fixture','Fixture','Fixture','{"candidate_registration":"fixture","candidate_complement":"fixture"}','2026-09-01T00:00:00Z');`
    }
    ok(candidateSql(first))
    fail(migration, /identidade|historico/)
    assert.equal(ok("select count(*) from coleta_log"), "0", "coorte parcial aborta antes de recibo")
    const candidates = [...new Map(targets.map(x => [x.candidato_id, x])).values()]
    ok(candidates.filter(x => x.candidato_id !== first.candidato_id).map(candidateSql).join("\n"))
    ok(targets.filter(x => x.tabela === "historico_politico").map(a => `insert into historico_politico(id,candidato_id,cargo,estado,periodo_inicio,periodo_fim,tipo_evento,proveniencia,observacoes) values(${lit(a.id)},${lit(a.candidato_id)},${lit(a.cargo)},${lit(a.estado)},${lit(a.ano)},${lit(a.fim)},${lit(a.tipo)},${lit(a.proveniencia)},${lit(a.antes)});`).join("\n"))
    const before = hashRows(), untouched = hashUntouched()
    ok(`update candidatos set publicavel=false where id=${lit(first.id)}`)
    fail(migration, /identidade/)
    assert.equal(ok("select count(*) from coleta_log"), "0")
    ok(`update candidatos set publicavel=true where id=${lit(first.id)}`)
    ok(`update historico_politico set periodo_inicio=2009 where id=${lit(last.id)}`)
    fail(migration, /historico/)
    assert.equal(ok("select count(*) from coleta_log"), "0")
    ok(`update historico_politico set periodo_inicio=${lit(last.ano)} where id=${lit(last.id)}`)
    // Um único elemento divergente impede todos os 188 writes.
    for (const [column, wrong, original] of [["sq_candidato_2026","123456789",first.sq],["situacao_candidatura","aguardando julgamento",first.situacao],["estado","ZZ",first.uf_candidato]]) {
      ok(`update candidatos set ${column}=${lit(wrong)} where id=${lit(first.id)}`)
      fail(migration, /identidade/)
      assert.equal(ok("select count(*) from coleta_log"), "0")
      ok(`update candidatos set ${column}=${lit(original)} where id=${lit(first.id)}`)
    }
    ok(`update historico_politico set observacoes='ALTERADO' where id=${lit(last.id)}`)
    fail(migration, /pre\/postestado/)
    assert.equal(ok("select count(*) from coleta_log"), "0")
    ok(`update historico_politico set observacoes=${lit(last.antes)} where id=${lit(last.id)}`)
    // Falha tardia de trigger prova rollback atômico de recibo e writes anteriores.
    ok(`create function public.prova_rejeitar() returns trigger language plpgsql as $$ begin if NEW.id=${lit(last.id)}::uuid then raise exception 'prova falha tardia'; end if; return NEW; end $$; create trigger prova_rejeitar before update of observacoes on historico_politico for each row execute function public.prova_rejeitar();`)
    fail(migration, /prova falha tardia/)
    assert.equal(hashRows(), before)
    assert.equal(ok("select count(*) from coleta_log"), "0")
    ok("drop trigger prova_rejeitar on historico_politico; drop function public.prova_rejeitar()")
    ok("insert into coleta_log(fonte,escopo,alvo,resultado,volume,execucao,natureza) select 'fixture','global','fixture','encontrado',188,'migration:20260905150000','escrita' from generate_series(1,2)")
    fail(migration, /recibo duplicado/)
    assert.equal(hashRows(), before)
    ok("delete from coleta_log")
    fail(readback, /recibo ausente/)
    // Shims só transportam o driver real ao container privado; nenhum endpoint remoto é usado.
    const bin = mkdtempSync(resolve(tmpdir(), "pf-textos-drivers-"))
    writeFileSync(resolve(bin,"git"), '#!/bin/sh\ncase "$1" in\nrev-parse) printf "%s\\n" "$PF_EXPECTED_SHA";;\nstatus) exit 0;;\nls-remote) printf "%s\\trefs/heads/main\\n" "$PF_EXPECTED_SHA";;\n*) exit 2;;\nesac\n', {mode:0o700})
    writeFileSync(resolve(bin,"psql"), '#!/bin/sh\nexec docker exec -i "$PF_PROVA_CONTAINER" psql -U postgres -d postgres "$@"\n', {mode:0o700})
    const env = {...process.env,PATH:`${bin}:${process.env.PATH}`,PF_DATABASE_URL:"postgresql://postgres:fixture@db.wskpzsobvqwhnbsdsmok.supabase.co:5432/postgres",PF_EXPECTED_SHA:"a".repeat(40),GITHUB_REF:"refs/heads/main",PF_PROVA_CONTAINER:container}
    const driver = (mode: string) => run("bash",[`scripts/audit/${mode}-textos-julgamento-production.sh`],undefined,env)
    let result = driver("apply"); assert.equal(result.status,0,result.stderr)
    assert.equal(hashUntouched(),untouched,"somente os campos-alvo mudam, timestamps preservados")
    ok(readback)
    const after = hashRows()
    result = driver("apply"); assert.equal(result.status,0,result.stderr)
    assert.equal(hashRows(),after)
    assert.equal(ok("select count(*) from coleta_log where execucao='migration:20260905150000'"),"1")
    ok("update coleta_log set detalhe=jsonb_set(detalhe::jsonb,'{preimagem,0,valor}','\"adulterado\"')::text where execucao='migration:20260905150000'")
    fail(readback,/preimagem adulterada/)
    assert.notEqual(driver("rollback").status,0)
    ok(`update coleta_log set detalhe=jsonb_set(detalhe::jsonb,'{preimagem,0,valor}',to_jsonb(${lit(targets[0].antes)}::text))::text where execucao='migration:20260905150000'`)
    ok(`update candidatos set biografia='Mudança editorial posterior' where id=${lit(first.id)}`)
    fail(rb,/mudanca posterior/)
    ok(`update candidatos set biografia=${lit(first.depois)} where id=${lit(first.id)}`)
    // Mudanças de outros campos não são desfeitas pelo rollback do texto.
    ok(`update candidatos set profissao_declarada='OUTRO CAMPO POSTERIOR' where id=${lit(first.id)}`)
    result=driver("rollback"); assert.equal(result.status,0,result.stderr)
    ok(rbReadback)
    assert.equal(ok(`select profissao_declarada from candidatos where id=${lit(first.id)}`),"OUTRO CAMPO POSTERIOR")
    ok(`update candidatos set profissao_declarada='Fixture' where id=${lit(first.id)}`)
    assert.equal(hashRows(),before,"pré-imagem literal completa e timestamps voltam idênticos")
    assert.notEqual(driver("apply").status,0,"receipt preservado impede novo apply após rollback")
  } finally { run("docker",["stop",container]) }
})
