-- =====================================================================
-- QUARENTENA: patrimonio e financiamento ancorados em SQ_CANDIDATO de OUTRA
-- PESSOA. 23 pares (slug, ano_eleicao), 15 deles em ficha publicada.
--
-- O QUE ACONTECEU
--
-- `data/candidatos.json` guarda `ids.tse_sq_candidato` por ano, e
-- `scripts/lib/ingest-tse.ts` usa esse SQ como metodo `sq-preloaded`, que e o
-- degrau de MAIOR prioridade do resolver. SQ errado no seed, portanto, ancora
-- a ingestao na pessoa errada com confianca maxima, sem cair nos degraus de
-- CPF ou nome que poderiam corrigir.
--
-- Em 16 slugs o SQ aponta para homonimo. O caso mais limpo de provar:
--
--   alvaro-dias-rn  = Alvaro Costa Dias, ex-prefeito de Natal/RN, nasc 04/09/1959
--   SQ 2022 do seed = 160001614980 = ALVARO FERNANDES DIAS, senador do PR,
--                     nasc 07/12/1944
--
-- Em TODO o registro do TSE de 2022 existe UM unico "Alvaro Dias", que e o
-- senador do PR. O Alvaro de Natal nao concorreu em 2022. Logo o patrimonio e
-- o financiamento de 2022 que a ficha dele exibia nao podiam ser dele. Isso e
-- prova por exaustao do registro, nao inferencia.
--
-- POR QUE O GATE EXISTENTE NAO PEGOU
--
-- `npm run audit:seed-sq-identity:gate` roda 626 pares e devolve 0 divergencia,
-- incluindo todos os 16. Ele compara NOME, e "Alvaro ... Dias" bate nos dois.
-- O sinal que faltava e determinista: uma pessoa tem UMA data de nascimento.
-- SQs do mesmo slug que discordam da data denunciam pessoa errada sem falso
-- positivo. Essa checagem entra no gate em migration/commit proprio.
--
-- POR QUE QUARENTENA E NAO DELETE, E NAO DESPUBLICACAO
--
-- `historico_politico` tem despublicacao logica (despublicacao_motivo,
-- despublicado_em), mas `patrimonio` e `financiamento` nao tem. Pior:
-- `src/lib/api.ts` le `patrimonio` DIRETO da tabela base, entao criar a coluna
-- nao esconderia nada sem mudar codigo e fazer deploy.
--
-- Quarentena resolve agora e sem deploy: a linha sai da tabela viva e entra
-- integra na tabela de quarentena, com o motivo e a identidade real do SQ.
-- Reverter e um INSERT ... SELECT de volta. Nenhum byte e perdido.
--
-- ESCOPO: os 23 pares, e nao so os 15 publicados. Os 8 restantes estao em
-- ficha nao publicada, mas sao o mesmo defeito confirmado e poderiam ser
-- publicados depois. Deixar linha sabidamente errada em tabela viva nao se
-- sustenta depois de identificada.
--
-- O QUE ESTA MIGRATION NAO FAZ: nao limpa o seed. Enquanto os SQ errados
-- estiverem em `data/candidatos.json`, a proxima ingestao TSE recria estas
-- linhas. A limpeza do seed vai no mesmo commit, fora do banco.
-- =====================================================================

create table if not exists public.patrimonio_quarentena (
  like public.patrimonio including all,
  quarentena_em         timestamptz not null default now(),
  quarentena_motivo     text        not null,
  sq_errado             text,
  sq_pertence_a         text
);

create table if not exists public.financiamento_quarentena (
  like public.financiamento including all,
  quarentena_em         timestamptz not null default now(),
  quarentena_motivo     text        not null,
  sq_errado             text,
  sq_pertence_a         text
);

-- Dado de pessoa fisica errada nao pode vazar por engano pela quarentena.
alter table public.patrimonio_quarentena    enable row level security;
alter table public.financiamento_quarentena enable row level security;
revoke all on public.patrimonio_quarentena    from anon, authenticated;
revoke all on public.financiamento_quarentena from anon, authenticated;

