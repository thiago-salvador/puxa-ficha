-- Preservador: devolve numero_processo da linha de wilson-grassi-junior à
-- preimagem integral do recibo `migration:20260926190000`, com CAS da
-- postimagem. Só roda depois do rollback da 20260926190100, que tira a CHECK
-- que recusaria o número antigo.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.processos IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260926190000' THEN
    RAISE EXCEPTION 'processo-cnj-20260926 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926190000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260926190000' AND volume = 1 AND resultado = 'encontrado')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260926190000') THEN
    RAISE EXCEPTION 'processo-cnj-20260926 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926190000';
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'processo-cnj-20260926 rollback: recibo sem a linha';
  END IF;
  linha := r->'linhas'->0;

  IF (SELECT to_jsonb(p) FROM public.processos p WHERE p.id = (linha->>'id')::uuid)
       IS DISTINCT FROM linha->'after' THEN
    RAISE EXCEPTION 'processo-cnj-20260926 rollback: linha nao esta na postimagem';
  END IF;

  UPDATE public.processos p
  SET numero_processo = linha->'before'->>'numero_processo'
  WHERE p.id = (linha->>'id')::uuid;
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 1 THEN
    RAISE EXCEPTION 'processo-cnj-20260926 rollback: escrita esperada=1 atual=%', afetadas;
  END IF;

  IF (SELECT to_jsonb(p) FROM public.processos p WHERE p.id = (linha->>'id')::uuid)
       IS DISTINCT FROM linha->'before' THEN
    RAISE EXCEPTION 'processo-cnj-20260926 rollback: linha restaurada nao e a preimagem';
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tjsp-esaj-2grau','candidato','processos.numero_processo', p.candidato_id,'encontrado', 1,
         jsonb_build_object(
           'resumo','Rollback da migration 20260926190000: numero_processo de wilson-grassi-junior volta ao valor anterior.',
           'linhas', jsonb_build_array(jsonb_build_object('slug', linha->>'slug', 'id', p.id, 'processo', to_jsonb(p)))
         )::text,
         'https://esaj.tjsp.jus.br/cposg/search.do?cbPesquisa=NUMPROC&dePesquisaNuUnificado=2254046-86.2021.8.26.0000&tipoNuProcesso=UNIFICADO',
         'rollback:20260926190000','escrita'
  FROM public.processos p
  WHERE p.id = (linha->>'id')::uuid;

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260926190000';
END
$rollback$;
COMMIT;
