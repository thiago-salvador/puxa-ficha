-- PR Governador: saneamento de proveniencia, identidades, dinheiro TSE e falsos positivos publicos.
-- Fontes: TSE Dados Abertos, Camara dos Deputados, Senado Federal, ALEP e STF.

BEGIN;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.candidatos
    WHERE slug IN (
      'luiz-franca',
      'rafael-greca',
      'requiao-filho',
      'sandro-alex',
      'sergio-moro-gov-pr',
      'tony-garcia'
    )
      AND publicavel = true
  ) <> 6 THEN
    RAISE EXCEPTION 'PR Governador: coorte publica esperada nao encontrada';
  END IF;
END $$;

-- Corrige codigos crus/ausencias de perfil com dados oficiais TSE.
UPDATE public.candidatos
SET
  formacao = 'Superior completo',
  profissao_declarada = 'Engenheiro',
  fonte_dados = ARRAY['TSE', 'curadoria'],
  ultima_atualizacao = NOW()
WHERE slug = 'rafael-greca';

UPDATE public.candidatos
SET
  data_nascimento = '1953-04-23',
  naturalidade = 'Sao Paulo/SP',
  formacao = 'Superior incompleto',
  profissao_declarada = 'Empresario',
  fonte_dados = ARRAY['TSE', 'curadoria'],
  ultima_atualizacao = NOW()
WHERE slug = 'tony-garcia';

-- O SQ 130000743230 e de Jarbas Soares (vice-prefeito em Tres Marias/MG),
-- nao de Luiz Franca. Remove a linha de patrimonio criada pelo falso pareamento.
DELETE FROM public.patrimonio p
USING public.candidatos c
WHERE p.candidato_id = c.id
  AND c.slug = 'luiz-franca'
  AND p.ano_eleicao = 2020;

DELETE FROM public.financiamento f
USING public.candidatos c
WHERE f.candidato_id = c.id
  AND c.slug = 'luiz-franca'
  AND f.ano_eleicao = 2020;

CREATE TEMP TABLE _pr_historico ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      'luiz-franca', 'candidatura', 'Pre-candidato a Governador do Parana',
      'Governador', 'PR', 2026, NULL::integer, 'MISSAO', NULL::text,
      'Pre-candidatura pelo Partido Missao documentada pela Band Parana em 03/07/2026: https://www.band.com.br/band-parana/noticias/pre-candidato-luiz-franca-e-o-entrevistado-do-band-entrevista-deste-sabado-202607031616. A varredura TSE consulta_cand 2008-2024 nao encontrou Luiz Felipe Franca; os SQs antigos do seed eram homonimos.',
      'manual'
    ),
    (
      'sandro-alex', 'mandato', 'Deputado Federal', 'Deputado Federal', 'PR',
      2011, 2015, 'PPS', 'voto direto',
      'Eleito deputado federal pelo Parana em 2010, SQ 160000000600, resultado ELEITO no TSE.',
      'tse'
    ),
    (
      'sandro-alex', 'mandato', 'Deputado Federal', 'Deputado Federal', 'PR',
      2015, 2019, 'PPS', 'voto direto',
      'Reeleito deputado federal pelo Parana em 2014, SQ 160000000207, resultado ELEITO POR QP no TSE.',
      'tse'
    ),
    (
      'sandro-alex', 'mandato', 'Deputado Federal', 'Deputado Federal', 'PR',
      2019, 2023, 'PSD', 'voto direto',
      'Reeleito deputado federal pelo Parana em 2018, SQ 160000619719, resultado ELEITO POR QP no TSE.',
      'tse'
    ),
    (
      'sandro-alex', 'mandato', 'Deputado Federal', 'Deputado Federal', 'PR',
      2023, 2027, 'PSD', 'voto direto',
      'Reeleito deputado federal pelo Parana em 2022, SQ 160001622302, resultado ELEITO POR QP no TSE; Camara Dados Abertos ID 160621 em exercicio.',
      'misto'
    ),
    (
      'tony-garcia', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador',
      'PR', 1994, 1994, 'PRN', 'nao eleito',
      'Consulta_cand TSE 1994: Antonio Celso Garcia, senador pelo PRN no Parana, SQ 16050036209348, resultado NAO ELEITO.',
      'tse'
    )
) AS v(
  slug, tipo_evento, cargo, cargo_canonico, estado, periodo_inicio, periodo_fim,
  partido, eleito_por, observacoes, proveniencia
);

