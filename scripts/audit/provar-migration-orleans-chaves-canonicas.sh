#!/usr/bin/env bash
# Prova da 20260812125000 em PostgreSQL 17 efêmero.
#
# O que precisa ficar provado, além do caminho feliz: que a correção move a
# CHAVE sem tocar no conteúdo, que ela se recusa a rodar fora do estado exato
# deixado pela 124000, que o rollback devolve o pré-estado, e que o readback da
# própria 124000 aceita os DOIS estados nomeados e só eles.
set -euo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
BASE="supabase/migrations/20260812124000_orleans_destaques_proveniencia.sql"
FWD="supabase/migrations/20260812125000_orleans_proveniencia_chaves_canonicas.sql"
RBK="supabase/rollback/20260812125000_orleans_proveniencia_chaves_canonicas.rollback.sql"
READBACK="supabase/readback/20260812125000_orleans_proveniencia_chaves_canonicas.readback.sql"
READBACK_124="supabase/readback/20260812124000_orleans_destaques_proveniencia.readback.sql"
C="pf-orleans-chaves-$$"
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

# Pré-estado: exatamente o que a 124000 deixa em produção.
{ cat "$BASE"; echo "insert into supabase_migrations.schema_migrations(version) values ('20260812124000');"; } | qtx >/dev/null

echo "P0: sem a 125000, o readback da 124000 exige as chaves ORIGINAIS"
[[ "$(q -Atq < "$READBACK_124")" == "1|5|4|1|0" ]]
echo "  PASS  pre-estado reconhecido"

echo "P1: forward move as duas chaves e preserva o conteudo"
{ cat "$FWD"; echo "insert into supabase_migrations.schema_migrations(version) values ('20260812125000');"; } | qtx >/dev/null
[[ "$(q -Atq -c "select count(*) from coleta_log where fonte in ('destaques-sancoes','destaques-processos')")" == 0 ]]
[[ "$(q -Atq -c "select count(*) from coleta_log where fonte in ('transparencia-sanctions','processos-curadoria')")" == 2 ]]
[[ "$(q -Atq -c "select count(*) from coleta_log where execucao='migration:20260812124000'")" == 5 ]]
# conteúdo byte a byte: nada além de fonte pode ter mudado
[[ "$(q -Atq -c "select count(*) from coleta_log where fonte in ('transparencia-sanctions','processos-curadoria') and resultado='indeterminado' and volume=0 and url is null and natureza='coleta' and executado_em=timestamptz '2026-08-12 17:17:12+00'")" == 2 ]]
echo "  PASS  chaves movidas, payload intacto"

echo "P2: readback proprio passa, e o da 124000 aceita o estado corrigido"
[[ "$(q -Atq < "$READBACK")" == "1|0|2|5|0" ]]
[[ "$(q -Atq < "$READBACK_124")" == "1|5|4|1|0" ]]
echo "  PASS  os dois readbacks reconhecem o pos-estado"

echo "P3: reaplicar aborta, porque a origem nao existe mais"
if qtx < "$FWD" >/dev/null 2>&1; then echo "FAIL: forward reaplicou" >&2; exit 1; fi
echo "  PASS  forward nao e silenciosamente idempotente"

echo "P4: readback recusa chave antiga ressuscitada"
q -c "update coleta_log set fonte='destaques-sancoes' where fonte='transparencia-sanctions';" >/dev/null
if q -Atq < "$READBACK" >/dev/null 2>&1; then echo "FAIL: readback aceitou chave antiga" >&2; exit 1; fi
q -c "update coleta_log set fonte='transparencia-sanctions' where fonte='destaques-sancoes';" >/dev/null
[[ "$(q -Atq < "$READBACK")" == "1|0|2|5|0" ]]
echo "  PASS  chave antiga ressuscitada aborta"

