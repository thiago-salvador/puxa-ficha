BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb; atual jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260927030100') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260927030100' AND volume = 4 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260927030100';
  IF jsonb_array_length(r->'linhas') <> 4 THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 readback: recibo sem as quatro linhas';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF linha->>'tabela' = 'patrimonio' THEN
      SELECT to_jsonb(p) INTO atual FROM public.patrimonio p WHERE p.id = (linha->>'id')::uuid;
    ELSE
      SELECT to_jsonb(f) INTO atual FROM public.financiamento f WHERE f.id = (linha->>'id')::uuid;
    END IF;
    IF atual IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'mauricio-homonimo-20260926 readback: postimagem divergiu em %', linha->>'id';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.patrimonio
       WHERE id IN ('f65e7932-574f-4377-a27c-334458471b64','e78469f8-de18-4104-aa4c-1a78360228d1')
         AND despublicado_em IS NOT NULL AND despublicacao_motivo LIKE 'homonimo-20260926:%') <> 2
     OR (SELECT count(*) FROM public.financiamento
       WHERE id IN ('7ead02ce-acfd-417d-b482-a0e92f56b801','aacde5cd-aafa-466e-9ad4-cb095c75e5b6')
         AND despublicado_em IS NOT NULL AND despublicacao_motivo LIKE 'homonimo-20260926:%') <> 2 THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 readback: as quatro linhas nao estao despublicadas';
  END IF;

  IF EXISTS (SELECT 1 FROM public.financiamento_doador_search
             WHERE financiamento_id IN ('7ead02ce-acfd-417d-b482-a0e92f56b801','aacde5cd-aafa-466e-9ad4-cb095c75e5b6')) THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 readback: busca por doador ainda indexa receitas do homonimo';
  END IF;

  -- O registro de 2026 do candidato continua publicado.
  IF (SELECT count(*) FROM public.financiamento f
       WHERE f.candidato_id = 'c7a28e0e-06d0-412b-98ee-b79a7a4354f9' AND f.ano_eleicao = 2026 AND f.despublicado_em IS NULL) <> 1
     OR (SELECT count(*) FROM public.patrimonio p
       WHERE p.candidato_id = 'c7a28e0e-06d0-412b-98ee-b79a7a4354f9' AND p.ano_eleicao = 2026 AND p.despublicado_em IS NULL) <> 1 THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 readback: registro de 2026 da ficha mudou';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'mauricio-homonimo-20260926') <> 4 THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 readback: snapshot ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
