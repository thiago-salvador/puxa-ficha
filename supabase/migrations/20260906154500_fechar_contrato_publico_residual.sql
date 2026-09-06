-- Fecha as duas lacunas encontradas pelo gate integral depois da publicação das
-- candidaturas de 2026.
--
-- Laudicério Aguiar: o DivulgaCand, na candidatura 110002553937, informa
-- literalmente "Não há bens a declarar".
-- Leonardo Avalanche: o snapshot oficial da chapa presidencial registra o SQ
-- 280002553883 como vice de Pablo Marçal, mas a ficha local ainda conservava o
-- estado editorial anterior ao registro e a chapa não estava ligada ao perfil.

BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio_ausencia_oficial IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'contrato residual: coorte ausente no replay; correção ignorada';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' AND (
    NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug='laudicerio-aguiar')
    OR NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug='leonardo-avalanche')
    OR NOT EXISTS (
      SELECT 1 FROM public.chapas_2026
      WHERE chave='2026:BR:pablo-henrique-costa-marcal'
    )
  ) THEN
    RAISE NOTICE 'contrato residual: alvos ausentes no replay; correção ignorada';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' THEN
    IF (SELECT md5(to_jsonb(c)::text) FROM public.candidatos c WHERE c.slug='laudicerio-aguiar')
       IS DISTINCT FROM 'd5018208b4c61cb60c7daadece02e761' THEN
      RAISE EXCEPTION 'contrato residual: preimage de Laudicério divergiu';
    END IF;
    IF (SELECT md5(to_jsonb(c)::text) FROM public.candidatos c WHERE c.slug='leonardo-avalanche')
       IS DISTINCT FROM '74e1cdebe150637c1f8c359b3182a85b' THEN
      RAISE EXCEPTION 'contrato residual: preimage de Leonardo divergiu';
    END IF;
    IF (SELECT md5(to_jsonb(ch)::text) FROM public.chapas_2026 ch
        WHERE ch.chave='2026:BR:pablo-henrique-costa-marcal')
       IS DISTINCT FROM 'b793af17aea5e24f1657f92e20e33e13' THEN
      RAISE EXCEPTION 'contrato residual: preimage da chapa presidencial divergiu';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.patrimonio p
      JOIN public.candidatos c ON c.id=p.candidato_id
      WHERE c.slug='laudicerio-aguiar' AND p.ano_eleicao=2026
      UNION ALL
      SELECT 1 FROM public.patrimonio_ausencia_oficial a
      JOIN public.candidatos c ON c.id=a.candidato_id
      WHERE c.slug='laudicerio-aguiar' AND a.ano_eleicao=2026
    ) THEN
      RAISE EXCEPTION 'contrato residual: patrimônio de Laudicério deixou de estar vazio';
    END IF;
  END IF;

  -- @write tabela=patrimonio_ausencia_oficial slug=laudicerio-aguiar ano=2026 campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao
  INSERT INTO public.patrimonio_ausencia_oficial
    (candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao)
  SELECT c.id,2026,'110002553937',
         'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/CENTRO-OESTE/MT/20322002026/110002553937/2026/MT',
         timestamptz '2026-09-06T17:38:21Z',
         'Identidade conferida por SQ_CANDIDATO, nome, cargo, partido e UF; a seção Bens do Candidato informa "Não há bens a declarar".',
         'migration:20260906154500'
  FROM public.candidatos c
  WHERE c.slug='laudicerio-aguiar' AND c.sq_candidato_2026='110002553937'
  ON CONFLICT (candidato_id,ano_eleicao) DO NOTHING;

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND quantidade<>1 THEN
    RAISE EXCEPTION 'contrato residual: ausência de patrimônio esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260906154500 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT '20260906154500','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'status','candidato',
           'sq_candidato_2026','280002553883',
           'fonte_dados',to_jsonb(ARRAY(
             SELECT DISTINCT fonte
             FROM unnest(COALESCE(c.fonte_dados,ARRAY[]::text[]) ||
               ARRAY['TSE consulta_cand 2026; vice da chapa presidencial, snapshot 27/08/2026']) fonte
           )),
           'verificacao_campos',COALESCE(c.verificacao_campos,'{}'::jsonb) || jsonb_build_object(
             'candidate_registration',jsonb_build_object(
               'fonte','TSE consulta_cand 2026; chapa presidencial',
               'estado','publicado',
               'verificado_em','2026-09-06'
             )
           ),
           'ultima_atualizacao','2026-09-06T17:38:21Z'
         ),timestamptz '2026-09-06T17:38:21Z'
  FROM public.candidatos c
  WHERE c.slug='leonardo-avalanche'
  UNION ALL
  SELECT '20260906154500','chapas_2026',ch.id,c.id,to_jsonb(ch),
         to_jsonb(ch) || jsonb_build_object('vice_candidato_id',c.id),
         timestamptz '2026-09-06T17:38:21Z'
  FROM public.chapas_2026 ch
  JOIN public.candidatos c ON c.slug='leonardo-avalanche'
  WHERE ch.chave='2026:BR:pablo-henrique-costa-marcal'
    AND ch.vice_sq_candidato='280002553883'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=leonardo-avalanche campos=status,sq_candidato_2026,fonte_dados,verificacao_campos,ultima_atualizacao
  UPDATE public.candidatos c
  SET status=s.postimage->>'status',
      sq_candidato_2026=s.postimage->>'sq_candidato_2026',
      fonte_dados=ARRAY(SELECT jsonb_array_elements_text(s.postimage->'fonte_dados')),
      verificacao_campos=s.postimage->'verificacao_campos',
      ultima_atualizacao=(s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906154500'
    AND s.tabela='candidatos'
    AND s.row_id=c.id
    AND c.slug='leonardo-avalanche'
    AND to_jsonb(c)=s.preimage;

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND quantidade<>1 THEN
    RAISE EXCEPTION 'contrato residual: candidato Leonardo esperado=1 atual=%', quantidade;
  END IF;

  -- @write tabela=chapas_2026 ref=2026:BR:pablo-henrique-costa-marcal campos=vice_candidato_id
  UPDATE public.chapas_2026 ch
  SET vice_candidato_id=(s.postimage->>'vice_candidato_id')::uuid
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906154500'
    AND s.tabela='chapas_2026'
    AND s.row_id=ch.id
    AND ch.chave='2026:BR:pablo-henrique-costa-marcal'
    AND to_jsonb(ch)=s.preimage;

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND quantidade<>1 THEN
    RAISE EXCEPTION 'contrato residual: vínculo da chapa esperado=1 atual=%', quantidade;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    JOIN public.candidatos c ON c.id=a.candidato_id
    WHERE c.slug='laudicerio-aguiar' AND a.ano_eleicao=2026
      AND a.sq_candidato='110002553937'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.slug='leonardo-avalanche' AND c.status='candidato'
      AND c.sq_candidato_2026='280002553883'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.chapas_2026 ch
    JOIN public.candidatos c ON c.id=ch.vice_candidato_id
    WHERE ch.chave='2026:BR:pablo-henrique-costa-marcal'
      AND c.slug='leonardo-avalanche'
  ) THEN
    RAISE EXCEPTION 'contrato residual: pós-condição falhou';
  END IF;

  -- @write tabela=coleta_log ref=migration:20260906154500 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-2026','candidato','patrimonio',c.id,'vazio_confirmado',0,
         'Seção Bens do Candidato conferida por SQ_CANDIDATO: Não há bens a declarar.',
         'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/CENTRO-OESTE/MT/20322002026/110002553937/2026/MT',
         'migration:20260906154500:laudicerio-aguiar','escrita'
  FROM public.candidatos c WHERE c.slug='laudicerio-aguiar'
  UNION ALL
  SELECT 'tse-consulta-cand-2026','candidato','candidatura',c.id,'encontrado',1,
         'SQ 280002553883 confirmado como vice na chapa presidencial de Pablo Marçal.',
         'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
         'migration:20260906154500:leonardo-avalanche','escrita'
  FROM public.candidatos c WHERE c.slug='leonardo-avalanche';
END
$apply$;

COMMIT;
