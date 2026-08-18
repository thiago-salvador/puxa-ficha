-- Rollback da 20260810093000_rerun_patrimonio_2026_tse_publicou.sql.
--
-- Desfaz as publicacoes, a retificacao e a linha do ledger. Rollback que deixa a versao no
-- ledger faz repositorio e banco discordarem sobre o que aconteceu (issue #131).
--
-- ## O que ele restaura, e o que NAO da para restaurar
--
-- Restaura o CONTEUDO: as 10 fichas voltam a nao ter patrimonio de 2026, as 8
-- linhas de `patrimonio_ausencia_oficial` voltam com o mesmo `sq_candidato`,
-- `fonte_url`, `verificado_em` e `detalhe` que a 20260807183000 escreveu, e
-- priscila-voigt volta a composicao de 04/08.
--
-- dr-luisinho e preta-lu NAO voltam a `patrimonio_ausencia_oficial`: a forward
-- corrigiu uma afirmacao sem evidencia, e o rollback nao pode fabricar
-- ST_DECLARAR_BENS = N. Os dois permanecem em `nao_coletado`.
--
-- NAO restaura os identificadores de linha: `id` e `created_at` das ausencias
-- recriadas sao novos. Nenhuma superficie publica le esses dois campos (o
-- contrato de `patrimonio_ausencia_oficial` e (candidato_id, ano_eleicao,
-- sq_candidato) mais a evidencia), mas quem auditar por `id` vai ver UUID
-- diferente, e isso esta dito aqui em vez de descoberto depois.
--
-- ## Os guards abortam, e por que
--
-- Se as 10 linhas de patrimonio nao estiverem EXATAMENTE como a forward as
-- escreveu, alguem curou por cima, e apagar viraria destruicao de dado mais
-- novo. Mesma logica para priscila-voigt e para ausencia que ja tenha voltado
-- por outro caminho. Em todos esses casos o rollback FALHA de proposito.

DO $rb$
DECLARE
  v_como_aplicado integer;
  v_priscila integer;
  v_ausencias_presentes integer;
  v_sobrando integer;
  v_restauradas integer;
  v_nao_coletados integer;
BEGIN
  -- Guard 1. As 10 linhas tem que estar na composicao exata que a forward gravou.
  SELECT count(*) INTO v_como_aplicado
    FROM public.patrimonio p
    JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE p.ano_eleicao = 2026
     AND (c.slug, p.valor_total, p.bens) IN (
           ('andre-marinho', 407503.55, '[{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":300000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO DE RENDA FIXA (CDB, RDB E OUTROS)","valor":14.37},{"tipo":"Caderneta de poupança","descricao":"CADERNETA DE POUPANÇA","valor":7487.18},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO BANCÁRIO EM CONTA CORRENTE NO PAÍS","valor":1},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO BANCÁRIO EM CONTA CORRENTE NO PAÍS","valor":1},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS OU QUINHÕES DE CAPITAL","valor":100000}]'::jsonb),
           ('cleber-rabelo', 52292.00, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"FIAT ARGO DRIVE 1.3 2018","valor":52292}]'::jsonb),
           ('efraim-filho', 1682784.38, '[{"tipo":"Apartamento","descricao":"APARTAMENTO EM JOÃO PESSOA-PB","valor":536349.66},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB CDB RENDA FACIL","valor":14433.61},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONSORCIO 25 PARCELAS","valor":31696.73},{"tipo":"Outros bens imóveis","descricao":"FAZENDA EM GURINHÉM-PB","valor":42000},{"tipo":"Outros bens imóveis","descricao":"FLAT EM CABEDELO-PB","valor":359083},{"tipo":"Outros depósitos à vista e numerário","descricao":"OURO CAR","valor":244.26},{"tipo":"Outros fundos","descricao":"CAIXA GIRO IMEDIATO FIC DE CLASSE DE FIF RENDA FIXA","valor":149682.12},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HILUX SW4 ANO 2015","valor":93000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HILUX SW4 ANO 2025","valor":456295}]'::jsonb),
           ('geraldo-carvalho', 200590.00, '[{"tipo":"Casa","descricao":"SÍTIO DENOMINADO TRAPIAZIN, N. 5739, COMUNIDADE MATA VELHA, ADQUIRIDO O DIREITO DE USO EM 2012, COM ÁREA DE 3 HECTARES, COM CASA, POÇO ARTESIANO, CERCADO DE ARAME FARPADO E OUTRAS BENFEITORIAS.","valor":150000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL NOVO - KWID ZEN 1.0 - 2021/2022 - CHASSI: 93YRBB008NJ916777 CIL 999","valor":50590}]'::jsonb),
           ('ivan-moraes', 81452.00, '[{"tipo":"Casa","descricao":"IMÓVEL RESIDENCIAL SITUADO A RUA ESMERALDINO BANDEIRA, ADQUIRIDO VIA FINANCIAMENTO DIRETO JUNTO A CONSTRUTORA, TOTALMENTE QUITADO","valor":80000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA EM BANCO. BANCO 341, AG: 1632, CONTA: 32077-4","valor":1452}]'::jsonb),
           ('joao-campos', 2892723.46, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"OUTROS BENS E DIREITOS","valor":40796.8},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES E INVESTIMENTOS","valor":17413.52},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES E INVESTIMENTOS","valor":449921.41},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES E INVESTIMENTOS","valor":2284591.73},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS EM EMPRESA","valor":100000}]'::jsonb),
           ('joel-rodrigues', 1688256.20, '[{"tipo":"Apartamento","descricao":"RESIDENCIAL","valor":300000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"OUROCAP","valor":1402.83},{"tipo":"Casa","descricao":"RESIDENCIAL","valor":900000},{"tipo":"Consórcio não contemplado","descricao":"BANCO DO BRASIL","valor":24159.4},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE BANCO DO BRASIL","valor":8792.67},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE BANCO NORDESTE","valor":1101.3},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO","valor":22000},{"tipo":"Terreno","descricao":"FRAÇÃO","valor":80000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO ANO 2021/22","valor":175000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO ANO 2023/24","valor":175800}]'::jsonb),
           ('raquel-lyra', 359498.33, '[{"tipo":"Apartamento","descricao":"LOCALIZADO EM JABOATÃO DOS GUARARAPES/PE","valor":289574},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÕES FINANCEIRAS DIVERSAS","valor":69923.33},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO EM CONTA BANCÁRIA","valor":1}]'::jsonb),
           ('jose-estevao', 600000.00, '[{"tipo":"Quotas ou quinhões de capital","descricao":"CAPITAL SOCIAL DA EMPRESA GRADUX BRASIL LTDA","valor":600000}]'::jsonb),
           ('samara-mineiro', 69196.63, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"DIREITOS RELATIVOS À AQUISIÇÃO DE APARTAMENTO RESIDENCIAL PELO PROGRAMA MINHA CASA MINHA VIDA, IMÓVEL AINDA EM CONSTRUÇÃO","valor":9196.63},{"tipo":"OUTROS BENS E DIREITOS","descricao":"VEÍCULO AUTOMOTOR TERRESTRE: HYUNDAI HB20 ADQUIRIDO POR MEIO DE FINANCIAMENTO (ALIENAÇÃO FIDUCIÁRIA)","valor":60000}]'::jsonb)
           );

  IF v_como_aplicado <> 10 THEN
    RAISE EXCEPTION
      'rollback abortado: % de 10 linhas de patrimonio 2026 ainda na composicao aplicada pela forward; ha curadoria posterior a preservar',
      v_como_aplicado;
  END IF;

  -- Guard 2. priscila-voigt tem que estar na composicao retificada pela forward.
  SELECT count(*) INTO v_priscila
    FROM public.patrimonio p
    JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE c.slug = 'priscila-voigt'
     AND p.ano_eleicao = 2026
     AND p.valor_total = 1000.00
     AND p.bens = '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"DINHEIRO","valor":1000}]'::jsonb;

  IF v_priscila <> 1 THEN
    RAISE EXCEPTION
      'rollback abortado: priscila-voigt nao esta na composicao que a forward gravou (% linha(s)); reverter destruiria dado mais novo',
      v_priscila;
  END IF;

  -- Guard 3. Nenhuma das 10 ausencias removidas pode ter voltado por outro caminho, senao a
  -- restauracao abaixo criaria duplicata (ou bateria no UNIQUE e derrubaria o
  -- rollback no meio, que e pior).
  SELECT count(*) INTO v_ausencias_presentes
    FROM public.patrimonio_ausencia_oficial a
    JOIN public.candidatos c ON c.id = a.candidato_id
   WHERE a.ano_eleicao = 2026
     AND c.slug IN (
           'andre-marinho',
           'cleber-rabelo',
           'efraim-filho',
           'geraldo-carvalho',
           'ivan-moraes',
           'joao-campos',
           'joel-rodrigues',
           'raquel-lyra',
           'dr-luisinho',
           'preta-lu'
           );

  IF v_ausencias_presentes <> 0 THEN
    RAISE EXCEPTION
      'rollback abortado: % ausencia(s) oficial(is) de 2026 ja presente(s) entre as 10 fichas; alguem restaurou por outro caminho',
      v_ausencias_presentes;
  END IF;

  DELETE FROM public.patrimonio p
   USING public.candidatos c
   WHERE p.candidato_id = c.id AND c.slug = 'andre-marinho' AND p.ano_eleicao = 2026;
  DELETE FROM public.patrimonio p
   USING public.candidatos c
   WHERE p.candidato_id = c.id AND c.slug = 'cleber-rabelo' AND p.ano_eleicao = 2026;
  DELETE FROM public.patrimonio p
   USING public.candidatos c
   WHERE p.candidato_id = c.id AND c.slug = 'efraim-filho' AND p.ano_eleicao = 2026;
  DELETE FROM public.patrimonio p
   USING public.candidatos c
   WHERE p.candidato_id = c.id AND c.slug = 'geraldo-carvalho' AND p.ano_eleicao = 2026;
  DELETE FROM public.patrimonio p
   USING public.candidatos c
   WHERE p.candidato_id = c.id AND c.slug = 'ivan-moraes' AND p.ano_eleicao = 2026;
  DELETE FROM public.patrimonio p
   USING public.candidatos c
   WHERE p.candidato_id = c.id AND c.slug = 'joao-campos' AND p.ano_eleicao = 2026;
  DELETE FROM public.patrimonio p
   USING public.candidatos c
   WHERE p.candidato_id = c.id AND c.slug = 'joel-rodrigues' AND p.ano_eleicao = 2026;
  DELETE FROM public.patrimonio p
   USING public.candidatos c
   WHERE p.candidato_id = c.id AND c.slug = 'raquel-lyra' AND p.ano_eleicao = 2026;
  DELETE FROM public.patrimonio p
   USING public.candidatos c
   WHERE p.candidato_id = c.id AND c.slug = 'jose-estevao' AND p.ano_eleicao = 2026;
  DELETE FROM public.patrimonio p
   USING public.candidatos c
   WHERE p.candidato_id = c.id AND c.slug = 'samara-mineiro' AND p.ano_eleicao = 2026;

  UPDATE public.patrimonio p
     SET valor_total = 1000.00,
         bens = '[{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO","valor":1000}]'::jsonb,
         fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 210002533355 (total agregado, snapshot 2026-08-04)'
    FROM public.candidatos c
   WHERE c.id = p.candidato_id AND c.slug = 'priscila-voigt' AND p.ano_eleicao = 2026;

  INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
  SELECT c.id, 2026, '190002537524', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
         'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
    FROM public.candidatos c
   WHERE c.slug = 'andre-marinho';
  INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
  SELECT c.id, 2026, '140002538631', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
         'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
    FROM public.candidatos c
   WHERE c.slug = 'cleber-rabelo';
  INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
  SELECT c.id, 2026, '150002538692', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
         'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
    FROM public.candidatos c
   WHERE c.slug = 'efraim-filho';
  INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
  SELECT c.id, 2026, '180002537422', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
         'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
    FROM public.candidatos c
   WHERE c.slug = 'geraldo-carvalho';
  INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
  SELECT c.id, 2026, '170002538097', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
         'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
    FROM public.candidatos c
   WHERE c.slug = 'ivan-moraes';
  INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
  SELECT c.id, 2026, '170002537230', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
         'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
    FROM public.candidatos c
   WHERE c.slug = 'joao-campos';
  INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
  SELECT c.id, 2026, '180002538530', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
         'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
    FROM public.candidatos c
   WHERE c.slug = 'joel-rodrigues';
  INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
  SELECT c.id, 2026, '170002537227', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
         'SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).'
    FROM public.candidatos c
   WHERE c.slug = 'raquel-lyra';

  SELECT count(*) INTO v_sobrando
    FROM public.patrimonio p
    JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE p.ano_eleicao = 2026
     AND c.slug IN (
           'andre-marinho',
           'cleber-rabelo',
           'efraim-filho',
           'geraldo-carvalho',
           'ivan-moraes',
           'joao-campos',
           'joel-rodrigues',
           'raquel-lyra',
           'jose-estevao',
           'samara-mineiro'
           );

  IF v_sobrando <> 0 THEN
    RAISE EXCEPTION 'rollback incompleto: % linha(s) de patrimonio 2026 sobrando entre as 10 fichas', v_sobrando;
  END IF;

  SELECT count(*) INTO v_restauradas
    FROM public.patrimonio_ausencia_oficial a
    JOIN public.candidatos c ON c.id = a.candidato_id
   WHERE a.ano_eleicao = 2026
     AND (c.slug, a.sq_candidato) IN (
           ('andre-marinho', '190002537524'),
           ('cleber-rabelo', '140002538631'),
           ('efraim-filho', '150002538692'),
           ('geraldo-carvalho', '180002537422'),
           ('ivan-moraes', '170002538097'),
           ('joao-campos', '170002537230'),
           ('joel-rodrigues', '180002538530'),
           ('raquel-lyra', '170002537227')
           );

  IF v_restauradas <> 8 THEN
    RAISE EXCEPTION 'rollback incompleto: % de 8 ausencias oficiais de 2026 restauradas', v_restauradas;
  END IF;

  SELECT count(*) INTO v_nao_coletados
    FROM public.candidatos c
   WHERE c.slug IN ('dr-luisinho', 'preta-lu')
     AND NOT EXISTS (
       SELECT 1 FROM public.patrimonio p
        WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.patrimonio_ausencia_oficial a
        WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
     );

  IF v_nao_coletados <> 2 THEN
    RAISE EXCEPTION 'rollback incompleto: % de 2 fichas preservadas em nao_coletado', v_nao_coletados;
  END IF;
END
$rb$;

DELETE FROM supabase_migrations.schema_migrations
 WHERE version = '20260810093000';
