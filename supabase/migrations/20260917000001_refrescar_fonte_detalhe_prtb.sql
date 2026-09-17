-- Sucede 20260917000000 (alarga chapas_2026_fonte_detalhe_check para
-- 'Pendente de julgamento'). Issue #340 follow-up, redesenho pós-incidente
-- de 20260916150000_refrescar_fonte_detalhe_prtb.sql (mergeado em #357,
-- JAMAIS aplicado — ver o arquivo anterior para a causa raiz completa).
-- Curadoria pura (UPDATE de chapas_2026), separada do alargamento do
-- domínio por exigência do gate do repositório (migration nova não pode
-- misturar DDL persistente com dado de ficha).
--
-- Atualiza a chapa presidencial do PRTB: os dois descricao_situacao
-- (titular/vice), os dois sha256/checked_at, fonte_sha256/snapshot_em
-- top-level, E tse_situacao_codigo — as duas cláusulas que
-- 20260916150000 violava (domínio estreito + tse_situacao_codigo
-- dessincronizado) fecham juntas nesta migration, já sobre o domínio
-- alargado por 20260917000000.
--
-- Fonte, reconferida ao vivo em 17/09/2026 (mesmos dados usados pela
-- 20260916150000 nunca aplicada):
--   titular 280002554479: https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554479
--     descricaoSituacao "Pendente de julgamento", sha256 111536f4...80c, checked_at 2026-09-17T02:08:13.408Z
--   vice 280002554490: https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554490
--     descricaoSituacao "Pendente de julgamento", sha256 a8e4d571...0f2, checked_at 2026-09-17T02:10:23.346Z
--
-- NAO aplicar por `supabase db push` nem por automacao: producao so recebe
-- esta migration pelo workflow apply-fonte-detalhe-prtb-production.yml,
-- CAS previous_version=20260917000000.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  titular_sha text := '111536f42f57322e3948aa6db34a7d13236148fa3cde77e042574027835a080c';
  titular_checked_at timestamptz := timestamptz '2026-09-17T02:08:13.408Z';
  vice_sha text := 'a8e4d5713cf8f2fe7ab354b48c52777b807c83437187aeed61ff28d8261e80f2';
  vice_checked_at timestamptz := timestamptz '2026-09-17T02:10:23.346Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chapas_2026) THEN
    RAISE NOTICE 'fonte-detalhe-prtb: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
         AND fonte_tipo = 'divulgacand_detalhe'
         AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Aguardando julgamento'
         AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Aguardando julgamento'
         AND tse_situacao_codigo = 'Aguardando julgamento'
         AND fonte_sha256 = '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad') <> 1
  THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb: preimagem divergiu';
  END IF;

  -- @write tabela=chapas_2026 ref=fonte-detalhe-prtb-17092026 chave=2026:BR:pablo-henrique-costa-marcal campos=fonte_detalhe,fonte_sha256,snapshot_em,tse_situacao_codigo
  UPDATE public.chapas_2026
  SET
    fonte_detalhe = jsonb_set(
      jsonb_set(
        fonte_detalhe,
        '{titular}',
        (fonte_detalhe->'titular') || jsonb_build_object(
          'descricao_situacao', 'Pendente de julgamento',
          'sha256', titular_sha,
          'checked_at', to_char(titular_checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      ),
      '{vice}',
      (fonte_detalhe->'vice') || jsonb_build_object(
        'descricao_situacao', 'Pendente de julgamento',
        'sha256', vice_sha,
        'checked_at', to_char(vice_checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    ),
    fonte_sha256 = titular_sha,
    snapshot_em = titular_checked_at,
    tse_situacao_codigo = 'Pendente de julgamento'
  WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
    AND fonte_tipo = 'divulgacand_detalhe';
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN RAISE EXCEPTION 'fonte-detalhe-prtb: escrita esperada=1 atual=%', quantidade; END IF;

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
         AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Pendente de julgamento'
         AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Pendente de julgamento'
         AND tse_situacao_codigo = 'Pendente de julgamento'
         AND fonte_sha256 = titular_sha
         AND snapshot_em = titular_checked_at) <> 1
  THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb: pos-condicao falhou';
  END IF;

  -- @write tabela=coleta_log ref=migration:20260917000001 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  VALUES (
    'tse', 'global', 'chapas_2026.fonte_detalhe:prtb', 'encontrado', 1,
    'Issue #340 (redesenho pós-incidente 35179453431): chapa presidencial do PRTB refrescada (titular e vice) e tse_situacao_codigo sincronizado, sobre o domínio já alargado por 20260917000000.',
    'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554479',
    'migration:20260917000001', 'escrita'
  );
END
$apply$;

COMMIT;
