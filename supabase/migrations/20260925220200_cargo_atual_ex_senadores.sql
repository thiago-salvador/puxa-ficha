-- Nove fichas publicadas mostravam cargo_atual = 'Senador(a)' para quem não
-- exerce mandato no Senado.
--
-- Causa: scripts/lib/ingest-senado.ts gravava 'Senador(a)' sempre que o
-- detalhe do parlamentar trazia CodigoPublicoNaLegAtual. O Senado preenche esse
-- código também para ex-senadores e suplentes que já exerceram (os nove abaixo
-- têm o campo), então o ingest marcava como senador atual quem saiu do cargo
-- anos antes. O mesmo PR troca o critério pela lista oficial de senadores em
-- exercício.
--
-- Fontes, lidas em 2026-09-25:
--   - Senado, lista de parlamentares em exercício (81 nomes):
--     https://legis.senado.leg.br/dadosabertos/senador/lista/atual
--     Nenhum dos nove códigos abaixo está nela.
--   - Senado, mandatos de cada parlamentar
--     (https://legis.senado.leg.br/dadosabertos/senador/{codigo}/mandatos):
--     último exercício de cada um.
--   - Câmara, deputados da legislatura 57
--     (https://dadosabertos.camara.leg.br/api/v2/deputados/{id}).
--
--   slug                   Senado  último exercício no Senado            cargo atual e fonte
--   jorginho-mello         5350    renúncia em 2022-12-29                Governador de Santa Catarina (TSE 2022: eleito, SQ 240001611127)
--   mailza-assis           5557    1ª suplente, até 2023-01-01           Governadora do Acre (g1, 2026-04-02: assume com a saída de Gladson Camelí)
--   tse-2026-100002549583  3359    renúncia em 2009-04-17 (Roseana)      Deputado(a) Federal (Câmara 73806, titular, em licença desde 2026-08-31)
--   tse-2026-10002544274   5902    1º suplente, até 2022-10-14 (Velloso) Deputado(a) Federal (Câmara 220589, em exercício)
--   tse-2026-110002551967  6304    1ª suplente, até 2026-03-31 (Buzetti) sem cargo atual registrado (NULL)
--   tse-2026-160002547656  5006    término do mandato em 2019-01-31      Deputado(a) Federal (Câmara 107283, em exercício)
--   tse-2026-190002548141  7       renúncia em 1998-12-31 (Benedita)     Deputado(a) Federal (Câmara 73701, em exercício)
--   tse-2026-190002550184  3366    renúncia em 2016-12-31 (Crivella)     Deputado(a) Federal (Câmara 220599, em exercício)
--   tse-2026-220002541490  4981    término do mandato em 2023-01-31      sem cargo atual registrado (NULL)
--
-- Os outros 43 perfis publicados com 'Senador(a)' estão na lista oficial em
-- exercício e não mudam.
--
-- Preimagem aceita por linha: 'Senador(a)' (medida em 2026-09-25), o valor
-- final (reaplicação) ou NULL (o ingest corrigido limpa 'Senador(a)' de quem
-- está fora da lista em exercício). Só linhas diferentes do valor final são
-- escritas; snapshot de cada linha escrita e recibo em coleta_log com
-- before/after.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-dados-no-ar-senado-claims-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_cargo_atual_20260925 (
  slug text PRIMARY KEY,
  sq text NOT NULL,
  cargo_depois text,
  fonte text NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_cargo_atual_20260925 (slug, sq, cargo_depois, fonte) VALUES
  ('jorginho-mello', '240002537073', 'Governador de Santa Catarina', 'Senado 5350: renuncia 2022-12-29; TSE 2022 SQ 240001611127 eleito governador SC'),
  ('mailza-assis', '10002544107', 'Governadora do Acre', 'Senado 5557: exercicio de suplente ate 2023-01-01; g1 2026-04-02 https://g1.globo.com/ac/acre/eleicoes/2026/noticia/2026/04/02/gladson-cameli-deixa-o-cargo-de-governador-do-acre-para-concorrer-ao-senado.ghtml'),
  ('tse-2026-100002549583', '100002549583', 'Deputado(a) Federal', 'Senado 3359: renuncia 2009-04-17; Camara 73806 titular, licenca desde 2026-08-31'),
  ('tse-2026-10002544274', '10002544274', 'Deputado(a) Federal', 'Senado 5902: exercicio de suplente ate 2022-10-14; Camara 220589 em exercicio'),
  ('tse-2026-110002551967', '110002551967', NULL, 'Senado 6304: exercicio de suplente ate 2026-03-31, retorno do titular; fora da lista em exercicio'),
  ('tse-2026-160002547656', '160002547656', 'Deputado(a) Federal', 'Senado 5006: termino do mandato 2019-01-31; Camara 107283 em exercicio'),
  ('tse-2026-190002548141', '190002548141', 'Deputado(a) Federal', 'Senado 7: renuncia 1998-12-31; Camara 73701 em exercicio'),
  ('tse-2026-190002550184', '190002550184', 'Deputado(a) Federal', 'Senado 3366: renuncia 2016-12-31; Camara 220599 em exercicio'),
  ('tse-2026-220002541490', '220002541490', NULL, 'Senado 4981: termino do mandato 2023-01-31; fora da lista em exercicio');

DO $apply$
DECLARE
  quantidade integer;
  pendentes integer;
  verificado_em timestamptz := timestamptz '2026-09-25T22:30:00Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'cargo-atual-20260925: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'cargo-atual-20260925: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       JOIN _pf_cargo_atual_20260925 u ON u.slug = c.slug AND u.sq = c.sq_candidato_2026
       WHERE c.cargo_atual = 'Senador(a)'
          OR c.cargo_atual IS NULL
          OR c.cargo_atual IS NOT DISTINCT FROM u.cargo_depois) <> 9
  THEN
    RAISE EXCEPTION 'cargo-atual-20260925: preimagem das nove fichas divergiu';
  END IF;

  SELECT count(*) INTO pendentes
  FROM public.candidatos c
  JOIN _pf_cargo_atual_20260925 u ON u.slug = c.slug
  WHERE c.cargo_atual IS DISTINCT FROM u.cargo_depois;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=cargo-atual-20260925 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'cargo-atual-20260925','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'cargo_atual', u.cargo_depois,
           'ultima_atualizacao', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
         verificado_em
  FROM public.candidatos c
  JOIN _pf_cargo_atual_20260925 u ON u.slug = c.slug
  WHERE c.cargo_atual IS DISTINCT FROM u.cargo_depois
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=jorginho-mello campos=cargo_atual,ultima_atualizacao
  -- @write tabela=candidatos slug=mailza-assis campos=cargo_atual,ultima_atualizacao
  -- @write tabela=candidatos slug=tse-2026-100002549583 campos=cargo_atual,ultima_atualizacao
  -- @write tabela=candidatos slug=tse-2026-10002544274 campos=cargo_atual,ultima_atualizacao
  -- @write tabela=candidatos slug=tse-2026-110002551967 campos=cargo_atual,ultima_atualizacao
  -- @write tabela=candidatos slug=tse-2026-160002547656 campos=cargo_atual,ultima_atualizacao
  -- @write tabela=candidatos slug=tse-2026-190002548141 campos=cargo_atual,ultima_atualizacao
  -- @write tabela=candidatos slug=tse-2026-190002550184 campos=cargo_atual,ultima_atualizacao
  -- @write tabela=candidatos slug=tse-2026-220002541490 campos=cargo_atual,ultima_atualizacao
  UPDATE public.candidatos c
  SET cargo_atual = s.postimage->>'cargo_atual',
      ultima_atualizacao = (s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'cargo-atual-20260925'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug IN ('jorginho-mello','mailza-assis','tse-2026-100002549583',
                   'tse-2026-10002544274','tse-2026-110002551967','tse-2026-160002547656',
                   'tse-2026-190002548141','tse-2026-190002550184','tse-2026-220002541490')
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> pendentes THEN
    RAISE EXCEPTION 'cargo-atual-20260925: escrita esperada=% atual=%', pendentes, quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260925220200 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'senado','global','candidatos.cargo_atual','encontrado', quantidade,
         jsonb_build_object(
           'resumo','cargo_atual de nove fichas deixou de dizer Senador(a): nenhuma esta na lista oficial de senadores em exercicio de 2026-09-25; cinco sao deputados federais (Camara), dois governam estados e dois ficam sem cargo atual registrado.',
           'linhas', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'slug', c.slug,
                      'fonte', u.fonte,
                      'before', s.preimage,
                      'after', to_jsonb(c)) ORDER BY c.slug)
             FROM public.identidade_timeline_quarentena_snapshot s
             JOIN public.candidatos c ON c.id = s.row_id
             JOIN _pf_cargo_atual_20260925 u ON u.slug = c.slug
             WHERE s.migration_version = 'cargo-atual-20260925'
               AND s.tabela = 'candidatos'), '[]'::jsonb)
         )::text,
         'https://legis.senado.leg.br/dadosabertos/senador/lista/atual',
         'migration:20260925220200','escrita'
  WHERE NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260925220200');

  IF (SELECT count(*) FROM public.candidatos c
       JOIN _pf_cargo_atual_20260925 u ON u.slug = c.slug
       WHERE c.cargo_atual IS NOT DISTINCT FROM u.cargo_depois) <> 9
  THEN
    RAISE EXCEPTION 'cargo-atual-20260925: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
