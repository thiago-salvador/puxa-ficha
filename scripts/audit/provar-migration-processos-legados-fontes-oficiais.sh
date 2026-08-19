#!/usr/bin/env bash
# Prova comportamental em Postgres 17 efemero. Nao toca Supabase nem rede.
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD="supabase/migrations/20260811101200_processos_legados_fontes_oficiais.sql"
RBK="supabase/rollback/20260811101200_processos_legados_fontes_oficiais.rollback.sql"
READBACK="supabase/readback/20260811101200_processos_legados_fontes_oficiais.readback.sql"
C="pf-processos-legados-$$"

limpar() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap limpar EXIT INT TERM

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null || {
  echo "FAIL: docker nao subiu"; exit 1;
}
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
create table public.processos(
  id uuid primary key,
  candidato_id uuid not null references public.candidatos(id),
  tipo text not null, tribunal text, numero_processo text, descricao text,
  status text, data_inicio date, data_decisao date, gravidade text,
  fonte text, url_fonte text
);
create table public.coleta_log(
  id bigserial primary key, fonte text not null, escopo text, alvo text,
  candidato_id uuid references public.candidatos(id), resultado text,
  volume integer, detalhe text, url text, executado_em timestamptz default now(),
  execucao text, natureza text not null default 'coleta'
);
SQL

zerar() {
  q -c "truncate public.coleta_log,public.processos,public.candidatos restart identity cascade; delete from supabase_migrations.schema_migrations;" >/dev/null
}

popular() {
  q <<'SQL' >/dev/null || { echo "FAIL: fixture nao carregou"; exit 1; }
insert into public.candidatos(slug) values
  ('flavio-bolsonaro'),('tarcisio-gov-sp'),('haddad-gov-sp'),('felicio-ramuth');

insert into public.processos(id,candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte)
select '9b4b48fa-3b1b-48fb-a195-b6e4139c7a9d'::uuid,id,'criminal','TJ-RJ',null,'Investigado por peculato, lavagem de dinheiro e organizacao criminosa no caso das rachadinhas no gabinete da ALERJ.','em andamento',date '2019-01-01',null::date,'critica','MP-RJ',null from public.candidatos where slug='flavio-bolsonaro'
union all select '18050e24-bd22-43b1-88ac-d3710bcedaf3'::uuid,id,'criminal','Justica Federal',null,'Contratos assinados como diretor do DNIT sob investigacao da PF por suspeita de corrupcao','em_andamento',null,null,'media',null,null from public.candidatos where slug='tarcisio-gov-sp'
union all select 'a964addf-bab0-40cc-88c0-9dd859869fe1'::uuid,id,'eleitoral','TRE-SP',null,'Condenado em 1a instancia por caixa dois na campanha de 2012 (R$ 2,6 mi da UTC Engenharia). Absolvido pelo TRE-SP','absolvido',null,null,'alta',null,null from public.candidatos where slug='haddad-gov-sp'
union all select '233d3564-008e-44a4-8f4a-93de8e8fe9ae'::uuid,id,'eleitoral','TSE',null,'Multa de R$ 10 mil por propaganda irregular nas eleicoes de 2022','condenado',null,null,'baixa',null,null from public.candidatos where slug='haddad-gov-sp'
union all select 'e2252a89-90f1-4700-a473-b63522443215'::uuid,id,'improbidade','MP-SP',null,'Acusado de improbidade administrativa e irregularidades em licitacoes durante gestao em Sao Jose dos Campos','em_andamento',null,null,'media',null,null from public.candidatos where slug='felicio-ramuth'
union all select '75292421-804d-435c-8982-34054dd49bcf'::uuid,id,'criminal','Justica de Andorra',null,'Investigado pela Justica de Andorra por lavagem de dinheiro, movimentacao de US$ 1,6 milhao em conta no AndBank (2009-2011). Justica bloqueou US$ 1,4 milhao','em_andamento',null,null,'alta',null,null from public.candidatos where slug='felicio-ramuth';
SQL
}

FALHAS=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FALHAS=$((FALHAS + 1)); }
igual() { [[ "$2" == "$3" ]] && pass "$1 ($2)" || fail "$1: esperado $3, observado $2"; }

echo "F0: candidato ausente aborta atomicamente"
zerar; popular
q -c "delete from public.processos where candidato_id=(select id from public.candidatos where slug='tarcisio-gov-sp'); delete from public.candidatos where slug='tarcisio-gov-sp';" >/dev/null
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"esperados 4 candidatos"* ]]; then pass "guard candidato ausente"; else fail "guard candidato ausente rc=$rc"; fi
igual "zero alteracao no aborto" "$(q -c "select count(*) from public.processos where numero_processo is not null")" "0"

echo "F1: uma das seis linhas ausente aborta"
zerar; popular
q -c "delete from public.processos where id='233d3564-008e-44a4-8f4a-93de8e8fe9ae'" >/dev/null
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"esperadas 6 linhas antigas exatas"* ]]; then pass "guard linha ausente"; else fail "guard linha ausente rc=$rc"; fi
igual "nenhuma linha parcialmente alterada" "$(q -c "select count(*) from public.processos where url_fonte is not null")" "0"

