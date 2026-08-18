-- Varredura sistemática de homônimos: Cadu Xavier e Juliana Brizola.
--
-- CADU XAVIER
-- O registro TSE 2020 de Carlos Eduardo Xavier, nome de urna Cadu Xavier, é de
-- um estudante nascido em 04/06/1999, candidato a vereador em Mossoró pelo
-- DEM, SQ 200000998862. A ficha é do auditor fiscal que já assinava como
-- secretário estadual em 2019 e que disputa seu primeiro cargo eletivo em
-- 2026. A coincidência de nome não estabelece identidade.
--
-- Fontes:
-- - TSE, consulta_cand_2020_RN.csv, SQ 200000998862.
-- - Diário Oficial do RN, 08/08/2019: Carlos Eduardo Xavier assina como
--   secretário de Tributação.
-- - Itatiaia, 22/07/2026: primeira disputa eleitoral em 2026.
--
-- JULIANA BRIZOLA
-- O TSE 2020 tem duas pessoas distintas com o mesmo nome de urna. Juliana
-- Brizola, nascida em 03/08/1975, disputou a Prefeitura de Porto Alegre pelo
-- PDT, SQ 210001189949. Juliana Maria Mittelstaedt Brizola, nascida em
-- 13/12/1989, disputou vereadora em Ronda Alta pelo PSL, SQ 210001233500. A
-- ficha já tem a candidatura correta a prefeita; só a linha de vereadora é do
-- homônimo.

BEGIN;

DO $$
DECLARE
  cadu_hist integer;
  cadu_pat integer;
  cadu_fin integer;
  juliana_errada integer;
  juliana_certa integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'cadu-xavier'
      AND cpf IS NOT NULL
      AND data_nascimento = date '1999-06-04'
      AND genero = 'MASCULINO'
      AND cor_raca = 'BRANCA'
      AND formacao = 'ENSINO MÉDIO COMPLETO'
      AND estado_civil = 'SOLTEIRO(A)'
      AND naturalidade = 'RN'
      AND profissao_declarada = 'ESTUDANTE, BOLSISTA, ESTAGIÁRIO E ASSEMELHADOS'
  ) THEN
    RAISE EXCEPTION 'cadu_homonimo: estado pessoal inesperado; abortando sem escrever';
  END IF;

  SELECT COUNT(*) INTO cadu_hist
  FROM public.historico_politico h JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE c.slug = 'cadu-xavier' AND h.periodo_inicio = 2020
    AND h.cargo_canonico = 'Vereador' AND h.partido = 'DEM'
    AND h.despublicado_em IS NULL;
  SELECT COUNT(*) INTO cadu_pat
  FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE c.slug = 'cadu-xavier' AND p.ano_eleicao = 2020 AND p.valor_total = 7845.52;
  SELECT COUNT(*) INTO cadu_fin
  FROM public.financiamento f JOIN public.candidatos c ON c.id = f.candidato_id
  WHERE c.slug = 'cadu-xavier' AND f.ano_eleicao = 2020 AND f.total_arrecadado = 10000;
  IF cadu_hist <> 1 OR cadu_pat <> 1 OR cadu_fin <> 1 THEN
    RAISE EXCEPTION 'cadu_homonimo: esperado historico=1 patrimonio=1 financiamento=1; encontrado %/%/%', cadu_hist, cadu_pat, cadu_fin;
  END IF;

  SELECT COUNT(*) INTO juliana_errada
  FROM public.historico_politico h JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE c.slug = 'juliana-brizola' AND h.periodo_inicio = 2020
    AND h.cargo_canonico = 'Vereador' AND h.partido = 'PSL'
    AND h.despublicado_em IS NULL;
  SELECT COUNT(*) INTO juliana_certa
  FROM public.historico_politico h JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE c.slug = 'juliana-brizola' AND h.periodo_inicio = 2020
    AND h.cargo_canonico = 'Prefeito' AND h.partido = 'PDT'
    AND h.despublicado_em IS NULL;
  IF juliana_errada <> 1 OR juliana_certa <> 1 THEN
    RAISE EXCEPTION 'juliana_homonima: esperado vereadora PSL=1 e prefeita PDT=1; encontrado %/%', juliana_errada, juliana_certa;
  END IF;
END $$;

-- @write tabela=patrimonio slug=cadu-xavier campos=id,candidato_id,ano_eleicao,valor_total,bens,fonte,created_at
DELETE FROM public.patrimonio p
USING public.candidatos c
WHERE c.id = p.candidato_id
  AND c.slug = 'cadu-xavier'
  AND p.ano_eleicao = 2020
  AND p.valor_total = 7845.52;

-- @write tabela=financiamento slug=cadu-xavier campos=id,candidato_id,ano_eleicao,total_arrecadado,total_fundo_partidario,total_fundo_eleitoral,total_pessoa_fisica,total_recursos_proprios,maiores_doadores,maiores_doadores_publicos,fonte,created_at
DELETE FROM public.financiamento f
USING public.candidatos c
WHERE c.id = f.candidato_id
  AND c.slug = 'cadu-xavier'
  AND f.ano_eleicao = 2020
  AND f.total_arrecadado = 10000;

-- @write tabela=historico_politico slug=cadu-xavier campos=despublicado_em,despublicacao_motivo
UPDATE public.historico_politico h
SET despublicado_em = timestamptz '2026-08-05 15:00:00-03',
    despublicacao_motivo =
      'Candidatura de homonimo: estudante nascido em 04/06/1999, vereador 2020 em Mossoro/DEM, SQ 200000998862. A ficha e do auditor fiscal e ex-secretario da Fazenda do RN, em sua primeira disputa eleitoral em 2026. Reversivel.'
