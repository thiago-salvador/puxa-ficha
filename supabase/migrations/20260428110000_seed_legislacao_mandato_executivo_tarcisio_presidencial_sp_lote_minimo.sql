-- ============================================
-- Fluxo 5B expansao estadual — Legislacao de chefes do Executivo
-- Seed: lote minimo SP para o perfil presidencial de Tarcisio de Freitas.
-- ============================================
-- Nao aplicar ao Supabase remoto sem autorizacao explicita.
-- Escopo: inventario ampliado parcial, sem claim de completude.
-- Fonte primaria oficial: Assembleia Legislativa do Estado de Sao Paulo
--   https://www.al.sp.gov.br

WITH curated_rows AS (
  SELECT *
  FROM (
    VALUES
      (
        'lei_sancionada',
        'estadual',
        'SP',
        'lei',
        '18.025',
        2024,
        DATE '2024-09-09',
        'Dispõe sobre o programa habitacional para policiais civis, policiais militares, policiais técnico-científicos, policiais penais, agentes de segurança penitenciária e agentes de escolta e vigilância penitenciária do Estado de São Paulo.',
        'TARCÍSIO DE FREITAS',
        'titular',
        'https://www.al.sp.gov.br/repositorio/legislacao/lei/2024/lei-18025-09.09.2024.html',
        'Assembleia Legislativa do Estado de São Paulo - Repositório de Legislação',
        '{"source": "ALESP", "data_real": true, "fluxo": "5B", "case_id": "tarcisio-presidencial-sp-lei-18025", "coverage_scope": "inventario_ampliado_parcial_sp_lote_minimo_20260428"}'::jsonb
      ),
      (
        'lei_sancionada',
        'estadual',
        'SP',
        'lei',
        '17.784',
        2023,
        DATE '2023-10-02',
        'Altera a Lei nº 6.374, de 1º de março de 1989, que dispõe sobre a instituição do Imposto sobre Operações Relativas à Circulação de Mercadorias e sobre Prestação de Serviços de Transporte Interestadual e Intermunicipal e de Comunicação - ICMS.',
        'TARCÍSIO DE FREITAS',
        'titular',
        'https://www.al.sp.gov.br/repositorio/legislacao/lei/2023/lei-17784-02.10.2023.html',
        'Assembleia Legislativa do Estado de São Paulo - Repositório de Legislação',
        '{"source": "ALESP", "data_real": true, "fluxo": "5B", "case_id": "tarcisio-presidencial-sp-lei-17784", "coverage_scope": "inventario_ampliado_parcial_sp_lote_minimo_20260428"}'::jsonb
      ),
      (
        'lei_sancionada',
        'estadual',
        'SP',
        'lei complementar',
        '1.387',
        2023,
        DATE '2023-07-03',
        'Dispõe sobre a concessão de abono complementar aos servidores, na forma que especifica.',
        'TARCÍSIO DE FREITAS',
        'titular',
        'https://www.al.sp.gov.br/repositorio/legislacao/lei.complementar/2023/original-lei.complementar-1387-03.07.2023.html',
        'Assembleia Legislativa do Estado de São Paulo - Repositório de Legislação',
        '{"source": "ALESP", "data_real": true, "fluxo": "5B", "case_id": "tarcisio-presidencial-sp-lc-1387", "coverage_scope": "inventario_ampliado_parcial_sp_lote_minimo_20260428"}'::jsonb
      )
  ) AS row_data (
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
)
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
      AND (
        UPPER(COALESCE(hp.estado, '')) = r.uf_norma
        OR hp.cargo ILIKE '%São Paulo%'
        OR hp.cargo ILIKE '%Sao Paulo%'
      )
      AND (hp.periodo_inicio IS NULL OR hp.periodo_inicio <= r.ano)
      AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= r.ano)
    ORDER BY
      CASE WHEN UPPER(COALESCE(hp.estado, '')) = r.uf_norma THEN 0 ELSE 1 END,
      hp.periodo_inicio DESC NULLS LAST
    LIMIT 1
  ),
  r.tipo_relacao,
  r.esfera,
  r.uf_norma,
  r.tipo_norma,
  r.numero,
  r.ano,
  r.data_norma,
  r.ementa,
  r.signatario,
  r.autoridade_papel,
  r.fonte_primaria_url,
  r.fonte_primaria_titulo,
  r.metadata
FROM candidatos c
CROSS JOIN curated_rows r
WHERE c.slug = 'tarcisio'
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.tipo_relacao = r.tipo_relacao
      AND lme.tipo_norma = r.tipo_norma
      AND lme.numero = r.numero
      AND lme.ano = r.ano
      AND lme.fonte_primaria_url = r.fonte_primaria_url
  );
