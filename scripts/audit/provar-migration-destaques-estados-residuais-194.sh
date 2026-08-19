#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD="supabase/migrations/20260811101000_destaques_estados_residuais_194.sql"
RBK="supabase/rollback/20260811101000_destaques_estados_residuais_194.rollback.sql"
READBACK="supabase/readback/20260811101000_destaques_estados_residuais_194.readback.sql"
MANIFESTO="QA/evidencias/2026-08-11-itens-4-14-destaques/matriz-fontes-194.json"
C="pf-destaques-residuais-$$"
C_C="${C}-c"

limpar() { docker rm -f "$C" "$C_C" >/dev/null 2>&1 || true; }
trap limpar EXIT INT TERM
docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null || exit 1
pronto=0
for _ in $(seq 1 90); do
  if docker exec "$C" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 &&
     docker exec "$C" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    pronto=1
    break
  fi
  sleep 1
done
[[ "$pronto" == 1 ]] || { echo "FAIL: postgres nao ficou pronto"; exit 1; }
q() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
aplicar() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction -f -; }

q <<'SQL' >/dev/null
create extension if not exists "pgcrypto";
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
create table public.candidatos(id uuid primary key default gen_random_uuid(), slug text unique not null);
create view public.candidatos_publico as select id,slug from public.candidatos;
create table public.coleta_log(
 id bigint generated always as identity primary key, fonte text not null, escopo text not null,
 alvo text not null, candidato_id uuid references public.candidatos(id), executado_em timestamptz not null,
 resultado text not null check(resultado in ('encontrado','vazio_confirmado','sem_achado_no_escopo','indeterminado','erro','nao_aplicavel')),
 volume integer not null, detalhe text, url text, execucao text, natureza text not null default 'coleta'
);
SQL

popular() {
  local limite="$1"
  node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const n=Number(process.argv[2]);const s=[...new Set(m.celulas.map(x=>x.slug))].sort().slice(0,n);for(const x of s)console.log(`insert into public.candidatos(slug) values (\x27${x.replaceAll("\x27","\x27\x27")}\x27);`)' "$MANIFESTO" "$limite" | q >/dev/null
}
zerar() { q -c "truncate public.coleta_log,public.candidatos restart identity cascade; delete from supabase_migrations.schema_migrations" >/dev/null; }

FALHAS=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FALHAS=$((FALHAS+1)); }
igual() { [[ "$2" == "$3" ]] && pass "$1 ($2)" || fail "$1: esperado $3, observado $2"; }

echo "F0: universo vazio aborta"
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
[[ "$rc" != 0 && "$saida" == *"universo publico 0, esperado 194"* ]] && pass "guard vazio" || fail "guard vazio rc=$rc"
igual "zero escrita" "$(q -c 'select count(*) from public.coleta_log')" "0"

echo "F1: universo 193 aborta"
zerar; popular 193
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
[[ "$rc" != 0 && "$saida" == *"universo publico 193, esperado 194"* ]] && pass "guard 193" || fail "guard 193 rc=$rc"
igual "zero escrita parcial" "$(q -c 'select count(*) from public.coleta_log')" "0"

echo "F2: carga exata e readback"
zerar; popular 194
aplicar < "$FWD" >/dev/null; rc=$?
igual "aplicacao" "$rc" "0"
igual "292 linhas" "$(q -c "select count(*) from public.coleta_log where execucao='migration:20260811101000'")" "292"
igual "zero vazio fabricado" "$(q -c "select count(*) from public.coleta_log where resultado='vazio_confirmado'")" "0"
q -c "insert into supabase_migrations.schema_migrations values ('20260811101000')" >/dev/null
igual "readback pré-split" "$(q -f - < "$READBACK")" "1|0|292|180|80|32|180|241|51|0|456ba86bfc5de2cc7a51714f4cef0f8c"

echo "F2a: readback recusa detalhe adulterado com cardinalidade constante"
id_mutado="$(q -c "select id from public.coleta_log where execucao='migration:20260811101000' and detalhe is not null order by id limit 1")"
q -c "update public.coleta_log set detalhe=detalhe || ' [adulterado]' where id=$id_mutado" >/dev/null
saida="$(aplicar < "$READBACK" 2>&1)"; rc=$?
[[ "$rc" != 0 && "$saida" == *"assinatura_payload"* ]] && pass "readback payload fail-closed" || fail "readback payload rc=$rc"
igual "adulteracao preservada" "$(q -c "select count(*) from public.coleta_log where id=$id_mutado and detalhe like '% [adulterado]'")" "1"
igual "ledger preservado" "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260811101000'")" "1"
q -c "update public.coleta_log set detalhe=regexp_replace(detalhe, ' \\[adulterado\\]$', '') where id=$id_mutado" >/dev/null
igual "readback restaurado" "$(q -f - < "$READBACK")" "1|0|292|180|80|32|180|241|51|0|456ba86bfc5de2cc7a51714f4cef0f8c"

echo "F2b: assinatura pós-split depende do ledger 102100"
id_orleans="$(q -c "select id from public.candidatos where slug='orleans-brandao'")"
q -c "update public.candidatos set slug='carlos-brandao-ma-historico' where id='$id_orleans'; insert into public.candidatos(slug) values ('orleans-brandao'); insert into supabase_migrations.schema_migrations values ('20260811102100')" >/dev/null
igual "readback pós-split" "$(q -f - < "$READBACK")" "1|1|292|180|80|32|180|241|51|0|95cc5a76055102f6b8684ad33818d731"

