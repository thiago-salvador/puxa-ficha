-- Fecha os dois anos de patrimonio do `cabo-daciolo` que a ficha exibia como
-- `nao_coletado`: 2006 e 2008. As duas eleicoes ja existiam em
-- `historico_politico` com `proveniencia = 'tse'`, entao a ficha ja mostrava os
-- anos; o que faltava era o dado, e o dado agora existe, conferido em fonte
-- oficial em 10/08/2026 entre 18:50Z e 19:01Z.
--
-- ## Os dois anos NAO sao o mesmo caso, e essa e a razao de existir esta migration
--
-- 2006 -> Deputado Estadual RJ, PRTB, SQ_CANDIDATO 12132, suplente, registro
--         deferido. O pacote `bem_candidato_2006.zip` (164.722 linhas em 29
--         CSVs) TRAZ um registro para o SQ 12132 em RJ:
--
--           NR_ORDEM 1 | Outros bens e direitos | "Nenhum bem a declarar" | 0,00
--
--         Confirmado em DivulgaCandContas
--         (candidatura/buscar/2006/RJ/14423/candidato/12132 -> HTTP 200,
--         `bens: [{ordem: 1, descricao: "Nenhum bem a declarar", valor: 0.0}]`).
--         Isto e DECLARACAO de patrimonio zero, um fato positivo. Vai para
--         `patrimonio`, com valor 0,00 e o bem literal que o TSE registrou.
--
-- 2008 -> Vereador no Rio de Janeiro, PRB, SQ_CANDIDATO 14144, suplente,
--         registro deferido. O pacote `bem_candidato_2008.zip` (1.582.638 linhas
--         em 27 CSVs) NAO traz linha nenhuma para o SQ 14144 em RJ, e o proprio
--         registro de candidatura marca `ST_DECLARAR_BENS = 'N'`, coluna que so
--         existe nos layouts de 2006 e 2008. DivulgaCandContas
--         (buscar/2008/60011/14422/candidato/14144) devolve `bens: []`,
--         `totalDeBens: 0`. Isto e AUSENCIA de declaracao. Vai para
--         `patrimonio_ausencia_oficial`, com fonte e data.
--
-- ## Por que a distincao decide o texto da tela, e nao so a tabela
--
-- `patrimonio_ausencia_oficial` produz o estado `vazio_confirmado` em
-- `buildPatrimonioEleicoes`, e o componente escreve, literalmente: "O pacote
-- oficial de bens desta eleicao foi conferido e nao traz registros para este
-- candidato." Para 2008 a frase e verdadeira. Para 2006 seria FALSA: o pacote
-- traz registro, e o registro diz que nao ha bens. Registrar 2006 como ausencia
-- seria a superficie afirmando sobre a fonte o oposto do que a fonte diz.
--
-- Por isso 2006 entra como `patrimonio` publicado de R$ 0,00, com o bem literal
-- dentro, e a tela mostra a declaracao que existe em vez de negar que ela
-- exista. E a primeira linha de `patrimonio` com `valor_total = 0` da base
-- inteira, e e assim de proposito.
--
-- ## Cardinalidade exigida, e por que nao ha `NOT EXISTS` aqui
--
-- O padrao `NOT EXISTS` das migrations de 20260807 transforma alvo divergente em
-- no-op bem-sucedido, e no-op bem-sucedido grava a versao no ledger dizendo que
-- o dado entrou quando ele nao entrou. Aqui cada pre-condicao ABORTA:
-- ficha ausente, candidatura ausente no historico, dado ja presente em qualquer
-- dos dois anos, ou o cruzamento invertido (2006 como ausencia, 2008 como
-- patrimonio) param a transacao inteira.
--
-- Consequencia deliberada: esta migration FALHA no replay linear em banco vazio,
-- igual a 20260809070000 e a 20260810085000, e essa falha esta medida em
-- `scripts/audit/falhas-replay-linear.json` e prevista em
-- `scripts/audit/quebras-previstas.json`.
--
-- ## O que esta migration NAO faz
--
-- - Nao toca 2018. A ausencia oficial de 2018 (SQ 280000602500) ja esta
--   registrada desde 20260807181000 e foi re-verificada no mesmo trabalho:
--   187.054 linhas lidas, zero casaram, `totalDeBens: 0`. Continua correta.
-- - Nao toca 2014 nem 2022, que ja tem patrimonio publicado.
-- - Nao acrescenta os SQ ao seed. `ids.tse_sq_candidato` nao existe no banco:
--   mora em `data/candidatos.json`, e a entrada de 2006 e 2008 vai la, no mesmo
--   commit, porque foi a ausencia dela que produziu a nao-coleta.
--
-- SEM `BEGIN;`/`COMMIT;` proprios: quem executa envolve este arquivo mais a
-- linha do ledger numa transacao externa unica, mesma regra da 20260809070000 e
-- da 20260810085000.

