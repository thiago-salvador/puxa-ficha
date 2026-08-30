-- Rollback fechado somente da migration 20260830143500.

BEGIN;

CREATE TEMP TABLE jhc_artigo_17_rollback_snapshot ON COMMIT DROP AS
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
  alvo_count integer;
  voto_atual text;
BEGIN
  SELECT count(*), max(voto) INTO alvo_count, voto_atual
  FROM public.votos_candidato
  WHERE candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid;

  IF alvo_count <> 1 OR voto_atual NOT IN ('artigo_17', 'ausente') THEN
    RAISE EXCEPTION 'rollback jhc artigo_17: estado divergente (alvo=%, voto=%)', alvo_count, voto_atual;
  END IF;
END
$precondition$;

-- @write tabela=votos_candidato slug=jhc campos=voto
UPDATE public.votos_candidato
SET voto = 'ausente'
WHERE candidato_id = (
  SELECT id
  FROM public.candidatos
  WHERE id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND slug = 'jhc'
)
  AND votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
  AND voto = 'artigo_17';

DO $postcondition$
DECLARE
  alvo_count integer;
  other_count bigint;
  other_digest text;
  before_count bigint;
  before_digest text;
BEGIN
  SELECT count(*) INTO alvo_count
  FROM public.votos_candidato
  WHERE candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
    AND voto = 'ausente';

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(v)::text, '' ORDER BY v.id), ''))
    INTO other_count, other_digest
  FROM public.votos_candidato v
  WHERE NOT (
    v.candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND v.votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
  );

  SELECT s.other_count, s.other_digest INTO before_count, before_digest
  FROM jhc_artigo_17_rollback_snapshot s;

  IF alvo_count <> 1
     OR other_count <> before_count
     OR other_digest IS DISTINCT FROM before_digest THEN
    RAISE EXCEPTION 'rollback jhc artigo_17: postcondicao falhou';
  END IF;
END
$postcondition$;

-- @write tabela=coleta_log ref=rollback:20260830143500 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT
  'camara-votos', 'candidato', 'jhc',
  'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid,
  'encontrado', 1,
  'Rollback 20260830143500: artigo_17 restaurado para ausente; postcondicao das demais linhas aprovada',
  'https://dadosabertos.camara.leg.br/api/v2/votacoes/2123843-93/votos',
  'rollback:20260830143500'
WHERE NOT EXISTS (
  SELECT 1 FROM public.coleta_log
  WHERE fonte = 'camara-votos'
    AND escopo = 'candidato'
    AND alvo = 'jhc'
    AND execucao = 'rollback:20260830143500'
);

COMMIT;
