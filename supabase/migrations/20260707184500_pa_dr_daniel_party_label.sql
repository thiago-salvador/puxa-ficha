-- PA Governador: alinha a timeline partidaria publica de Dr. Daniel ao label usado no perfil (PODEMOS).

BEGIN;

UPDATE public.mudancas_partido mp
SET
  partido_novo = 'PODEMOS',
  contexto = concat(mp.contexto, ' Ajuste 2026-07-07: auditor real-status compara literalmente com partido_sigla=PODEMOS.')
FROM public.candidatos c
WHERE mp.candidato_id = c.id
  AND c.slug = 'dr-daniel'
  AND mp.partido_novo = 'PODE';

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.mudancas_partido mp
  JOIN public.candidatos c ON c.id = mp.candidato_id
  WHERE c.slug = 'dr-daniel'
    AND mp.partido_novo = 'PODEMOS';

  IF v_count < 1 THEN
    RAISE EXCEPTION 'dr-daniel timeline ainda sem PODEMOS';
  END IF;
END $$;

COMMIT;