INSERT INTO public.historico_politico (
  candidato_id, tipo_evento, cargo, cargo_canonico, estado, periodo_inicio,
  periodo_fim, partido, eleito_por, observacoes, proveniencia
)
SELECT
  c.id, h.tipo_evento, h.cargo, h.cargo_canonico, h.estado, h.periodo_inicio,
  h.periodo_fim, h.partido, h.eleito_por, h.observacoes, h.proveniencia
FROM _pr_historico h
JOIN public.candidatos c ON c.slug = h.slug
ON CONFLICT (candidato_id, cargo_canonico, periodo_inicio)
WHERE periodo_inicio IS NOT NULL AND cargo_canonico IS NOT NULL
DO UPDATE SET
  tipo_evento = EXCLUDED.tipo_evento,
  cargo = EXCLUDED.cargo,
  estado = EXCLUDED.estado,
  periodo_fim = EXCLUDED.periodo_fim,
  partido = EXCLUDED.partido,
  eleito_por = EXCLUDED.eleito_por,
  observacoes = EXCLUDED.observacoes,
  proveniencia = EXCLUDED.proveniencia;

UPDATE public.historico_politico hp
SET proveniencia = 'tse'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('rafael-greca', 'requiao-filho', 'sergio-moro-gov-pr')
  AND hp.proveniencia IS NULL
  AND hp.observacoes ILIKE '%TSE%';

-- Normaliza a trajetoria de Sergio Moro: eleicao em 2022 e mandato 2023-2031.
DELETE FROM public.historico_politico hp
USING public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug = 'sergio-moro-gov-pr'
  AND hp.periodo_inicio = 2026
  AND hp.cargo = 'Senador';

UPDATE public.historico_politico hp
SET
  tipo_evento = 'candidatura',
  cargo = 'Candidatura a Senador',
  cargo_canonico = 'Candidatura a Senador',
  periodo_fim = 2022,
  partido = 'UNIAO',
  observacoes = 'Eleito senador pelo Parana em 2022, SQ 160001621846, pelo Uniao Brasil; resultado oficial TSE.',
  proveniencia = 'tse'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug = 'sergio-moro-gov-pr'
  AND hp.periodo_inicio = 2022;

UPDATE public.historico_politico hp
SET
  tipo_evento = 'mandato',
  cargo = 'Senador',
  cargo_canonico = 'Senador',
  estado = 'PR',
  periodo_fim = 2031,
  partido = 'UNIAO',
  eleito_por = 'voto direto',
  observacoes = 'Mandato de senador pelo Parana iniciado em 2023; perfil oficial Senado ID 6331. Filiacao atual ao PL registrada na timeline partidaria.',
  proveniencia = 'misto'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug = 'sergio-moro-gov-pr'
  AND hp.periodo_inicio = 2023;

-- Remove dados parlamentares impossiveis de Rafael Greca apos o fim do mandato federal.
-- A API oficial da Camara retorna exatamente 16 proposicoes (2000/2002) e nenhuma despesa 2022-2025.
DELETE FROM public.projetos_lei p
USING public.candidatos c
WHERE p.candidato_id = c.id
  AND c.slug = 'rafael-greca'
  AND p.coverage_id IS NULL;

DELETE FROM public.votos_candidato v
USING public.candidatos c
WHERE v.candidato_id = c.id
  AND c.slug = 'rafael-greca';

DELETE FROM public.gastos_parlamentares g
USING public.candidatos c
WHERE g.candidato_id = c.id
  AND c.slug = 'rafael-greca';

