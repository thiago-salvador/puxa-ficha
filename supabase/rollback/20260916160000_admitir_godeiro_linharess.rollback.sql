-- Preservador: não apaga candidato nem patrimônio. Despublica o candidato
-- criado, despublica o patrimônio associado e desfaz o vínculo em
-- chapas_2026.titular_candidato_id (única coluna preexistente que a
-- migration mutou), com CAS da postimagem integral e prova das demais linhas.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos, public.chapas_2026, public.patrimonio IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; actual_after jsonb; actual_before jsonb; affected integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260916160000' THEN
    RAISE EXCEPTION 'godeiro rollback: ledger divergiu';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260916160000' AND volume=3)<>1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao='rollback:20260916160000') THEN
    RAISE EXCEPTION 'godeiro rollback: recibo inválido ou rollback repetido';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao='migration:20260916160000';
  actual_after := jsonb_build_object(
    'candidato',(SELECT to_jsonb(x) FROM public.candidatos x WHERE id='d45f1947-73a7-4292-9955-7e57927032f0'),
    'patrimonio',(SELECT to_jsonb(x) FROM public.patrimonio x WHERE id='7d88a5ae-23ae-42cf-8285-c5499b489dd7'),
    'chapa',(SELECT to_jsonb(x) FROM public.chapas_2026 x WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061')
  );
  actual_before := jsonb_build_object(
    'candidatos',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.candidatos x WHERE id<>'d45f1947-73a7-4292-9955-7e57927032f0'),
    'patrimonio',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.patrimonio x WHERE id<>'7d88a5ae-23ae-42cf-8285-c5499b489dd7'),
    'chapa_outras',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.chapas_2026 x WHERE id<>'250e9ca4-b101-4ec4-9835-bff18c596061'),
    'chapa_alvo',(SELECT to_jsonb(x)-ARRAY['titular_candidato_id'] FROM public.chapas_2026 x WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061')
  );
  IF actual_after IS DISTINCT FROM r->'after'
     OR actual_before->'candidatos' IS DISTINCT FROM r->'before'->'candidatos'
     OR actual_before->'patrimonio' IS DISTINCT FROM r->'before'->'patrimonio'
     OR actual_before->'chapa_outras' IS DISTINCT FROM r->'before'->'chapa_outras'
     OR actual_before->'chapa_alvo' IS DISTINCT FROM (r->'before'->'chapa_alvo')-ARRAY['titular_candidato_id']
  THEN
    RAISE EXCEPTION 'godeiro rollback: postimagem ou invariância divergiu';
  END IF;
  UPDATE public.candidatos SET publicavel=false,status='removido'
  WHERE id='d45f1947-73a7-4292-9955-7e57927032f0' AND slug='godeiro-linharess' AND sq_candidato_2026='200002554482';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'godeiro rollback: candidato count'; END IF;
  IF (SELECT to_jsonb(x)-ARRAY['publicavel','status'] FROM public.candidatos x WHERE id='d45f1947-73a7-4292-9955-7e57927032f0')
     IS DISTINCT FROM ((r->'after'->'candidato')-ARRAY['publicavel','status']) THEN
    RAISE EXCEPTION 'godeiro rollback: coluna não autorizada de candidatos mudou';
  END IF;
  UPDATE public.patrimonio SET despublicacao_motivo='Rollback da migration 20260916160000',despublicado_em=now()
  WHERE id='7d88a5ae-23ae-42cf-8285-c5499b489dd7' AND candidato_id='d45f1947-73a7-4292-9955-7e57927032f0';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'godeiro rollback: patrimônio count'; END IF;
  IF (SELECT to_jsonb(x)-ARRAY['despublicacao_motivo','despublicado_em'] FROM public.patrimonio x WHERE id='7d88a5ae-23ae-42cf-8285-c5499b489dd7')
     IS DISTINCT FROM ((r->'after'->'patrimonio')-ARRAY['despublicacao_motivo','despublicado_em']) THEN
    RAISE EXCEPTION 'godeiro rollback: coluna não autorizada de patrimônio mudou';
  END IF;
  UPDATE public.chapas_2026 SET titular_candidato_id=NULL
  WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061' AND titular_candidato_id='d45f1947-73a7-4292-9955-7e57927032f0';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'godeiro rollback: chapa count'; END IF;
  IF (SELECT to_jsonb(x)-ARRAY['titular_candidato_id'] FROM public.chapas_2026 x WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061')
     IS DISTINCT FROM ((r->'after'->'chapa')-ARRAY['titular_candidato_id']) THEN
    RAISE EXCEPTION 'godeiro rollback: coluna não autorizada de chapas_2026 mudou';
  END IF;
  INSERT INTO public.coleta_log (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES ('tse','candidato','godeiro-linharess:despublicacao','d45f1947-73a7-4292-9955-7e57927032f0','encontrado',3,
    jsonb_build_object('candidato',(SELECT to_jsonb(x) FROM public.candidatos x WHERE id='d45f1947-73a7-4292-9955-7e57927032f0'),
      'patrimonio',(SELECT to_jsonb(x) FROM public.patrimonio x WHERE id='7d88a5ae-23ae-42cf-8285-c5499b489dd7'),
      'chapa',(SELECT to_jsonb(x) FROM public.chapas_2026 x WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061'),
      'acao','Despublicação preservadora; nenhuma linha apagada; vínculo em chapas_2026 desfeito.')::text,
    r->'source'->>'url','rollback:20260916160000','escrita');
  DELETE FROM supabase_migrations.schema_migrations WHERE version='20260916160000';
END
$rollback$;
COMMIT;
