-- Rollback da 20260810085000_lula_2018_registro_indeferido_eleito_por.sql.
--
-- Devolve `eleito_por = 'nao eleito'` a candidatura indeferida do Lula em 2018.
--
-- ## A guarda esta no SQL, nao num comentario esperando alguem descomentar
--
-- So restaura quando o campo ainda esta EXATAMENTE como a forward o deixou
-- (NULL). Se uma curadoria posterior ja escreveu outro valor ali, esse valor e
-- decisao nova e sobrescreve-lo seria destruir dado bom para desfazer dado
-- velho: nesse caso o rollback ABORTA e nao mexe em nada.
--
-- O alvo e o mesmo da forward, por SQ_CANDIDATO 280000625869 mais cargo e ano,
-- com cardinalidade exigida igual a 1.
--
-- SEM `BEGIN;`/`COMMIT;` proprios: quem executa envolve este arquivo inteiro,
-- inclusive a remocao do ledger abaixo, numa transacao externa unica.

DO $rb$
DECLARE
  v_encontrados integer;
  v_escritos integer;
BEGIN
  SELECT count(*)
    INTO v_encontrados
    FROM public.historico_politico h
    JOIN public.candidatos c ON c.id = h.candidato_id
   WHERE c.slug = 'lula'
     AND h.cargo = 'Presidente'
     AND h.periodo_inicio = 2018
     AND h.observacoes LIKE '%280000625869%';

  IF v_encontrados <> 1 THEN
    RAISE EXCEPTION
      'rollback lula 2018: alvo com cardinalidade % (esperado exatamente 1)', v_encontrados;
  END IF;

  SELECT count(*) INTO v_encontrados
    FROM public.historico_politico h
    JOIN public.candidatos c ON c.id = h.candidato_id
   WHERE c.slug = 'lula'
     AND h.cargo = 'Presidente'
     AND h.periodo_inicio = 2018
     AND h.observacoes LIKE '%280000625869%'
     AND h.eleito_por IS NULL;

  IF v_encontrados <> 1 THEN
    RAISE EXCEPTION
      'rollback lula 2018: eleito_por nao esta NULL como a forward deixou; ABORTADO para nao destruir curadoria posterior';
  END IF;

  -- Predicado inteiro no statement, mesma regra da forward: a escrita diz
  -- sozinha em quem mexe, sem depender de variavel.
  -- @write tabela=historico_politico slug=lula campos=eleito_por
  UPDATE public.historico_politico h
     SET eleito_por = 'nao eleito'
    FROM public.candidatos c
   WHERE c.id = h.candidato_id
     AND c.slug = 'lula'
     AND h.cargo = 'Presidente'
     AND h.periodo_inicio = 2018
     AND h.observacoes LIKE '%280000625869%'
     AND h.eleito_por IS NULL;

  GET DIAGNOSTICS v_escritos = ROW_COUNT;
  IF v_escritos <> 1 THEN
    RAISE EXCEPTION 'rollback lula 2018: % linha(s) restaurada(s), esperado 1', v_escritos;
  END IF;
END
$rb$;

DELETE FROM supabase_migrations.schema_migrations
 WHERE version = '20260810085000';
