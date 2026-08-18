-- ============================================
-- Legislacao full-site: beto-faro / Senado / projetos_lei
-- Seed completo do recorte: autoria parlamentar substantiva Senado 2023-2025
-- ============================================
-- Fonte oficial: Senado Federal Dados Abertos
--   https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json
--   https://legis.senado.leg.br/dadosabertos/materia/{codigo}.json
--   https://legis.senado.leg.br/dadosabertos/materia/autoria/{codigo}.json
--   https://www25.senado.leg.br/web/atividade/materias/-/materia/{codigo}
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506
--   coverage_scope = inventario_completo_senado_autoria_substantiva_2023_2025_20260506
--
-- Filtro factual: endpoint senador/4639/autorias.json com
--   IndicadorAutorPrincipal=Sim, siglas substantivas em
--   (PLS, PL, PEC, PLP, PRS, PDL, PDS, PCE), e endpoint
--   materia/autoria/{codigo}.json confirmando CodigoParlamentar=4639
--   com NumOrdemAutor=1. Resultado deste snapshot: 13 rows.
--
-- O recorte e completo apenas para a autoria parlamentar substantiva no Senado
-- retornada pelo endpoint oficial. Nao e inventario completo da vida publica do
-- candidato.
--
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO escreve em historico_politico.
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'beto-faro';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'beto-faro: candidato ausente neste banco local/CI minimo; seed projetos_lei Senado pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506';

  SELECT count(*) INTO target_present
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('156914', '156984', '156985', '158715', '159849', '160779', '160838', '162487', '167071', '170284', '171047', '171201', '172246');

  IF target_present NOT IN (0, 13) THEN
    RAISE EXCEPTION 'Pre-condicao beto-faro: overlap parcial com rows alvo Senado em projetos_lei: % de 13', target_present;
  END IF;

  IF target_present = 13 AND target_count <> 13 THEN
    RAISE EXCEPTION 'Pre-condicao beto-faro: 13 rows alvo ja existem, mas apenas % com coverage_id alvo', target_count;
  END IF;

  SELECT count(*) INTO target_with_other_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('156914', '156984', '156985', '158715', '159849', '160779', '160838', '162487', '167071', '170284', '171047', '171201', '172246')
    AND coverage_id IS NOT NULL
    AND coverage_id <> 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506';

  IF target_with_other_coverage <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao beto-faro: % rows alvo Senado ja tem coverage_id divergente', target_with_other_coverage;
  END IF;

  SELECT count(*) INTO mandato_senado_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND (hp.cargo ILIKE '%Senador%' OR hp.cargo_canonico = 'Senador')
    AND UPPER(COALESCE(hp.estado, '')) = 'PA'
    AND COALESCE(hp.periodo_inicio, 9999) <= 2025
    AND COALESCE(hp.periodo_fim, 9999) >= 2023;

  IF mandato_senado_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao beto-faro: mandato Senado/PA 2023-2025 nao encontrado em historico_politico';
  END IF;
END $$;

