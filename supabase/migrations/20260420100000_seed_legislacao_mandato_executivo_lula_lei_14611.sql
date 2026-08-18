-- ============================================
-- Fluxo 5B — Legislação de chefes do Executivo
-- Seed: Lei nº 14.611/2023 (igualdade salarial) para Lula
-- ============================================
-- Dado real federal mínimo versionado no repositório.
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
  '14.611',
  2023,
  DATE '2023-07-03',
  'Institui a igualdade salarial e de critérios remuneratórios entre mulheres e homens para exercício de função equivalente, na mesma empresa ou estabelecimento, e altera a Consolidação das Leis do Trabalho, aprovada pelo Decreto-Lei nº 5.452, de 1º de maio de 1943.',
  'LUIZ INÁCIO LULA DA SILVA',
  'titular',
  'https://www.planalto.gov.br/ccivil_03/_Ato2023-2026/2023/Lei/L14611.htm',
  'Portal da Legislação - Presidência da República',
  '{"source": "Planalto", "data_real": true, "fluxo": "5B"}'::jsonb
FROM candidatos c
WHERE c.slug = 'lula'
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.tipo_relacao = 'lei_sancionada'
      AND lme.tipo_norma = 'lei'
      AND lme.numero = '14.611'
      AND lme.ano = 2023
      AND lme.fonte_primaria_url = 'https://www.planalto.gov.br/ccivil_03/_Ato2023-2026/2023/Lei/L14611.htm'
  );
