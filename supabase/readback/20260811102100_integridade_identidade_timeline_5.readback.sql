DO $$
DECLARE
  v_ledger integer; v_identidades integer; v_arquivo integer; v_orleans integer;
  v_ancoras integer; v_publicas_fora integer; v_postimage integer;
  v_hist_manifesto integer; v_partido_manifesto integer;
  v_patrimonio_manifesto integer; v_financiamento_manifesto integer;
  v_universo_publico integer;
BEGIN
  SELECT count(*) INTO v_ledger FROM supabase_migrations.schema_migrations WHERE version='20260811102100';

  -- ultima_atualizacao é volátil por contrato e pode avançar pelo cron. A
  -- identidade continua presa aos campos estáveis e ao created_at original.
  WITH esperadas(id,slug,nome_completo,nome_urna,nascimento,estado,cargo,partido_atual,partido_sigla,status,situacao,publicavel,criado) AS (
    VALUES
      ('23dc2553-0fd3-489f-9ac1-4ed50b8ec5e3'::uuid,'coronel-busnello','João Jacques Soares Busnello','Coronel Busnello',date '1970-08-06','RJ','Governador','Partido Missão','MISSAO','pre-candidato','pre-candidato',true,timestamptz '2026-07-30 14:27:52.971837+00'),
      ('baf8abd2-9386-48df-876e-1e8b16fa1e7f'::uuid,'jeremias-cosmo','Jeremias Cosmo Silva dos Santos','Professor Jeremias',date '1980-03-27','PE','Governador','Democrata','D35','pre-candidato','pre-candidato',true,timestamptz '2026-07-30 14:27:52.971837+00'),
      ('a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'joao-rodrigues','João Rodrigues','João Rodrigues',date '1967-03-23','SC','Governador','Partido Social Democrático','PSD','pre-candidato','pre-candidato',true,timestamptz '2026-03-31 02:25:56.070567+00'),
      ('b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid,'orleans-brandao','Carlos Orleans Braide Brandão','Orleans Brandao',date '1994-12-08','MA','Governador','Movimento Democrático Brasileiro','MDB','pre-candidato','Pré-candidatura declarada publicamente; não é candidatura registrada ou deferida no TSE.',true,timestamptz '2026-08-11 18:00:00+00'),
      ('81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'renan-filho','José Renan Vasconcelos Calheiros Filho','Renan Filho',date '1979-10-08','AL','Governador','Movimento Democrático Brasileiro','MDB','pre-candidato','pre-candidato',true,timestamptz '2026-03-31 02:47:47.335142+00')
  )
  SELECT count(*) INTO v_identidades FROM esperadas e JOIN public.candidatos c ON
       c.id=e.id AND c.slug=e.slug AND c.nome_completo=e.nome_completo AND c.nome_urna=e.nome_urna
   AND c.data_nascimento=e.nascimento AND c.estado=e.estado AND c.cargo_disputado=e.cargo
   AND c.partido_atual=e.partido_atual AND c.partido_sigla=e.partido_sigla AND c.status=e.status
   AND c.situacao_candidatura=e.situacao AND c.publicavel=e.publicavel
   AND c.created_at=e.criado;

  SELECT count(*) INTO v_arquivo FROM public.candidatos c
  JOIN public.identidade_timeline_quarentena_snapshot s ON s.row_id=c.id
  WHERE s.migration_version='20260811102100' AND s.tabela='candidatos'
    AND c.id='47a1de10-1cf7-47f8-837b-dbbf94480421' AND to_jsonb(c)=s.postimage;
  SELECT count(*) INTO v_orleans FROM public.candidatos c
  JOIN public.identidade_timeline_quarentena_snapshot s ON s.row_id=c.id
  WHERE s.migration_version='20260811102100' AND s.tabela='candidatos'
    AND c.id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601' AND to_jsonb(c)=s.postimage
    AND c.cargo_atual IS NULL
    AND c.site_campanha='https://orleansbrandao.com.br/'
    AND c.fonte_dados @> ARRAY[
      'https://www.al.ma.leg.br/sitealema/discurso/tempo-dos-blocos-iracema-vale-3/',
      'https://orleansbrandao.com.br/',
      'https://orleansbrandao.com.br/saiba-mais/',
      'https://www.seam.ma.gov.br/noticias/orleans-brandao-participa-da-18-cavalgada-de-sao-joao-do-paraiso-e-anuncia-obras-para-o-municipio',
      'https://pm.ssp.ma.gov.br/wp-content/uploads/2026/04/Publicacao-da-promocao-dos-Oficiais-no-Diario-Oficial-no-059-de-31-de-marco-de-2026.pdf',
      'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'
    ]::text[]
    AND NOT ('https://seam.ma.gov.br/quem-e-quem'=ANY(c.fonte_dados));
  SELECT count(*) INTO v_ancoras FROM public.mudancas_partido m
  JOIN public.identidade_timeline_quarentena_snapshot s
    ON s.migration_version='20260811102100' AND s.tabela='mudancas_partido'
   AND s.row_id=m.id AND s.preimage='{}'::jsonb AND s.postimage=to_jsonb(m)
  WHERE m.id IN ('65ed4abb-2b3e-4092-aeed-bee9bfd38fde','30f87192-dc08-473c-aa19-21c7fadfb44b','24e9d2d1-9008-4dfd-916d-03a6713820ec')
    AND m.despublicado_em IS NULL;

  SELECT count(*) INTO v_hist_manifesto FROM public.identidade_timeline_quarentena_snapshot
    WHERE migration_version='20260811102100' AND tabela='historico_politico'
      AND candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7')
      AND preimage=postimage;
  SELECT count(*) INTO v_partido_manifesto FROM public.identidade_timeline_quarentena_snapshot
    WHERE migration_version='20260811102100' AND tabela='mudancas_partido'
      AND candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7')
      AND preimage=postimage;
  SELECT count(*) INTO v_patrimonio_manifesto FROM public.identidade_timeline_quarentena_snapshot
    WHERE migration_version='20260811102100' AND tabela='patrimonio'
      AND candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7')
      AND preimage=postimage;
  SELECT count(*) INTO v_financiamento_manifesto FROM public.identidade_timeline_quarentena_snapshot
    WHERE migration_version='20260811102100' AND tabela='financiamento'
      AND candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7')
      AND preimage=postimage;
  -- Mede a superfície pública canônica. A view inclui qualquer status diferente
  -- de removido quando publicavel=true, inclusive estados editoriais que não
  -- podem ficar invisíveis a este gate por uma contagem proxy mais estreita.
  SELECT count(*) INTO v_universo_publico FROM public.candidatos_publico;

  SELECT count(*) INTO v_postimage FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260811102100' AND NOT CASE s.tabela
    WHEN 'candidatos' THEN EXISTS(SELECT 1 FROM public.candidatos t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
    WHEN 'historico_politico' THEN EXISTS(SELECT 1 FROM public.historico_politico t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
    WHEN 'mudancas_partido' THEN EXISTS(SELECT 1 FROM public.mudancas_partido t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
    WHEN 'patrimonio' THEN EXISTS(SELECT 1 FROM public.patrimonio t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
    WHEN 'financiamento' THEN EXISTS(SELECT 1 FROM public.financiamento t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
  END;

  SELECT sum(n)::integer INTO v_publicas_fora FROM (
    SELECT count(*) n FROM public.historico_politico t WHERE t.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7') AND t.despublicado_em IS NULL AND t.id <> ALL(ARRAY['863ee379-1fb7-4416-8f25-e38260337eb8','e4d5e5ea-aa99-4ab0-8748-c5bffc942b31','633b3e5b-6e0a-42b8-b120-152349e89f7e','7ac8d8f8-a0ef-410b-8d7a-efa62a1a1a72','2cdb9e2c-fd82-4ff2-9535-c768cf723248','3a7f6d38-d643-45ec-978a-7955d1d59ad8','470def37-f018-4dcc-a917-4ed07e42679b','51341284-613b-4c99-86da-929c7f174e0e','6fb20705-8476-4b0e-a816-551cd347db37','b2f7b24f-d828-43de-bc0d-4071fb86df82','6bfe178b-bd43-4ecd-9312-e5ef07fd7ee9','6b8c42f2-7124-42e4-ae9b-ca4dcaf453f4']::uuid[])
    UNION ALL SELECT count(*) FROM public.mudancas_partido t WHERE t.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7') AND t.despublicado_em IS NULL AND t.id NOT IN ('ae226065-88b2-4b86-b4e6-92e8c5400210','00a4b5e3-7bd7-4824-9aa2-573fe51a06e3','102e508b-6a63-45e2-a889-e1474123ffea','826cab46-0271-40d9-9979-035ff260be54','dc3ae172-4577-4cd8-bb49-dd33a599735a','c3f281e6-f38f-4a79-82f1-1621064c9e9f','30f87192-dc08-473c-aa19-21c7fadfb44b','24e9d2d1-9008-4dfd-916d-03a6713820ec')
    UNION ALL SELECT count(*) FROM public.patrimonio t WHERE t.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7') AND t.despublicado_em IS NULL AND t.id NOT IN ('33ad044c-71c7-4964-b563-b1f7f31e62da','61a49b91-a0d8-42f6-83c4-545fdd0eb570','75d858a8-4678-45f5-bfd2-631983d67224','6cc29a4b-bb69-4e57-804b-fd6a3e7eb93d')
    UNION ALL SELECT count(*) FROM public.financiamento t WHERE t.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7') AND t.despublicado_em IS NULL AND t.id NOT IN ('89c59acc-00ae-446e-9164-a82f01d25224','99d896e5-f18c-471e-8f0e-e023a50ec8bb','c1e117bb-4caa-45f6-ae7b-7dadb5e012ca','e9c1abcb-22af-4ab1-afde-9b317c25391a')
  ) q;

  IF v_ledger<>1 OR v_identidades<>5 OR v_arquivo<>1 OR v_orleans<>1 OR v_ancoras<>3
     OR v_hist_manifesto<>12 OR v_partido_manifesto<>6
     OR v_patrimonio_manifesto<>4 OR v_financiamento_manifesto<>4
     OR v_universo_publico<>194 OR v_publicas_fora<>0 OR v_postimage<>0 THEN
    RAISE EXCEPTION 'readback 20260811102100 divergente: ledger=% identidades=% arquivo=% orleans=% ancoras=% manifesto=%,%,%,% universo_publico=% publicas_fora=% postimage=%',
      v_ledger,v_identidades,v_arquivo,v_orleans,v_ancoras,
      v_hist_manifesto,v_partido_manifesto,v_patrimonio_manifesto,v_financiamento_manifesto,
      v_universo_publico,v_publicas_fora,v_postimage;
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260811102100') AS ledger,
  5 AS identidades_exatas, 1 AS carlos_brandao_quarentena, 0 AS contaminadas_publicas,
  3 AS ancoras_tse_2026, 1 AS orleans_correto;
