-- Readback somente leitura e fail-closed da 20260810094000.
DO $readback$
DECLARE
  v_ledger integer;
  v_publicado_2006 integer;
  v_ausencia_2008 integer;
  v_cruzados integer;
  v_preservados integer;
  v_total_2006 integer;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810094000';
  IF v_ledger <> 1 THEN
    RAISE EXCEPTION 'readback 20260810094000: ledger=% (esperado 1)', v_ledger;
  END IF;

  SELECT count(*) INTO v_publicado_2006
    FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND p.ano_eleicao = 2006
     AND p.valor_total = 0
     AND p.bens = '[{"tipo":"Outros bens e direitos","descricao":"Nenhum bem a declarar","valor":0}]'::jsonb
     AND p.fonte = 'TSE Dados Abertos bem_candidato_2006 SQ 12132 RJ (declaracao de nenhum bem)';
  SELECT count(*) INTO v_total_2006
    FROM public.patrimonio p JOIN public.candidatos c ON c.id=p.candidato_id
   WHERE c.slug='cabo-daciolo' AND p.ano_eleicao=2006;
  SELECT count(*) INTO v_ausencia_2008
    FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id = a.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND a.ano_eleicao = 2008
     AND a.sq_candidato = '14144'
     AND a.fonte_url = 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2008.zip'
     AND a.verificado_em = '2026-08-10T19:00:00Z'::timestamptz
     AND a.detalhe = 'Pacote oficial bem_candidato_2008 lido de ponta a ponta (27 CSVs, 1.582.638 linhas): zero registros para o SQ_CANDIDATO 14144 em RJ. O registro de candidatura do mesmo ano marca ST_DECLARAR_BENS = "N". DivulgaCandContas (buscar/2008/60011/14422/candidato/14144) devolve bens vazio e totalDeBens 0. Lido em 10/08/2026.'
     AND a.execucao = 'R1-daciolo-2006-2008-20260810';
  SELECT count(*) INTO v_cruzados FROM (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id = a.candidato_id
     WHERE c.slug = 'cabo-daciolo' AND a.ano_eleicao = 2006
    UNION ALL
    SELECT 1 FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
     WHERE c.slug = 'cabo-daciolo' AND p.ano_eleicao = 2008
  ) x;
  SELECT
    (SELECT count(*) FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
      WHERE c.slug = 'cabo-daciolo' AND p.ano_eleicao IN (2014, 2022))
    +
    (SELECT count(*) FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id = a.candidato_id
      WHERE c.slug = 'cabo-daciolo' AND a.ano_eleicao = 2018 AND a.sq_candidato = '280000602500')
    INTO v_preservados;
  IF v_publicado_2006 <> 1 OR v_total_2006 <> 1 OR v_ausencia_2008 <> 1 OR v_cruzados <> 0 OR v_preservados <> 3 THEN
    RAISE EXCEPTION 'readback 20260810094000: publicado_2006=% total_2006=% ausencia_2008=% cruzados=% preservados=%',
      v_publicado_2006, v_total_2006, v_ausencia_2008, v_cruzados, v_preservados;
  END IF;
END
$readback$;

SELECT 2006 AS ano, 'publicado_zero_declarado' AS resultado
UNION ALL
SELECT 2008, 'ausencia_oficial_confirmada';
