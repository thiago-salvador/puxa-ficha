-- Votacao de referencia para a pergunta q09 do quiz (programas de transferencia de renda).
-- Curadoria: conferir datas e texto com registro oficial da Casa; ajustar votos em votos_candidato via ingest ou SQL dedicado.

INSERT INTO votacoes_chave (titulo, descricao, data_votacao, casa, tema, impacto_popular)
SELECT
  'Auxílio Brasil (MP 1.087/2021)',
  'Medida provisoria que instituiu o Auxilio Brasil no lugar do Bolsa Familia. Usada no quiz como eixo de programas de transferencia de renda.',
  '2021-11-03',
  'Câmara',
  'direitos_sociais',
  'Alterou o desenho do principal programa de transferencia de renda do pais naquele periodo.'
WHERE NOT EXISTS (
  SELECT 1 FROM votacoes_chave WHERE titulo = 'Auxílio Brasil (MP 1.087/2021)'
);
