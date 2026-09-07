-- Restaurar apenas os três campos autorizados a partir da preimagem.
-- Recusa qualquer drift dos alvos e migrations posteriores. Recibo permanece.
BEGIN;
LOCK TABLE public.candidatos, public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; c jsonb; ch jsonb; n integer;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version >= '20260907180000') <> 1
     OR NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260907180000') THEN
    RAISE EXCEPTION 'danilo rollback: ledger divergiu';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260907180000' AND volume = 2) <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260907180000') THEN
    RAISE EXCEPTION 'danilo rollback: recibo inválido ou rollback já executado';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260907180000';
  SELECT to_jsonb(x) INTO c FROM public.candidatos x WHERE id = 'ce3b18ad-dcc9-4275-b831-66ee24422714';
  SELECT to_jsonb(x) INTO ch FROM public.chapas_2026 x WHERE chave = '2026:GO:danilo-pinheiro-evangelista-da-silva';
  IF c IS DISTINCT FROM ((r->'candidato') || jsonb_build_object('nome_urna', 'Danilo da Silva',
       'biografia', replace(r->'candidato'->>'biografia', 'que usa o nome de urna Danilo Pinheiro,', 'que usa o nome de urna Danilo da Silva,')))
     OR ch IS DISTINCT FROM ((r->'chapa') || jsonb_build_object('titular_nome_urna', 'DANILO DA SILVA'))
     OR r->>'outros_candidatos_digest' IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '' ORDER BY x.id), '')) FROM public.candidatos x WHERE id <> 'ce3b18ad-dcc9-4275-b831-66ee24422714')
     OR r->>'outras_chapas_digest' IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '' ORDER BY x.chave), '')) FROM public.chapas_2026 x WHERE chave <> '2026:GO:danilo-pinheiro-evangelista-da-silva') THEN
    RAISE EXCEPTION 'danilo rollback: drift em candidato/chapa ou outras linhas';
  END IF;
  UPDATE public.candidatos SET nome_urna = r->'candidato'->>'nome_urna', biografia = r->'candidato'->>'biografia'
    WHERE id = 'ce3b18ad-dcc9-4275-b831-66ee24422714';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'danilo rollback: candidato ausente'; END IF;
  UPDATE public.chapas_2026 SET titular_nome_urna = r->'chapa'->>'titular_nome_urna'
    WHERE chave = '2026:GO:danilo-pinheiro-evangelista-da-silva';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'danilo rollback: chapa ausente'; END IF;
  IF (SELECT to_jsonb(x) FROM public.candidatos x WHERE id = 'ce3b18ad-dcc9-4275-b831-66ee24422714') IS DISTINCT FROM r->'candidato'
     OR (SELECT to_jsonb(x) FROM public.chapas_2026 x WHERE chave = '2026:GO:danilo-pinheiro-evangelista-da-silva') IS DISTINCT FROM r->'chapa' THEN
    RAISE EXCEPTION 'danilo rollback: restauração divergiu';
  END IF;
  INSERT INTO public.coleta_log (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao, natureza)
  VALUES ('tse-consulta-cand-2026', 'candidato', 'danilo-pinheiro:nome_urna',
    'ce3b18ad-dcc9-4275-b831-66ee24422714', 'encontrado', 2,
    'Três campos restaurados da preimagem migration:20260907180000',
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
    'rollback:20260907180000', 'escrita');
  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260907180000';
END
$rollback$;
COMMIT;