echo "F2c: split sem ledger é recusado"
q -c "delete from supabase_migrations.schema_migrations where version='20260811102100'" >/dev/null
saida="$(aplicar < "$READBACK" 2>&1)"; rc=$?
[[ "$rc" != 0 && "$saida" == *"assinatura_payload"* ]] && pass "split sem ledger fail-closed" || fail "split sem ledger rc=$rc"
q -c "insert into supabase_migrations.schema_migrations values ('20260811102100')" >/dev/null
igual "readback pós-split restaurado" "$(q -f - < "$READBACK")" "1|1|292|180|80|32|180|241|51|0|95cc5a76055102f6b8684ad33818d731"
q -c "delete from public.candidatos where slug='orleans-brandao'; update public.candidatos set slug='orleans-brandao' where id='$id_orleans'; delete from supabase_migrations.schema_migrations where version='20260811102100'" >/dev/null
igual "readback pré-split restaurado" "$(q -f - < "$READBACK")" "1|0|292|180|80|32|180|241|51|0|456ba86bfc5de2cc7a51714f4cef0f8c"

echo "F3: reaplicacao aborta"
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
[[ "$rc" != 0 && "$saida" == *"execucao ja tem 292"* ]] && pass "reapply fail-closed" || fail "reapply rc=$rc"

echo "F4: estado posterior aborta"
zerar; popular 194
q -c "insert into public.coleta_log(fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe) select 'destaques-votacoes','candidato',slug,id,'2026-08-11T16:00:00Z','erro',0,'posterior' from public.candidatos where slug='andre-luis'" >/dev/null
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
[[ "$rc" != 0 && "$saida" == *"verificacao(oes) igual(is) ou posterior(es)"* ]] && pass "stale fail-closed" || fail "stale rc=$rc"

echo "R1: rollback alterado aborta"
zerar; popular 194; aplicar < "$FWD" >/dev/null
q -c "insert into supabase_migrations.schema_migrations values ('20260811101000'); update public.coleta_log set detalhe='posterior' where id=(select min(id) from public.coleta_log)" >/dev/null
saida="$(aplicar < "$RBK" 2>&1)"; rc=$?
[[ "$rc" != 0 && "$saida" == *"rollback recusado"* ]] && pass "rollback mutado fail-closed" || fail "rollback mutado rc=$rc"

echo "R2: rollback exato"
zerar; popular 194; aplicar < "$FWD" >/dev/null
q -c "insert into supabase_migrations.schema_migrations values ('20260811101000')" >/dev/null
aplicar < "$RBK" >/dev/null; rc=$?
igual "rollback" "$rc" "0"
igual "remove 292" "$(q -c 'select count(*) from public.coleta_log')" "0"
igual "remove ledger" "$(q -c 'select count(*) from supabase_migrations.schema_migrations')" "0"

echo "F2b: readback identico em cluster com locale C"
docker run -d --name "$C_C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres \
  -e POSTGRES_INITDB_ARGS='--locale=C' "$IMG" >/dev/null || exit 1
pronto_c=0
for _ in $(seq 1 90); do
  if docker exec "$C_C" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 &&
     docker exec "$C_C" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    pronto_c=1
    break
  fi
  sleep 1
done
[[ "$pronto_c" == 1 ]] || { echo "FAIL: postgres locale C nao ficou pronto"; exit 1; }
qc() { docker exec -i "$C_C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
aplicar_c() { docker exec -i "$C_C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction -f -; }
qc <<'SQL' >/dev/null
create extension if not exists "pgcrypto";
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
create table public.candidatos(id uuid primary key default gen_random_uuid(), slug text unique not null);
create view public.candidatos_publico as select id,slug from public.candidatos;
create table public.coleta_log(
 id bigint generated always as identity primary key, fonte text not null, escopo text not null,
 alvo text not null, candidato_id uuid references public.candidatos(id), executado_em timestamptz not null,
 resultado text not null check(resultado in ('encontrado','vazio_confirmado','sem_achado_no_escopo','indeterminado','erro','nao_aplicavel')),
 volume integer not null, detalhe text, url text, execucao text, natureza text not null default 'coleta'
);
SQL
node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const s=[...new Set(m.celulas.map(x=>x.slug))].sort();for(const x of s)console.log(`insert into public.candidatos(slug) values (\x27${x.replaceAll("\x27","\x27\x27")}\x27);`)' "$MANIFESTO" | qc >/dev/null
aplicar_c < "$FWD" >/dev/null
qc -c "insert into supabase_migrations.schema_migrations values ('20260811101000')" >/dev/null
igual "readback locale C pré-split" "$(qc -f - < "$READBACK")" "1|0|292|180|80|32|180|241|51|0|456ba86bfc5de2cc7a51714f4cef0f8c"
id_orleans_c="$(qc -c "select id from public.candidatos where slug='orleans-brandao'")"
qc -c "update public.candidatos set slug='carlos-brandao-ma-historico' where id='$id_orleans_c'; insert into public.candidatos(slug) values ('orleans-brandao'); insert into supabase_migrations.schema_migrations values ('20260811102100')" >/dev/null
igual "readback locale C pós-split" "$(qc -f - < "$READBACK")" "1|1|292|180|80|32|180|241|51|0|95cc5a76055102f6b8684ad33818d731"

[[ "$FALHAS" == 0 ]] || exit 1
echo "PASS: 12 cenarios, 22 assercoes"
