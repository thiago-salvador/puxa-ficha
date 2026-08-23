#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
MIGRATION="supabase/migrations/20260823160000_public_text_encoding_cleanup.sql"
READBACK="supabase/readback/20260823160000_public_text_encoding_cleanup.readback.sql"
CONTAINER="pf-public-text-encoding-$$"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -U postgres -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

psql_exec() {
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"
}

psql_exec <<'SQL' >/dev/null
CREATE EXTENSION pgcrypto;
CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  publicavel boolean NOT NULL DEFAULT true
);
CREATE VIEW public.candidatos_publico AS SELECT id, slug FROM public.candidatos WHERE publicavel;
CREATE TABLE public.patrimonio (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  ano_eleicao integer NOT NULL,
  bens jsonb NOT NULL,
  valor_total numeric,
  fonte text
);
CREATE TABLE public.projetos_lei (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  ementa text,
  proposicao_id_api text
);
CREATE TABLE public.gastos_parlamentares (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  ano integer,
  fonte text,
  detalhamento jsonb,
  gastos_destaque jsonb
);
CREATE TABLE public.legislacao_mandato_executivo (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  ementa text,
  metadata jsonb
);
CREATE TABLE public.noticias_candidato (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  titulo text,
  fonte text
);

INSERT INTO public.candidatos(slug) VALUES
  ('wilson-grassi-junior'), ('luiz-franca'), ('soldado-sampaio'),
  ('cicero-lucena'), ('ricardo-ferraco'), ('alan-rick'),
  ('mailza-assis'), ('patrus-ananias'), ('haddad-gov-sp'),
  ('delcidio-amaral');
INSERT INTO public.candidatos(slug, publicavel) VALUES ('decoy-nao-publico', false);

INSERT INTO public.patrimonio(id,candidato_id,ano_eleicao,bens) SELECT
  'dc897176-d354-4218-94d5-967ddcfd0afa', id, 2026,
  '[{"descricao":"IMOVEIS. ¿ PARTICIPAÇÕES SOCIETÁRIAS"}]' FROM public.candidatos WHERE slug='wilson-grassi-junior';
INSERT INTO public.patrimonio(id,candidato_id,ano_eleicao,bens) SELECT
  '6d45c4c3-d7a5-4244-b890-7038c29238ce', id, 2026,
  '[{"descricao":"TORRE ¿B¿"}]' FROM public.candidatos WHERE slug='luiz-franca';
INSERT INTO public.patrimonio(id,candidato_id,ano_eleicao,bens) SELECT
  'ff4306c7-27a3-4fad-9086-398385ff2341', id, 2018,
  '[{"descricao":"Rua Santa Clara 663 ¿ Bairro Cinturão Verde"}]' FROM public.candidatos WHERE slug='soldado-sampaio';
INSERT INTO public.patrimonio(id,candidato_id,ano_eleicao,bens) SELECT
  '11111111-1111-4111-8111-111111111111', id, 2026,
  '[{"descricao":"TORRE ¿B¿"}]' FROM public.candidatos WHERE slug='decoy-nao-publico';

INSERT INTO public.projetos_lei(id,candidato_id,proposicao_id_api,ementa) SELECT
  '18f8f586-c150-4b77-a52e-4fc18716abf1',id,'100904','objetivo de ¿debater o porto e o turismo¿, requeiro' FROM public.candidatos WHERE slug='cicero-lucena';
INSERT INTO public.projetos_lei(id,candidato_id,proposicao_id_api,ementa) SELECT
  '715a672c-491c-480d-ad10-39382ce4e86d',id,'101351',E'convidadas:\n¿ Sra. A;\n¿ Sr. B.' FROM public.candidatos WHERE slug='cicero-lucena';
INSERT INTO public.projetos_lei(id,candidato_id,proposicao_id_api,ementa) SELECT
  'e2d35637-b6b7-40f9-8a56-1812ce26f9e3',id,'95016','correlata: ¿ Projeto A, ¿ Projeto B' FROM public.candidatos WHERE slug='cicero-lucena';
INSERT INTO public.projetos_lei(id,candidato_id,proposicao_id_api,ementa) SELECT
  'edf11bcb-55ed-4793-86c0-22a3be91d484',id,'101425','Telecomunicações ¿ ANATEL; Assinatura ¿ ABTA; Dall¿antonia; Telecomunicações ¿ CPqD' FROM public.candidatos WHERE slug='cicero-lucena';
INSERT INTO public.projetos_lei(id,candidato_id,proposicao_id_api,ementa) SELECT
  '9369ff09-f7a9-4e7a-8c02-45edfa55377f',id,'114111',E'debate:\n¿\tO Senhor A;\n¿\tO Senhor B.' FROM public.candidatos WHERE slug='ricardo-ferraco';
INSERT INTO public.projetos_lei(id,candidato_id,proposicao_id_api,ementa) SELECT
  'f06f111c-e6ce-45a6-91d9-09c48be7d9fd',id,'102583','Moacir Servilha Duarte ¿ Diretor-Presidente' FROM public.candidatos WHERE slug='ricardo-ferraco';
INSERT INTO public.projetos_lei(id,candidato_id,proposicao_id_api,ementa) SELECT
  '637758ae-6aea-4e04-a362-cc8363574160',id,'103031','PLS nº 448/2011 ¿ Substitutivo.' FROM public.candidatos WHERE slug='ricardo-ferraco';

