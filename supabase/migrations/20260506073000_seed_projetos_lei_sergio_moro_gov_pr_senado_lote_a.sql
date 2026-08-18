-- ============================================
-- Legislacao full-site: sergio-moro-gov-pr / Senado / projetos_lei
-- Seed completo do recorte: autoria parlamentar substantiva Senado 2023-2026
-- ============================================
-- Fonte oficial: Senado Federal Dados Abertos
--   https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json
--   https://legis.senado.leg.br/dadosabertos/materia/{codigo}.json
--   https://legis.senado.leg.br/dadosabertos/materia/autoria/{codigo}.json
--   https://www25.senado.leg.br/web/atividade/materias/-/materia/{codigo}
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506
--   coverage_scope = inventario_completo_senado_autoria_substantiva_2023_2026_20260506
--
-- Filtro factual: endpoint senador/6331/autorias.json com
--   IndicadorAutorPrincipal=Sim, siglas substantivas em
--   (PLS, PL, PEC, PLP, PRS, PDL, PDS, PCE), e endpoint
--   materia/autoria/{codigo}.json confirmando CodigoParlamentar=6331
--   com NumOrdemAutor=1. Resultado deste snapshot: 14 rows.
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'sergio-moro-gov-pr';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'sergio-moro-gov-pr: candidato ausente neste banco local/CI minimo; seed projetos_lei Senado pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506';

  SELECT count(*) INTO target_present
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('155800', '156398', '157373', '157423', '160206', '160239', '161085', '161890', '164682', '167755', '167486', '167772', '169235', '173278');

  SELECT count(*) INTO target_with_other_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('155800', '156398', '157373', '157423', '160206', '160239', '161085', '161890', '164682', '167755', '167486', '167772', '169235', '173278')
    AND coverage_id IS NOT NULL
    AND coverage_id <> 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506';

  IF target_with_other_coverage <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao sergio-moro-gov-pr: % rows alvo Senado ja tem coverage_id divergente', target_with_other_coverage;
  END IF;

  SELECT count(*) INTO mandato_senado_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND (hp.cargo ILIKE '%Senador%' OR hp.cargo_canonico = 'Senador')
    AND UPPER(COALESCE(hp.estado, '')) = 'PR'
    AND COALESCE(hp.periodo_inicio, 9999) <= 2026
    AND COALESCE(hp.periodo_fim, 9999) >= 2023;

  IF mandato_senado_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao sergio-moro-gov-pr: mandato Senado/PR 2023-2026 nao encontrado em historico_politico';
  END IF;
END $$;

