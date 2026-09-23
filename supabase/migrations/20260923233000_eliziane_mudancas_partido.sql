-- Trajetoria partidaria de Eliziane Gama (SQ_CANDIDATO 2026 100002541459,
-- MA/Senador, numero 133). A ficha mostra PT desde a 20260923175946, mas
-- mudancas_partido nao tem nenhuma linha para ela.
-- Fontes primarias lidas em 2026-09-23:
--   Senado Federal, filiacoes do parlamentar 5718:
--     https://legis.senado.leg.br/dadosabertos/senador/5718/filiacoes
--     (JSON SHA256 19dac162d11871d8d09310fd66f777c9f54f327464454de6ab4e3d80c83c1342)
--     CIDADANIA 2015-02-01..2015-10-04; REDE 2015-10-05..2016-04-03;
--     CIDADANIA 2016-04-04..2023-01-30; PSD desde 2023-01-31, sem desfiliacao.
--   Camara dos Deputados, historico do deputado 178883:
--     https://dadosabertos.camara.leg.br/api/v2/deputados/178883/historico
--     (JSON SHA256 65e16fe1ec79c38f163a8a3fa69db711261a972ba4f3a8437c7a9824cdcfe3bd)
--     PPS em 2015-02-01; REDE em 2015-10-05; PPS em 2016-04-04.
--   TSE, renomeacao do PPS para Cidadania aprovada em 19/09/2019:
--     https://www.tse.jus.br/comunicacao/noticias/2019/Setembro/plenario-aprova-mudanca-do-nome-do-pps-para-cidadania
--     A renomeacao nao vira linha: o site ja trata PPS e CIDADANIA como a mesma
--     legenda e exibe o nome vigente em cada ano; nao houve nova filiacao.
--   TSE consulta_cand_2026 (SHA256 dda125bc...1a6c, ver 20260923175946): PT.
-- A data da troca PSD -> PT nao consta das fontes oficiais consultadas; a
-- linha usa ano 2026 e data_mudanca NULL, como as demais mudancas observadas
-- entre eleicoes do TSE. A filiacao original ao PPS (anterior a 2006) nao tem
-- data verificada e fica de fora.
-- Cada INSERT em mudancas_partido gera um item em candidate_changes, que entra
-- no digest de alertas; a migration aborta se houver assinante que o receberia.
-- Aplicacao em producao exige autorizacao separada e ledger/readback.
BEGIN;
DO $apply$
DECLARE
  target_id uuid := 'b8e8b3d1-1e2e-482f-b0dd-dbf927c5c681';
  receipt text := 'migration:20260923233000';
  row_ids uuid[] := ARRAY[
    'df84c415-5e7b-4dc9-8696-cdda6eb2e674',
    'c5b68881-4a02-4500-944e-92a72fd32aac',
    '39a7246c-1de5-47ea-a654-77905b219528',
    'b39655c8-8172-413e-94cb-611bf16ed69e'
  ]::uuid[];
  candidate_row jsonb;
  inserted jsonb;
  affected integer;
