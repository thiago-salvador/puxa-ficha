-- Preservador: não apaga candidato, chapa, filhos ou recibos. Despublica apenas
-- o candidato criado, com CAS da postimagem integral e prova das demais linhas.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos, public.chapas_2026, public.historico_politico, public.patrimonio_ausencia_oficial IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; actual_after jsonb; actual_before jsonb; affected integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260907193100' THEN
    RAISE EXCEPTION 'siqueira rollback: ledger divergiu';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260907193100' AND volume=4)<>1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao='rollback:20260907193100') THEN
    RAISE EXCEPTION 'siqueira rollback: recibo inválido ou rollback repetido';
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
    RAISE EXCEPTION 'siqueira rollback: postimagem ou invariância divergiu';
  END IF;
  UPDATE public.candidatos SET publicavel=false,status='removido'
  WHERE id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80' AND slug='siqueira-campos-jr' AND sq_candidato_2026='270002554375';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'siqueira rollback: candidato count'; END IF;
  IF (SELECT to_jsonb(x)-ARRAY['publicavel','status'] FROM public.candidatos x WHERE id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80')
     IS DISTINCT FROM ((r->'after'->'candidato')-ARRAY['publicavel','status']) THEN
    RAISE EXCEPTION 'siqueira rollback: coluna não autorizada mudou';
  END IF;
  INSERT INTO public.coleta_log (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES ('tse','candidato','siqueira-campos-jr:despublicacao','1d5c69c3-4a4e-4f8f-9796-aa2248775e80','encontrado',1,
    jsonb_build_object('candidato',(SELECT to_jsonb(x) FROM public.candidatos x WHERE id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80'),'acao','Despublicação preservadora; chapa, histórico e ausência oficial permanecem.')::text,
    r->'source'->>'url','rollback:20260907193100','escrita');
  DELETE FROM supabase_migrations.schema_migrations WHERE version='20260907193100';
END
$rollback$;
COMMIT;
