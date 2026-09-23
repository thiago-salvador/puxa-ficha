-- Issue #433: a auditoria de dados (run 35748910912, gerada em
-- 2026-09-22T15:40:45Z) ficou em review_required por uma divergencia so:
-- dimas-cassimiro (MA, Governador, PCO, SQ 100002552700) segue publicado como
-- "indeferido com recurso" e o TSE ja o da como Deferido.
--
-- Fonte: DivulgaCandContas, detalhe da candidatura, em
-- https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MA/20322002026/candidato/100002552700
-- lido ao vivo em 2026-09-22T22:15:47.064Z (o endpoint bloqueia cliente sem
-- navegador via Akamai, mesma classe de bloqueio da issue #400; a leitura foi
-- feita por navegador real). O detalhe diz:
--
--   descricaoSituacao            "Deferido"
--   isCandidatoInapto             false
--   descricaoSituacaoCandidato   "Consta da urna"
--   dataUltimaAtualizacao        "2026-09-22 09:07"
--   st_SUBSTITUIDO                false
--   substituto                    null
--
-- SHA-256 do corpo (6624 bytes):
-- 187a4495d54ea8b59403f062458999ff85758d238b11dc1ea8576b2425439507
--
-- Ao contrario das issues #400 (policial-edjane) e #383 (gustavo-henrique),
-- a candidatura NAO esta terminal: Deferido e apto, "Concorrendo" na
-- totalizacao e "Consta da urna" na situacao do candidato concordam. A ficha
-- fica no ar: so `situacao_candidatura` e `ultima_atualizacao` mudam;
-- `status` ('candidato') e `publicavel` (true) ficam intactos porque nao ha
-- nada de terminal ou de substituicao para reconciliar.
--
-- Mesmo esqueleto da issue #400 (20260921200000): preimagem conferida sob
-- lock, snapshot em identidade_timeline_quarentena_snapshot antes da escrita,
-- recibo em coleta_log com before/after, rollback preservador e readbacks
-- versionados.
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
  fonte text := 'https://divulgacandcontas.tse.jus.br/ (detalhe SQ 100002552700)';
  verificado_em timestamptz := timestamptz '2026-09-22T22:15:47.064Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'issue-433: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'issue-433: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.slug = 'dimas-cassimiro'
         AND c.sq_candidato_2026 = '100002552700'
         AND c.situacao_candidatura = 'indeferido com recurso'
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE) <> 1
  THEN
    RAISE EXCEPTION 'issue-433: preimagem de dimas-cassimiro divergiu';
  END IF;

  -- Snapshot ANTES da escrita, no mesmo padrao de 20260921200000.
  -- @write tabela=identidade_timeline_quarentena_snapshot ref=issue-433-dimas-cassimiro-deferido campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'issue-433-dimas-cassimiro-deferido','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'situacao_candidatura','deferido',
           'ultima_atualizacao', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         ),
         verificado_em
  FROM public.candidatos c
  WHERE c.slug = 'dimas-cassimiro'
    AND c.sq_candidato_2026 = '100002552700'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=dimas-cassimiro campos=situacao_candidatura,ultima_atualizacao
  UPDATE public.candidatos c
  SET situacao_candidatura = s.postimage->>'situacao_candidatura',
      ultima_atualizacao = (s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'issue-433-dimas-cassimiro-deferido'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug = 'dimas-cassimiro'
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'issue-433: escrita esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260922150000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global',
         'candidatos.situacao_candidatura,candidatos.ultima_atualizacao',
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Issue #433: candidatura SQ 100002552700 (dimas-cassimiro, MA, Governador) Deferida no detalhe do DivulgaCandContas lido ao vivo em 2026-09-22T22:15:47.064Z (sha256 187a4495d54ea8b59403f062458999ff85758d238b11dc1ea8576b2425439507); ficha reconciliada para situacao_candidatura=deferido, permanece publicada (status=candidato, publicavel=true).',
           'before', s.preimage,
           'after', (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.id = s.row_id)
         )::text,
         fonte,'migration:20260922150000','escrita'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'issue-433-dimas-cassimiro-deferido'
    AND NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260922150000');

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'dimas-cassimiro'
      AND sq_candidato_2026 = '100002552700'
      AND situacao_candidatura = 'deferido'
      AND status = 'candidato'
      AND publicavel IS TRUE
  ) THEN
    RAISE EXCEPTION 'issue-433: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
