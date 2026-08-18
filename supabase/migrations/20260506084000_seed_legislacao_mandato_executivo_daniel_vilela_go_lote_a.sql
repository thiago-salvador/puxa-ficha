-- ============================================================================
-- Full-site Legislacao: Daniel Vilela GO - Legisla Goias Lote A
-- Tabela alvo: legislacao_mandato_executivo
-- Fonte oficial: Casa Civil do Estado de Goias - Legisla Goias
-- Artefato: fonte interna de curadoria
-- Sem escrita em projetos_lei ou historico_politico.
-- Coverage parcial: daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506
-- ============================================================================

DO $$
DECLARE
  v_candidato_id uuid;
  v_hp_count integer;
  v_lme_count integer;
BEGIN
  SELECT id INTO v_candidato_id FROM candidatos WHERE slug = 'daniel-vilela';
  IF v_candidato_id IS NULL THEN
    RAISE NOTICE 'daniel-vilela: candidato ausente neste banco local/CI minimo; seed LME GO Legisla Goias pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO v_hp_count
  FROM historico_politico hp
  WHERE hp.candidato_id = v_candidato_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND hp.cargo_canonico = 'Governador'
    AND upper(coalesce(hp.estado, '')) = 'GO'
    AND coalesce(hp.periodo_inicio, 9999) <= 2026
    AND coalesce(hp.periodo_fim, 9999) >= 2026;
  IF v_hp_count <> 1 THEN
    RAISE EXCEPTION 'Pre-condicao daniel-vilela: esperava 1 mandato Governador/GO em 2026, encontrei %', v_hp_count;
  END IF;

  SELECT count(*) INTO v_lme_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id;
  IF v_lme_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao daniel-vilela: esperava 0 rows LME antes do lote, encontrei %', v_lme_count;
  END IF;
END $$;

