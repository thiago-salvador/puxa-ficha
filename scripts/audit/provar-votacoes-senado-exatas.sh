#!/usr/bin/env bash
# Prova migration + rollback do item 7 em Postgres 17 efêmero. Não toca rede de produção.
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD="supabase/migrations/20260811100000_votacoes_senado_chave_exata.sql"
CONTRACT="supabase/migrations/20260811100100_votacoes_senado_contrato_exato.sql"
BACK="supabase/rollback/20260811100000_votacoes_senado_chave_exata.rollback.sql"
CONTRACT_BACK="supabase/rollback/20260811100100_votacoes_senado_contrato_exato.rollback.sql"
READBACK="supabase/readback/20260811100000_votacoes_senado_chave_exata.readback.sql"
CONTRACT_READBACK="supabase/readback/20260811100100_votacoes_senado_contrato_exato.readback.sql"
SNAP="QA/evidencias/2026-08-11-item7-senado/snapshot-producao-antes.json"
for arquivo in "$FWD" "$CONTRACT" "$BACK" "$CONTRACT_BACK" "$READBACK" "$CONTRACT_READBACK" "$SNAP"; do [[ -f "$arquivo" ]] || { echo "FAIL: $arquivo ausente"; exit 1; }; done

C="pf-senado-exato-$$"
limpar() { docker rm -f "$C" >/dev/null 2>&1; }
trap limpar EXIT INT TERM
docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null || exit 1
for _ in $(seq 1 90); do
  docker exec "$C" psql -U postgres -d postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$C" psql -U postgres -d postgres -tAc 'select 1' >/dev/null 2>&1 || { echo "FAIL: postgres não ficou pronto"; exit 1; }

q() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
aplicar() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction -f -; }

q >/dev/null <<'SQL'
create extension if not exists pgcrypto;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
create table public.candidatos(id uuid primary key default gen_random_uuid(), slug text unique not null);
create table public.votacoes_chave(
  id uuid primary key, titulo text not null, descricao text, data_votacao date, casa text,
  proposicao_id text, tema text, impacto_popular text, created_at timestamptz default now(),
  fonte text, votacao_id_api text
);
create unique index votacoes_chave_fonte_votacao_id_api_key
  on public.votacoes_chave(fonte,votacao_id_api) where fonte is not null and votacao_id_api is not null;
create table public.votos_candidato(
  id uuid primary key default gen_random_uuid(), candidato_id uuid references public.candidatos(id),
  votacao_id uuid references public.votacoes_chave(id) on delete cascade, voto text not null,
  contradicao boolean default false, contradicao_descricao text, created_at timestamptz default now(),
  unique(candidato_id,votacao_id)
);
SQL

node --eval 'const j=require("./QA/evidencias/2026-08-11-item7-senado/snapshot-producao-antes.json"); const s=[...new Set(j.pares.map(p=>p.candidatos.slug))]; const q=x=>"\x27"+x.replaceAll("\x27","\x27\x27")+"\x27"; console.log("insert into public.candidatos(slug) values "+s.map(x=>"("+q(x)+")").join(",")+";")' | q >/dev/null

