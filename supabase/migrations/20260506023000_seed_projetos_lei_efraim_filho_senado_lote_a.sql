-- ============================================
-- Legislacao full-site: efraim-filho / Senado / projetos_lei
-- Seed completo do recorte: autoria parlamentar substantiva Senado 2023-2026
-- ============================================
-- Fonte oficial: Senado Federal Dados Abertos
--   https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json
--   https://legis.senado.leg.br/dadosabertos/materia/{codigo}.json
--   https://legis.senado.leg.br/dadosabertos/materia/autoria/{codigo}.json
--   https://www25.senado.leg.br/web/atividade/materias/-/materia/{codigo}
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506
--   coverage_scope = inventario_completo_senado_autoria_substantiva_2023_2026_20260506
--
-- Filtro factual: endpoint senador/4642/autorias.json com
--   IndicadorAutorPrincipal=Sim, siglas substantivas em
--   (PLS, PL, PEC, PLP, PRS, PDL, PDS, PCE), e endpoint
--   materia/autoria/{codigo}.json confirmando CodigoParlamentar=4642
--   com NumOrdemAutor=1. Resultado deste snapshot: 15 rows.
--
-- O recorte e completo apenas para a autoria parlamentar substantiva no Senado
-- retornada pelo endpoint oficial. Nao e inventario completo da vida publica do
-- candidato.
--
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO escreve em historico_politico.
-- Esta migration insere rows ausentes e atualiza coverage/metadata somente em
-- rows alvo Senado sem coverage_id divergente.
-- Esta migration NAO popula tema, destaque, destaque_motivo nem situacao
--   (campos editoriais/curatoriais, fora do contrato bruto de ingest oficial).
-- Esta migration NAO promove UI/whitelist publica; isso exige novo fechamento.
-- ============================================

DO $$
DECLARE
  cand_id uuid;
  projetos_total int;
  target_present int;
  target_count int;
  target_with_other_coverage int;
  mandato_senado_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'efraim-filho';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'efraim-filho: candidato ausente neste banco local/CI minimo; seed projetos_lei Senado pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506';

  SELECT count(*) INTO target_present
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('161093', '155787', '156458', '156877', '157114', '158198', '161479', '156455', '163490', '163641', '167555', '168596', '172001', '172468', '172917');

  SELECT count(*) INTO target_with_other_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('161093', '155787', '156458', '156877', '157114', '158198', '161479', '156455', '163490', '163641', '167555', '168596', '172001', '172468', '172917')
    AND coverage_id IS NOT NULL
    AND coverage_id <> 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506';

  IF target_with_other_coverage <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao efraim-filho: % rows alvo Senado ja tem coverage_id divergente', target_with_other_coverage;
  END IF;

  SELECT count(*) INTO mandato_senado_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND (hp.cargo ILIKE '%Senador%' OR hp.cargo_canonico = 'Senador')
    AND UPPER(COALESCE(hp.estado, '')) = 'PB'
    AND COALESCE(hp.periodo_inicio, 9999) <= 2026
    AND COALESCE(hp.periodo_fim, 9999) >= 2023;

  IF mandato_senado_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao efraim-filho: mandato Senado/PB 2023-2026 nao encontrado em historico_politico';
  END IF;
END $$;

