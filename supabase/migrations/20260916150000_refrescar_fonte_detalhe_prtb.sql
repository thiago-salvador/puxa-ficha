-- Atualiza o snapshot congelado de chapas_2026.fonte_detalhe para a chapa
-- presidencial do PRTB: o texto de julgamento ficou preso em "Aguardando
-- julgamento" (capturado em 15/09/2026), enquanto o TSE publica "Pendente de
-- julgamento" (codigo DivulgaCand 12 / consulta_cand_complementar 17,
-- issue #340) desde 15-16/09/2026. `candidatos.situacao_candidatura` de
-- leonardo-avalanche ja foi corrigido em 20260916140000; esta migration so
-- refresca o BLOB `chapas_2026.fonte_detalhe`, que a auditoria de dados le
-- direto (scripts/audit/data-freshness-snapshot.sql) e nao acompanha
-- `candidatos` automaticamente.
--
-- Varredura completa em 16-17/09/2026: das duas linhas de chapas_2026 com
-- fonte_tipo='divulgacand_detalhe' (as unicas que carregam este blob), so a
-- do PRTB diverge. A outra (2026:TO:jose-wilson-siqueira-campos-junior,
-- Siqueira Campos Jr/Capitao Osmar) foi reconferida ao vivo no mesmo dia e
-- continua identica ao snapshot ("Deferido"/"Aguardando julgamento"),
-- portanto fora do escopo.
--
-- Fonte, reconferida ao vivo em 17/09/2026:
--   titular 280002554479: https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554479
--     descricaoSituacao "Pendente de julgamento", sha256 111536f4...80c, checked_at 2026-09-17T02:08:13.408Z
--   vice 280002554490: https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554490
--     descricaoSituacao "Pendente de julgamento", sha256 a8e4d571...0f2, checked_at 2026-09-17T02:10:23.346Z
--
-- NAO aplicar por `supabase db push` nem por automacao: producao so recebe
-- esta migration pelo workflow apply-fonte-detalhe-prtb-production.yml.
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

  -- Pre-imagem exata: as duas descricoes ainda tem que estar presas no texto
  -- antigo, com os SHA-256 que o ingest de 15/09 gravou. Qualquer divergencia
  -- aborta antes de qualquer escrita: outra correcao pode ja ter passado por
  -- aqui.
  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
         AND fonte_tipo = 'divulgacand_detalhe'
         AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Aguardando julgamento'
         AND fonte_detalhe->'titular'->>'sha256' = '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad'
         AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Aguardando julgamento'
         AND fonte_detalhe->'vice'->>'sha256' = 'e2a45d22429fb28baa6d075592de32ceba85f9eccec4c309bf564c6ee8360e02'
         AND fonte_sha256 = '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad') <> 1
  THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb: preimagem divergiu';
  END IF;

  -- @write tabela=chapas_2026 ref=fonte-detalhe-prtb-16092026 chave=2026:BR:pablo-henrique-costa-marcal campos=fonte_detalhe,fonte_sha256,snapshot_em
  UPDATE public.chapas_2026
  SET fonte_detalhe = jsonb_set(
        jsonb_set(
          fonte_detalhe,
          '{titular}',
          fonte_detalhe->'titular' || jsonb_build_object(
            'descricao_situacao', 'Pendente de julgamento',
            'sha256', titular_sha,
            'checked_at', to_char(titular_checked_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          )
        ),
        '{vice}',
        fonte_detalhe->'vice' || jsonb_build_object(
          'descricao_situacao', 'Pendente de julgamento',
          'sha256', vice_sha,
          'checked_at', to_char(vice_checked_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      ),
      fonte_sha256 = titular_sha,
      snapshot_em = titular_checked_at
  WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
    AND fonte_tipo = 'divulgacand_detalhe'
    AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Aguardando julgamento'
    AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Aguardando julgamento';

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb: escrita esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260916150000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'tse-divulgacand-2026', 'territorio', 'chapas_2026:fonte_detalhe:2026:BR:pablo-henrique-costa-marcal',
         'encontrado', 1,
         'Issue #340: fonte_detalhe da chapa presidencial do PRTB (titular Leonardo Avalanche, vice Silvia) refrescado de "Aguardando julgamento" para "Pendente de julgamento", refletindo o julgamento publicado pelo TSE em 15-16/09/2026.',
         'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554479',
         'migration:20260916150000', 'escrita'
  HAVING NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260916150000');

  IF NOT EXISTS (
    SELECT 1 FROM public.chapas_2026
     WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
       AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Pendente de julgamento'
       AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Pendente de julgamento'
       AND fonte_sha256 = titular_sha
  ) THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
