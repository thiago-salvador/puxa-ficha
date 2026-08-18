-- Terceiro caso de SQ_CANDIDATO errado no seed, este achado pelo auditor novo
-- (scripts/audit-seed-sq-identity.ts) e nao a mao.
--
-- O seed declarava para `joao-roma`:
--   ids.tse_sq_candidato["2020"] = "50001261068"
--
-- Esse SQ e de JOAO CARLOS BACELAR BATISTA (nome de urna "BACELAR"), candidato
-- a Prefeito de Salvador pelo PODE em 2020 (consulta_cand_2020_BA.csv).
--
-- JOAO INACIO RIBEIRO ROMA NETO nao tem candidatura nenhuma na Bahia em 2020:
-- a busca por "ROMA NETO" no arquivo do ano volta vazia. Ele era deputado
-- federal no periodo e virou ministro em fevereiro de 2021.
--
-- O que os dois tem em comum e o primeiro nome e a UF, o que basta para o
-- auditor classificar como ambiguo mas nao para carimbar como a mesma pessoa.
-- Foi a checagem no arquivo do TSE que fechou.
--
-- `joao-roma` esta com publicavel = false, entao a linha nao estava visivel ao
-- leitor. Corrigir mesmo assim, porque dado errado guardado volta a aparecer no
-- dia em que a ficha for publicada.
BEGIN;

UPDATE public.historico_politico
SET despublicado_em = timestamptz '2026-07-26 15:45:00-03',
    despublicacao_motivo = 'Candidatura de JOAO CARLOS BACELAR BATISTA (urna "Bacelar") a Prefeito de Salvador pelo PODE em 2020, atribuida por SQ_CANDIDATO errado no seed. Joao Inacio Ribeiro Roma Neto nao tem candidatura na Bahia em 2020. Reversivel.'
WHERE id = '14452905-34c9-4658-a873-027ecd0cd5c5'
  AND despublicado_em IS NULL;

DO $$
DECLARE
  fora integer;
BEGIN
  SELECT COUNT(*) INTO fora
  FROM public.historico_politico h
  JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE c.slug = 'joao-roma' AND h.periodo_inicio = 2020 AND h.despublicado_em IS NOT NULL;

  IF fora <> 1 THEN
    RAISE EXCEPTION 'homonimo_joao_roma: esperada 1 linha de 2020 fora do ar, encontrada %', fora;
  END IF;
END $$;

COMMIT;