CREATE TEMP TABLE _seed_efraim_filho_senado_lote_a_projetos ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('PDL', '404', 2023, 'Susta a Portaria/MPT nº 3.665, de 13 de novembro de 2023, do Ministério do Trabalho e Emprego (MTE), que alterou o regramento para o expediente no setor de comércio durante feriados.', 'Senado', '161093', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/161093', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"161093","descricao_identificacao":"PDL 404/2023","data_apresentacao":"2023-11-16","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":2,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/161093.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/161093.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/161093","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '334', 2023, 'Prorroga até 31 de dezembro de 2027 os prazos de que tratam os arts. 7º e 8º da Lei nº 12.546, de 14 de dezembro de 2011, e o caput do § 21 do art. 8º da Lei nº 10.865, de 30 de abril de 2004.', 'Senado', '155787', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/155787', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"155787","descricao_identificacao":"PL 334/2023","data_apresentacao":"2023-02-07","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/155787.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/155787.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/155787","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '1387', 2023, 'Altera a Lei nº 14.166, de 10 de junho de 2021, a Lei nº 13.340, de 28 de setembro de 2016 e a Lei nº 13.606, de 9 de janeiro de 2018, que dispõem sobre a renegociação extraordinária de débitos no âmbito do Fundo Constitucional de Financiamento do Norte (FNO), do Fundo Constitucional de Financiamento do Nordeste (FNE) e do Fundo Constitucional de Financiamento do Centro-Oeste (FCO) e de ativos da União decorrentes de crédito rural inscritos em Dívida Ativa da União e em cobrança pela Procuradoria-Geral da Fazenda Nacional (PGFN) ou Advocacia-Geral da União (AGU); e a Lei nº 14.165, de 10 de junho de 2021, que define as diretrizes para a quitação e para a renegociação das dívidas relativas às debêntures emitidas por empresas e subscritas pelos fundos de investimentos regionais e para o desinvestimento, a liquidação e a extinção dos fundos, para dispor sobre a liquidação e a renegociação de dívidas de crédito rural na área de abrangência da SUDENE, da SUDECO e da SUDAM; e dá outras providências.', 'Senado', '156458', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/156458', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"156458","descricao_identificacao":"PL 1387/2023","data_apresentacao":"2023-03-23","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/156458.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/156458.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/156458","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '1880', 2023, 'Altera o Decreto-Lei nº 2.848, de 7 de dezembro de 1940 – Código Penal, para tipificar o crime de massacre e a Lei nº 8.072, de 25 de julho de 1990, para incluir a nova tipificação no rol dos crimes hediondos.', 'Senado', '156877', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/156877', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"156877","descricao_identificacao":"PL 1880/2023","data_apresentacao":"2023-04-13","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/156877.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/156877.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/156877","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '2158', 2023, 'Altera a Lei nº 5.991, de 17 de dezembro de 1973, que "dispõe sobre o Controle Sanitário do Comércio de Drogas, Medicamentos, Insumos Farmacêuticos e Correlatos, e dá outras Providências", para permitir que os medicamentos isentos de prescrição possam ser comercializados e dispensados por supermercados, que disponham de farmacêutico.', 'Senado', '157114', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/157114', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"157114","descricao_identificacao":"PL 2158/2023","data_apresentacao":"2023-04-26","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/157114.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/157114.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/157114","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '3113', 2023, 'Institui a Política Nacional de Arborização Urbana, cria o Sistema Nacional de Informações sobre Arborização Urbana, e dá outras providências.', 'Senado', '158198', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/158198', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"158198","descricao_identificacao":"PL 3113/2023","data_apresentacao":"2023-06-16","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/158198.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/158198.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/158198","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '5883', 2023, 'Altera as Leis nº 9.985, de 18 de julho de 2000, nº 10.257, de 10 de julho de 2001, e nº 12.651, de 25 de maio de 2012, para destinar recursos obtidos com a compensação ambiental para ações voltadas à proteção e à melhoria da qualidade do meio ambiente urbano no município afetado.', 'Senado', '161479', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/161479', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"161479","descricao_identificacao":"PL 5883/2023","data_apresentacao":"2023-12-06","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/161479.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/161479.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/161479","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PLP', '70', 2023, 'Impede a redução dos coeficientes de distribuição do Fundo de Participação dos Municípios até a publicação dos resultados definitivos do próximo censo demográfico.', 'Senado', '156455', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/156455', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"156455","descricao_identificacao":"PLP 70/2023","data_apresentacao":"2023-03-23","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/156455.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/156455.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/156455","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '1755', 2024, 'Altera o art. 149-A do Decreto-Lei nº 2.848, de 7 de dezembro de 1940 (Código Penal), para aumentar as penas do crime de tráfico de pessoas e revogar a causa de diminuição de pena correspondente.', 'Senado', '163490', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/163490', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"163490","descricao_identificacao":"PL 1755/2024","data_apresentacao":"2024-05-10","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/163490.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/163490.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/163490","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '1847', 2024, 'Estabelece um regime de transição para a contribuição substitutiva prevista pelos arts. 7º e 8º da Lei nº 12.546, de 14 de dezembro de 2011, e para o adicional sobre a Cofins-Importação previsto pelo § 21 do art. 8º da Lei nº 10.865, de 30 de abril de 2004.', 'Senado', '163641', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/163641', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"163641","descricao_identificacao":"PL 1847/2024","data_apresentacao":"2024-05-15","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/163641.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/163641.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/163641","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '1006', 2025, 'Altera a Lei nº 10.420, de 10 de abril de 2002, que cria o Fundo Garantia-Safra e institui o Benefício Garantia-Safra destinado a agricultores familiares vitimados pelo fenômeno da estiagem nas regiões que especifica, para reajustar o valor máximo do benefício, prever a possibilidade de que futuros reajustes se deem por ato do Poder Executivo federal e determinar que o órgão gestor do Fundo expanda as culturas protegidas.', 'Senado', '167555', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/167555', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"167555","descricao_identificacao":"PL 1006/2025","data_apresentacao":"2025-03-14","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/167555.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/167555.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/167555","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '2308', 2025, 'Revoga o inciso V do art. 115 da Lei nº 8.213, de 24 de julho de 1991, para impedir descontos das mensalidades associativas e demais entidades de aposentados em benefícios previdenciários.', 'Senado', '168596', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/168596', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"168596","descricao_identificacao":"PL 2308/2025","data_apresentacao":"2025-05-14","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/168596.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/168596.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/168596","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '6311', 2025, 'Altera o Decreto-Lei nº 3.689, de 3 de outubro de 1941 (Código de Processo Penal), para possibilitar o custeio da defesa de agentes de segurança pública em procedimentos investigatórios e ações judiciais relativos a crimes supostamente praticados no exercício da função.', 'Senado', '172001', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/172001', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"172001","descricao_identificacao":"PL 6311/2025","data_apresentacao":"2025-12-10","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/172001.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/172001.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/172001","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '156', 2026, 'Dispõe sobre instalação e exploração comercial da infraestrutura de recarga de veículos elétricos em locais públicos e em edificações de uso coletivo.', 'Senado', '172468', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/172468', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"172468","descricao_identificacao":"PL 156/2026","data_apresentacao":"2026-02-03","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/172468.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/172468.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/172468","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb),
    ('PL', '953', 2026, 'Altera o Decreto-Lei nº 2.848, de 7 de dezembro de 1940 (Código Penal), para ampliar o limite de cumprimento de pena no regime fechado, aumentar a pena máxima do crime de feminicídio e criar o tipo penal de instigação por terceiro em contexto de violência doméstica e familiar contra a mulher; modifica a Lei nº 7.210, de 11 de julho de 1984 (Lei de Execução Penal), a fim de estabelecer novos percentuais para a progressão de regime no crime de feminicídio; altera o Decreto-Lei n º 3.689, de 3 de outubro de 1941 (Código de Processo Penal), para prever nova hipótese prisão preventiva; altera a Lei nº 11.340, de 7 de agosto de 2006 (Lei Maria da Penha), para prever novas hipóteses de medidas protetivas de urgência e cria o Cadastro Nacional de Pessoas Condenadas por Violência Doméstica e Feminicídio - Lei "Raphaella Brilhante".', 'Senado', '172917', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/172917', 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"172917","descricao_identificacao":"PL 953/2026","data_apresentacao":"2026-03-04","casa":"SF","codigo_parlamentar_senado":4642,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PB","autor_nome":"Efraim Filho","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4642/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/172917.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/172917.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/172917","coverage_id":"efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"efraim-filho-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T05:07:43.977Z"}'::jsonb)
) AS v(
  tipo,
  numero,
  ano,
  ementa,
  fonte,
  proposicao_id_api,
  url_inteiro_teor,
  coverage_id,
  coverage_scope,
  metadata
);

