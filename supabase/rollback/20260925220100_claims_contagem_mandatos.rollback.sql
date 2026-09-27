-- Preservador: devolve a claim 59afc792 (hana-ghassan) à preimagem integral
-- gravada no recibo `migration:20260925220100`, com CAS da postimagem. A
-- claim é de curadoria, então o trigger bloquear_contagem_ia_cargos_como_mandatos
-- (só gerado_por='ia') não recusa o título antigo.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.pontos_atencao IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260925220100' THEN
    RAISE EXCEPTION 'claims-mandatos-20260925 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260925220100') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260925220100' AND volume = 1 AND resultado = 'encontrado')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260925220100') THEN
    RAISE EXCEPTION 'claims-mandatos-20260925 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260925220100';
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'claims-mandatos-20260925 rollback: recibo sem a linha da claim';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(p) FROM public.pontos_atencao p WHERE p.id = (linha->>'id')::uuid)
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'claims-mandatos-20260925 rollback: claim % nao esta na postimagem', linha->>'id';
    END IF;

    -- Falha fechada: o trigger recusaria devolver o titulo antigo a uma linha
    -- de IA; o rollback so vale para linha de curadoria.
    IF NOT EXISTS (SELECT 1 FROM public.pontos_atencao p
                   WHERE p.id = (linha->>'id')::uuid
                     AND p.gerado_por IS DISTINCT FROM 'ia') THEN
      RAISE EXCEPTION 'claims-mandatos-20260925 rollback: claim % e de IA; rollback fora do escopo', linha->>'id';
    END IF;

    UPDATE public.pontos_atencao p
    SET titulo = linha->'before'->>'titulo',
        descricao = linha->'before'->>'descricao',
        fontes = linha->'before'->'fontes'
    WHERE p.id = (linha->>'id')::uuid
      AND p.gerado_por IS DISTINCT FROM 'ia';
    GET DIAGNOSTICS afetadas = ROW_COUNT;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'claims-mandatos-20260925 rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'id';
    END IF;

    IF (SELECT to_jsonb(p) FROM public.pontos_atencao p WHERE p.id = (linha->>'id')::uuid)
         IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'claims-mandatos-20260925 rollback: claim % restaurada nao e a preimagem', linha->>'id';
    END IF;
  END LOOP;

  DELETE FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'claims-mandatos-20260925'
    AND s.tabela = 'pontos_atencao';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 1 THEN
    RAISE EXCEPTION 'claims-mandatos-20260925 rollback: snapshot esperado=1 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'curadoria-pontos-atencao','global',
         'pontos_atencao.titulo,pontos_atencao.descricao,pontos_atencao.fontes',
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Rollback da migration 20260925220100: claim de hana-ghassan volta ao texto anterior.',
           'linhas', (SELECT jsonb_agg(jsonb_build_object('id', p.id, 'claim', to_jsonb(p)) ORDER BY p.id)
                      FROM public.pontos_atencao p
                      WHERE p.id = '59afc792-415e-4e59-9fc0-6f71ea883b0c')
         )::text,
         'https://g1.globo.com/pa/para/noticia/2026/04/02/hana-ghassan-assume-governo-do-para.ghtml',
         'rollback:20260925220100','escrita';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260925220100';
END
$rollback$;
COMMIT;
