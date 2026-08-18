-- Fecha as duas pendencias abertas do trabalho de homonimo, agora com fonte
-- primaria: o pacote de dados abertos do TSE (consulta_cand), baixado e lido
-- em 26/07/2026.
--
-- A API DivulgaCandContas nao respondeu (HTTP 200 com corpo vazio), mas o
-- pacote anual em cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/
-- responde e e a mesma fonte oficial, em formato CSV.
--
-- =====================================================================
-- ACHADO 1: a ficha de jeronimo carregava a identidade de OUTRA PESSOA
-- =====================================================================
--
-- O laudo de 24/07 registrou "CPF divergente de jeronimo" sem descrever a
-- origem. A origem esta no seed, nao no banco:
--
--   data/candidatos.json declarava para o slug `jeronimo`
--     ids.tse_sq_candidato["2022"] = "100001606606"
--     ids.tse_sq_candidato["2020"] = "50001165142"
--
-- Nenhum dos dois e dele:
--
--   100001606606 -> JERONIMO FERREIRA CAVALCANTE FILHO, Deputado Estadual
--                   pelo MDB no MARANHAO, nascido em 03/07/1963.
--                   (consulta_cand_2022_MA.csv e _BRASIL.csv)
--   50001165142  -> JERONIMO OLIVEIRA CAVALCANTE, Vereador pelo MDB em
--                   SANTO AMARO/BA, nascido em 06/06/1953.
--                   (consulta_cand_2020_BA.csv)
--
-- O SQ_CANDIDATO e o degrau de MAIOR prioridade do scripts/lib/tse-resolver.ts,
-- acima do CPF e do nome. Com um SQ errado, a ingestao ancora a pessoa errada
-- com confianca maxima e grava os dados dela. Foi o que aconteceu: o CPF que
-- estava em candidatos.cpf e o do deputado do Maranhao, e a partir dai o
-- degrau de CPF passou a casar com ele, e o resto caiu no casamento por nome.
--
-- O registro correto e:
--   SQ_CANDIDATO 50001603638, JERONIMO RODRIGUES SOUZA, Governador pelo PT na
--   BAHIA, nascido em 03/04/1965, UF de nascimento BA, 2o turno.
--   (consulta_cand_2022_BA.csv)
--
-- Em 2020 ele nao tem candidatura nenhuma na Bahia: a busca por nome no
-- arquivo do ano volta vazia, coerente com o fato de ele ser Secretario de
-- Educacao no periodo. A entrada de 2020 sai do seed, nao e substituida.
--
-- O CPF NAO e escrito aqui, pela politica ja adotada em
-- 20260725123000 e 20260725150000: este repositorio e publico e o projeto
-- trata cpf como dado sensivel. Aqui ele e ANULADO, porque manter o CPF de
-- um terceiro no cadastro de outra pessoa e afirmacao falsa sobre duas
-- pessoas reais ao mesmo tempo. O valor correto esta em
-- consulta_cand_2022_BA.csv, coluna NR_CPF_CANDIDATO da linha do
-- SQ_CANDIDATO 50001603638, e e aplicado fora do versionamento.
--
-- =====================================================================
-- ACHADO 2: professora-dorinha, as duas candidaturas sao de outra pessoa
-- =====================================================================
--
-- As duas linhas de Vereador marcadas como suspeitas em 26/07 pertencem a
-- DORALICE DE SOUSA DANTAS (FERNANDES), nome de urna "PROFESSORA DORINHA",
-- de ARAGUATINS/TO:
--
--   2000, Vereador pelo PPB, Araguatins   (consulta_cand_2000_TO.csv)
--   2016, Vereador pelo PMDB, Araguatins  (consulta_cand_2016_TO.csv)
--
-- A candidata do site, MARIA AUXILIADORA SEABRA REZENDE, nao aparece em
-- nenhum dos dois anos: a busca por "SEABRA" em 2016/TO volta vazia, coerente
-- com o fato de ela ser deputada federal no periodo.
--
-- E o mesmo mecanismo do jeronimo, por outro caminho: aqui o nome de urna
-- coincide inteiro ("Professora Dorinha"), no mesmo estado e no mesmo partido
-- em 2016, o que basta para o degrau de nome casar.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Identidade de jeronimo, corrigida contra o TSE.
UPDATE public.candidatos
SET data_nascimento = DATE '1965-04-03',
    naturalidade = 'BA',
    cpf = NULL,
    ultima_atualizacao = NOW()
