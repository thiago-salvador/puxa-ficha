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
), collection_rows AS (
  SELECT
    fonte,
    escopo,
    alvo,
    executado_em,
    resultado,
    detalhe,
    COALESCE(
      execucao,
      format('legacy:%s:%s:%s', executado_em, escopo, alvo)
    ) AS execution_id
  FROM public.coleta_log_ultima
), evidence AS (
  SELECT jsonb_build_object(
    'source_id', log.fonte,
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
    'execution_id', log.execution_id
    ,'provenance_contract_version', CASE
      WHEN log.fonte = 'destaques-votacoes' THEN max(
        CASE WHEN log.detalhe LIKE 'provenance_v1:%'
          THEN (substring(log.detalhe FROM 15)::jsonb ->> 'contract_version')::integer
          ELSE NULL
        END
      )
      ELSE NULL
    END
    ,'provenance_complete', CASE
      WHEN log.fonte = 'destaques-votacoes' THEN
        count(*) FILTER (WHERE log.escopo = 'global' AND log.detalhe LIKE 'provenance_v1:%') = 1
        AND count(*) FILTER (WHERE log.escopo = 'candidato' AND log.detalhe LIKE 'provenance_v1:%') = 154
        AND count(*) FILTER (WHERE log.resultado NOT IN ('encontrado', 'sem_achado_no_escopo')) = 0
      ELSE NULL
    END
    ,'evidence_sha256', CASE
      WHEN log.fonte = 'destaques-votacoes' THEN max(
        CASE WHEN log.escopo = 'global' AND log.detalhe LIKE 'provenance_v1:%'
          THEN substring(log.detalhe FROM 15)::jsonb ->> 'comparison_sha256'
          ELSE NULL
        END
      )
      ELSE NULL
    END
    ,'raw_payload_count', CASE
      WHEN log.fonte = 'destaques-votacoes' THEN max(
        CASE WHEN log.escopo = 'global' AND log.detalhe LIKE 'provenance_v1:%'
          THEN (substring(log.detalhe FROM 15)::jsonb ->> 'raw_payload_count')::integer
          ELSE NULL
        END
      )
      ELSE NULL
    END
    ,'pair_count', CASE
      WHEN log.fonte = 'destaques-votacoes' THEN count(*) FILTER (WHERE log.escopo = 'candidato')
      ELSE NULL
    END
    ,'double_read_execution_ids', CASE
      WHEN log.fonte = 'destaques-votacoes' THEN max(
        CASE WHEN log.escopo = 'global' AND log.detalhe LIKE 'provenance_v1:%'
          THEN (substring(log.detalhe FROM 15)::jsonb -> 'execution_ids')::text
          ELSE NULL
        END
      )::jsonb
      ELSE NULL
    END
  ) AS item
  FROM collection_rows log
  GROUP BY log.fonte, log.execution_id
), public_profiles AS (
  SELECT jsonb_build_object(
    'slug', c.slug,
    'partido_sigla', c.partido_sigla,
    'situacao_candidatura', c.situacao_candidatura,
    'office', c.cargo_disputado,
    'uf', c.estado,
    'foto_url', c.foto_url,
    'biografia', c.biografia,
    'naturalidade', c.naturalidade,
    'data_nascimento', c.data_nascimento,
    'formacao', c.formacao,
    'profissao_declarada', c.profissao_declarada,
    'genero', c.genero,
    'estado_civil', c.estado_civil,
    'cor_raca', c.cor_raca,
    'verificacao_campos', c.verificacao_campos
  ) AS profile
  FROM public.candidatos_publico c
  WHERE c.cargo_disputado IN ('Presidente', 'Governador')
)
SELECT jsonb_build_object(
  'generated_at', now(),
  -- Chapas em duplicidade continuam fora da superfície pública, mas cada
  -- candidatura oficial precisa constar na auditoria. DISTINCT evita contar o
  -- mesmo titular duas vezes quando o TSE publica duas combinações de vice.
  'records', COALESCE((SELECT jsonb_agg(DISTINCT record) FROM candidacies), '[]'::jsonb),
  'public_profiles', COALESCE((SELECT jsonb_agg(profile) FROM public_profiles), '[]'::jsonb),
  'collection_evidence', COALESCE((SELECT jsonb_agg(item) FROM evidence), '[]'::jsonb)
);
