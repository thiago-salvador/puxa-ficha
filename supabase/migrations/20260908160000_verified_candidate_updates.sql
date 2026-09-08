-- H12: verified observations are private; the first observation is a baseline.
BEGIN;
CREATE TABLE public.verified_candidate_observations (
  candidate_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('patrimonio', 'partido', 'situacao')),
  year integer NOT NULL CHECK (year BETWEEN 1990 AND 2100),
  source_identity text NOT NULL CHECK (length(source_identity) BETWEEN 1 AND 256),
  value text NOT NULL CHECK (length(value) BETWEEN 1 AND 500),
  source_url text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (candidate_id, field, year, source_identity)
);
CREATE TABLE public.verified_candidate_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('patrimonio', 'partido', 'situacao')),
  year integer NOT NULL CHECK (year BETWEEN 1990 AND 2100),
  source_identity text NOT NULL,
  before_source_url text NOT NULL,
  before_value text NOT NULL,
  after_value text NOT NULL CHECK (after_value <> before_value),
  source_url text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX verified_candidate_updates_recent_idx ON public.verified_candidate_updates (detected_at DESC, id);
ALTER TABLE public.verified_candidate_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_candidate_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verified_candidate_observations, public.verified_candidate_updates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.verified_candidate_observations, public.verified_candidate_updates TO service_role;

CREATE FUNCTION public.observe_verified_candidate_change(
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
    IF normalized_value NOT IN ('aguardando julgamento','candidatura declarada','incerto','deferido','deferido com recurso','indeferido','indeferido com recurso') THEN
      RAISE EXCEPTION 'Invalid verified registration status' USING ERRCODE='22023';
    END IF;
  ELSIF normalized_value !~ '^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 -]{0,29}$' THEN
    RAISE EXCEPTION 'Invalid verified party abbreviation' USING ERRCODE='22023';
  END IF;

  -- INSERT's unique-key lock also serializes concurrent first observations.
  INSERT INTO public.verified_candidate_observations(candidate_id,field,year,source_identity,value,source_url)
  VALUES(p_candidate_id,p_field,p_year,p_source_identity,normalized_value,p_source_url)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 1 THEN RETURN 'baseline'; END IF;

  SELECT value,source_url INTO STRICT previous_value,previous_source_url FROM public.verified_candidate_observations
  WHERE candidate_id=p_candidate_id AND field=p_field AND year=p_year AND source_identity=p_source_identity
  FOR UPDATE;
  IF previous_value <> normalized_value THEN
    INSERT INTO public.verified_candidate_updates(candidate_id,field,year,source_identity,before_source_url,before_value,after_value,source_url)
    VALUES(p_candidate_id,p_field,p_year,p_source_identity,previous_source_url,previous_value,normalized_value,p_source_url);
  END IF;
  UPDATE public.verified_candidate_observations SET value=normalized_value,source_url=p_source_url,observed_at=clock_timestamp()
  WHERE candidate_id=p_candidate_id AND field=p_field AND year=p_year AND source_identity=p_source_identity;
  RETURN CASE WHEN previous_value = normalized_value THEN 'unchanged' ELSE 'changed' END;
END;
$$;
REVOKE ALL ON FUNCTION public.observe_verified_candidate_change(uuid,text,integer,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.observe_verified_candidate_change(uuid,text,integer,text,text,text) TO service_role;

-- Owner-executed view intentionally exposes only these columns. Base tables
-- have no public policies or grants; the explicit publication gate is mandatory.
CREATE VIEW public.verified_candidate_updates_public WITH (security_barrier = true) AS
SELECT u.id,u.candidate_id,c.slug AS candidate_slug,c.nome_urna AS candidate_name,
  u.field,u.year,u.before_value,u.after_value,u.source_url,u.detected_at
FROM public.verified_candidate_updates u JOIN public.candidatos c ON c.id=u.candidate_id
WHERE public.is_public_candidate(u.candidate_id)
AND (u.field <> 'patrimonio' OR EXISTS (
  SELECT 1 FROM public.patrimonio p WHERE p.candidato_id=u.candidate_id
  AND p.ano_eleicao=u.year AND p.despublicado_em IS NULL
) AND NOT EXISTS (
  -- A visible sibling row cannot authorize history from a quarantined record.
  SELECT 1 FROM public.patrimonio p WHERE p.candidato_id=u.candidate_id
  AND p.ano_eleicao=u.year AND p.despublicado_em IS NOT NULL
));
REVOKE ALL ON public.verified_candidate_updates_public FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.verified_candidate_updates_public TO anon, authenticated, service_role;
COMMIT;
