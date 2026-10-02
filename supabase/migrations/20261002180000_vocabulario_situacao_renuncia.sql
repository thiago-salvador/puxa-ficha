-- #646: código 6 RENÚNCIA confirmado no pacote 02/10/2026, SHA d35f514257e8db7337ed926011a1a707d76b00f3fc4437192dcf890648628b2b.
-- Schema apenas: não muda dados, flags de publicação ou permissões.
BEGIN;

-- Guard de replay linear: mesma razao da 20260903210000. Alargar um dominio
-- que nunca foi instalado (banco sintetico onde 20260903100100 e 20260903210000
-- tambem falham por guard) nao e o caso que esta migration precisa cobrir.
DO $alargar$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
       AND contype = 'c'
  ) THEN
    RAISE NOTICE 'vocabulario renuncia: dominio ausente (replay); alargamento ignorado';
    RETURN;
  END IF;

  ALTER TABLE public.candidatos
    DROP CONSTRAINT IF EXISTS candidatos_situacao_candidatura_dominio;

  ALTER TABLE public.candidatos
    ADD CONSTRAINT candidatos_situacao_candidatura_dominio
    CHECK (situacao_candidatura IN (
      'aguardando julgamento',
      'candidatura declarada',
      'incerto',
      'deferido',
      'deferido com recurso',
      'indeferido',
      'indeferido com recurso',
      'pendente de julgamento',
      'renuncia'
    ));

  COMMENT ON CONSTRAINT candidatos_situacao_candidatura_dominio ON public.candidatos IS
    'Vocabulário fechado de situacao_candidatura, espelha SITUACAO_CANDIDATURA_DOMINIO. NULL preserva ausência de informação. Renúncia (código 6 do pacote complementar TSE, issue #646) não é indeferimento nem determina aptidão, concorrência ou recurso.';
END
$alargar$;

DO $conferencia$
DECLARE
  tem_constraint boolean;
  aceita_pendente boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
       AND contype = 'c'
       AND convalidated
  ) INTO tem_constraint;

  IF NOT tem_constraint THEN
    RAISE NOTICE 'vocabulario renuncia: sem dominio instalado, nada a conferir';
    RETURN;
  END IF;

  SELECT pg_get_constraintdef(oid) LIKE '%renuncia%'
    INTO aceita_pendente
    FROM pg_constraint
   WHERE conrelid = 'public.candidatos'::regclass
     AND conname = 'candidatos_situacao_candidatura_dominio';
  IF NOT aceita_pendente THEN
    RAISE EXCEPTION 'vocabulario renuncia: constraint existe mas nao tem o estado renuncia';
  END IF;
END
$conferencia$;

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
      'pendente de julgamento',
      'renuncia'
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
