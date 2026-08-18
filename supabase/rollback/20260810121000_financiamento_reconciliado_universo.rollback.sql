-- Rollback pareado da carga pf-ajustes-financiamento-20260810.
DO $$
DECLARE
  v_assinatura_financiamento text;
  v_assinatura_verificacoes text;
  v_assinatura_coleta text;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
       WHERE version = '20260810121000') <> 1 THEN
    RAISE EXCEPTION 'rollback pf-ajustes-financiamento-20260810: ledger ausente ou duplicado';
  END IF;
  IF (
    (SELECT count(*) FROM public.financiamento WHERE fonte = 'pf-ajustes-financiamento-20260810') +
    (SELECT count(*) FROM public.financiamento_verificacoes WHERE execucao = 'pf-ajustes-financiamento-20260810')
  ) <> 235 THEN
    RAISE EXCEPTION 'rollback pf-ajustes-financiamento-20260810: coorte divergente de 235';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'pf-ajustes-financiamento-20260810') <> 235 THEN
    RAISE EXCEPTION 'rollback pf-ajustes-financiamento-20260810: proveniencia divergente de 235';
  END IF;

  SELECT md5(string_agg(
           concat_ws(chr(30), c.slug, f.ano_eleicao::text,
             f.total_arrecadado::text, f.total_fundo_partidario::text,
             f.total_fundo_eleitoral::text, f.total_pessoa_fisica::text,
             f.total_recursos_proprios::text, f.maiores_doadores::text,
             coalesce(f.fonte,'<null>'), coalesce(f.sq_candidato,'<null>'),
             coalesce(f.uf_candidatura,'<null>')),
           chr(31) order by c.slug, f.ano_eleicao))
    INTO v_assinatura_financiamento
    FROM public.financiamento f
    JOIN public.candidatos c ON c.id=f.candidato_id
   WHERE f.fonte='pf-ajustes-financiamento-20260810';

  SELECT md5(string_agg(
           concat_ws(chr(30), c.slug, v.ano_eleicao::text,
             coalesce(v.sq_candidato,'<null>'),
             coalesce(v.uf_candidatura,'<null>'), v.resultado,
             coalesce(v.fonte_url,'<null>'),
             coalesce(to_char(v.verificado_em at time zone 'UTC',
               'YYYY-MM-DD"T"HH24:MI:SS.US'),'<null>'),
             coalesce(v.detalhe,'<null>'), v.execucao),
           chr(31) order by c.slug, v.ano_eleicao))
    INTO v_assinatura_verificacoes
    FROM public.financiamento_verificacoes v
    JOIN public.candidatos c ON c.id=v.candidato_id
   WHERE v.execucao='pf-ajustes-financiamento-20260810';

  SELECT md5(string_agg(
           concat_ws(chr(30), l.fonte, l.escopo, l.alvo,
             coalesce(c.slug,'<null>'), l.resultado, l.volume::text,
             coalesce(l.detalhe,'<null>'), coalesce(l.url,'<null>'),
             l.execucao, l.natureza),
           chr(31) order by l.alvo))
    INTO v_assinatura_coleta
    FROM public.coleta_log l
    LEFT JOIN public.candidatos c ON c.id=l.candidato_id
   WHERE l.execucao='pf-ajustes-financiamento-20260810';

  IF v_assinatura_financiamento <> '69cf0d34f0760fca504e174d5bdf2ec2'
     OR v_assinatura_verificacoes <> '9c35d9f79cd7a7c419a5467c039abc6d'
     OR v_assinatura_coleta <> 'ed21307a95817d8a5c0d273820e9bc40' THEN
    RAISE EXCEPTION
      'rollback pf-ajustes-financiamento-20260810: payload diverge da forward (financiamento=%, verificacoes=%, coleta=%)',
      v_assinatura_financiamento, v_assinatura_verificacoes, v_assinatura_coleta;
  END IF;
END
$$;

DELETE FROM supabase_migrations.schema_migrations
 WHERE version = '20260810121000';
-- @write tabela=coleta_log ref=pf-ajustes-financiamento-20260810 campos=execucao
DELETE FROM public.coleta_log
WHERE execucao = 'pf-ajustes-financiamento-20260810';

-- @write tabela=financiamento_verificacoes ref=pf-ajustes-financiamento-20260810 campos=execucao
DELETE FROM public.financiamento_verificacoes
WHERE execucao = 'pf-ajustes-financiamento-20260810';

-- @write tabela=financiamento ref=pf-ajustes-financiamento-20260810 campos=fonte
DELETE FROM public.financiamento
WHERE fonte = 'pf-ajustes-financiamento-20260810';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'pf-ajustes-financiamento-20260810')
     OR EXISTS (SELECT 1 FROM public.financiamento_verificacoes WHERE execucao = 'pf-ajustes-financiamento-20260810')
     OR EXISTS (SELECT 1 FROM public.financiamento WHERE fonte = 'pf-ajustes-financiamento-20260810') THEN
    RAISE EXCEPTION 'rollback pf-ajustes-financiamento-20260810: residuos apos exclusao';
  END IF;
END
$$;
