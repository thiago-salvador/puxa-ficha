-- ============================================
-- Fluxo 5B expansão factual RS — Legislação de chefes do Executivo
-- Seed: Lei estadual nº 16.006/2023 do Rio Grande do Sul (SUAS)
-- sancionada pelo governador Eduardo Leite.
-- ============================================
-- Primeiro caso estadual real versionado localmente para `eduardo-leite`
-- em `legislacao_mandato_executivo`.
-- Não aplicar ao Supabase remoto sem autorização explícita.
-- Fonte primária oficial: Portal do Estado do Rio Grande do Sul - Atos do Governador/DOE
--   https://www.estado.rs.gov.br/upload/arquivos/lei-do-suas-out23.pdf

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
        hp.cargo ILIKE '%Governador%'
        OR hp.cargo_canonico = 'Governador'
      )
      AND hp.periodo_inicio <= 2023
      AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 2023)
    ORDER BY hp.periodo_inicio DESC
    LIMIT 1
  ),
  'lei_sancionada',
  'estadual',
  'RS',
  'lei',
  '16.006',
  2023,
  DATE '2023-10-25',
  'Dispõe sobre o Sistema Único de Assistência Social - SUAS - no Estado do Rio Grande do Sul e altera a Lei nº 10.719, de 17 de janeiro de 1996, que cria o Fundo Estadual de Assistência Social.',
  'EDUARDO LEITE',
  'titular',
  'https://www.estado.rs.gov.br/upload/arquivos/lei-do-suas-out23.pdf',
  'Portal do Estado do Rio Grande do Sul - Atos do Governador/DOE',
  '{"source": "Portal RS/DOE", "data_real": true, "fluxo": "5B", "case_id": "eduardo-leite-rs-lei-16006"}'::jsonb
FROM candidatos c
WHERE c.slug = 'eduardo-leite'
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.tipo_relacao = 'lei_sancionada'
      AND lme.tipo_norma = 'lei'
      AND lme.numero = '16.006'
      AND lme.ano = 2023
      AND lme.fonte_primaria_url = 'https://www.estado.rs.gov.br/upload/arquivos/lei-do-suas-out23.pdf'
  );
