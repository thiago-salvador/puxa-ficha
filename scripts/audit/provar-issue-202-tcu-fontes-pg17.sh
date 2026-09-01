#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260901180000"
MIGRATION="supabase/migrations/${VERSION}_reancorar_tcu_fontes_curadas_issue_202.sql"
READBACK="supabase/readback/${VERSION}_reancorar_tcu_fontes_curadas_issue_202.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_reancorar_tcu_fontes_curadas_issue_202.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_reancorar_tcu_fontes_curadas_issue_202.rollback.readback.sql"
CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"

cleanup() {
  docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
     && docker exec "$CONTAINER_ID" psql -U postgres -h 127.0.0.1 -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q() {
  docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

q -q <<'SQL'
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[]
);
INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key)
VALUES ('20260830151500', 'sha256:59c212dd68c913a2e98836cf109ad32fa9bc21b40826bb67035a277589ab095a');

CREATE TABLE public.pontos_atencao (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL,
  categoria text NOT NULL,
  titulo text NOT NULL,
  descricao text NOT NULL,
  fontes jsonb NOT NULL,
  dados_relacionados jsonb,
  gravidade text NOT NULL,
  verificado boolean NOT NULL,
  gerado_por text NOT NULL,
  visivel boolean NOT NULL,
  despublicacao_motivo text,
  despublicado_em timestamptz
);

-- As duas claims curadas pela issue #96 (20260825123000), que precisam
-- continuar no ar e intocadas.
INSERT INTO public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel)
VALUES
  ('98d9c7c6-263f-45dd-9442-e568106bae7c', '76a6620b-1fd4-46df-806f-5101bd660f7f',
   'processo_grave', 'TCU julgou irregulares contas no Acórdão 3121/2015',
   'No Acórdão 3121/2015 da Primeira Câmara, o TCU julgou irregulares as contas de Cícero de Lucena Filho no processo 015.688/2007-6. Trata-se de decisão administrativa do TCU, não de condenação criminal.',
   '[{"url":"https://pesquisa.apps.tcu.gov.br/rest/publico/base/acordao-completo/documento?termo=*&filtro=NUMACORDAO%3A3121%20ANOACORDAO%3A2015%20COLEGIADO%3A%22Primeira%20C%C3%A2mara%22&ordenacao=DTRELEVANCIA%20desc%2C%20NUMACORDAOINT%20desc&quantidade=1&inicio=0","data":"2026-08-25","titulo":"TCU, Acórdão 3121/2015 da Primeira Câmara"}]',
   'critica', true, 'curadoria', true),
  ('a6efc579-1e51-4b2a-9f3e-38eb897183a8', '914d9904-1c6a-47f9-a25f-017138dc1cef',
   'processo_grave', 'TCU julgou irregulares contas no Acórdão 1488/2025',
   'No Acórdão 1488/2025 da Primeira Câmara, o TCU julgou irregulares as contas de Elizeu Morais de Aguiar no processo 006.099/2022-0. Trata-se de decisão administrativa do TCU, não de condenação criminal.',
   '[{"url":"https://pesquisa.apps.tcu.gov.br/rest/publico/base/acordao-completo/documento?termo=*&filtro=NUMACORDAO%3A1488%20ANOACORDAO%3A2025%20COLEGIADO%3A%22Primeira%20C%C3%A2mara%22&ordenacao=DTRELEVANCIA%20desc%2C%20NUMACORDAOINT%20desc&quantidade=1&inicio=0","data":"2026-08-25","titulo":"TCU, Acórdão 1488/2025 da Primeira Câmara"}]',
   'critica', true, 'curadoria', true);

-- As duas copias automaticas que o reingest de 28/08/2026 criou.
INSERT INTO public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel)
VALUES
  ('2fefa3f5-3b42-4a5a-a72b-2b28d09df018', '76a6620b-1fd4-46df-806f-5101bd660f7f',
   'processo_grave', 'Contas irregulares no TCU',
   'Acórdão: 3121/2015-1C | Processo: 015.688/2007-6 | Trânsito em julgado: 25/05/2018',
   '[{"url":"https://conecta-tcu.apps.tcu.gov.br/tvp/42733993","data":"2026-08-28","titulo":"TCU — processo com contas julgadas irregulares"}]',
   'critica', false, 'automatico', true),
  ('c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae', '914d9904-1c6a-47f9-a25f-017138dc1cef',
   'processo_grave', 'Contas irregulares no TCU',
   'Acórdão: 1488/2025-1C | Processo: 006.099/2022-0 | Trânsito em julgado: 21/03/2026',
   '[{"url":"https://conecta-tcu.apps.tcu.gov.br/tvp/70662366","data":"2026-08-28","titulo":"TCU — processo com contas julgadas irregulares"}]',
   'critica', false, 'automatico', true);

