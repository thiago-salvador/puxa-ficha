-- ============================================
-- Fluxo 5B expansão estadual — Legislação de chefes do Executivo
-- Seed: Lei estadual nº 17.735/2023 de São Paulo (denominação de Grupamento de
-- Bombeiros em Araçatuba) sancionada pelo governador Tarcísio de Freitas.
-- ============================================
-- Primeiro caso estadual real versionado localmente para `tarcisio-gov-sp`.
-- Não aplicar ao Supabase remoto sem autorização explícita.
-- Fonte primária oficial: Assembleia Legislativa do Estado de São Paulo
--   https://www.al.sp.gov.br/repositorio/legislacao/lei/2023/lei-17735-28.08.2023.html

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
  'SP',
  'lei',
  '17.735',
  2023,
  DATE '2023-08-28',
  'Dá denominação ao Grupamento de Bombeiros que especifica',
  'TARCÍSIO DE FREITAS',
  'titular',
  'https://www.al.sp.gov.br/repositorio/legislacao/lei/2023/lei-17735-28.08.2023.html',
  'Assembleia Legislativa do Estado de São Paulo - Repositório de Legislação',
  '{"source": "ALESP", "data_real": true, "fluxo": "5B", "case_id": "tarcisio-gov-sp-lei-17735"}'::jsonb
FROM candidatos c
WHERE c.slug = 'tarcisio-gov-sp'
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.tipo_relacao = 'lei_sancionada'
      AND lme.tipo_norma = 'lei'
      AND lme.numero = '17.735'
      AND lme.ano = 2023
      AND lme.fonte_primaria_url = 'https://www.al.sp.gov.br/repositorio/legislacao/lei/2023/lei-17735-28.08.2023.html'
  );
