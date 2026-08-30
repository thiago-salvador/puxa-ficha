\set ON_ERROR_STOP on
SET default_transaction_read_only=on;
DO $$ DECLARE ledger integer; receipts integer; exact_rows integer; qids integer; official integer; nulled integer; BEGIN
  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version='20260830120000';
  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao='migration:20260830120000:profissao-qid-tse-2026';
  SELECT count(*) INTO exact_rows FROM (SELECT l.*,substring(l.detalhe from 27)::jsonb AS d FROM public.coleta_log l WHERE l.execucao='migration:20260830120000:profissao-qid-tse-2026') r JOIN public.candidatos c ON r.fonte='tse-candidaturas' AND r.escopo='candidato' AND r.alvo=c.slug AND r.candidato_id=c.id AND r.resultado='encontrado' AND r.volume=1 AND r.url='https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip' AND r.natureza='escrita' AND r.d->>'source_sha256'='eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27' AND c.profissao_declarada IS NOT DISTINCT FROM (r.d->>'target_value') AND c.ultima_atualizacao=r.executado_em;
  SELECT count(*) INTO qids FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$';
  SELECT count(*) INTO official FROM (SELECT l.*,substring(l.detalhe from 27)::jsonb AS d FROM public.coleta_log l WHERE l.execucao='migration:20260830120000:profissao-qid-tse-2026') r JOIN public.candidatos c ON c.id=r.candidato_id WHERE r.d->>'source_kind'='tse_2026_declared_occupation' AND c.profissao_declarada IS NOT DISTINCT FROM r.d->>'target_value';
  SELECT count(*) INTO nulled FROM (SELECT l.*,substring(l.detalhe from 27)::jsonb AS d FROM public.coleta_log l WHERE l.execucao='migration:20260830120000:profissao-qid-tse-2026') r JOIN public.candidatos c ON c.id=r.candidato_id WHERE r.d->>'source_kind'='no_verified_tse_2026_link' AND c.profissao_declarada IS NULL;
  IF ledger<>1 OR receipts<>63 OR exact_rows<>63 OR qids<>0 OR official<>39 OR nulled<>24 THEN RAISE EXCEPTION 'profissao QID readback ledger=% receipts=% exact=% qids=% official=% null=%',ledger,receipts,exact_rows,qids,official,nulled; END IF;
END $$;
SELECT 39 AS official_tse_2026,24 AS null_without_verified_link;
