#!/usr/bin/env bash
#
# Prova EXECUTAVEL das pre-condicoes da 20260810090100, em Postgres 17 efemero.
#
# A migration e destrutiva e NAO e reversivel por SQL: ela apaga 6 votacoes-chave
# e os 100 pares candidato-voto delas, e os pares vieram de coleta que esta
# frente remove. Entao a unica garantia que sobra e a migration abortar ANTES da
# primeira exclusao quando o banco nao estiver no estado medido em 10/08/2026.
#
# Asserção sobre TEXTO de SQL nao prova isso. Quem prova e o Postgres, e e por
# isso que este harness existe: cada ramo abaixo estraga o estado de um jeito
# diferente e cobra que a migration recuse E que nao tenha apagado nada.
#
# Seis ramos, todos fail-closed. Qualquer divergencia sai RC=1.
#
#   P1 estado exato medido        -> aplica, 0 votacoes e 0 pares no fim
#   P2 uma das 6 linhas ausente   -> ABORTA, e as outras 5 continuam intactas
#   P3 um par a menos (19 no Teto)-> ABORTA, e os 99 pares continuam intactos
#   P4 um par a MAIS              -> ABORTA (coleta nova depois da auditoria)
#   P5 metadado divergente        -> ABORTA (linha editada desde a medicao)
#   P6 pares trocados de linha    -> ABORTA, e e o ramo que so a conferencia por
#                                    UUID pega: o TOTAL continua 100
#
# O P6 e a razao de a conferencia por UUID e a do total serem separadas na
# migration. Um erro que tire 5 pares de uma linha e acrescente 5 em outra fecha
# o total e passaria despercebido numa checagem so.
#
# Custo zero e sem risco: container proprio com nome unico, imagem presa por
# digest (a mesma do replay), trap remove so o que esta execucao criou, nunca
# toca producao.
#
# Uso: npm run audit:despublicacao:provar
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD="supabase/migrations/20260810090100_despublicar_votacoes_chave_defeituosas.sql"
DDL="supabase/migrations/20260810090000_votacoes_chave_chave_por_votacao.sql"
DATASET="supabase/migrations/20260810090200_votacoes_chave_dataset_v2.sql"
DATASET_BACK="supabase/rollback/20260810090200_votacoes_chave_dataset_v2.rollback.sql"
READBACK_DDL="supabase/readback/20260810090000_votacoes_chave_chave_por_votacao.readback.sql"
READBACK_DESPUBLICACAO="supabase/readback/20260810090100_despublicar_votacoes_chave_defeituosas.readback.sql"
READBACK_DATASET="supabase/readback/20260810090200_votacoes_chave_dataset_v2.readback.sql"

for arquivo in "$DDL" "$FWD" "$DATASET" "$DATASET_BACK" "$READBACK_DDL" "$READBACK_DESPUBLICACAO" "$READBACK_DATASET"; do
  [[ -f "$arquivo" ]] || { echo "FAIL: $arquivo nao existe"; exit 1; }
done

C="pf-desp-$$"
limpar() { docker rm -f "$C" >/dev/null 2>&1; }
trap limpar EXIT INT TERM

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null || {
  echo "FAIL: docker nao subiu o container"; exit 1; }
pronto=0
for _ in $(seq 1 90); do
  if docker exec "$C" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    pronto=1; break
  fi
  sleep 1
done
[[ "$pronto" == 1 ]] || { echo "FAIL: postgres nao ficou pronto"; exit 1; }

