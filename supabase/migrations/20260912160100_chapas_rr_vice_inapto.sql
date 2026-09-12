-- Recibo TSE 12/09/2026: Jota inapto. Não afirma substituição de Gregório.
BEGIN;
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;
DO $data$
DECLARE changed integer; before_digest text; after_digest text;
BEGIN
  IF current_setting('pf.replay',true)='true' AND NOT EXISTS (SELECT 1 FROM public.chapas_2026 WHERE chave='2026:RR:jose-clebio-genuino-do-nascimento') THEN RETURN; END IF;
  SELECT md5(coalesce(string_agg((to_jsonb(ch)-'vice_situacao_divulgacand')::text,'' ORDER BY id),'')) INTO before_digest FROM public.chapas_2026 ch;
  UPDATE public.chapas_2026 SET vice_situacao_divulgacand='{"domain":"divulgacand_vices","situacao_vice":3,"status":"inapto","titular_sq_candidato":"230002553857","vice_sq_candidato":"230002554442","vice_nome_urna":"JOTA RODRIGUES","vice_partido_sigla":"PCO","uf":"RR","source_url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/RR/20322002026/candidato/230002553857","source_sha256":"feeacd33aed30e896405e59223800703e4ac0237d3b1429a649bba4ad73cbe42","checked_at":"2026-09-12T15:32:15.536Z"}'::jsonb
  WHERE chave='2026:RR:jose-clebio-genuino-do-nascimento' AND titular_sq_candidato='230002553857'
AND vice_sq_candidato='230002554442' AND vice_nome_urna='JOTA RODRIGUES' AND vice_partido_sigla='PCO'
AND fonte_tipo='legado' AND fonte_detalhe IS NULL AND tse_situacao_vice_codigo='-3'
AND fonte_sha256='342852c06b645fa90f4bc767153b497995ead648542d04059ccf14fb745c25d8' AND vice_situacao_divulgacand IS NULL;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'vice RR: preimagem divergiu'; END IF;
  SELECT md5(coalesce(string_agg((to_jsonb(ch)-'vice_situacao_divulgacand')::text,'' ORDER BY id),'')) INTO after_digest FROM public.chapas_2026 ch;
  IF before_digest IS DISTINCT FROM after_digest THEN RAISE EXCEPTION 'vice RR: coluna alheia alterada'; END IF;
END $data$;
COMMIT;
