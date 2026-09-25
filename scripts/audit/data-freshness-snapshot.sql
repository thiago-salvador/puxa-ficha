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
    -- to_jsonb mantém compatibilidade entre deploy do código e aplicação do DDL.
    'situacao_descricao', CASE WHEN to_jsonb(ch)->>'fonte_tipo' = 'divulgacand_detalhe'
      THEN to_jsonb(ch)->'fonte_detalhe'->'titular'->>'descricao_situacao' ELSE NULL END,
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
    'situacao_descricao', CASE WHEN to_jsonb(ch)->>'fonte_tipo' = 'divulgacand_detalhe'
      THEN to_jsonb(ch)->'fonte_detalhe'->'vice'->>'descricao_situacao' ELSE NULL END,
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
), target_inventory AS (
  -- O último run pode cobrir somente um alvo. Manter o estoque de recibos
  -- vigentes separado do resultado operacional daquela execução.
  SELECT fonte, jsonb_build_object(
    'total_count', count(*),
    'error_count', count(*) FILTER (WHERE resultado = 'erro'),
    'debt_count', count(*) FILTER (WHERE resultado = 'indeterminado')
  ) AS item
  FROM collection_rows
  GROUP BY fonte
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
    ,'target_inventory', (SELECT inventory.item FROM target_inventory inventory WHERE inventory.fonte = log.fonte)
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
      -- 152 -> 181: universo vigente cresceu (issue #339, coletar-destaques-votacoes.ts
      -- passou a reverificar 5 candidatos públicos com pares novos, filtrando os que
      -- não estão em data/candidatos.json). Até alguém publicar evidência confirmada
      -- para o universo de 181 pares, este snapshot reporta "incompleto" — o mesmo
      -- comportamento que seguiu a reconciliação 154 -> 152 até a evidência de 09-09.
      -- 181 -> 235 (issue #425): quatro votações do quiz voltaram ao catálogo com
      -- votacao_id_api exato (Reforma Trabalhista, Teto de Gastos, Reforma da
      -- Previdência, Autonomia do Banco Central). Vale a mesma regra: incompleto até
      -- a publicação da evidência confirmada para os 235 pares.
      WHEN log.fonte = 'destaques-votacoes' THEN
        count(*) FILTER (WHERE log.escopo = 'global' AND log.detalhe LIKE 'provenance_v1:%') = 1
        AND count(*) FILTER (WHERE log.escopo = 'candidato' AND log.detalhe LIKE 'provenance_v1:%') = 235
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
), public_candidacies AS (
  -- Uma linha por ficha pública de Presidente, Governador e Senador, com a
  -- identidade TSE 2026 da ficha. Alimenta a conferência por ficha contra
  -- consulta_cand, complementar e redes sociais, inclusive do Senado, que não
  -- tem chapa em chapas_2026. O gate de admissão acima continua Gov/Pres.
  SELECT jsonb_build_object(
    'candidato_id', c.id,
    'slug', c.slug,
    'office', c.cargo_disputado,
    'uf', c.estado,
    'nome_urna', c.nome_urna,
    'nome_completo', c.nome_completo,
    'partido_sigla', c.partido_sigla,
    'situacao_candidatura', c.situacao_candidatura,
    'numero_urna', c.numero_urna,
    'sq_candidato', base.sq_candidato_2026,
    -- nome_urna da ficha é nome de exibição editorial; o nome de urna do
    -- registro TSE publicado vive no roster 2026, chaveado pelo mesmo SQ.
    'registro_nome_urna', (
      SELECT min(r.nome_urna) FROM public.candidatos_roster_2026_publico r
      WHERE r.ano = 2026 AND r.sq_candidato = base.sq_candidato_2026
    ),
    'vice_sq_candidatos', COALESCE((
      SELECT jsonb_agg(DISTINCT ch.vice_sq_candidato)
      FROM public.chapas_2026 ch
      WHERE ch.titular_candidato_id = c.id AND ch.vice_sq_candidato IS NOT NULL
    ), '[]'::jsonb)
  ) AS item
  FROM public.candidatos_publico c
  JOIN public.candidatos base ON base.id = c.id
  WHERE c.cargo_disputado IN ('Presidente', 'Governador', 'Senador')
)
SELECT jsonb_build_object(
  'generated_at', now(),
  -- Chapas em duplicidade continuam fora da superfície pública, mas cada
  -- candidatura oficial precisa constar na auditoria. DISTINCT evita contar o
  -- mesmo titular duas vezes quando o TSE publica duas combinações de vice.
  'records', COALESCE((SELECT jsonb_agg(DISTINCT record) FROM candidacies), '[]'::jsonb),
  'public_profiles', COALESCE((SELECT jsonb_agg(profile) FROM public_profiles), '[]'::jsonb),
  'public_candidacies', COALESCE((SELECT jsonb_agg(item) FROM public_candidacies), '[]'::jsonb),
  'collection_evidence', COALESCE((SELECT jsonb_agg(item) FROM evidence), '[]'::jsonb)
);
