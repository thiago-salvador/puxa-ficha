-- Readback comportamental: mede a mesma consulta sob os tres papeis do API.
DO $$
DECLARE
  quarantined_rows integer;
  anon_visible integer;
  authenticated_visible integer;
  service_role_visible integer;
BEGIN
  SELECT count(*) INTO quarantined_rows
  FROM public.historico_politico
  WHERE despublicado_em IS NOT NULL;

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO anon_visible
  FROM public.historico_politico
  WHERE despublicado_em IS NOT NULL;
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO authenticated_visible
  FROM public.historico_politico
  WHERE despublicado_em IS NOT NULL;
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT count(*) INTO service_role_visible
  FROM public.historico_politico
  WHERE despublicado_em IS NOT NULL;
  EXECUTE 'RESET ROLE';

  IF anon_visible <> 0 OR authenticated_visible <> 0 THEN
    RAISE EXCEPTION 'readback RLS: anon=% authenticated=%, esperava zero',
      anon_visible,authenticated_visible;
  END IF;
  IF service_role_visible <> quarantined_rows THEN
    RAISE EXCEPTION 'readback RLS: service_role viu % de % linhas em quarentena',
      service_role_visible,quarantined_rows;
  END IF;
  RAISE NOTICE 'readback RLS: total=% anon=0 authenticated=0 service_role=%',
    quarantined_rows,service_role_visible;
END $$;