-- Remove uma votacao do Senado que descrevia Renan Filho, mas estava vinculada a Sergio Moro.
DELETE FROM public.votos_candidato v
USING public.candidatos c
WHERE v.candidato_id = c.id
  AND c.slug = 'sergio-moro-gov-pr'
  AND v.votacao_id = 'baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6';

-- Pontos IA contraditorios ficam ocultos; o ponto juridico de Moro passa a usar fonte oficial STF.
UPDATE public.pontos_atencao pa
SET
  visivel = false,
  verificado = false,
  descricao = pa.descricao || ' [Oculto em 2026-07-09: ponto gerado por IA contradizia o historico oficial.]'
FROM public.candidatos c
WHERE pa.candidato_id = c.id
  AND c.slug IN ('rafael-greca', 'requiao-filho', 'sergio-moro-gov-pr')
  AND pa.gerado_por = 'ia'
  AND pa.verificado = false
  AND pa.visivel = true;

UPDATE public.pontos_atencao pa
SET
  titulo = 'Reu no STF por suposta calunia contra Gilmar Mendes; sem condenacao informada',
  descricao = 'A Primeira Turma do STF recebeu em 4 de junho de 2024 denuncia contra Sergio Moro por suposta calunia contra o ministro Gilmar Mendes. O recebimento da denuncia abriu a acao penal e nao equivale a condenacao.',
  fontes = '[{"url":"https://noticias.stf.jus.br/postsnoticias/stf-recebe-denuncia-contra-sergio-moro-pelo-crime-de-calunia/","data":"2024-06-04","titulo":"STF recebe denuncia contra Sergio Moro pelo crime de calunia"}]'::jsonb,
  verificado = true,
  gerado_por = 'curadoria',
  visivel = true,
  data_referencia = '2024-06-04'
FROM public.candidatos c
WHERE pa.candidato_id = c.id
  AND c.slug = 'sergio-moro-gov-pr'
  AND pa.categoria = 'processo_grave';

-- Dinheiro TSE de Sandro Alex, materializado pelo ingest oficial direcionado.
CREATE TEMP TABLE _pr_sandro_patrimonio ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (2010, 318475.58::numeric, '[{"tipo":"Joias e objetos de colecao","valor":13173,"descricao":"Tres relogios declarados"},{"tipo":"Quotas ou quinhoes de capital","valor":87500,"descricao":"Empresas e franquia declaradas"},{"tipo":"Veiculos e consorcio","valor":162015.92,"descricao":"Veiculos e consorcio declarados"},{"tipo":"Outros bens e direitos","valor":55786.66,"descricao":"Demais bens declarados"}]'::jsonb),
    (2014, 717504.76::numeric, '[{"tipo":"Casa","valor":429503.81,"descricao":"50% de construcao residencial"},{"tipo":"Veiculo automotor","valor":178000,"descricao":"Toyota Hilux SW4"},{"tipo":"Quotas e franquia","valor":85000,"descricao":"Quotas empresariais e franquia"},{"tipo":"Outros bens e direitos","valor":25000.95,"descricao":"Contas, titulos e relogios"}]'::jsonb),
    (2018, 965534.25::numeric, '[{"tipo":"Casa","valor":677650.25,"descricao":"Imovel declarado"},{"tipo":"Veiculo automotor","valor":178000,"descricao":"Veiculo declarado"},{"tipo":"Quotas e franquia","valor":75000,"descricao":"Participacao declarada"},{"tipo":"Outros bens e direitos","valor":34884,"descricao":"Contas, titulo e relogios"}]'::jsonb),
    (2022, 1287328.91::numeric, '[{"tipo":"Casa","valor":854240.69,"descricao":"50% de uma casa"},{"tipo":"Predio comercial","valor":75000,"descricao":"50% de unidade hoteleira"},{"tipo":"Veiculo automotor","valor":253000,"descricao":"Veiculo declarado"},{"tipo":"Outros bens e direitos","valor":105088.22,"descricao":"Franquia, quotas, contas, relogios e titulo"}]'::jsonb)
) AS v(ano_eleicao, valor_total, bens);

