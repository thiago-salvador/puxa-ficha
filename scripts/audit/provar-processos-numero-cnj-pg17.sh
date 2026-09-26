#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartável as migrations 20260926190000 (numero_processo
# de wilson-grassi-junior volta ao número único CNJ e status passa a arquivado) e
# 20260926190100 (CHECK de
# número CNJ válido em processos), sobre o schema real de candidatos e
# coleta_log (scripts/audit/lib/chapas-2026-real-schema.sql) e as colunas reais
# de processos: readbacks reprovam o pré-estado, a migration de dado reprova
# preimagem adulterada, forward e readbacks em ordem, a CHECK recusa o sufixo de
# incidente, dígito verificador errado e número sem máscara, aceita CNJ válido e
# NULL, preserva as três linhas legadas sem VALIDATE e barra UPDATE nelas,
# readback reprova postimagem adulterada, rollback recusa migration posterior
# no ledger, rollback em ordem inversa com readbacks de rollback, e sentinelas
# intactas.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
V="20260926190000_processo_wilson_grassi_numero_cnj"
V2="20260926190100_processos_numero_cnj_check"
REAL_SCHEMA="scripts/audit/lib/chapas-2026-real-schema.sql"
for f in "supabase/migrations/$V.sql" "supabase/migrations/$V2.sql" "$REAL_SCHEMA"; do
  [[ -f "$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
done

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

falha_esperada() {
  local rotulo="$1" arquivo="$2"
  if q -q < "$arquivo" >/dev/null 2>&1; then
    echo "FAIL: $rotulo" >&2
    exit 1
  fi
}

falha_sql() {
  local rotulo="$1" sql="$2"
  if q -q -c "$sql" >/dev/null 2>&1; then
    echo "FAIL: $rotulo" >&2
    exit 1
  fi
}

q -q < "$REAL_SCHEMA"
q -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE TABLE public.processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid REFERENCES public.candidatos(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  tribunal text,
  numero_processo text,
  descricao text NOT NULL,
  status text,
  data_inicio date,
  data_decisao date,
  gravidade text,
  fonte text,
  url_fonte text,
  created_at timestamptz DEFAULT now()
);

INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key)
VALUES ('20260926180200', 'sha256:fixture');

INSERT INTO public.candidatos (id, slug, nome_completo, nome_urna, partido_atual, partido_sigla, cargo_disputado, estado, status, publicavel) VALUES
  ('a0917c03-3569-46d5-9ce9-14969f64b866','wilson-grassi-junior','WILSON GRASSI JUNIOR','WILSON GRASSI','PARTIDO','PTD','Deputado Federal','SP','candidato',false),
  ('00000000-0000-4000-8000-0000000000b1','flavio-bolsonaro','FLAVIO','FLAVIO','PARTIDO','PTD','Presidente',NULL,'candidato',false),
  ('00000000-0000-4000-8000-0000000000b2','tarcisio-gov-sp','TARCISIO','TARCISIO','PARTIDO','PTD','Governador','SP','candidato',false),
  ('00000000-0000-4000-8000-0000000000b3','felicio-ramuth','FELICIO','FELICIO','PARTIDO','PTD','Governador','SP','candidato',false);

INSERT INTO public.processos (id, candidato_id, tipo, tribunal, numero_processo, descricao, status, fonte, url_fonte, created_at) VALUES
  ('6d93a421-403d-401d-a6ad-a50b03970b81','a0917c03-3569-46d5-9ce9-14969f64b866','civil','TJSP','2254046-86.2021.8.26.0000/50000',
   'Agravo regimental civel 2254046-86.2021.8.26.0000/50000, TJSP Orgao Especial. Wilson Grassi Junior figura como agravante; agravado: Prefeito do Municipio de Sao Paulo. Negaram provimento, unanime. Nao e acao penal.',
   'em tramitacao (comunicacao publicada)','onda-p-20260814: DJEN/CNJ','https://www.tjsp.jus.br/OrgaoEspecial/Comunicados/Comunicado?codigoComunicado=30327&pagina=2','2026-08-14 16:13:40.582907+00'),
  -- sentinelas: três legados fora do padrão e um CNJ válido
  ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000b1','criminal','STF','HC 201965','legado stf',NULL,NULL,NULL,'2026-08-01T00:00:00Z'),
  ('00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000b2','procedural','TCU','TC 008.761/2020-5','legado tcu',NULL,NULL,NULL,'2026-08-01T00:00:00Z'),
  ('00000000-0000-4000-8000-0000000000d3','00000000-0000-4000-8000-0000000000b3','procedural','TCE-SP','43.0719.0000337/2020-0','legado tce',NULL,NULL,NULL,'2026-08-01T00:00:00Z'),
  ('00000000-0000-4000-8000-0000000000d4','a0917c03-3569-46d5-9ce9-14969f64b866','civil','TJSP','2254046-86.2021.8.26.0000','sentinela cnj',NULL,NULL,NULL,'2026-08-01T00:00:00Z');
SQL

digest_processos() {
  q -Atq -c "SELECT md5(string_agg(to_jsonb(p)::text,'' ORDER BY p.id)) FROM public.processos p"
}
digest_sentinelas() {
  q -Atq -c "SELECT md5(string_agg(to_jsonb(p)::text,'' ORDER BY p.id)) FROM public.processos p WHERE p.id <> '6d93a421-403d-401d-a6ad-a50b03970b81'"
}
tudo_antes="$(digest_processos)"
sentinelas_antes="$(digest_sentinelas)"

falha_esperada "readback de dado aceitou o pré-estado" "supabase/readback/$V.readback.sql"
falha_esperada "readback da CHECK aceitou o pré-estado" "supabase/readback/$V2.readback.sql"

q -q -c "UPDATE public.processos SET descricao = descricao || ' x' WHERE id='6d93a421-403d-401d-a6ad-a50b03970b81'"
falha_esperada "migration aceitou preimagem adulterada" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.processos SET descricao = left(descricao, length(descricao) - 2) WHERE id='6d93a421-403d-401d-a6ad-a50b03970b81'"
[[ "$(digest_processos)" == "$tudo_antes" ]] || { echo "FAIL: restauração da adulteração" >&2; exit 1; }

q -q < "supabase/migrations/$V.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260926190000', 'sha256:fixture')"
q -q < "supabase/readback/$V.readback.sql"
q -q < "supabase/migrations/$V2.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260926190100', 'sha256:fixture')"
q -q < "supabase/readback/$V2.readback.sql"

numero="$(q -Atq -c "SELECT numero_processo || '|' || status FROM public.processos WHERE id='6d93a421-403d-401d-a6ad-a50b03970b81'")"
[[ "$numero" == "2254046-86.2021.8.26.0000|arquivado" ]] || { echo "FAIL: forward inesperado: $numero" >&2; exit 1; }
[[ "$(digest_sentinelas)" == "$sentinelas_antes" ]] || { echo "FAIL: forward tocou sentinela" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT convalidated FROM pg_constraint WHERE conname='processos_numero_processo_cnj_check'")" == "f" ]] || { echo "FAIL: CHECK deveria ficar NOT VALID" >&2; exit 1; }

