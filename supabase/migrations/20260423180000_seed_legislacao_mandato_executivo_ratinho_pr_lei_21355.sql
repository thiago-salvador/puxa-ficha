-- ============================================
-- Fluxo 5B expansão factual v2 — Legislação de chefes do Executivo
-- Seed: Lei estadual nº 21.355/2023 do Paraná (Serviço Social Autônomo
-- Viaje Paraná) sancionada pelo governador Carlos Massa Ratinho Junior.
-- ============================================
-- Segundo caso estadual real versionado localmente para `legislacao_mandato_executivo`
-- e primeira UF estadual fora de SP.
-- Não aplicar ao Supabase remoto sem autorização explícita.
-- Fonte primária oficial: Sistema Legislação do Estado do Paraná
--   https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=279043&codItemAto=1770781

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
  'PR',
  'lei',
  '21.355',
  2023,
  DATE '2023-01-01',
  'Autoriza o Poder Executivo a instituir o Serviço Social Autônomo Viaje Paraná.',
  'CARLOS MASSA RATINHO JUNIOR',
  'titular',
  'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=279043&codItemAto=1770781',
  'Sistema Legislação do Estado do Paraná',
  '{"source": "Sistema Legislação PR", "data_real": true, "fluxo": "5B", "case_id": "ratinho-junior-pr-lei-21355"}'::jsonb
FROM candidatos c
WHERE c.slug = 'ratinho-junior'
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.tipo_relacao = 'lei_sancionada'
      AND lme.tipo_norma = 'lei'
      AND lme.numero = '21.355'
      AND lme.ano = 2023
      AND lme.fonte_primaria_url = 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=279043&codItemAto=1770781'
  );
