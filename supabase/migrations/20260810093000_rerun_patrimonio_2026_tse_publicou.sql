-- Re-run de patrimonio do ciclo 2026: aplica o que o TSE publicou DEPOIS do
-- snapshot de 04/08 que a 20260807183000 congelou.
--
-- ## A medicao, refeita contra a fonte em 10/08/2026 e nao herdada
--
-- `PF_DRY_RUN=1 npx tsx scripts/rerun-patrimonio-2026.ts` baixou o pacote
-- publico `bem_candidato_2026` do CDN do TSE as 15:52 BRT de 10/08/2026
-- (`consultado_em` = 2026-08-10T18:52:43.557Z) e comparou, bem a bem, as 30
-- celulas abertas de 2026 contra o que a migration de 07/08 aplicou. A auditoria
-- global posterior acrescentou dois SQs curados que o manifesto antigo omitia e
-- rebaixou duas ausencias sem prova. Os pacotes foram baixados de novo em
-- 2026-08-11T02:33:31Z, com SHA-256 congelado no manifesto delta. Resultado:
--
--   tse_publicou    10   andre-marinho, cleber-rabelo, efraim-filho,
--                        geraldo-carvalho, ivan-moraes, joao-campos,
--                        joel-rodrigues, jose-estevao, raquel-lyra,
--                        samara-mineiro
--   valores_mudaram  1   priscila-voigt
--   sem_mudanca     19
--   ausencia_sem_evidencia 2   dr-luisinho, preta-lu
--
-- 21 operacoes: 10 INSERT em `patrimonio`, 1 UPDATE em `patrimonio` e 10 DELETE
-- em `patrimonio_ausencia_oficial`. A unica diferenca entre as duas execucoes
-- foi a ORDEM em que os bens saem do pacote, que o TSE nao garante entre
-- downloads; por isso o literal desta migration ordena por (tipo, descricao,
-- valor) e a comparacao do dry-run e por composicao, nao por sequencia.
-- Relatorio integral em
-- QA/evidencias/2026-08-10-migration-patrimonio-rerun/rerun-patrimonio-2026-20260810.json.
-- Delta de identidade, hashes e estados em
-- QA/evidencias/2026-08-10-migration-patrimonio-rerun/manifesto-delta-patrimonio-2026.json.
--
-- ## Por que o DELETE das ausencias esta no MESMO ato
--
-- `patrimonio_ausencia_oficial` nao e "sem dado": cada linha AFIRMA que o pacote
-- oficial daquele ano nao traz bens para aquele SQ. Para as 8 fichas o pacote
-- atual traz bens, entao a afirmacao virou falsa. Inserir o patrimonio e deixar
-- a ausencia de pe publicaria as duas coisas ao mesmo tempo, e a ficha passaria
-- a dizer que o TSE confirmou ausencia de bens que ela mesma lista.
--
-- dr-luisinho e preta-lu tambem perdem a linha de ausencia, mas por outra causa:
-- o pacote traz zero bens e o registro de candidatura NAO traz
-- ST_DECLARAR_BENS = N. Zero linhas sem essa declaracao sustenta `nao_coletado`,
-- nao `ausencia_oficial`. As outras tres linhas legadas ficam fora deste delta.
--
-- ## priscila-voigt e UPDATE, nao INSERT
--
-- Ela ja tem linha de 2026, aplicada em 07/08 com 1 bem de R$ 1000. O total e a
-- contagem nao mudaram: mudou o TIPO declarado, de "Dinheiro em especie - moeda
-- nacional" para "Deposito bancario em conta corrente no Pais". Comparacao por
-- agregado nao veria; a comparacao bem a bem viu.
--
-- ## Guards, e por que abortar em vez de virar no-op
--
-- Um no-op BEM-SUCEDIDO grava a versao no ledger e deixa o dado errado para
-- sempre, com o repositorio afirmando que a correcao foi aplicada. Por isso so
-- existe UM caminho silencioso aqui, o da coorte inteiramente ausente (replay
-- linear em Postgres vazio). Qualquer outro desvio do estado medido em 10/08
-- levanta excecao e nao escreve nada:
--
--   - coorte parcial (1 a 12 das 13 fichas)                  -> aborta
--   - ausencia persistida fora dos 10 pares (slug, SQ)       -> aborta
--   - alguma das 10 ja com patrimonio de 2026                -> aborta
--   - priscila-voigt fora da composicao aplicada em 07/08  -> aborta
--
-- O terceiro e o quarto guard sao tambem a protecao contra reaplicacao: depois
-- de aplicada, esta migration nao roda de novo em silencio.
--
-- SEM `BEGIN;`/`COMMIT;` PROPRIOS (Settings/WORKFLOWS.md, regra de 09/08/2026):
-- quem aplica envolve o arquivo mais a linha do ledger numa transacao externa
-- unica, e um COMMIT no meio encerraria essa transacao antes da gravacao.
--
-- Rollback versionado em
-- supabase/rollback/20260810093000_rerun_patrimonio_2026_tse_publicou.rollback.sql.

