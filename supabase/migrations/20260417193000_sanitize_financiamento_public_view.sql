-- Migration A: cria view sanitizada financiamento_publico (compatível, pré-deploy)
-- Objetivo: criar superfície pública sanitizada sem quebrar app antigo que ainda lê financiamento bruto
-- Superfície pública: financiamento_publico expõe apenas { nome, valor, tipo } em maiores_doadores
-- Compatibilidade: NÃO revoga SELECT público da tabela bruta financiamento (app antigo continua funcionando)
-- Data: 2026-04-17
-- Ordem: aplicar ANTES de deploy do app que usa financiamento_publico

-- Criar view sanitizada financiamento_publico
CREATE OR REPLACE VIEW financiamento_publico AS
SELECT
  f.id,
  f.candidato_id,
  f.ano_eleicao,
  f.total_arrecadado,
  f.total_fundo_partidario,
  f.total_fundo_eleitoral,
  f.total_pessoa_fisica,
  f.total_recursos_proprios,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'nome', elem.value ->> 'nome',
        'valor', elem.value ->> 'valor',
        'tipo', elem.value ->> 'tipo'
      )
      ORDER BY (elem.value ->> 'valor')::numeric DESC NULLS LAST
    ),
    '[]'::jsonb
  ) AS maiores_doadores,
  f.fonte,
  f.created_at
FROM (
  SELECT
    f.id,
    f.candidato_id,
    f.ano_eleicao,
    f.total_arrecadado,
    f.total_fundo_partidario,
    f.total_fundo_eleitoral,
    f.total_pessoa_fisica,
    f.total_recursos_proprios,
    f.maiores_doadores,
    f.fonte,
    f.created_at
  FROM financiamento f
  WHERE is_public_candidate(f.candidato_id)
) f
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.maiores_doadores, '[]'::jsonb)) AS elem(value)
GROUP BY
  f.id,
  f.candidato_id,
  f.ano_eleicao,
  f.total_arrecadado,
  f.total_fundo_partidario,
  f.total_fundo_eleitoral,
  f.total_pessoa_fisica,
  f.total_recursos_proprios,
  f.fonte,
  f.created_at;

-- Conceder SELECT público na view sanitizada (tabela bruta ainda acessível para compatibilidade)
GRANT SELECT ON financiamento_publico TO anon, authenticated;
