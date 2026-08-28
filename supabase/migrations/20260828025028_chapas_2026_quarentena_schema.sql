-- Permite preservar cada combinação oficial ambígua em quarentena.
-- A view pública continua filtrando identidade_status='duplicidade_oficial'.
ALTER TABLE public.chapas_2026 DROP CONSTRAINT chapas_2026_check1;
ALTER TABLE public.chapas_2026 DROP CONSTRAINT chapas_2026_check2;
ALTER TABLE public.chapas_2026 ADD CONSTRAINT chapas_2026_check1 CHECK (
  (identidade_status='confirmada' AND sq_coligacao IS NOT NULL)
  OR identidade_status='duplicidade_oficial'
);
ALTER TABLE public.chapas_2026 ADD CONSTRAINT chapas_2026_check2 CHECK (
  identidade_status <> 'duplicidade_oficial'
  OR (
    jsonb_array_length(alternativas_oficiais)=2
    AND (
      (sq_coligacao IS NULL AND titular_sq_candidato IS NULL AND vice_sq_candidato IS NULL)
      OR (sq_coligacao IS NOT NULL AND titular_sq_candidato IS NOT NULL AND vice_sq_candidato IS NOT NULL)
    )
  )
);
