BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; actual_after jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260916160000' AND volume=3 AND resultado='encontrado')<>1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260916160000:patrimonio' AND volume=4 AND resultado='encontrado')<>1 THEN
    RAISE EXCEPTION 'godeiro readback: recibos ausentes ou inválidos';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao='migration:20260916160000';
  actual_after := jsonb_build_object(
    'candidato',(SELECT to_jsonb(x) FROM public.candidatos x WHERE id='d45f1947-73a7-4292-9955-7e57927032f0'),
    'patrimonio',(SELECT to_jsonb(x) FROM public.patrimonio x WHERE id='7d88a5ae-23ae-42cf-8285-c5499b489dd7'),
    'chapa',(SELECT to_jsonb(x) FROM public.chapas_2026 x WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061')
  );
  IF actual_after IS DISTINCT FROM r->'after' THEN
    RAISE EXCEPTION 'godeiro readback: postimagem divergiu';
  END IF;
  IF (SELECT count(*) FROM public.candidatos c JOIN public.chapas_2026 ch ON ch.titular_candidato_id=c.id
      WHERE c.id='d45f1947-73a7-4292-9955-7e57927032f0' AND c.slug='godeiro-linharess'
        AND c.sq_candidato_2026='200002554482' AND c.publicavel=true AND c.status='candidato'
        AND c.situacao_candidatura='pendente de julgamento' AND c.partido_sigla='DC'
        AND ch.chave='2026:RN:carlos-alberto-de-almeida-cavalcante' AND ch.titular_sq_candidato=c.sq_candidato_2026
        AND ch.uf='RN' AND ch.cargo_titular='Governador')<>1
     OR (SELECT count(*) FROM public.patrimonio WHERE id='7d88a5ae-23ae-42cf-8285-c5499b489dd7' AND candidato_id='d45f1947-73a7-4292-9955-7e57927032f0'
        AND ano_eleicao=2026 AND valor_total=130000 AND sq_candidato='200002554482'
        AND despublicacao_motivo IS NULL AND despublicado_em IS NULL)<>1 THEN
    RAISE EXCEPTION 'godeiro readback: identidade/vínculo/patrimônio divergiu';
  END IF;
END
$readback$;
COMMIT;