DELETE FROM public.patrimonio p
USING public.candidatos c
WHERE p.candidato_id = c.id
  AND c.slug = 'sandro-alex'
  AND p.ano_eleicao IN (2010, 2014, 2018, 2022);

INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, p.ano_eleicao, p.valor_total, p.bens, 'TSE'
FROM _pr_sandro_patrimonio p
JOIN public.candidatos c ON c.slug = 'sandro-alex';

CREATE TEMP TABLE _pr_sandro_financiamento ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (2010, 238200::numeric, '[{"nome":"MERCADOMOVEIS LTDA","tipo":"PJ","valor":26000},{"nome":"JACOB BRENNER DE BARROS","tipo":"PF","valor":20000},{"nome":"CARLOS ALBERTO RICHA","tipo":"PJ","valor":15700},{"nome":"SANDRO ALEX CRUZ DE OLIVEIRA","tipo":"PF","valor":15320},{"nome":"DANILO PORTHOS SCHRUT","tipo":"PF","valor":15000}]'::jsonb),
    (2014, 847828.13::numeric, '[{"nome":"Direcao Nacional","tipo":"PJ","valor":150000},{"nome":"CONDOR SUPER CENTER LTDA","tipo":"PJ","valor":95000},{"nome":"ITAU - UNIBANCO S/A","tipo":"PJ","valor":50000},{"nome":"JOSUE CORREA FERNANDES","tipo":"PF","valor":50000},{"nome":"Direcao Estadual/Distrital","tipo":"PJ","valor":49992.2}]'::jsonb),
    (2018, 1336875::numeric, '[{"nome":"Direcao Estadual/Distrital","tipo":"PJ","valor":1128000},{"nome":"SANDRO ALEX CRUZ DE OLIVEIRA","tipo":"PF","valor":108750},{"nome":"DOUGLAS FANCHIN TAQUES FONSECA","tipo":"PF","valor":40125},{"nome":"ORIOVISTO GUIMARAES","tipo":"PF","valor":25000},{"nome":"ODACIR ANTONELLI","tipo":"PF","valor":20000}]'::jsonb),
    (2022, 2358630::numeric, '[{"nome":"Direcao Estadual/Distrital","tipo":"PJ","valor":1720000},{"nome":"SANDRO ALEX CRUZ DE OLIVEIRA","tipo":"PF","valor":267000},{"nome":"ODACIR ANTONELLI","tipo":"PF","valor":200000},{"nome":"BARBARA DE BARROS","tipo":"PF","valor":40000},{"nome":"LUIZ RENATO DURSKI JUNIOR","tipo":"PF","valor":30000}]'::jsonb)
) AS v(ano_eleicao, total_arrecadado, maiores_doadores);

DELETE FROM public.financiamento f
USING public.candidatos c
WHERE f.candidato_id = c.id
  AND c.slug = 'sandro-alex'
  AND f.ano_eleicao IN (2010, 2014, 2018, 2022);

INSERT INTO public.financiamento (
  candidato_id, ano_eleicao, total_arrecadado, total_fundo_partidario,
  total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios,
  maiores_doadores, fonte
)
SELECT
  c.id, f.ano_eleicao, f.total_arrecadado, 0, 0, 0, 0,
  f.maiores_doadores, 'TSE'
FROM _pr_sandro_financiamento f
JOIN public.candidatos c ON c.slug = 'sandro-alex';

-- Despesa parlamentar 2026: inventario integral de 24 documentos na API oficial da Camara.
DELETE FROM public.gastos_parlamentares g
USING public.candidatos c
WHERE g.candidato_id = c.id
  AND c.slug = 'sandro-alex'
  AND g.ano = 2026;

