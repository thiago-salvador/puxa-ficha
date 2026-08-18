-- ============================================
-- Fluxo 5B — Canonização do lote federal Lula
-- Correção factual do lote remoto recuperado (Leis nº 14.533, 14.601, 14.690 e 14.759)
-- ============================================
-- Corrige ementa/signatário/metadata das quatro rows federais já existentes
-- para alinhá-las ao texto oficial do Planalto e removê-las do estado "pilot".
-- Não aplicar ao Supabase remoto sem autorização explícita.

WITH canonical_rows AS (
  SELECT *
  FROM (
    VALUES
      (
        '14.533',
        2023,
        'Institui a Política Nacional de Educação Digital e altera as Leis nºs 9.394, de 20 de dezembro de 1996 (Lei de Diretrizes e Bases da Educação Nacional), 9.448, de 14 de março de 1997, 10.260, de 12 de julho de 2001, e 10.753, de 30 de outubro de 2003.',
        'https://www.planalto.gov.br/ccivil_03/_Ato2023-2026/2023/Lei/L14533.htm',
        '{"source": "Planalto", "data_real": true, "fluxo": "5B"}'::jsonb
      ),
      (
        '14.601',
        2023,
        'Institui o Programa Bolsa Família; altera a Lei nº 8.742, de 7 de dezembro de 1993 (Lei Orgânica da Assistência Social), a Lei nº 10.820, de 17 de dezembro de 2003, que dispõe sobre a autorização para desconto em folha de pagamento, e a Lei nº 10.779, de 25 de novembro de 2003; e revoga dispositivos das Leis nºs 14.284, de 29 de dezembro de 2021, e 14.342, de 18 de maio de 2022, e a Medida Provisória nº 1.155, de 1º de janeiro de 2023.',
        'https://www.planalto.gov.br/ccivil_03/_Ato2023-2026/2023/Lei/L14601.htm',
        '{"source": "Planalto", "data_real": true, "fluxo": "5B"}'::jsonb
      ),
      (
        '14.690',
        2023,
        'Institui o Programa Emergencial de Renegociação de Dívidas de Pessoas Físicas Inadimplentes – Desenrola Brasil; estabelece normas para facilitação de acesso a crédito e mitigação de riscos de inadimplemento e de superendividamento de pessoas físicas; altera a Consolidação das Leis do Trabalho, aprovada pelo Decreto-Lei nº 5.452, de 1º de maio de 1943, e as Leis nºs 10.406, de 10 de janeiro de 2002 (Código Civil), 10.522, de 19 de julho de 2002 e 12.087, de 11 de novembro de 2009; e revoga dispositivo da Lei nº 4.737, de 15 de julho de 1965 (Código Eleitoral), e a Medida Provisória nº 1.176, de 5 de junho de 2023.',
        'https://www.planalto.gov.br/ccivil_03/_Ato2023-2026/2023/Lei/L14690.htm',
        '{"source": "Planalto", "data_real": true, "fluxo": "5B"}'::jsonb
      ),
      (
        '14.759',
        2023,
        'Declara feriado nacional o Dia Nacional de Zumbi e da Consciência Negra.',
        'https://www.planalto.gov.br/ccivil_03/_Ato2023-2026/2023/Lei/L14759.htm',
        '{"source": "Planalto", "data_real": true, "fluxo": "5B"}'::jsonb
      )
  ) AS v(numero, ano, ementa, fonte_primaria_url, metadata)
)
UPDATE legislacao_mandato_executivo lme
SET
  ementa = canonical_rows.ementa,
  signatario = 'LUIZ INÁCIO LULA DA SILVA',
  autoridade_papel = 'titular',
  fonte_primaria_url = canonical_rows.fonte_primaria_url,
  fonte_primaria_titulo = 'Portal da Legislação - Presidência da República',
  metadata = canonical_rows.metadata
FROM canonical_rows
JOIN candidatos c
  ON c.slug = 'lula'
WHERE lme.candidato_id = c.id
  AND lme.tipo_relacao = 'lei_sancionada'
  AND lme.tipo_norma = 'lei'
  AND lme.numero = canonical_rows.numero
  AND lme.ano = canonical_rows.ano;
