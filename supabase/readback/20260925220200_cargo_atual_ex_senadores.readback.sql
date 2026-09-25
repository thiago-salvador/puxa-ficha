BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb; total integer;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260925220200') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260925220200' AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'cargo-atual-20260925 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb, volume INTO r, total FROM public.coleta_log WHERE execucao = 'migration:20260925220200';
  IF jsonb_array_length(r->'linhas') <> total OR total > 9 THEN
    RAISE EXCEPTION 'cargo-atual-20260925 readback: recibo com % linhas e volume %', jsonb_array_length(r->'linhas'), total;
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'cargo-atual-20260925 readback: postimagem divergiu em %', linha->>'slug';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.candidatos c
       JOIN (VALUES
         ('jorginho-mello', 'Governador de Santa Catarina'),
         ('mailza-assis', 'Governadora do Acre'),
         ('tse-2026-100002549583', 'Deputado(a) Federal'),
         ('tse-2026-10002544274', 'Deputado(a) Federal'),
         ('tse-2026-110002551967', NULL),
         ('tse-2026-160002547656', 'Deputado(a) Federal'),
         ('tse-2026-190002548141', 'Deputado(a) Federal'),
         ('tse-2026-190002550184', 'Deputado(a) Federal'),
         ('tse-2026-220002541490', NULL)
       ) AS u(slug, cargo) ON u.slug = c.slug
       WHERE c.cargo_atual IS NOT DISTINCT FROM u.cargo) <> 9 THEN
    RAISE EXCEPTION 'cargo-atual-20260925 readback: cargo_atual das nove fichas nao confere';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'cargo-atual-20260925') <> total THEN
    RAISE EXCEPTION 'cargo-atual-20260925 readback: snapshot de quarentena diverge do recibo';
  END IF;
END
$readback$;
COMMIT;
