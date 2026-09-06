-- Fecha as lacunas acionáveis remanescentes da auditoria pública de 06/09/2026.
-- O recorte combina duas correções independentes e verificadas na fonte:
--
-- 1. Quatro pleitos de homônimos estavam publicados nas fichas erradas. As
--    linhas são despublicadas, nunca apagadas, e a pré/pós-imagem integral fica
--    em identidade_timeline_quarentena_snapshot para rollback fiel.
-- 2. O DivulgaCand oficial publica bens=true, bens=[] e totalDeBens=0 para
--    quatro candidaturas exatas que o ZIP bem_candidato não contém. Essas
--    respostas oficiais sustentam vazio_confirmado sem inventar patrimônio.
--
-- Fontes oficiais consultadas em 2026-09-06:
-- - Izadora Dias 2020, SQ 250001263474, Barra Bonita/SP
-- - Policial Edjane 2020, SQ 250000881915, São Paulo/SP
-- - Mailza Assis 2014, SQ 10000000002, AC
-- - Robson Raymundo 2014, SQ 70000000161, DF
-- As URLs integrais são persistidas em patrimonio_ausencia_oficial.

BEGIN;

DO $precondition$
DECLARE
  quantidade integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug IN ('jeronimo','dr-daniel','joao-campos','izadora-dias','policial-edjane','mailza-assis','robson-raymundo')
  ) THEN
    RAISE NOTICE 'completude residual: fichas ausentes no replay; correção ignorada';
    RETURN;
  END IF;

  SELECT count(*) INTO quantidade
  FROM public.candidatos c
  JOIN (VALUES
    ('dr-daniel','dcc4a93e-4114-43e9-b067-4581ed12cfd5'::uuid,'Daniel Barbosa Santos','PA'),
    ('izadora-dias','20e8b8cd-54a6-4e85-89c2-386ef12d2cc8'::uuid,'Izadora Cristina Dias da Silva','SP'),
    ('jeronimo','db711ee0-fcfa-47f7-85d2-a3686956cf06'::uuid,'Jerônimo Rodrigues Souza','BA'),
    ('joao-campos','cc2dbc88-aae0-4c75-a112-bcc6bfc3189b'::uuid,'Joao Henrique de Andrade Lima Campos','PE'),
    ('mailza-assis','4e3828f3-33c9-4206-9aff-7b869a466baa'::uuid,'Mailza Assis Cameli','AC'),
    ('policial-edjane','851a0be1-4c2b-4d95-b483-4c67a51860d8'::uuid,'EDJANE LIMA DE SOUSA','SP'),
    ('robson-raymundo','4164ed87-4b75-4f33-9edb-8f12c38086e5'::uuid,'Robson Raymundo da Silva','DF')
  ) AS esperado(slug,id,nome,uf)
    ON c.slug=esperado.slug AND c.id=esperado.id
   AND c.nome_completo=esperado.nome AND c.estado=esperado.uf
  WHERE c.publicavel IS TRUE;
  IF quantidade <> 7 THEN
    IF current_setting('pf.replay', true)='true' THEN
      RAISE NOTICE 'completude residual: coorte parcial no replay (% de 7); correção ignorada', quantidade;
      RETURN;
    END IF;
    RAISE EXCEPTION 'completude residual: identidade/publicação das sete fichas divergiu, válidas=%', quantidade;
  END IF;

  SELECT count(*) INTO quantidade
  FROM public.historico_politico h
  WHERE h.despublicado_em IS NULL AND (
    (h.id='2b33e15d-6b33-436e-99a5-226c67c060ec' AND h.candidato_id='db711ee0-fcfa-47f7-85d2-a3686956cf06' AND h.periodo_inicio=2012 AND h.cargo='Vice-Prefeito' AND h.estado='BA') OR
    (h.id='9c6854c4-089a-44bf-a09d-ae48feb96255' AND h.candidato_id='dcc4a93e-4114-43e9-b067-4581ed12cfd5' AND h.periodo_inicio=2022 AND h.cargo='Deputado Estadual' AND h.estado='BA') OR
    (h.id='5a716ae8-8a1b-45ab-a81c-f868715e3c75' AND h.candidato_id='cc2dbc88-aae0-4c75-a112-bcc6bfc3189b' AND h.periodo_inicio=2006 AND h.cargo='Deputado Federal' AND h.estado='GO') OR
    (h.id='de255556-c398-4c53-a6a3-7939e5b3e187' AND h.candidato_id='cc2dbc88-aae0-4c75-a112-bcc6bfc3189b' AND h.periodo_inicio=2022 AND h.cargo='Senador' AND h.estado='GO')
  );
  IF quantidade <> 4 THEN RAISE EXCEPTION 'completude residual: histórico homônimo divergiu, válidas=%', quantidade; END IF;

  SELECT count(*) INTO quantidade
  FROM public.mudancas_partido m
  WHERE m.despublicado_em IS NULL AND m.id IN (
    '510ffa5a-6ec6-42bd-b428-88b096cc6d77','d1a236de-7683-4c43-ace6-116b6582c46a','734a1523-5331-4523-b1fd-4b550f92f3cf'
  );
  IF quantidade <> 3 THEN RAISE EXCEPTION 'completude residual: mudanças partidárias homônimas divergiram, válidas=%', quantidade; END IF;

  SELECT count(*) INTO quantidade
  FROM public.financiamento f
  WHERE f.despublicado_em IS NULL AND (
    (f.id='b789aa06-bd9e-4b42-8e25-5aafab3835d0' AND f.candidato_id='db711ee0-fcfa-47f7-85d2-a3686956cf06' AND f.ano_eleicao=2012 AND f.total_arrecadado=19569.79) OR
    (f.id='72ca421b-3446-4749-a867-3bf348a9debf' AND f.candidato_id='dcc4a93e-4114-43e9-b067-4581ed12cfd5' AND f.ano_eleicao=2022 AND f.total_arrecadado=15237.06) OR
    (f.id='aa19bdf1-4361-4fe5-86b2-b2e64d2ab513' AND f.candidato_id='cc2dbc88-aae0-4c75-a112-bcc6bfc3189b' AND f.ano_eleicao=2006 AND f.total_arrecadado=417340.00) OR
    (f.id='5480105f-901a-48db-9f1d-d3065ae72255' AND f.candidato_id='cc2dbc88-aae0-4c75-a112-bcc6bfc3189b' AND f.ano_eleicao=2022 AND f.total_arrecadado=1901742.28)
  );
  IF quantidade <> 4 THEN RAISE EXCEPTION 'completude residual: financiamento homônimo divergiu, válidas=%', quantidade; END IF;

  SELECT count(*) INTO quantidade
  FROM public.patrimonio_ausencia_oficial a
  WHERE (a.candidato_id,a.ano_eleicao) IN (
    ('20e8b8cd-54a6-4e85-89c2-386ef12d2cc8'::uuid,2020),
    ('851a0be1-4c2b-4d95-b483-4c67a51860d8'::uuid,2020),
    ('4e3828f3-33c9-4206-9aff-7b869a466baa'::uuid,2014),
    ('4164ed87-4b75-4f33-9edb-8f12c38086e5'::uuid,2014)
  );
  IF quantidade <> 0 THEN RAISE EXCEPTION 'completude residual: ausência oficial já existe, linhas=%', quantidade; END IF;
