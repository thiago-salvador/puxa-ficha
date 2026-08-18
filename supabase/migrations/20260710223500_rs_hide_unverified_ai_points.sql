-- RS estadual: pontos gerados por IA sem verificacao nao podem permanecer publicos.
BEGIN;
UPDATE public.pontos_atencao pa
SET visivel = false
FROM public.candidatos c
WHERE pa.candidato_id = c.id
  AND c.slug IN ('priscila-voigt','gabriel-souza','rejane-oliveira','juliana-brizola','luciano-zucco','marcelo-maranata','edegar-pretto')
  AND pa.gerado_por = 'ia' AND pa.verificado = false AND pa.visivel = true;
COMMIT;
