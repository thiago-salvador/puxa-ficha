-- Confere o recibo de situação sem tratá-lo como certificação do perfil inteiro.
DO $readback$
DECLARE
  total_rows bigint;
  distinct_slugs bigint;
  confirmed_rows bigint;
  unresolved_rows bigint;
  automatic_updates bigint;
  payload_hash text;
  postimage_hash text;
BEGIN
  SELECT count(*),count(DISTINCT alvo),
         count(*) FILTER (WHERE resultado='encontrado' AND volume=1),
         count(*) FILTER (WHERE resultado='indeterminado' AND volume=0),
         count(*) FILTER (WHERE detalhe::jsonb->>'atualizacao_automatica'='true'),
         md5(coalesce(string_agg(
           alvo||'|'||(detalhe::jsonb->>'sq_candidato')||'|'||resultado||'|'||volume::text||'|'||
           (detalhe::jsonb->>'motivo')||'|'||(detalhe::jsonb->>'metodo')||'|'||
           (detalhe::jsonb->>'atualizacao_automatica')||'|'||(detalhe::jsonb->>'pendencia_terminal'),
           E'\n' ORDER BY alvo COLLATE "C"),''))
  INTO total_rows,distinct_slugs,confirmed_rows,unresolved_rows,automatic_updates,payload_hash
  FROM public.coleta_log WHERE execucao='migration:20260924205031';
  IF (SELECT count(*) FROM public.candidatos WHERE publicavel IS TRUE)<>513 OR
     total_rows<>513 OR distinct_slugs<>513 OR confirmed_rows<>362 OR
     unresolved_rows<>151 OR automatic_updates<>19 OR
     payload_hash<>'09b4b5623749c55c96d33b6270b26469' THEN
    RAISE EXCEPTION 'situacao_tse_2026: contagem, estado ou payload por SQ divergiu';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coleta_log l
    LEFT JOIN public.candidatos c ON c.id=l.candidato_id AND c.slug=l.alvo
    WHERE l.execucao='migration:20260924205031' AND (
      c.id IS NULL OR c.publicavel IS DISTINCT FROM TRUE OR
      l.fonte IS DISTINCT FROM 'tse-situacao' OR
      l.escopo IS DISTINCT FROM 'candidato' OR
      l.natureza IS DISTINCT FROM 'coleta' OR
      l.executado_em IS DISTINCT FROM '2026-09-24T17:22:25.641Z'::timestamptz OR
      l.url IS DISTINCT FROM 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip' OR
      l.detalhe::jsonb->>'ano_eleicao' IS DISTINCT FROM '2026' OR
      l.detalhe::jsonb->>'escopo' IS DISTINCT FROM 'situacao de julgamento no pacote complementar TSE' OR
      l.detalhe::jsonb->>'resource_sha256' IS DISTINCT FROM '86b28861a5ac5ab15c6de590646b916dba8a6134a5c8294534c817ab385a0610' OR
      l.detalhe::jsonb->>'sq_candidato' IS DISTINCT FROM c.sq_candidato_2026 OR
      (l.resultado='encontrado' AND l.detalhe::jsonb->>'motivo' IS DISTINCT FROM 'situacao_conferida_por_sq') OR
      (l.resultado='indeterminado' AND coalesce(l.detalhe::jsonb->>'motivo','') NOT IN
        ('identidade_ou_status_bloqueado','cpf_pendente_sem_persistencia','terminal_publicacao_pendente'))
    )
  ) THEN
    RAISE EXCEPTION 'situacao_tse_2026: identidade, motivo ou fonte divergiu';
  END IF;
  SELECT md5(coalesce(string_agg(c.slug||'|'||c.sq_candidato_2026||'|'||c.situacao_candidatura,E'\n' ORDER BY c.slug COLLATE "C"),''))
  INTO postimage_hash
  FROM public.coleta_log l JOIN public.candidatos c ON c.id=l.candidato_id
  WHERE l.execucao='migration:20260924205031'
    AND l.detalhe::jsonb->>'atualizacao_automatica'='true';
  IF postimage_hash<>'fcec9484508e906991df57771cda2b03' THEN
    RAISE EXCEPTION 'situacao_tse_2026: pós-imagem de 19 situações divergiu';
  END IF;
END
$readback$;

SELECT resultado,count(*) AS candidatos,sum(volume) AS situacoes_confirmadas
FROM public.coleta_log
WHERE execucao='migration:20260924205031'
GROUP BY resultado ORDER BY resultado;