FROM public.candidatos c
WHERE c.id = h.candidato_id
  AND c.slug = 'cadu-xavier'
  AND h.periodo_inicio = 2020
  AND h.cargo_canonico = 'Vereador'
  AND h.partido = 'DEM'
  AND h.despublicado_em IS NULL;

-- @write tabela=candidatos slug=cadu-xavier campos=cpf,data_nascimento,idade,genero,cor_raca,formacao,estado_civil,naturalidade,profissao_declarada,ultima_atualizacao
UPDATE public.candidatos
SET cpf = NULL,
    data_nascimento = NULL,
    idade = NULL,
    genero = NULL,
    cor_raca = NULL,
    formacao = NULL,
    estado_civil = NULL,
    naturalidade = NULL,
    profissao_declarada = NULL,
    ultima_atualizacao = now()
WHERE slug = 'cadu-xavier';

-- @write tabela=coleta_log slug=cadu-xavier campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT 'tse-identidade', 'candidato', 'cadu-xavier', c.id, 'erro', 0,
       'Registro 2020 revertido: estudante candidato a vereador em Mossoro/DEM, SQ 200000998862, e homonimo do auditor fiscal e ex-secretario da Fazenda do RN. CPF e campos pessoais do TSE voltaram a NULL; dinheiro removido; historico despublicado.',
       'https://dadosabertos.tse.jus.br/dataset/candidatos-2020-subtemas',
       'manual:homonimos-sistematico-20260805'
FROM public.candidatos c WHERE c.slug = 'cadu-xavier';

-- @write tabela=coleta_log slug=cadu-xavier campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT 'transparencia-sanctions', 'candidato', 'cadu-xavier', c.id, 'erro', 0,
       'Vazios confirmados anteriores invalidos: as consultas usaram o CPF do homonimo candidato a vereador em 2020. Reconsultar somente quando houver CPF da pessoa correta em fonte oficial.',
       NULL,
       'manual:homonimos-sistematico-20260805'
FROM public.candidatos c WHERE c.slug = 'cadu-xavier';

-- @write tabela=historico_politico slug=juliana-brizola campos=despublicado_em,despublicacao_motivo
UPDATE public.historico_politico h
SET despublicado_em = timestamptz '2026-08-05 15:00:00-03',
    despublicacao_motivo =
      'Candidatura da homonima Juliana Maria Mittelstaedt Brizola, vereadora 2020 em Ronda Alta/PSL, SQ 210001233500. A ficha e de Juliana Daudt Brizola, candidata a prefeita de Porto Alegre/PDT no mesmo pleito, SQ 210001189949. Reversivel.'
FROM public.candidatos c
WHERE c.id = h.candidato_id
  AND c.slug = 'juliana-brizola'
  AND h.periodo_inicio = 2020
  AND h.cargo_canonico = 'Vereador'
  AND h.partido = 'PSL'
  AND h.despublicado_em IS NULL;

-- @write tabela=coleta_log slug=juliana-brizola campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT 'tse-identidade', 'candidato', 'juliana-brizola', c.id, 'encontrado', 1,
       'Despublicada candidatura de homonima: Juliana Maria Mittelstaedt Brizola, vereadora 2020 Ronda Alta/PSL, SQ 210001233500. Mantida a candidatura correta de Juliana Daudt Brizola a prefeita de Porto Alegre/PDT, SQ 210001189949.',
       'https://dadosabertos.tse.jus.br/dataset/candidatos-2020-subtemas',
       'manual:homonimos-sistematico-20260805'
FROM public.candidatos c WHERE c.slug = 'juliana-brizola';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.candidatos c
    LEFT JOIN public.patrimonio p ON p.candidato_id = c.id
    LEFT JOIN public.financiamento f ON f.candidato_id = c.id
    LEFT JOIN public.historico_politico h ON h.candidato_id = c.id
      AND h.periodo_inicio = 2020 AND h.cargo_canonico = 'Vereador' AND h.despublicado_em IS NULL
    WHERE c.slug = 'cadu-xavier'
      AND (p.id IS NOT NULL OR f.id IS NOT NULL OR h.id IS NOT NULL
        OR c.cpf IS NOT NULL OR c.data_nascimento IS NOT NULL OR c.idade IS NOT NULL
        OR c.genero IS NOT NULL OR c.cor_raca IS NOT NULL OR c.formacao IS NOT NULL
        OR c.estado_civil IS NOT NULL OR c.naturalidade IS NOT NULL OR c.profissao_declarada IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'cadu_homonimo: dado contaminado ainda ativo';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.historico_politico h JOIN public.candidatos c ON c.id = h.candidato_id
    WHERE c.slug = 'juliana-brizola' AND h.periodo_inicio = 2020
      AND h.cargo_canonico = 'Vereador' AND h.partido = 'PSL' AND h.despublicado_em IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.historico_politico h JOIN public.candidatos c ON c.id = h.candidato_id
    WHERE c.slug = 'juliana-brizola' AND h.periodo_inicio = 2020
      AND h.cargo_canonico = 'Prefeito' AND h.partido = 'PDT' AND h.despublicado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'juliana_homonima: estado pos-correcao inesperado';
  END IF;
END $$;

COMMIT;
