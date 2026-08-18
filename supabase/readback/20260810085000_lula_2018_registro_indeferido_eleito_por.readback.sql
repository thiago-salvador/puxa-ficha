-- Readback somente leitura e fail-closed da 20260810085000.
DO $readback$
DECLARE
  v_ledger integer;
  v_lula integer;
  v_restantes integer;
  v_lula_total integer;
  v_restantes_extras integer;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810085000';
  IF v_ledger <> 1 THEN
    RAISE EXCEPTION 'readback 20260810085000: ledger=% (esperado 1)', v_ledger;
  END IF;

  SELECT count(*) INTO v_lula
    FROM public.historico_politico h
    JOIN public.candidatos c ON c.id = h.candidato_id
   WHERE c.slug = 'lula'
     AND h.cargo = 'Presidente'
     AND h.periodo_inicio = 2018
     AND h.observacoes LIKE '%280000625869%'
     AND h.observacoes ~* 'INDEFERID'
     AND h.eleito_por IS NULL;
  IF v_lula <> 1 THEN
    RAISE EXCEPTION 'readback 20260810085000: Lula 2018 corrigido=% (esperado 1)', v_lula;
  END IF;
  SELECT count(*) INTO v_lula_total
    FROM public.historico_politico h JOIN public.candidatos c ON c.id=h.candidato_id
   WHERE c.slug='lula' AND h.cargo='Presidente' AND h.periodo_inicio=2018
     AND h.observacoes LIKE '%280000625869%';
  IF v_lula_total <> 1 THEN
    RAISE EXCEPTION 'readback 20260810085000: cardinalidade total Lula 2018=% (esperado 1)', v_lula_total;
  END IF;

  SELECT count(*) INTO v_restantes
    FROM public.historico_politico h JOIN public.candidatos c ON c.id=h.candidato_id
   WHERE c.slug='rui-costa-pimenta' AND h.cargo='Presidente' AND h.periodo_inicio=2006
     AND h.observacoes ~* 'INDEFERID'
     AND h.eleito_por='nao eleito';
  SELECT count(*) INTO v_restantes_extras
    FROM public.historico_politico h JOIN public.candidatos c ON c.id=h.candidato_id
   WHERE h.observacoes ~* 'INDEFERID' AND h.eleito_por='nao eleito'
     AND NOT (c.slug='rui-costa-pimenta' AND h.cargo='Presidente' AND h.periodo_inicio=2006
       AND h.observacoes ~* 'INDEFERID');
  IF v_restantes <> 1 OR v_restantes_extras <> 0 THEN
    RAISE EXCEPTION 'readback 20260810085000: Rui 2006=% residuais_extras=%', v_restantes, v_restantes_extras;
  END IF;
END
$readback$;

SELECT c.slug, h.cargo, h.periodo_inicio, h.eleito_por, h.observacoes
  FROM public.historico_politico h
  JOIN public.candidatos c ON c.id = h.candidato_id
 WHERE (c.slug = 'lula' AND h.observacoes LIKE '%280000625869%')
    OR (h.observacoes ~* 'INDEFERID' AND h.eleito_por = 'nao eleito')
 ORDER BY c.slug, h.periodo_inicio;
