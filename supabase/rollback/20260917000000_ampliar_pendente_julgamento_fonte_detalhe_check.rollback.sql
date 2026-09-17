-- Reverte 20260917000000: chapas_2026_fonte_detalhe_check volta a não
-- aceitar 'Pendente de julgamento'. So pode rodar depois do rollback de
-- 20260917000001 (a chapa do PRTB precisa ja estar de volta ao texto
-- antigo, senao a UPDATE dela deixaria de satisfazer o dominio estreito).
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;

DO $rollback$
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260917000000' THEN
    RAISE EXCEPTION 'pendente-julgamento-fonte-detalhe-check rollback: ledger divergiu';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.chapas_2026
     WHERE fonte_tipo = 'divulgacand_detalhe'
       AND (fonte_detalhe->'titular'->>'descricao_situacao' = 'Pendente de julgamento'
         OR fonte_detalhe->'vice'->>'descricao_situacao' = 'Pendente de julgamento')
  ) THEN
    RAISE EXCEPTION 'pendente-julgamento-fonte-detalhe-check rollback: ha chapa usando o oitavo estado; reverta 20260917000001 primeiro';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.chapas_2026'::regclass
       AND conname = 'chapas_2026_fonte_detalhe_check'
       AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'pendente-julgamento-fonte-detalhe-check rollback: constraint ausente';
  END IF;

  ALTER TABLE public.chapas_2026
    DROP CONSTRAINT IF EXISTS chapas_2026_fonte_detalhe_check;

  ALTER TABLE public.chapas_2026
    ADD CONSTRAINT chapas_2026_fonte_detalhe_check
    CHECK (
      (fonte_tipo <> 'divulgacand_detalhe') OR ((
        jsonb_typeof(fonte_detalhe) = 'object'
        AND sq_coligacao IS NULL
        AND tse_situacao_titular_codigo IS NULL
        AND tse_situacao_vice_codigo IS NULL
        AND identidade_status = 'confirmada'
        AND vinculo_titular_status = ANY (ARRAY['confirmado', 'novo_perfil_oficial'])
        AND titular_candidato_id IS NOT NULL
        AND titular_sq_candidato ~ '^[0-9]+$'
        AND vice_sq_candidato ~ '^[0-9]+$'
        AND titular_sq_candidato <> vice_sq_candidato
        AND jsonb_array_length(alternativas_oficiais) = 0
        AND fonte_sha256 ~ '^[a-f0-9]{64}$'
        AND fonte_url = ('https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/' || COALESCE(uf, 'BR') || '/20322002026/candidato/' || titular_sq_candidato)
        AND (fonte_detalhe->'titular'->>'url') = fonte_url
        AND (fonte_detalhe->'titular'->>'sha256') = fonte_sha256
        AND (fonte_detalhe->'titular'->>'checked_at')::timestamptz = snapshot_em
        AND isfinite(snapshot_em)
        AND (fonte_detalhe->'titular'->>'http_status') = '200'
        AND (fonte_detalhe->'titular'->>'sq_candidato') = titular_sq_candidato
        AND (fonte_detalhe->'titular'->>'nome_completo') = titular_nome_completo
        AND (fonte_detalhe->'titular'->>'nome_urna') = titular_nome_urna
        AND (fonte_detalhe->'titular'->>'partido_sigla') = titular_partido_sigla
        AND (fonte_detalhe->'titular'->>'cargo') = cargo_titular
        AND (fonte_detalhe->'titular'->>'uf') = COALESCE(uf, 'BR')
        AND (fonte_detalhe->'titular'->>'descricao_situacao') = tse_situacao_codigo
        AND (fonte_detalhe->'titular'->>'descricao_situacao') = ANY (ARRAY['Aguardando julgamento', 'Deferido', 'Deferido com recurso'])
        AND (fonte_detalhe->'titular'->>'vice_vigente_sq') = vice_sq_candidato
        AND (fonte_detalhe->'titular'->'contagem_vices_vigentes') = '1'::jsonb
        AND (fonte_detalhe->'titular'->'is_candidato_inapto') = 'false'::jsonb
        AND (fonte_detalhe->'titular'->'substituido') = 'false'::jsonb
        AND (fonte_detalhe->'vice'->>'url') = ('https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/' || COALESCE(uf, 'BR') || '/20322002026/candidato/' || vice_sq_candidato)
        AND (fonte_detalhe->'vice'->>'sha256') ~ '^[a-f0-9]{64}$'
        AND isfinite((fonte_detalhe->'vice'->>'checked_at')::timestamptz)
        AND (fonte_detalhe->'vice'->>'http_status') = '200'
        AND (fonte_detalhe->'vice'->>'sq_candidato') = vice_sq_candidato
        AND (fonte_detalhe->'vice'->>'nome_completo') = vice_nome_completo
        AND (fonte_detalhe->'vice'->>'nome_urna') = vice_nome_urna
        AND (fonte_detalhe->'vice'->>'partido_sigla') = vice_partido_sigla
        AND (fonte_detalhe->'vice'->>'cargo') = CASE cargo_titular WHEN 'Governador' THEN 'Vice-governador' ELSE 'Vice-presidente' END
        AND (fonte_detalhe->'vice'->>'uf') = COALESCE(uf, 'BR')
        AND (fonte_detalhe->'vice'->>'descricao_situacao') = ANY (ARRAY['Aguardando julgamento', 'Deferido', 'Deferido com recurso'])
        AND (fonte_detalhe->'vice'->'is_candidato_inapto') = 'false'::jsonb
        AND (fonte_detalhe->'vice'->'substituido') = 'false'::jsonb
      ) IS TRUE)
    );

  EXECUTE format(
    'COMMENT ON CONSTRAINT chapas_2026_fonte_detalhe_check ON public.chapas_2026 IS %L',
    'Contrato do snapshot congelado fonte_detalhe para fonte_tipo=divulgacand_detalhe. Domínio de descricao_situacao restaurado ao original (sem ''Pendente de julgamento'') pelo rollback de 20260917000000.');

  DELETE FROM supabase_migrations.schema_migrations WHERE version='20260917000000';
END
$rollback$;
COMMIT;
