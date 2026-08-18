-- ============================================
-- Legislacao full-site: omar-aziz / Senado / projetos_lei
-- Seed completo do recorte: autoria parlamentar substantiva Senado 2015-2026
-- ============================================
-- Fonte oficial: Senado Federal Dados Abertos
--   https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json
--   https://legis.senado.leg.br/dadosabertos/materia/{codigo}.json
--   https://legis.senado.leg.br/dadosabertos/materia/autoria/{codigo}.json
--   https://www25.senado.leg.br/web/atividade/materias/-/materia/{codigo}
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506
--   coverage_scope = inventario_completo_senado_autoria_substantiva_2015_2026_20260506
--
-- Filtro factual: endpoint senador/5525/autorias.json com
--   IndicadorAutorPrincipal=Sim, siglas substantivas em
--   (PLS, PL, PEC, PLP, PRS, PDL, PDS, PCE), e endpoint
--   materia/autoria/{codigo}.json confirmando CodigoParlamentar=5525
--   com NumOrdemAutor=1. Resultado deste snapshot: 19 rows.
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'omar-aziz';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'omar-aziz: candidato ausente neste banco local/CI minimo; seed projetos_lei Senado pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506';

  SELECT count(*) INTO target_present
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('122037', '122075', '122257', '122252', '122524', '122730', '122856', '126134', '126135', '136977', '141258', '141281', '141747', '142512', '148535', '151171', '156571', '163124', '173488');

  SELECT count(*) INTO target_with_other_coverage
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('122037', '122075', '122257', '122252', '122524', '122730', '122856', '126134', '126135', '136977', '141258', '141281', '141747', '142512', '148535', '151171', '156571', '163124', '173488')
    AND coverage_id IS NOT NULL
    AND coverage_id <> 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506';

  IF target_with_other_coverage <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao omar-aziz: % rows alvo Senado ja tem coverage_id divergente', target_with_other_coverage;
  END IF;

  SELECT count(*) INTO mandato_senado_count
  FROM historico_politico hp
  WHERE hp.candidato_id = cand_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND (hp.cargo ILIKE '%Senador%' OR hp.cargo_canonico = 'Senador')
    AND UPPER(COALESCE(hp.estado, '')) = 'AM'
    AND COALESCE(hp.periodo_inicio, 9999) <= 2026
    AND COALESCE(hp.periodo_fim, 9999) >= 2015;

  IF mandato_senado_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao omar-aziz: mandato Senado/AM 2015-2026 nao encontrado em historico_politico';
  END IF;
END $$;

