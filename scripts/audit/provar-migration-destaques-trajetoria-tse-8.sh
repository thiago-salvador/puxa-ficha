#!/usr/bin/env bash
# Prova comportamental da migration TSE-8 e de seu rollback em Postgres 17.
# Não toca Supabase nem qualquer ambiente remoto.
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD="supabase/migrations/20260810124000_destaques_trajetoria_tse_8.sql"
RBK="supabase/rollback/20260810124000_destaques_trajetoria_tse_8.rollback.sql"
READBACK="supabase/readback/20260810124000_destaques_trajetoria_tse_8.readback.sql"
C="pf-destaques-tse8-$$"

limpar() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap limpar EXIT INT TERM

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null || {
  echo "FAIL: docker nao subiu"; exit 1;
}
pronto=0
for _ in $(seq 1 90); do
  if docker exec "$C" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    pronto=1; break
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
create view public.candidatos_publico as select id, slug from public.candidatos;
create table public.coleta_log(
  id bigint generated always as identity primary key,
  fonte text not null,
  escopo text not null,
  alvo text not null,
  candidato_id uuid references public.candidatos(id),
  executado_em timestamptz not null default now(),
  resultado text not null check (resultado in ('encontrado','vazio_confirmado','sem_achado_no_escopo','indeterminado','erro','nao_aplicavel')),
  volume integer not null,
  detalhe text,
  url text,
  execucao text,
  natureza text not null default 'coleta'
);
SQL

SLUGS=(andre-marinho dr-luisinho henrique-areas izadora-dias jose-estevao luan-monteiro preta-lu samara-mineiro)
popular() {
  local limite="$1"
  local i
  for ((i=0; i<limite; i++)); do
    q -c "insert into public.candidatos(slug) values ('${SLUGS[$i]}');" >/dev/null
  done
}
zerar() {
  q -c "truncate public.coleta_log, public.candidatos restart identity cascade; delete from supabase_migrations.schema_migrations;" >/dev/null
}

FALHAS=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FALHAS=$((FALHAS + 1)); }
igual() { [[ "$2" == "$3" ]] && pass "$1 ($2)" || fail "$1: esperado $3, observado $2"; }

echo "F0: universo vazio aborta"
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 ]] && grep -q "esperadas 8 fichas publicas, encontradas 0" <<<"$saida"; then pass "guard do universo vazio"; else fail "guard do universo vazio rc=$rc"; fi
igual "zero escrita apos aborto" "$(q -c "select count(*) from public.coleta_log")" "0"

echo "F1: universo incompleto aborta"
zerar
popular 7
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 ]] && grep -q "esperadas 8 fichas publicas, encontradas 7" <<<"$saida"; then pass "guard 7 de 8"; else fail "guard 7 de 8 rc=$rc"; fi
igual "zero escrita no universo incompleto" "$(q -c "select count(*) from public.coleta_log")" "0"

echo "F2: carga exata e readback"
zerar
popular 8
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
igual "aplicacao exata" "$rc" "0"
igual "oito linhas limitadas" "$(q -c "select count(*) from public.coleta_log where resultado='sem_achado_no_escopo' and volume=0 and natureza='coleta'")" "8"
igual "nenhum vazio confirmado" "$(q -c "select count(*) from public.coleta_log where resultado='vazio_confirmado'")" "0"
igual "duas fontes multiano sem URL singular falsa" "$(q -c "select count(*) from public.coleta_log where alvo in ('henrique-areas','luan-monteiro') and url is null")" "2"
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260810124000');" >/dev/null
igual "readback exato" "$(q -f - < "$READBACK")" "1|8|8|0|8|0|0|0|{andre-marinho,dr-luisinho,henrique-areas,izadora-dias,jose-estevao,luan-monteiro,preta-lu,samara-mineiro}"

echo "F3: reapply aborta"
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 ]] && grep -Eq "ja tem 8 linha|verificacao\(oes\)" <<<"$saida"; then pass "reapply fail-closed"; else fail "reapply nao abortou rc=$rc"; fi
igual "reapply preserva oito" "$(q -c "select count(*) from public.coleta_log")" "8"

echo "F4: verificacao posterior aborta promocao obsoleta"
zerar
popular 8
q -c "insert into public.coleta_log(fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe) select 'destaques-trajetoria','candidato',slug,id,'2026-08-11T12:00:00Z','erro',0,'posterior' from public.candidatos where slug='andre-marinho';" >/dev/null
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 ]] && grep -q "posterior(es) a auditoria TSE-8" <<<"$saida"; then pass "stale promotion fail-closed"; else fail "stale promotion nao abortou rc=$rc"; fi
igual "somente verificacao posterior preservada" "$(q -c "select count(*) from public.coleta_log")" "1"

echo "R1: rollback recusa payload alterado"
zerar
popular 8
aplicar < "$FWD" >/dev/null
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260810124000'); update public.coleta_log set detalhe='curadoria posterior' where alvo='andre-marinho';" >/dev/null
saida="$(aplicar < "$RBK" 2>&1)"; rc=$?
if [[ "$rc" != 0 ]] && grep -q "rollback recusado" <<<"$saida"; then pass "rollback mutado fail-closed"; else fail "rollback mutado nao abortou rc=$rc"; fi
igual "rollback abortado preserva oito" "$(q -c "select count(*) from public.coleta_log")" "8"
igual "rollback abortado preserva ledger" "$(q -c "select count(*) from supabase_migrations.schema_migrations")" "1"

echo "R2: rollback exato remove carga e ledger"
zerar
popular 8
aplicar < "$FWD" >/dev/null
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260810124000');" >/dev/null
saida="$(aplicar < "$RBK" 2>&1)"; rc=$?
igual "rollback exato" "$rc" "0"
igual "rollback remove oito" "$(q -c "select count(*) from public.coleta_log")" "0"
igual "rollback remove ledger" "$(q -c "select count(*) from supabase_migrations.schema_migrations")" "0"

if [[ "$FALHAS" -ne 0 ]]; then
  echo "FAIL: $FALHAS ramo(s)"; exit 1
fi
echo "PASS: 7 cenarios e 17 assercoes"
