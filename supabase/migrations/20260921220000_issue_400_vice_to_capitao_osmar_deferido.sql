-- Issue #400, segunda causa: depois de a policial-edjane sair do ar
-- (20260921200000), a auditoria de 21/09 (run 35658352702) seguiu em
-- review_required por um status_change novo: o vice de Tocantins CAPITAO OSMAR
-- (DEMOCRATA, SQ 270002554376, chapa 2026:TO:jose-wilson-siqueira-campos-junior:270002554375)
-- esta publicado como "Pendente de julgamento" e o TSE ja o da como Deferido.
--
-- Fonte: DivulgaCandContas, detalhe https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/TO/20322002026/candidato/270002554376
-- lido ao vivo em 2026-09-21T21:42:20.909Z: descricaoSituacao "Deferido",
-- isCandidatoInapto false, descricaoSituacaoCandidato "Consta da urna",
-- SHA-256 do corpo 7511e9c8be401f12314de6d6951b305ec2c32e58a069624aee22e1086065579a. A mesma auditoria registra
-- current_status_evidence "Deferido" (divulgacand_current).
--
-- A situacao publicada da vice sai de fonte_detalhe->'vice'->>'descricao_situacao'
-- (scripts/audit/data-freshness-snapshot.sql), lida em 17/09 com
-- "Pendente de julgamento". So o subobjeto `vice` e refrescado: titular,
-- fonte_sha256, snapshot_em e tse_situacao_codigo sao do titular e ja dizem
-- Deferido, entao nao mudam. Mesmo padrao de 20260917000001 (PRTB).
--
-- NAO aplicar por `supabase db push` nem por automacao: producao so recebe
-- esta migration pelo workflow de aplicacao autorizado.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  vice_sha text := '7511e9c8be401f12314de6d6951b305ec2c32e58a069624aee22e1086065579a';
  vice_checked_at timestamptz := timestamptz '2026-09-21T21:42:20.909Z';
  antes jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chapas_2026) THEN
    RAISE NOTICE 'issue-400-vice-to: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'issue-400-vice-to: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375'
         AND fonte_tipo = 'divulgacand_detalhe'
         AND vice_sq_candidato = '270002554376'
         AND fonte_detalhe->'vice'->>'sq_candidato' = '270002554376'
         AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Pendente de julgamento'
         AND fonte_detalhe->'vice'->>'sha256' = 'db00d9d04ab344e7906d89cf2c3e7b789388dd9293c8bf7d3e26bde2d80eadb5') <> 1
  THEN
    RAISE EXCEPTION 'issue-400-vice-to: preimagem divergiu';
  END IF;

  SELECT to_jsonb(c) INTO antes FROM public.chapas_2026 c WHERE c.chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375';

  -- @write tabela=chapas_2026 ref=issue-400-vice-to chave=2026:TO:jose-wilson-siqueira-campos-junior:270002554375 campos=fonte_detalhe
  UPDATE public.chapas_2026
  SET fonte_detalhe = jsonb_set(
        fonte_detalhe,
        '{vice}',
        (fonte_detalhe->'vice') || jsonb_build_object(
          'descricao_situacao', 'Deferido',
          'is_candidato_inapto', false,
          'sha256', vice_sha,
          'checked_at', to_char(vice_checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      )
  WHERE chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375'
    AND fonte_tipo = 'divulgacand_detalhe'
    AND to_jsonb(chapas_2026) = antes;
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN RAISE EXCEPTION 'issue-400-vice-to: escrita esperada=1 atual=%', quantidade; END IF;

  -- @write tabela=coleta_log ref=migration:20260921220000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global','chapas_2026.fonte_detalhe.vice','encontrado',1,
         jsonb_build_object(
           'resumo','Issue #400: vice CAPITAO OSMAR (TO, SQ 270002554376) refrescado de "Pendente de julgamento" para Deferido pelo detalhe do DivulgaCandContas lido em 2026-09-21T21:42:20.909Z (sha256 7511e9c8be401f12314de6d6951b305ec2c32e58a069624aee22e1086065579a).',
           'before', antes,
           'after', (SELECT to_jsonb(c) FROM public.chapas_2026 c WHERE c.chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375')
         )::text,
         'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/TO/20322002026/candidato/270002554376','migration:20260921220000','escrita'
  WHERE NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260921220000');

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375'
         AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Deferido'
         AND fonte_detalhe->'vice'->>'sha256' = vice_sha
         AND fonte_detalhe->'titular' = antes->'fonte_detalhe'->'titular'
         AND fonte_sha256 = antes->>'fonte_sha256'
         AND tse_situacao_codigo = antes->>'tse_situacao_codigo') <> 1
  THEN
    RAISE EXCEPTION 'issue-400-vice-to: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