CREATE TEMP TABLE _seed_omar_aziz_senado_lote_a_projetos ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('PLS', '409', 2015, 'Dispõe sobre a realização de concursos públicos para a Carreira Policial Federal e o Plano Especial de Cargos do Departamento de Polícia Federal.', 'Senado', '122037', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/122037', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"122037","descricao_identificacao":"PLS 409/2015","data_apresentacao":"2015-06-30","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/122037.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/122037.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/122037","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PLS', '417', 2015, 'Cria o banco nacional de impressões digitais.', 'Senado', '122075', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/122075', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"122075","descricao_identificacao":"PLS 417/2015","data_apresentacao":"2015-07-01","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/122075.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/122075.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/122075","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PLS', '455', 2015, 'Altera a Lei nº 7.102, de 20 de junho de 1983, para incluir as agências dos Correios que atuem como Banco Postal e as unidades lotéricas entre os estabelecimentos financeiros que devem possuir sistema de segurança; tornar obrigatório o circuito fechado de televisão (CFTV), a porta giratória com detector de metais e a cabine blindada nos estabelecimentos financeiros; e tornar obrigatória a filmagem frontal dos usuários nos terminais de autoatendimento bancário.', 'Senado', '122257', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/122257', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"122257","descricao_identificacao":"PLS 455/2015","data_apresentacao":"2015-07-09","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/122257.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/122257.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/122257","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PLS', '456', 2015, 'Dispõe sobre o fornecimento, pelas prestadoras de serviços de telecomunicações, mediante ordem judicial e sob segredo de Justiça, de dados que permitam o rastreamento físico de terminais móveis, para fins de investigação criminal, instrução processual penal e execução penal.', 'Senado', '122252', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/122252', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"122252","descricao_identificacao":"PLS 456/2015","data_apresentacao":"2015-07-09","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/122252.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/122252.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/122252","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PLS', '501', 2015, 'Altera a Lei nº 9.394, de 20 de dezembro de 1996, que estabelece as diretrizes e bases da educação nacional para incluir o tema do envelhecimento nos currículos da educação básica.', 'Senado', '122524', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/122524', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"122524","descricao_identificacao":"PLS 501/2015","data_apresentacao":"2015-08-04","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/122524.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/122524.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/122524","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PLS', '539', 2015, 'Confere ao Município de Parintins, no Estado do Amazonas, o título de Capital Nacional do Boi Bumbá.', 'Senado', '122730', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/122730', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"122730","descricao_identificacao":"PLS 539/2015","data_apresentacao":"2015-08-18","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/122730.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/122730.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/122730","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PLS', '566', 2015, 'Altera a Lei nº 9.394, de 20 de dezembro de 1996, que estabelece as diretrizes e bases da educação nacional, para incluir a possibilidade de matrícula em escolas, sem apresentação de certidão de nascimento.', 'Senado', '122856', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/122856', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"122856","descricao_identificacao":"PLS 566/2015","data_apresentacao":"2015-08-27","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/122856.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/122856.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/122856","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PLS', '246', 2016, 'Institui o art. 302-A na Lei nº 9.503, de 23 de setembro de 1997 – Código de Trânsito Brasileiro, para tipificar o crime de homicídio doloso na direção de veículo automotor e considerar doloso o homicídio cometido sob influência de álcool ou de outra substância psicoativa que determine dependência ou durante participação, em via, de corrida, disputa ou competição automobilística ou ainda exibição ou demonstração de perícia em manobra de veículo automotor.', 'Senado', '126134', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/126134', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"126134","descricao_identificacao":"PLS 246/2016","data_apresentacao":"2016-06-14","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/126134.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/126134.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/126134","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PLS', '247', 2016, 'Altera a Lei Complementar nº 101, de 4 de maio de 2000, para excetuar ações de segurança pública da aplicação das sanções de suspensão de transferências voluntárias constantes dessa lei.', 'Senado', '126135', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/126135', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"126135","descricao_identificacao":"PLS 247/2016","data_apresentacao":"2016-06-14","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/126135.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/126135.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/126135","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PL', '3136', 2019, 'Altera o art. 39 da Lei 8.078, de 11 de setembro de 1990 (Código de Defesa do Consumidor), para vedar a oferta telefônica de produto ou serviço sem o consentimento expresso do consumidor, e dá outras providências.', 'Senado', '136977', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/136977', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"136977","descricao_identificacao":"PL 3136/2019","data_apresentacao":"2019-05-28","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/136977.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/136977.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/136977","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PL', '1059', 2020, 'Dispõe sobre a concessão de garantias pelo Tesouro Nacional em empréstimos para empresas do setor privado, em resposta ao estado de calamidade pública reconhecido pelo Decreto Legislativo nº 6, de 20 de março de 2020, e da emergência de saúde pública de importância internacional decorrente do coronavírus.', 'Senado', '141258', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/141258', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"141258","descricao_identificacao":"PL 1059/2020","data_apresentacao":"2020-03-27","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/141258.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/141258.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/141258","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PL', '1128', 2020, 'Dispõe sobre a concessão de empréstimos para empresas do setor privado, com juros subsidiados e carência e prazos facilitados, para quitação da folha de pagamento no período de até três meses, devido o estado de calamidade pública reconhecido pelo Decreto Legislativo nº 6, de 20 de março de 2020, e da emergência de saúde pública de importância internacional decorrente do coronavírus.', 'Senado', '141281', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/141281', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"141281","descricao_identificacao":"PL 1128/2020","data_apresentacao":"2020-03-30","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/141281.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/141281.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/141281","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PL', '2303', 2020, 'Insere disposição transitória na Lei nº 9.492, de 10 de setembro de 1997, para suspender o exame dos protestos de títulos e outros documentos de dívidas em face das pessoas jurídicas de direito privado no período em que especifica.', 'Senado', '141747', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/141747', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"141747","descricao_identificacao":"PL 2303/2020","data_apresentacao":"2020-04-29","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/141747.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/141747.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/141747","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PRS', '25', 2020, 'Disciplina o tratamento a ser dispensado às operações realizadas de acordo com os §§ 1º, 2º e 3º do art. 65 da Lei Complementar nº 101, de 4 de maio de 2000, e art. 4º da Lei Complementar nº 173, de 27 de maio de 2020, no que tange às contratações dessas operações e às concessões de garantia pela União previstas nas Resoluções do Senado Federal nº 40 e nº 43, de 2001, e nº 48, de 2007.', 'Senado', '142512', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/142512', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"142512","descricao_identificacao":"PRS 25/2020","data_apresentacao":"2020-06-16","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/142512.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/142512.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/142512","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PL', '1912', 2021, 'Altera o Decreto-Lei nº 2.848, de 7 de dezembro de 1940 (Código Penal), para tipificar o crime de prescrição de produto destinado a fins terapêuticos ou medicinais sem comprovação científica.', 'Senado', '148535', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/148535', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"148535","descricao_identificacao":"PL 1912/2021","data_apresentacao":"2021-05-21","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/148535.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/148535.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/148535","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PL', '4321', 2021, 'Altera as Leis nº 9.782, de 26 de janeiro de 1999, que define o Sistema Nacional de Vigilância Sanitária, cria a Agência Nacional de Vigilância Sanitária, e dá outras providências, e nº 13.979, de 6 de fevereiro de 2020, que dispõe sobre as medidas para enfrentamento da emergência de saúde pública de importância internacional decorrente do coronavírus responsável pelo surto de 2019, para dispor sobre a competência da Anvisa para adotar as medidas de controle sanitário em situações de emergência em saúde pública.', 'Senado', '151171', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/151171', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"151171","descricao_identificacao":"PL 4321/2021","data_apresentacao":"2021-12-07","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/151171.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/151171.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/151171","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PEC', '12', 2023, 'Altera o art. 144 da Constituição Federal para identificar a Polícia Hidroviária Federal como órgão do sistema de segurança pública.', 'Senado', '156571', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/156571', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"156571","descricao_identificacao":"PEC 12/2023","data_apresentacao":"2023-03-15","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":28,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/156571.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/156571.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/156571","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PL', '1314', 2024, 'Altera a Lei nº 8.078, de 11 de setembro de 1990 (Código de Defesa do Consumidor), para reforçar a responsabilidade do fornecedor de serviço financeiro ou de serviço de pagamento por dano causado por uma pessoa a outra mediante o aproveitamento de defeito nesse serviço.', 'Senado', '163124', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/163124', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"163124","descricao_identificacao":"PL 1314/2024","data_apresentacao":"2024-04-17","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/163124.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/163124.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/163124","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb),
    ('PL', '1611', 2026, 'Autoriza a Superintendência da Zona Franca de Manaus (Suframa) a doar, com encargos, imóvel ao Instituto Nacional de Pesquisas da Amazônia (Inpa).', 'Senado', '173488', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/173488', 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506', 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506', '{"proposicao_id_api":"173488","descricao_identificacao":"PL 1611/2026","data_apresentacao":"2026-04-06","casa":"SF","codigo_parlamentar_senado":5525,"indicador_autor_principal_endpoint_senador":"Sim","indicador_outros_autores_endpoint_senador":"Não","num_ordem_autor":1,"total_autores":1,"partido_autor_no_protocolo":"PSD","uf_autor_no_protocolo":"AM","autor_nome":"Omar Aziz","fonte":"Senado Federal Dados Abertos","autorias_endpoint":"https://legis.senado.leg.br/dadosabertos/senador/5525/autorias.json","autoria_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/autoria/173488.json","detalhe_endpoint":"https://legis.senado.leg.br/dadosabertos/materia/173488.json","public_url":"https://www25.senado.leg.br/web/atividade/materias/-/materia/173488","coverage_id":"omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506","coverage_scope":"inventario_completo_senado_autoria_substantiva_2015_2026_20260506","lote":"A","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"omar-aziz-senado-lote-a-20260506","snapshot_consulta_em":"2026-05-06T07:59:27.227Z"}'::jsonb)
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'omar-aziz';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'omar-aziz: validacao de mandato Senado pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(DISTINCT seed.ano) INTO uncovered_year_count
  FROM _seed_omar_aziz_senado_lote_a_projetos seed
  WHERE NOT EXISTS (
    SELECT 1
    FROM historico_politico hp
    WHERE hp.candidato_id = cand_id
      AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
      AND (hp.cargo ILIKE '%Senador%' OR hp.cargo_canonico = 'Senador')
      AND UPPER(COALESCE(hp.estado, '')) = 'AM'
      AND COALESCE(hp.periodo_inicio, 9999) <= seed.ano
      AND COALESCE(hp.periodo_fim, 9999) >= seed.ano
  );

  IF uncovered_year_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao omar-aziz: existem % anos de proposicoes Senado sem cobertura em mandato Senado/AM', uncovered_year_count;
  END IF;
END $$;

WITH target AS (
  SELECT c.id AS candidato_id
  FROM candidatos c
  WHERE c.slug = 'omar-aziz'
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
CROSS JOIN _seed_omar_aziz_senado_lote_a_projetos AS seed
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
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'omar-aziz';

  IF cand_id IS NULL THEN
    RAISE NOTICE 'omar-aziz: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Senado'
    AND proposicao_id_api IN ('122037', '122075', '122257', '122252', '122524', '122730', '122856', '126134', '126135', '136977', '141258', '141281', '141747', '142512', '148535', '151171', '156571', '163124', '173488');

  SELECT count(*) INTO scope_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'omar-aziz-senado-completo-autoria-substantiva-2015-2026-20260506'
    AND coverage_scope = 'inventario_completo_senado_autoria_substantiva_2015_2026_20260506';

  SELECT count(*) INTO lme_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  IF target_count <> 19 THEN
    RAISE EXCEPTION 'Pos-apply omar-aziz: esperadas 19 rows alvo Senado em projetos_lei, encontradas %', target_count;
  END IF;

  IF scope_count <> 19 THEN
    RAISE EXCEPTION 'Pos-apply omar-aziz: esperadas 19 rows com coverage_id/scope alvo, encontradas %', scope_count;
  END IF;

  IF lme_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply omar-aziz: legislacao_mandato_executivo deve permanecer 0, encontrado %', lme_count;
  END IF;

  RAISE NOTICE 'Pos-apply omar-aziz Senado Lote A: projetos_lei=% coverage_scope=% legislacao_mandato_executivo=%', total_count, scope_count, lme_count;
END $$;
