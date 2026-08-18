-- ============================================
-- Fluxo 7 — Expansão federal controlada de legislação do Executivo
-- Seed: Lote piloto federal de leis sancionadas por Lula (2023)
-- ============================================
-- Lote piloto federal com 4 normas reais da Presidência/Lula 2023-atual.
-- Fontes oficiais: Portal da Legislação (Planalto).
-- Não aplicar ao Supabase remoto sem autorização explícita.

-- Lei nº 14.533/2023 - Política Nacional de Educação Digital
INSERT INTO legislacao_mandato_executivo (
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  tipo_norma,
  numero,
  ano,
  data_norma,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  metadata
)
SELECT
  c.id,
  (
    SELECT hp.id
    FROM historico_politico hp
    WHERE hp.candidato_id = c.id
      AND (
        hp.cargo ILIKE '%Presidente%'
        OR hp.cargo_canonico = 'Presidente'
      )
      AND hp.periodo_inicio <= 2023
      AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 2023)
    ORDER BY hp.periodo_inicio DESC
    LIMIT 1
  ),
  'lei_sancionada',
  'federal',
  NULL,
  'lei',
  '14.533',
  2023,
  DATE '2023-01-11',
  'Institui a Politica Nacional de Educacao Digital e altera as Leis nos 9.394, de 20 de dezembro de 1996 (Lei de Diretrizes e Bases da Educacao Nacional), 9.448, de 14 de marco de 1997, 10.260, de 12 de julho de 2001, e 10.753, de 30 de outubro de 2003.',
  'LUIZ INACIO LULA DA SILVA',
  'titular',
  'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14533.htm',
  'Portal da Legislacao - Presidencia da Republica',
  '{"source": "Planalto", "data_real": true, "fluxo": "7", "curadoria_status": "pilot", "created_by": "codex_executor"}'::jsonb
FROM candidatos c
WHERE c.slug = 'lula'
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.tipo_relacao = 'lei_sancionada'
      AND lme.tipo_norma = 'lei'
      AND lme.numero = '14.533'
      AND lme.ano = 2023
      AND lme.fonte_primaria_url = 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14533.htm'
  );
-- Lei nº 14.601/2023 - Programa Bolsa Família
INSERT INTO legislacao_mandato_executivo (
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  tipo_norma,
  numero,
  ano,
  data_norma,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  metadata
)
SELECT
  c.id,
  (
    SELECT hp.id
    FROM historico_politico hp
    WHERE hp.candidato_id = c.id
      AND (
        hp.cargo ILIKE '%Presidente%'
        OR hp.cargo_canonico = 'Presidente'
      )
      AND hp.periodo_inicio <= 2023
      AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 2023)
    ORDER BY hp.periodo_inicio DESC
    LIMIT 1
  ),
  'lei_sancionada',
  'federal',
  NULL,
  'lei',
  '14.601',
  2023,
  DATE '2023-06-19',
  'Institui o Programa Bolsa Familia; altera a Lei no 8.742, de 7 de dezembro de 1993 (Lei Organica da Assistencia Social), a Lei no 10.820, de 17 de dezembro de 2003, a Lei no 10.779, de 25 de novembro de 2003, e a Lei no 14.284, de 29 de dezembro de 2021.',
  'LUIZ INACIO LULA DA SILVA',
  'titular',
  'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14601.htm',
  'Portal da Legislacao - Presidencia da Republica',
  '{"source": "Planalto", "data_real": true, "fluxo": "7", "curadoria_status": "pilot", "created_by": "codex_executor"}'::jsonb
FROM candidatos c
WHERE c.slug = 'lula'
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.tipo_relacao = 'lei_sancionada'
      AND lme.tipo_norma = 'lei'
      AND lme.numero = '14.601'
      AND lme.ano = 2023
      AND lme.fonte_primaria_url = 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14601.htm'
  );
-- Lei nº 14.690/2023 - Desenrola Brasil
INSERT INTO legislacao_mandato_executivo (
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  tipo_norma,
  numero,
  ano,
  data_norma,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  metadata
)
SELECT
  c.id,
  (
    SELECT hp.id
    FROM historico_politico hp
    WHERE hp.candidato_id = c.id
      AND (
        hp.cargo ILIKE '%Presidente%'
        OR hp.cargo_canonico = 'Presidente'
      )
      AND hp.periodo_inicio <= 2023
      AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 2023)
    ORDER BY hp.periodo_inicio DESC
    LIMIT 1
  ),
  'lei_sancionada',
  'federal',
  NULL,
  'lei',
  '14.690',
  2023,
  DATE '2023-10-03',
  'Institui o Programa Emergencial de Renegociacao de Dividas de Pessoas Fisicas Inadimplentes – Desenrola Brasil; estabelece normas para renegociacao de dividas de pessoas fisicas inadimplentes inscritas em cadastros de inadimplentes.',
  'LUIZ INACIO LULA DA SILVA',
  'titular',
  'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14690.htm',
  'Portal da Legislacao - Presidencia da Republica',
  '{"source": "Planalto", "data_real": true, "fluxo": "7", "curadoria_status": "pilot", "created_by": "codex_executor"}'::jsonb
FROM candidatos c
WHERE c.slug = 'lula'
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.tipo_relacao = 'lei_sancionada'
      AND lme.tipo_norma = 'lei'
      AND lme.numero = '14.690'
      AND lme.ano = 2023
      AND lme.fonte_primaria_url = 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14690.htm'
  );
-- Lei nº 14.759/2023 - Dia Nacional de Zumbi e da Consciência Negra
INSERT INTO legislacao_mandato_executivo (
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  tipo_norma,
  numero,
  ano,
  data_norma,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  metadata
)
SELECT
  c.id,
  (
    SELECT hp.id
    FROM historico_politico hp
    WHERE hp.candidato_id = c.id
      AND (
        hp.cargo ILIKE '%Presidente%'
        OR hp.cargo_canonico = 'Presidente'
      )
      AND hp.periodo_inicio <= 2023
      AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 2023)
    ORDER BY hp.periodo_inicio DESC
    LIMIT 1
  ),
  'lei_sancionada',
  'federal',
  NULL,
  'lei',
  '14.759',
  2023,
  DATE '2023-12-21',
  'Declara feriado nacional o dia 20 de novembro, para a celebracao do Dia Nacional de Zumbi e da Consciencia Negra.',
  'LUIZ INACIO LULA DA SILVA',
  'titular',
  'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm',
  'Portal da Legislacao - Presidencia da Republica',
  '{"source": "Planalto", "data_real": true, "fluxo": "7", "curadoria_status": "pilot", "created_by": "codex_executor"}'::jsonb
FROM candidatos c
WHERE c.slug = 'lula'
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.tipo_relacao = 'lei_sancionada'
      AND lme.tipo_norma = 'lei'
      AND lme.numero = '14.759'
      AND lme.ano = 2023
      AND lme.fonte_primaria_url = 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm'
  );
