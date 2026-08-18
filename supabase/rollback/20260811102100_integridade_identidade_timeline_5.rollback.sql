-- Rollback fail-closed: só reverte postimages integrais produzidos por 102100.
DO $$
DECLARE
  s record;
  fk record;
  dependente boolean;
BEGIN
  FOR s IN SELECT * FROM public.identidade_timeline_quarentena_snapshot WHERE migration_version='20260811102100'
  LOOP
    dependente := CASE s.tabela
      WHEN 'candidatos' THEN EXISTS(SELECT 1 FROM public.candidatos t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
      WHEN 'historico_politico' THEN EXISTS(SELECT 1 FROM public.historico_politico t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
      WHEN 'mudancas_partido' THEN EXISTS(SELECT 1 FROM public.mudancas_partido t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
      WHEN 'patrimonio' THEN EXISTS(SELECT 1 FROM public.patrimonio t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
      WHEN 'financiamento' THEN EXISTS(SELECT 1 FROM public.financiamento t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
    END;
    IF NOT dependente THEN
      RAISE EXCEPTION 'rollback recusado: postimage divergiu em %.%',s.tabela,s.row_id;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot WHERE migration_version='20260811102100' AND tabela='candidatos') <> 2 THEN
    RAISE EXCEPTION 'rollback recusado: snapshots Orleans ausentes';
  END IF;
  IF (SELECT count(*) FROM public.mudancas_partido WHERE id IN ('30f87192-dc08-473c-aa19-21c7fadfb44b','24e9d2d1-9008-4dfd-916d-03a6713820ec','65ed4abb-2b3e-4092-aeed-bee9bfd38fde')) <> 3 THEN
    RAISE EXCEPTION 'rollback recusado: âncoras esperadas ausentes';
  END IF;

  -- Toda FK atual ou futura que referencia candidatos é descoberta no catálogo.
  -- A única dependência permitida é a âncora Orleans criada por esta migration.
  FOR fk IN
    SELECT n.nspname AS schema_name, cl.relname AS table_name, a.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=cl.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY ck(attnum,ord) ON true
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY fkatt(attnum,ord) ON fkatt.ord=ck.ord
    JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=ck.attnum
    JOIN pg_attribute ar ON ar.attrelid=con.confrelid AND ar.attnum=fkatt.attnum
    WHERE con.contype='f' AND con.confrelid='public.candidatos'::regclass AND ar.attname='id'
  LOOP
    IF fk.schema_name='public' AND fk.table_name='mudancas_partido' THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1 AND id<>$2)',fk.schema_name,fk.table_name,fk.column_name)
      INTO dependente USING 'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid,'65ed4abb-2b3e-4092-aeed-bee9bfd38fde'::uuid;
    ELSE
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',fk.schema_name,fk.table_name,fk.column_name)
      INTO dependente USING 'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid;
    END IF;
    IF dependente THEN
      RAISE EXCEPTION 'rollback recusado: dependência posterior em %.%.%',fk.schema_name,fk.table_name,fk.column_name;
    END IF;
  END LOOP;

  IF to_regclass('public.notification_log') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_log' AND column_name='candidato_ids') THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.notification_log WHERE candidato_ids @> ARRAY[$1]::uuid[])'
      INTO dependente USING 'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid;
    IF dependente THEN RAISE EXCEPTION 'rollback recusado: notification_log referencia Orleans novo'; END IF;
  END IF;
END $$;

-- IDs e payloads exatos evitam capturar uma segunda linha com mesmo SQ/ano/prefixo.
-- @write tabela=mudancas_partido slug=coronel-busnello campos=id
DELETE FROM public.mudancas_partido WHERE id='30f87192-dc08-473c-aa19-21c7fadfb44b'
  AND candidato_id='23dc2553-0fd3-489f-9ac1-4ed50b8ec5e3' AND partido_anterior='PSD' AND partido_novo='MISSAO'
  AND ano=2026 AND data_mudanca IS NULL AND created_at=timestamptz '2026-08-11 18:00:00+00'
  AND contexto='Filiação observada no consulta_cand 2026 do TSE, SQ 190002544120, nome civil JOÃO JACQUES SOARES BUSNELLO, UF RJ, cargo GOVERNADOR. Resultado #NULO, sem inferir candidatura confirmada. Fonte: https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip';
-- @write tabela=mudancas_partido slug=jeremias-cosmo campos=id
DELETE FROM public.mudancas_partido WHERE id='24e9d2d1-9008-4dfd-916d-03a6713820ec'
  AND candidato_id='baf8abd2-9386-48df-876e-1e8b16fa1e7f' AND partido_anterior='AGIR' AND partido_novo='D35'
  AND ano=2026 AND data_mudanca IS NULL AND created_at=timestamptz '2026-08-11 18:00:00+00'
  AND contexto='Filiação observada no consulta_cand 2026 do TSE, SQ 170002541258, nome civil JEREMIAS COSMO SILVA DOS SANTOS, UF PE, cargo GOVERNADOR, partido DEMOCRATA. Resultado #NULO, sem inferir candidatura confirmada. Fonte: https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip';
-- @write tabela=mudancas_partido slug=orleans-brandao campos=id
DELETE FROM public.mudancas_partido WHERE id='65ed4abb-2b3e-4092-aeed-bee9bfd38fde'
  AND candidato_id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601' AND partido_anterior='Histórico anterior não determinado' AND partido_novo='MDB'
  AND ano=2026 AND data_mudanca IS NULL AND created_at=timestamptz '2026-08-11 18:00:00+00'
  AND contexto='Âncora de filiação observada no consulta_cand 2026 do TSE, SQ 100002543869, UF MA, cargo GOVERNADOR. O resultado #NULO não é tratado como candidatura confirmada. Fonte: https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip';

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.mudancas_partido WHERE id IN ('30f87192-dc08-473c-aa19-21c7fadfb44b','24e9d2d1-9008-4dfd-916d-03a6713820ec','65ed4abb-2b3e-4092-aeed-bee9bfd38fde')) THEN
    RAISE EXCEPTION 'rollback recusado: payload de âncora divergiu';
  END IF;
END $$;

-- @write tabela=candidatos slug=orleans-brandao campos=id
DELETE FROM public.candidatos c USING public.identidade_timeline_quarentena_snapshot s
WHERE s.migration_version='20260811102100' AND s.tabela='candidatos'
  AND s.row_id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601' AND c.id=s.row_id AND to_jsonb(c)=s.postimage;

-- @write tabela=candidatos slug=carlos-brandao-ma-historico campos=slug,status,publicavel,ultima_atualizacao
UPDATE public.candidatos c SET
  slug=s.preimage->>'slug',status=s.preimage->>'status',publicavel=(s.preimage->>'publicavel')::boolean,
  ultima_atualizacao=(s.preimage->>'ultima_atualizacao')::timestamptz
FROM public.identidade_timeline_quarentena_snapshot s
WHERE s.migration_version='20260811102100' AND s.tabela='candidatos'
  AND s.row_id='47a1de10-1cf7-47f8-837b-dbbf94480421' AND c.id=s.row_id AND to_jsonb(c)=s.postimage;

-- @write tabela=historico_politico slug=joao-rodrigues campos=despublicado_em,despublicacao_motivo
-- @write tabela=historico_politico slug=renan-filho campos=despublicado_em,despublicacao_motivo
UPDATE public.historico_politico t SET despublicado_em=(s.preimage->>'despublicado_em')::timestamptz,despublicacao_motivo=s.preimage->>'despublicacao_motivo' FROM public.identidade_timeline_quarentena_snapshot s WHERE s.migration_version='20260811102100' AND s.tabela='historico_politico' AND s.row_id=t.id AND to_jsonb(t)=s.postimage;
-- @write tabela=mudancas_partido slug=joao-rodrigues campos=despublicado_em,despublicacao_motivo
-- @write tabela=mudancas_partido slug=renan-filho campos=despublicado_em,despublicacao_motivo
UPDATE public.mudancas_partido t SET despublicado_em=(s.preimage->>'despublicado_em')::timestamptz,despublicacao_motivo=s.preimage->>'despublicacao_motivo' FROM public.identidade_timeline_quarentena_snapshot s WHERE s.migration_version='20260811102100' AND s.tabela='mudancas_partido' AND s.row_id=t.id AND to_jsonb(t)=s.postimage;
-- @write tabela=patrimonio slug=joao-rodrigues campos=despublicado_em,despublicacao_motivo
-- @write tabela=patrimonio slug=renan-filho campos=despublicado_em,despublicacao_motivo
UPDATE public.patrimonio t SET despublicado_em=(s.preimage->>'despublicado_em')::timestamptz,despublicacao_motivo=s.preimage->>'despublicacao_motivo' FROM public.identidade_timeline_quarentena_snapshot s WHERE s.migration_version='20260811102100' AND s.tabela='patrimonio' AND s.row_id=t.id AND to_jsonb(t)=s.postimage;
-- @write tabela=financiamento slug=joao-rodrigues campos=despublicado_em,despublicacao_motivo
-- @write tabela=financiamento slug=renan-filho campos=despublicado_em,despublicacao_motivo
UPDATE public.financiamento t SET despublicado_em=(s.preimage->>'despublicado_em')::timestamptz,despublicacao_motivo=s.preimage->>'despublicacao_motivo' FROM public.identidade_timeline_quarentena_snapshot s WHERE s.migration_version='20260811102100' AND s.tabela='financiamento' AND s.row_id=t.id AND to_jsonb(t)=s.postimage;

DO $$
DECLARE s record; ok boolean;
BEGIN
  FOR s IN SELECT * FROM public.identidade_timeline_quarentena_snapshot WHERE migration_version='20260811102100'
  LOOP
    ok := CASE s.tabela
      WHEN 'candidatos' THEN CASE WHEN s.row_id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601' THEN NOT EXISTS(SELECT 1 FROM public.candidatos WHERE id=s.row_id) ELSE EXISTS(SELECT 1 FROM public.candidatos t WHERE t.id=s.row_id AND to_jsonb(t)=s.preimage) END
      WHEN 'historico_politico' THEN EXISTS(SELECT 1 FROM public.historico_politico t WHERE t.id=s.row_id AND to_jsonb(t)=s.preimage)
      WHEN 'mudancas_partido' THEN CASE
        WHEN s.row_id IN ('30f87192-dc08-473c-aa19-21c7fadfb44b','24e9d2d1-9008-4dfd-916d-03a6713820ec','65ed4abb-2b3e-4092-aeed-bee9bfd38fde')
          THEN NOT EXISTS(SELECT 1 FROM public.mudancas_partido WHERE id=s.row_id)
        ELSE EXISTS(SELECT 1 FROM public.mudancas_partido t WHERE t.id=s.row_id AND to_jsonb(t)=s.preimage)
      END
      WHEN 'patrimonio' THEN EXISTS(SELECT 1 FROM public.patrimonio t WHERE t.id=s.row_id AND to_jsonb(t)=s.preimage)
      WHEN 'financiamento' THEN EXISTS(SELECT 1 FROM public.financiamento t WHERE t.id=s.row_id AND to_jsonb(t)=s.preimage)
    END;
    IF NOT ok THEN RAISE EXCEPTION 'rollback recusado: restauração integral falhou em %.%',s.tabela,s.row_id; END IF;
  END LOOP;
END $$;

DELETE FROM public.identidade_timeline_quarentena_snapshot WHERE migration_version='20260811102100';
-- @write tabela=schema_migrations ref=integridade-identidade-timeline-5 campos=version
DELETE FROM supabase_migrations.schema_migrations WHERE version='20260811102100';
