\set ON_ERROR_STOP on
SET default_transaction_read_only = on;
SET statement_timeout = '60s';

WITH candidacies AS (
  SELECT jsonb_build_object(
    'sq_candidato', COALESCE(ch.titular_sq_candidato, ''),
    'cargo', CASE ch.cargo_titular WHEN 'Presidente' THEN 'PRESIDENTE' ELSE 'GOVERNADOR' END,
    'uf', ch.uf,
    'sq_coligacao', COALESCE(ch.sq_coligacao, ''),
    'nome_urna', ch.titular_nome_urna,
    'partido_sigla', ch.titular_partido_sigla,
    'situacao_codigo', ch.tse_situacao_titular_codigo,
    'situacao_descricao', NULL,
    'perfil_slug', titular.slug
  ) AS record
  FROM public.chapas_2026 ch
  LEFT JOIN public.candidatos titular ON titular.id = ch.titular_candidato_id

  UNION ALL

  SELECT jsonb_build_object(
    'sq_candidato', COALESCE(ch.vice_sq_candidato, ''),
    'cargo', CASE ch.cargo_titular WHEN 'Presidente' THEN 'VICE PRESIDENTE' ELSE 'VICE GOVERNADOR' END,
    'uf', ch.uf,
    'sq_coligacao', COALESCE(ch.sq_coligacao, ''),
    'nome_urna', ch.vice_nome_urna,
    'partido_sigla', ch.vice_partido_sigla,
    'situacao_codigo', ch.tse_situacao_vice_codigo,
    'situacao_descricao', NULL,
    'perfil_slug', vice.slug
  ) AS record
  FROM public.chapas_2026 ch
  LEFT JOIN public.candidatos vice ON vice.id = ch.vice_candidato_id
), collection_runs AS (
  SELECT fonte, execucao, max(executado_em) AS checked_at
  FROM public.coleta_log_ultima
  GROUP BY fonte, execucao
), latest_collection_runs AS (
  SELECT DISTINCT ON (fonte) fonte, execucao, checked_at
  FROM collection_runs
  ORDER BY fonte, checked_at DESC, execucao DESC NULLS LAST
), evidence AS (
  SELECT jsonb_build_object(
    'source_id', latest.fonte,
    'checked_at', max(log.executado_em),
    'source_error', CASE
      WHEN count(*) FILTER (WHERE log.resultado = 'erro') > 0
        THEN format('%s erro(s) na execução mais recente', count(*) FILTER (WHERE log.resultado = 'erro'))
      ELSE NULL
    END,
    'review_required', false,
    'error_count', count(*) FILTER (WHERE log.resultado = 'erro'),
    'debt_count', count(*) FILTER (WHERE log.resultado = 'indeterminado'),
    'total_count', count(*),
    'execution_id', latest.execucao
  ) AS item
  FROM latest_collection_runs latest
  JOIN public.coleta_log_ultima log
    ON log.fonte = latest.fonte
   AND log.execucao IS NOT DISTINCT FROM latest.execucao
  GROUP BY latest.fonte, latest.execucao
)
SELECT jsonb_build_object(
  'generated_at', now(),
  -- Chapas em duplicidade continuam fora da superfície pública, mas cada
  -- candidatura oficial precisa constar na auditoria. DISTINCT evita contar o
  -- mesmo titular duas vezes quando o TSE publica duas combinações de vice.
  'records', COALESCE((SELECT jsonb_agg(DISTINCT record) FROM candidacies), '[]'::jsonb),
  'collection_evidence', COALESCE((SELECT jsonb_agg(item) FROM evidence), '[]'::jsonb)
);
