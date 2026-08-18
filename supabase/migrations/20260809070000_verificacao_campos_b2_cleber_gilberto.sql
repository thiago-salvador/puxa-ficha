-- Curadoria: materializa as tres frentes TSE de `verificacao_campos` para
-- `cleber-rabelo` e `gilberto-vasconcelos`.
--
-- ## O que esta migration corrige, medido e nao suposto
--
-- O relato de origem (Settings/STATUS.md, "Defeito de escrita encontrado e
-- corrigido na origem") diz que os dois slugs tem `social_networks` em `null` no
-- banco. Leitura direta de producao em 09/08/2026 mostra outra coisa:
--
--   select count(*) from public.candidatos
--    where verificacao_campos -> 'social_networks' = 'null'::jsonb;  -- 0, em 280 linhas
--   select slug, verificacao_campos from public.candidatos
--    where slug in ('cleber-rabelo','gilberto-vasconcelos');         -- os dois com '{}'
--
-- O `null` nunca chegou ao banco porque a migration que o carregava,
-- 20260807052000_b2_current_profiles_tse_2026.sql, esta RETIDA e NAO foi
-- aplicada: ela nao aparece em `supabase_migrations.schema_migrations`. O defeito
-- de escrita foi corrigido na origem antes de a saida defeituosa ser aplicada.
--
-- Sobra o buraco de verdade, que e o oposto de um `null` a trocar: as duas fichas
-- nao tem verificacao de campo NENHUMA (`{}`), enquanto o ledger da B2 prova que
-- as tres frentes TSE foram consultadas para elas. Elas ficaram de fora da
-- etapa 9 (scripts/materializar-etapa9-tse-12.ts) porque aquele universo sai de
-- `data/identidade-etapa2-2026.json`, o recorte dos 71 perfis SEM casamento
-- seguro, e estes dois nunca estiveram la: a identidade deles ja era segura pelo
-- SQ do proprio ledger da B2.
--
-- ## Fonte de cada valor
--
-- Ledger: output/pf-completeness-20260807T022551Z/research-b2/proposals.jsonl,
-- SHA-256 78dec9789bdd4952cbf781f5bd4952a75f919b4a82903e6869a42468cc168fc0, o
-- mesmo congelado em LEDGER_B2_SHA256 no gerador.
--
-- Traducao (campo, query_result) -> estado, por
-- scripts/lib/verificacao-campos-ledger-b2.ts, com a data saindo de
-- `source_date` (data da FONTE, nao da execucao do script):
--
--   current_candidacy_status  safe_official_registration_found     -> publicado
--   profession + education    found_in_safe_current_registration   -> publicado
--   social_networks           no_row_for_safe_sq                   -> vazio_confirmado
--
-- Os tres com `source_date = 2026-08-06`, o snapshot do TSE. `vazio_confirmado` e
-- estado que MERECE data (Settings/OBJECTIVE.md): a fonte foi consultada por SQ
-- seguro e respondeu sem registros. Esconder isso viraria ausencia confirmada em
-- lacuna, que e o defeito inverso.
--
-- Confirmado contra o gerador ja corrigido: rodando
-- scripts/generate-b2-current-profile-migration.ts sobre esse ledger, as linhas
-- destes dois slugs saem com exatamente
-- {"candidate_registration":"2026-08-06","candidate_complement":"2026-08-06","social_networks":"2026-08-06", ...}.
--
-- ## O que esta migration NAO faz, e por que
--
-- - Nao toca `ultima_atualizacao`. Nenhum campo da ficha mudou, so o carimbo de
--   verificacao. Alem de ser falso, bumpar para `now()` colocaria a candidata
--   "Perfil factual curado" em 09/08 e ela venceria a data TSE de 06/08 em
--   `resolverUltimaVerificacaoDoPerfil`, escondendo exatamente o selo que esta
--   correcao existe para expor.
-- - Nao escreve `news_query` nem `existing_profile_aggregate`. A primeira nao
--   entra em nenhuma decisao do selo; a segunda ja tem o mesmo valor pelo
--   fallback `candidato.ultima_atualizacao` em src/lib/api.ts. Escrever as duas
--   seria curadoria sem efeito, e o precedente em producao (as 22 fichas da
--   etapa 9) carrega so as tres chaves TSE.
-- - Nao emite DDL. A coluna, o privilegio de coluna e a view publica moram em
--   20260809060000_verificacao_campos_schema_publico.sql, ja aplicada. Emitir
--   schema aqui produziria migration MISTA, proibida pela issue #136.
--
-- Classificacao esperada: `curadoria`, `mista: false`, replay `replicavel`.
--
-- SEM `BEGIN;`/`COMMIT;` PROPRIOS (Settings/WORKFLOWS.md, regra de 09/08/2026):
-- quem aplica envolve o arquivo mais a linha do ledger numa transacao externa
-- unica, e um COMMIT no meio encerraria essa transacao antes da gravacao do
-- ledger.
--
-- Rollback versionado em
-- supabase/rollback/20260809070000_verificacao_campos_b2_cleber_gilberto.rollback.sql.

DO $pf$
DECLARE
  v_presentes integer;
  v_divergentes integer;
  v_confirmados integer;
BEGIN
  -- Guard de ausencia TOTAL, e so ela. Num Postgres vazio (replay linear) as
  -- duas fichas nao existem, e a migration tem de virar no-op em vez de derrubar
  -- a fila.
  --
  -- Presenca PARCIAL nao entra aqui, e a distincao e o defeito que a revisao de
  -- 09/08/2026 pegou. A versao anterior usava `HAVING count(*) = 2`, entao UMA
  -- ficha presente tambem devolvia NULL e virava no-op BEM-SUCEDIDO: a transacao
  -- externa gravaria a linha do ledger, a migration constaria como aplicada, e a
  -- unica ficha existente ficaria sem correcao para sempre. Zero fichas e banco
  -- que ainda nao tem a coorte; uma ficha e estado inesperado, e estado
  -- inesperado aborta.
  IF (SELECT min(slug) FROM public.candidatos
       WHERE slug IN ('cleber-rabelo', 'gilberto-vasconcelos')) IS NULL THEN
    RAISE NOTICE 'verificacao_campos B2: nenhuma das fichas existe; nada a materializar';
    RETURN;
  END IF;

  SELECT count(*) INTO v_presentes
    FROM public.candidatos
   WHERE slug IN ('cleber-rabelo', 'gilberto-vasconcelos');

  IF v_presentes <> 2 THEN
    RAISE EXCEPTION
      'verificacao_campos B2: presenca parcial da coorte (% de 2 fichas); aplicar aqui gravaria a versao no ledger deixando a outra sem correcao',
      v_presentes;
  END IF;

  -- Pre-condicao de identidade. `candidatos` nao guarda SQ_CANDIDATO, entao a
  -- ancora possivel no banco e o trio cargo/UF/partido, conferido contra o
  -- registro do ledger da B2 (SQ 140002538631, Governador PA PSTU; SQ
  -- 40002535267, Governador AM PSTU). Linha que nao casa nao e a pessoa que a
  -- pesquisa verificou, e carimbar data nela seria inventar verificacao.
  IF (SELECT count(*) FROM public.candidatos
       WHERE (slug, cargo_disputado, estado, partido_sigla) IN (
         ('cleber-rabelo', 'Governador', 'PA', 'PSTU'),
         ('gilberto-vasconcelos', 'Governador', 'AM', 'PSTU')
       )) <> 2 THEN
    RAISE EXCEPTION 'verificacao_campos B2: identidade divergente do ledger; abortando';
  END IF;

  -- Pre-condicao de nao-regressao, e ela existe porque `||` NAO e monotonico.
  --
  -- Reproduzido em Postgres 17 na revisao de 09/08/2026:
  -- `'{"social_networks":"2026-09-01"}'::jsonb || '{"social_networks":"2026-08-06"}'::jsonb`
  -- da `2026-08-06`. O lado direito vence sempre, entao uma reverificacao mais
  -- NOVA seria rebaixada por esta migration, que e o defeito exato que o
  -- contrato de `src/lib/verificacao-campos.ts` existe para impedir: data de
  -- verificacao que anda para tras nao e verificacao.
  --
  -- A escolha e ABORTAR, nao mesclar pelo maximo. Migration de curadoria de dois
  -- slugs e ato unico, e chave TSE com valor diferente de `2026-08-06` significa
  -- que alguem escreveu ali depois do ledger da B2: isso e decisao humana, nao
  -- caso a resolver em silencio. Valor IGUAL nao diverge, entao reaplicar
  -- continua sendo no-op idempotente.
  SELECT count(*) INTO v_divergentes
    FROM public.candidatos
   WHERE slug IN ('cleber-rabelo', 'gilberto-vasconcelos')
     AND (
       COALESCE(verificacao_campos ->> 'candidate_registration', '2026-08-06') <> '2026-08-06'
       OR COALESCE(verificacao_campos ->> 'candidate_complement', '2026-08-06') <> '2026-08-06'
       OR COALESCE(verificacao_campos ->> 'social_networks', '2026-08-06') <> '2026-08-06'
     );

  IF v_divergentes > 0 THEN
    RAISE EXCEPTION
      'verificacao_campos B2: % ficha(s) com frente TSE ja datada com valor diferente de 2026-08-06; aplicar rebaixaria verificacao existente',
      v_divergentes;
  END IF;

  -- Merge aditivo. `||` com null do lado direito SOBRESCREVE em jsonb, por isso
  -- o objeto so carrega chave com data: chave ausente preserva o valor anterior.
  -- Divergencia ja foi barrada acima, entao aqui o `||` so pode ESCREVER chave
  -- nova ou reescrever valor identico.
  -- @write tabela=candidatos slug=cleber-rabelo campos=verificacao_campos
  UPDATE public.candidatos
     SET verificacao_campos = COALESCE(verificacao_campos, '{}'::jsonb) ||
           jsonb_build_object(
             'candidate_registration', '2026-08-06',
             'candidate_complement', '2026-08-06',
             'social_networks', '2026-08-06'
           )
   WHERE slug = 'cleber-rabelo';

  -- @write tabela=candidatos slug=gilberto-vasconcelos campos=verificacao_campos
  UPDATE public.candidatos
     SET verificacao_campos = COALESCE(verificacao_campos, '{}'::jsonb) ||
           jsonb_build_object(
             'candidate_registration', '2026-08-06',
             'candidate_complement', '2026-08-06',
             'social_networks', '2026-08-06'
           )
   WHERE slug = 'gilberto-vasconcelos';

  -- Pos-condicao. Conferir as TRES chaves, e nao so `social_networks`: e a
  -- resolucao completa que faz `resolverFrescorTsePerfil` sair de `ausente`, e
  -- duas chaves de tres devolveriam `parcial`, que nao produz data nenhuma.
  SELECT count(*) INTO v_confirmados
    FROM public.candidatos
   WHERE slug IN ('cleber-rabelo', 'gilberto-vasconcelos')
     AND verificacao_campos ->> 'candidate_registration' = '2026-08-06'
     AND verificacao_campos ->> 'candidate_complement' = '2026-08-06'
     AND verificacao_campos ->> 'social_networks' = '2026-08-06';

  IF v_confirmados <> 2 THEN
    RAISE EXCEPTION 'verificacao_campos B2: % de 2 fichas com as tres frentes TSE datadas', v_confirmados;
  END IF;
END
$pf$;
