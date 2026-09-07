-- Deve rodar logo após a aplicação. Confere valores, recibo e invariância total.
DO $readback$
DECLARE r jsonb; c jsonb; ch jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260907180000' AND volume = 2 AND natureza = 'escrita') <> 1 THEN
    RAISE EXCEPTION 'danilo readback: recibo ausente/duplicado/inválido';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260907180000';
  SELECT to_jsonb(x) INTO c FROM public.candidatos x WHERE id = 'ce3b18ad-dcc9-4275-b831-66ee24422714';
  SELECT to_jsonb(x) INTO ch FROM public.chapas_2026 x WHERE chave = '2026:GO:danilo-pinheiro-evangelista-da-silva';
  IF c IS DISTINCT FROM ((r->'candidato') || jsonb_build_object('nome_urna', 'Danilo da Silva',
       'biografia', replace(r->'candidato'->>'biografia', 'que usa o nome de urna Danilo Pinheiro,', 'que usa o nome de urna Danilo da Silva,')))
     OR ch IS DISTINCT FROM ((r->'chapa') || jsonb_build_object('titular_nome_urna', 'DANILO DA SILVA'))
     OR r->>'outros_candidatos_digest' IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '' ORDER BY x.id), '')) FROM public.candidatos x WHERE id <> 'ce3b18ad-dcc9-4275-b831-66ee24422714')
     OR r->>'outras_chapas_digest' IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '' ORDER BY x.chave), '')) FROM public.chapas_2026 x WHERE chave <> '2026:GO:danilo-pinheiro-evangelista-da-silva') THEN
    RAISE EXCEPTION 'danilo readback: estado final/invariância divergiu';
  END IF;
END
$readback$;
