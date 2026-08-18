BEGIN;

UPDATE public.pontos_atencao
SET titulo = REPLACE(titulo, 'Sancao administrativa ativa', 'Sanção administrativa ativa')
WHERE gerado_por = 'automatico'
  AND titulo LIKE 'Sancao administrativa ativa (%)';

DELETE FROM public.pontos_atencao a
USING public.pontos_atencao b
WHERE a.ctid < b.ctid
  AND a.candidato_id = b.candidato_id
  AND a.titulo = b.titulo
  AND a.gerado_por = 'automatico'
  AND b.gerado_por = 'automatico'
  AND a.titulo LIKE 'Sanção administrativa ativa (%)';

CREATE UNIQUE INDEX IF NOT EXISTS uq_pontos_atencao_auto_sancao_candidato_titulo
ON public.pontos_atencao (candidato_id, titulo)
WHERE gerado_por = 'automatico'
  AND titulo LIKE 'Sanção administrativa ativa (%)';

COMMIT;