echo "P5: readback recusa conteudo adulterado"
q -c "update coleta_log set detalhe='outra coisa' where fonte='processos-curadoria';" >/dev/null
if q -Atq < "$READBACK" >/dev/null 2>&1; then echo "FAIL: readback aceitou detalhe adulterado" >&2; exit 1; fi
q -c "update coleta_log set detalhe='Não há manifesto judicial nominal aprovado para esta identidade; processos do governador homônimo não foram transferidos e nenhuma ausência foi inferida.' where fonte='processos-curadoria';" >/dev/null
q -c "update coleta_log set resultado='vazio_confirmado' where fonte='transparencia-sanctions';" >/dev/null
if q -Atq < "$READBACK" >/dev/null 2>&1; then echo "FAIL: readback aceitou ausencia fabricada" >&2; exit 1; fi
q -c "update coleta_log set resultado='indeterminado' where fonte='transparencia-sanctions';" >/dev/null
[[ "$(q -Atq < "$READBACK")" == "1|0|2|5|0" ]]
echo "  PASS  adulteracao de conteudo e ausencia fabricada abortam"

echo "P6: rollback devolve o pre-estado exato"
qtx < "$RBK" >/dev/null
[[ "$(q -Atq -c "select count(*) from coleta_log where fonte in ('destaques-sancoes','destaques-processos')")" == 2 ]]
[[ "$(q -Atq -c "select count(*) from coleta_log where fonte in ('transparencia-sanctions','processos-curadoria')")" == 0 ]]
[[ "$(q -Atq -c "select count(*) from supabase_migrations.schema_migrations where version='20260812125000'")" == 0 ]]
[[ "$(q -Atq < "$READBACK_124")" == "1|5|4|1|0" ]]
echo "  PASS  rollback exato e 124000 volta a exigir as chaves originais"

echo "P6b: rollback aborta sem a versao no ledger"
# Move as chaves sem gravar o ledger: o dado fica no pos-estado, mas a versao
# nunca foi aplicada. O rollback tem que recusar, senao desfaz o que nao escreveu.
qtx < "$FWD" >/dev/null
if qtx < "$RBK" >/dev/null 2>&1; then echo "FAIL: rollback rodou sem a versao no ledger" >&2; exit 1; fi
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260812125000');" >/dev/null
qtx < "$RBK" >/dev/null
[[ "$(q -Atq -c "select count(*) from coleta_log where fonte in ('destaques-sancoes','destaques-processos')")" == 2 ]]
[[ "$(q -Atq -c "select count(*) from supabase_migrations.schema_migrations where version='20260812125000'")" == 0 ]]
echo "  PASS  rollback exige a versao no ledger"

echo "P7: forward aborta se o destino ja estiver ocupado"
q -c "insert into coleta_log(fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza) values ('transparencia-sanctions','candidato','orleans-brandao','b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601','2026-08-01 00:00:00+00','erro',0,'coleta anterior',null,'outra','coleta');" >/dev/null
if qtx < "$FWD" >/dev/null 2>&1; then echo "FAIL: forward duplicou proveniencia" >&2; exit 1; fi
q -c "delete from coleta_log where execucao='outra';" >/dev/null
echo "  PASS  destino ocupado aborta"

echo "P8: forward aborta se outra ficha usar as chaves antigas"
q -c "insert into candidatos values ('11111111-1111-1111-1111-111111111111','outro-slug','Outro','1970-01-01','pre-candidato',true);" >/dev/null
q -c "insert into coleta_log(fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza) values ('destaques-sancoes','candidato','outro-slug','11111111-1111-1111-1111-111111111111','2026-08-01 00:00:00+00','indeterminado',0,'x',null,'outra','coleta');" >/dev/null
if qtx < "$FWD" >/dev/null 2>&1; then echo "FAIL: forward decidiu por outra ficha" >&2; exit 1; fi
q -c "delete from coleta_log where execucao='outra';" >/dev/null
echo "  PASS  chave antiga fora do Orleans aborta"

echo "P9: forward aborta sem a dependencia 124000 no ledger"
q -c "delete from supabase_migrations.schema_migrations where version='20260812124000';" >/dev/null
if qtx < "$FWD" >/dev/null 2>&1; then echo "FAIL: forward rodou sem dependencia" >&2; exit 1; fi
echo "  PASS  dependencia ausente aborta"

echo "PASS: migration 20260812125000 provada em PostgreSQL 17"
