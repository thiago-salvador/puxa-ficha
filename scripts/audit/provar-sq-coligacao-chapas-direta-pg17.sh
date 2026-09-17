#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel de 20260916170000 (preenche
# chapas_2026.sq_coligacao para as duas chapas admitidas por fonte direta:
# PRTB presidencial e TO/Siqueira Campos Jr).
#
# Prova: no-op em banco vazio, abort sem escrita parcial quando a preimagem
# diverge (sq_coligacao ja preenchido, ou uma terceira linha aparece com
# sq_coligacao NULL), forward com pos-condicao completa (as duas linhas
# preenchidas com o valor certo, nenhuma outra tocada), segunda execucao
# recusada, rollback restaurando NULL nas duas, e rollback duplicado
# recusado.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260916170000"
MIGRATION="supabase/migrations/${VERSION}_preencher_sq_coligacao_chapas_direta.sql"
READBACK="supabase/readback/${VERSION}_preencher_sq_coligacao_chapas_direta.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_preencher_sq_coligacao_chapas_direta.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_preencher_sq_coligacao_chapas_direta.rollback.readback.sql"
for f in "$MIGRATION" "$READBACK" "$ROLLBACK" "$ROLLBACK_READBACK"; do
  [[ -f "$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
done

CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"
cleanup() { docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
     && docker exec "$CONTAINER_ID" psql -U postgres -h 127.0.0.1 -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q() { docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

schema() {
q -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS public.chapas_2026 (
  chave text PRIMARY KEY, fonte_tipo text, titular_sq_candidato text, vice_sq_candidato text,
  sq_coligacao text
);
CREATE TABLE IF NOT EXISTS public.coleta_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fonte text NOT NULL, escopo text, alvo text, candidato_id uuid,
  resultado text, volume integer, detalhe text, url text, execucao text, natureza text
);
SQL
}

seed() {
q -q <<'SQL'
INSERT INTO public.chapas_2026 (chave, fonte_tipo, titular_sq_candidato, vice_sq_candidato, sq_coligacao) VALUES
  ('2026:BR:pablo-henrique-costa-marcal', 'divulgacand_detalhe', '280002554479', '280002554490', NULL),
  ('2026:TO:jose-wilson-siqueira-campos-junior:270002554375', 'divulgacand_detalhe', '270002554375', '270002554376', NULL),
  ('controle', 'legado', '000', '001', 'ja-preenchido');
SQL
}

M="$MIGRATION"

# 1) Banco vazio: no-op, nao falha.
schema
q -q < "$M"
vazio="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations")"
[[ "$vazio" == "0" ]] || { echo "FAIL: migration escreveu no ledger em coorte vazia" >&2; exit 1; }

seed

# 2) Preimagem errada (terceira linha NULL aparece): aborta sem escrita parcial.
q -q -c "UPDATE public.chapas_2026 SET sq_coligacao=NULL WHERE chave='controle'"
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou com preimagem divergente (3a linha NULL)" >&2; exit 1
fi
parcial="$(q -Atq -c "SELECT count(*) FROM public.coleta_log")"
[[ "$parcial" == "0" ]] || { echo "FAIL: escrita parcial sobrou apos abort de preimagem" >&2; exit 1; }
q -q -c "UPDATE public.chapas_2026 SET sq_coligacao='ja-preenchido' WHERE chave='controle'"

# 3) Preimagem errada (PRTB ja preenchido): aborta sem escrita parcial.
q -q -c "UPDATE public.chapas_2026 SET sq_coligacao='intruso' WHERE chave='2026:BR:pablo-henrique-costa-marcal'"
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou com PRTB ja preenchido" >&2; exit 1
fi
q -q -c "UPDATE public.chapas_2026 SET sq_coligacao=NULL WHERE chave='2026:BR:pablo-henrique-costa-marcal'"

# 4) Forward limpo.
q -q < "$M"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('$VERSION')"
q -q < "$READBACK"

prtb_ok="$(q -Atq -c "SELECT sq_coligacao FROM public.chapas_2026 WHERE chave='2026:BR:pablo-henrique-costa-marcal'")"
[[ "$prtb_ok" == "280001801455" ]] || { echo "FAIL: PRTB sq_coligacao nao preenchido ($prtb_ok)" >&2; exit 1; }
to_ok="$(q -Atq -c "SELECT sq_coligacao FROM public.chapas_2026 WHERE chave='2026:TO:jose-wilson-siqueira-campos-junior:270002554375'")"
[[ "$to_ok" == "270001800814" ]] || { echo "FAIL: TO sq_coligacao nao preenchido ($to_ok)" >&2; exit 1; }
controle_intacto="$(q -Atq -c "SELECT count(*) FROM public.chapas_2026 WHERE chave='controle' AND sq_coligacao='ja-preenchido'")"
[[ "$controle_intacto" == "1" ]] || { echo "FAIL: linha de controle foi tocada" >&2; exit 1; }

# 5) Segunda execucao: recusa.
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou de novo sobre estado ja preenchido" >&2; exit 1
fi

# 6) Rollback restaura NULL nas duas.
q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"
prtb_apos="$(q -Atq -c "SELECT sq_coligacao IS NULL FROM public.chapas_2026 WHERE chave='2026:BR:pablo-henrique-costa-marcal'")"
[[ "$prtb_apos" == "t" ]] || { echo "FAIL: rollback nao restaurou NULL no PRTB" >&2; exit 1; }
to_apos="$(q -Atq -c "SELECT sq_coligacao IS NULL FROM public.chapas_2026 WHERE chave='2026:TO:jose-wilson-siqueira-campos-junior:270002554375'")"
[[ "$to_apos" == "t" ]] || { echo "FAIL: rollback nao restaurou NULL no TO" >&2; exit 1; }
ledger_apos_rollback="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations")"
[[ "$ledger_apos_rollback" == "0" ]] || { echo "FAIL: ledger apos rollback = $ledger_apos_rollback" >&2; exit 1; }

# 7) Rollback duplicado: recusa.
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: segundo rollback nao foi recusado" >&2; exit 1
fi

echo "PASS: preenchimento de sq_coligacao das chapas de fonte direta tem no-op de coorte vazia, abort sem escrita parcial em preimagem divergente (linha intrusa e linha ja preenchida), forward com pos-condicao completa, segunda execucao recusada, rollback restaurando NULL e rollback duplicado recusado, provados em PostgreSQL 17"