INSERT INTO public.gastos_parlamentares(id,candidato_id,ano,fonte,detalhamento,gastos_destaque) SELECT
  '32c3878e-bb0c-4fbe-bc44-187fdf4212b3',id,2023,'Senado CEAPS','[]','[{"fornecedor":"EXATA COMUNICA��O EIRELI"}]' FROM public.candidatos WHERE slug='alan-rick';
INSERT INTO public.gastos_parlamentares(id,candidato_id,ano,fonte,detalhamento,gastos_destaque) SELECT
  'a85ede0d-73b8-4ee2-87c9-1bdb41f56ec3',id,2026,'Senado CEAPS','[]','[{"fornecedor":"AMAZ�NIA 7 PRODU��ES LTDA"}]' FROM public.candidatos WHERE slug='alan-rick';
INSERT INTO public.gastos_parlamentares(id,candidato_id,ano,fonte,detalhamento,gastos_destaque) SELECT
  '32aaf398-46dc-4367-82d7-4cdb40ea3c38',id,2019,'Senado CEAPS','[]','[{"fornecedor":"Aerobran Taxi A�reo Ltda"}]' FROM public.candidatos WHERE slug='mailza-assis';
INSERT INTO public.gastos_parlamentares(id,candidato_id,ano,fonte,detalhamento,gastos_destaque) SELECT
  '337825fb-6cf9-43e0-8d93-548ed2f0f8b8',id,2021,'Senado CEAPS','[]','[{"fornecedor":"MULT GRAF IND�STRIA GR�FICA EDITORA E COMERCIO EIRELI"}]' FROM public.candidatos WHERE slug='mailza-assis';
INSERT INTO public.gastos_parlamentares(id,candidato_id,ano,fonte,detalhamento,gastos_destaque) SELECT
  '98ffd309-1855-47b9-b85b-8549803c17bc',id,2025,'Camara CEAP CSV',
  '[{"categoria":"DIVULGAÃÃO"}]','[{"categoria":"MANUTENÃÃO","fornecedor":"IMOBILIÃRIOS"}]' FROM public.candidatos WHERE slug='patrus-ananias';

INSERT INTO public.legislacao_mandato_executivo(id,candidato_id,ementa,metadata) SELECT
  '01af908c-c681-4e0b-a676-8b3e585df9b9',id,
  'Setor 89 ' || U&'\0096' || ' Quadra 158',
  jsonb_build_object(
    'coverage_id', 'haddad-sp-prefeitura-completo-leis-municipais-2013-2016-cutoff-20260512',
    'source_title', 'LEI 16.082 ' || U&'\0093' || 'Travessa' || U&'\0094'
  ) FROM public.candidatos WHERE slug='haddad-gov-sp';
INSERT INTO public.noticias_candidato(id,candidato_id,titulo,fonte) SELECT
  '500db544-e3fa-4db9-9ee1-077d4b4857b9',id,
  U&'\0091' || 'Vou derrotar o Bebê Johnson' || U&'\0092',
  'Cassilândia Notícias' FROM public.candidatos WHERE slug='delcidio-amaral';
SQL

psql_exec --single-transaction -f - < "$MIGRATION" >/dev/null
psql_exec --single-transaction -f - < "$MIGRATION" >/dev/null

[[ "$(psql_exec -f - < "$READBACK" | wc -l | tr -d ' ')" == "0" ]]
[[ "$(psql_exec -c "SELECT bens->0->>'descricao' FROM public.patrimonio WHERE id='6d45c4c3-d7a5-4244-b890-7038c29238ce'")" == 'TORRE “B”' ]]
[[ "$(psql_exec -c "SELECT ementa FROM public.projetos_lei WHERE id='edf11bcb-55ed-4793-86c0-22a3be91d484'")" == "Telecomunicações - ANATEL; Assinatura - ABTA; Dall'Antonia; Telecomunicações - CPqD" ]]
[[ "$(psql_exec -c "SELECT gastos_destaque->0->>'fornecedor' FROM public.gastos_parlamentares WHERE id='32c3878e-bb0c-4fbe-bc44-187fdf4212b3'")" == 'EXATA COMUNICAÇÃO EIRELI' ]]
[[ "$(psql_exec -c "SELECT detalhamento->0->>'categoria' FROM public.gastos_parlamentares WHERE id='98ffd309-1855-47b9-b85b-8549803c17bc'")" == 'DIVULGAÇÃO' ]]
[[ "$(psql_exec -c "SELECT ementa FROM public.legislacao_mandato_executivo WHERE id='01af908c-c681-4e0b-a676-8b3e585df9b9'")" == 'Setor 89 – Quadra 158' ]]
[[ "$(psql_exec -c "SELECT metadata->>'source_title' FROM public.legislacao_mandato_executivo WHERE id='01af908c-c681-4e0b-a676-8b3e585df9b9'")" == 'LEI 16.082 “Travessa”' ]]
[[ "$(psql_exec -c "SELECT titulo FROM public.noticias_candidato WHERE id='500db544-e3fa-4db9-9ee1-077d4b4857b9'")" == '‘Vou derrotar o Bebê Johnson’' ]]
[[ "$(psql_exec -c "SELECT bens->0->>'descricao' FROM public.patrimonio WHERE id='11111111-1111-4111-8111-111111111111'")" == 'TORRE ¿B¿' ]]

echo "PASS: migration de encoding aplica, reaplica e preserva registro fora do escopo"
