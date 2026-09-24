BEGIN READ ONLY;
DO $readback$
DECLARE
  r jsonb;
  s record;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260923175946') <> 1
     OR (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
         WHERE migration_version = '20260923175946' AND tabela = 'candidatos') <> 1 THEN
    RAISE EXCEPTION 'eliziane partido readback: recibo ou snapshot ausente/duplicado';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260923175946';
  SELECT preimage,postimage,row_id INTO s
    FROM public.identidade_timeline_quarentena_snapshot
   WHERE migration_version = '20260923175946' AND tabela = 'candidatos';
  IF r->>'source_sha256' IS DISTINCT FROM 'dda125bc927941e4273fe60ccc9755cb1e05bc198d63ba8848178cc6d1b51a6c'
     OR r->>'source_sq' IS DISTINCT FROM '100002541459'
     OR r->>'source_nr_partido' IS DISTINCT FROM '13'
     OR r->>'source_sg_partido' IS DISTINCT FROM 'PT'
     OR r->'before' IS DISTINCT FROM s.preimage
     OR r->'after' IS DISTINCT FROM s.postimage
     OR (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.id = s.row_id) IS DISTINCT FROM s.postimage THEN
    RAISE EXCEPTION 'eliziane partido readback: origem ou posimagem divergiu';
  END IF;
  IF (SELECT count(*) FROM public.candidatos c WHERE c.id = s.row_id
        AND c.slug = 'tse-2026-100002541459' AND c.sq_candidato_2026 = '100002541459'
        AND c.estado = 'MA' AND c.cargo_disputado = 'Senador' AND c.numero_urna = '133'
        AND c.partido_sigla = 'PT' AND c.partido_atual = 'PT' AND c.publicavel IS TRUE) <> 1
     OR (SELECT count(*) FROM public.candidatos_publico p
         WHERE p.slug = 'tse-2026-100002541459' AND p.numero_urna = '133'
           AND p.partido_sigla = 'PT' AND p.partido_atual = 'PT') <> 1 THEN
    RAISE EXCEPTION 'eliziane partido readback: ficha publica nao reflete PT';
  END IF;
END
$readback$;
SELECT 'eliziane partido readback ok' AS status;
COMMIT;
