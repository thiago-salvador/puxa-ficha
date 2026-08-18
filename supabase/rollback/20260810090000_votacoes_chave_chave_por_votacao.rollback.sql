-- Rollback de 20260810090000: remove a chave por votação.
--
-- Derruba o índice único antes das colunas, porque o índice depende delas.
-- Perde-se o conteúdo de fonte e votacao_id_api, que é reconstruível a partir de
-- 20260810090200.
--
-- SEM `BEGIN;`/`COMMIT;` próprios: quem executa envolve este arquivo inteiro,
-- inclusive a remoção do ledger abaixo, numa transação externa única.

drop index if exists public.votacoes_chave_fonte_votacao_id_api_key;

alter table public.votacoes_chave
  drop constraint if exists votacoes_chave_fonte_id_consistentes_check;

alter table public.votacoes_chave
  drop column if exists votacao_id_api,
  drop column if exists fonte;

delete from supabase_migrations.schema_migrations
 where version = '20260810090000';
