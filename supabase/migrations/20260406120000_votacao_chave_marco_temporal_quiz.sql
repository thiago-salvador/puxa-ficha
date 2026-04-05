-- Oitava votacao mapeada no quiz (pergunta q08, meio ambiente / terras indigenas).
-- Titulo alinhado a scripts/fix-votacoes-ids.ts (proposicao Câmara 345311).
-- Curadoria: conferir data e texto com registro oficial; votos em votos_candidato via ingest.

INSERT INTO votacoes_chave (titulo, descricao, data_votacao, casa, tema, impacto_popular, proposicao_id)
SELECT
  'Marco Temporal Indigena',
  'Tese que condiciona demarcacao de terras indigenas a referencia da Constituicao de 1988; voto nominal no Congresso usado no quiz para alinhar preservacao ambiental x agronegocio.',
  '2023-05-30',
  'Câmara',
  'meio_ambiente',
  'Central em conflitos de titulacao entre territorios tradicionais e expansao agropecuaria.',
  '345311'
WHERE NOT EXISTS (
  SELECT 1 FROM votacoes_chave WHERE titulo = 'Marco Temporal Indigena'
);
