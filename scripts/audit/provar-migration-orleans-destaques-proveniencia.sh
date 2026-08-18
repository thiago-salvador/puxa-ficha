#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD="supabase/migrations/20260812124000_orleans_destaques_proveniencia.sql"
RBK="supabase/rollback/20260812124000_orleans_destaques_proveniencia.rollback.sql"
READBACK="supabase/readback/20260812124000_orleans_destaques_proveniencia.readback.sql"
C="pf-orleans-destaques-$$"
trap 'docker rm -f "$C" >/dev/null 2>&1 || true' EXIT

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres "$IMG" >/dev/null
for _ in {1..30}; do docker exec "$C" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
q(){ docker exec -i "$C" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
qtx(){ docker exec -i "$C" psql -X -v ON_ERROR_STOP=1 --single-transaction -U postgres -d postgres "$@"; }

q >/dev/null <<'SQL'
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key, name text, statements text[]);
create table candidatos(
 id uuid primary key, slug text unique not null, nome_completo text not null,
 data_nascimento date, status text not null, publicavel boolean not null
);
create view candidatos_publico as select * from candidatos where status<>'removido' and publicavel=true;
create table coleta_log(
 id bigint generated always as identity primary key, fonte text not null, escopo text not null,
 alvo text not null, candidato_id uuid references candidatos(id), executado_em timestamptz not null,
 resultado text not null check(resultado in ('encontrado','vazio_confirmado','sem_achado_no_escopo','indeterminado','erro','nao_aplicavel')),
 volume integer not null, detalhe text, url text, execucao text, natureza text not null default 'coleta'
);
insert into candidatos values ('b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601','orleans-brandao','Carlos Orleans Braide Brandão','1994-12-08','pre-candidato',true);
insert into supabase_migrations.schema_migrations(version) values ('20260811102100');
SQL

echo "F1: aplicação, ledger e readback exatos"
{ cat "$FWD"; echo "insert into supabase_migrations.schema_migrations(version) values ('20260812124000');"; } | qtx >/dev/null
[[ "$(q -Atq -c "select count(*) from coleta_log where execucao='migration:20260812124000'")" == 5 ]]
[[ "$(q -Atq < "$READBACK")" == "1|5|4|1|0" ]]

echo "F2: readback recusa payload adulterado"
q -c "update coleta_log set detalhe=detalhe||' adulterado' where id=(select min(id) from coleta_log where execucao='migration:20260812124000')" >/dev/null
if q < "$READBACK" >/dev/null 2>&1; then echo "FAIL readback aceitou payload adulterado"; exit 1; fi
q -c "update coleta_log set detalhe=left(detalhe,length(detalhe)-11) where id=(select min(id) from coleta_log where execucao='migration:20260812124000')" >/dev/null

echo "F3: rollback recusa curadoria posterior"
q -c "update coleta_log set detalhe=detalhe||' curadoria posterior' where id=(select max(id) from coleta_log where execucao='migration:20260812124000')" >/dev/null
if q < "$RBK" >/dev/null 2>&1; then echo "FAIL rollback aceitou curadoria posterior"; exit 1; fi
q -c "update coleta_log set detalhe=left(detalhe,length(detalhe)-20) where id=(select max(id) from coleta_log where execucao='migration:20260812124000')" >/dev/null

echo "F4: rollback exato"
q < "$RBK" >/dev/null
[[ "$(q -Atq -c "select count(*) from coleta_log where execucao='migration:20260812124000'")" == 0 ]]
[[ "$(q -Atq -c "select count(*) from supabase_migrations.schema_migrations where version='20260812124000'")" == 0 ]]
echo "PASS: Orleans, cinco estados explícitos, readback e rollback fail-closed"
