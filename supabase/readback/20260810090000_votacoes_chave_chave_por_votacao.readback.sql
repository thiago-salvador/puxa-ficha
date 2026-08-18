-- Readback somente leitura e fail-closed do contrato estrutural 20260810090000.
DO $readback$
DECLARE
  v_ledger integer;
  v_colunas integer;
  v_constraint integer;
  v_indice integer;
  v_invalidas integer;
  v_assinatura_constraint text;
  v_assinatura_indice text;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810090000';
  IF v_ledger <> 1 THEN
    RAISE EXCEPTION 'readback 20260810090000: ledger=% (esperado 1)', v_ledger;
  END IF;

  SELECT count(*) INTO v_colunas
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE n.nspname='public' AND c.relname='votacoes_chave'
     AND a.attname IN ('fonte','votacao_id_api') AND format_type(a.atttypid,a.atttypmod)='text'
     AND NOT a.attnotnull AND d.adbin IS NULL
     AND col_description(c.oid,a.attnum) IS NOT DISTINCT FROM CASE a.attname
       WHEN 'fonte' THEN 'Fonte da votacao: camara (Camara Dados Abertos v2) ou senado (Senado Dados Abertos). Metade da chave composta com votacao_id_api.'
       WHEN 'votacao_id_api' THEN 'Id EXATO da votacao na fonte, ex.: 2310837-8. Enderecar por proposicao aceita qualquer rodada (destaque, urgencia, redacao final) e foi a causa das 6 linhas defeituosas de 10/08/2026.'
     END;
  IF v_colunas <> 2 THEN
    RAISE EXCEPTION 'readback 20260810090000: colunas text=% de 2', v_colunas;
  END IF;

  SELECT count(*) INTO v_constraint
    FROM pg_constraint
   WHERE conrelid = 'public.votacoes_chave'::regclass
     AND conname = 'votacoes_chave_fonte_id_consistentes_check'
     AND convalidated;
  SELECT count(*) INTO v_indice
    FROM pg_index
   WHERE indexrelid = 'public.votacoes_chave_fonte_votacao_id_api_key'::regclass
     AND indisunique AND indpred IS NOT NULL;
  SELECT md5(regexp_replace(pg_get_constraintdef(oid), '[[:space:]]+', '', 'g'))
    INTO v_assinatura_constraint FROM pg_constraint
   WHERE conrelid='public.votacoes_chave'::regclass
     AND conname='votacoes_chave_fonte_id_consistentes_check';
  SELECT md5(regexp_replace(pg_get_indexdef(indexrelid), '[[:space:]]+', '', 'g'))
    INTO v_assinatura_indice FROM pg_index
   WHERE indexrelid='public.votacoes_chave_fonte_votacao_id_api_key'::regclass;
  IF v_constraint <> 1 OR v_indice <> 1
     OR v_assinatura_constraint IS DISTINCT FROM 'eaf254d9d931e624495ca3ecd88c2c25'
     OR v_assinatura_indice IS DISTINCT FROM '7445d52adb5d30e096439240607a1e0b' THEN
    RAISE EXCEPTION 'readback 20260810090000: constraint=% indice_unico_parcial=% assinatura_constraint=% assinatura_indice=%',
      v_constraint, v_indice, v_assinatura_constraint, v_assinatura_indice;
  END IF;

  SELECT count(*) INTO v_invalidas
    FROM public.votacoes_chave
   WHERE (fonte IS NULL) <> (votacao_id_api IS NULL)
      OR (fonte IS NOT NULL AND (fonte NOT IN ('camara', 'senado') OR btrim(votacao_id_api) = ''));
  IF v_invalidas <> 0 THEN
    RAISE EXCEPTION 'readback 20260810090000: chaves invalidas=%', v_invalidas;
  END IF;
END
$readback$;

SELECT fonte, count(*) AS linhas, count(DISTINCT votacao_id_api) AS ids_unicos
  FROM public.votacoes_chave
 GROUP BY fonte
 ORDER BY fonte NULLS FIRST;
