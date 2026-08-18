-- Rollback da 20260810094000_daciolo_patrimonio_2006_2008.sql.
--
-- Devolve o `cabo-daciolo` ao estado em que 2006 e 2008 eram `nao_coletado`:
-- remove a declaracao de R$ 0,00 de 2006 e a ausencia oficial de 2008.
--
-- ## As guardas estao no SQL, nao num comentario esperando alguem descomentar
--
-- Cada linha so e removida se ainda estiver EXATAMENTE como a forward a deixou:
-- 2006 com valor 0 e o bem literal "Nenhum bem a declarar"; 2008 com o
-- SQ_CANDIDATO 14144 e a execucao desta rodada. Se uma curadoria posterior
-- mexeu em qualquer um dos dois, esse valor e decisao nova, apaga-lo seria
-- destruir dado bom para desfazer dado velho, e o rollback ABORTA inteiro.
--
-- Nada aqui toca 2014, 2018 e 2022, e a pos-condicao confere isso.
--
-- SEM `BEGIN;`/`COMMIT;` proprios: quem executa envolve este arquivo inteiro,
-- inclusive a remocao do ledger abaixo, numa transacao externa unica.

DO $rb$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.candidatos WHERE slug = 'cabo-daciolo';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'rollback daciolo 2006/2008: ficha cabo-daciolo com cardinalidade % (esperado 1)', v_n;
  END IF;

  -- 2006 tem de estar como a forward deixou: uma linha, valor zero, bem literal.
  SELECT count(*) INTO v_n
    FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE c.slug = 'cabo-daciolo'
     AND p.ano_eleicao = 2006
     AND p.valor_total = 0
     AND p.bens -> 0 ->> 'descricao' = 'Nenhum bem a declarar';
  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'rollback daciolo 2006: a linha de patrimonio nao esta como a forward deixou (% casaram, esperado 1); ABORTADO para nao destruir curadoria posterior', v_n;
  END IF;

  -- 2008 tem de estar como a forward deixou: SQ 14144 e a execucao desta rodada.
  SELECT count(*) INTO v_n
    FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id = a.candidato_id
   WHERE c.slug = 'cabo-daciolo'
     AND a.ano_eleicao = 2008
     AND a.sq_candidato = '14144'
     AND a.execucao = 'R1-daciolo-2006-2008-20260810';
  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'rollback daciolo 2008: a ausencia oficial nao esta como a forward deixou (% casaram, esperado 1); ABORTADO para nao destruir curadoria posterior', v_n;
  END IF;

  -- Predicado inteiro no statement, mesma regra da forward.
  -- @write tabela=patrimonio slug=cabo-daciolo ano=2006 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  DELETE FROM public.patrimonio p
   USING public.candidatos c
   WHERE c.id = p.candidato_id
     AND c.slug = 'cabo-daciolo'
     AND p.ano_eleicao = 2006
     AND p.valor_total = 0
     AND p.bens -> 0 ->> 'descricao' = 'Nenhum bem a declarar';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'rollback daciolo 2006: % linha(s) removida(s), esperado 1', v_n;
  END IF;

  -- @write tabela=patrimonio_ausencia_oficial slug=cabo-daciolo ano=2008 campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao
  DELETE FROM public.patrimonio_ausencia_oficial a
   USING public.candidatos c
   WHERE c.id = a.candidato_id
     AND c.slug = 'cabo-daciolo'
     AND a.ano_eleicao = 2008
     AND a.sq_candidato = '14144'
     AND a.execucao = 'R1-daciolo-2006-2008-20260810';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'rollback daciolo 2008: % linha(s) removida(s), esperado 1', v_n;
  END IF;

  -- Pos-condicao de nao-dano: os tres anos que ja estavam fechados continuam.
  SELECT count(*) INTO v_n
    FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND p.ano_eleicao IN (2014, 2022);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'rollback daciolo: patrimonio de 2014/2022 saiu de 2 para % linha(s)', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id = a.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND a.ano_eleicao = 2018;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'rollback daciolo: ausencia oficial de 2018 sumiu ou duplicou (% linha(s))', v_n;
  END IF;
END
$rb$;

-- @write tabela=supabase_migrations.schema_migrations campos=version
DELETE FROM supabase_migrations.schema_migrations
 WHERE version = '20260810094000';
