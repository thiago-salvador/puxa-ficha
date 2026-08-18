-- Disambiguate non-canonical Senado rows whose title collides with quiz titles.
-- The quiz title contract remains one exact title -> one votacoes_chave row.

UPDATE votacoes_chave
SET titulo = 'Privatização da Eletrobras (Senado)'
WHERE titulo = 'Privatização da Eletrobras'
  AND casa = 'Senado'
  AND proposicao_id = '150041';

UPDATE votacoes_chave
SET titulo = 'Marco Temporal Indigena (Senado)'
WHERE titulo = 'Marco Temporal Indigena'
  AND casa = 'Senado'
  AND proposicao_id = '153517';

CREATE UNIQUE INDEX IF NOT EXISTS votacoes_chave_quiz_titulo_unique
ON votacoes_chave (titulo)
WHERE titulo IN (
  'Reforma Trabalhista',
  'Teto de Gastos (EC 95)',
  'Reforma da Previdência',
  'Privatização da Eletrobras',
  'Orçamento Secreto (Emendas de Relator)',
  'Autonomia do Banco Central',
  'Marco Temporal Indigena',
  'Auxílio Brasil (MP 1.087/2021)'
);
