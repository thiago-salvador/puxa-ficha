BEGIN;

-- Separa, dentro de `coleta_log`, "fui buscar dado" de "mudei dado".
--
-- POR QUE ESTA COLUNA EXISTE
--
-- A issue #131 é sobre escrita em produção que não deixou rastro: script de
-- serviço com `--apply` muda milhares de linhas e nem o ledger de migrations nem
-- nenhuma outra tabela registra que aquilo aconteceu. A decisão foi manter o
-- ledger significando apenas "migration aplicada" e exigir trilha separada para
-- escrita fora de migration.
--
-- A trilha reusa esta tabela em vez de criar outra: `coleta_log` já é
-- append-only, já tem os índices certos, já tem `execucao`, `detalhe`, `volume`
-- e `duracao_ms`, e o `Settings/WORKFLOWS.md` já mandava registrar nela. Das 13
-- colunas existentes, nenhuma diz se a linha é coleta ou escrita, e as duas
-- categóricas (`escopo` e `resultado`) estão travadas por CHECK cujos valores
-- são lidos por `src/lib/types.ts` e `scripts/audit/lib/coleta-proveniencia.ts`.
-- Alargar qualquer um dos dois custaria exatamente esta migration, com o
-- agravante de corromper um vocabulário que já tem consumidor.
--
-- POR QUE A VIEW PRECISA MUDAR NA MESMA MIGRATION
--
-- `coleta_log_ultima` é `select distinct on (fonte, escopo, alvo) ... order by
-- ..., executado_em desc` SEM cláusula `where`, e `src/lib/api.ts` a serve na
-- superfície pública como procedência do dado. Adicionar a coluna sem recriar a
-- view faria uma linha de ESCRITA, por ser mais recente, vencer o `distinct on`
-- do seu trio e passar a ser exibida ao usuário final como "última tentativa de
-- coleta". Coluna e view andam juntas ou a mudança introduz o defeito que
-- pretende evitar.
--
-- O default `'coleta'` é o que mantém as ~230 mil linhas existentes corretas sem
-- backfill: tudo que existe hoje na tabela foi escrito por `scripts/lib/coleta-log.ts`
-- e é, de fato, tentativa de coleta.
--
-- Quem escreve `natureza = 'escrita'`: `scripts/lib/escrita-auditada.ts`, e só
-- ele. O gate `tests/escrita-auditada-gate.test.ts` reprova script que escreve
-- em tabela de produção sem passar por lá.

alter table public.coleta_log
  add column if not exists natureza text not null default 'coleta';

alter table public.coleta_log
  drop constraint if exists coleta_log_natureza_check;

alter table public.coleta_log
  add constraint coleta_log_natureza_check check (natureza in ('coleta', 'escrita'));

comment on column public.coleta_log.natureza is
  'coleta: tentativa de buscar dado numa fonte externa, escrita por scripts/lib/coleta-log.ts (default histórico e único conteúdo da view coleta_log_ultima). escrita: mudança de dado em produção fora de migration, escrita por scripts/lib/escrita-auditada.ts, com quem executou em fonte/execucao, por que em detalhe, alvo em alvo, linhas efetivamente afetadas em volume e quando em executado_em.';

-- Consulta quente da trilha de escrita: "o que mudou em produção, na ordem".
-- Índice parcial porque a fatia de escrita é minúscula perto da de coleta.
create index if not exists idx_coleta_log_escrita
  on public.coleta_log (executado_em desc)
  where natureza = 'escrita';

-- A view volta a significar exatamente o que o nome diz: última tentativa de
-- COLETA. Mesmas colunas, mesma ordem, mesmo security_invoker; o que entra é o
-- filtro.
create or replace view public.coleta_log_ultima
with (security_invoker = true) as
select distinct on (fonte, escopo, alvo)
       fonte,
       escopo,
       alvo,
       candidato_id,
       executado_em,
       resultado,
       volume,
       detalhe,
       url,
       execucao,
       duracao_ms
  from public.coleta_log
 where natureza = 'coleta'
 order by fonte, escopo, alvo, executado_em desc, id desc;

comment on view public.coleta_log_ultima is
  'Última tentativa de COLETA por (fonte, escopo, alvo). Filtra natureza = coleta: linha de escrita de operador nunca pode aparecer aqui, porque esta view é servida na superfície pública por src/lib/api.ts como procedência do dado. security_invoker garante que a view não vire caminho paralelo em volta da RLS da tabela base.';

revoke all on public.coleta_log_ultima from anon, authenticated;

COMMIT;

-- Rollback. A ORDEM importa, e a primeira versão deste comentário estava errada:
-- ela mandava largar a coluna antes de recriar a view, e o Postgres recusa com
-- "view coleta_log_ultima depends on column natureza" mais a sugestão de usar
-- CASCADE. Seguir CASCADE ali derrubaria a view que a ficha pública consome.
-- A view volta ao estado sem filtro PRIMEIRO, e só então a coluna sai:
--
--   -- 1. view sem o filtro, idêntica à de 20260805003740_coleta_log_tentativa_por_fonte.sql
--   create or replace view public.coleta_log_ultima
--   with (security_invoker = true) as
--   select distinct on (fonte, escopo, alvo)
--          fonte, escopo, alvo, candidato_id, executado_em, resultado,
--          volume, detalhe, url, execucao, duracao_ms
--     from public.coleta_log
--    order by fonte, escopo, alvo, executado_em desc, id desc;
--   revoke all on public.coleta_log_ultima from anon, authenticated;
--
--   -- 2. o comentário da view, que `create or replace view` NÃO reseta. Sem esta
--   --    linha o rollback deixa a view anunciando um filtro que ela não tem mais,
--   --    que é o mesmo defeito de documentação que esta migration corrige.
--   comment on view public.coleta_log_ultima is
--     'Última tentativa de coleta por (fonte, escopo, alvo). security_invoker garante que a view não vire caminho paralelo em volta da RLS da tabela base.';
--
--   -- 3. agora nada depende mais da coluna
--   drop index if exists public.idx_coleta_log_escrita;
--   alter table public.coleta_log drop constraint if exists coleta_log_natureza_check;
--   alter table public.coleta_log drop column if exists natureza;
