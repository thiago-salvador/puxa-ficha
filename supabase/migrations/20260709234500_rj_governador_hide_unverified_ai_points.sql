-- RJ Governador: pontos positivos gerados por IA sem verificacao nao podem permanecer visiveis.

BEGIN;

UPDATE public.pontos_atencao pa
SET
  visivel = false,
  verificado = false,
  descricao = pa.descricao || ' [Oculto em 2026-07-09: resumo gerado por IA sem verificacao e com fontes genericas.]'
FROM public.candidatos c
WHERE pa.candidato_id = c.id
  AND c.slug IN ('douglas-ruas', 'eduardo-paes', 'garotinho')
  AND pa.gerado_por = 'ia'
  AND pa.verificado = false
  AND pa.visivel = true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pontos_atencao pa
    JOIN public.candidatos c ON c.id = pa.candidato_id
    WHERE c.slug IN (
      'andre-marinho', 'andre-portugues', 'cyro-garcia', 'douglas-ruas',
      'eduardo-paes', 'garotinho', 'juliete-pantoja', 'luan-monteiro',
      'rafael-luz', 'william-siri', 'wilson-witzel'
    )
      AND pa.gerado_por = 'ia'
      AND pa.verificado = false
      AND pa.visivel = true
  ) THEN
    RAISE EXCEPTION 'RJ Governador: ponto IA nao verificado ainda visivel';
  END IF;
END $$;

COMMIT;
