BEGIN READ ONLY;
DO $readback$
DECLARE
  r jsonb;
  ids uuid[] := ARRAY[
    'df84c415-5e7b-4dc9-8696-cdda6eb2e674',
    'c5b68881-4a02-4500-944e-92a72fd32aac',
    '39a7246c-1de5-47ea-a654-77905b219528',
    'b39655c8-8172-413e-94cb-611bf16ed69e'
  ]::uuid[];
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260923233000') <> 1
     OR (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
         WHERE migration_version = '20260923233000' AND tabela = 'mudancas_partido'
           AND row_id = ANY (ids) AND preimage = '{}'::jsonb) <> 4 THEN
    RAISE EXCEPTION 'eliziane mudancas readback: recibo ou snapshot ausente/duplicado';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260923233000';
  IF r->>'senado_filiacoes_sha256' IS DISTINCT FROM '19dac162d11871d8d09310fd66f777c9f54f327464454de6ab4e3d80c83c1342'
     OR r->>'camara_historico_sha256' IS DISTINCT FROM '65e16fe1ec79c38f163a8a3fa69db711261a972ba4f3a8437c7a9824cdcfe3bd'
     OR r->'before' IS DISTINCT FROM '[]'::jsonb
     OR jsonb_array_length(r->'candidate_changes_removidos') <> 4
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(r->'candidate_changes_removidos') e
                WHERE (e->>'registro_id')::uuid <> ALL (ids)
                   OR e->>'tabela_origem' IS DISTINCT FROM 'mudancas_partido')
     OR r->'after' IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ano)
                                       FROM public.mudancas_partido m WHERE m.id = ANY (ids))
     OR EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot s
                WHERE s.migration_version = '20260923233000'
                  AND s.postimage IS DISTINCT FROM
                      (SELECT to_jsonb(m) FROM public.mudancas_partido m WHERE m.id = s.row_id)) THEN
    RAISE EXCEPTION 'eliziane mudancas readback: recibo ou posimagem divergiu';
  END IF;
  IF (SELECT count(*) FROM public.mudancas_partido
      WHERE candidato_id = 'b8e8b3d1-1e2e-482f-b0dd-dbf927c5c681' AND despublicado_em IS NULL) <> 4
     OR (SELECT string_agg(partido_anterior || '>' || partido_novo || '@' || ano || '/' || coalesce(data_mudanca::text,'-'), ',' ORDER BY ano)
         FROM public.mudancas_partido WHERE id = ANY (ids))
        IS DISTINCT FROM 'PPS>REDE@2015/2015-10-05,REDE>PPS@2016/2016-04-04,CIDADANIA>PSD@2023/2023-01-31,PSD>PT@2026/-'
     OR (SELECT count(*) FROM public.candidate_changes
         WHERE registro_id = ANY (ids) AND tabela_origem = 'mudancas_partido') <> 0
     OR (SELECT count(*) FROM public.candidatos c
         WHERE c.id = 'b8e8b3d1-1e2e-482f-b0dd-dbf927c5c681' AND c.slug = 'tse-2026-100002541459'
           AND c.partido_sigla = 'PT' AND c.partido_atual = 'PT' AND c.publicavel IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'eliziane mudancas readback: trajetoria publicada divergiu';
  END IF;
END
$readback$;
SELECT 'eliziane mudancas readback ok' AS status;
COMMIT;