END
$precondition$;

-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260906065729 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260906065729','historico_politico',h.id,h.candidato_id,to_jsonb(h),
       to_jsonb(h)||jsonb_build_object('despublicado_em','2026-09-06T06:58:40+00:00','despublicacao_motivo','completude-residual-20260906: candidatura pertence a homônimo; identidade oficial incompatível com a ficha.'),
       timestamptz '2026-09-06 06:58:40+00'
FROM public.historico_politico h
WHERE h.id IN ('2b33e15d-6b33-436e-99a5-226c67c060ec','9c6854c4-089a-44bf-a09d-ae48feb96255','5a716ae8-8a1b-45ab-a81c-f868715e3c75','de255556-c398-4c53-a6a3-7939e5b3e187');

-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260906065729 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260906065729','mudancas_partido',m.id,m.candidato_id,to_jsonb(m),
       to_jsonb(m)||jsonb_build_object('despublicado_em','2026-09-06T06:58:40+00:00','despublicacao_motivo','completude-residual-20260906: mudança derivada de candidatura de homônimo.'),
       timestamptz '2026-09-06 06:58:40+00'
FROM public.mudancas_partido m
WHERE m.id IN ('510ffa5a-6ec6-42bd-b428-88b096cc6d77','d1a236de-7683-4c43-ace6-116b6582c46a','734a1523-5331-4523-b1fd-4b550f92f3cf');

