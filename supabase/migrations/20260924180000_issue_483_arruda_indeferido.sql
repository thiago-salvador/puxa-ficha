-- Issue #483: a auditoria de dados (run 36036234785, gerada em
-- 2026-09-24T17:43Z) ficou em review_required por uma divergencia so:
-- jose-roberto-arruda (DF, Governador, PSD, SQ 70002552586) segue publicado
-- como "indeferido com recurso" e o TSE passou a da-lo como Indeferido, sem a
-- mencao a prazo recursal ou recurso. A mudanca oficial ocorreu entre as
-- auditorias de 2026-09-24T15:53Z (ainda "Indeferido em prazo recursal ou com
-- recurso") e 2026-09-24T17:43Z.
--
-- Fonte: DivulgaCandContas, detalhe da candidatura, em
-- https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/DF/20322002026/candidato/70002552586
-- lido pela coleta da auditoria em 2026-09-24T17:44:09.088Z e de novo, ao
-- vivo por navegador, em 2026-09-24T17:52:22.222Z; as duas leituras tem o
-- mesmo corpo. O detalhe diz:
--
--   descricaoSituacao            "Indeferido"
--   isCandidatoInapto             false
--   descricaoSituacaoCandidato   "Consta da urna"
--   dataUltimaAtualizacao        "2026-09-24 14:12"
--   descricaoTotalizacao         "Concorrendo"
--   st_SUBSTITUIDO                false
--   substituto                    null
--
-- SHA-256 do corpo (8811 bytes):
-- 9ae72fa81d11087e1999d469f15c4defd149b436c3c8977df080ba60c5b60f65
--
-- Indeferimento sem inaptidao nao e terminal: o candidato segue "Consta da
-- urna" e "Concorrendo" na totalizacao, e classifyOfficialCandidacy o trata
-- como ativo. A ficha fica no ar: so `situacao_candidatura` e
-- `ultima_atualizacao` mudam; `status` ('candidato') e `publicavel` (true)
-- ficam intactos. A tela usa o mesmo rotulo e a mesma nota para
-- 'indeferido' e 'indeferido com recurso' ("Indeferimento nao equivale a
-- estar fora da urna"), entao a correcao nao sugere saida da disputa.
--
-- Clone da 20260922150000 (issue #433), que segue o esqueleto da
-- 20260921200000: preimagem conferida sob lock, snapshot em
-- identidade_timeline_quarentena_snapshot antes da escrita, recibo em
-- coleta_log com before/after, rollback preservador e readbacks versionados.
--
-- NAO aplicar por `supabase db push` nem por automacao: producao so recebe
-- esta migration pelo workflow de aplicacao autorizado.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  fonte text := 'https://divulgacandcontas.tse.jus.br/ (detalhe SQ 70002552586)';
  verificado_em timestamptz := timestamptz '2026-09-24T17:52:22.222Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'issue-483: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'issue-483: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.slug = 'jose-roberto-arruda'
         AND c.sq_candidato_2026 = '70002552586'
         AND c.situacao_candidatura = 'indeferido com recurso'
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE) <> 1
  THEN
    RAISE EXCEPTION 'issue-483: preimagem de jose-roberto-arruda divergiu';
  END IF;

  -- Snapshot ANTES da escrita, no mesmo padrao de 20260921200000.
  -- @write tabela=identidade_timeline_quarentena_snapshot ref=issue-483-arruda-indeferido campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'issue-483-arruda-indeferido','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'situacao_candidatura','indeferido',
           'ultima_atualizacao', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         ),
         verificado_em
  FROM public.candidatos c
  WHERE c.slug = 'jose-roberto-arruda'
    AND c.sq_candidato_2026 = '70002552586'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=jose-roberto-arruda campos=situacao_candidatura,ultima_atualizacao
  UPDATE public.candidatos c
  SET situacao_candidatura = s.postimage->>'situacao_candidatura',
      ultima_atualizacao = (s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'issue-483-arruda-indeferido'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug = 'jose-roberto-arruda'
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'issue-483: escrita esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260924180000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global',
         'candidatos.situacao_candidatura,candidatos.ultima_atualizacao',
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Issue #483: candidatura SQ 70002552586 (jose-roberto-arruda, DF, Governador) Indeferida, sem mencao a recurso, no detalhe do DivulgaCandContas lido em 2026-09-24T17:52:22.222Z (sha256 9ae72fa81d11087e1999d469f15c4defd149b436c3c8977df080ba60c5b60f65; isCandidatoInapto false, Concorrendo); ficha reconciliada para situacao_candidatura=indeferido, permanece publicada (status=candidato, publicavel=true).',
           'before', s.preimage,
           'after', (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.id = s.row_id)
         )::text,
         fonte,'migration:20260924180000','escrita'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'issue-483-arruda-indeferido'
    AND NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260924180000');

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'jose-roberto-arruda'
      AND sq_candidato_2026 = '70002552586'
      AND situacao_candidatura = 'indeferido'
      AND status = 'candidato'
      AND publicavel IS TRUE
  ) THEN
    RAISE EXCEPTION 'issue-483: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
