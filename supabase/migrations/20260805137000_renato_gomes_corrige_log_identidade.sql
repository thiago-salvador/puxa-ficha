-- Corrige o texto de auditoria da limpeza de identidade de renato-gomes.
--
-- A migration 20260805134000 preserva o nome de urna porque nome_completo e
-- NOT NULL, mas a primeira versao do detalhe dizia que o campo virou NULL.
BEGIN;

-- @write tabela=coleta_log slug=renato-gomes campos=detalhe
DO $$
DECLARE
  linhas integer;
BEGIN
  UPDATE public.coleta_log
  SET detalhe =
    'Removidos patrimonio 2008/2020, financiamento 2020 e historico 2008/2020 do homonimo Renato da Silveira Gomes. Nome completo voltou ao nome_urna; naturalidade e profissao voltaram a NULL. A ficha e de Renato Wanderley Gomes; nome de urna e UF nao provam identidade.'
  WHERE alvo = 'renato-gomes'
    AND fonte = 'tse-identidade'
    AND execucao = 'manual:homonimos-sistematico-20260805';

  GET DIAGNOSTICS linhas = ROW_COUNT;
  IF linhas <> 1 THEN
    RAISE EXCEPTION 'renato_homonimo_log: esperado 1 registro, encontrado %', linhas;
  END IF;
END $$;

COMMIT;

-- REVERSAO MANUAL
-- Repor o detalhe anterior apenas se for necessario reproduzir literalmente o
-- erro de auditoria. A correcao nao altera nenhum dado publico da ficha.
