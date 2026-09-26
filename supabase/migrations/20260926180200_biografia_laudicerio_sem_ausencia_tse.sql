-- Biografia pública de laudicerio-aguiar afirmava que o nome dele não consta
-- da base oficial de candidaturas do TSE. Isso é falso: a inscrição
-- 110002554073 está no DivulgaCandContas como "Deferido" e apta (detalhe
-- https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073,
-- relido em 2026-09-26T17:39:58Z, sha256 a8004297...2c4), e o pacote
-- consulta_cand_2026 traz as duas inscrições dele.
--
-- Escrita: só biografia, removendo a última frase. As duas primeiras frases
-- ficam idênticas, byte a byte; nenhum texto novo entra. Guard pelo texto
-- exato da preimagem (350 caracteres, md5 f65653880f02856125497480c7bbcd23).
-- Snapshot de preimagem e recibo em coleta_log com before/after.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-situacao-godeiro-laudicerio-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  verificado_em timestamptz := timestamptz '2026-09-26T17:39:58Z';
  bio_antes text := 'Laudicério Aguiar Machado, conhecido como Sargento Laudicério, é sargento da Polícia Militar, cientista social e político de Mato Grosso, natural de Cuiabá. Em maio de 2026, confirmou candidatura ao governo de Mato Grosso pelo Agir. Encerrado o prazo de registro em 15 de agosto de 2026, o nome dele não consta na base oficial de candidaturas do TSE.';
  bio_depois text := 'Laudicério Aguiar Machado, conhecido como Sargento Laudicério, é sargento da Polícia Militar, cientista social e político de Mato Grosso, natural de Cuiabá. Em maio de 2026, confirmou candidatura ao governo de Mato Grosso pelo Agir.';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'bio-laudicerio-20260926: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'bio-laudicerio-20260926: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF md5(bio_antes) <> 'f65653880f02856125497480c7bbcd23' OR length(bio_antes) <> 350
     OR md5(bio_depois) <> '5aa3e29c19da96a97d8832733ea7a8d8'
     OR left(bio_antes, length(bio_depois) + 1) <> bio_depois || ' ' THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926: literais da migration divergiram';
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.slug = 'laudicerio-aguiar'
         AND c.sq_candidato_2026 = '110002554073'
         AND c.cargo_disputado = 'Governador'
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE
         AND c.biografia = bio_antes) <> 1
  THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926: preimagem da biografia divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=bio-laudicerio-20260926 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'bio-laudicerio-20260926','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object('biografia', bio_depois),
         verificado_em
  FROM public.candidatos c
  WHERE c.slug = 'laudicerio-aguiar' AND c.sq_candidato_2026 = '110002554073'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=laudicerio-aguiar campos=biografia
  UPDATE public.candidatos c
  SET biografia = s.postimage->>'biografia'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'bio-laudicerio-20260926'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug = 'laudicerio-aguiar'
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926: escrita esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260926180200 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global',
         'candidatos.biografia:laudicerio-aguiar',
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Biografia de laudicerio-aguiar sem a frase que dizia que o nome dele nao consta da base oficial de candidaturas do TSE; a inscricao 110002554073 esta Deferido e apta no DivulgaCandContas relido em 2026-09-26T17:39:58Z. Somente remocao, sem texto novo.',
           'linhas', jsonb_agg(jsonb_build_object(
             'slug', c.slug,
             'before', s.preimage,
             'after', to_jsonb(c)))
         )::text,
         'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073',
         'migration:20260926180200','escrita'
  FROM public.candidatos c
  JOIN public.identidade_timeline_quarentena_snapshot s
    ON s.migration_version = 'bio-laudicerio-20260926' AND s.tabela = 'candidatos' AND s.row_id = c.id;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.slug = 'laudicerio-aguiar' AND c.biografia = bio_depois AND c.publicavel IS TRUE) <> 1
  THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
