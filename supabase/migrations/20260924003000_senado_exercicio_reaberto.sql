-- Issue #470. Dez senadores da coorte 2026 se afastaram no meio do mandato
-- 2019-2027 e voltaram ao exercicio, mas historico_politico so tem a linha do
-- primeiro intervalo de exercicio. A ficha mostra o mandato encerrado no ano do
-- afastamento. Esta migration insere, para cada um, a linha do intervalo em
-- aberto, igual a que ingestMandatos (scripts/lib/ingest-senado.ts) grava
-- quando le o mesmo payload: cargo Senador, tipo_evento mandato, proveniencia
-- senado, periodo_fim NULL, partido vazio (o endpoint de exercicios nao traz
-- sigla), eleito_por 'voto direto' (DescricaoParticipacao Titular).
-- Fonte primaria, lida em 2026-09-23 (SHA256 do JSON em cada linha abaixo):
--   https://legis.senado.leg.br/dadosabertos/senador/{codigo}/mandatos.json
--   Exercicios.Exercicio do mandato indicado: o exercicio anterior termina em
--   DataFim com SiglaCausaAfastamento, e o exercicio aberto tem DataInicio sem
--   DataFim.
-- A linha do primeiro intervalo fica como esta: e a mesma que o importador grava.
-- historico_politico nao tem trigger que alimente candidate_changes (so
-- sanitize_public_document_fields), entao nenhum alerta sai deste INSERT.
-- Aplicacao em producao exige autorizacao separada e ledger/readback.
BEGIN;
CREATE TEMP TABLE senado_exercicio_reaberto_470 (
  slug text PRIMARY KEY,
  candidato_id uuid NOT NULL,
  sq_candidato_2026 text NOT NULL,
  uf text NOT NULL,
  senado_codigo text NOT NULL,
  codigo_mandato text NOT NULL,
  anterior_id uuid NOT NULL,
  anterior_inicio integer NOT NULL,
  anterior_fim integer NOT NULL,
  linhas_senado integer NOT NULL,
  novo_id uuid NOT NULL,
  novo_inicio integer NOT NULL,
  exercicio_aberto text NOT NULL,
  exercicio_aberto_inicio date NOT NULL,
  exercicio_anterior text NOT NULL,
  exercicio_anterior_fim date NOT NULL,
  exercicio_anterior_causa text NOT NULL,
  mandatos_sha256 text NOT NULL
) ON COMMIT DROP;
INSERT INTO senado_exercicio_reaberto_470 VALUES
  ('tse-2026-100002537338','63776260-c37b-4112-8eca-eb338e88abf5','100002537338','MA','5411','529','e0f072e8-2c69-40d3-8754-7c1c97092b91',2019,2022,1,'2b6b20ad-1061-4d07-888f-1dfd22b2e79e',2022,'2995',date '2022-11-04','2940',date '2022-07-06','LCS','a040fa60f17a196f32574b34fed613c10aa272849eac43592bcc6a65faaefd7f'),
  ('tse-2026-100002541459','b8e8b3d1-1e2e-482f-b0dd-dbf927c5c681','100002541459','MA','5718','542','a9fed6c6-7402-42fd-81b8-44b1b62ff246',2019,2024,1,'568f79ec-11ea-41db-b467-407c4a40e4fe',2024,'3069',date '2024-10-17','2900',date '2024-07-16','AFO','c01a5b4c4f8328bf125ca4aea7b3c82b2e0a194a65163bd3a019f2a861c34ed3'),
  ('tse-2026-10002535804','13814e66-c5d3-4dbc-94cb-4e5b7e38bfc4','10002535804','AC','4560','520','59c27149-9d84-491a-a810-4d03ac9f0418',2019,2022,2,'7b9e9ecc-0267-44a2-bfb6-6077d313f710',2022,'2997',date '2022-11-04','2935',date '2022-07-06','LCS','230aedc60e12840912b20dbcedae333cbf6ca94006bb763cbb1777cc4d2f1710'),
  ('tse-2026-10002548050','84869313-07bc-4cf9-affb-87e0e65ce97f','10002548050','AC','285','536','14dc2eaa-b08b-4a02-9ae3-c30ffaf8a9db',2019,2022,1,'09c10035-fa5a-4924-a1c5-9bd19f02265c',2022,'2994',date '2022-10-15','2924',date '2022-05-31','LCS','bb00b37dce39e90831bafe82d7257b6e19fa53deab41eb65871c183010bd1d9c'),
  ('tse-2026-130002545590','6e07376d-ea69-4d9d-b850-a073ac17e764','130002545590','MG','5990','563','145d429b-6a6f-487b-b92a-ba6062381ee4',2019,2024,1,'aad8d422-814a-4fa4-b702-5a0f3771942f',2024,'3073',date '2024-11-16','2892',date '2024-07-17','LCS','a6462091afc522702fd637798c1dba699f2e718e2165f8aa0cea2196428bf0c8'),
  ('tse-2026-150002544905','54d10672-5b58-4382-a64e-a13fdb320f5f','150002544905','PB','5748','564','55f20f2b-284e-443c-932f-05a1e3f5c954',2019,2020,1,'b8cb5725-8edc-4ddf-8ba3-b9b02c74f395',2021,'2963',date '2021-01-22','2939',date '2020-09-23','LP','ab51eb35289f8498b36b685a7a1857b96058e0ae3c1f71fd647d5d609807b712'),
  ('tse-2026-180002540446','bd861326-b9f3-4a6f-a255-fc770ed2b78b','180002540446','PI','739','524','68e8b267-4d07-4a36-9003-fccffc588b8e',2019,2021,2,'edd4abf4-a997-43be-a1c3-e162ae057e4e',2022,'3004',date '2022-12-30','2896',date '2021-07-27','AFO','f0800941d1a683750c29d727ead090e825f43ea4bac9c29a4064baa89f0126f3'),
  ('tse-2026-230002550794','94de7156-47d5-4158-9710-e44ad4c27910','230002550794','RR','470','577','1a58e138-d673-443f-bdab-c950508b65c9',2019,2020,1,'10ad39ff-e133-4eee-8a50-9687e5fc4443',2021,'2965',date '2021-02-18','2905',date '2020-10-20','LP','4f75e41c20b81eee26aac881ee84ac1b077a410517ac610f71c5dbcdc2acb9e2'),
  ('tse-2026-30002530069','bdcf63e1-ee6c-4d02-8aef-9938b9dbdde5','30002530069','AP','5926','543','bac83c09-ff82-4485-9a01-7c8b1937751d',2019,2019,1,'eee1bd01-830f-4c79-a7a1-8cc62e7d1074',2020,'2955',date '2020-04-20','2921',date '2019-12-16','LS','fa4ca4a3d26b65bb66fdc2e006138ba2660a6acacd98b00d755f74bf9ecdfaa3'),
  ('tse-2026-90002543215','b106cbcf-101f-41a8-8fb5-7b2d86e1a683','90002543215','GO','5899','538','a3a26ee1-0795-4a29-8dfe-6b136ab24bb2',2019,2025,1,'28320249-4c63-4906-9984-7ea3f0537db3',2025,'3091',date '2025-10-30','2938',date '2025-07-01','LCS','d8906178751faf53a0fbeef07a6274a4dc946732f54442a7334d939061123d3a');
