-- ============================================
-- Fluxo 5B/6 — Legislação de chefes do Executivo
-- Seed: Lei nº 14.628/2023 (Programa de Aquisição de Alimentos) para Lula
-- ============================================
-- Segundo dado real federal versionado no repositório.
-- Não aplicar ao Supabase remoto sem autorização explícita.

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
  fonte_tramitacao_url,
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
  '14.628',
  2023,
  DATE '2023-07-20',
  'Institui o Programa de Aquisição de Alimentos e altera a Lei nº 12.512, de 14 de outubro de 2011, e a Lei nº 14.133, de 1º de abril de 2021.',
  'LUIZ INÁCIO LULA DA SILVA',
  'titular',
  'https://www.planalto.gov.br/ccivil_03/_Ato2023-2026/2023/Lei/L14628.htm',
  'Portal da Legislação - Presidência da República',
  'https://www.planalto.gov.br/CCIVIL_03/Projetos/Ato_2023_2026/2023/PL/pl-2920.htm',
  '{"source": "Planalto", "source_tramitacao": "Planalto Projetos", "data_real": true, "fluxo": "5B/6"}'::jsonb
FROM candidatos c
WHERE c.slug = 'lula'
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.tipo_relacao = 'lei_sancionada'
      AND lme.tipo_norma = 'lei'
      AND lme.numero = '14.628'
      AND lme.ano = 2023
      AND lme.fonte_primaria_url = 'https://www.planalto.gov.br/ccivil_03/_Ato2023-2026/2023/Lei/L14628.htm'
  );
