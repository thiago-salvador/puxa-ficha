-- renato-gomes: remove reincidência do homônimo Renato da Silveira Gomes.
--
-- A migration 20260805134000 removeu as linhas 2008/2020 (vereador, SQ
-- 120000886590) em 05/08 com decisão documentada: a ficha é de Renato
-- Wanderley Gomes, economista e pré-candidato do DC ao governo de MS; nome de
-- urna e UF não provam identidade. O coleta_log tse-cpf de 05/08 18:07
-- registrou "documento removido: SQ pertence a homônimo; bloqueado até fonte
-- oficial inequívoca". Ainda assim, uma ingestão posterior (tse-historico,
-- 05/08 17:48, posterior à remoção das 13:40) reinseriu as duas candidaturas,
-- que voltaram a ficar públicas. Esta migration reexecuta a remoção já
-- decidida e registra a reincidência. A causa raiz (a ingestão não respeita o
-- bloqueio de identidade) fica registrada para correção própria do pipeline.
BEGIN;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.historico_politico h
  JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE c.slug = 'renato-gomes'
    AND h.proveniencia = 'tse'
    AND h.periodo_inicio IN (2008, 2020)
    AND h.cargo_canonico = 'Vereador';

  IF n <> 2 THEN
    RAISE EXCEPTION 'renato_gomes_reincidencia: esperadas 2 linhas do homonimo, encontradas %', n;
  END IF;
END $$;

-- @write tabela=historico_politico slug=renato-gomes campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,observacoes,cargo_canonico,tipo_evento,proveniencia,despublicacao_motivo,despublicado_em
DELETE FROM public.historico_politico h
USING public.candidatos c
WHERE c.id = h.candidato_id
  AND c.slug = 'renato-gomes'
  AND h.proveniencia = 'tse'
  AND h.periodo_inicio IN (2008, 2020)
  AND h.cargo_canonico = 'Vereador';

-- @write tabela=coleta_log slug=renato-gomes campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT 'tse-identidade', 'candidato', 'renato-gomes', c.id, 'erro', 0,
       'Reincidencia removida: ingestao posterior a 20260805134000 reinseriu as candidaturas 2008/2020 do homonimo Renato da Silveira Gomes (SQ 120000886590). Linhas removidas novamente. Causa raiz: ingestao nao respeita o bloqueio de identidade registrado; correcao do pipeline pendente.',
       'https://dadosabertos.tse.jus.br/dataset/candidatos-2020-subtemas',
       'pf-patrimonio-20260807T170643Z'
FROM public.candidatos c WHERE c.slug = 'renato-gomes';

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.historico_politico h
  JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE c.slug = 'renato-gomes'
    AND h.proveniencia = 'tse';

  IF n <> 0 THEN
    RAISE EXCEPTION 'renato_gomes_reincidencia: esperadas 0 linhas TSE apos remocao, restam %', n;
  END IF;
END $$;

COMMIT;