CREATE TEMP TABLE _seed_beto_faro_senado_lote_a_projetos ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('PL', '1945', 2023, 'Dispõe sobre medidas emergenciais de amparo à agricultura familiar, para mitigar os impactos socioeconômicos da Covid-19; altera as Leis nºs 13.340, de 28 de setembro de 2016, 13.606, de 9 de janeiro de 2018; e 14.284, de 29 de dezembro de 2021, e dá outras providências (Lei Assis Carvalho III).', 'Senado', '156914', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/156914', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"156914","descricao_identificacao":"PL 1945/2023","data_apresentacao":"2023-04-17","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/156914.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/156914.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/156914","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '2005', 2023, 'Altera o art. 14, da Lei nº 11.947, de 16 de junho de 2009, e dá outras providências.', 'Senado', '156984', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/156984', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"156984","descricao_identificacao":"PL 2005/2023","data_apresentacao":"2023-04-19","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/156984.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/156984.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/156984","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '2006', 2023, 'Altera os Arts. 1º e 3º da Medida Provisória nº 2.199-14, de 24 de agosto de 2001 para prorrogar até dezembro de 2028 os incentivos fiscais regionais nas áreas de abrangência da Sudam e Sudene.', 'Senado', '156985', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/156985', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"156985","descricao_identificacao":"PL 2006/2023","data_apresentacao":"2023-04-19","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/156985.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/156985.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/156985","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '3495', 2023, 'Altera a Lei nº 10.177, de 12 de janeiro de 2001, e a Lei nº 7.827, de 27 de setembro de 1989, que regulam os Fundos Constitucionais de Financiamento do Norte (FNO), do Nordeste (FNE) e do Centro-Oeste (FCO), e dá outras providências.', 'Senado', '158715', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/158715', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"158715","descricao_identificacao":"PL 3495/2023","data_apresentacao":"2023-07-11","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/158715.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/158715.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/158715","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '4384', 2023, 'Institui o Programa Nacional de Fortalecimento da Agricultura Familiar – PRONAF, o Plano Safra da Agricultura Familiar, e dá outras providências.', 'Senado', '159849', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/159849', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"159849","descricao_identificacao":"PL 4384/2023","data_apresentacao":"2023-09-11","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/159849.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/159849.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/159849","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '5304', 2023, 'Dispõe sobre a responsabilidade, do empregador, pela realização de avaliação periódica de saúde e análise laboratorial para trabalhadores expostos a produtos agrotóxicos, seus componentes e afins, e dá outras providências.', 'Senado', '160779', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/160779', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"160779","descricao_identificacao":"PL 5304/2023","data_apresentacao":"2023-11-01","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/160779.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/160779.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/160779","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '5368', 2023, 'Altera o Art. 1º da Lei nº 10.779 de 25 de novembro de 2003 para definir o prazo de pagamento do benefício do seguro desemprego ao pescador artesanal durante o período de defeso da atividade pesqueira, e dá outras provdências.', 'Senado', '160838', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/160838', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"160838","descricao_identificacao":"PL 5368/2023","data_apresentacao":"2023-11-07","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/160838.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/160838.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/160838","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '705', 2024, 'Estabelece medidas temporárias de proteção comercial aos insumos industriais estratégicos e suas matérias primas nas condições especificadas.', 'Senado', '162487', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/162487', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"162487","descricao_identificacao":"PL 705/2024","data_apresentacao":"2024-03-12","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/162487.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/162487.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/162487","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '123', 2025, 'Altera o Decreto-Lei nº 79, de 19 de dezembro de 1966, para estabelecer critérios para a definição dos preços mínimos básicos para o arroz, feijão e mandioca, e dá outras providências.', 'Senado', '167071', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/167071', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"167071","descricao_identificacao":"PL 123/2025","data_apresentacao":"2025-01-30","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/167071.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/167071.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/167071","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '4405', 2025, 'Dispõe sobre a proibição da concessão de benefícios tributários e de medidas mitigatórias a pessoas jurídicas que transfiram investimentos, para o exterior, como estratégia de defesa aos efeitos internos, provocados por medidas unilaterais distorcivas de comércio aplicadas ao Brasil por parceiros comerciais.', 'Senado', '170284', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/170284', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"170284","descricao_identificacao":"PL 4405/2025","data_apresentacao":"2025-09-03","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/170284.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/170284.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/170284","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '5242', 2025, 'Inscreve o nome do militar e desbravador Pedro Teixeira no Livro dos Heróis da Pátria.', 'Senado', '171047', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/171047', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"171047","descricao_identificacao":"PL 5242/2025","data_apresentacao":"2025-10-16","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/171047.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/171047.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/171047","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '5365', 2025, 'Confere o título de Capital Nacional da Pororoca ao município de São Domingos do Capim, no Estado do Pará, e dá outras providências.', 'Senado', '171201', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/171201', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"171201","descricao_identificacao":"PL 5365/2025","data_apresentacao":"2025-10-22","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/171201.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/171201.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/171201","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb),
    ('PL', '6616', 2025, 'Institui o Mapa do Caminho Brasileiro da Transição Justa para a Economia de Baixo Carbono e o Desmatamento Zero, como instrumento da Política Nacional sobre Mudança do Clima, e altera as Leis nºs 12.114, de 9 de dezembro de 2009, que cria o Fundo Nacional sobre Mudança do Clima; 12.187, de 29 de dezembro de 2009, que institui a Política Nacional sobre Mudança do Clima; e 12.351, de 22 de dezembro de 2010, que cria o Fundo Social, para compatibilizá-las ao novo instrumento e para viabilizá-lo financeiramente.', 'Senado', '172246', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/172246', 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506', '{"proposicao_id_api":"172246","descricao_identificacao":"PL 6616/2025","data_apresentacao":"2025-12-19","casa":"SF","codigo_parlamentar_senado":4639,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PT","uf_autor_no_protocolo":"PA","autor_nome":"Beto Faro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/4639/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/172246.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/172246.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/172246","coverage_id":"beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2025_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"beto-faro-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T03:15:36.445Z"}'::jsonb)
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'beto-faro';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'beto-faro: validacao de mandato Senado pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(DISTINCT seed.ano) INTO uncovered_year_count
  FROM _seed_beto_faro_senado_lote_a_projetos seed
  WHERE NOT EXISTS (
    SELECT 1
    FROM historico_politico hp
    WHERE hp.candidato_id = cand_id
      AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
      AND (hp.cargo ILIKE '%Senador%' OR hp.cargo_canonico = 'Senador')
      AND UPPER(COALESCE(hp.estado, '')) = 'PA'
      AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
      AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
  );

  IF uncovered_year_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao beto-faro: existem % anos de proposicoes Senado sem cobertura em mandato Senado/PA', uncovered_year_count;
  END IF;
END $$;

WITH target AS (
  SELECT c.id AS candidato_id
  FROM candidatos c
  WHERE c.slug = 'beto-faro'
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
CROSS JOIN _seed_beto_faro_senado_lote_a_projetos AS seed
ON CONFLICT (candidato_id, proposicao_id_api) DO NOTHING;

DO $$
DECLARE
  cand_id uuid;
  total_count int;
  target_count int;
  scope_count int;
  lme_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'beto-faro';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'beto-faro: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Senado'
    AND proposicao_id_api IN ('156914', '156984', '156985', '158715', '159849', '160779', '160838', '162487', '167071', '170284', '171047', '171201', '172246');

  SELECT count(*) INTO scope_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'beto-faro-senado-completo-autoria-substantiva-2023-2025-20260506'
    AND coverage_scope = 'inventario_completo_senado_autoria_substantiva_2023_2025_20260506';

  SELECT count(*) INTO lme_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  IF target_count <> 13 THEN
    RAISE EXCEPTION 'Pos-apply beto-faro: esperadas 13 rows alvo Senado em projetos_lei, encontradas %', target_count;
  END IF;

  IF scope_count <> 13 THEN
    RAISE EXCEPTION 'Pos-apply beto-faro: esperadas 13 rows com coverage_id/scope alvo, encontradas %', scope_count;
  END IF;

  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply beto-faro: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;

  RAISE NOTICE 'Pos-apply beto-faro Senado Lote A: projetos_lei=% coverage_scope=% legislacao_mandato_executivo=%', total_count, scope_count, lme_count;
END $$;
