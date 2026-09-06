-- Reconcilia a ficha pública de Dr. Helton Monteiro com o estado oficial atual.
-- Fonte: TSE DivulgaCandContas, listagem de Governador/SE consultada ao vivo em
-- 2026-09-06T20:10:13.360Z pela execução 34057086178.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  fonte text := 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/2026/SE/20322002026/3/candidatos';
  ref text := 'freshness-dr-helton-20260906';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'dr-helton: coorte ausente; correção ignorada';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'dr-helton: correção de dado ignorada apenas no replay descartável';
    RETURN;
  END IF;

  IF (SELECT md5(to_jsonb(c)::text)
      FROM public.candidatos c
      WHERE c.id='86ffacf8-e5d4-4f9b-a808-0f0cb551d832'::uuid
        AND c.slug='dr-helton-monteiro'
        AND c.sq_candidato_2026='260002547415')
     IS DISTINCT FROM '4eeab8e203cd80f15fac1b110489a3b8' THEN
    RAISE EXCEPTION 'dr-helton: preimage divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=freshness-dr-helton-20260906 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'freshness-dr-helton-20260906','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'status','removido',
           'publicavel',false,
           'situacao_candidatura','indeferido',
           'fonte_dados',to_jsonb(
             CASE WHEN fonte=ANY(c.fonte_dados) THEN c.fonte_dados
                  ELSE array_append(c.fonte_dados,fonte) END
           ),
           'verificacao_campos',jsonb_set(
             coalesce(c.verificacao_campos,'{}'::jsonb),
             '{candidate_registration}',
             jsonb_build_object(
               'fonte',fonte,
               'estado','publicado',
               'situacao','indeferido',
               'verificado_em','2026-09-06T20:10:13.360Z',
               'execucao','https://github.com/thiago-salvador/puxa-ficha/actions/runs/34057086178'
             ),
             true
           ),
           'ultima_atualizacao','2026-09-06T20:10:13.360Z'
         ),
         timestamptz '2026-09-06T20:10:13.360Z'
  FROM public.candidatos c
  WHERE c.id='86ffacf8-e5d4-4f9b-a808-0f0cb551d832'::uuid
    AND c.slug='dr-helton-monteiro'
    AND c.sq_candidato_2026='260002547415'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=dr-helton-monteiro campos=status,publicavel,situacao_candidatura,fonte_dados,verificacao_campos,ultima_atualizacao
  UPDATE public.candidatos c
  SET status=s.postimage->>'status',
      publicavel=(s.postimage->>'publicavel')::boolean,
      situacao_candidatura=s.postimage->>'situacao_candidatura',
      fonte_dados=ARRAY(SELECT jsonb_array_elements_text(s.postimage->'fonte_dados')),
      verificacao_campos=s.postimage->'verificacao_campos',
      ultima_atualizacao=(s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version=ref
    AND s.tabela='candidatos'
    AND s.row_id=c.id
    AND c.slug='dr-helton-monteiro'
    AND to_jsonb(c)=s.preimage;

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF quantidade<>1 THEN
    RAISE EXCEPTION 'dr-helton: escrita esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:freshness-dr-helton-20260906 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-2026','candidato','candidatos.publicavel',c.id,
         'encontrado',1,
         'Registro 260002547415 classificado como Indeferido pelo TSE; ficha removida da lista pública sem apagar seu histórico.',
         fonte,'migration:freshness-dr-helton-20260906','escrita'
  FROM public.candidatos c
  WHERE c.slug='dr-helton-monteiro';

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE id='86ffacf8-e5d4-4f9b-a808-0f0cb551d832'::uuid
      AND slug='dr-helton-monteiro'
      AND status='removido'
      AND publicavel IS FALSE
      AND situacao_candidatura='indeferido'
      AND (verificacao_campos->'candidate_registration'->>'situacao')='indeferido'
  ) THEN
    RAISE EXCEPTION 'dr-helton: postimage ausente';
  END IF;
END
$apply$;

COMMIT;