DO $$
DECLARE
  cand_id uuid;
  uncovered_year_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'efraim-filho';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'efraim-filho: validacao de mandato Senado pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(DISTINCT seed.ano) INTO uncovered_year_count
  FROM _seed_efraim_filho_senado_lote_a_projetos seed
  WHERE NOT EXISTS (
    SELECT 1
    FROM historico_politico hp
    WHERE hp.candidato_id = cand_id
      AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
      AND (hp.cargo ILIKE '%Senador%' OR hp.cargo_canonico = 'Senador')
      AND UPPER(COALESCE(hp.estado, '')) = 'PB'
      AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
      AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
  );

  IF uncovered_year_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao efraim-filho: existem % anos de proposicoes Senado sem cobertura em mandato Senado/PB', uncovered_year_count;
  END IF;
END $$;

WITH target AS (
  SELECT c.id AS candidato_id
  FROM candidatos c
  WHERE c.slug = 'efraim-filho'
)
INSERT INTO projetos_lei (
  candidato_id,
  tipo,
  numero,
  ano,
  ementa,
  fonte,
  proposicao_id_api,
  url_inteiro_teor,
  coverage_id,
  coverage_scope,
  metadata
)
SELECT
  target.candidato_id,
  seed.tipo,
  seed.numero,
  seed.ano,
  seed.ementa,
  seed.fonte,
  seed.proposicao_id_api,
  seed.url_inteiro_teor,
  seed.coverage_id,
  seed.coverage_scope,
  seed.metadata
