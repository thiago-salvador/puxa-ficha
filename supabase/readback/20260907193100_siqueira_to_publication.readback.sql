BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; actual_after jsonb; actual_before jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260907193100' AND volume=4 AND resultado='encontrado')<>1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260907193100:patrimonio' AND volume=0 AND resultado='vazio_confirmado')<>1 THEN
    RAISE EXCEPTION 'siqueira readback: recibos ausentes ou inválidos';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao='migration:20260907193100';
  actual_after := jsonb_build_object(
    'candidato',(SELECT to_jsonb(x) FROM public.candidatos x WHERE id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80'),
    'chapa',(SELECT to_jsonb(x) FROM public.chapas_2026 x WHERE id='a2d296dd-dde7-4791-8a00-1a6cf6e9cfe5'),
    'historico',(SELECT to_jsonb(x) FROM public.historico_politico x WHERE id='6db89cf8-3e4f-4141-ac0b-de1b5a4bd32a'),
    'ausencia',(SELECT to_jsonb(x) FROM public.patrimonio_ausencia_oficial x WHERE id='7c5c3d27-acee-4efd-be9f-036a16a3c460')
  );
  actual_before := jsonb_build_object(
    'candidatos',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.candidatos x WHERE id<>'1d5c69c3-4a4e-4f8f-9796-aa2248775e80'),
    'chapas',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.chapas_2026 x WHERE id<>'a2d296dd-dde7-4791-8a00-1a6cf6e9cfe5'),
    'historico',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.historico_politico x WHERE id<>'6db89cf8-3e4f-4141-ac0b-de1b5a4bd32a'),
    'ausencias',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.patrimonio_ausencia_oficial x WHERE id<>'7c5c3d27-acee-4efd-be9f-036a16a3c460')
  );
  IF actual_after IS DISTINCT FROM r->'after' OR actual_before IS DISTINCT FROM r->'before' THEN
    RAISE EXCEPTION 'siqueira readback: postimagem ou invariância divergiu';
  END IF;
  IF (SELECT count(*) FROM public.candidatos c JOIN public.chapas_2026 ch ON ch.titular_candidato_id=c.id
      WHERE c.id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80' AND c.slug='siqueira-campos-jr'
        AND c.sq_candidato_2026='270002554375' AND c.publicavel=true AND c.status='candidato'
        AND c.situacao_candidatura='aguardando julgamento' AND c.nome_completo=ch.titular_nome_completo
        AND c.nome_urna=ch.titular_nome_urna AND c.partido_sigla=ch.titular_partido_sigla
        AND c.estado=ch.uf AND c.cargo_disputado=ch.cargo_titular
        AND ch.titular_sq_candidato=c.sq_candidato_2026 AND ch.vice_sq_candidato='270002554376'
        AND ch.fonte_tipo='divulgacand_detalhe' AND ch.sq_coligacao IS NULL
        AND ch.tse_situacao_titular_codigo IS NULL AND ch.tse_situacao_vice_codigo IS NULL)<>1
     OR (SELECT count(*) FROM public.historico_politico WHERE candidato_id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80' AND periodo_inicio=2026 AND cargo='Governador' AND proveniencia='tse')<>1
     OR (SELECT count(*) FROM public.patrimonio_ausencia_oficial WHERE candidato_id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80' AND ano_eleicao=2026 AND sq_candidato='270002554375')<>1
     OR EXISTS (SELECT 1 FROM public.patrimonio WHERE candidato_id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80') THEN
    RAISE EXCEPTION 'siqueira readback: identidade/vínculo/histórico/ausência divergiu';
  END IF;
END
$readback$;
COMMIT;
