#!/usr/bin/env bash
# Ensaio de restauração do backup do banco (M8 do master-review de 01/09/2026).
#
# Restaura um dump do workflow backup-db.yml num PostgreSQL 17 DESCARTÁVEL em
# Docker, mede o tempo de ponta a ponta e faz um readback mínimo. Nunca toca
# em banco remoto: o único destino aceito é o container que este script cria e
# destrói. O dump decifrado vive num diretório temporário e é apagado no fim,
# porque carrega PII (alert_subscribers).
#
# Uso:
#   scripts/audit/drill-restore-backup.sh <puxa-ficha-<UTC>.dump | .dump.enc> [--manter]
#
#   BACKUP_ENCRYPTION_KEY  obrigatória quando o arquivo termina em .enc (mesma
#                          chave do secret do Actions; nunca colar em log).
#   --manter               não derruba o container no fim (para inspeção manual;
#                          derrubar depois com `docker rm -f <id>`).
#
# Como obter o artifact mais recente (14 dias de retenção):
#   run_id="$(gh run list --workflow=backup-db.yml --status success --limit 1 --json databaseId -q '.[0].databaseId')"
#   gh run download "$run_id" --name "backup-db-$run_id" --dir backups/
#
# Saída: uma linha DRILL_RESTORE_OK=<json> com bytes, segundos de restore,
# tabelas, contagens das tabelas que só existem no banco, dado mais recente e
# erros do pg_restore. Registrar o resultado na tabela "Ensaios realizados" de
# docs/RUNBOOK-DR.md. Sai com 1 se o restore falhar ou o readback não bater.
set -euo pipefail

ARQUIVO="${1:-}"
MANTER=0
[[ "${2:-}" == "--manter" ]] && MANTER=1
# Mesma imagem, pelo digest, que o replay de migrations e as provas de apply usam.
IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"

if [[ -z "$ARQUIVO" ]]; then
  echo "uso: $0 <dump | dump.enc> [--manter]" >&2
  exit 2
fi
if [[ "$ARQUIVO" =~ ^postgres(ql)?:// ]]; then
  echo "FAIL: este ensaio restaura SOMENTE em container local; URL de banco nao e aceita" >&2
  exit 2
fi
if [[ ! -f "$ARQUIVO" ]]; then
  echo "FAIL: arquivo nao encontrado: $ARQUIVO" >&2
  exit 2
fi
command -v docker >/dev/null || { echo "FAIL: docker ausente" >&2; exit 2; }

TMP="$(mktemp -d)"
CONTAINER_ID=""
cleanup() {
  rm -rf "$TMP"
  if [[ -n "$CONTAINER_ID" && "$MANTER" -eq 0 ]]; then
    docker rm -f "$CONTAINER_ID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

DUMP="$ARQUIVO"
if [[ "$ARQUIVO" == *.enc ]]; then
  : "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY e obrigatoria para arquivo .enc}"
  DUMP="$TMP/restore.dump"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -pass env:BACKUP_ENCRYPTION_KEY -in "$ARQUIVO" -out "$DUMP"
fi
BYTES="$(wc -c < "$DUMP" | tr -d ' ')"

# pg_restore --list e a mesma prova minima do backup-supabase.sh: dump que nao
# lista esta corrompido, e falhar aqui e mais barato que subir o container.
INICIO_TOTAL="$(date +%s)"
CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
     && docker exec "$CONTAINER_ID" psql -U postgres -h 127.0.0.1 -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker cp "$DUMP" "$CONTAINER_ID:/tmp/restore.dump"
docker exec "$CONTAINER_ID" pg_restore -U postgres --list /tmp/restore.dump >/dev/null

q() {
  docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

# O dump e so do schema public; o que ele referencia de fora (schemas
# extensions e auth, papeis do Supabase) precisa existir antes, igual ao
# bootstrap do replay de migrations.
q -q <<'SQL'
create schema if not exists extensions;
create schema if not exists auth;
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists pgcrypto schema extensions;
create extension if not exists citext schema extensions;
create extension if not exists pg_trgm schema extensions;
create extension if not exists unaccent schema extensions;
alter database postgres set search_path to "$user", public, extensions;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
SQL

INICIO_RESTORE="$(date +%s)"
ERROS=0
set +e
docker exec "$CONTAINER_ID" pg_restore -U postgres --no-owner --no-privileges -d postgres /tmp/restore.dump > "$TMP/restore.log" 2>&1
RESTORE_RC=$?
set -e
# `schema "public" already exists` e ruido conhecido do pg_restore num banco
# recem-criado (o dump traz o CREATE SCHEMA public); nao conta como erro.
ERROS="$(grep 'pg_restore: error' "$TMP/restore.log" | grep -vc 'schema "public" already exists' || true)"
FIM_RESTORE="$(date +%s)"

TABELAS="$(q -Atq -c "select count(*) from pg_tables where schemaname='public'")"
if [[ "$TABELAS" -lt 10 ]]; then
  echo "FAIL: restore devolveu $TABELAS tabela(s) em public (esperado dezenas); log:" >&2
  tail -20 "$TMP/restore.log" >&2
  exit 1
fi

contagem() {
  q -Atq -c "select case when to_regclass('public.$1') is null then -1 else (select count(*) from public.$1) end" 2>/dev/null || echo -1
}
N_CANDIDATOS="$(contagem candidatos)"
N_ASSINANTES="$(contagem alert_subscribers)"
N_NOTICIAS="$(contagem noticias_candidato)"
N_COLETA="$(contagem coleta_log)"
DADO_MAIS_RECENTE="$(q -Atq -c "select coalesce(to_char(max(executado_em) at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), '') from public.coleta_log" 2>/dev/null || echo "")"

if [[ "$N_CANDIDATOS" -le 0 ]]; then
  echo "FAIL: readback: public.candidatos ausente ou vazia apos o restore" >&2
  exit 1
fi

FIM_TOTAL="$(date +%s)"
printf 'DRILL_RESTORE_OK={"arquivo":"%s","bytes":%s,"segundos_restore":%s,"segundos_total":%s,"pg_restore_rc":%s,"erros_pg_restore":%s,"tabelas_public":%s,"linhas":{"candidatos":%s,"alert_subscribers":%s,"noticias_candidato":%s,"coleta_log":%s},"dado_mais_recente_coleta_log":"%s","imagem":"%s"}\n' \
  "$(basename "$ARQUIVO")" "$BYTES" "$((FIM_RESTORE - INICIO_RESTORE))" "$((FIM_TOTAL - INICIO_TOTAL))" "$RESTORE_RC" "$ERROS" "$TABELAS" \
  "$N_CANDIDATOS" "$N_ASSINANTES" "$N_NOTICIAS" "$N_COLETA" "$DADO_MAIS_RECENTE" "$IMAGE"

if [[ "$ERROS" -gt 0 ]]; then
  echo "AVISO: pg_restore registrou $ERROS erro(s); primeiros 10:" >&2
  grep 'pg_restore: error' "$TMP/restore.log" | head -10 >&2
fi
if [[ "$MANTER" -eq 1 ]]; then
  echo "container mantido para inspecao: $CONTAINER_ID (derrubar com: docker rm -f $CONTAINER_ID)"
fi