WITH seed_rows(legisla_go_id, numero, ano, data_norma, ementa, fonte_primaria_url, fonte_primaria_titulo, fonte_tramitacao_url, identificador_fonte, metadata) AS (
  VALUES
    (114164::int, '24.256', 2026::int, DATE '2026-04-29', 'Altera a Lei nº 20.464, de 22 de abril de 2019, que estabelece as normas para a promoção da acessibilidade de pessoas com mobilidade reduzida no Estado de Goiás.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114164', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:114164', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"daniel-vilela-go-lote-a-20260506","coverage_id":"daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":114164,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/114164","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114164","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/7161","signatario_verificado_por":"conteudo_sem_formatacao_full_text"}'::jsonb),
    (114163::int, '24.255', 2026::int, DATE '2026-04-29', 'Institui, no Estado de Goiás, a Rota Gastronômica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114163', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:114163', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"daniel-vilela-go-lote-a-20260506","coverage_id":"daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":114163,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/114163","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114163","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/7161","signatario_verificado_por":"conteudo_sem_formatacao_full_text"}'::jsonb),
    (114161::int, '24.254', 2026::int, DATE '2026-04-29', 'Institui a Política Estadual de Incentivo à Música.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114161', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:114161', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"daniel-vilela-go-lote-a-20260506","coverage_id":"daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":114161,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/114161","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114161","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/7161","signatario_verificado_por":"conteudo_sem_formatacao_full_text"}'::jsonb),
    (114160::int, '24.253', 2026::int, DATE '2026-04-29', 'Reconhece o bem que especifica como patrimônio cultural imaterial goiano e dá outras providências.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114160', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:114160', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"daniel-vilela-go-lote-a-20260506","coverage_id":"daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":114160,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/114160","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114160","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/7161","signatario_verificado_por":"conteudo_sem_formatacao_full_text"}'::jsonb),
    (114159::int, '24.252', 2026::int, DATE '2026-04-29', 'Dispõe sobre o reconhecimento do bem que especifica como patrimônio histórico e cultural goiano e dá outras providências.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114159', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:114159', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"daniel-vilela-go-lote-a-20260506","coverage_id":"daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":114159,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/114159","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114159","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/7161","signatario_verificado_por":"conteudo_sem_formatacao_full_text"}'::jsonb),
    (114157::int, '24.251', 2026::int, DATE '2026-04-29', 'Estabelece regras para a confecção de carimbos de profissionais da área da saúde e dá outras providências.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114157', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:114157', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"daniel-vilela-go-lote-a-20260506","coverage_id":"daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":114157,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/114157","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114157","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/7161","signatario_verificado_por":"conteudo_sem_formatacao_full_text"}'::jsonb),
    (114156::int, '24.250', 2026::int, DATE '2026-04-29', 'Altera a Lei nº 13.463, de 31 de maio de 1999, que dispõe sobre a Política Estadual da Pessoa Idosa e dá outras providências; e nº 18.338, de 30 de dezembro de 2013, que dispõe sobre a criação de Delegacias Especializadas no Atendimento ao Idoso – DEAI –, e dá outras providências.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114156', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:114156', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"daniel-vilela-go-lote-a-20260506","coverage_id":"daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":114156,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/114156","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114156","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/7161","signatario_verificado_por":"conteudo_sem_formatacao_full_text"}'::jsonb),
    (114155::int, '24.249', 2026::int, DATE '2026-04-29', 'Dispõe sobre o reconhecimento do bem que especifica como patrimônio histórico e cultural goiano.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114155', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:114155', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"daniel-vilela-go-lote-a-20260506","coverage_id":"daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":114155,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/114155","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114155","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/7161","signatario_verificado_por":"conteudo_sem_formatacao_full_text"}'::jsonb),
    (114154::int, '24.248', 2026::int, DATE '2026-04-29', 'Dispõe sobre o reconhecimento do bem que especifica como patrimônio cultural imaterial goiano e dá outras providências.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114154', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:114154', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"daniel-vilela-go-lote-a-20260506","coverage_id":"daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":114154,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/114154","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114154","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/7161","signatario_verificado_por":"conteudo_sem_formatacao_full_text"}'::jsonb),
    (114153::int, '24.247', 2026::int, DATE '2026-04-29', 'Define deficiência auditiva e estabelece valor referencial da limitação auditiva no âmbito do Estado de Goiás e dá outras providências. ', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114153', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:114153', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"daniel-vilela-go-lote-a-20260506","coverage_id":"daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":114153,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/114153","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114153","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/7161","signatario_verificado_por":"conteudo_sem_formatacao_full_text"}'::jsonb),
    (114151::int, '24.246', 2026::int, DATE '2026-04-28', 'Concede o título de cidadania que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114151', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:114151', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"daniel-vilela-go-lote-a-20260506","coverage_id":"daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":114151,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/114151","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/114151","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/7160","signatario_verificado_por":"conteudo_sem_formatacao_full_text"}'::jsonb)
)
INSERT INTO legislacao_mandato_executivo (
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  municipio_norma,
  tipo_norma,
  numero,
  ano,
  data_norma,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  fonte_tramitacao_url,
  identificador_fonte,
  metadata
)
SELECT
  c.id,
  hp.id,
  'lei_sancionada',
  'estadual',
  'GO',
  NULL,
  'lei',
  s.numero,
  s.ano,
  s.data_norma,
  s.ementa,
  'DANIEL VILELA',
  'titular',
  s.fonte_primaria_url,
  s.fonte_primaria_titulo,
  s.fonte_tramitacao_url,
  s.identificador_fonte,
  s.metadata
FROM seed_rows s
CROSS JOIN candidatos c
JOIN historico_politico hp
  ON hp.candidato_id = c.id
 AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
 AND hp.cargo_canonico = 'Governador'
 AND upper(coalesce(hp.estado, '')) = 'GO'
 AND coalesce(hp.periodo_inicio, 9999) <= s.ano
 AND coalesce(hp.periodo_fim, 9999) >= s.ano
WHERE c.slug = 'daniel-vilela'
  AND NOT EXISTS (
    SELECT 1 FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.identificador_fonte = s.identificador_fonte
  );

DO $$
DECLARE
  v_candidato_id uuid;
  v_total integer;
  v_scope integer;
  v_projetos integer;
BEGIN
  SELECT id INTO v_candidato_id FROM candidatos WHERE slug = 'daniel-vilela';
  IF v_candidato_id IS NULL THEN
    RAISE NOTICE 'daniel-vilela: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO v_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id;

  SELECT count(*) INTO v_scope
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id
    AND metadata->>'coverage_id' = 'daniel-vilela-go-legisla-goias-ampliado-parcial-lote-a-20260506'
    AND metadata->>'coverage_scope' = 'go_legisla_goias_leis_ordinarias_signatario_lote_a_20260506'
    AND signatario = 'DANIEL VILELA'
    AND autoridade_papel = 'titular';

  SELECT count(*) INTO v_projetos
  FROM projetos_lei
  WHERE candidato_id = v_candidato_id;

  IF v_total <> 11 THEN
    RAISE EXCEPTION 'Pos-condicao daniel-vilela: esperava 11 rows LME totais, encontrei %', v_total;
  END IF;
  IF v_scope <> 11 THEN
    RAISE EXCEPTION 'Pos-condicao daniel-vilela: esperava 11 rows com coverage/signatario/titular, encontrei %', v_scope;
  END IF;
  IF v_projetos <> 100 THEN
    RAISE EXCEPTION 'Pos-condicao daniel-vilela: projetos_lei deveria permanecer 100, encontrei %', v_projetos;
  END IF;
  RAISE NOTICE 'Pos-apply daniel-vilela GO Legisla Goias Lote A: lme=% coverage=% projetos_lei=%', v_total, v_scope, v_projetos;
END $$;
