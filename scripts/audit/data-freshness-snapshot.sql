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
  WHERE ch.identidade_status <> 'duplicidade_oficial'

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
  WHERE ch.identidade_status <> 'duplicidade_oficial'
), evidence AS (
  SELECT jsonb_build_object(
    'source_id', fonte,
    'checked_at', max(executado_em),
    'source_error', CASE
      WHEN count(*) FILTER (WHERE resultado <> 'erro') = 0 THEN 'todas as tentativas mais recentes falharam'
      ELSE NULL
    END,
    'review_required', bool_or(resultado IN ('erro', 'indeterminado'))
  ) AS item
  FROM public.coleta_log_ultima
  GROUP BY fonte
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'records', COALESCE((SELECT jsonb_agg(record) FROM candidacies), '[]'::jsonb),
  'collection_evidence', COALESCE((SELECT jsonb_agg(item) FROM evidence), '[]'::jsonb)
);