q()      { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
aplicar(){ docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction -f - ; }
rodar()  { local saida rc; saida="$(aplicar < "$FWD" 2>&1)"; rc=$?; printf '%s|%s' "$rc" "$saida"; }

FALHAS=0
ok()  { echo "  PASS  $1"; }
nok() { echo "  FAIL  $1"; FALHAS=$((FALHAS + 1)); }
igual(){ if [[ "$2" == "$3" ]]; then ok "$1 ($2)"; else nok "$1: esperado '$3', observado '$2'"; fi }

q <<'SQL' >/dev/null
create table public.votacoes_chave(
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  data_votacao date,
  casa text,
  proposicao_id text,
  tema text,
  impacto_popular text
);
create table public.votos_candidato(
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid not null,
  votacao_id uuid not null references public.votacoes_chave(id),
  voto text
);
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
SQL

# Estado medido em 10/08/2026: as 6 linhas e os 100 pares.
semear() {
  q >/dev/null <<'SQL'
delete from public.votos_candidato;
delete from public.votacoes_chave;
insert into public.votacoes_chave (id, titulo, data_votacao, casa, proposicao_id) values
 ('a7c70604-5116-4545-a2a4-a00a7761af43','Teto de Gastos (EC 95)','2016-12-13','Câmara','2088351'),
 ('9c1f05a7-fe8d-4c45-8827-ca23d029b1a0','Reforma Trabalhista','2017-07-11','Câmara','2122076'),
 ('b2aa93fb-faa1-423c-bae7-70ea6ff35fe0','Reforma da Previdência','2019-07-10','Câmara','2192459'),
 ('a539c15d-20a0-4e55-876b-a7bbba7ef0d2','Auxílio Brasil (MP 1.061/2021)','2021-11-25','Câmara','2293428'),
 ('d652e083-aa23-4df9-a66f-433816d330cc','Marco Temporal Indigena','2023-05-30','Camara','345311'),
 ('86e0edac-52a5-44fe-b699-1c09aaf42a32','PL das Fake News','2024-04-10','Câmara','2256735');
insert into public.votos_candidato (candidato_id, votacao_id, voto)
select gen_random_uuid(), v.id, 'sim'
  from public.votacoes_chave v
  cross join lateral generate_series(1, case v.id
    when 'a7c70604-5116-4545-a2a4-a00a7761af43' then 20
    when '9c1f05a7-fe8d-4c45-8827-ca23d029b1a0' then 20
    when 'b2aa93fb-faa1-423c-bae7-70ea6ff35fe0' then 27
    when 'a539c15d-20a0-4e55-876b-a7bbba7ef0d2' then 8
    when 'd652e083-aa23-4df9-a66f-433816d330cc' then 12
    else 13 end) as s;
SQL
}
votacoes() { q -c "select count(*) from public.votacoes_chave;"; }
pares()    { q -c "select count(*) from public.votos_candidato;"; }

echo "== pre-condicoes da despublicacao"

echo "P1 estado exato medido -> aplica"
semear
igual "P1 semeou 6 votacoes" "$(votacoes)" "6"
igual "P1 semeou 100 pares"  "$(pares)"    "100"
aplicar < "$DDL" >/dev/null || { echo "FAIL P1 DDL não aplicou"; exit 1; }
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260810090000')" >/dev/null
aplicar < "$READBACK_DDL" >/dev/null || { echo "FAIL P1 readback DDL"; exit 1; }
q -c "alter table public.votacoes_chave alter column fonte set default 'camara'; update public.votacoes_chave set fonte='camara',votacao_id_api=id::text; alter table public.votacoes_chave alter column fonte set not null,alter column votacao_id_api set not null; comment on column public.votacoes_chave.fonte is 'adulterado'" >/dev/null
set +e
saida="$(aplicar < "$READBACK_DDL" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"colunas text=0 de 2"* ]] && ok "P1 readback recusa default, not null e comentário adulterados" || nok "P1 readback aceitou propriedades de coluna adulteradas"
q -c "alter table public.votacoes_chave alter column fonte drop not null,alter column votacao_id_api drop not null,alter column fonte drop default; update public.votacoes_chave set fonte=null,votacao_id_api=null; comment on column public.votacoes_chave.fonte is 'Fonte da votacao: camara (Camara Dados Abertos v2) ou senado (Senado Dados Abertos). Metade da chave composta com votacao_id_api.'" >/dev/null
aplicar < "$READBACK_DDL" >/dev/null || { echo "FAIL P1 propriedades de coluna restauradas"; exit 1; }
q -c "alter table public.votacoes_chave drop constraint votacoes_chave_fonte_id_consistentes_check; alter table public.votacoes_chave add constraint votacoes_chave_fonte_id_consistentes_check check (true); drop index public.votacoes_chave_fonte_votacao_id_api_key; create unique index votacoes_chave_fonte_votacao_id_api_key on public.votacoes_chave(id) where id is not null" >/dev/null
set +e
saida="$(aplicar < "$READBACK_DDL" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"assinatura_constraint"* ]] && ok "P1 readback recusa DDL inerte" || nok "P1 readback aceitou DDL inerte"
igual "P1 DDL inerte preserva ledger" "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260810090000'")" "1"
q -c "alter table public.votacoes_chave drop constraint votacoes_chave_fonte_id_consistentes_check; drop index public.votacoes_chave_fonte_votacao_id_api_key" >/dev/null
aplicar < "$DDL" >/dev/null || { echo "FAIL P1 restauracao DDL"; exit 1; }
aplicar < "$READBACK_DDL" >/dev/null || { echo "FAIL P1 readback DDL restaurado"; exit 1; }
r="$(rodar)"
igual "P1 rc" "${r%%|*}" "0"
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260810090100')" >/dev/null
aplicar < "$READBACK_DESPUBLICACAO" >/dev/null || { echo "FAIL P1 readback despublicacao"; exit 1; }
igual "P1 votacoes no fim" "$(votacoes)" "0"
igual "P1 pares no fim"    "$(pares)"    "0"
aplicar < "$DATASET" >/dev/null || { echo "FAIL P1 dataset v2 não aplicou"; exit 1; }
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260810090200')" >/dev/null
aplicar < "$READBACK_DATASET" >/dev/null || { echo "FAIL P1 readback dataset v2"; exit 1; }
igual "P1 dataset v2 tem 12 linhas" "$(q -c "select count(*) from public.votacoes_chave where fonte='camara'")" "12"
q -c "insert into public.votos_candidato(candidato_id,votacao_id,voto) select gen_random_uuid(),id,'sim' from public.votacoes_chave where votacao_id_api='14493-503'" >/dev/null
set +e
saida="$(aplicar < "$DATASET_BACK" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"voto(s) posterior(es)"* ]] && ok "P1 rollback recusa voto posterior" || nok "P1 rollback apagou voto posterior"
igual "P1 voto posterior preservado" "$(q -c "select count(*) from public.votos_candidato")" "1"
igual "P1 ledger preservado com voto" "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260810090200'")" "1"
q -c "delete from public.votos_candidato" >/dev/null
q -c "update public.votacoes_chave set titulo=titulo||' adulterado' where votacao_id_api='14493-503'" >/dev/null
set +e
saida="$(aplicar < "$READBACK_DATASET" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"assinatura_payload"* ]] && ok "P1 readback recusa titulo adulterado" || nok "P1 readback aceitou titulo adulterado"
set +e
saida="$(aplicar < "$DATASET_BACK" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"payload atual diverge"* ]] && ok "P1 rollback recusa titulo adulterado" || nok "P1 rollback apagou titulo adulterado"
igual "P1 mutacao preservada" "$(q -c "select count(*) from public.votacoes_chave where votacao_id_api='14493-503' and titulo like '% adulterado'")" "1"
igual "P1 ledger preservado" "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260810090200'")" "1"
q -c "update public.votacoes_chave set titulo=regexp_replace(titulo,' adulterado$','') where votacao_id_api='14493-503'" >/dev/null
aplicar < "$READBACK_DATASET" >/dev/null || { echo "FAIL P1 readback restaurado"; exit 1; }
aplicar < "$DATASET_BACK" >/dev/null || { echo "FAIL P1 rollback dataset v2"; exit 1; }
igual "P1 rollback dataset remove 12" "$(q -c "select count(*) from public.votacoes_chave where fonte='camara'")" "0"
igual "P1 rollback dataset remove ledger" "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260810090200'")" "0"

