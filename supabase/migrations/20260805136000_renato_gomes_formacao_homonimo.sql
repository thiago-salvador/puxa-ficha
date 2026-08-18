-- Resíduo da correção de renato-gomes: a formação também veio do homônimo.
--
-- O consulta_cand_2020_MS registra no SQ 120000886590, Renato da Silveira
-- Gomes, tanto a profissão EMPRESÁRIO quanto a formação ENSINO MÉDIO COMPLETO.
-- A migration 20260805134000 removeu a profissão listada no incidente, mas o
-- readback mostrou que a formação idêntica continuava publicada. Sem fonte
-- oficial para a pessoa correta, o campo deve ficar vazio.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'renato-gomes'
      AND formacao = 'Ensino médio completo'
      AND cpf IS NULL
      AND data_nascimento IS NULL
      AND profissao_declarada IS NULL
  ) THEN
    RAISE EXCEPTION 'renato_formacao_homonimo: estado inesperado; abortando sem escrever';
  END IF;
END $$;

-- @write tabela=candidatos slug=renato-gomes campos=formacao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = NULL,
    ultima_atualizacao = now()
WHERE slug = 'renato-gomes'
  AND formacao = 'Ensino médio completo';

-- @write tabela=coleta_log slug=renato-gomes campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT 'tse-identidade', 'candidato', 'renato-gomes', c.id, 'erro', 0,
       'Readback da correcao encontrou residuo: formacao Ensino medio completo tambem vinha do SQ 120000886590 do homonimo Renato da Silveira Gomes. Campo revertido para NULL; nenhuma formacao foi inferida para a pessoa correta.',
       'https://dadosabertos.tse.jus.br/dataset/candidatos-2020-subtemas',
       'manual:homonimos-sistematico-readback-20260805'
FROM public.candidatos c WHERE c.slug = 'renato-gomes';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'renato-gomes' AND formacao IS NOT NULL) THEN
    RAISE EXCEPTION 'renato_formacao_homonimo: formacao ainda preenchida';
  END IF;
END $$;

COMMIT;
