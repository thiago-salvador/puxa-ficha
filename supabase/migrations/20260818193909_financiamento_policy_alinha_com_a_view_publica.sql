-- A policy de leitura de `financiamento` liberava MAIS linhas do que a view
-- publica mostra, entao quem usasse a chave anon direto no PostgREST via 6
-- registros que a UI esconde.
--
-- MEDIDO em 18/08/2026 com a chave anon, antes de mexer:
--   financiamento            505 linhas
--   financiamento_publico    499 linhas
--   diferenca                  6, todas com despublicado_em NOT NULL
--
-- A view filtra `is_public_candidate(candidato_id) AND despublicado_em IS NULL`.
-- A policy tinha so a primeira metade. Esta migration acrescenta a segunda, e
-- com isso o acesso direto passa a devolver exatamente o mesmo conjunto da view.
-- Readback depois de aplicar: 499 e 499.
--
-- POR QUE NAO REVOGAR O GRANT DO ANON, que seria o conserto obvio: as duas views
-- publicas sao `security_invoker=true` (ver 20260602144500), ou seja leem com a
-- permissao de QUEM CHAMA. Tirar o SELECT do anon na tabela base tiraria a
-- permissao da view junto, e `financiamento_publico` pararia de responder para o
-- site. O conserto por RLS fecha o furo sem tocar em permissao, e a view continua
-- enxergando o que precisa porque agora os dois conjuntos sao o mesmo.
--
-- Nao ha exposicao de identidade neste furo: o anon nunca teve SELECT na coluna
-- `maiores_doadores` crua, so na `maiores_doadores_publicos` ja sanitizada, o que
-- a 20260417194000 garantiu.
--
-- Achado do review de seguranca de lancamento de 18/08/2026.
DROP POLICY IF EXISTS "Leitura pública" ON public.financiamento;

CREATE POLICY "Leitura pública" ON public.financiamento
  FOR SELECT
  USING (is_public_candidate(candidato_id) AND despublicado_em IS NULL);