echo "P1b ledger ausente -> rollback aborta sem apagar"
aplicar < "$DATASET" >/dev/null
set +e
saida="$(aplicar < "$DATASET_BACK" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"ledger ausente"* ]] && ok "P1b rollback exige ledger" || nok "P1b rollback aceitou ledger ausente"
igual "P1b preserva 12 linhas" "$(q -c "select count(*) from public.votacoes_chave where fonte='camara'")" "12"
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260810090200')" >/dev/null
aplicar < "$DATASET_BACK" >/dev/null

# A partir daqui, todo ramo cobra DUAS coisas: abortar e nao ter apagado nada.
adversarial() {
  local nome="$1" marca="$2" votacoes_esperadas="$3" pares_esperados="$4"
  local r rc saida
  r="$(rodar)"; rc="${r%%|*}"; saida="${r#*|}"
  if [[ "$rc" != 0 ]] && grep -q "$marca" <<<"$saida"; then
    ok "$nome abortou ($marca)"
  else
    nok "$nome nao abortou como esperado (rc=$rc): $(tr '\n' ' ' <<<"$saida" | cut -c1-180)"
  fi
  igual "$nome nao apagou votacao" "$(votacoes)" "$votacoes_esperadas"
  igual "$nome nao apagou par"     "$(pares)"    "$pares_esperados"
}

echo "P2 uma das 6 linhas ausente -> aborta"
semear
q -c "delete from public.votos_candidato where votacao_id='86e0edac-52a5-44fe-b699-1c09aaf42a32';" >/dev/null
q -c "delete from public.votacoes_chave where id='86e0edac-52a5-44fe-b699-1c09aaf42a32';" >/dev/null
adversarial "P2" "nao existe" "5" "87"

echo "P3 um par a menos -> aborta"
semear
q -c "delete from public.votos_candidato where ctid in (select ctid from public.votos_candidato where votacao_id='a7c70604-5116-4545-a2a4-a00a7761af43' limit 1);" >/dev/null
adversarial "P3" "par(es), esperados" "6" "99"

echo "P4 um par a mais -> aborta"
semear
q -c "insert into public.votos_candidato (candidato_id, votacao_id, voto) values (gen_random_uuid(),'b2aa93fb-faa1-423c-bae7-70ea6ff35fe0','não');" >/dev/null
adversarial "P4" "par(es), esperados" "6" "101"

echo "P5 metadado divergente -> aborta"
semear
q -c "update public.votacoes_chave set data_votacao='2016-10-25' where id='a7c70604-5116-4545-a2a4-a00a7761af43';" >/dev/null
adversarial "P5" "metadados de" "6" "100"

echo "P6 pares trocados de linha, total continua 100 -> aborta"
semear
q -c "update public.votos_candidato set votacao_id='9c1f05a7-fe8d-4c45-8827-ca23d029b1a0' where ctid in (select ctid from public.votos_candidato where votacao_id='a7c70604-5116-4545-a2a4-a00a7761af43' limit 5);" >/dev/null
igual "P6 total continua 100" "$(pares)" "100"
adversarial "P6" "par(es), esperados" "6" "100"

echo
if [[ "$FALHAS" -eq 0 ]]; then
  echo "OK: as pre-condicoes bloqueiam os 5 estados adversariais e o estado exato aplica."
  exit 0
fi
echo "FAIL: $FALHAS divergencia(s)."
exit 1
