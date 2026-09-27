#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartável as migrations 20260925220000,
# 20260925220100 e 20260925220200: readback reprova o pré-estado, migration
# reprova preimagem adulterada, forward e readbacks em ordem, readback reprova
# postimagem adulterada, rollback recusa migration posterior no ledger,
# rollback em ordem inversa com readbacks de rollback, e sentinelas intactas.
# A migration de cargo_atual também é provada com uma ficha já limpa (NULL)
# pelo ingest corrigido antes do apply.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
V1="20260925220000_senado_situacao_curi_ribeiro_afonso"
V2="20260925220100_claims_contagem_mandatos"
V3="20260925220200_cargo_atual_ex_senadores"
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

ledger() {
  q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$1', 'sha256:fixture')"
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
VALUES ('20260925163543', 'sha256:5850d05b51486fixture');

CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  sq_candidato_2026 text,
  cargo_disputado text,
  situacao_candidatura text,
  status text NOT NULL,
  publicavel boolean NOT NULL,
  cargo_atual text,
  ultima_atualizacao timestamptz,
  CONSTRAINT candidatos_situacao_candidatura_dominio CHECK (situacao_candidatura = ANY (ARRAY['aguardando julgamento','candidatura declarada','incerto','deferido','deferido com recurso','indeferido','indeferido com recurso','pendente de julgamento'])),
  CONSTRAINT candidatos_status_dominio CHECK (status = ANY (ARRAY['pre-candidato','candidato','indeferido','desistente','removido'])),
  CONSTRAINT candidatos_publicavel_requires_disputa CHECK (publicavel IS NOT TRUE OR (cargo_disputado IS NOT NULL AND status <> ALL (ARRAY['removido','desistente'])))
);
CREATE VIEW public.candidatos_publico AS SELECT * FROM public.candidatos WHERE publicavel;

CREATE TABLE public.pontos_atencao (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL,
  titulo text NOT NULL,
  descricao text NOT NULL,
  fontes jsonb,
  gerado_por text,
  verificado boolean,
  visivel boolean,
  despublicado_em timestamptz
);
-- Mesmo corpo do trigger de producao bloquear_contagem_ia_cargos_como_mandatos.
CREATE FUNCTION public.bloquear_contagem_ia_cargos_como_mandatos() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.gerado_por = 'ia'
     AND NEW.titulo ~* '^Carreira política:[[:space:]]*[0-9]+[[:space:]]+mandato' THEN
    RAISE EXCEPTION 'ponto de carreira de IA recusado: o título conta cargos distintos como mandatos'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$f$;
CREATE TRIGGER trg_bloquear_contagem_ia_cargos_como_mandatos BEFORE INSERT OR UPDATE ON public.pontos_atencao
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_contagem_ia_cargos_como_mandatos();

