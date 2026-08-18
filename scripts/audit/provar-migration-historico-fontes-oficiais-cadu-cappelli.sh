#!/usr/bin/env bash
# Prova comportamental da correção de trajetória em Postgres 17 efêmero.
# Não toca Supabase nem qualquer ambiente remoto.
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD="supabase/migrations/20260811101100_historico_fontes_oficiais_cadu_cappelli.sql"
RBK="supabase/rollback/20260811101100_historico_fontes_oficiais_cadu_cappelli.rollback.sql"
READBACK="supabase/readback/20260811101100_historico_fontes_oficiais_cadu_cappelli.readback.sql"
C="pf-historico-fontes-$$"

limpar() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap limpar EXIT INT TERM

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null || {
  echo "FAIL: docker nao subiu"; exit 1;
}
pronto=0
for _ in $(seq 1 90); do
  if docker exec "$C" pg_isready -U postgres >/dev/null 2>&1; then pronto=1; break; fi
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
create table public.historico_politico(
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid not null references public.candidatos(id),
  cargo text not null,
  estado text,
  periodo_inicio integer,
  periodo_fim integer,
  observacoes text,
  proveniencia text,
  despublicado_em timestamptz
);
SQL

zerar() {
  q -c "truncate public.historico_politico, public.candidatos restart identity cascade; delete from supabase_migrations.schema_migrations;" >/dev/null
}

popular_cadu() {
  q <<'SQL' >/dev/null
insert into public.candidatos(slug) values ('cadu-xavier');
insert into public.historico_politico(candidato_id,cargo,estado,periodo_inicio,periodo_fim,observacoes,proveniencia)
select id,'Secretário de Estado da Fazenda do Rio Grande do Norte','RN',2019,2026,
  'Exoneração publicada em 30/03/2026 para desincompatibilização eleitoral (DOE/RN edição extra 31/03/2026)','manual'
from public.candidatos where slug='cadu-xavier';
SQL
}

popular_ricardo() {
  q <<'SQL' >/dev/null
insert into public.candidatos(slug) values ('ricardo-cappelli');
insert into public.historico_politico(candidato_id,cargo,estado,periodo_inicio,periodo_fim,observacoes,proveniencia)
select id,'Presidente da ABDI','DF',2019,2023,'Presidência da ABDI até 2023 (Metrópoles + curadoria 13.csv)',null from public.candidatos where slug='ricardo-cappelli'
union all select id,'Interventor na Segurança Pública do Distrito Federal','DF',2023,2023,'Intervenção federal na segurança do DF em 2023 (curadoria 13.csv)',null from public.candidatos where slug='ricardo-cappelli'
union all select id,'Secretário-Executivo do MJSP','BR',2023,2024,'Ministério da Justiça e Segurança Pública (curadoria 13.csv)',null from public.candidatos where slug='ricardo-cappelli'
union all select id,'Ministro',null,2023,2023,'Importado automaticamente de Wikidata P39 em 2026-08-05','wikidata' from public.candidatos where slug='ricardo-cappelli';
SQL
}

popular_base() { popular_cadu; popular_ricardo; }

FALHAS=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FALHAS=$((FALHAS + 1)); }
igual() { [[ "$2" == "$3" ]] && pass "$1 ($2)" || fail "$1: esperado $3, observado $2"; }

echo "F0: candidato ausente aborta"
zerar; popular_cadu
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"esperados 2 candidatos, encontrados 1"* ]]; then pass "guard candidato ausente"; else fail "guard candidato ausente rc=$rc"; fi
igual "zero alteração no aborto" "$(q -c "select count(*) from public.historico_politico where observacoes like '%https://%'")" "0"

echo "F1: trajetória faltante aborta atomicamente"
zerar; popular_base
q -c "delete from public.historico_politico where cargo='Ministro'" >/dev/null
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"precondicao recusada"* ]]; then pass "guard linha faltante"; else fail "guard linha faltante rc=$rc"; fi
igual "nenhuma das quatro linhas foi alterada" "$(q -c "select count(*) from public.historico_politico where observacoes like '%https://%'")" "0"

echo "F2: carga exata, ledger e readback"
zerar; popular_base
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
igual "aplicação exata" "$rc" "0"
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260811101100')" >/dev/null
igual "readback integral" "$(q -f - < "$READBACK")" "5|5|5|5|1|0|1|0"

echo "F3: reaplicação aborta"
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"precondicao recusada"* ]]; then pass "reapply fail-closed"; else fail "reapply rc=$rc"; fi
igual "reapply preserva payload" "$(q -f - < "$READBACK")" "5|5|5|5|1|0|1|0"

echo "F4: payload anterior divergente aborta"
zerar; popular_base
q -c "update public.historico_politico set observacoes='curadoria divergente' where cargo='Secretário-Executivo do MJSP'" >/dev/null
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"precondicao recusada"* ]]; then pass "drift fail-closed"; else fail "drift rc=$rc"; fi
igual "ABDI antiga preservada no aborto" "$(q -c "select count(*) from public.historico_politico where cargo='Presidente da ABDI' and periodo_inicio=2019 and periodo_fim=2023")" "1"
igual "zero linha parcialmente atualizada" "$(q -c "select count(*) from public.historico_politico where observacoes like '%https://%'")" "0"

echo "R1: rollback recusa payload posterior"
zerar; popular_base; aplicar < "$FWD" >/dev/null
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260811101100'); update public.historico_politico set observacoes=observacoes || ' posterior' where cargo='Ministro';" >/dev/null
saida="$(aplicar < "$RBK" 2>&1)"; rc=$?
if [[ "$rc" != 0 && "$saida" == *"rollback recusado"* ]]; then pass "rollback mutado fail-closed"; else fail "rollback mutado rc=$rc"; fi
igual "rollback recusado preserva ledger" "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260811101100'")" "1"
igual "rollback recusado preserva data ABDI" "$(q -c "select count(*) from public.historico_politico where cargo='Presidente da ABDI' and periodo_inicio=2024 and periodo_fim=2026")" "1"

echo "R2: rollback exato restaura cinco linhas e ledger"
zerar; popular_base; aplicar < "$FWD" >/dev/null
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260811101100')" >/dev/null
saida="$(aplicar < "$RBK" 2>&1)"; rc=$?
igual "rollback exato" "$rc" "0"
igual "ABDI anterior restaurada" "$(q -c "select count(*) from public.historico_politico where cargo='Presidente da ABDI' and periodo_inicio=2019 and periodo_fim=2023")" "1"
igual "proveniências anteriores restauradas" "$(q -c "select count(*) from public.historico_politico where proveniencia is null")" "3"
igual "Wikidata anterior restaurada" "$(q -c "select count(*) from public.historico_politico where proveniencia='wikidata'")" "1"
igual "ledger removido" "$(q -c "select count(*) from supabase_migrations.schema_migrations")" "0"

if [[ "$FALHAS" -ne 0 ]]; then
  echo "FAIL: $FALHAS ramo(s)"; exit 1
fi
echo "PASS: 7 cenários e 17 asserções"
