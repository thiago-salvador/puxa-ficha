-- Corrige `eleito_por` da candidatura INDEFERIDA do Lula em 2018.
--
-- ## O defeito, medido no raw oficial e nao suposto
--
-- A linha guarda `eleito_por = 'nao eleito'`. O raw do TSE para essa candidatura
-- diz outra coisa, e a diferenca nao e de rotulo, e de fato:
--
--   GET https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/
--       listar/2018/BR/2022802018/1/candidatos
--   -> { "id": 280000625869, "nomeUrna": "LULA", "numero": 13,
--        "descricaoSituacao": "Indeferido",
--        "descricaoTotalizacao": "Concorrendo",
--        "candidatoApto": false }
--
-- Lido em 09/08/2026. O TSE separa SITUACAO do registro de TOTALIZACAO dos
-- votos. O registro foi indeferido e a totalizacao ficou congelada em
-- "Concorrendo": nao houve apuracao de votos para ele. "Nao eleito" afirma uma
-- disputa que nao aconteceu, e por isso e o unico valor persistido desta frente
-- que diverge da fonte.
--
-- ## O que esta migration NAO faz
--
-- - Nao apaga dado bruto. `observacoes` continua com o texto integral do
--   indeferimento, o SQ_CANDIDATO e a URL da fonte. O estado "registro
--   indeferido" que a ficha agora exibe sai de la, nao deste campo.
-- - Nao toca a linha equivalente do `rui-costa-pimenta` em 2006. Naquele caso o
--   raw traz `descricaoTotalizacao = 'Nao eleito'` de verdade
--   (candidatura/buscar/2006/BR/14423/candidato/27), entao `eleito_por =
--   'nao eleito'` e FIEL a fonte e mexer nele e que seria o erro. A diferenca
--   entre os dois so aparece quando se le o raw, e e por isso que so um muda.
-- - Nao corrige os outros 155 falsos "Nao Eleito" da base: aqueles nao sao dado
--   errado, sao conversao de exibicao errada, corrigida em
--   `src/lib/resultado-eleitoral.ts`. Migration ali destruiria dado correto.
--
-- ## Alvo por SQ_CANDIDATO, nao por slug mais ano
--
-- O identificador da candidatura no TSE (280000625869) esta na propria
-- observacao da linha. Casar por ele, mais eleicao de 2018 e cargo, e o que
-- garante que a escrita atinge a candidatura conferida no raw e nenhuma outra.
-- A cardinalidade e exigida igual a 1 antes e depois: se a base mudar de forma
-- que o alvo deixe de ser unico, a migration ABORTA em vez de escrever em linha
-- que ninguem conferiu.
--
-- SEM `BEGIN;`/`COMMIT;` proprios: quem executa envolve este arquivo mais a
-- linha do ledger numa transacao externa unica, mesma regra da 20260809070000.

-- ## Por que NAO tem guard de ausencia, e por que ela entra na lista de falhas
--
-- A tentacao e abrir um `IF ... IS NULL THEN RETURN` para o replay linear passar
-- limpo. Seria mentira em dois niveis. Primeiro, o replay nao roda em base
-- vazia: a ficha do `lula` existe la, o que falta e a LINHA de 2018, entao o
-- guard de candidato ausente nao dispararia e a previsao estatica passaria a
-- dizer "replicavel" enquanto a medicao real diz o contrario. Segundo, a
-- condicao de aprovacao desta migration e cardinalidade exatamente 1: transformar
-- 0 em no-op silencioso e justamente abrir mao dela.
--
-- Entao ela FALHA no replay linear de proposito, igual a 20260809070000, e essa
-- falha esta registrada em `scripts/audit/falhas-replay-linear.json` e em
-- `scripts/audit/quebras-previstas.json`, medida e nao estimada.

DO $pf$
DECLARE
  v_encontrados integer;
  v_escritos integer;
  v_restantes integer;
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
      'lula 2018 indeferido: alvo com cardinalidade % (esperado exatamente 1) para SQ_CANDIDATO 280000625869 + cargo Presidente + 2018',
      v_encontrados;
  END IF;

  -- Pre-condicao: so escreve se o valor divergente ainda for o que o raw
  -- desmente. Se alguem ja corrigiu, nao ha o que fazer e nada e destruido.
  SELECT count(*) INTO v_encontrados
    FROM public.historico_politico h
    JOIN public.candidatos c ON c.id = h.candidato_id
   WHERE c.slug = 'lula'
     AND h.cargo = 'Presidente'
     AND h.periodo_inicio = 2018
     AND h.observacoes LIKE '%280000625869%'
     AND h.eleito_por = 'nao eleito';

  IF v_encontrados <> 1 THEN
    RAISE EXCEPTION
      'lula 2018 indeferido: esperado eleito_por = ''nao eleito'' antes da escrita, encontrado outro valor';
  END IF;

  -- Registro indeferido nao tem mecanismo de eleicao, entao o campo fica NULL,
  -- que e exatamente como a base ja guarda a candidatura indeferida da
  -- `cintia-dias` em 2012.
  --
  -- O predicado vai inteiro no statement, e nao escondido atras de `v_alvo`: o
  -- gate exige que a escrita diga sozinha em quem mexe, e essa exigencia esta
  -- certa. A cardinalidade ja foi travada acima e o ROW_COUNT e conferido abaixo.
  -- @write tabela=historico_politico slug=lula campos=eleito_por
  UPDATE public.historico_politico h
     SET eleito_por = NULL
    FROM public.candidatos c
   WHERE c.id = h.candidato_id
     AND c.slug = 'lula'
     AND h.cargo = 'Presidente'
     AND h.periodo_inicio = 2018
     AND h.observacoes LIKE '%280000625869%'
     AND h.eleito_por = 'nao eleito';

  GET DIAGNOSTICS v_escritos = ROW_COUNT;
  IF v_escritos <> 1 THEN
    RAISE EXCEPTION 'lula 2018 indeferido: % linha(s) escrita(s), esperado 1', v_escritos;
  END IF;

  -- Pos-condicao: a observacao (dado bruto) tem de continuar intacta, e o
  -- readback do invariante (a') tem de sair de 2 para 1 linha na base inteira.
  SELECT count(*) INTO v_restantes
    FROM public.historico_politico
   WHERE observacoes ~* 'INDEFERID' AND eleito_por = 'nao eleito';

  IF v_restantes <> 1 THEN
    RAISE EXCEPTION
      'lula 2018 indeferido: apos a escrita restam % linha(s) indeferidas com eleito_por = ''nao eleito'', esperado 1 (rui-costa-pimenta 2006, fiel ao raw)',
      v_restantes;
  END IF;

  SELECT count(*) INTO v_encontrados
    FROM public.historico_politico h
    JOIN public.candidatos c ON c.id = h.candidato_id
   WHERE c.slug = 'lula'
     AND h.periodo_inicio = 2018
     AND h.observacoes LIKE '%280000625869%';

  IF v_encontrados <> 1 THEN
    RAISE EXCEPTION 'lula 2018 indeferido: dado bruto da observacao foi perdido';
  END IF;
END
$pf$;
