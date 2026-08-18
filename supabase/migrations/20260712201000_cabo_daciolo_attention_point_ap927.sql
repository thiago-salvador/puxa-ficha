-- Ponto de atencao editorial aprovado para Cabo Daciolo.
-- A redacao preserva o status exato da AP 927: punibilidade extinta por
-- anistia superveniente, sem condenacao ou absolvição de mérito.
-- Idempotente por candidato_id, categoria e titulo.
BEGIN;

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  'b1104f0b-80fb-4082-8356-dfb374e20028',
  'processo_grave',
  'Ação penal por greve terminou com punibilidade extinta após anistia',
  'Cabo Daciolo respondeu no STF à Ação Penal 927 por sua participação na greve de bombeiros e policiais militares de 2012. Em dezembro de 2017, a Primeira Turma extinguiu a punibilidade porque uma lei posterior concedeu anistia aos grevistas. A decisão não foi condenação nem absolvição de mérito.',
  '[{"url":"https://noticias.stf.jus.br/postsnoticias/1a-turma-extingue-punibilidade-de-cabo-daciolo-por-participacao-em-greve-de-policiais-na-bahia/","data":"2017-12-12","titulo":"STF extingue punibilidade de Cabo Daciolo por participação em greve"},{"url":"https://www.jusbrasil.com.br/noticias/1a-turma-extingue-punibilidade-de-cabo-daciolo-por-participacao-em-greve-de-policiais-na-bahia/531568256","data":"2017-12-12","titulo":"Reprodução do informe do STF sobre a AP 927"}]'::jsonb,
  'baixa',
  true,
  'curadoria',
  true,
  '2017-12-12'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pontos_atencao
  WHERE candidato_id = 'b1104f0b-80fb-4082-8356-dfb374e20028'
    AND categoria = 'processo_grave'
    AND titulo = 'Ação penal por greve terminou com punibilidade extinta após anistia'
);

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.pontos_atencao
  WHERE candidato_id = 'b1104f0b-80fb-4082-8356-dfb374e20028'
    AND categoria = 'processo_grave'
    AND titulo = 'Ação penal por greve terminou com punibilidade extinta após anistia'
    AND gravidade = 'baixa'
    AND verificado = true
    AND gerado_por = 'curadoria'
    AND visivel = true
    AND data_referencia = '2017-12-12';

  IF n <> 1 THEN
    RAISE EXCEPTION 'Cabo Daciolo AP 927: esperado 1 ponto público verificado, encontrado %', n;
  END IF;
END $$;

COMMIT;
