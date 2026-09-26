-- Situação de candidatura de duas fichas do Senado divergia do TSE.
--
-- Fonte: DivulgaCandContas, lista oficial das candidaturas ao Senado 2026 nas
-- 27 UFs (cargo 5, eleição 20322002026) e detalhe de cada candidatura, lidos
-- por navegador em 2026-09-25T21:58:50Z:
--   https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/PR/20322002026/candidato/160002547963
--   https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/RJ/20322002026/candidato/190002554290
--
--   alexandre-curi (PR, REPUBLICANOS, 100, SQ 160002547963)
--     descricaoSituacao "Deferido", isCandidatoInapto false,
--     descricaoTotalizacao "Concorrendo", dataUltimaAtualizacao "2026-09-18 14:39"
--   tse-2026-190002554290, COMANDANTE RIBEIRO AFONSO (RJ, DEMOCRATA, 350, SQ 190002554290)
--     descricaoSituacao "Indeferido", isCandidatoInapto true, st_SUBSTITUIDO false,
--     descricaoTotalizacao "Concorrendo", dataUltimaAtualizacao "2026-09-18 14:39"
--
-- O arquivo oficial consulta_cand_complementar_2026 gerado pelo TSE em
-- 2026-09-24 12:30:29 (SHA-256 86b28861...0610, o mesmo citado pela migration
-- 20260924205031) já trazia DS_SITUACAO_JULGAMENTO DEFERIDO e INDEFERIDO para
-- esses dois SQ. As duas fichas seguiam publicadas como "aguardando julgamento".
--
-- Na mesma leitura, as outras 307 fichas publicadas ao Senado conferem com a
-- lista oficial (272 deferido, 25 indeferido com recurso, 7 deferido com
-- recurso, 3 pendente de julgamento; mesmo conjunto de SQ, conferido por
-- contagem e soma).
--
-- Duas escritas diferentes:
--   1. alexandre-curi: só situacao_candidatura -> 'deferido' e
--      ultima_atualizacao; a ficha continua no ar.
--   2. tse-2026-190002554290: candidatura terminal (Indeferido e inapto), mesma
--      convenção de policial-edjane (20260921200000) e gustavo-henrique
--      (20260918120100): situacao_candidatura='indeferido', status='removido',
--      publicavel=false. A ficha não é apagada e o rollback versionado a devolve.
--
-- Snapshot de preimagem em identidade_timeline_quarentena_snapshot e recibo em
-- coleta_log com before/after de cada linha. Fail-closed: aceita somente a
-- preimagem medida em 2026-09-25.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-dados-no-ar-senado-claims-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  fonte text := 'https://divulgacandcontas.tse.jus.br/ (lista Senado 2026 e detalhe dos SQ 160002547963 e 190002554290)';
  verificado_em timestamptz := timestamptz '2026-09-25T21:58:50Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'senado-situacao-20260925: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'senado-situacao-20260925: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE ((c.slug = 'alexandre-curi' AND c.sq_candidato_2026 = '160002547963')
           OR (c.slug = 'tse-2026-190002554290' AND c.sq_candidato_2026 = '190002554290'))
         AND c.cargo_disputado = 'Senador'
         AND c.situacao_candidatura = 'aguardando julgamento'
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE) <> 2
  THEN
    RAISE EXCEPTION 'senado-situacao-20260925: preimagem das duas fichas divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=senado-situacao-20260925 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'senado-situacao-20260925','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || CASE c.slug
           WHEN 'alexandre-curi' THEN jsonb_build_object(
             'situacao_candidatura','deferido',
             'ultima_atualizacao', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
           ELSE jsonb_build_object(
             'situacao_candidatura','indeferido',
             'status','removido',
             'publicavel', false,
             'ultima_atualizacao', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
         END,
         verificado_em
  FROM public.candidatos c
  WHERE (c.slug = 'alexandre-curi' AND c.sq_candidato_2026 = '160002547963')
     OR (c.slug = 'tse-2026-190002554290' AND c.sq_candidato_2026 = '190002554290')
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=alexandre-curi campos=situacao_candidatura,status,publicavel,ultima_atualizacao
  -- @write tabela=candidatos slug=tse-2026-190002554290 campos=situacao_candidatura,status,publicavel,ultima_atualizacao
  UPDATE public.candidatos c
  SET situacao_candidatura = s.postimage->>'situacao_candidatura',
      status = s.postimage->>'status',
      publicavel = (s.postimage->>'publicavel')::boolean,
      ultima_atualizacao = (s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'senado-situacao-20260925'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug IN ('alexandre-curi','tse-2026-190002554290')
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 2 THEN
    RAISE EXCEPTION 'senado-situacao-20260925: escrita esperada=2 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260925220000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global',
         'candidatos.situacao_candidatura,candidatos.status,candidatos.publicavel',
         'encontrado', 2,
         jsonb_build_object(
           'resumo','Situacao de duas candidaturas ao Senado reconciliada com o DivulgaCandContas lido em 2026-09-25T21:58:50Z: alexandre-curi (SQ 160002547963) Deferido; tse-2026-190002554290 (SQ 190002554290) Indeferido e inapto, retirada do ar (publicavel=false, status=removido) na convencao de 20260921200000.',
           'linhas', jsonb_agg(jsonb_build_object(
             'slug', c.slug,
             'before', s.preimage,
             'after', to_jsonb(c)) ORDER BY c.slug)
         )::text,
         fonte,'migration:20260925220000','escrita'
  FROM public.identidade_timeline_quarentena_snapshot s
  JOIN public.candidatos c ON c.id = s.row_id
  WHERE s.migration_version = 'senado-situacao-20260925'
    AND s.tabela = 'candidatos'
  HAVING NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260925220000');

  IF (SELECT count(*) FROM public.candidatos
       WHERE (slug = 'alexandre-curi' AND situacao_candidatura = 'deferido'
              AND status = 'candidato' AND publicavel IS TRUE)
          OR (slug = 'tse-2026-190002554290' AND situacao_candidatura = 'indeferido'
              AND status = 'removido' AND publicavel IS FALSE)) <> 2
  THEN
    RAISE EXCEPTION 'senado-situacao-20260925: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