-- Pares (slug, ano) cujo SQ no seed pertence a outra pessoa, com a identidade
-- real do SQ conferida linha a linha nos CSVs oficiais do TSE do ANO CORRETO.
--
-- Fica em VIEW, e nao em temporary table, de proposito: `on commit drop` some
-- se o executor rodar statement a statement em autocommit, e a lista some
-- junto, fazendo os DELETE nao acharem nada e a migration passar sem efeito.
create or replace view public._homonimos_quarentena_20260730 (slug, ano, sq, pertence_a) as
values
  ('alvaro-dias-rn',2018,'280000618462','ALVARO FERNANDES DIAS (senador PR, nasc 07/12/1944)'),
  ('alvaro-dias-rn',2022,'160001614980','ALVARO FERNANDES DIAS (senador PR, nasc 07/12/1944)'),
  ('cleitinho',2012,'130000019653','CLAYTON SILVA CASTRO (MG, nasc 06/07/1982)'),
  ('cleitinho',2016,'130000085496','CLAYTON SILVA CASTRO (MG, nasc 06/07/1982)'),
  ('david-almeida',2020,'170001127614','DAVID WILLIAMS SILVA DE ALMEIDA (vereador PE, nasc 28/06/1992)'),
  ('joao-campos',2018,'90000610070','JOAO CAMPOS DE ARAUJO (GO, nasc 28/12/1962)'),
  ('joao-campos',2022,'90001647805','JOAO CAMPOS DE ARAUJO (GO, nasc 28/12/1962)'),
  ('joao-campos',2024,'170002121906','JOAO NUNES CAMPOS (PE, nasc 18/08/1981)'),
  ('joao-rodrigues',2012,'240000002415','JOAO RODRIGUES PEREIRA (SC, nasc 04/07/1964)'),
  ('joao-rodrigues',2016,'240000014191','JOAO CARLOS RODRIGUES DOS SANTOS (SC, nasc 25/02/1973)'),
  ('joao-rodrigues',2018,'210000604698','JOAO CARLOS MENDONCA RODRIGUES (RS, nasc 18/01/1965)'),
  ('joao-rodrigues',2020,'240000882140','JOAO CARLOS RODRIGUES DOS SANTOS (SC, nasc 25/02/1973)'),
  ('joao-rodrigues',2022,'210001596122','JOAO CARLOS MENDONCA RODRIGUES (RS, nasc 18/01/1965)'),
  ('joao-rodrigues',2024,'240002334637','JOAO CARLOS RODRIGUES DOS SANTOS (SC, nasc 25/02/1973)'),
  ('mateus-simoes',2024,'130001911704','MATEUS ELIAS SIMOES (MG, nasc 23/10/1991)'),
  ('anderson-ferreira',2018,'190000625124','ANDERSON NASCIMENTO FERREIRA (RJ, nasc 09/07/1976)'),
  ('anderson-ferreira',2024,'170002262441','ANDERSON FERREIRA DE MIRANDA (PE, nasc 22/04/1995)'),
  ('marcos-vieira',2020,'240001148715','MARCOS VIEIRA (SC, nasc 25/11/1977)'),
  ('marcos-vieira',2024,'240002174053','MARCOS VIEIRA (SC, nasc 25/11/1977)'),
  ('margarete-coelho',2020,'190000805069','MARGARETE COELHO SOUZA (RJ, nasc 31/12/1967)'),
  ('paulo-martins-gov-pr',2020,'210001085840','PAULO MARTINS (RS, nasc 10/03/1964)'),
  ('rodrigo-pacheco',2020,'160000720084','RODRIGO PACHECO (vereador PR, nasc 02/10/1981)'),
  ('silvio-mendes',2020,'180000634397','SILVIO MENDES DOS SANTOS (PI, nasc 16/12/1972)');

revoke all on public._homonimos_quarentena_20260730 from anon, authenticated;

-- --- patrimonio ---
insert into public.patrimonio_quarentena
select p.*, now(),
       'SQ_CANDIDATO do seed pertence a outra pessoa; ingestao ancorada por sq-preloaded',
       h.sq, h.pertence_a
  from public.patrimonio p
  join public.candidatos c on c.id = p.candidato_id
  join public._homonimos_quarentena_20260730 h on h.slug = c.slug and h.ano = p.ano_eleicao;

delete from public.patrimonio p
 using public.candidatos c, public._homonimos_quarentena_20260730 h
 where c.id = p.candidato_id and h.slug = c.slug and h.ano = p.ano_eleicao;

-- --- financiamento ---
insert into public.financiamento_quarentena
select f.*, now(),
       'SQ_CANDIDATO do seed pertence a outra pessoa; ingestao ancorada por sq-preloaded',
       h.sq, h.pertence_a
  from public.financiamento f
  join public.candidatos c on c.id = f.candidato_id
  join public._homonimos_quarentena_20260730 h on h.slug = c.slug and h.ano = f.ano_eleicao;

delete from public.financiamento f
 using public.candidatos c, public._homonimos_quarentena_20260730 h
 where c.id = f.candidato_id and h.slug = c.slug and h.ano = f.ano_eleicao;

-- A view era andaime da migration, nao contrato do schema.
drop view public._homonimos_quarentena_20260730;

-- =====================================================================
-- REVERSAO (se algum par se provar correto depois)
--
--   insert into public.patrimonio
--   select id, candidato_id, ano_eleicao, valor_total, bens, fonte, created_at
--     from public.patrimonio_quarentena where candidato_id = '<uuid>';
--   delete from public.patrimonio_quarentena where candidato_id = '<uuid>';
--
-- CONFERENCIA
--
--   select 'quarentena' t, count(*) from public.patrimonio_quarentena
--   union all select 'financ quarentena', count(*) from public.financiamento_quarentena;
-- =====================================================================