DO $pf$
DECLARE
  v_n integer;
  v_valor numeric;
  v_descricao text;
BEGIN
  -- 1. A ficha existe, e e uma so.
  SELECT count(*) INTO v_n FROM public.candidatos WHERE slug = 'cabo-daciolo';
  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'daciolo patrimonio 2006/2008: ficha cabo-daciolo com cardinalidade % (esperado exatamente 1)', v_n;
  END IF;

  -- 2. As duas candidaturas do TSE existem no historico. Sem elas os anos nem
  --    aparecem na ficha, e publicar patrimonio de eleicao que a ficha nao
  --    reconhece seria escrever dado sem superficie que o mostre.
  SELECT count(*) INTO v_n
    FROM public.historico_politico h
    JOIN public.candidatos c ON c.id = h.candidato_id
   WHERE c.slug = 'cabo-daciolo'
     AND h.proveniencia = 'tse'
     AND h.periodo_inicio = 2006
     AND h.cargo = 'Deputado Estadual';
  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'daciolo patrimonio 2006/2008: candidatura de 2006 (Deputado Estadual, TSE) com cardinalidade % (esperado 1)', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.historico_politico h
    JOIN public.candidatos c ON c.id = h.candidato_id
   WHERE c.slug = 'cabo-daciolo'
     AND h.proveniencia = 'tse'
     AND h.periodo_inicio = 2008
     AND h.cargo = 'Vereador';
  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'daciolo patrimonio 2006/2008: candidatura de 2008 (Vereador, TSE) com cardinalidade % (esperado 1)', v_n;
  END IF;

  -- 3. Nenhum dos dois anos pode ter dado antes desta escrita, em tabela
  --    nenhuma. Quatro perguntas, e as duas ultimas sao o cruzamento invertido:
  --    se alguem ja tiver classificado 2006 como ausencia ou 2008 como
  --    patrimonio, essa e exatamente a confusao que esta migration existe para
  --    nao cometer, e sobrescrever em silencio esconderia a divergencia.
  SELECT count(*) INTO v_n
    FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND p.ano_eleicao = 2006;
  IF v_n <> 0 THEN
    RAISE EXCEPTION
      'daciolo patrimonio 2006/2008: ja existe(m) % linha(s) de patrimonio em 2006; ABORTADO para nao sobrescrever curadoria', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id = a.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND a.ano_eleicao = 2008;
  IF v_n <> 0 THEN
    RAISE EXCEPTION
      'daciolo patrimonio 2006/2008: ja existe ausencia oficial registrada em 2008; ABORTADO para nao sobrescrever curadoria';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id = a.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND a.ano_eleicao = 2006;
  IF v_n <> 0 THEN
    RAISE EXCEPTION
      'daciolo patrimonio 2006/2008: 2006 esta registrado como AUSENCIA oficial, e o pacote do TSE traz declaracao de nenhum bem; ABORTADO para a divergencia ser resolvida por gente';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND p.ano_eleicao = 2008;
  IF v_n <> 0 THEN
    RAISE EXCEPTION
      'daciolo patrimonio 2006/2008: 2008 tem patrimonio publicado, e o pacote do TSE nao traz registro nenhum; ABORTADO para a divergencia ser resolvida por gente';
  END IF;

  -- 4. 2006: declaracao publicada de R$ 0,00, com o bem literal do TSE.
  --    O predicado vai inteiro no statement, sem esconder o alvo atras de
  --    variavel: o gate exige que a escrita diga sozinha em quem mexe.
  -- @write tabela=patrimonio slug=cabo-daciolo ano=2006 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT c.id, 2006, 0.00,
         '[{"tipo":"Outros bens e direitos","descricao":"Nenhum bem a declarar","valor":0}]'::jsonb,
         'TSE Dados Abertos bem_candidato_2006 SQ 12132 RJ (declaracao de nenhum bem)'
    FROM public.candidatos c
   WHERE c.slug = 'cabo-daciolo';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'daciolo patrimonio 2006: % linha(s) escrita(s), esperado 1', v_n;
  END IF;

  -- 5. 2008: ausencia oficial de declaracao, com fonte e data da verificacao.
  -- @write tabela=patrimonio_ausencia_oficial slug=cabo-daciolo ano=2008 campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao
  INSERT INTO public.patrimonio_ausencia_oficial
         (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe, execucao)
  SELECT c.id, 2008, '14144',
         'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2008.zip',
         '2026-08-10T19:00:00Z'::timestamptz,
         'Pacote oficial bem_candidato_2008 lido de ponta a ponta (27 CSVs, 1.582.638 linhas): zero registros para o SQ_CANDIDATO 14144 em RJ. O registro de candidatura do mesmo ano marca ST_DECLARAR_BENS = "N". DivulgaCandContas (buscar/2008/60011/14422/candidato/14144) devolve bens vazio e totalDeBens 0. Lido em 10/08/2026.',
         'R1-daciolo-2006-2008-20260810'
    FROM public.candidatos c
   WHERE c.slug = 'cabo-daciolo';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'daciolo ausencia 2008: % linha(s) escrita(s), esperado 1', v_n;
  END IF;

  -- 6. Pos-condicao: o conteudo do que entrou, e nao so a contagem. O valor tem
  --    de ser zero E o bem tem de ser o literal do TSE: linha de zero sem o bem
  --    dentro vira, na tela, um card de R$ 0,00 sem dizer o que a fonte disse.
  SELECT p.valor_total, p.bens -> 0 ->> 'descricao'
    INTO v_valor, v_descricao
    FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND p.ano_eleicao = 2006;

  IF v_valor IS DISTINCT FROM 0 OR v_descricao IS DISTINCT FROM 'Nenhum bem a declarar' THEN
    RAISE EXCEPTION
      'daciolo patrimonio 2006: esperado valor 0 e bem "Nenhum bem a declarar", encontrado valor % e descricao %', v_valor, v_descricao;
  END IF;

  -- 7. Pos-condicao do cruzamento: depois da escrita, 2006 continua fora da
  --    tabela de ausencia e 2008 continua fora da de patrimonio. E a mesma
  --    pergunta do passo 3 feita do outro lado da escrita, e ela e barata.
  SELECT count(*) INTO v_n
    FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id = a.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND a.ano_eleicao = 2006;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'daciolo 2006: terminou como ausencia oficial, o que a fonte desmente';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND p.ano_eleicao = 2008;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'daciolo 2008: terminou com patrimonio publicado, o que a fonte desmente';
  END IF;

  -- 8. Pos-condicao de nao-dano: 2014, 2018 e 2022 seguem exatamente como
  --    estavam. Sao os tres anos que a ficha ja fechava, e esta escrita nao tem
  --    nada a ver com eles.
  SELECT count(*) INTO v_n
    FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND p.ano_eleicao IN (2014, 2022);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'daciolo: patrimonio de 2014/2022 saiu de 2 para % linha(s)', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.patrimonio_ausencia_oficial a JOIN public.candidatos c ON c.id = a.candidato_id
   WHERE c.slug = 'cabo-daciolo' AND a.ano_eleicao = 2018 AND a.sq_candidato = '280000602500';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'daciolo: ausencia oficial de 2018 (SQ 280000602500) sumiu ou duplicou (% linha(s))', v_n;
  END IF;
END
$pf$;