-- Sentinela: qualquer escrita fora do recorte aparece no digest.
INSERT INTO public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel)
VALUES
  ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
   'processo_grave', 'Contas irregulares no TCU',
   'sentinela, nao alterar',
   '[{"url":"https://conecta-tcu.apps.tcu.gov.br/tvp/99999999","data":"2026-08-28","titulo":"sentinela"}]',
   'critica', false, 'automatico', true);
SQL

digest_fora() {
  q -Atq -c "SELECT md5(coalesce(string_agg(row_to_json(p)::text,'' ORDER BY p.id),'')) FROM public.pontos_atencao p WHERE p.id NOT IN ('2fefa3f5-3b42-4a5a-a72b-2b28d09df018','c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae')"
}

before_fora="$(digest_fora)"

if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback forward aceitou o pre-estado" >&2
  exit 1
fi

# Preimagem adulterada: a migration tem que recusar.
q -q -c "UPDATE public.pontos_atencao SET fontes='[{\"url\":\"https://exemplo.invalido/x\"}]'::jsonb WHERE id='2fefa3f5-3b42-4a5a-a72b-2b28d09df018'"
if q -q < "$MIGRATION" >/dev/null 2>&1; then
  echo "FAIL: migration aceitou preimagem adulterada de fontes" >&2
  exit 1
fi
q -q -c "UPDATE public.pontos_atencao SET fontes='[{\"url\":\"https://conecta-tcu.apps.tcu.gov.br/tvp/42733993\",\"data\":\"2026-08-28\",\"titulo\":\"TCU — processo com contas julgadas irregulares\"}]'::jsonb WHERE id='2fefa3f5-3b42-4a5a-a72b-2b28d09df018'"

# Claim curada fora do ar: despublicar a copia deixaria o candidato sem a
# informacao, entao a migration tem que recusar tambem esse estado.
q -q -c "UPDATE public.pontos_atencao SET visivel=false WHERE id='98d9c7c6-263f-45dd-9442-e568106bae7c'"
if q -q < "$MIGRATION" >/dev/null 2>&1; then
  echo "FAIL: migration aceitou claim curada fora do ar" >&2
  exit 1
fi
q -q -c "UPDATE public.pontos_atencao SET visivel=true WHERE id='98d9c7c6-263f-45dd-9442-e568106bae7c'"

q -q < "$MIGRATION"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$VERSION', 'sha256:fixture')"
q -q < "$READBACK"

forward_state="$(q -Atq -F '|' -c "SELECT count(*) FILTER (WHERE visivel=false), count(*) FILTER (WHERE fontes::text LIKE '%pesquisa.apps.tcu.gov.br%'), count(*) FILTER (WHERE fontes::text LIKE '%conecta-tcu%') FROM public.pontos_atencao WHERE id IN ('2fefa3f5-3b42-4a5a-a72b-2b28d09df018','c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae')")"
[[ "$forward_state" == "2|2|0" ]] || {
  echo "FAIL: forward inesperado $forward_state" >&2
  exit 1
}

after_forward_fora="$(digest_fora)"
[[ "$after_forward_fora" == "$before_fora" ]] || {
  echo "FAIL: forward tocou linha fora do recorte" >&2
  exit 1
}

# Idempotencia: reexecutar a migration sobre a posimagem exata nao pode falhar
# nem alterar nada.
q -q < "$MIGRATION"
[[ "$(digest_fora)" == "$before_fora" ]]
q -q < "$READBACK"

# Readback nao pode aceitar posimagem adulterada.
q -q -c "UPDATE public.pontos_atencao SET visivel=true WHERE id='c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae'"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou posimagem adulterada" >&2
  exit 1
fi
q -q -c "UPDATE public.pontos_atencao SET visivel=false WHERE id='c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae'"

# Rollback recusa migration posterior no ledger.
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260902000000', 'sha256:future')"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou migration posterior" >&2
  exit 1
fi
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260902000000'"

q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"

rollback_state="$(q -Atq -F '|' -c "SELECT count(*) FILTER (WHERE visivel=true), count(*) FILTER (WHERE fontes::text LIKE '%conecta-tcu%'), count(*) FILTER (WHERE dados_relacionados ? 'issue_202_tcu_fontes_2026_09_01'), (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='$VERSION') FROM public.pontos_atencao WHERE id IN ('2fefa3f5-3b42-4a5a-a72b-2b28d09df018','c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae')")"
[[ "$rollback_state" == "2|2|0|0" ]] || {
  echo "FAIL: rollback inesperado $rollback_state" >&2
  exit 1
}

[[ "$(digest_fora)" == "$before_fora" ]] || {
  echo "FAIL: rollback tocou linha fora do recorte" >&2
  exit 1
}

echo "PASS: issue #202 tem forward, adulteracao de preimagem, curada fora do ar, idempotencia, readbacks, migration posterior, rollback e sentinela provados em PostgreSQL 17"
