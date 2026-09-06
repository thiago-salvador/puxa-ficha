-- Reconcilia o estado editorial da ficha com o registro oficial de 2026.
-- Fonte: TSE consulta_cand_2026.zip, SHA-256
-- 1c16c0fa6b89510e2677744bc25c8adb6f300321960fa9e222144227a3d358c7,
-- consultada em 2026-09-06T14:23:20.273Z.
--
-- O lote corrige duas classes do mesmo defeito:
-- 1. 164 inscrições oficiais públicas ainda rotuladas como pre-candidato;
-- 2. Clébio Genuíno continuava público depois de o TSE registrar Indeferido.

BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  assinatura text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'status 2026: coorte ausente no replay; correção ignorada';
    RETURN;
  END IF;

  SELECT count(*),
         md5(string_agg(slug || '|' || coalesce(sq_candidato_2026,'') || '|' ||
                        coalesce(status,'') || '|' || coalesce(situacao_candidatura,''),
                        E'\n' ORDER BY slug))
    INTO quantidade, assinatura
  FROM public.candidatos
  WHERE publicavel IS TRUE
    AND sq_candidato_2026 IS NOT NULL
    AND status='pre-candidato';

  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' THEN
    IF quantidade<>164 OR assinatura IS DISTINCT FROM 'c170efc7170d0eac73fd7b5e8c24db99' THEN
      RAISE EXCEPTION 'status 2026: coorte divergiu, linhas=% assinatura=%', quantidade, assinatura;
    END IF;
    IF (SELECT md5(to_jsonb(c)::text) FROM public.candidatos c WHERE slug='clebio-genuino')
       IS DISTINCT FROM '8711e0f3edd8bed7b9db5e93559bc9c7' THEN
      RAISE EXCEPTION 'status 2026: preimage de clebio-genuino divergiu';
    END IF;
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260906150000 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT '20260906150000','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'status','candidato',
           'ultima_atualizacao','2026-09-06T14:23:20.273Z'
         ),
         timestamptz '2026-09-06T14:23:20.273Z'
  FROM public.candidatos c
  WHERE c.publicavel IS TRUE
    AND c.sq_candidato_2026 IS NOT NULL
    AND c.status='pre-candidato'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260906150000 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT '20260906150000','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'status','removido',
           'publicavel',false,
           'situacao_candidatura','indeferido',
           'ultima_atualizacao','2026-09-06T14:23:20.273Z'
         ),
         timestamptz '2026-09-06T14:23:20.273Z'
  FROM public.candidatos c
  WHERE c.slug='clebio-genuino'
    AND c.sq_candidato_2026='230002553857'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos ref=20260906150000 campos=status,publicavel,situacao_candidatura,ultima_atualizacao
  -- @write tabela=candidatos slug=clebio-genuino chave=20260906150000 campos=status,publicavel,situacao_candidatura,ultima_atualizacao
  UPDATE public.candidatos c
  SET status=s.postimage->>'status',
      publicavel=(s.postimage->>'publicavel')::boolean,
      situacao_candidatura=s.postimage->>'situacao_candidatura',
      ultima_atualizacao=(s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906150000'
    AND s.tabela='candidatos'
    AND s.row_id=c.id
    AND to_jsonb(c)=s.preimage;

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND quantidade<>165 THEN
    RAISE EXCEPTION 'status 2026: escritas esperadas=165 atuais=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260906150000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-consulta-cand-2026','global','candidatos.status',
         'encontrado',count(*)::integer,
         'Inscrições oficiais de 2026 reconciliadas de pre-candidato para candidato; preimages preservadas.',
         'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
         'migration:20260906150000:status','escrita'
  FROM public.identidade_timeline_quarentena_snapshot
  WHERE migration_version='20260906150000'
    AND tabela='candidatos'
    AND preimage->>'status'='pre-candidato'
  HAVING count(*)>0;

  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-consulta-cand-2026','candidato','candidatos.publicavel',c.id,
         'encontrado',1,
         'Registro 230002553857 classificado como Indeferido pelo TSE; ficha removida da lista pública.',
         'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
         'migration:20260906150000:clebio-genuino','escrita'
  FROM public.candidatos c
  WHERE c.slug='clebio-genuino';

  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' THEN
    IF EXISTS (
      SELECT 1 FROM public.candidatos
      WHERE publicavel IS TRUE AND sq_candidato_2026 IS NOT NULL AND status<>'candidato'
    ) THEN
      RAISE EXCEPTION 'status 2026: ainda existe registro oficial público sem status candidato';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.candidatos
      WHERE slug='clebio-genuino' AND status='removido' AND publicavel IS FALSE
        AND situacao_candidatura='indeferido'
    ) THEN
      RAISE EXCEPTION 'status 2026: pos-condicao de clebio-genuino falhou';
    END IF;
  END IF;
END
$apply$;

COMMIT;