WHERE slug = 'jeronimo';

COMMENT ON COLUMN public.candidatos.naturalidade IS
  'Local de nascimento. O pacote consulta_cand do TSE traz apenas a UF (SG_UF_NASCIMENTO), nao o municipio, entao linhas corrigidas por essa fonte podem ter so a sigla.';

-- ---------------------------------------------------------------------------
-- 2. As duas candidaturas de outra pessoa saem da ficha de professora-dorinha.
UPDATE public.historico_politico
SET despublicado_em = timestamptz '2026-07-26 15:30:00-03',
    despublicacao_motivo = 'Candidatura de DORALICE DE SOUSA DANTAS (nome de urna "Professora Dorinha"), de Araguatins/TO, confirmada no pacote consulta_cand do TSE. Maria Auxiliadora Seabra Rezende nao tem candidatura propria nesses anos. Reversivel.'
WHERE id IN (
  'a61c5736-7d90-419a-8f24-6d3f15499242', -- 2000, Vereador, PPB, Araguatins
  '6b40fd51-8852-4f7d-8296-8a727d738a9e'  -- 2016, Vereador, PMDB, Araguatins
) AND despublicado_em IS NULL;

-- ---------------------------------------------------------------------------
DO $$
DECLARE
  nasc date;
  nat text;
  tem_cpf boolean;
  dorinha_fora integer;
  dorinha_no_ar integer;
BEGIN
  SELECT data_nascimento, naturalidade, cpf IS NOT NULL
    INTO nasc, nat, tem_cpf
  FROM public.candidatos WHERE slug = 'jeronimo';

  IF nasc <> DATE '1965-04-03' THEN
    RAISE EXCEPTION 'identidade_jeronimo: data_nascimento esperada 1965-04-03, encontrada %', nasc;
  END IF;
  IF nat <> 'BA' THEN
    RAISE EXCEPTION 'identidade_jeronimo: naturalidade esperada BA, encontrada %', nat;
  END IF;
  IF tem_cpf THEN
    RAISE EXCEPTION 'identidade_jeronimo: o CPF de terceiro deveria ter sido anulado aqui';
  END IF;

  SELECT COUNT(*) INTO dorinha_fora
  FROM public.historico_politico h
  JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE c.slug = 'professora-dorinha' AND h.despublicado_em IS NOT NULL;

  IF dorinha_fora <> 2 THEN
    RAISE EXCEPTION 'homonimo_dorinha: esperadas 2 linhas fora do ar, encontradas %', dorinha_fora;
  END IF;

  SELECT COUNT(*) INTO dorinha_no_ar
  FROM public.historico_politico h
  JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE c.slug = 'professora-dorinha' AND h.despublicado_em IS NULL AND h.cargo = 'Vereador';

  IF dorinha_no_ar <> 0 THEN
    RAISE EXCEPTION 'homonimo_dorinha: nao deveria sobrar candidatura a Vereador publicada, encontradas %', dorinha_no_ar;
  END IF;
END $$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente):
--
--   select slug, data_nascimento, naturalidade, cpf is null as cpf_anulado
--     from public.candidatos where slug = 'jeronimo';
--
--   select h.periodo_inicio, h.cargo, h.partido, h.despublicado_em is not null as fora
--     from public.historico_politico h
--     join public.candidatos c on c.id = h.candidato_id
--    where c.slug = 'professora-dorinha' order by h.periodo_inicio;
--
-- PENDENTE fora desta migration:
--   - Aplicar o CPF correto de jeronimo (fora do versionamento, ver acima).
--   - Reprocessar a ingestao dele com o SQ corrigido no seed, para reancorar
--     patrimonio e financiamento por SQ em vez de por nome.
