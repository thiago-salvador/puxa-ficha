-- Final prelaunch closure: remove public "cargo_disputado = Nenhum" rows.
-- Sources checked on 2026-05-20:
-- - Guto Silva: CBN Maringa, 2026-05-12, pre-candidato ao Senado pelo PSD.
-- - Edegar Pretto: site oficial, 2026-05-13, pre-candidato a vice-governador do RS; RED, 2026-04-16.
-- - Jose Carlos Aleluia: Metro1, 2026-04-07, retirada da pre-candidatura e apoio a ACM Neto.
-- - Pedro Cunha Lima: Portal Correio, 2025-12-09, anunciou que nao disputara as eleicoes de 2026.

UPDATE public.candidatos
SET
  cargo_disputado = 'Senador',
  cargo_atual = 'Ex-secretario das Cidades do Parana',
  situacao_candidatura = 'pre-candidato',
  status = 'pre-candidato',
  ultima_atualizacao = NOW()
WHERE slug = 'guto-silva';

UPDATE public.candidatos
SET
  cargo_disputado = 'Vice-Governador',
  cargo_atual = 'Ex-presidente da Conab',
  situacao_candidatura = 'pre-candidato',
  status = 'pre-candidato',
  ultima_atualizacao = NOW()
WHERE slug = 'edegar-pretto';

UPDATE public.candidatos
SET
  cargo_disputado = 'Nenhum',
  situacao_candidatura = NULL,
  status = 'desistente',
  publicavel = false,
  ultima_atualizacao = NOW()
WHERE slug = 'jose-carlos-aleluia';

UPDATE public.candidatos
SET
  cargo_disputado = 'Nenhum',
  situacao_candidatura = NULL,
  status = 'desistente',
  publicavel = false,
  ultima_atualizacao = NOW()
WHERE slug = 'pedro-cunha-lima';

DO $$
DECLARE
  public_none_count integer;
  visible_removed_count integer;
BEGIN
  SELECT COUNT(*)
    INTO public_none_count
  FROM public.candidatos_publico
  WHERE slug IN ('guto-silva', 'edegar-pretto', 'jose-carlos-aleluia', 'pedro-cunha-lima')
    AND cargo_disputado = 'Nenhum';

  IF public_none_count <> 0 THEN
    RAISE EXCEPTION 'final launch cargo fix: expected 0 public cargo Nenhum rows, found %', public_none_count;
  END IF;

  SELECT COUNT(*)
    INTO visible_removed_count
  FROM public.candidatos_publico
  WHERE slug IN ('jose-carlos-aleluia', 'pedro-cunha-lima');

  IF visible_removed_count <> 0 THEN
    RAISE EXCEPTION 'final launch cargo fix: expected Aleluia/Pedro hidden from public view, found % visible', visible_removed_count;
  END IF;
END $$;
