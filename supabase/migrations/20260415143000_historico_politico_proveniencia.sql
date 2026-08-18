-- Proveniência estruturada por row (Fase 5 / P2): reduz dependência de substring em `observacoes`.
-- NULL = legado / ainda não preenchido; consumidores usam resolveHistoricoRowProvenance (fallback infer).

ALTER TABLE public.historico_politico
  ADD COLUMN IF NOT EXISTS proveniencia text;

ALTER TABLE public.historico_politico
  DROP CONSTRAINT IF EXISTS historico_politico_proveniencia_check;

ALTER TABLE public.historico_politico
  ADD CONSTRAINT historico_politico_proveniencia_check
  CHECK (
    proveniencia IS NULL
    OR proveniencia IN ('tse', 'wikidata', 'manual', 'misto', 'unknown')
  );

COMMENT ON COLUMN public.historico_politico.proveniencia IS
  'Origem da row: tse | wikidata | manual | misto (várias fontes) | unknown. NULL = usar inferência legada em observacoes.';