DO $pf$
DECLARE
  v_coorte integer;
  v_ausencias integer;
  v_ja_com_patrimonio integer;
  v_priscila integer;
  v_inseridos integer;
  v_ausencias_restantes integer;
  v_nao_coletados integer;
  v_priscila_pos integer;
BEGIN
  -- Guard 0. Coorte inteiramente ausente e banco que ainda nao tem estas fichas
  -- (o replay linear roda cada migration em Postgres vazio). Ai o no-op e a
  -- resposta certa. Presenca PARCIAL nao passa por aqui.
  --
  -- A forma e `nullif(...) IS NULL`, e nao `= 0`, porque e ela que
  -- `temGuardDeAusencia` (scripts/audit/lib/migrations-classificacao.ts)
  -- reconhece como guard de ausencia. Com `= 0` a migration seria classificada
  -- `quebra_sem_guard` e entraria em quebras-previstas.json tendo o guard.
  SELECT count(*) INTO v_coorte
    FROM public.candidatos
   WHERE slug IN (
    'andre-marinho',
    'cleber-rabelo',
    'efraim-filho',
    'geraldo-carvalho',
    'ivan-moraes',
    'jose-estevao',
    'joao-campos',
    'joel-rodrigues',
    'priscila-voigt',
    'raquel-lyra',
    'samara-mineiro',
    'dr-luisinho',
    'preta-lu'
         );

  IF nullif(v_coorte, 0) IS NULL THEN
    RAISE NOTICE 'rerun patrimonio 2026: nenhuma das 13 fichas existe; nada a aplicar';
    RETURN;
  END IF;

  IF v_coorte <> 13 THEN
    RAISE EXCEPTION
      'rerun patrimonio 2026: coorte parcial (% de 13 fichas); aplicar aqui gravaria a versao no ledger deixando o resto sem correcao',
      v_coorte;
  END IF;

  -- Guard 1. As 10 linhas persistidas de ausencia tem que estar la, com o SQ do
  -- manifesto. Oito ficaram falsas porque o TSE publicou bens. Duas nunca foram
  -- sustentadas por ST_DECLARAR_BENS = N e precisam voltar a `nao_coletado`.
  SELECT count(*) INTO v_ausencias
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
           ('raquel-lyra', '170002537227'),
           ('dr-luisinho', '10002533539'),
           ('preta-lu', '100002534191')
         );

  IF v_ausencias <> 10 THEN
    RAISE EXCEPTION
      'rerun patrimonio 2026: % de 10 linhas de ausencia no estado medido em 10/08; o banco divergiu do dry-run e nada sera escrito',
      v_ausencias;
  END IF;

  -- Guard 2. Nenhuma das 10 fichas positivas pode ja ter patrimonio de 2026. Se tem, ou esta
  -- migration ja rodou, ou alguem escreveu ali depois: os dois casos sao decisao
  -- humana, nao caso a resolver em silencio.
  SELECT count(*) INTO v_ja_com_patrimonio
    FROM public.patrimonio p
    JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE p.ano_eleicao = 2026
     AND c.slug IN (
           'andre-marinho',
           'cleber-rabelo',
           'efraim-filho',
           'geraldo-carvalho',
           'ivan-moraes',
           'jose-estevao',
           'joao-campos',
           'joel-rodrigues',
           'raquel-lyra',
           'samara-mineiro'
           );

  IF v_ja_com_patrimonio <> 0 THEN
    RAISE EXCEPTION
      'rerun patrimonio 2026: % ficha(s) das 10 ja tem patrimonio de 2026; reaplicacao ou escrita posterior, e nenhuma das duas se resolve reescrevendo por cima',
      v_ja_com_patrimonio;
  END IF;

  -- Guard 3. priscila-voigt tem que estar EXATAMENTE na composicao que a
  -- 20260807183000 aplicou. Sobrescrever curadoria posterior seria destruir dado
  -- mais novo em nome de aplicar dado velho.
  SELECT count(*) INTO v_priscila
    FROM public.patrimonio p
    JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE c.slug = 'priscila-voigt'
     AND p.ano_eleicao = 2026
     AND p.valor_total = 1000.00
     AND p.bens = '[{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO","valor":1000}]'::jsonb;

  IF v_priscila <> 1 THEN
    RAISE EXCEPTION
      'rerun patrimonio 2026: priscila-voigt nao esta na composicao aplicada em 07/08 (% linha(s) casando); a retificacao do TSE so vale sobre aquele estado',
      v_priscila;
  END IF;

  -- @write tabela=patrimonio slug=andre-marinho ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT c.id, 2026, 407503.55, '[{"tipo":"Apartamento","descricao":"APARTAMENTO","valor":300000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÃO DE RENDA FIXA (CDB, RDB E OUTROS)","valor":14.37},{"tipo":"Caderneta de poupança","descricao":"CADERNETA DE POUPANÇA","valor":7487.18},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO BANCÁRIO EM CONTA CORRENTE NO PAÍS","valor":1},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO BANCÁRIO EM CONTA CORRENTE NO PAÍS","valor":1},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS OU QUINHÕES DE CAPITAL","valor":100000}]'::jsonb,
         'TSE Dados Abertos bem_candidato_2026 SQ 190002537524 (composicao bem a bem, pacote consultado em 2026-08-10)'
    FROM public.candidatos c
   WHERE c.slug = 'andre-marinho';

  -- @write tabela=patrimonio slug=cleber-rabelo ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT c.id, 2026, 52292.00, '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"FIAT ARGO DRIVE 1.3 2018","valor":52292}]'::jsonb,
         'TSE Dados Abertos bem_candidato_2026 SQ 140002538631 (composicao bem a bem, pacote consultado em 2026-08-10)'
    FROM public.candidatos c
   WHERE c.slug = 'cleber-rabelo';

  -- @write tabela=patrimonio slug=efraim-filho ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT c.id, 2026, 1682784.38, '[{"tipo":"Apartamento","descricao":"APARTAMENTO EM JOÃO PESSOA-PB","valor":536349.66},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB CDB RENDA FACIL","valor":14433.61},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONSORCIO 25 PARCELAS","valor":31696.73},{"tipo":"Outros bens imóveis","descricao":"FAZENDA EM GURINHÉM-PB","valor":42000},{"tipo":"Outros bens imóveis","descricao":"FLAT EM CABEDELO-PB","valor":359083},{"tipo":"Outros depósitos à vista e numerário","descricao":"OURO CAR","valor":244.26},{"tipo":"Outros fundos","descricao":"CAIXA GIRO IMEDIATO FIC DE CLASSE DE FIF RENDA FIXA","valor":149682.12},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HILUX SW4 ANO 2015","valor":93000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"HILUX SW4 ANO 2025","valor":456295}]'::jsonb,
         'TSE Dados Abertos bem_candidato_2026 SQ 150002538692 (composicao bem a bem, pacote consultado em 2026-08-10)'
    FROM public.candidatos c
   WHERE c.slug = 'efraim-filho';

  -- @write tabela=patrimonio slug=geraldo-carvalho ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT c.id, 2026, 200590.00, '[{"tipo":"Casa","descricao":"SÍTIO DENOMINADO TRAPIAZIN, N. 5739, COMUNIDADE MATA VELHA, ADQUIRIDO O DIREITO DE USO EM 2012, COM ÁREA DE 3 HECTARES, COM CASA, POÇO ARTESIANO, CERCADO DE ARAME FARPADO E OUTRAS BENFEITORIAS.","valor":150000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"AUTOMÓVEL NOVO - KWID ZEN 1.0 - 2021/2022 - CHASSI: 93YRBB008NJ916777 CIL 999","valor":50590}]'::jsonb,
         'TSE Dados Abertos bem_candidato_2026 SQ 180002537422 (composicao bem a bem, pacote consultado em 2026-08-10)'
    FROM public.candidatos c
   WHERE c.slug = 'geraldo-carvalho';

  -- @write tabela=patrimonio slug=ivan-moraes ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT c.id, 2026, 81452.00, '[{"tipo":"Casa","descricao":"IMÓVEL RESIDENCIAL SITUADO A RUA ESMERALDINO BANDEIRA, ADQUIRIDO VIA FINANCIAMENTO DIRETO JUNTO A CONSTRUTORA, TOTALMENTE QUITADO","valor":80000},{"tipo":"OUTROS BENS E DIREITOS","descricao":"CONTA EM BANCO. BANCO 341, AG: 1632, CONTA: 32077-4","valor":1452}]'::jsonb,
         'TSE Dados Abertos bem_candidato_2026 SQ 170002538097 (composicao bem a bem, pacote consultado em 2026-08-10)'
    FROM public.candidatos c
   WHERE c.slug = 'ivan-moraes';

  -- @write tabela=patrimonio slug=joao-campos ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT c.id, 2026, 2892723.46, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"OUTROS BENS E DIREITOS","valor":40796.8},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES E INVESTIMENTOS","valor":17413.52},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES E INVESTIMENTOS","valor":449921.41},{"tipo":"Outras aplicações e Investimentos","descricao":"APLICAÇÕES E INVESTIMENTOS","valor":2284591.73},{"tipo":"Quotas ou quinhões de capital","descricao":"QUOTAS EM EMPRESA","valor":100000}]'::jsonb,
         'TSE Dados Abertos bem_candidato_2026 SQ 170002537230 (composicao bem a bem, pacote consultado em 2026-08-10)'
    FROM public.candidatos c
   WHERE c.slug = 'joao-campos';

  -- @write tabela=patrimonio slug=joel-rodrigues ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT c.id, 2026, 1688256.20, '[{"tipo":"Apartamento","descricao":"RESIDENCIAL","valor":300000},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"OUROCAP","valor":1402.83},{"tipo":"Casa","descricao":"RESIDENCIAL","valor":900000},{"tipo":"Consórcio não contemplado","descricao":"BANCO DO BRASIL","valor":24159.4},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE BANCO DO BRASIL","valor":8792.67},{"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA CORRENTE BANCO NORDESTE","valor":1101.3},{"tipo":"Dinheiro em espécie - moeda nacional","descricao":"DINHEIRO","valor":22000},{"tipo":"Terreno","descricao":"FRAÇÃO","valor":80000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO ANO 2021/22","valor":175000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"CARRO ANO 2023/24","valor":175800}]'::jsonb,
         'TSE Dados Abertos bem_candidato_2026 SQ 180002538530 (composicao bem a bem, pacote consultado em 2026-08-10)'
    FROM public.candidatos c
   WHERE c.slug = 'joel-rodrigues';

  -- @write tabela=patrimonio slug=raquel-lyra ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT c.id, 2026, 359498.33, '[{"tipo":"Apartamento","descricao":"LOCALIZADO EM JABOATÃO DOS GUARARAPES/PE","valor":289574},{"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"APLICAÇÕES FINANCEIRAS DIVERSAS","valor":69923.33},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DEPÓSITO EM CONTA BANCÁRIA","valor":1}]'::jsonb,
         'TSE Dados Abertos bem_candidato_2026 SQ 170002537227 (composicao bem a bem, pacote consultado em 2026-08-10)'
    FROM public.candidatos c
   WHERE c.slug = 'raquel-lyra';

  -- @write tabela=patrimonio slug=jose-estevao ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT c.id, 2026, 600000.00, '[{"tipo":"Quotas ou quinhões de capital","descricao":"CAPITAL SOCIAL DA EMPRESA GRADUX BRASIL LTDA","valor":600000}]'::jsonb,
         'TSE Dados Abertos bem_candidato_2026 SQ 50002536579 (composicao bem a bem, pacote SHA256 b4e098f1d9e2a616f7bf1d4dfe9fc103e1adfe4eb9acd87be3bc79b63f187c49)'
    FROM public.candidatos c
   WHERE c.slug = 'jose-estevao';

  -- @write tabela=patrimonio slug=samara-mineiro ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
  SELECT c.id, 2026, 69196.63, '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"DIREITOS RELATIVOS À AQUISIÇÃO DE APARTAMENTO RESIDENCIAL PELO PROGRAMA MINHA CASA MINHA VIDA, IMÓVEL AINDA EM CONSTRUÇÃO","valor":9196.63},{"tipo":"OUTROS BENS E DIREITOS","descricao":"VEÍCULO AUTOMOTOR TERRESTRE: HYUNDAI HB20 ADQUIRIDO POR MEIO DE FINANCIAMENTO (ALIENAÇÃO FIDUCIÁRIA)","valor":60000}]'::jsonb,
         'TSE Dados Abertos bem_candidato_2026 SQ 70002537111 (composicao bem a bem, pacote SHA256 b4e098f1d9e2a616f7bf1d4dfe9fc103e1adfe4eb9acd87be3bc79b63f187c49)'
    FROM public.candidatos c
   WHERE c.slug = 'samara-mineiro';

  -- @write tabela=patrimonio slug=priscila-voigt ano=2026 campos=valor_total,bens,fonte
  UPDATE public.patrimonio p
     SET valor_total = 1000.00,
         bens = '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"DINHEIRO","valor":1000}]'::jsonb,
         fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 210002533355 (composicao bem a bem, retificacao lida em 2026-08-10)'
    FROM public.candidatos c
   WHERE c.id = p.candidato_id AND c.slug = 'priscila-voigt' AND p.ano_eleicao = 2026;

  -- @write tabela=patrimonio_ausencia_oficial slug=andre-marinho ano=2026 campos=remocao_da_linha_de_ausencia
  DELETE FROM public.patrimonio_ausencia_oficial a
   USING public.candidatos c
   WHERE a.candidato_id = c.id AND c.slug = 'andre-marinho' AND a.ano_eleicao = 2026;

  -- @write tabela=patrimonio_ausencia_oficial slug=cleber-rabelo ano=2026 campos=remocao_da_linha_de_ausencia
  DELETE FROM public.patrimonio_ausencia_oficial a
   USING public.candidatos c
   WHERE a.candidato_id = c.id AND c.slug = 'cleber-rabelo' AND a.ano_eleicao = 2026;

  -- @write tabela=patrimonio_ausencia_oficial slug=efraim-filho ano=2026 campos=remocao_da_linha_de_ausencia
  DELETE FROM public.patrimonio_ausencia_oficial a
   USING public.candidatos c
   WHERE a.candidato_id = c.id AND c.slug = 'efraim-filho' AND a.ano_eleicao = 2026;

  -- @write tabela=patrimonio_ausencia_oficial slug=geraldo-carvalho ano=2026 campos=remocao_da_linha_de_ausencia
  DELETE FROM public.patrimonio_ausencia_oficial a
   USING public.candidatos c
   WHERE a.candidato_id = c.id AND c.slug = 'geraldo-carvalho' AND a.ano_eleicao = 2026;

  -- @write tabela=patrimonio_ausencia_oficial slug=ivan-moraes ano=2026 campos=remocao_da_linha_de_ausencia
  DELETE FROM public.patrimonio_ausencia_oficial a
   USING public.candidatos c
   WHERE a.candidato_id = c.id AND c.slug = 'ivan-moraes' AND a.ano_eleicao = 2026;

  -- @write tabela=patrimonio_ausencia_oficial slug=joao-campos ano=2026 campos=remocao_da_linha_de_ausencia
  DELETE FROM public.patrimonio_ausencia_oficial a
   USING public.candidatos c
   WHERE a.candidato_id = c.id AND c.slug = 'joao-campos' AND a.ano_eleicao = 2026;

  -- @write tabela=patrimonio_ausencia_oficial slug=joel-rodrigues ano=2026 campos=remocao_da_linha_de_ausencia
  DELETE FROM public.patrimonio_ausencia_oficial a
   USING public.candidatos c
   WHERE a.candidato_id = c.id AND c.slug = 'joel-rodrigues' AND a.ano_eleicao = 2026;

  -- @write tabela=patrimonio_ausencia_oficial slug=raquel-lyra ano=2026 campos=remocao_da_linha_de_ausencia
  DELETE FROM public.patrimonio_ausencia_oficial a
   USING public.candidatos c
   WHERE a.candidato_id = c.id AND c.slug = 'raquel-lyra' AND a.ano_eleicao = 2026;

  -- @write tabela=patrimonio_ausencia_oficial slug=dr-luisinho ano=2026 campos=remocao_de_ausencia_sem_evidencia
  DELETE FROM public.patrimonio_ausencia_oficial a
   USING public.candidatos c
   WHERE a.candidato_id = c.id AND c.slug = 'dr-luisinho' AND a.ano_eleicao = 2026;

  -- @write tabela=patrimonio_ausencia_oficial slug=preta-lu ano=2026 campos=remocao_de_ausencia_sem_evidencia
  DELETE FROM public.patrimonio_ausencia_oficial a
   USING public.candidatos c
   WHERE a.candidato_id = c.id AND c.slug = 'preta-lu' AND a.ano_eleicao = 2026;

  -- Pos-condicoes. As quatro contagens sao as 21 operacoes vistas do outro lado:
  -- 10 fichas com patrimonio novo, 0 ausencias falsas sobrando, duas fichas em
  -- nao_coletado e a linha da priscila-voigt na composicao retificada.
  SELECT count(*) INTO v_inseridos
    FROM public.patrimonio p
    JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE p.ano_eleicao = 2026
     AND c.slug IN (
           'andre-marinho',
           'cleber-rabelo',
           'efraim-filho',
           'geraldo-carvalho',
           'ivan-moraes',
           'jose-estevao',
           'joao-campos',
           'joel-rodrigues',
           'raquel-lyra',
           'samara-mineiro'
           );

  IF v_inseridos <> 10 THEN
    RAISE EXCEPTION 'rerun patrimonio 2026: % de 10 fichas com patrimonio de 2026 apos a insercao', v_inseridos;
  END IF;

  SELECT count(*) INTO v_ausencias_restantes
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

  IF v_ausencias_restantes <> 0 THEN
    RAISE EXCEPTION
      'rerun patrimonio 2026: % ausencia(s) oficial(is) de 2026 sobrevivendo entre as 8 fichas positivas e as 2 sem evidencia',
      v_ausencias_restantes;
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
    RAISE EXCEPTION
      'rerun patrimonio 2026: % de 2 fichas sem patrimonio e sem ausencia oficial; zero linhas sem ST_DECLARAR_BENS = N deve ficar nao_coletado',
      v_nao_coletados;
  END IF;

  SELECT count(*) INTO v_priscila_pos
    FROM public.patrimonio p
    JOIN public.candidatos c ON c.id = p.candidato_id
   WHERE c.slug = 'priscila-voigt'
     AND p.ano_eleicao = 2026
     AND p.bens = '[{"tipo":"Depósito bancário em conta corrente no País","descricao":"DINHEIRO","valor":1000}]'::jsonb;

  IF v_priscila_pos <> 1 THEN
    RAISE EXCEPTION 'rerun patrimonio 2026: priscila-voigt nao ficou na composicao retificada (% linha(s))', v_priscila_pos;
  END IF;
END
$pf$;