ins="INSERT INTO public.processos (candidato_id, tipo, tribunal, descricao, numero_processo) VALUES ('a0917c03-3569-46d5-9ce9-14969f64b866','civil','TJSP','teste',"
falha_sql "CHECK aceitou sufixo de incidente" "${ins}'2254046-86.2021.8.26.0000/50000')"
falha_sql "CHECK aceitou dígito verificador errado" "${ins}'2254046-87.2021.8.26.0000')"
falha_sql "CHECK aceitou número sem máscara" "${ins}'22540468620218260000')"
falha_sql "CHECK aceitou identificador de TCU" "${ins}'TC 008.761/2020-5')"
falha_sql "CHECK aceitou UPDATE em linha legada" "UPDATE public.processos SET status='x' WHERE id='00000000-0000-4000-8000-0000000000d2'"
falha_sql "CHECK aceitou UPDATE que volta ao número de 25 dígitos" "UPDATE public.processos SET numero_processo='2254046-86.2021.8.26.0000/50000' WHERE id='6d93a421-403d-401d-a6ad-a50b03970b81'"
q -q -c "BEGIN; ${ins}'1000001-08.2020.8.26.0053'); ${ins}NULL); ROLLBACK;" || { echo "FAIL: CHECK recusou CNJ válido ou NULL" >&2; exit 1; }
q -q -c "BEGIN; SET LOCAL ROLE service_role; SELECT public.processo_numero_cnj_valido('2254046-86.2021.8.26.0000'); ROLLBACK;" >/dev/null \
  || { echo "FAIL: service_role sem EXECUTE no validador" >&2; exit 1; }
