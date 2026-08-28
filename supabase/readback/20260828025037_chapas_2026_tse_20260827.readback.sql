-- Readback do snapshot oficial de 27/08. Situação pública: registrada, aguardando julgamento.
DO $$
DECLARE total integer; presidenciais integer; estaduais integer; duplicadas integer; vinculadas integer;
BEGIN
  SELECT count(*),count(*) FILTER (WHERE cargo_titular='Presidente'),
         count(*) FILTER (WHERE cargo_titular='Governador'),
         count(*) FILTER (WHERE identidade_status='duplicidade_oficial'),
         count(*) FILTER (WHERE titular_candidato_id IS NOT NULL)
    INTO total,presidenciais,estaduais,duplicadas,vinculadas
    FROM public.chapas_2026 WHERE fonte_sha256='eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27';
  IF total <> 220 OR presidenciais <> 13 OR estaduais <> 207 OR duplicadas <> 19 OR vinculadas <> 220 THEN
    RAISE EXCEPTION 'readback chapas de 27/08 divergiu: total %, presidenciais %, estaduais %, duplicadas %, vinculadas %',total,presidenciais,estaduais,duplicadas,vinculadas;
  END IF;
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('well-macedo', 'rico-pinheiro')) <> 2 THEN
    RAISE EXCEPTION 'readback das novas fichas oficiais divergiu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chapas_2026_publico WHERE titular_slug='leonardo-avalanche') THEN
    RAISE EXCEPTION 'leonardo-avalanche não consta no ZIP oficial pós-prazo';
  END IF;
END $$;
