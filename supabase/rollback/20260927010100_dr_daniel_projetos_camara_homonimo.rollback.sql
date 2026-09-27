-- Preservador: devolve as 100 proposições de dr-daniel e as duas chaves de
-- verificacao_campos à preimagem do snapshot `dr-daniel-camara-20260927`, com
-- CAS da postimagem.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.projetos_lei IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE s record; atual jsonb; alvo jsonb; afetadas integer; total integer := 0;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260927010100' THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260927010100') <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260927010100') THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927 rollback: recibo invalido ou rollback repetido';
  END IF;

  FOR s IN SELECT * FROM public.identidade_timeline_quarentena_snapshot
           WHERE migration_version = 'dr-daniel-camara-20260927' LOOP
    IF s.tabela = 'projetos_lei' THEN
      SELECT to_jsonb(p) INTO atual FROM public.projetos_lei p WHERE p.id = s.row_id;
      IF atual IS DISTINCT FROM s.postimage THEN
        RAISE EXCEPTION 'dr-daniel-camara-20260927 rollback: proposicao % nao esta na postimagem', s.row_id;
      END IF;
      UPDATE public.projetos_lei p
      SET despublicado_em = (s.preimage->>'despublicado_em')::timestamptz,
          despublicacao_motivo = s.preimage->>'despublicacao_motivo'
      WHERE p.id = s.row_id;
      GET DIAGNOSTICS afetadas = ROW_COUNT;
      SELECT to_jsonb(p) INTO atual FROM public.projetos_lei p WHERE p.id = s.row_id;
      alvo := s.preimage;
    ELSE
      SELECT to_jsonb(c)->'verificacao_campos' INTO atual FROM public.candidatos c WHERE c.id = s.row_id;
      IF atual IS DISTINCT FROM s.postimage->'verificacao_campos' THEN
        RAISE EXCEPTION 'dr-daniel-camara-20260927 rollback: verificacao_campos nao esta na postimagem';
      END IF;
      UPDATE public.candidatos c SET verificacao_campos = s.preimage->'verificacao_campos' WHERE c.id = s.row_id;
      GET DIAGNOSTICS afetadas = ROW_COUNT;
      SELECT to_jsonb(c)->'verificacao_campos' INTO atual FROM public.candidatos c WHERE c.id = s.row_id;
      alvo := s.preimage->'verificacao_campos';
    END IF;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'dr-daniel-camara-20260927 rollback: escrita esperada=1 atual=% em %', afetadas, s.row_id;
    END IF;
    IF atual IS DISTINCT FROM alvo THEN
      RAISE EXCEPTION 'dr-daniel-camara-20260927 rollback: % restaurada nao e a preimagem', s.row_id;
    END IF;
    total := total + 1;
  END LOOP;

  IF total <> 101 THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927 rollback: linhas restauradas esperadas=101 atual=%', total;
  END IF;

  DELETE FROM public.identidade_timeline_quarentena_snapshot WHERE migration_version = 'dr-daniel-camara-20260927';

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  VALUES ('camara-identidade-homonima','global',
          'projetos_lei.despublicado_em,projetos_lei.despublicacao_motivo,candidatos.verificacao_campos',
          'encontrado', 101,
          jsonb_build_object('resumo','Rollback da migration 20260927010100: as 100 proposicoes de dr-daniel voltam a ser publicadas e verificacao_campos volta ao estado anterior.')::text,
          'https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=220614',
          'rollback:20260927010100','escrita');

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927010100';
END
$rollback$;
COMMIT;