BEGIN
  IF current_setting('pf.replay', true) = 'true' OR NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'eliziane mudancas: replay descartavel ou coorte vazia';
    RETURN;
  END IF;

  SELECT to_jsonb(c) INTO candidate_row
  FROM public.candidatos c
  WHERE c.id = target_id
    AND c.slug = 'tse-2026-100002541459'
    AND c.sq_candidato_2026 = '100002541459'
    AND c.nome_completo = 'ELIZIANE PEREIRA GAMA MELO'
    AND c.nome_urna = 'ELIZIANE GAMA'
    AND c.estado = 'MA'
    AND c.cargo_disputado = 'Senador'
    AND c.numero_urna = '133'
    AND c.partido_sigla = 'PT'
    AND c.partido_atual = 'PT'
    AND c.publicavel IS TRUE
    AND c.status <> 'removido'
  FOR UPDATE;
  IF candidate_row IS NULL
    OR EXISTS (SELECT 1 FROM public.mudancas_partido WHERE candidato_id = target_id)
    OR EXISTS (SELECT 1 FROM public.mudancas_partido WHERE id = ANY (row_ids))
    OR EXISTS (SELECT 1 FROM public.candidate_changes WHERE registro_id = ANY (row_ids))
    OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = receipt)
    OR EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot WHERE migration_version = '20260923233000') THEN
    RAISE EXCEPTION 'eliziane mudancas: preimagem/identidade ou recibo divergiu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.alert_subscriptions WHERE candidato_id = target_id)
    OR EXISTS (SELECT 1 FROM public.alert_cohort_subscriptions a
               WHERE (a.cargo IS NULL OR a.cargo ILIKE 'senad%')
                 AND (a.uf IS NULL OR a.uf = 'MA')) THEN
    RAISE EXCEPTION 'eliziane mudancas: ha assinante de alerta que receberia o historico como novidade';
  END IF;

  -- @write tabela=mudancas_partido slug=tse-2026-100002541459 campos=id,candidato_id,partido_anterior,partido_novo,ano,data_mudanca,contexto,created_at
  INSERT INTO public.mudancas_partido
    (id,candidato_id,partido_anterior,partido_novo,ano,data_mudanca,contexto,created_at)
  SELECT v.id,c.id,v.partido_anterior,v.partido_novo,v.ano,v.data_mudanca,v.contexto,v.created_at
  FROM public.candidatos c
  CROSS JOIN (VALUES
    (row_ids[1],'PPS','REDE',2015,date '2015-10-05',
     'Filiação à REDE registrada pelo Senado Federal (filiações do parlamentar 5718: REDE de 05/10/2015 a 03/04/2016) e pela Câmara dos Deputados (alteração de partido em 05/10/2015). Fontes: https://legis.senado.leg.br/dadosabertos/senador/5718/filiacoes e https://dadosabertos.camara.leg.br/api/v2/deputados/178883/historico',
     timestamptz '2026-09-23 23:30:00+00'),
    (row_ids[2],'REDE','PPS',2016,date '2016-04-04',
     'Retorno ao PPS registrado pela Câmara dos Deputados (alteração de partido em 04/04/2016) e pelo Senado Federal (saída da REDE em 03/04/2016; nova filiação a partir de 04/04/2016). Fontes: https://dadosabertos.camara.leg.br/api/v2/deputados/178883/historico e https://legis.senado.leg.br/dadosabertos/senador/5718/filiacoes',
     timestamptz '2026-09-23 23:30:00+00'),
    (row_ids[3],'CIDADANIA','PSD',2023,date '2023-01-31',
     'Senado Federal: filiação ao Cidadania encerrada em 30/01/2023 e ao PSD iniciada em 31/01/2023. Fonte: https://legis.senado.leg.br/dadosabertos/senador/5718/filiacoes',
     timestamptz '2026-09-23 23:30:00+00'),
    (row_ids[4],'PSD','PT',2026,NULL,
     'Mudança observada entre eleições TSE (2026): registro de candidatura ao Senado pelo MA pelo PT (SQ 100002541459, número 133). A data da troca não consta das fontes oficiais consultadas; o Senado ainda lista o PSD sem data de saída. Fonte: https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
     timestamptz '2026-09-23 23:30:00+00')
  ) AS v(id,partido_anterior,partido_novo,ano,data_mudanca,contexto,created_at)
  WHERE c.id = target_id AND c.slug = 'tse-2026-100002541459';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 4 THEN RAISE EXCEPTION 'eliziane mudancas: INSERT afetou % linhas', affected; END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260923233000 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT '20260923233000','mudancas_partido',m.id,m.candidato_id,'{}'::jsonb,to_jsonb(m),now()
  FROM public.mudancas_partido m
  WHERE m.id = ANY (row_ids) AND m.candidato_id = target_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 4 THEN RAISE EXCEPTION 'eliziane mudancas: snapshot afetou % linhas', affected; END IF;

  IF (SELECT count(*) FROM public.candidate_changes
      WHERE registro_id = ANY (row_ids) AND tabela_origem = 'mudancas_partido'
        AND candidato_id = target_id) <> 4 THEN
    RAISE EXCEPTION 'eliziane mudancas: candidate_changes divergiu do esperado';
  END IF;

  SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ano) INTO inserted
  FROM public.mudancas_partido m WHERE m.id = ANY (row_ids);

  -- @write tabela=coleta_log ref=migration:20260923233000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES ('senado-filiacoes','candidato','tse-2026-100002541459',target_id,
          'encontrado',4,
          jsonb_build_object('before','[]'::jsonb,'after',inserted,
            'senado_codigo_parlamentar','5718',
            'senado_filiacoes_sha256','19dac162d11871d8d09310fd66f777c9f54f327464454de6ab4e3d80c83c1342',
            'camara_deputado_id','178883',
            'camara_historico_sha256','65e16fe1ec79c38f163a8a3fa69db711261a972ba4f3a8437c7a9824cdcfe3bd',
            'tse_consulta_cand_2026_sha256','dda125bc927941e4273fe60ccc9755cb1e05bc198d63ba8848178cc6d1b51a6c',
            'tse_renomeacao_pps_cidadania','2019-09-19')::text,
          'https://legis.senado.leg.br/dadosabertos/senador/5718/filiacoes',
          'migration:20260923233000','escrita');
END
$apply$;
COMMIT;
