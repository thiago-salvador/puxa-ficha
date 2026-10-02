-- #646: executar somente depois do rollback dos dados; preserva grants existentes.
BEGIN;
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE situacao_candidatura = 'renuncia')
    OR EXISTS (SELECT 1 FROM public.verified_candidate_observations WHERE field = 'situacao' AND value = 'renuncia')
  THEN RAISE EXCEPTION 'rollback renuncia recusado: valores ainda em uso'; END IF;
END $guard$;
ALTER TABLE public.candidatos DROP CONSTRAINT candidatos_situacao_candidatura_dominio;
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_situacao_candidatura_dominio
CHECK (situacao_candidatura IN ('aguardando julgamento','candidatura declarada','incerto','deferido','deferido com recurso','indeferido','indeferido com recurso','pendente de julgamento'));
COMMENT ON CONSTRAINT candidatos_situacao_candidatura_dominio ON public.candidatos IS 'Vocabulario fechado de situacao_candidatura. NULL e permitido de proposito (ausencia de informacao). Espelha SITUACAO_CANDIDATURA_DOMINIO em src/lib/situacao-candidatura.ts: mudou la, muda aqui na mesma PR. "pendente de julgamento" entrou em 16/09/2026 (issue #340), DS_SITUACAO_JULGAMENTO codigo 17 de consulta_cand_complementar, distinto de "aguardando julgamento" (codigo 8) e de proposito fora de SITUACAO_JULGAMENTO_PUBLICADO: nao e deferimento nem indeferimento.';
CREATE OR REPLACE FUNCTION public.observe_verified_candidate_change(
  p_candidate_id uuid, p_field text, p_year integer, p_value text,
  p_source_url text, p_source_identity text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  previous_value text;
  previous_source_url text;
  normalized_value text := btrim(p_value);
  inserted_count integer;
BEGIN
  IF p_candidate_id IS NULL OR p_field IS NULL OR p_field NOT IN ('patrimonio','partido','situacao')
    OR p_year IS NULL OR p_year NOT BETWEEN 1990 AND 2100
    OR normalized_value IS NULL OR length(normalized_value) NOT BETWEEN 1 AND 500
    OR p_source_identity IS NULL OR length(btrim(p_source_identity)) NOT BETWEEN 1 AND 256
    OR p_source_identity <> btrim(p_source_identity)
    OR p_source_url IS NULL OR length(p_source_url) > 2048
    OR p_source_url !~ '^https://([a-zA-Z0-9-]+\.)*tse\.jus\.br(/[^[:space:]\\]*)?$'
  THEN RAISE EXCEPTION 'Invalid verified candidate observation' USING ERRCODE = '22023'; END IF;

  IF p_field = 'patrimonio' THEN
    IF normalized_value !~ '^[0-9]{1,13}(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Invalid verified wealth amount' USING ERRCODE='22023';
    END IF;
    normalized_value := (normalized_value::numeric(15,2))::text;
  ELSIF p_field = 'situacao' THEN
    normalized_value := lower(normalized_value);
    IF normalized_value NOT IN (
      'aguardando julgamento',
      'candidatura declarada',
      'incerto',
      'deferido',
      'deferido com recurso',
      'indeferido',
      'indeferido com recurso',
      'pendente de julgamento'
    ) THEN
      RAISE EXCEPTION 'Invalid verified registration status' USING ERRCODE='22023';
    END IF;
  ELSIF normalized_value !~ '^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 -]{0,29}$' THEN
    RAISE EXCEPTION 'Invalid verified party abbreviation' USING ERRCODE='22023';
  END IF;

  -- INSERT's unique-key lock also serializes concurrent first observations.
  -- @write tabela=verified_candidate_observations ref=verified-history-rpc campos=candidate_id,field,year,source_identity,value,source_url
  INSERT INTO public.verified_candidate_observations(candidate_id,field,year,source_identity,value,source_url)
  SELECT p_candidate_id,p_field,p_year,p_source_identity,normalized_value,p_source_url
  WHERE 'verified-history-rpc' IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 1 THEN RETURN 'baseline'; END IF;

  SELECT value,source_url INTO STRICT previous_value,previous_source_url FROM public.verified_candidate_observations
  WHERE candidate_id=p_candidate_id AND field=p_field AND year=p_year AND source_identity=p_source_identity
  FOR UPDATE;
  IF previous_value <> normalized_value THEN
    -- @write tabela=verified_candidate_updates ref=verified-history-rpc campos=candidate_id,field,year,source_identity,before_source_url,before_value,after_value,source_url
    INSERT INTO public.verified_candidate_updates(candidate_id,field,year,source_identity,before_source_url,before_value,after_value,source_url)
    SELECT p_candidate_id,p_field,p_year,p_source_identity,previous_source_url,previous_value,normalized_value,p_source_url
    WHERE 'verified-history-rpc' IS NOT NULL;
  END IF;
  -- @write tabela=verified_candidate_observations ref=verified-history-rpc campos=value,source_url,observed_at
  UPDATE public.verified_candidate_observations SET value=normalized_value,source_url=p_source_url,observed_at=clock_timestamp()
  WHERE candidate_id=p_candidate_id AND field=p_field AND year=p_year AND source_identity=p_source_identity
  AND 'verified-history-rpc' IS NOT NULL;
  RETURN CASE WHEN previous_value = normalized_value THEN 'unchanged' ELSE 'changed' END;
END;
$$;
COMMIT;
