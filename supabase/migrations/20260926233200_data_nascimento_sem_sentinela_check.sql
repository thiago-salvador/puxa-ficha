-- Barreira no banco contra data de nascimento sentinela. A API do Senado
-- devolve 1900-01-01 para parlamentar sem data cadastrada, e esse valor chegou
-- a uma ficha pública (corrigida pela 20260926233000). A data mais antiga
-- publicada é de 1934; nenhum candidato vivo nasceu antes de 1910.
--
-- Data só com ano (1º de janeiro) não entra aqui: o TSE registra candidato
-- nascido de fato em 01/01/1973. Esse formato é barrado nos ingests de fonte
-- secundária (scripts/lib/data-nascimento.ts), e o ingest do TSE corrige a
-- data pela inscrição do pleito corrente.
--
-- Antes desta migration nenhuma linha viola a regra (medido em 2026-09-26: a
-- única era tse-2026-20002553726, corrigida pela migration anterior do mesmo
-- workflow). O ADD CONSTRAINT valida a tabela inteira e falha se houver outra.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-datas-nascimento-tse-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';

ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_data_nascimento_sem_sentinela_check
  CHECK (data_nascimento IS NULL OR data_nascimento >= DATE '1910-01-01');

COMMENT ON CONSTRAINT candidatos_data_nascimento_sem_sentinela_check ON public.candidatos IS
  'Data de nascimento anterior a 1910 e sentinela de fonte (1900-01-01 da API do Senado), nunca nascimento de candidato.';

COMMIT;
