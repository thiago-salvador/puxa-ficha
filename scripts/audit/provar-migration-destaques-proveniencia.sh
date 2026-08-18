#!/usr/bin/env bash
# Prova comportamental da proposta auto-auditada e do rollback em Postgres 17.
# Não toca Supabase nem qualquer ambiente remoto.
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD="QA/evidencias/2026-08-10-item4-14-destaques/proposta-autoauditoria/20260810110000_destaques_vazio_com_proveniencia.sql"
RBK="QA/evidencias/2026-08-10-item4-14-destaques/proposta-autoauditoria/20260810110000_destaques_vazio_com_proveniencia.rollback.sql"
C="pf-destaques-proveniencia-$$"

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
create table public.candidatos(id uuid primary key default gen_random_uuid(), slug text unique not null);
create view public.candidatos_publico as select * from public.candidatos;
create table public.historico_politico(
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid references public.candidatos(id),
  cargo text,
  cargo_canonico text,
  tipo_evento text,
  periodo_inicio integer,
  despublicado_em timestamptz
);
create table public.votacoes_chave(id uuid primary key default gen_random_uuid());
create table public.votos_candidato(
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid references public.candidatos(id),
  votacao_id uuid references public.votacoes_chave(id)
);
create table public.coleta_log(
  id bigint generated always as identity primary key,
  fonte text not null,
  escopo text not null,
  alvo text not null,
  candidato_id uuid references public.candidatos(id),
  executado_em timestamptz not null default now(),
  resultado text not null,
  volume integer not null,
  detalhe text,
  url text,
  execucao text
);
SQL

popular() {
  local n="$1"
  q -c "insert into public.candidatos(slug) select 'cand-' || lpad(i::text,3,'0') from generate_series(1,$n) i;" >/dev/null
}
zerar() {
  q -c "truncate public.coleta_log, public.votos_candidato, public.votacoes_chave, public.historico_politico, public.candidatos restart identity cascade;" >/dev/null
}

FALHAS=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FALHAS=$((FALHAS + 1)); }
igual() { [[ "$2" == "$3" ]] && pass "$1 ($2)" || fail "$1: esperado $3, observado $2"; }

echo "F0: universo vazio aborta"
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 ]] && grep -q "universo vazio" <<<"$saida"; then pass "guard do universo"; else fail "guard do universo rc=$rc"; fi
igual "zero escrita apos aborto" "$(q -c "select count(*) from public.coleta_log")" "0"

echo "F1: universo de replay reconcilia cardinalidade dinamica"
zerar
popular 77
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
igual "aplicacao em replay" "$rc" "0"
igual "77 por fonte" "$(q -c "select min(n)||':'||max(n) from (select fonte,count(*) n from public.coleta_log group by fonte) x")" "77:77"
saida="$(aplicar < "$RBK" 2>&1)"; rc=$?
igual "rollback dinamico" "$rc" "0"
igual "rollback remove 154" "$(q -c "select count(*) from public.coleta_log")" "0"

echo "F2: universo medido completo classifica e rollback remove 388"
zerar
popular 194
q <<'SQL' >/dev/null
insert into public.historico_politico(candidato_id,cargo,cargo_canonico,tipo_evento,periodo_inicio)
select id,'Deputado Federal','Deputado Federal','mandato',2019 from public.candidatos where slug='cand-001';
insert into public.historico_politico(candidato_id,cargo,cargo_canonico,tipo_evento,periodo_inicio)
select id,'Presidente de Partido','Presidente de Partido','mandato',2020 from public.candidatos where slug='cand-002';
insert into public.votacoes_chave default values;
insert into public.votos_candidato(candidato_id,votacao_id)
select c.id,v.id from public.candidatos c cross join public.votacoes_chave v where c.slug='cand-001';
SQL
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
igual "aplicacao" "$rc" "0"
igual "194 por fonte" "$(q -c "select min(n)||':'||max(n) from (select fonte,count(*) n from public.coleta_log group by fonte) x")" "194:194"
igual "trajetoria encontrada" "$(q -c "select count(*) from public.coleta_log where fonte='destaques-trajetoria' and resultado='encontrado'")" "1"
igual "trajetoria vazia" "$(q -c "select count(*) from public.coleta_log where fonte='destaques-trajetoria' and resultado='vazio_confirmado'")" "193"
igual "votacao encontrada" "$(q -c "select count(*) from public.coleta_log where fonte='destaques-votacoes' and resultado='encontrado'")" "1"
igual "votacao vazia" "$(q -c "select count(*) from public.coleta_log where fonte='destaques-votacoes' and resultado='vazio_confirmado'")" "193"
saida="$(aplicar < "$RBK" 2>&1)"; rc=$?
igual "rollback aplica" "$rc" "0"
igual "rollback remove 388" "$(q -c "select count(*) from public.coleta_log")" "0"

echo "F3: execucao parcial aborta sem ampliar dano"
q -c "insert into public.coleta_log(fonte,escopo,alvo,candidato_id,resultado,volume,execucao) select 'destaques-trajetoria','candidato',slug,id,'vazio_confirmado',0,'migration:20260810110000' from public.candidatos where slug='cand-001';" >/dev/null
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 ]] && grep -q "ja tem 1 linha" <<<"$saida"; then pass "parcial aborta"; else fail "parcial nao abortou rc=$rc"; fi
igual "parcial continua uma linha" "$(q -c "select count(*) from public.coleta_log")" "1"

if [[ "$FALHAS" -ne 0 ]]; then
  echo "FAIL: $FALHAS ramo(s)"; exit 1
fi
echo "PASS: 4 cenarios e 16 assercoes"
