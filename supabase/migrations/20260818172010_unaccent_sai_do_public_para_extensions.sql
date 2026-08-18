-- Advisor do Supabase "Extension in Public": a extensao unaccent estava no schema
-- public. Extensao em public amplia a superficie que o PostgREST expoe e fica
-- sujeita a sombreamento de search_path.
--
-- MEDIDO ANTES DE MOVER, em 18/08/2026:
--   0 indices, 0 views e 0 materialized views citam unaccent;
--   as 4 funcoes que a citam sao da PROPRIA extensao (unaccent, unaccent_init,
--   unaccent_lexize), nao codigo do app;
--   o codigo evita unaccent de proposito, com translate() e normalizacao NFD, em
--   cinco comentarios que dizem isso explicitamente. Ver
--   supabase/migrations/20260407190000_doador_reverse_rpc.sql e
--   scripts/audit/noticias.sql.
--
-- Nada depende dela. E o pg_trgm, a outra extensao citada nos comentarios do
-- codigo, ja estava em extensions: unaccent era a unica fora do padrao do proprio
-- banco, que ja tinha 4 extensoes la.
--
-- POR QUE O GUARD, e nao um ALTER solto: nenhuma migration deste diretorio cria
-- unaccent. O initial_schema so cria pg_trgm, entao unaccent entrou por fora da
-- cadeia, pelo painel ou por default do Supabase. Um ALTER cru falharia no replay
-- linear contra Postgres vazio, e entraria na lista de falhas do
-- scripts/audit/falhas-replay-linear.json sem precisar. Com o guard a migration
-- aplica limpo nos dois mundos: onde a extensao existe, ela muda de schema; onde
-- nao existe, vira no-op.
--
-- Num banco recriado so a partir das migrations, unaccent simplesmente nao
-- existira. Isso e aceitavel porque nada a usa, e e mais honesto do que cria-la
-- aqui so para poder move-la.
--
-- READBACK em producao depois de aplicar, conferido:
--   unaccent@extensions, zero extensoes restando em public, e
--   unaccent('Ficha do Marcal, Sao Paulo') devolvendo o texto sem acento tanto
--   qualificada quanto sem qualificar. O advisor parou de listar o aviso.
--
-- Aplicada em producao em 18/08/2026 como 20260818172010, com autorizacao nomeada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'unaccent') THEN
    ALTER EXTENSION unaccent SET SCHEMA extensions;
  END IF;
END
$$;
