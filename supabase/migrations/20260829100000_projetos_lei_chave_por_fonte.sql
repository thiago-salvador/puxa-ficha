-- Issue #138: the API identifier is only unique inside its legislative source.
-- This file is schema-only. The bounded Ronaldo Caiado backfill is prepared in
-- migrations-pendentes and is intentionally not part of the DDL replay.

DO $precondition$
DECLARE
  old_definition text;
BEGIN
  IF to_regclass('public.projetos_lei') IS NULL THEN
    RAISE EXCEPTION 'projetos_lei_source_key: public.projetos_lei nao existe';
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO old_definition
  FROM pg_constraint
  WHERE conrelid = 'public.projetos_lei'::regclass
    AND conname = 'uq_projetos_lei_candidato_proposicao';

  IF old_definition IS NOT NULL
     AND old_definition NOT ILIKE '%UNIQUE (candidato_id, proposicao_id_api)%' THEN
    RAISE EXCEPTION 'projetos_lei_source_key: constraint antiga divergiu: %', old_definition;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.projetos_lei
    WHERE proposicao_id_api IS NOT NULL
    GROUP BY candidato_id, fonte, proposicao_id_api
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'projetos_lei_source_key: colisao existente na chave composta candidato+fonte+proposicao';
  END IF;
END
$precondition$;

ALTER TABLE public.projetos_lei
  DROP CONSTRAINT IF EXISTS uq_projetos_lei_candidato_proposicao;

-- A unique index (em vez de um UNIQUE parcial) permite que o PostgREST infira
-- a chave do upsert. PostgreSQL continua permitindo varias linhas sem ID, como
-- deve: NULL nao identifica uma proposicao.
CREATE UNIQUE INDEX IF NOT EXISTS uq_projetos_lei_candidato_fonte_proposicao
  ON public.projetos_lei (candidato_id, fonte, proposicao_id_api);

DO $verification$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'projetos_lei'
      AND indexname = 'uq_projetos_lei_candidato_fonte_proposicao'
  ) THEN
    RAISE EXCEPTION 'projetos_lei_source_key: indice da chave composta ausente';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.projetos_lei'::regclass
      AND conname = 'uq_projetos_lei_candidato_proposicao'
  ) THEN
    RAISE EXCEPTION 'projetos_lei_source_key: constraint antiga ainda existe';
  END IF;
END
$verification$;