echo "F2: carga exata, bloqueio, ledger e readback"
zerar; popular
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
igual "aplicacao exata" "$rc" "0"
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260811101200')" >/dev/null
igual "readback integral" "$(q -f - < "$READBACK" | head -1)" "6|5|1|5|2|2|1|1|1|1|0"
igual "Andorra despublicada" "$(q -c "select count(*) from public.processos where id='75292421-804d-435c-8982-34054dd49bcf'")" "0"
igual "bloqueio nao vira ausencia" "$(q -c "select resultado||'|'||volume from public.coleta_log where execucao='migration:20260811101200'")" "indeterminado|0"
q -c "update public.coleta_log set detalhe=detalhe||' adulterado' where execucao='migration:20260811101200'" >/dev/null
saida="$(aplicar < "$READBACK" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"bloqueios_explicitos"* ]]; then pass "readback recusa detalhe do bloqueio adulterado"; else fail "readback aceitou bloqueio adulterado rc=$rc"; fi
igual "bloqueio adulterado preservado" "$(q -c "select count(*) from public.coleta_log where execucao='migration:20260811101200' and detalhe like '% adulterado'")" "1"
saida="$(aplicar < "$RBK" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"rollback recusado"* ]]; then pass "rollback recusa detalhe do bloqueio adulterado"; else fail "rollback aceitou bloqueio adulterado rc=$rc"; fi
igual "rollback recusado preserva ledger do bloqueio" "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260811101200'")" "1"
q -c "update public.coleta_log set detalhe=regexp_replace(detalhe,' adulterado$','') where execucao='migration:20260811101200'" >/dev/null
igual "readback restaurado" "$(q -f - < "$READBACK" | head -1)" "6|5|1|5|2|2|1|1|1|1|0"
q -c "update public.coleta_log set natureza='curadoria' where execucao='migration:20260811101200'" >/dev/null
saida="$(aplicar < "$READBACK" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"bloqueios_explicitos"* ]]; then pass "readback recusa natureza do bloqueio adulterada"; else fail "readback aceitou natureza adulterada rc=$rc"; fi
q -c "update public.coleta_log set natureza='coleta' where execucao='migration:20260811101200'" >/dev/null
q -c "insert into public.coleta_log(fonte,escopo,alvo,resultado,volume,execucao) values ('processos-curadoria','candidato','extra','erro',0,'migration:20260811101200')" >/dev/null
saida="$(aplicar < "$READBACK" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"bloqueios_total"* ]]; then pass "readback recusa segundo bloqueio no marker"; else fail "readback aceitou segundo bloqueio rc=$rc"; fi
igual "linha extra preservada" "$(q -c "select count(*) from public.coleta_log where execucao='migration:20260811101200'")" "2"
q -c "delete from public.coleta_log where alvo='extra' and execucao='migration:20260811101200'" >/dev/null

echo "F3: reaplicacao aborta"
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"precondicao recusada"* ]]; then pass "reapply fail-closed"; else fail "reapply rc=$rc"; fi
igual "reapply preserva readback" "$(q -f - < "$READBACK" | head -1)" "6|5|1|5|2|2|1|1|1|1|0"

echo "F4: payload anterior divergente aborta"
zerar; popular
q -c "update public.processos set descricao='curadoria divergente' where id='e2252a89-90f1-4700-a473-b63522443215'" >/dev/null
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"precondicao recusada"* ]]; then pass "drift fail-closed"; else fail "drift rc=$rc"; fi
igual "Andorra preservada no aborto" "$(q -c "select count(*) from public.processos where tribunal='Justica de Andorra'")" "1"
igual "zero bloqueio parcial" "$(q -c "select count(*) from public.coleta_log")" "0"

echo "R1: rollback recusa curadoria posterior"
zerar; popular; aplicar < "$FWD" >/dev/null
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260811101200'); update public.processos set descricao=descricao||' posterior' where id='18050e24-bd22-43b1-88ac-d3710bcedaf3';" >/dev/null
saida="$(aplicar < "$RBK" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"rollback recusado"* ]]; then pass "rollback mutado fail-closed"; else fail "rollback mutado rc=$rc"; fi
igual "rollback recusado preserva ledger" "$(q -c "select count(*) from supabase_migrations.schema_migrations")" "1"
igual "rollback recusado preserva despublicacao" "$(q -c "select count(*) from public.processos where id='75292421-804d-435c-8982-34054dd49bcf'")" "0"

echo "R2: rollback exato restaura seis linhas e ledger"
zerar; popular; aplicar < "$FWD" >/dev/null
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260811101200')" >/dev/null
saida="$(aplicar < "$RBK" 2>&1)"; rc=$?
igual "rollback exato" "$rc" "0"
igual "seis linhas antigas restauradas" "$(q -c "select count(*) from public.processos where numero_processo is null and url_fonte is null")" "6"
igual "Andorra restaurada" "$(q -c "select count(*) from public.processos where id='75292421-804d-435c-8982-34054dd49bcf' and tribunal='Justica de Andorra'")" "1"
igual "bloqueio removido" "$(q -c "select count(*) from public.coleta_log")" "0"
igual "ledger removido" "$(q -c "select count(*) from supabase_migrations.schema_migrations")" "0"

if [[ "$FALHAS" -ne 0 ]]; then echo "FAIL: $FALHAS ramo(s)"; exit 1; fi
echo "PASS: 8 cenarios e 22 assercoes"