-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260906065729 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260906065729','financiamento',f.id,f.candidato_id,to_jsonb(f),
       to_jsonb(f)||jsonb_build_object('despublicado_em','2026-09-06T06:58:40+00:00','despublicacao_motivo','completude-residual-20260906: financiamento pertence a candidatura de homônimo.'),
       timestamptz '2026-09-06 06:58:40+00'
FROM public.financiamento f
WHERE f.id IN ('b789aa06-bd9e-4b42-8e25-5aafab3835d0','72ca421b-3446-4749-a867-3bf348a9debf','aa19bdf1-4361-4fe5-86b2-b2e64d2ab513','5480105f-901a-48db-9f1d-d3065ae72255');

-- @write tabela=historico_politico slug=jeronimo campos=despublicado_em,despublicacao_motivo
-- @write tabela=historico_politico slug=dr-daniel campos=despublicado_em,despublicacao_motivo
-- @write tabela=historico_politico slug=joao-campos campos=despublicado_em,despublicacao_motivo
UPDATE public.historico_politico h
SET despublicado_em=(s.postimage->>'despublicado_em')::timestamptz,
    despublicacao_motivo=s.postimage->>'despublicacao_motivo'
FROM public.identidade_timeline_quarentena_snapshot s
WHERE s.migration_version='20260906065729' AND s.tabela='historico_politico'
  AND s.row_id=h.id AND to_jsonb(h)=s.preimage
  AND EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.id=h.candidato_id AND c.slug IN ('jeronimo','dr-daniel','joao-campos')
  );

-- @write tabela=mudancas_partido slug=jeronimo campos=despublicado_em,despublicacao_motivo
-- @write tabela=mudancas_partido slug=joao-campos campos=despublicado_em,despublicacao_motivo
UPDATE public.mudancas_partido m
SET despublicado_em=(s.postimage->>'despublicado_em')::timestamptz,
    despublicacao_motivo=s.postimage->>'despublicacao_motivo'
FROM public.identidade_timeline_quarentena_snapshot s
WHERE s.migration_version='20260906065729' AND s.tabela='mudancas_partido'
  AND s.row_id=m.id AND to_jsonb(m)=s.preimage
  AND EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.id=m.candidato_id AND c.slug IN ('jeronimo','joao-campos')
  );

-- @write tabela=financiamento slug=jeronimo campos=despublicado_em,despublicacao_motivo
-- @write tabela=financiamento slug=dr-daniel campos=despublicado_em,despublicacao_motivo
-- @write tabela=financiamento slug=joao-campos campos=despublicado_em,despublicacao_motivo
UPDATE public.financiamento f
SET despublicado_em=(s.postimage->>'despublicado_em')::timestamptz,
    despublicacao_motivo=s.postimage->>'despublicacao_motivo'
FROM public.identidade_timeline_quarentena_snapshot s
WHERE s.migration_version='20260906065729' AND s.tabela='financiamento'
  AND s.row_id=f.id AND to_jsonb(f)=s.preimage
  AND EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.id=f.candidato_id AND c.slug IN ('jeronimo','dr-daniel','joao-campos')
  );

-- @write tabela=patrimonio_ausencia_oficial slug=izadora-dias campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao
-- @write tabela=patrimonio_ausencia_oficial slug=policial-edjane campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao
-- @write tabela=patrimonio_ausencia_oficial slug=mailza-assis campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao
-- @write tabela=patrimonio_ausencia_oficial slug=robson-raymundo campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao
INSERT INTO public.patrimonio_ausencia_oficial
  (candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao)
SELECT v.candidato_id,v.ano_eleicao,v.sq_candidato,v.fonte_url,
       timestamptz '2026-09-06 06:58:40+00',v.detalhe,'migration:20260906065729'
