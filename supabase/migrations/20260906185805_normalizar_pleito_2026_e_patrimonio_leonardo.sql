-- Fecha o ponto cego em que uma candidatura de 2026 já registrada no TSE
-- conservava a proveniência editorial da antiga pré-candidatura. A âncora de
-- pleitos ignorava essas linhas e, por consequência, ocultava 2026 das séries
-- de patrimônio e financiamento.
--
-- Também publica os sete bens declarados por Leonardo Avalanche no
-- DivulgaCandContas (SQ_CANDIDATO 280002553883), que ficou fora do lote inicial
-- porque o perfil ainda não estava ligado ao registro vigente naquele momento.

BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.historico_politico IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio_ausencia_oficial IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'pleito 2026: coorte ausente no replay; correção ignorada';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' AND
     NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug='leonardo-avalanche') THEN
    RAISE NOTICE 'pleito 2026: alvo ausente no replay; correção ignorada';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' THEN
    SELECT count(*) INTO quantidade
    FROM public.historico_politico h
    JOIN public.candidatos_publico p ON p.id=h.candidato_id
    JOIN public.candidatos c ON c.id=p.id
    WHERE p.status='candidato'
      AND COALESCE(p.cargo_disputado,'Nenhum')<>'Nenhum'
      AND c.sq_candidato_2026 IS NOT NULL
      AND h.periodo_inicio=2026
      AND h.tipo_evento='candidatura'
      AND h.despublicado_em IS NULL
      AND h.proveniencia IS DISTINCT FROM 'tse';
    IF quantidade<>52 THEN
      RAISE EXCEPTION 'pleito 2026: preimage de proveniência esperado=52 atual=%', quantidade;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.patrimonio p
      JOIN public.candidatos c ON c.id=p.candidato_id
      WHERE c.slug='leonardo-avalanche' AND p.ano_eleicao=2026
      UNION ALL
      SELECT 1 FROM public.patrimonio_ausencia_oficial a
      JOIN public.candidatos c ON c.id=a.candidato_id
      WHERE c.slug='leonardo-avalanche' AND a.ano_eleicao=2026
    ) THEN
      RAISE EXCEPTION 'pleito 2026: patrimônio de Leonardo deixou de estar vazio';
    END IF;
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260906185805 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT '20260906185805','historico_politico',h.id,h.candidato_id,to_jsonb(h),
         to_jsonb(h) || jsonb_build_object('proveniencia','tse'),
         timestamptz '2026-09-06T18:46:00Z'
  FROM public.historico_politico h
  JOIN public.candidatos_publico p ON p.id=h.candidato_id
  JOIN public.candidatos c ON c.id=p.id
  WHERE p.status='candidato'
    AND COALESCE(p.cargo_disputado,'Nenhum')<>'Nenhum'
    AND c.sq_candidato_2026 IS NOT NULL
    AND h.periodo_inicio=2026
    AND h.tipo_evento='candidatura'
    AND h.despublicado_em IS NULL
    AND h.proveniencia IS DISTINCT FROM 'tse'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=historico_politico ref=20260906185805 campos=proveniencia
  UPDATE public.historico_politico h
  SET proveniencia=s.postimage->>'proveniencia'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906185805'
    AND s.tabela='historico_politico'
    AND s.row_id=h.id
    AND to_jsonb(h)=s.preimage;

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND quantidade<>52 THEN
    RAISE EXCEPTION 'pleito 2026: históricos atualizados esperado=52 atual=%', quantidade;
  END IF;

  -- @write tabela=patrimonio slug=leonardo-avalanche ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id,ano_eleicao,valor_total,bens,fonte)
  SELECT c.id,2026,495224296.00,
         jsonb_build_array(
           jsonb_build_object('tipo','Outros bens e direitos','descricao','99% das quotas - Avalanche Holding Participação S/A (CNPJ 20.016.543/0001-04)','valor',9900.00),
           jsonb_build_object('tipo','Outros bens e direitos','descricao','Obras de arte','valor',2230000.00),
           jsonb_build_object('tipo','Outros bens e direitos','descricao','100% das quotas - Avalanche Consultoria Participação & Incorporação Ltda. (CNPJ 19.152.972/0001-20)','valor',100000.00),
           jsonb_build_object('tipo','Outros bens e direitos','descricao','Joias','valor',1200000.00),
           jsonb_build_object('tipo','Outros bens e direitos','descricao','100% das quotas - Avalanche Bank Ltda. (CNPJ 35.741.159/0001-41)','valor',500000.00),
           jsonb_build_object('tipo','Outros bens e direitos','descricao','Investimentos em criptomoedas - Bitcoin','valor',491174496.00),
           jsonb_build_object('tipo','Outros bens e direitos','descricao','99% das quotas - L A Holding Patrimonial S/A (CNPJ 20.011.131/0001-81)','valor',9900.00)
         ),
         'TSE DivulgaCandContas 2026, SQ_CANDIDATO 280002553883, total e sete bens conferidos em 06/09/2026 (https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BRASIL/BR/20322002026/280002553883/2026/BR)'
  FROM public.candidatos c
  WHERE c.slug='leonardo-avalanche' AND c.sq_candidato_2026='280002553883'
  ON CONFLICT (candidato_id,ano_eleicao) DO NOTHING;

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND quantidade<>1 THEN
    RAISE EXCEPTION 'pleito 2026: patrimônio de Leonardo esperado=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260906185805 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-consulta-cand-2026','candidato','trajetoria',s.candidato_id,'encontrado',1,
         'Candidatura vigente com SQ_CANDIDATO oficial; proveniência da linha de 2026 normalizada para TSE.',
         'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
         'migration:20260906185805:historico:' || s.row_id::text,'escrita'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906185805' AND s.tabela='historico_politico'
  UNION ALL
  SELECT 'tse-divulgacand-2026','candidato','patrimonio',c.id,'encontrado',7,
         'Sete bens declarados; total oficial R$ 495.224.296,00.',
         'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BRASIL/BR/20322002026/280002553883/2026/BR',
         'migration:20260906185805:leonardo-avalanche','escrita'
  FROM public.candidatos c WHERE c.slug='leonardo-avalanche';

  IF EXISTS (
    SELECT 1
    FROM public.identidade_timeline_quarentena_snapshot s
    JOIN public.historico_politico h ON h.id=s.row_id
    WHERE s.migration_version='20260906185805'
      AND s.tabela='historico_politico'
      AND h.proveniencia IS DISTINCT FROM 'tse'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    JOIN public.candidatos c ON c.id=p.candidato_id
    WHERE c.slug='leonardo-avalanche' AND p.ano_eleicao=2026
      AND p.valor_total=495224296.00
      AND jsonb_array_length(p.bens)=7
  ) THEN
    RAISE EXCEPTION 'pleito 2026: pós-condição falhou';
  END IF;
END
$apply$;

COMMIT;
