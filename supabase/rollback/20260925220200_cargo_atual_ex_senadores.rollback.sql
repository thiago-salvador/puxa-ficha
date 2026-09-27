-- Preservador: devolve cargo_atual e ultima_atualizacao de cada ficha escrita
-- pela migration 20260925220200 à preimagem integral do recibo
-- `migration:20260925220200`, com CAS da postimagem.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; afetadas integer; total integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260925220200' THEN
    RAISE EXCEPTION 'cargo-atual-20260925 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260925220200') <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260925220200') THEN
    RAISE EXCEPTION 'cargo-atual-20260925 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb, volume INTO r, total FROM public.coleta_log WHERE execucao = 'migration:20260925220200';
  IF jsonb_array_length(r->'linhas') <> total THEN
    RAISE EXCEPTION 'cargo-atual-20260925 rollback: recibo com % linhas e volume %', jsonb_array_length(r->'linhas'), total;
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'cargo-atual-20260925 rollback: % nao esta na postimagem da migration', linha->>'slug';
    END IF;

    UPDATE public.candidatos c
    SET cargo_atual = linha->'before'->>'cargo_atual',
        ultima_atualizacao = (linha->'before'->>'ultima_atualizacao')::timestamptz
    WHERE c.slug = linha->>'slug';
    GET DIAGNOSTICS afetadas = ROW_COUNT;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'cargo-atual-20260925 rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'slug';
    END IF;

    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'cargo-atual-20260925 rollback: % restaurada nao e a preimagem do recibo', linha->>'slug';
    END IF;
  END LOOP;

  DELETE FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'cargo-atual-20260925'
    AND s.tabela = 'candidatos';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> total THEN
    RAISE EXCEPTION 'cargo-atual-20260925 rollback: snapshot esperado=% atual=%', total, afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'senado','global','candidatos.cargo_atual','encontrado', total,
         jsonb_build_object(
           'resumo','Rollback da migration 20260925220200: cargo_atual das fichas escritas volta ao valor anterior.',
           'linhas', coalesce((
             SELECT jsonb_agg(jsonb_build_object('slug', c.slug, 'candidato', to_jsonb(c)) ORDER BY c.slug)
             FROM public.candidatos c
             WHERE c.slug IN (SELECT value->>'slug' FROM jsonb_array_elements(r->'linhas'))), '[]'::jsonb)
         )::text,
         'https://legis.senado.leg.br/dadosabertos/senador/lista/atual',
         'rollback:20260925220200','escrita';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260925220200';
END
$rollback$;
COMMIT;