FROM target
CROSS JOIN _seed_efraim_filho_senado_lote_a_projetos AS seed
ON CONFLICT (candidato_id, proposicao_id_api) DO UPDATE SET
  tipo = EXCLUDED.tipo,
  numero = EXCLUDED.numero,
  ano = EXCLUDED.ano,
  ementa = EXCLUDED.ementa,
  fonte = EXCLUDED.fonte,
  url_inteiro_teor = EXCLUDED.url_inteiro_teor,
  coverage_id = EXCLUDED.coverage_id,
  coverage_scope = EXCLUDED.coverage_scope,
  metadata = COALESCE(projetos_lei.metadata, '{}'::jsonb) || EXCLUDED.metadata
WHERE projetos_lei.coverage_id IS NULL
   OR projetos_lei.coverage_id = EXCLUDED.coverage_id;

DO $$
DECLARE
  cand_id uuid;
  total_count int;
  target_count int;
  scope_count int;
  lme_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'efraim-filho';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'efraim-filho: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Senado'
    AND proposicao_id_api IN ('161093', '155787', '156458', '156877', '157114', '158198', '161479', '156455', '163490', '163641', '167555', '168596', '172001', '172468', '172917');

  SELECT count(*) INTO scope_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'efraim-filho-senado-completo-autoria-substantiva-2023-2026-20260506'
    AND coverage_scope = 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506';

  SELECT count(*) INTO lme_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  IF target_count <> 15 THEN
    RAISE EXCEPTION 'Pos-apply efraim-filho: esperadas 15 rows alvo Senado em projetos_lei, encontradas %', target_count;
  END IF;

  IF scope_count <> 15 THEN
    RAISE EXCEPTION 'Pos-apply efraim-filho: esperadas 15 rows com coverage_id/scope alvo, encontradas %', scope_count;
  END IF;

  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply efraim-filho: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;

  RAISE NOTICE 'Pos-apply efraim-filho Senado Lote A: projetos_lei=% coverage_scope=% legislacao_mandato_executivo=%', total_count, scope_count, lme_count;
END $$;
