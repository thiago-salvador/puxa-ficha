-- Gate SQL do readback da 20260810093000. O payload completo e comparado por
-- `npm run audit:patrimonio-rerun:readback`; este arquivo prova ledger,
-- cardinalidade e que os dois casos indeterminados nao viraram ausencia.
DO $readback$
DECLARE
  v_ledger integer;
  v_publicados integer;
  v_indeterminados_com_dado integer;
  v_assinatura_payload text;
  v_publicados_com_ausencia integer;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810093000';
  SELECT count(*) INTO v_publicados
    FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE p.ano_eleicao = 2026
     AND c.slug IN (
       'andre-marinho','cleber-rabelo','efraim-filho','geraldo-carvalho',
       'ivan-moraes','joao-campos','joel-rodrigues','raquel-lyra',
       'jose-estevao','samara-mineiro','priscila-voigt'
     );
  SELECT count(*) INTO v_indeterminados_com_dado FROM (
    SELECT 1 FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
     WHERE p.ano_eleicao = 2026 AND c.slug IN ('dr-luisinho','preta-lu')
    UNION ALL
    SELECT 1 FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id = a.candidato_id
     WHERE a.ano_eleicao = 2026 AND c.slug IN ('dr-luisinho','preta-lu')
  ) x;
  SELECT md5(string_agg(concat_ws(chr(30),c.slug,p.ano_eleicao::text,
           coalesce(p.valor_total::text,'<null>'),coalesce(p.bens::text,'<null>'),
           coalesce(p.fonte,'<null>')),chr(31) ORDER BY c.slug))
    INTO v_assinatura_payload
    FROM public.patrimonio p JOIN public.candidatos c ON c.id=p.candidato_id
   WHERE p.ano_eleicao=2026 AND c.slug IN (
     'andre-marinho','cleber-rabelo','efraim-filho','geraldo-carvalho',
     'ivan-moraes','joao-campos','joel-rodrigues','raquel-lyra',
     'jose-estevao','samara-mineiro','priscila-voigt'
   );
  SELECT count(*) INTO v_publicados_com_ausencia
    FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id=a.candidato_id
   WHERE a.ano_eleicao=2026 AND c.slug IN (
     'andre-marinho','cleber-rabelo','efraim-filho','geraldo-carvalho',
     'ivan-moraes','joao-campos','joel-rodrigues','raquel-lyra',
     'jose-estevao','samara-mineiro','priscila-voigt'
   );
  IF v_ledger <> 1 OR v_publicados <> 11 OR v_indeterminados_com_dado <> 0
     OR v_publicados_com_ausencia <> 0
     OR v_assinatura_payload IS DISTINCT FROM '1ef5d709c5c70ac2ac3fd6a5270057f9' THEN
    RAISE EXCEPTION 'readback 20260810093000: ledger=% publicados=% indeterminados_com_dado=% publicados_com_ausencia=% assinatura_payload=%',
      v_ledger, v_publicados, v_indeterminados_com_dado, v_publicados_com_ausencia, v_assinatura_payload;
  END IF;
END
$readback$;

SELECT 'payload SQL integral e dois estados nao_coletado confirmados' AS prova;