DO $apply$
DECLARE
  receipt text := 'migration:20260924003000';
  locked integer;
  affected integer;
BEGIN
  IF current_setting('pf.replay', true) = 'true' OR NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'senado exercicio reaberto: replay descartavel ou coorte vazia';
    RETURN;
  END IF;

  SELECT count(*) INTO locked FROM (
    SELECT c.id
    FROM public.candidatos c
    JOIN senado_exercicio_reaberto_470 t
      ON t.candidato_id = c.id AND t.slug = c.slug
     AND t.sq_candidato_2026 = c.sq_candidato_2026 AND t.uf = c.estado
    WHERE c.cargo_disputado = 'Senador'
      AND c.publicavel IS TRUE
      AND c.status <> 'removido'
    FOR UPDATE OF c
  ) l;
  IF locked <> 10
    OR (SELECT count(*) FROM senado_exercicio_reaberto_470) <> 10
    -- Preimagem exata da linha do primeiro intervalo.
    OR (SELECT count(*) FROM public.historico_politico h
        JOIN senado_exercicio_reaberto_470 t ON t.anterior_id = h.id
        WHERE h.candidato_id = t.candidato_id AND h.cargo = 'Senador'
          AND h.periodo_inicio = t.anterior_inicio AND h.periodo_fim = t.anterior_fim
          AND h.partido = '' AND h.estado = t.uf AND h.eleito_por = 'voto direto'
          AND h.tipo_evento = 'mandato' AND h.proveniencia = 'senado'
          AND h.cargo_canonico IS NULL AND h.observacoes IS NULL
          AND h.despublicado_em IS NULL) <> 10
    -- Nenhuma outra linha do Senado alem das esperadas.
    OR EXISTS (SELECT 1 FROM senado_exercicio_reaberto_470 t
               WHERE (SELECT count(*) FROM public.historico_politico h
                      WHERE h.candidato_id = t.candidato_id AND h.cargo = 'Senador'
                        AND h.proveniencia = 'senado') <> t.linhas_senado)
    -- O ano do exercicio aberto esta livre (indice unico candidato, cargo, inicio).
    OR EXISTS (SELECT 1 FROM public.historico_politico h
               JOIN senado_exercicio_reaberto_470 t ON t.candidato_id = h.candidato_id
               WHERE h.cargo = 'Senador' AND h.periodo_inicio = t.novo_inicio)
    OR EXISTS (SELECT 1 FROM public.historico_politico h
               JOIN senado_exercicio_reaberto_470 t ON t.novo_id = h.id)
    OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = receipt)
    OR EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
               WHERE migration_version = '20260924003000') THEN
    RAISE EXCEPTION 'senado exercicio reaberto: preimagem/identidade ou recibo divergiu';
  END IF;

  -- Weverton: exercicio 2940 ate 2022-07-06 (LCS); 2995 desde 2022-11-04.
  -- https://legis.senado.leg.br/dadosabertos/senador/5411/mandatos.json
  -- @write tabela=historico_politico slug=tse-2026-100002537338 campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia
  INSERT INTO public.historico_politico
    (id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia)
  SELECT t.novo_id,t.candidato_id,'Senador',t.novo_inicio,NULL,'',t.uf,'voto direto','mandato','senado'
  FROM senado_exercicio_reaberto_470 t WHERE t.slug = 'tse-2026-100002537338';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto: INSERT 5411 afetou % linhas', affected; END IF;

  -- Eliziane Gama: exercicio 2900 ate 2024-07-16 (AFO); 3069 desde 2024-10-17.
  -- https://legis.senado.leg.br/dadosabertos/senador/5718/mandatos.json
  -- @write tabela=historico_politico slug=tse-2026-100002541459 campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia
  INSERT INTO public.historico_politico
    (id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia)
  SELECT t.novo_id,t.candidato_id,'Senador',t.novo_inicio,NULL,'',t.uf,'voto direto','mandato','senado'
  FROM senado_exercicio_reaberto_470 t WHERE t.slug = 'tse-2026-100002541459';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto: INSERT 5718 afetou % linhas', affected; END IF;

  -- Sergio Petecao: exercicio 2935 ate 2022-07-06 (LCS); 2997 desde 2022-11-04.
  -- https://legis.senado.leg.br/dadosabertos/senador/4560/mandatos.json
  -- @write tabela=historico_politico slug=tse-2026-10002535804 campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia
  INSERT INTO public.historico_politico
    (id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia)
  SELECT t.novo_id,t.candidato_id,'Senador',t.novo_inicio,NULL,'',t.uf,'voto direto','mandato','senado'
  FROM senado_exercicio_reaberto_470 t WHERE t.slug = 'tse-2026-10002535804';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto: INSERT 4560 afetou % linhas', affected; END IF;

  -- Marcio Bittar: exercicio 2924 ate 2022-05-31 (LCS); 2994 desde 2022-10-15.
  -- https://legis.senado.leg.br/dadosabertos/senador/285/mandatos.json
  -- @write tabela=historico_politico slug=tse-2026-10002548050 campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia
  INSERT INTO public.historico_politico
    (id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia)
  SELECT t.novo_id,t.candidato_id,'Senador',t.novo_inicio,NULL,'',t.uf,'voto direto','mandato','senado'
  FROM senado_exercicio_reaberto_470 t WHERE t.slug = 'tse-2026-10002548050';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto: INSERT 285 afetou % linhas', affected; END IF;

  -- Carlos Viana: exercicio 2892 ate 2024-07-17 (LCS); 3073 desde 2024-11-16.
  -- https://legis.senado.leg.br/dadosabertos/senador/5990/mandatos.json
  -- @write tabela=historico_politico slug=tse-2026-130002545590 campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia
  INSERT INTO public.historico_politico
    (id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia)
  SELECT t.novo_id,t.candidato_id,'Senador',t.novo_inicio,NULL,'',t.uf,'voto direto','mandato','senado'
  FROM senado_exercicio_reaberto_470 t WHERE t.slug = 'tse-2026-130002545590';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto: INSERT 5990 afetou % linhas', affected; END IF;

  -- Veneziano Vital do Rego: exercicio 2939 ate 2020-09-23 (LP); 2963 desde 2021-01-22.
  -- https://legis.senado.leg.br/dadosabertos/senador/5748/mandatos.json
  -- @write tabela=historico_politico slug=tse-2026-150002544905 campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia
  INSERT INTO public.historico_politico
    (id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia)
  SELECT t.novo_id,t.candidato_id,'Senador',t.novo_inicio,NULL,'',t.uf,'voto direto','mandato','senado'
  FROM senado_exercicio_reaberto_470 t WHERE t.slug = 'tse-2026-150002544905';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto: INSERT 5748 afetou % linhas', affected; END IF;

  -- Ciro Nogueira: exercicio 2896 ate 2021-07-27 (AFO); 3004 desde 2022-12-30.
  -- https://legis.senado.leg.br/dadosabertos/senador/739/mandatos.json
  -- @write tabela=historico_politico slug=tse-2026-180002540446 campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia
  INSERT INTO public.historico_politico
    (id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia)
  SELECT t.novo_id,t.candidato_id,'Senador',t.novo_inicio,NULL,'',t.uf,'voto direto','mandato','senado'
  FROM senado_exercicio_reaberto_470 t WHERE t.slug = 'tse-2026-180002540446';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto: INSERT 739 afetou % linhas', affected; END IF;

  -- Chico Rodrigues: exercicio 2905 ate 2020-10-20 (LP); 2965 desde 2021-02-18.
  -- https://legis.senado.leg.br/dadosabertos/senador/470/mandatos.json
  -- @write tabela=historico_politico slug=tse-2026-230002550794 campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia
  INSERT INTO public.historico_politico
    (id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia)
  SELECT t.novo_id,t.candidato_id,'Senador',t.novo_inicio,NULL,'',t.uf,'voto direto','mandato','senado'
  FROM senado_exercicio_reaberto_470 t WHERE t.slug = 'tse-2026-230002550794';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto: INSERT 470 afetou % linhas', affected; END IF;

  -- Lucas Barreto: exercicio 2921 ate 2019-12-16 (LS); 2955 desde 2020-04-20.
  -- https://legis.senado.leg.br/dadosabertos/senador/5926/mandatos.json
  -- @write tabela=historico_politico slug=tse-2026-30002530069 campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia
  INSERT INTO public.historico_politico
    (id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia)
  SELECT t.novo_id,t.candidato_id,'Senador',t.novo_inicio,NULL,'',t.uf,'voto direto','mandato','senado'
  FROM senado_exercicio_reaberto_470 t WHERE t.slug = 'tse-2026-30002530069';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto: INSERT 5926 afetou % linhas', affected; END IF;

  -- Vanderlan Cardoso: exercicio 2938 ate 2025-07-01 (LCS); 3091 desde 2025-10-30.
  -- https://legis.senado.leg.br/dadosabertos/senador/5899/mandatos.json
  -- @write tabela=historico_politico slug=tse-2026-90002543215 campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia
  INSERT INTO public.historico_politico
    (id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,tipo_evento,proveniencia)
  SELECT t.novo_id,t.candidato_id,'Senador',t.novo_inicio,NULL,'',t.uf,'voto direto','mandato','senado'
  FROM senado_exercicio_reaberto_470 t WHERE t.slug = 'tse-2026-90002543215';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'senado exercicio reaberto: INSERT 5899 afetou % linhas', affected; END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260924003000 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT '20260924003000','historico_politico',h.id,h.candidato_id,'{}'::jsonb,to_jsonb(h),now()
  FROM public.historico_politico h
  JOIN senado_exercicio_reaberto_470 t ON t.novo_id = h.id AND t.candidato_id = h.candidato_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 10 THEN RAISE EXCEPTION 'senado exercicio reaberto: snapshot afetou % linhas', affected; END IF;

  -- @write tabela=coleta_log ref=migration:20260924003000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'senado','candidato',t.slug,t.candidato_id,'encontrado',1,
         jsonb_build_object(
           'issue',470,
           'before',jsonb_build_object('linha_anterior',(SELECT to_jsonb(a) FROM public.historico_politico a WHERE a.id = t.anterior_id),
                                       'linha_no_ano_do_exercicio_aberto',NULL),
           'after',(SELECT to_jsonb(h) FROM public.historico_politico h WHERE h.id = t.novo_id),
           'senado_codigo_parlamentar',t.senado_codigo,
           'senado_codigo_mandato',t.codigo_mandato,
           'senado_mandatos_sha256',t.mandatos_sha256,
           'exercicio_anterior',jsonb_build_object('codigo',t.exercicio_anterior,'data_fim',t.exercicio_anterior_fim,'sigla_causa_afastamento',t.exercicio_anterior_causa),
           'exercicio_aberto',jsonb_build_object('codigo',t.exercicio_aberto,'data_inicio',t.exercicio_aberto_inicio))::text,
         'https://legis.senado.leg.br/dadosabertos/senador/' || t.senado_codigo || '/mandatos.json',
         'migration:20260924003000','escrita'
  FROM senado_exercicio_reaberto_470 t;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 10 THEN RAISE EXCEPTION 'senado exercicio reaberto: recibo afetou % linhas', affected; END IF;
END
$apply$;
COMMIT;