FROM (VALUES
  ('20e8b8cd-54a6-4e85-89c2-386ef12d2cc8'::uuid,'izadora-dias',2020,'250001263474','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2020/62057/2030402020/candidato/250001263474','Identidade oficial exata; DivulgaCand publica st_DIVULGA_BENS=true, bens=[] e totalDeBens=0.'),
  ('851a0be1-4c2b-4d95-b483-4c67a51860d8'::uuid,'policial-edjane',2020,'250000881915','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2020/71072/2030402020/candidato/250000881915','Identidade confirmada pelo mesmo CPF e data de nascimento nos registros oficiais de 2020 e 2022; DivulgaCand publica st_DIVULGA_BENS=true, bens=[] e totalDeBens=0.'),
  ('4e3828f3-33c9-4206-9aff-7b869a466baa'::uuid,'mailza-assis',2014,'10000000002','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2014/AC/680/candidato/10000000002','Identidade oficial exata; DivulgaCand publica st_DIVULGA_BENS=true, bens=[] e totalDeBens=0.'),
  ('4164ed87-4b75-4f33-9edb-8f12c38086e5'::uuid,'robson-raymundo',2014,'70000000161','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2014/DF/680/candidato/70000000161','Identidade oficial exata; DivulgaCand publica st_DIVULGA_BENS=true, bens=[] e totalDeBens=0.')
) v(candidato_id,slug,ano_eleicao,sq_candidato,fonte_url,detalhe)
JOIN public.candidatos c ON c.id=v.candidato_id AND c.slug=v.slug;

-- @write tabela=coleta_log ref=migration:20260906065729:homonimos campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log(fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
SELECT 'tse-identidade-homonima','global','historico_politico+mudancas_partido+financiamento.despublicado_em',
       'encontrado',count(*)::integer,'Pré/pós-imagem integral preservada em identidade_timeline_quarentena_snapshot.',
       'https://dadosabertos.tse.jus.br/group/candidatos','migration:20260906065729:homonimos','escrita'
FROM public.identidade_timeline_quarentena_snapshot
WHERE migration_version='20260906065729'
HAVING count(*)>0;

-- @write tabela=coleta_log ref=migration:20260906065729: campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log(fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
SELECT 'tse-divulgacand-zero-bens','candidato','patrimonio_ausencia_oficial',a.candidato_id,
       'vazio_confirmado',0,a.detalhe,a.fonte_url,'migration:20260906065729:'||c.slug,'escrita'
FROM public.patrimonio_ausencia_oficial a
JOIN public.candidatos c ON c.id=a.candidato_id
WHERE a.execucao='migration:20260906065729';

DO $postcondition$
DECLARE quantidade integer;
BEGIN
  SELECT count(*) INTO quantidade
  FROM public.candidatos
  WHERE id IN (
    'dcc4a93e-4114-43e9-b067-4581ed12cfd5','20e8b8cd-54a6-4e85-89c2-386ef12d2cc8',
    'db711ee0-fcfa-47f7-85d2-a3686956cf06','cc2dbc88-aae0-4c75-a112-bcc6bfc3189b',
    '4e3828f3-33c9-4206-9aff-7b869a466baa','851a0be1-4c2b-4d95-b483-4c67a51860d8',
    '4164ed87-4b75-4f33-9edb-8f12c38086e5'
  );
  IF quantidade<>7 AND current_setting('pf.replay', true)='true' THEN RETURN; END IF;
  IF quantidade<>7 THEN RAISE EXCEPTION 'completude residual: coorte sumiu antes da pós-condição'; END IF;

  SELECT count(*) INTO quantidade FROM public.identidade_timeline_quarentena_snapshot
  WHERE migration_version='20260906065729';
  IF quantidade<>11 THEN RAISE EXCEPTION 'completude residual: snapshot esperado=11 atual=%',quantidade; END IF;

  SELECT count(*) INTO quantidade FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906065729' AND NOT (
    CASE s.tabela
      WHEN 'historico_politico' THEN EXISTS(SELECT 1 FROM public.historico_politico t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
      WHEN 'mudancas_partido' THEN EXISTS(SELECT 1 FROM public.mudancas_partido t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
      WHEN 'financiamento' THEN EXISTS(SELECT 1 FROM public.financiamento t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
      ELSE false
    END
  );
  IF quantidade<>0 THEN RAISE EXCEPTION 'completude residual: postimage divergente em % linha(s)',quantidade; END IF;

  SELECT count(*) INTO quantidade FROM public.patrimonio_ausencia_oficial
  WHERE execucao='migration:20260906065729' AND fonte_url LIKE 'https://divulgacandcontas.tse.jus.br/%';
  IF quantidade<>4 THEN RAISE EXCEPTION 'completude residual: ausências esperadas=4 atuais=%',quantidade; END IF;

  SELECT count(*) INTO quantidade FROM public.coleta_log
  WHERE execucao LIKE 'migration:20260906065729:%';
  IF quantidade<>5 THEN RAISE EXCEPTION 'completude residual: recibos esperados=5 atuais=%',quantidade; END IF;
END
$postcondition$;

COMMIT;