CREATE TABLE public.identidade_timeline_quarentena_snapshot (
  migration_version text NOT NULL,
  tabela text NOT NULL,
  row_id uuid NOT NULL,
  candidato_id uuid,
  preimage jsonb NOT NULL,
  postimage jsonb NOT NULL,
  registrado_em timestamptz NOT NULL,
  PRIMARY KEY (migration_version, tabela, row_id)
);
CREATE TABLE public.coleta_log (
  id bigserial PRIMARY KEY,
  fonte text NOT NULL,
  escopo text NOT NULL,
  alvo text NOT NULL,
  candidato_id uuid,
  resultado text NOT NULL,
  volume integer NOT NULL,
  detalhe text NOT NULL,
  url text NOT NULL,
  execucao text NOT NULL,
  natureza text,
  executado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.candidatos(id, slug, sq_candidato_2026, cargo_disputado, situacao_candidatura, status, publicavel, cargo_atual, ultima_atualizacao) VALUES
  ('00000000-0000-4000-8000-000000000001','alexandre-curi','160002547963','Senador','aguardando julgamento','candidato',true,NULL,'2026-09-24T17:22:00Z'),
  ('00000000-0000-4000-8000-000000000002','tse-2026-190002554290','190002554290','Senador','aguardando julgamento','candidato',true,NULL,'2026-09-24T17:22:00Z'),
  ('00000000-0000-4000-8000-000000000003','jorginho-mello','240002537073','Governador','deferido','candidato',true,'Senador(a)','2026-09-20T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000004','mailza-assis','10002544107','Governador','deferido','candidato',true,'Senador(a)','2026-09-20T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000005','tse-2026-100002549583','100002549583','Senador','deferido','candidato',true,'Senador(a)','2026-09-20T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000006','tse-2026-10002544274','10002544274','Senador','deferido','candidato',true,'Senador(a)','2026-09-20T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000007','tse-2026-110002551967','110002551967','Senador','deferido','candidato',true,'Senador(a)','2026-09-20T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000008','tse-2026-160002547656','160002547656','Senador','deferido','candidato',true,'Senador(a)','2026-09-20T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000009','tse-2026-190002548141','190002548141','Senador','deferido','candidato',true,'Senador(a)','2026-09-20T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000010','tse-2026-190002550184','190002550184','Senador','deferido','candidato',true,'Senador(a)','2026-09-20T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000011','tse-2026-220002541490','220002541490','Senador','deferido','candidato',true,'Senador(a)','2026-09-20T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000099','sentinela-senador','999','Senador','deferido','candidato',true,'Senador(a)','2026-09-20T00:00:00Z');

INSERT INTO public.pontos_atencao(id, candidato_id, titulo, descricao, fontes, gerado_por, verificado, visivel, despublicado_em) VALUES
  ('59afc792-415e-4e59-9fc0-6f71ea883b0c','00000000-0000-4000-8000-000000000098',
   'Carreira política: 2 mandato(s) registrado(s)',
   'Hana Ghassan Tuma (MDB) possui 2 mandato(s) registrado(s): Vice-Governador (PA), Secretário Estadual.',
   '[{"url": "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/PA/2040602022/candidato/140001651992", "titulo": "TSE DivulgaCand 2022 - Hana Ghassan"}, {"url": "https://www.agenciapara.com.br/noticia/65077/hana-ghassan-assume-o-governo-do-para-em-cerimonia-no-palacio-dos-despachos", "titulo": "Agencia Para - posse no Governo do Para"}]',
   'curadoria', true, true, NULL),
  ('337bc0e5-614c-433d-8da9-584e3fee29f7','00000000-0000-4000-8000-000000000097',
   'Carreira política: 5 cargo(s) eletivo(s) registrado(s)','sentinela Ferraço','[]','ia',true,true,NULL);
-- Linha de IA antiga com o título proibido entra antes do trigger existir em
-- produção; aqui entra com o trigger desligado, só para a sentinela.
ALTER TABLE public.pontos_atencao DISABLE TRIGGER trg_bloquear_contagem_ia_cargos_como_mandatos;
INSERT INTO public.pontos_atencao(id, candidato_id, titulo, descricao, fontes, gerado_por, verificado, visivel, despublicado_em) VALUES
  ('ddf1d924-7480-41ba-b212-7ebfef785cd0','00000000-0000-4000-8000-000000000096',
   'Carreira política: 1 mandato(s) registrado(s)','Janaina Riva (MDB) possui 1 mandato(s) registrado(s): Deputado Estadual (MT).','[]','ia',false,true,NULL);
ALTER TABLE public.pontos_atencao ENABLE TRIGGER trg_bloquear_contagem_ia_cargos_como_mandatos;
SQL

digest_sentinelas() {
  q -Atq -c "SELECT md5(coalesce((SELECT string_agg(row_to_json(c)::text,'' ORDER BY c.id) FROM public.candidatos c WHERE c.slug='sentinela-senador'),'') || coalesce((SELECT string_agg(row_to_json(p)::text,'' ORDER BY p.id) FROM public.pontos_atencao p WHERE p.id <> '59afc792-415e-4e59-9fc0-6f71ea883b0c'),''))"
}
digest_tudo() {
  q -Atq -c "SELECT md5((SELECT string_agg(row_to_json(c)::text,'' ORDER BY c.id) FROM public.candidatos c) || (SELECT string_agg(row_to_json(p)::text,'' ORDER BY p.id) FROM public.pontos_atencao p))"
}
sentinelas_antes="$(digest_sentinelas)"
tudo_antes="$(digest_tudo)"

# Readbacks reprovam o pré-estado.
falha_esperada "readback de situação aceitou o pré-estado" "supabase/readback/$V1.readback.sql"
falha_esperada "readback de claims aceitou o pré-estado" "supabase/readback/$V2.readback.sql"
falha_esperada "readback de cargo_atual aceitou o pré-estado" "supabase/readback/$V3.readback.sql"

# Migrations reprovam preimagem adulterada.
q -q -c "UPDATE public.candidatos SET situacao_candidatura='pendente de julgamento' WHERE slug='alexandre-curi'"
falha_esperada "migration de situação aceitou preimagem adulterada" "supabase/migrations/$V1.sql"
q -q -c "UPDATE public.candidatos SET situacao_candidatura='aguardando julgamento' WHERE slug='alexandre-curi'"
q -q -c "UPDATE public.pontos_atencao SET descricao=descricao || ' ' WHERE id='59afc792-415e-4e59-9fc0-6f71ea883b0c'"
falha_esperada "migration de claims aceitou preimagem adulterada" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.pontos_atencao SET descricao=rtrim(descricao) WHERE id='59afc792-415e-4e59-9fc0-6f71ea883b0c'"
# Guard falha fechada: a mesma claim marcada como IA não é tocada.
# (o próprio trigger recusa marcar como IA uma linha com esse título; a
# fixture o desliga só para montar e desmontar o caso)
fixture_gerado_por() {
  q -q -c "ALTER TABLE public.pontos_atencao DISABLE TRIGGER trg_bloquear_contagem_ia_cargos_como_mandatos; UPDATE public.pontos_atencao SET gerado_por='$1' WHERE id='59afc792-415e-4e59-9fc0-6f71ea883b0c'; ALTER TABLE public.pontos_atencao ENABLE TRIGGER trg_bloquear_contagem_ia_cargos_como_mandatos;"
}
fixture_gerado_por ia
falha_esperada "migration de claims aceitou claim de IA" "supabase/migrations/$V2.sql"
fixture_gerado_por curadoria
q -q -c "UPDATE public.candidatos SET cargo_atual='Ministro' WHERE slug='tse-2026-160002547656'"
falha_esperada "migration de cargo_atual aceitou preimagem adulterada" "supabase/migrations/$V3.sql"
# NULL só vale como preimagem onde o cargo final também é NULL.
q -q -c "UPDATE public.candidatos SET cargo_atual=NULL WHERE slug='tse-2026-160002547656'"
falha_esperada "migration de cargo_atual aceitou NULL numa linha com cargo final preenchido" "supabase/migrations/$V3.sql"
q -q -c "UPDATE public.candidatos SET cargo_atual='Senador(a)' WHERE slug='tse-2026-160002547656'"
# SQ trocado reprova mesmo com slug certo.
q -q -c "UPDATE public.candidatos SET sq_candidato_2026='0' WHERE slug='mailza-assis'"
falha_esperada "migration de cargo_atual aceitou SQ divergente" "supabase/migrations/$V3.sql"
q -q -c "UPDATE public.candidatos SET sq_candidato_2026='10002544107' WHERE slug='mailza-assis'"
# Ficha já limpa pelo ingest corrigido (NULL) numa linha de cargo final NULL é aceita e não é reescrita.
q -q -c "UPDATE public.candidatos SET cargo_atual=NULL WHERE slug='tse-2026-110002551967'"
[[ "$(q -Atq -c "SELECT count(*) FROM public.coleta_log")" == "0" ]] || { echo "FAIL: tentativa abortada deixou recibo" >&2; exit 1; }

# Forward em ordem de arquivo, com ledger e readback depois de cada uma.
q -q < "supabase/migrations/$V1.sql"; ledger 20260925220000; q -q < "supabase/readback/$V1.readback.sql"
q -q < "supabase/migrations/$V2.sql"; ledger 20260925220100; q -q < "supabase/readback/$V2.readback.sql"
q -q < "supabase/migrations/$V3.sql"; ledger 20260925220200; q -q < "supabase/readback/$V3.readback.sql"

estado="$(q -Atq -F '|' -c "SELECT
  (SELECT situacao_candidatura||','||status||','||publicavel FROM public.candidatos WHERE slug='alexandre-curi'),
  (SELECT situacao_candidatura||','||status||','||publicavel FROM public.candidatos WHERE slug='tse-2026-190002554290'),
  (SELECT count(*) FROM public.candidatos_publico WHERE slug='tse-2026-190002554290'),
  (SELECT titulo FROM public.pontos_atencao WHERE id='59afc792-415e-4e59-9fc0-6f71ea883b0c'),
  (SELECT string_agg(coalesce(cargo_atual,'NULL'), ';' ORDER BY slug) FROM public.candidatos WHERE slug <> 'sentinela-senador' AND slug NOT IN ('alexandre-curi','tse-2026-190002554290')),
  (SELECT volume FROM public.coleta_log WHERE execucao='migration:20260925220200')")"
esperado="deferido,candidato,true|indeferido,removido,false|0|Carreira política|Governador de Santa Catarina;Governadora do Acre;Deputado(a) Federal;Deputado(a) Federal;NULL;Deputado(a) Federal;Deputado(a) Federal;Deputado(a) Federal;NULL|8"
[[ "$estado" == "$esperado" ]] || { echo "FAIL: forward inesperado: $estado" >&2; exit 1; }
[[ "$(digest_sentinelas)" == "$sentinelas_antes" ]] || { echo "FAIL: forward tocou sentinela" >&2; exit 1; }

# Readbacks reprovam postimagem adulterada.
q -q -c "UPDATE public.candidatos SET cargo_atual='Senador(a)' WHERE slug='mailza-assis'"
falha_esperada "readback de cargo_atual aceitou postimagem adulterada" "supabase/readback/$V3.readback.sql"
q -q -c "UPDATE public.candidatos SET cargo_atual='Governadora do Acre' WHERE slug='mailza-assis'"
q -q < "supabase/readback/$V3.readback.sql"

# Rollback recusa migration posterior no topo do ledger.
ledger 20260930000000
falha_esperada "rollback aceitou migration posterior" "supabase/rollback/$V3.rollback.sql"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260930000000'"

# Rollback em ordem inversa.
q -q < "supabase/rollback/$V3.rollback.sql"; q -q < "supabase/readback/$V3.rollback.readback.sql"
q -q < "supabase/rollback/$V2.rollback.sql"; q -q < "supabase/readback/$V2.rollback.readback.sql"
q -q < "supabase/rollback/$V1.rollback.sql"; q -q < "supabase/readback/$V1.rollback.readback.sql"

# De volta ao estado pré-apply (a ficha limpa pelo ingest não foi escrita e segue NULL).
q -q -c "UPDATE public.candidatos SET cargo_atual='Senador(a)' WHERE slug='tse-2026-110002551967'"
[[ "$(digest_tudo)" == "$tudo_antes" ]] || { echo "FAIL: rollback não devolveu o estado inicial" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT max(version) FROM supabase_migrations.schema_migrations")" == "20260925163543" ]] || { echo "FAIL: ledger final" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot")" == "0" ]] || { echo "FAIL: snapshot sobrou" >&2; exit 1; }

echo "PASS: situação no Senado, claim de carreira e cargo_atual têm pré-estado, adulteração, forward, readbacks, migration posterior, rollback inverso e sentinelas provados em PostgreSQL 17"
