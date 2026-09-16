-- O endpoint de mandatos do Senado é uma fonte própria. A coluna precisa
-- distingui-la de TSE, Wikidata e curadoria manual para não perder a origem
-- quando a prova de exercício vem de `Exercicios.Exercicio`.
ALTER TABLE public.historico_politico
  DROP CONSTRAINT IF EXISTS historico_politico_proveniencia_check;

ALTER TABLE public.historico_politico
  ADD CONSTRAINT historico_politico_proveniencia_check
  CHECK (
    proveniencia IS NULL
    OR proveniencia IN ('tse', 'senado', 'wikidata', 'manual', 'misto', 'unknown')
  );

COMMENT ON COLUMN public.historico_politico.proveniencia IS
  'Origem da row: tse | senado | wikidata | manual | misto (várias fontes) | unknown. NULL = usar inferência legada em observacoes.';
