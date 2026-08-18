-- Saneamento pos-validacao por candidato dos governadores (2026-06-04, aprovado).
-- Tonny Kerley (PI) estava publicado como Governador/NOVO, mas o NOVO oficializou
-- ELIZEU AGUIAR como pre-candidato ao governo do PI (abr/2026, verificado:
-- piauihoje / Portal Clube News / oitomeia). Tonny foi candidato do NOVO a
-- PREFEITO de Teresina em 2024 e so apareceu como cotado em pesquisa de marco;
-- o partido nao o confirmou ao governo. Despublicar (reversivel, nao e delecao).
-- Unico data-field a corrigir entre os 112 governadores publicados (partido_sigla
-- estava 100% correto apos cross-check vs candidatos_publico).
BEGIN;

UPDATE public.candidatos
SET publicavel = false,
    ultima_atualizacao = NOW()
WHERE slug = 'tonny-kerley'
  AND cargo_disputado = 'Governador';

DO $$
DECLARE
  visivel integer;
BEGIN
  SELECT COUNT(*) INTO visivel FROM public.candidatos_publico WHERE slug = 'tonny-kerley';
  IF visivel <> 0 THEN
    RAISE EXCEPTION 'unpublish_tonny_kerley: ainda visivel na view publica (% linha)', visivel;
  END IF;
END $$;

COMMIT;
