-- Corrige somente o voto de JHC na votacao 2123843-93.
-- NAO aplicar em producao sem autorizacao nomeada do Thiago.

BEGIN;

CREATE TEMP TABLE jhc_artigo_17_snapshot ON COMMIT DROP AS
SELECT
  count(*)::bigint AS other_count,
  md5(coalesce(string_agg(row_to_json(v)::text, '' ORDER BY v.id), '')) AS other_digest
FROM public.votos_candidato v
WHERE NOT (
  v.candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
  AND v.votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
);

DO $precondition$
DECLARE
  candidato_count integer;
  votacao_count integer;
  alvo_count integer;
  voto_atual text;
  criado_em timestamptz;
BEGIN
  PERFORM set_config('pf.jhc_artigo_17_apply', 'false', true);

  IF NOT EXISTS (
    SELECT 1
    FROM public.votos_candidato
    WHERE candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
      AND votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
  ) THEN
    RAISE NOTICE 'jhc artigo_17: replay sem a linha runtime auditada; nada aplicado';
    RETURN;
  END IF;

  SELECT count(*) INTO candidato_count
  FROM public.candidatos
  WHERE id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND slug = 'jhc';

  SELECT count(*) INTO votacao_count
  FROM public.votacoes_chave
  WHERE id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
    AND fonte = 'camara'
    AND votacao_id_api = '2123843-93';

  SELECT count(*), max(voto), max(created_at)
    INTO alvo_count, voto_atual, criado_em
  FROM public.votos_candidato
  WHERE candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid;

  IF candidato_count <> 1 OR votacao_count <> 1 OR alvo_count <> 1 THEN
    RAISE EXCEPTION
      'jhc artigo_17: precondicao cardinal divergiu (candidato=%, votacao=%, alvo=%)',
      candidato_count, votacao_count, alvo_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.votos_candidato
    WHERE id = 'be44d3a0-492b-4e68-9ed7-d812d7ce0e48'::uuid
      AND candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
      AND votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
      AND voto IN ('ausente', 'artigo_17')
      AND contradicao = false
      AND contradicao_descricao IS NULL
      AND created_at = '2026-08-15T14:10:32.481313+00:00'::timestamptz
  ) THEN
    RAISE EXCEPTION 'jhc artigo_17: linha alvo divergiu do snapshot de produção';
  END IF;

  IF voto_atual NOT IN ('ausente', 'artigo_17') THEN
    RAISE EXCEPTION 'jhc artigo_17: voto atual divergente: %', voto_atual;
  END IF;

  IF criado_em <> '2026-08-15T14:10:32.481313+00:00'::timestamptz THEN
    RAISE EXCEPTION 'jhc artigo_17: created_at divergente: %', criado_em;
  END IF;

  PERFORM set_config('pf.jhc_artigo_17_apply', 'true', true);
END
$precondition$;

-- @write tabela=votos_candidato slug=jhc campos=voto
UPDATE public.votos_candidato
SET voto = 'artigo_17'
WHERE candidato_id = (
  SELECT id
  FROM public.candidatos
  WHERE id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND slug = 'jhc'
)
  AND id = 'be44d3a0-492b-4e68-9ed7-d812d7ce0e48'::uuid
  AND votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
  AND voto = 'ausente'
  AND current_setting('pf.jhc_artigo_17_apply', true) = 'true';

DO $postcondition$
DECLARE
  alvo_count integer;
  other_count bigint;
  other_digest text;
  before_count bigint;
  before_digest text;
BEGIN
  IF current_setting('pf.jhc_artigo_17_apply', true) IS DISTINCT FROM 'true' THEN
    RETURN;
  END IF;

  SELECT count(*) INTO alvo_count
  FROM public.votos_candidato
  WHERE candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
    AND voto = 'artigo_17';

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(v)::text, '' ORDER BY v.id), ''))
    INTO other_count, other_digest
  FROM public.votos_candidato v
  WHERE NOT (
    v.candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND v.votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
  );

  SELECT s.other_count, s.other_digest INTO before_count, before_digest
  FROM jhc_artigo_17_snapshot s;

  IF alvo_count <> 1
     OR other_count <> before_count
     OR other_digest IS DISTINCT FROM before_digest THEN
    RAISE EXCEPTION
      'jhc artigo_17: postcondicao falhou (alvo=%, outras=%/%, digest=%/%)',
      alvo_count, other_count, before_count, other_digest, before_digest;
  END IF;
END
$postcondition$;

-- @write tabela=coleta_log ref=migration:20260830143500 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT
  'camara-votos', 'candidato', 'jhc',
  'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid,
  'encontrado', 1,
  'Migration 20260830143500: voto be44d3a0-492b-4e68-9ed7-d812d7ce0e48 ausente corrigido para artigo_17; created_at 2026-08-15T14:10:32.481313+00:00 e postcondicao das demais linhas aprovados',
  'https://dadosabertos.camara.leg.br/api/v2/votacoes/2123843-93/votos',
  'migration:20260830143500'
WHERE current_setting('pf.jhc_artigo_17_apply', true) = 'true'
  AND NOT EXISTS (
  SELECT 1 FROM public.coleta_log
  WHERE fonte = 'camara-votos'
    AND escopo = 'candidato'
    AND alvo = 'jhc'
    AND execucao = 'migration:20260830143500'
);

COMMIT;
