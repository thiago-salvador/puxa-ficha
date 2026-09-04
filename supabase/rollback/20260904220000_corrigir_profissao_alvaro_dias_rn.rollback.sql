-- Recuperação literal da pré-imagem; restaura SENADOR, valor corrigido pela forward.
BEGIN;
DO $rollback$
DECLARE c public.candidatos%ROWTYPE; r jsonb; quantidade integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260904220000' THEN
    RAISE EXCEPTION 'profissao rollback: migration posterior ou ledger inesperado';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260904220000') <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao='rollback:20260904220000') THEN
    RAISE EXCEPTION 'profissao rollback: recibo ausente/duplicado ou rollback ja executado';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao='migration:20260904220000';
  SELECT * INTO c FROM public.candidatos WHERE id=(r->>'id')::uuid AND slug='alvaro-dias-rn' FOR UPDATE;
  IF NOT FOUND OR c.profissao_declarada IS DISTINCT FROM 'MÉDICO'
     OR c.ultima_atualizacao IS DISTINCT FROM (r->>'aplicado_em')::timestamptz
     OR md5((to_jsonb(c)-'profissao_declarada'-'ultima_atualizacao')::text) IS DISTINCT FROM r->>'campos_preservados_md5'
     OR r->'antes'->>'profissao_declarada' IS DISTINCT FROM 'SENADOR' THEN
    RAISE EXCEPTION 'profissao rollback: mudanca posterior ou preimagem invalida';
  END IF;
  -- @write tabela=candidatos slug=alvaro-dias-rn campos=profissao_declarada,ultima_atualizacao
  UPDATE public.candidatos SET profissao_declarada=r->'antes'->>'profissao_declarada',
    ultima_atualizacao=(r->'antes'->>'ultima_atualizacao')::timestamptz WHERE id=c.id AND slug='alvaro-dias-rn';
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN RAISE EXCEPTION 'profissao rollback: cardinalidade divergiu'; END IF;
  -- @write tabela=coleta_log ref=rollback:20260904220000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log(fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES('profissao-tse-2026','candidato','candidatos.profissao_declarada',c.id,'encontrado',1,r::text,
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip','rollback:20260904220000','escrita');
  DELETE FROM supabase_migrations.schema_migrations WHERE version='20260904220000';
END
$rollback$;
COMMIT;
