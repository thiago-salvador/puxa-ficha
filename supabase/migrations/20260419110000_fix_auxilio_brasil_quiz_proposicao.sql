-- Corrige a votação-chave do quiz sobre Auxílio Brasil.
-- Fonte oficial Câmara Dados Abertos:
-- MPV 1061/2021 => idProposicao 2293428.
-- MPV 1087/2021 trata de crédito extraordinário e não instituiu o Auxílio Brasil.

UPDATE votacoes_chave
SET
  titulo = 'Auxílio Brasil (MP 1.061/2021)',
  descricao = 'Medida provisoria que instituiu o Auxilio Brasil no lugar do Bolsa Familia. Usada no quiz como eixo de programas de transferencia de renda.',
  data_votacao = '2021-11-25',
  proposicao_id = '2293428'
WHERE titulo = 'Auxílio Brasil (MP 1.087/2021)'
  AND casa = 'Câmara';

UPDATE votacoes_chave
SET
  data_votacao = COALESCE(data_votacao, '2021-11-25'),
  proposicao_id = COALESCE(NULLIF(TRIM(proposicao_id), ''), '2293428')
WHERE titulo = 'Auxílio Brasil (MP 1.061/2021)'
  AND casa = 'Câmara';

DROP INDEX IF EXISTS votacoes_chave_quiz_titulo_unique;

CREATE UNIQUE INDEX votacoes_chave_quiz_titulo_unique
ON votacoes_chave (titulo)
WHERE titulo IN (
  'Reforma Trabalhista',
  'Teto de Gastos (EC 95)',
  'Reforma da Previdência',
  'Privatização da Eletrobras',
  'Orçamento Secreto (Emendas de Relator)',
  'Autonomia do Banco Central',
  'Marco Temporal Indigena',
  'Auxílio Brasil (MP 1.061/2021)'
);
