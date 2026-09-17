-- Preenche chapas_2026.sq_coligacao para as duas chapas admitidas por fonte
-- direta (fonte_tipo='divulgacand_detalhe'), que ficaram sem esse campo
-- porque a admissão direta (20260907193100_siqueira_to_publication.sql,
-- 20260828/20260916 para o PRTB) não passava pelo pacote CSV. Issue #340
-- follow-up: a auditoria de dados casa slot por (uf, cargo, sq_coligacao),
-- e sq_coligacao NULL nas duas quebra o casamento mesmo com o titular
-- corretamente publicado, gerando falso `inclusion` bloqueante para o
-- titular oficial vigente.
--
-- Fonte oficial: coluna SQ_COLIGACAO de consulta_cand_2026.zip (TSE Dados
-- Abertos, https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip),
-- lida por scripts/lib/data-freshness/tse-source.ts:159. Varredura completa
-- em 17/09/2026 sobre TODAS as chapas com sq_coligacao IS NULL (2 no total,
-- ambas fonte_tipo='divulgacand_detalhe'; nenhuma outra linha divirge):
--
--   2026:BR:pablo-henrique-costa-marcal (titular 280002554479 Leonardo
--   Avalanche / vice 280002554490 Silvia, PRTB): CSV traz SQ_COLIGACAO
--   280001801455 para o titular 280002554479 E para o vice 280002554490 e
--   para o antecessor substituído 280002553884 (Pablo Marçal) -- match
--   inequívoco, mesmo valor nos três registros da chapa.
--
--   2026:TO:jose-wilson-siqueira-campos-junior:270002554375 (titular
--   270002554375 Siqueira Campos Jr / vice 270002554376 Capitão Osmar,
--   DEMOCRATA): CSV traz SQ_COLIGACAO 270001800814 para titular E vice --
--   match inequívoco.
--
-- Nenhuma outra ambiguidade encontrada: as duas únicas linhas com
-- sq_coligacao NULL têm titular_sq_candidato com correspondência única e
-- consistente (titular e vice concordam) no pacote oficial.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chapas_2026) THEN
    RAISE NOTICE 'sq-coligacao-chapas-direta: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  -- Pre-imagem exata: as duas chapas continuam com sq_coligacao NULL e com
  -- o titular_sq_candidato que ancorou a pesquisa de 17/09/2026. Qualquer
  -- divergencia aborta antes de qualquer escrita.
  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
         AND fonte_tipo = 'divulgacand_detalhe'
         AND titular_sq_candidato = '280002554479'
         AND vice_sq_candidato = '280002554490'
         AND sq_coligacao IS NULL) <> 1
     OR (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375'
         AND fonte_tipo = 'divulgacand_detalhe'
         AND titular_sq_candidato = '270002554375'
         AND vice_sq_candidato = '270002554376'
         AND sq_coligacao IS NULL) <> 1
     OR (SELECT count(*) FROM public.chapas_2026 WHERE sq_coligacao IS NULL) <> 2
  THEN
    RAISE EXCEPTION 'sq-coligacao-chapas-direta: preimagem divergiu';
  END IF;

  -- @write tabela=chapas_2026 ref=sq-coligacao-prtb-16092026 chave=2026:BR:pablo-henrique-costa-marcal campos=sq_coligacao
  UPDATE public.chapas_2026
  SET sq_coligacao = '280001801455'
  WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
    AND fonte_tipo = 'divulgacand_detalhe'
    AND titular_sq_candidato = '280002554479'
    AND sq_coligacao IS NULL;
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN RAISE EXCEPTION 'sq-coligacao-chapas-direta: escrita PRTB esperada=1 atual=%', quantidade; END IF;

  -- @write tabela=chapas_2026 ref=sq-coligacao-to-siqueira-16092026 chave=2026:TO:jose-wilson-siqueira-campos-junior:270002554375 campos=sq_coligacao
  UPDATE public.chapas_2026
  SET sq_coligacao = '270001800814'
  WHERE chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375'
    AND fonte_tipo = 'divulgacand_detalhe'
    AND titular_sq_candidato = '270002554375'
    AND sq_coligacao IS NULL;
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN RAISE EXCEPTION 'sq-coligacao-chapas-direta: escrita TO esperada=1 atual=%', quantidade; END IF;

  IF (SELECT count(*) FROM public.chapas_2026 WHERE sq_coligacao IS NULL) <> 0 THEN
    RAISE EXCEPTION 'sq-coligacao-chapas-direta: pos-condicao falhou, ainda ha linha sem sq_coligacao';
  END IF;
  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:BR:pablo-henrique-costa-marcal' AND sq_coligacao = '280001801455')<>1
     OR (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375' AND sq_coligacao = '270001800814')<>1
  THEN
    RAISE EXCEPTION 'sq-coligacao-chapas-direta: pos-condicao de valor falhou';
  END IF;

  -- @write tabela=coleta_log ref=migration:20260916170000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  VALUES (
    'tse-consulta-cand-2026', 'chapa', 'chapas_2026.sq_coligacao', 'encontrado', 2,
    'Issue #340 follow-up: preenchido sq_coligacao das duas chapas admitidas por fonte direta (PRTB presidencial 280001801455, TO governador Siqueira Campos Jr 270001800814), coluna SQ_COLIGACAO de consulta_cand_2026.zip, casando por titular_sq_candidato e confirmando consistencia com o vice.',
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
    'migration:20260916170000', 'escrita'
  );
END
$apply$;

COMMIT;
