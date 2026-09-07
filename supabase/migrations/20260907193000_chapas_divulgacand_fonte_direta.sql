-- Fonte DivulgaCand oficial explícita. O ramo legado conserva todas as obrigações
-- anteriores; códigos da API nunca ocupam campos do namespace CSV.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.chapas_2026 IN ACCESS EXCLUSIVE MODE;
DO $schema$
DECLARE before_digest text; after_digest text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chapas_2026' AND column_name IN ('fonte_tipo','fonte_detalhe'))
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.chapas_2026'::regclass AND attname IN ('tse_situacao_titular_codigo','tse_situacao_vice_codigo') AND attnotnull AND NOT attisdropped) <> 2
     OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.chapas_2026'::regclass AND conname='chapas_2026_check1' AND convalidated) IS DISTINCT FROM 'CHECK ((((identidade_status = ''confirmada''::text) AND (sq_coligacao IS NOT NULL)) OR (identidade_status = ''duplicidade_oficial''::text)))' THEN
    RAISE EXCEPTION 'chapas fonte detalhada: precondição estrutural divergiu';
  END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(ch)::text,'' ORDER BY id),'')) INTO before_digest FROM public.chapas_2026 ch;
  ALTER TABLE public.chapas_2026 ADD COLUMN fonte_tipo text NOT NULL DEFAULT 'legado';
  ALTER TABLE public.chapas_2026 ADD COLUMN fonte_detalhe jsonb;
  ALTER TABLE public.chapas_2026 ALTER COLUMN tse_situacao_titular_codigo DROP NOT NULL;
  ALTER TABLE public.chapas_2026 ALTER COLUMN tse_situacao_vice_codigo DROP NOT NULL;
  ALTER TABLE public.chapas_2026 DROP CONSTRAINT chapas_2026_check1;
  ALTER TABLE public.chapas_2026 ADD CONSTRAINT chapas_2026_check1 CHECK (
    (fonte_tipo='legado' AND ((identidade_status='confirmada' AND sq_coligacao IS NOT NULL) OR identidade_status='duplicidade_oficial'))
    OR (fonte_tipo='divulgacand_detalhe' AND identidade_status='confirmada')
  );
  ALTER TABLE public.chapas_2026 ADD CONSTRAINT chapas_2026_fonte_legado_check CHECK (
    fonte_tipo IN ('legado','divulgacand_detalhe')
    AND (fonte_tipo<>'legado' OR (fonte_detalhe IS NULL AND tse_situacao_titular_codigo IS NOT NULL AND tse_situacao_vice_codigo IS NOT NULL))
  );
  -- IS TRUE fecha o caminho NULL: JSON sem uma chave obrigatória reprova.
  ALTER TABLE public.chapas_2026 ADD CONSTRAINT chapas_2026_fonte_detalhe_check CHECK (
    fonte_tipo<>'divulgacand_detalhe' OR (
      jsonb_typeof(fonte_detalhe)='object'
      AND sq_coligacao IS NULL AND tse_situacao_titular_codigo IS NULL AND tse_situacao_vice_codigo IS NULL
      AND identidade_status='confirmada' AND vinculo_titular_status IN ('confirmado','novo_perfil_oficial')
      AND titular_candidato_id IS NOT NULL AND titular_sq_candidato ~ '^[0-9]+$' AND vice_sq_candidato ~ '^[0-9]+$'
      AND titular_sq_candidato<>vice_sq_candidato AND jsonb_array_length(alternativas_oficiais)=0
      AND fonte_sha256 ~ '^[a-f0-9]{64}$'
      AND fonte_url='https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/'||coalesce(uf,'BR')||'/20322002026/candidato/'||titular_sq_candidato
      AND fonte_detalhe->'titular'->>'url'=fonte_url
      AND fonte_detalhe->'titular'->>'sha256'=fonte_sha256
      AND (fonte_detalhe->'titular'->>'checked_at')::timestamptz=snapshot_em
      AND isfinite(snapshot_em)
      AND fonte_detalhe->'titular'->>'http_status'='200'
      AND fonte_detalhe->'titular'->>'sq_candidato'=titular_sq_candidato
      AND fonte_detalhe->'titular'->>'nome_completo'=titular_nome_completo
      AND fonte_detalhe->'titular'->>'nome_urna'=titular_nome_urna
      AND fonte_detalhe->'titular'->>'partido_sigla'=titular_partido_sigla
      AND fonte_detalhe->'titular'->>'cargo'=cargo_titular
      AND fonte_detalhe->'titular'->>'uf'=coalesce(uf,'BR')
      AND fonte_detalhe->'titular'->>'descricao_situacao'=tse_situacao_codigo
      AND fonte_detalhe->'titular'->>'descricao_situacao' IN ('Aguardando julgamento','Deferido','Deferido com recurso')
      AND fonte_detalhe->'titular'->>'vice_vigente_sq'=vice_sq_candidato
      AND fonte_detalhe->'titular'->'contagem_vices_vigentes'='1'::jsonb
      AND fonte_detalhe->'titular'->'is_candidato_inapto'='false'::jsonb
      AND fonte_detalhe->'titular'->'substituido'='false'::jsonb
      AND fonte_detalhe->'vice'->>'url'='https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/'||coalesce(uf,'BR')||'/20322002026/candidato/'||vice_sq_candidato
      AND fonte_detalhe->'vice'->>'sha256' ~ '^[a-f0-9]{64}$'
      AND isfinite((fonte_detalhe->'vice'->>'checked_at')::timestamptz)
      AND fonte_detalhe->'vice'->>'http_status'='200'
      AND fonte_detalhe->'vice'->>'sq_candidato'=vice_sq_candidato
      AND fonte_detalhe->'vice'->>'nome_completo'=vice_nome_completo
      AND fonte_detalhe->'vice'->>'nome_urna'=vice_nome_urna
      AND fonte_detalhe->'vice'->>'partido_sigla'=vice_partido_sigla
      AND fonte_detalhe->'vice'->>'cargo'=CASE cargo_titular WHEN 'Governador' THEN 'Vice-governador' ELSE 'Vice-presidente' END
      AND fonte_detalhe->'vice'->>'uf'=coalesce(uf,'BR')
      AND fonte_detalhe->'vice'->>'descricao_situacao' IN ('Aguardando julgamento','Deferido','Deferido com recurso')
      AND fonte_detalhe->'vice'->'is_candidato_inapto'='false'::jsonb
      AND fonte_detalhe->'vice'->'substituido'='false'::jsonb
    ) IS TRUE
  );
  CREATE UNIQUE INDEX chapas_2026_detalhe_titular_sq_uidx ON public.chapas_2026(titular_sq_candidato) WHERE fonte_tipo='divulgacand_detalhe';
  CREATE UNIQUE INDEX chapas_2026_detalhe_vice_sq_uidx ON public.chapas_2026(vice_sq_candidato) WHERE fonte_tipo='divulgacand_detalhe';
  CREATE UNIQUE INDEX chapas_2026_detalhe_candidato_uidx ON public.chapas_2026(titular_candidato_id) WHERE fonte_tipo='divulgacand_detalhe';
  -- Colunas novas são privadas; SELECT público/view permanecem explícitos.
  SELECT md5(coalesce(string_agg((to_jsonb(ch)-ARRAY['fonte_tipo','fonte_detalhe'])::text,'' ORDER BY id),'')) INTO after_digest FROM public.chapas_2026 ch;
  IF before_digest IS DISTINCT FROM after_digest THEN RAISE EXCEPTION 'chapas fonte detalhada: dados legados mudaram'; END IF;
END
$schema$;
COMMIT;