INSERT INTO public.gastos_parlamentares (
  candidato_id, ano, total_gasto, detalhamento, gastos_destaque, fonte
)
SELECT
  c.id,
  2026,
  25758.79,
  '[{"categoria":"MANUTENCAO DE ESCRITORIO DE APOIO A ATIVIDADE PARLAMENTAR","valor":1560},{"categoria":"COMBUSTIVEIS E LUBRIFICANTES","valor":997.61},{"categoria":"HOSPEDAGEM","valor":4057.68},{"categoria":"LOCACAO OU FRETAMENTO DE VEICULOS AUTOMOTORES","valor":17046},{"categoria":"PASSAGEM AEREA - SIGEPA","valor":2097.5}]'::jsonb,
  '[{"categoria":"LOCACAO OU FRETAMENTO DE VEICULOS AUTOMOTORES","fornecedor":"JEED LOCADORA DE VEICULOS LTDA","valor":9470},{"categoria":"LOCACAO OU FRETAMENTO DE VEICULOS AUTOMOTORES","fornecedor":"JEED LOCADORA DE VEICULOS LTDA","valor":7576},{"categoria":"PASSAGEM AEREA - SIGEPA","fornecedor":"LATAM Airlines Brasil","valor":2067.11}]'::jsonb,
  'Camara'
FROM public.candidatos c
WHERE c.slug = 'sandro-alex';

DO $$
DECLARE
  null_history_rows integer;
  visible_unverified_ai_points integer;
  rafael_projects integer;
  rafael_false_rows integer;
  sandro_money integer;
BEGIN
  SELECT count(*) INTO null_history_rows
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug IN (
    'luiz-franca', 'rafael-greca', 'requiao-filho',
    'sandro-alex', 'sergio-moro-gov-pr', 'tony-garcia'
  )
    AND hp.proveniencia IS NULL;

  SELECT count(*) INTO visible_unverified_ai_points
  FROM public.pontos_atencao pa
  JOIN public.candidatos c ON c.id = pa.candidato_id
  WHERE c.slug IN (
    'luiz-franca', 'rafael-greca', 'requiao-filho',
    'sandro-alex', 'sergio-moro-gov-pr', 'tony-garcia'
  )
    AND pa.gerado_por = 'ia'
    AND pa.verificado = false
    AND pa.visivel = true;

  SELECT count(*) INTO rafael_projects
  FROM public.projetos_lei p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE c.slug = 'rafael-greca';

  SELECT
    (SELECT count(*) FROM public.votos_candidato v JOIN public.candidatos c ON c.id = v.candidato_id WHERE c.slug = 'rafael-greca')
    +
    (SELECT count(*) FROM public.gastos_parlamentares g JOIN public.candidatos c ON c.id = g.candidato_id WHERE c.slug = 'rafael-greca')
  INTO rafael_false_rows;

  SELECT
    (SELECT count(*) FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id WHERE c.slug = 'sandro-alex' AND p.ano_eleicao IN (2010, 2014, 2018, 2022))
    +
    (SELECT count(*) FROM public.financiamento f JOIN public.candidatos c ON c.id = f.candidato_id WHERE c.slug = 'sandro-alex' AND f.ano_eleicao IN (2010, 2014, 2018, 2022))
  INTO sandro_money;

  IF null_history_rows > 0 THEN
    RAISE EXCEPTION 'PR Governador: historico com proveniencia nula: %', null_history_rows;
  END IF;
  IF visible_unverified_ai_points > 0 THEN
    RAISE EXCEPTION 'PR Governador: pontos IA visiveis sem verificacao: %', visible_unverified_ai_points;
  END IF;
  IF rafael_projects <> 16 THEN
    RAISE EXCEPTION 'Rafael Greca: inventario Camara esperado 16, encontrado %', rafael_projects;
  END IF;
  IF rafael_false_rows <> 0 THEN
    RAISE EXCEPTION 'Rafael Greca: votos/gastos falsos remanescentes: %', rafael_false_rows;
  END IF;
  IF sandro_money <> 8 THEN
    RAISE EXCEPTION 'Sandro Alex: cobertura TSE esperada 8, encontrada %', sandro_money;
  END IF;
END $$;

COMMIT;
