-- Issue #283. Fonte oficial: consulta_cand_2026.zip, run 34144197661,
-- 2026-09-07T16:39:21.607Z, SHA256
-- 640f5ee64e25c9f594efe614f49d599091c098d5972c6eac981d0661de4d5e2a.
-- Atualiza três campos atuais. Nome civil, slug, timestamps e snapshots ficam
-- intactos. A origem da correção vive no recibo, não no hash do snapshot antigo.
BEGIN;
LOCK TABLE public.candidatos, public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;
DO $migration$
DECLARE
  candidate_before jsonb;
  chapa_before jsonb;
  candidate_after jsonb;
  chapa_after jsonb;
  candidate_digest text;
  chapa_digest text;
  n integer;
BEGIN
  -- Replay vazio explícito; alvo ausente em banco populado nunca é sucesso.
  IF current_setting('pf.replay', true) = 'true'
     OR NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RETURN;
  END IF;
  SELECT to_jsonb(c) INTO candidate_before FROM public.candidatos c
  WHERE id = 'ce3b18ad-dcc9-4275-b831-66ee24422714'
    AND slug = 'danilo-pinheiro' AND sq_candidato_2026 = '90002553733'
    AND nome_urna = 'Danilo Pinheiro'
    AND nome_completo = 'Danilo Pinheiro Evangelista da Silva'
    AND cargo_disputado = 'Governador' AND estado = 'GO' AND partido_sigla = 'PCO'
    AND to_jsonb(fonte_dados) = '["TSE consulta_cand 2026; snapshot 17/08/2026","https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip","https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/GO/20322002026/candidato/90002553733"]'::jsonb
    AND biografia LIKE 'Danilo Pinheiro Evangelista da Silva, que usa o nome de urna Danilo Pinheiro, nasceu%'
    AND (length(biografia) - length(replace(biografia, 'que usa o nome de urna Danilo Pinheiro,', ''))) = length('que usa o nome de urna Danilo Pinheiro,');
  SELECT to_jsonb(ch) INTO chapa_before FROM public.chapas_2026 ch
  WHERE chave = '2026:GO:danilo-pinheiro-evangelista-da-silva'
    AND titular_candidato_id = 'ce3b18ad-dcc9-4275-b831-66ee24422714'
    AND titular_sq_candidato = '90002553733'
    AND titular_nome_urna = 'DANILO PINHEIRO'
    AND titular_nome_completo = 'DANILO PINHEIRO EVANGELISTA DA SILVA'
    AND titular_partido_sigla = 'PCO' AND uf = 'GO' AND cargo_titular = 'Governador'
    AND fonte_url = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'
    AND fonte_sha256 = 'eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27'
    AND snapshot_em = '2026-08-28T01:58:24.127+00:00'::timestamptz;
  IF candidate_before IS NULL OR chapa_before IS NULL
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260907180000') THEN
    RAISE EXCEPTION 'danilo: preimagem/identidade/origem divergiu ou migration já aplicada';
  END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '' ORDER BY c.id), '')) INTO candidate_digest
    FROM public.candidatos c WHERE id <> 'ce3b18ad-dcc9-4275-b831-66ee24422714';
  SELECT md5(coalesce(string_agg(to_jsonb(ch)::text, '' ORDER BY ch.chave), '')) INTO chapa_digest
    FROM public.chapas_2026 ch WHERE chave <> '2026:GO:danilo-pinheiro-evangelista-da-silva';

  -- Recibo de preimagem gravado antes de qualquer UPDATE, na mesma transação.
  -- @write tabela=coleta_log ref=migration:20260907180000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao, natureza)
  VALUES ('tse-consulta-cand-2026', 'candidato', 'danilo-pinheiro:nome_urna',
    'ce3b18ad-dcc9-4275-b831-66ee24422714', 'encontrado', 2,
    jsonb_build_object('candidato', candidate_before, 'chapa', chapa_before,
      'outros_candidatos_digest', candidate_digest, 'outras_chapas_digest', chapa_digest,
      'fonte_sha256', '640f5ee64e25c9f594efe614f49d599091c098d5972c6eac981d0661de4d5e2a',
      'fonte_lida_em', '2026-09-07T16:39:21.607Z', 'run', '34144197661')::text,
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
    'migration:20260907180000', 'escrita');
  -- @write tabela=candidatos slug=danilo-pinheiro campos=nome_urna,biografia
  UPDATE public.candidatos SET nome_urna = 'Danilo da Silva',
    biografia = replace(biografia, 'que usa o nome de urna Danilo Pinheiro,', 'que usa o nome de urna Danilo da Silva,')
  WHERE id = 'ce3b18ad-dcc9-4275-b831-66ee24422714' AND slug = 'danilo-pinheiro'
    AND sq_candidato_2026 = '90002553733' AND nome_urna = 'Danilo Pinheiro';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'danilo: UPDATE candidatos afetou % linhas', n; END IF;
  -- @write tabela=chapas_2026 ref=danilo-nome-urna-20260907 chave="2026:GO:danilo-pinheiro-evangelista-da-silva" campos=titular_nome_urna
  UPDATE public.chapas_2026 SET titular_nome_urna = 'DANILO DA SILVA'
  WHERE chave = '2026:GO:danilo-pinheiro-evangelista-da-silva'
    AND titular_sq_candidato = '90002553733' AND titular_nome_urna = 'DANILO PINHEIRO';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'danilo: UPDATE chapas afetou % linhas', n; END IF;

  SELECT to_jsonb(c) INTO candidate_after FROM public.candidatos c WHERE id = 'ce3b18ad-dcc9-4275-b831-66ee24422714';
  SELECT to_jsonb(ch) INTO chapa_after FROM public.chapas_2026 ch WHERE chave = '2026:GO:danilo-pinheiro-evangelista-da-silva';
  IF candidate_after IS DISTINCT FROM (candidate_before || jsonb_build_object('nome_urna', 'Danilo da Silva',
       'biografia', replace(candidate_before->>'biografia', 'que usa o nome de urna Danilo Pinheiro,', 'que usa o nome de urna Danilo da Silva,')))
     OR chapa_after IS DISTINCT FROM (chapa_before || jsonb_build_object('titular_nome_urna', 'DANILO DA SILVA'))
     OR candidate_digest IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '' ORDER BY c.id), '')) FROM public.candidatos c WHERE id <> 'ce3b18ad-dcc9-4275-b831-66ee24422714')
     OR chapa_digest IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(ch)::text, '' ORDER BY ch.chave), '')) FROM public.chapas_2026 ch WHERE chave <> '2026:GO:danilo-pinheiro-evangelista-da-silva') THEN
    RAISE EXCEPTION 'danilo: pós-condição/invariância falhou';
  END IF;
END
$migration$;
COMMIT;