CREATE TEMP TABLE _seed_sergio_moro_gov_pr_senado_lote_a_projetos ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('PDL', '28', 2023, 'Susta os efeitos dos dispositivos do Decreto nº 11.328, de 1º de janeiro de 2023, que instituem a Procuradoria Nacional da União de Defesa da Democracia, na estrutura organizacional da Advocacia-Geral da União.', 'Senado', '155800', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/155800', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"155800","descricao_identificacao":"PDL 28/2023","data_apresentacao":"2023-02-08","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/155800.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/155800.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/155800","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PL', '1307', 2023, 'Altera a Lei nº 12.694, de 24 de julho de 2012, para ampliar a proteção dos agentes públicos ou processuais envolvidos no combate ao crime organizado, e a Lei nº 12.850, de 2 de agosto de 2013, para tipificar a conduta de obstrução de ações contra o crime organizado.', 'Senado', '156398', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/156398', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"156398","descricao_identificacao":"PL 1307/2023","data_apresentacao":"2023-03-22","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/156398.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/156398.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/156398","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PL', '2522', 2023, 'Altera a Lei nº 11.343, de 23 de agosto de 2006, para criar hipóteses de não restituição de bens ao acusado de tráfico de drogas, nos casos de absolvição, extinção da punibilidade ou de nulidade do processo.', 'Senado', '157373', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/157373', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"157373","descricao_identificacao":"PL 2522/2023","data_apresentacao":"2023-05-11","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/157373.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/157373.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/157373","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PL', '2581', 2023, 'Esta Lei disciplina instrumentos de proteção, incentivo e recompensa a informantes que noticiem crimes ou atos ilícitos no mercado de valores mobiliários ou em sociedades anônimas de capital aberto; e altera a Lei nº 6.385, de 7 de dezembro de 1976, para prever obrigações às sociedades anônimas de capital aberto a fim de garantir a integridade de suas demonstrações contábeis e financeiras.', 'Senado', '157423', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/157423', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"157423","descricao_identificacao":"PL 2581/2023","data_apresentacao":"2023-05-16","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/157423.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/157423.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/157423","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PL', '4687', 2023, 'Altera a Lei nº 14.133, de 1º de abril de 2021, para permitir que os Estados, os Municípios e o Distrito Federal possam prever a obrigatoriedade de programas de integridade em editais de licitação segundo sua realidade e necessidades locais.', 'Senado', '160206', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/160206', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"160206","descricao_identificacao":"PL 4687/2023","data_apresentacao":"2023-09-27","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/160206.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/160206.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/160206","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PL', '4744', 2023, 'Institui o Programa de Patrocínio para Alunos da Educação Superior e da Educação Profissional e Tecnológica (PAESP) e altera a Lei nº 9.250, de 26 de dezembro de 1995, que “altera a legislação do imposto de renda das pessoas físicas e dá outras providências”, Lei nº 9.532, de 10 de dezembro de 1997, e a Lei nº 11.438, 29 de dezembro de 2006, para dispor sobre o incentivo fiscal relativo ao Programa.', 'Senado', '160239', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/160239', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"160239","descricao_identificacao":"PL 4744/2023","data_apresentacao":"2023-09-28","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/160239.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/160239.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/160239","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PL', '5510', 2023, 'Altera a Lei nº 12.850, de 2 agosto de 2013, para estabelecer limites ao plantão judiciário na apreciação de pedidos de habeas corpus ou de revogação de prisão cautelar, bem como de liberação de bens ou valores apreendidos.', 'Senado', '161085', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/161085', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"161085","descricao_identificacao":"PL 5510/2023","data_apresentacao":"2023-11-14","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/161085.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/161085.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/161085","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PL', '10', 2024, 'Altera o Decreto-Lei nº 3.689, de 3 de outubro de 1941 - Código de Processo Penal, para elencar circunstâncias que recomendam a conversão da prisão em flagrante em preventiva na audiência de custódia.', 'Senado', '161890', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/161890', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"161890","descricao_identificacao":"PL 10/2024","data_apresentacao":"2024-01-31","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/161890.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/161890.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/161890","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PL', '2819', 2024, 'Altera o Decreto-Lei nº 2.848, de 7 de dezembro de 1940 - Código Penal, para inserir regra de unificação de penas para concurso de crimes contra as instituições democráticas.', 'Senado', '164682', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/164682', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"164682","descricao_identificacao":"PL 2819/2024","data_apresentacao":"2024-07-10","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/164682.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/164682.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/164682","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PDL', '137', 2025, 'Susta a Resolução Gecex nº 648, de 14 de outubro de 2024, do Comitê-Executivo de Gestão da Câmara de Comércio Exterior.', 'Senado', '167755', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/167755', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"167755","descricao_identificacao":"PDL 137/2025","data_apresentacao":"2025-03-26","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/167755.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/167755.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/167755","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PL', '869', 2025, 'Altera o Código de Processo Penal para prever como condições adicionais ao acordo de não persecução penal a renúncia a cargo ou função pública, inclusive eletivos, e proibição de exercício de cargo ou função pública pelo período de cinco anos.', 'Senado', '167486', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/167486', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"167486","descricao_identificacao":"PL 869/2025","data_apresentacao":"2025-03-11","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/167486.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/167486.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/167486","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PL', '1285', 2025, 'Altera Lei nº 11.343, de 23 de agosto de 2006 (Lei de Drogas), para tipificar o crime de coação criminosa no tráfico de drogas.', 'Senado', '167772', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/167772', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"167772","descricao_identificacao":"PL 1285/2025","data_apresentacao":"2025-03-27","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/167772.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/167772.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/167772","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PL', '3000', 2025, 'Altera o Decreto-Lei nº 1.593, de 21 de dezembro de 1977, e o Decreto-Lei nº 1.455, de 7 de abril de 1976, para determinar o perdimento e a destruição de maquinários, produtos, subprodutos e instrumentos utilizados na fabricação clandestina de cigarros e outros derivados de tabaco.', 'Senado', '169235', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/169235', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"169235","descricao_identificacao":"PL 3000/2025","data_apresentacao":"2025-06-18","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/169235.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/169235.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/169235","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb),
    ('PEC', '5', 2026, 'Altera o art. 58 da Constituição Federal, para dispor sobre o comparecimento obrigatório do investigado e da testemunha perante as comissões parlamentares de inquérito.', 'Senado', '173278', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/173278', 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506', '{"proposicao_id_api":"173278","descricao_identificacao":"PEC 5/2026","data_apresentacao":"2026-03-24","casa":"SF","codigo_parlamentar_senado":6331,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":41,"partido_autor_no_protocolo":"UNIÃO","uf_autor_no_protocolo":"PR","autor_nome":"Sergio Moro","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/6331/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/173278.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/173278.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/173278","coverage_id":"sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2023_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"sergio-moro-gov-pr-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T09:14:50.291Z"}'::jsonb)
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'sergio-moro-gov-pr';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'sergio-moro-gov-pr: validacao de mandato Senado pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(DISTINCT seed.ano) INTO uncovered_year_count
  FROM _seed_sergio_moro_gov_pr_senado_lote_a_projetos seed
  WHERE NOT EXISTS (
    SELECT 1
    FROM historico_politico hp
    WHERE hp.candidato_id = cand_id
      AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
      AND (hp.cargo ILIKE '%Senador%' OR hp.cargo_canonico = 'Senador')
      AND UPPER(COALESCE(hp.estado, '')) = 'PR'
      AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
      AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
  );

  IF uncovered_year_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao sergio-moro-gov-pr: existem % anos de proposicoes Senado sem cobertura em mandato Senado/PR', uncovered_year_count;
  END IF;
END $$;

WITH target AS (
  SELECT c.id AS candidato_id
  FROM candidatos c
  WHERE c.slug = 'sergio-moro-gov-pr'
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
CROSS JOIN _seed_sergio_moro_gov_pr_senado_lote_a_projetos AS seed
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'sergio-moro-gov-pr';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'sergio-moro-gov-pr: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Senado'
    AND proposicao_id_api IN ('155800', '156398', '157373', '157423', '160206', '160239', '161085', '161890', '164682', '167755', '167486', '167772', '169235', '173278');

  SELECT count(*) INTO scope_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'sergio-moro-gov-pr-senado-completo-autoria-substantiva-2023-2026-20260506'
    AND coverage_scope = 'inventario_completo_senado_autoria_substantiva_2023_2026_20260506';

  SELECT count(*) INTO lme_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  IF target_count <> 14 THEN
    RAISE EXCEPTION 'Pos-apply sergio-moro-gov-pr: esperadas 14 rows alvo Senado em projetos_lei, encontradas %', target_count;
  END IF;

  IF scope_count <> 14 THEN
    RAISE EXCEPTION 'Pos-apply sergio-moro-gov-pr: esperadas 14 rows com coverage_id/scope alvo, encontradas %', scope_count;
  END IF;

  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply sergio-moro-gov-pr: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;

  RAISE NOTICE 'Pos-apply sergio-moro-gov-pr Senado Lote A: projetos_lei=% coverage_scope=% legislacao_mandato_executivo=%', total_count, scope_count, lme_count;
END $$;