semear() {
  node --eval '
    const j = require("./" + process.argv[1]);
    const q = (v) => v == null ? "null" : "\x27" + String(v).replaceAll("\x27", "\x27\x27") + "\x27";
    console.log("insert into public.votacoes_chave (id,titulo,descricao,data_votacao,casa,proposicao_id,tema,impacto_popular,created_at,fonte,votacao_id_api) values " + j.linhas.map((x) => `(${q(x.id)},${q(x.titulo)},${q(x.descricao)},${q(x.data_votacao)},${q(x.casa)},${q(x.proposicao_id)},${q(x.tema)},${q(x.impacto_popular)},${q(x.created_at)},null,null)`).join(",") + ";");
    console.log("with antigos(id,slug,votacao_id,voto,contradicao,contradicao_descricao,created_at) as (values " + j.pares.map((x) => `(${q(x.id)},${q(x.candidatos.slug)},${q(x.votacao_id)},${q(x.voto)},${x.contradicao ? "true" : "false"},${q(x.contradicao_descricao)},${q(x.created_at)})`).join(",") + ") insert into public.votos_candidato(id,candidato_id,votacao_id,voto,contradicao,contradicao_descricao,created_at) select a.id::uuid,c.id,a.votacao_id::uuid,a.voto,a.contradicao,a.contradicao_descricao,a.created_at::timestamptz from antigos a join public.candidatos c on c.slug=a.slug;");
  ' "$SNAP" | aplicar >/dev/null
}
contar() { q -c "$1"; }
falhas=0
igual() { if [[ "$2" == "$3" ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1 esperado=$3 observado=$2"; falhas=$((falhas+1)); fi; }

echo "== caminho feliz e rollback"
semear
igual "seed linhas" "$(contar "select count(*) from public.votacoes_chave where casa='Senado'")" "13"
igual "seed pares" "$(contar "select count(*) from public.votos_candidato")" "81"
aplicar < "$FWD" >/dev/null || { echo "FAIL migration não aplicou"; exit 1; }
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260811100000')" >/dev/null
aplicar < "$CONTRACT" >/dev/null || { echo "FAIL contrato não aplicou"; exit 1; }
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260811100100')" >/dev/null
aplicar < "$READBACK" >/dev/null || { echo "FAIL readback da carga não passou"; exit 1; }
aplicar < "$CONTRACT_READBACK" >/dev/null || { echo "FAIL readback do contrato não passou"; exit 1; }
igual "final linhas" "$(contar "select count(*) from public.votacoes_chave where casa='Senado'")" "6"
igual "final pares" "$(contar "select count(*) from public.votos_candidato")" "75"

echo "== contrato fraco é recusado por readback e rollback"
q -c "alter table public.votacoes_chave drop constraint votacoes_chave_senado_exige_evento_exato_check; alter table public.votacoes_chave add constraint votacoes_chave_senado_exige_evento_exato_check check (casa is distinct from 'Senado' or (fonte='senado' and votacao_id_api is not null))" >/dev/null
set +e
saida="$(aplicar < "$CONTRACT_READBACK" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"assinatura_constraint"* ]] || { echo "FAIL readback aceitou contrato fraco"; falhas=$((falhas+1)); }
set +e
saida="$(aplicar < "$CONTRACT_BACK" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"definição estrutural diverge"* ]] || { echo "FAIL rollback aceitou contrato fraco"; falhas=$((falhas+1)); }
igual "contrato fraco preserva ledger" "$(contar "select count(*) from supabase_migrations.schema_migrations where version='20260811100100'")" "1"
q -c "alter table public.votacoes_chave drop constraint votacoes_chave_senado_exige_evento_exato_check" >/dev/null
aplicar < "$CONTRACT" >/dev/null
aplicar < "$CONTRACT_READBACK" >/dev/null || { echo "FAIL readback do contrato restaurado"; exit 1; }

echo "== readback recusa título adulterado com contagens constantes"
q -c "update public.votacoes_chave set titulo='Título posterior' where id='8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'" >/dev/null
set +e
saida="$(aplicar < "$READBACK" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"assinatura_linhas"* ]] || { echo "FAIL readback aceitou título adulterado"; falhas=$((falhas+1)); }
igual "readback recusado preserva título adulterado" "$(contar "select titulo from public.votacoes_chave where id='8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'")" "Título posterior"
igual "readback recusado preserva ledger" "$(contar "select count(*) from supabase_migrations.schema_migrations where version='20260811100000'")" "1"
q -c "update public.votacoes_chave set titulo='Reforma da Previdencia' where id='8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'" >/dev/null
aplicar < "$READBACK" >/dev/null || { echo "FAIL readback não voltou a passar após restauração"; exit 1; }

echo "== ordem reversa incorreta aborta"
set +e
saida="$(aplicar < "$BACK" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 ]] || { echo "FAIL rollback 111000 aplicou antes de 111001"; falhas=$((falhas+1)); }
igual "ordem incorreta preserva linhas" "$(contar "select count(*) from public.votacoes_chave where casa='Senado'")" "6"
igual "ordem incorreta preserva ledger 111000" "$(contar "select count(*) from supabase_migrations.schema_migrations where version='20260811100000'")" "1"

echo "== ordem reversa correta"
aplicar < "$CONTRACT_BACK" >/dev/null || { echo "FAIL rollback do contrato não aplicou"; exit 1; }
igual "rollback contrato remove ledger" "$(contar "select count(*) from supabase_migrations.schema_migrations where version='20260811100100'")" "0"

echo "== contrato sem ledger não pode ser removido"
aplicar < "$CONTRACT" >/dev/null
set +e
saida="$(aplicar < "$CONTRACT_BACK" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"ledger ausente"* ]] || { echo "FAIL rollback do contrato aceitou ledger ausente"; falhas=$((falhas+1)); }
igual "ledger ausente preserva constraint" "$(contar "select count(*) from pg_constraint where conname='votacoes_chave_senado_exige_evento_exato_check'")" "1"
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260811100100')" >/dev/null
aplicar < "$CONTRACT_BACK" >/dev/null

echo "== curadoria posterior faz rollback abortar sem apagar"
q -c "insert into public.votacoes_chave(id,titulo,casa,fonte,votacao_id_api) values ('11111111-1111-4111-8111-111111111111','Curadoria posterior','Senado','senado','posterior-1')" >/dev/null
set +e
saida="$(aplicar < "$BACK" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"rollback Senado recusado: payload atual diverge da forward"* ]] || { echo "FAIL rollback não recusou curadoria posterior"; falhas=$((falhas+1)); }
igual "rollback recusado preserva 7 linhas" "$(contar "select count(*) from public.votacoes_chave where casa='Senado'")" "7"
igual "rollback recusado preserva 75 pares" "$(contar "select count(*) from public.votos_candidato")" "75"
igual "rollback recusado preserva linha posterior" "$(contar "select count(*) from public.votacoes_chave where id='11111111-1111-4111-8111-111111111111'")" "1"
igual "rollback recusado preserva ledger 111000" "$(contar "select count(*) from supabase_migrations.schema_migrations where version='20260811100000'")" "1"
q -c "delete from public.votacoes_chave where id='11111111-1111-4111-8111-111111111111'" >/dev/null

aplicar < "$BACK" >/dev/null || { echo "FAIL rollback não aplicou"; exit 1; }
igual "rollback carga remove ledger" "$(contar "select count(*) from supabase_migrations.schema_migrations where version='20260811100000'")" "0"
igual "rollback linhas" "$(contar "select count(*) from public.votacoes_chave where casa='Senado'")" "13"
igual "rollback pares" "$(contar "select count(*) from public.votos_candidato")" "81"

echo "== estado adversarial aborta sem mutação parcial"
q -c "delete from public.votos_candidato where ctid in (select ctid from public.votos_candidato limit 1)" >/dev/null
set +e
saida="$(aplicar < "$FWD" 2>&1)"; rc=$?
set -e
[[ "$rc" != 0 && "$saida" == *"esperado universo anterior de 81 pares"* ]] || { echo "FAIL estado adversarial não abortou corretamente"; falhas=$((falhas+1)); }
igual "adversarial preserva linhas" "$(contar "select count(*) from public.votacoes_chave where casa='Senado'")" "13"
igual "adversarial preserva 80 pares" "$(contar "select count(*) from public.votos_candidato")" "80"

[[ "$falhas" == 0 ]] && { echo "OK: migration, rollback e fail-closed provados em Postgres efêmero"; exit 0; }
echo "FAIL: $falhas divergência(s)"
exit 1
