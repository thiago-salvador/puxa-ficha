-- Readback do snapshot pós-registro. Situação pública: registrada, aguardando julgamento.
DO $$
DECLARE total integer; presidenciais integer; estaduais integer; duplicadas integer;
BEGIN
  SELECT count(*),count(*) FILTER (WHERE cargo_titular='Presidente'),
         count(*) FILTER (WHERE cargo_titular='Governador'),
         count(*) FILTER (WHERE identidade_status='duplicidade_oficial')
    INTO total,presidenciais,estaduais,duplicadas
    FROM public.chapas_2026 WHERE fonte_sha256='c3d13ae50f95024f43046acb4458a4420a620e86526fed665f9e60c8dc6068df';
  IF total <> 196 OR presidenciais <> 12 OR estaduais <> 184 OR duplicadas <> 1 THEN
    RAISE EXCEPTION 'readback chapas pós-registro divergiu: total %, presidenciais %, estaduais %, duplicadas %',total,presidenciais,estaduais,duplicadas;
  END IF;
  IF EXISTS (SELECT 1 FROM public.chapas_2026_publico WHERE titular_slug='leonardo-avalanche') THEN
    RAISE EXCEPTION 'leonardo-avalanche não consta no ZIP oficial pós-prazo';
  END IF;
END $$;
