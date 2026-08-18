-- renato-gomes: remove dados eleitorais e civis atribuídos a um homônimo.
--
-- A ficha pública é de Renato Wanderley Gomes, economista e pré-candidato do
-- DC ao Governo de Mato Grosso do Sul. Os dados abaixo são de Renato da
-- Silveira Gomes, candidato a vereador em Campo Grande/MS em 2008 e 2020. O
-- registro de 2020 é o SQ 120000886590. Nome de urna e estado coincidem, mas
-- isso não prova identidade.
--
-- CPF, data_nascimento e idade já tinham sido revertidos para NULL. Esta
-- migration remove as cinco linhas filhas ainda publicadas e zera somente os
-- três campos civis que continuavam presos ao registro do homônimo. Como
-- `nome_completo` é NOT NULL no schema, ele recua para o `nome_urna` já
-- publicado, sem transformar o nome da imprensa em identidade civil.

BEGIN;

DO $$
DECLARE
  patrimonio_count integer;
  financiamento_count integer;
  historico_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'renato-gomes'
      AND cpf IS NULL
      AND data_nascimento IS NULL
      AND idade IS NULL
      AND nome_completo = 'Renato da Silveira Gomes'
      AND naturalidade = 'Campo Grande (MS)'
      AND profissao_declarada = 'Empresário'
  ) THEN
    RAISE EXCEPTION 'renato_homonimo: estado civil inesperado; abortando sem escrever';
  END IF;

  SELECT COUNT(*) INTO patrimonio_count
  FROM public.patrimonio p JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE c.slug = 'renato-gomes'
    AND ((p.ano_eleicao = 2008 AND p.valor_total = 99000)
      OR (p.ano_eleicao = 2020 AND p.valor_total = 1235000));
  IF patrimonio_count <> 2 THEN
    RAISE EXCEPTION 'renato_homonimo: esperadas 2 linhas de patrimonio, encontradas %', patrimonio_count;
  END IF;

  SELECT COUNT(*) INTO financiamento_count
  FROM public.financiamento f JOIN public.candidatos c ON c.id = f.candidato_id
  WHERE c.slug = 'renato-gomes'
    AND f.ano_eleicao = 2020
    AND f.total_arrecadado = 34355;
  IF financiamento_count <> 1 THEN
    RAISE EXCEPTION 'renato_homonimo: esperada 1 linha de financiamento, encontradas %', financiamento_count;
  END IF;

  SELECT COUNT(*) INTO historico_count
  FROM public.historico_politico h JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE c.slug = 'renato-gomes'
    AND h.proveniencia = 'tse'
    AND h.periodo_inicio IN (2008, 2020)
    AND h.cargo_canonico = 'Vereador';
  IF historico_count <> 2 THEN
    RAISE EXCEPTION 'renato_homonimo: esperadas 2 linhas de historico, encontradas %', historico_count;
  END IF;
END $$;

-- @write tabela=patrimonio slug=renato-gomes campos=id,candidato_id,ano_eleicao,valor_total,bens,fonte,created_at
DELETE FROM public.patrimonio p
USING public.candidatos c
WHERE c.id = p.candidato_id
  AND c.slug = 'renato-gomes'
  AND ((p.ano_eleicao = 2008 AND p.valor_total = 99000)
    OR (p.ano_eleicao = 2020 AND p.valor_total = 1235000));

-- @write tabela=financiamento slug=renato-gomes campos=id,candidato_id,ano_eleicao,total_arrecadado,total_fundo_partidario,total_fundo_eleitoral,total_pessoa_fisica,total_recursos_proprios,maiores_doadores,maiores_doadores_publicos,fonte,created_at
DELETE FROM public.financiamento f
USING public.candidatos c
WHERE c.id = f.candidato_id
  AND c.slug = 'renato-gomes'
  AND f.ano_eleicao = 2020
  AND f.total_arrecadado = 34355;

-- @write tabela=historico_politico slug=renato-gomes campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,observacoes,created_at,cargo_canonico,tipo_evento,proveniencia,despublicacao_motivo,despublicado_em
DELETE FROM public.historico_politico h
USING public.candidatos c
WHERE c.id = h.candidato_id
  AND c.slug = 'renato-gomes'
  AND h.proveniencia = 'tse'
  AND h.periodo_inicio IN (2008, 2020)
  AND h.cargo_canonico = 'Vereador';

-- @write tabela=candidatos slug=renato-gomes campos=nome_completo,naturalidade,profissao_declarada,ultima_atualizacao
UPDATE public.candidatos
SET nome_completo = nome_urna,
    naturalidade = NULL,
    profissao_declarada = NULL,
    ultima_atualizacao = now()
WHERE slug = 'renato-gomes';

-- @write tabela=coleta_log slug=renato-gomes campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT 'tse-identidade', 'candidato', 'renato-gomes', c.id, 'erro', 0,
       'Removidos patrimonio 2008/2020, financiamento 2020 e historico 2008/2020 do homonimo Renato da Silveira Gomes. Nome completo voltou ao nome_urna; naturalidade e profissao voltaram a NULL. A ficha e de Renato Wanderley Gomes; nome de urna e UF nao provam identidade.',
       'https://dadosabertos.tse.jus.br/dataset/candidatos-2020-subtemas',
       'manual:homonimos-sistematico-20260805'
FROM public.candidatos c WHERE c.slug = 'renato-gomes';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.candidatos c
    LEFT JOIN public.patrimonio p ON p.candidato_id = c.id
    LEFT JOIN public.financiamento f ON f.candidato_id = c.id
    LEFT JOIN public.historico_politico h ON h.candidato_id = c.id
    WHERE c.slug = 'renato-gomes'
      AND (p.id IS NOT NULL OR f.id IS NOT NULL OR h.id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'renato_homonimo: ainda existe linha filha ligada a ficha';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'renato-gomes'
      AND (cpf IS NOT NULL OR data_nascimento IS NOT NULL OR idade IS NOT NULL
        OR nome_completo IS DISTINCT FROM nome_urna
        OR naturalidade IS NOT NULL OR profissao_declarada IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'renato_homonimo: campo contaminado ainda preenchido';
  END IF;
END $$;

COMMIT;
