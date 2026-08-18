-- Dois nomes civis errados em fichas publicadas, achados pela lista de
-- "ambiguo" do auditor de SQ (scripts/audit-seed-sq-identity.ts).
--
-- COMO APARECERAM
--
-- O auditor marca como ambiguo o par cujo nome do seed nao bate com o do TSE
-- mas compartilha sobrenome, porque isso costuma ser variacao de grafia, nome
-- de urna ou nome de casada, e nao pessoa errada. Sao seis pares nessa lista,
-- de tres candidatos.
--
-- A duvida foi resolvida por prova, nao por semelhanca: o mesmo CPF e a mesma
-- data de nascimento aparecem nos SQ de anos diferentes de cada um. Sao a
-- mesma pessoa nos tres casos, ou seja, nenhum SQ esta errado.
--
--   ronaldo-mansur  : CPF 789...20, nasc 25/09/1979, em 2018 e 2022
--   alysson-bezerra : CPF 095...44, nasc 12/05/1992, em 2018 e 2020
--   dr-furlan       : CPF 402...20, nasc 09/07/1973, em 2018 e 2020
--
-- O QUE ISSO REVELOU
--
-- Se e a mesma pessoa e o nome diverge, entao o nome no cadastro e que esta
-- errado. Dois dos tres estao com `publicavel = true`, ou seja, o nome errado
-- esta ao vivo na ficha. E a mesma classe do achado V3 da auditoria de
-- 2026-07-24, que corrigiu quatro fichas por esse motivo.
--
--   alysson-bezerra
--     no banco : "Alysson Leandro Barbate Bezerra"
--     no TSE   : "ALLYSON LEANDRO BEZERRA SILVA"
--                (consulta_cand 2018 e 2020/RN, SQ 200000600342 e 200000661444)
--
--   dr-furlan
--     no banco : "Jose Antonio D Almeida Furlan"
--     no TSE   : "ANTONIO PAULO DE OLIVEIRA FURLAN"
--                (consulta_cand 2018 e 2020/AP, SQ 30000747583 e 30002098704)
--
-- O caso do `dr-furlan` e o mais grave dos dois: nao e grafia, e um prenome
-- diferente ("Jose Antonio" contra "Antonio Paulo").
--
-- `ronaldo-mansur` nao entra aqui: o banco ja tem "Ronaldo Mansur Santos
-- Silva", que e o nome oficial. So o seed guardava a forma curta, corrigida
-- no mesmo commit desta migration.
--
-- As datas de nascimento dos tres ja conferem com o TSE e nao sao tocadas.
-- Nome de urna tambem nao: e o nome pelo qual a pessoa se apresenta, e os do
-- banco batem com os do TSE.
BEGIN;

UPDATE public.candidatos
SET nome_completo = 'Allyson Leandro Bezerra Silva',
    ultima_atualizacao = NOW()
WHERE slug = 'alysson-bezerra'
  AND nome_completo = 'Alysson Leandro Barbate Bezerra';

UPDATE public.candidatos
SET nome_completo = 'Antonio Paulo de Oliveira Furlan',
    ultima_atualizacao = NOW()
WHERE slug = 'dr-furlan'
  AND nome_completo = 'Jose Antonio D Almeida Furlan';

DO $$
DECLARE
  alysson text;
  furlan text;
BEGIN
  SELECT nome_completo INTO alysson FROM public.candidatos WHERE slug = 'alysson-bezerra';
  SELECT nome_completo INTO furlan FROM public.candidatos WHERE slug = 'dr-furlan';

  IF alysson <> 'Allyson Leandro Bezerra Silva' THEN
    RAISE EXCEPTION 'nome_civil: alysson-bezerra esperado "Allyson Leandro Bezerra Silva", encontrado "%"', alysson;
  END IF;
  IF furlan <> 'Antonio Paulo de Oliveira Furlan' THEN
    RAISE EXCEPTION 'nome_civil: dr-furlan esperado "Antonio Paulo de Oliveira Furlan", encontrado "%"', furlan;
  END IF;
END $$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente):
--
--   select slug, nome_completo, nome_urna, data_nascimento
--     from public.candidatos
--    where slug in ('alysson-bezerra', 'dr-furlan', 'ronaldo-mansur')
--    order by slug;