falha_sql "anon com EXECUTE no validador" "BEGIN; SET LOCAL ROLE anon; SELECT public.processo_numero_cnj_valido('2254046-86.2021.8.26.0000'); ROLLBACK;"

q -q -c "ALTER TABLE public.processos DROP CONSTRAINT processos_numero_processo_cnj_check"
q -q -c "UPDATE public.processos SET numero_processo='2254046-86.2021.8.26.0000/50000' WHERE id='00000000-0000-4000-8000-0000000000d4'"
q -q -c "ALTER TABLE public.processos ADD CONSTRAINT processos_numero_processo_cnj_check CHECK (numero_processo IS NULL OR public.processo_numero_cnj_valido(numero_processo)) NOT VALID"
falha_esperada "readback da CHECK aceitou número fora da regra além dos legados" "supabase/readback/$V2.readback.sql"
q -q -c "ALTER TABLE public.processos DROP CONSTRAINT processos_numero_processo_cnj_check"
q -q -c "UPDATE public.processos SET numero_processo='2254046-86.2021.8.26.0000' WHERE id='00000000-0000-4000-8000-0000000000d4'"
q -q -c "ALTER TABLE public.processos ADD CONSTRAINT processos_numero_processo_cnj_check CHECK (numero_processo IS NULL OR public.processo_numero_cnj_valido(numero_processo)) NOT VALID"
q -q < "supabase/readback/$V2.readback.sql"

# Igualdade, não subconjunto: se um legado sai da lista sem a migration dizer, o readback reprova.
q -q -c "ALTER TABLE public.processos DROP CONSTRAINT processos_numero_processo_cnj_check"
q -q -c "UPDATE public.processos SET numero_processo=NULL WHERE id='00000000-0000-4000-8000-0000000000d3'"
falha_esperada "readback da CHECK aceitou só dois dos três legados" "supabase/readback/$V2.readback.sql"
q -q -c "UPDATE public.processos SET numero_processo='43.0719.0000337/2020-0' WHERE id='00000000-0000-4000-8000-0000000000d3'"
q -q -c "ALTER TABLE public.processos ADD CONSTRAINT processos_numero_processo_cnj_check CHECK (numero_processo IS NULL OR public.processo_numero_cnj_valido(numero_processo)) NOT VALID"
q -q < "supabase/readback/$V2.readback.sql"

q -q -c "UPDATE public.processos SET status='em_andamento' WHERE id='6d93a421-403d-401d-a6ad-a50b03970b81'"
falha_esperada "readback de dado aceitou status adulterado" "supabase/readback/$V.readback.sql"
q -q -c "UPDATE public.processos SET status='arquivado' WHERE id='6d93a421-403d-401d-a6ad-a50b03970b81'"

q -q -c "UPDATE public.processos SET numero_processo='1000001-08.2020.8.26.0053' WHERE id='6d93a421-403d-401d-a6ad-a50b03970b81'"
falha_esperada "readback de dado aceitou postimagem adulterada" "supabase/readback/$V.readback.sql"
q -q -c "UPDATE public.processos SET numero_processo='2254046-86.2021.8.26.0000' WHERE id='6d93a421-403d-401d-a6ad-a50b03970b81'"
q -q < "supabase/readback/$V.readback.sql"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260930000000', 'sha256:future')"
falha_esperada "rollback da CHECK aceitou migration posterior" "supabase/rollback/$V2.rollback.sql"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260930000000'"
falha_esperada "rollback de dado aceitou a CHECK no topo" "supabase/rollback/$V.rollback.sql"

q -q < "supabase/rollback/$V2.rollback.sql"
q -q < "supabase/readback/$V2.rollback.readback.sql"
q -q < "supabase/rollback/$V.rollback.sql"
q -q < "supabase/readback/$V.rollback.readback.sql"

[[ "$(digest_processos)" == "$tudo_antes" ]] || { echo "FAIL: rollback não devolveu o estado inicial" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT max(version) FROM supabase_migrations.schema_migrations")" == "20260926180200" ]] || { echo "FAIL: ledger final" >&2; exit 1; }

echo "PASS: número CNJ e status de wilson-grassi-junior e CHECK de número CNJ em processos têm pré-estado, preimagem adulterada, forward, sufixo de incidente, dígito errado, número sem máscara, identificador não judicial, legados sem VALIDATE e comparados por igualdade, status adulterado, grants, readbacks, postimagem adulterada, migration posterior, rollback inverso e sentinelas provados em PostgreSQL 17"
