-- Oito linhas publicadas de historico_politico descreviam mandato federal que
-- as fontes oficiais não sustentam.
--
-- Varredura em 2026-09-25 sobre as 264 linhas de mandato de Senador e Deputado
-- Federal publicadas nas 513 fichas públicas, contra:
--   - Senado Dados Abertos, parlamentares por legislatura, 47ª a 57ª
--     (https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/{n}),
--     que inclui suplentes que exerceram;
--   - Câmara Dados Abertos, deputados por legislatura, 47ª a 57ª
--     (https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura={n}),
--     e o histórico de cada deputado (/api/v2/deputados/{id}/historico);
--   - Senado, lista de senadores em exercício, e Câmara, deputados em exercício,
--     para linhas exibidas como mandato em curso.
-- Linhas cujo período declarado cabe nas legislaturas oficiais ficam como
-- estão. Só as oito abaixo mudam.
--
-- Despublicadas (despublicado_em + despublicacao_motivo; a linha não é apagada):
--   joel-rodrigues        b6e88c6c  Senador 2021-(aberto), "suplente". Nenhum
--                         registro no Senado nas legislaturas 47 a 57.
--   ronaldo-caiado        ccc99323  Deputado Federal 1995-1998. A Câmara registra
--                         o deputado 74813 nas legislaturas 49 e 51 a 54, não
--                         na 50ª (1995-1999). As linhas 1991-1995 e 1998-2014
--                         da ficha seguem publicadas.
--   cicero-lucena         ee91942c  Senador 2003-2011. O Senado registra o
--                         mandato nas legislaturas 53 e 54 (2007-2015), já
--                         coberto pelas linhas de proveniência senado e TSE.
--
-- Período corrigido (observação passa a citar a fonte):
--   eduardo-braga         292d7aaf  Deputado Federal 1991-2002 -> 1991-1995
--                         (Câmara, deputado 133917: só a 49ª legislatura).
--   decio-lima            9fb2198a  Deputado Federal 2003-2011 -> 2007-2019
--                         (Câmara, deputado 141413: legislaturas 53 a 55).
--   ricardo-ferraco       530a532b  Deputado Federal 1999-2011 -> 1999-2003
--                         (Câmara, deputado 74674: só a 51ª legislatura).
--   capitao-wagner        e4aa3d93  Deputado Federal 2019-(aberto) -> 2019-2023
--                         (Câmara, deputado 204487: só a 56ª legislatura; fora
--                         da lista de deputados em exercício).
--   jose-roberto-arruda   8ffbdfc0  Deputado Federal 2002-(aberto) -> 2003-2007
--                         (Câmara, deputado 74287: só a 52ª legislatura; ano de
--                         início do mandato, como nas demais linhas). A ficha
--                         exibia "2002 - atual".
--
-- Snapshot de preimagem em identidade_timeline_quarentena_snapshot e recibo em
-- coleta_log com before/after de cada linha. Fail-closed: aceita somente a
-- preimagem medida em 2026-09-25.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-historico-mandatos-federais-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.historico_politico IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_hist_federal_20260925 (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  ini_antes integer,
  fim_antes integer,
  obs_antes text,
  ini_depois integer,
  fim_depois integer,
  obs_depois text,
  despublicar boolean NOT NULL,
  motivo text
) ON COMMIT DROP;

INSERT INTO _pf_hist_federal_20260925
  (id, slug, ini_antes, fim_antes, obs_antes, ini_depois, fim_depois, obs_depois, despublicar, motivo)
VALUES
  ('b6e88c6c-4cd9-4bc3-9dac-09c8959a8d88', 'joel-rodrigues', 2021, NULL,
   'Exercício de mandato como suplente no Senado após 2021 (Senado Federal)',
   2021, NULL, 'Exercício de mandato como suplente no Senado após 2021 (Senado Federal)', true,
   'Sem registro de exercício no Senado: ausente das listas oficiais de parlamentares das legislaturas 47 a 57 (Senado Dados Abertos, 25/09/2026).'),
  ('ccc99323-2c55-4c9d-b7ba-eb13adde9574', 'ronaldo-caiado', 1995, 1998,
   'Trecho do mandato federal após filiação ao PFL, alinhado ao histórico oficial da Câmara e à candidatura TSE de 1994.',
   1995, 1998, 'Trecho do mandato federal após filiação ao PFL, alinhado ao histórico oficial da Câmara e à candidatura TSE de 1994.', true,
   'A Câmara não registra exercício na 50ª legislatura (1995-1999): o histórico oficial do deputado 74813 tem as legislaturas 49 e 51 a 54 (Câmara Dados Abertos, 25/09/2026).'),
  ('ee91942c-35d1-418e-a382-26b2e45cc77e', 'cicero-lucena', 2003, 2011,
   'Mandato federal no Senado (Senado Federal / TSE)',
   2003, 2011, 'Mandato federal no Senado (Senado Federal / TSE)', true,
   'Período 2003-2011 não confere com o Senado: o mandato está registrado nas legislaturas 53 e 54 (2007-2015), já coberto por outras linhas da ficha (Senado Dados Abertos, 25/09/2026).'),
  ('292d7aaf-1a16-4065-8152-6804e8c90d3c', 'eduardo-braga', 1991, 2002, '',
   1991, 1995, 'Deputado federal na 49ª legislatura (1991-1995), conforme histórico da Câmara dos Deputados (deputado 133917).', false, NULL),
  ('9fb2198a-fa50-4c5b-9113-429e25cb65ac', 'decio-lima', 2003, 2011, 'Mandatos federais (curadoria 19.csv)',
   2007, 2019, 'Deputado federal nas 53ª, 54ª e 55ª legislaturas (2007-2019), conforme histórico da Câmara dos Deputados (deputado 141413).', false, NULL),
  ('530a532b-d2e5-4f1f-978f-ff59846372e9', 'ricardo-ferraco', 1999, 2011, 'Mandatos consecutivos na Câmara dos Deputados (TSE)',
   1999, 2003, 'Deputado federal na 51ª legislatura (1999-2003), conforme histórico da Câmara dos Deputados (deputado 74674).', false, NULL),
  ('e4aa3d93-53f4-41e2-bee2-0bb0a6eb4b36', 'capitao-wagner', 2019, NULL, 'Importado automaticamente de Wikidata P39 em 2026-09-15',
   2019, 2023, 'Deputado federal na 56ª legislatura (2019-2023), conforme histórico da Câmara dos Deputados (deputado 204487).', false, NULL),
  ('8ffbdfc0-1c6c-4918-b059-e581693f5053', 'jose-roberto-arruda', 2002, NULL, 'ELEITO (TSE 2002)',
   2003, 2007, 'Deputado federal na 52ª legislatura (2003-2007), conforme histórico da Câmara dos Deputados (deputado 74287).', false, NULL);

DO $apply$
DECLARE
  quantidade integer;
  verificado_em timestamptz := timestamptz '2026-09-25T23:00:00Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.historico_politico h JOIN _pf_hist_federal_20260925 u ON u.id = h.id) THEN
    RAISE NOTICE 'hist-federal-20260925: linhas ausentes; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'hist-federal-20260925: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.historico_politico h
       JOIN _pf_hist_federal_20260925 u ON u.id = h.id
       JOIN public.candidatos c ON c.id = h.candidato_id AND c.slug = u.slug
       WHERE h.despublicado_em IS NULL
         AND h.tipo_evento = 'mandato'
         AND h.periodo_inicio IS NOT DISTINCT FROM u.ini_antes
         AND h.periodo_fim IS NOT DISTINCT FROM u.fim_antes
         AND coalesce(h.observacoes, '') = u.obs_antes) <> 8
  THEN
    RAISE EXCEPTION 'hist-federal-20260925: preimagem das oito linhas divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=hist-federal-20260925 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'hist-federal-20260925','historico_politico',h.id,h.candidato_id,to_jsonb(h),
         to_jsonb(h) || CASE WHEN u.despublicar THEN jsonb_build_object(
             'despublicado_em', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'despublicacao_motivo', u.motivo)
           ELSE jsonb_build_object(
             'periodo_inicio', u.ini_depois,
             'periodo_fim', u.fim_depois,
             'observacoes', u.obs_depois)
         END,
         verificado_em
  FROM public.historico_politico h
  JOIN _pf_hist_federal_20260925 u ON u.id = h.id
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=historico_politico slug=joel-rodrigues campos=despublicado_em,despublicacao_motivo
  -- @write tabela=historico_politico slug=ronaldo-caiado campos=despublicado_em,despublicacao_motivo
  -- @write tabela=historico_politico slug=cicero-lucena campos=despublicado_em,despublicacao_motivo
  -- @write tabela=historico_politico slug=eduardo-braga campos=periodo_inicio,periodo_fim,observacoes
  -- @write tabela=historico_politico slug=decio-lima campos=periodo_inicio,periodo_fim,observacoes
  -- @write tabela=historico_politico slug=ricardo-ferraco campos=periodo_inicio,periodo_fim,observacoes
  -- @write tabela=historico_politico slug=capitao-wagner campos=periodo_inicio,periodo_fim,observacoes
  -- @write tabela=historico_politico slug=jose-roberto-arruda campos=periodo_inicio,periodo_fim,observacoes
  UPDATE public.historico_politico h
  SET despublicado_em = (s.postimage->>'despublicado_em')::timestamptz,
      despublicacao_motivo = s.postimage->>'despublicacao_motivo',
      periodo_inicio = (s.postimage->>'periodo_inicio')::integer,
      periodo_fim = (s.postimage->>'periodo_fim')::integer,
      observacoes = s.postimage->>'observacoes'
  FROM public.identidade_timeline_quarentena_snapshot s, public.candidatos c
  WHERE s.migration_version = 'hist-federal-20260925'
    AND s.tabela = 'historico_politico'
    AND s.row_id = h.id
    AND c.id = h.candidato_id
    AND c.slug IN ('joel-rodrigues','ronaldo-caiado','cicero-lucena','eduardo-braga','decio-lima',
                   'ricardo-ferraco','capitao-wagner','jose-roberto-arruda')
    AND to_jsonb(h) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 8 THEN
    RAISE EXCEPTION 'hist-federal-20260925: escrita esperada=8 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260925230000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'curadoria-historico-federal','global',
         'historico_politico.periodo_inicio,historico_politico.periodo_fim,historico_politico.observacoes,historico_politico.despublicado_em,historico_politico.despublicacao_motivo',
         'encontrado', 8,
         jsonb_build_object(
           'resumo','Oito linhas de mandato federal sem respaldo nas listas oficiais do Senado e da Camara por legislatura (lidas em 2026-09-25): tres despublicadas (joel-rodrigues, ronaldo-caiado 1995-1998, cicero-lucena 2003-2011) e cinco com periodo corrigido pelo historico da Camara (eduardo-braga, decio-lima, ricardo-ferraco, capitao-wagner, jose-roberto-arruda).',
           'linhas', jsonb_agg(jsonb_build_object(
             'id', h.id,
             'slug', u.slug,
             'before', s.preimage,
             'after', to_jsonb(h)) ORDER BY u.slug)
         )::text,
         'https://dadosabertos.camara.leg.br/api/v2/deputados',
         'migration:20260925230000','escrita'
  FROM public.identidade_timeline_quarentena_snapshot s
  JOIN public.historico_politico h ON h.id = s.row_id
  JOIN _pf_hist_federal_20260925 u ON u.id = h.id
  WHERE s.migration_version = 'hist-federal-20260925'
    AND s.tabela = 'historico_politico'
  HAVING NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260925230000');

  IF (SELECT count(*) FROM public.historico_politico h
       JOIN _pf_hist_federal_20260925 u ON u.id = h.id
       WHERE (u.despublicar AND h.despublicado_em IS NOT NULL AND h.despublicacao_motivo = u.motivo)
          OR (NOT u.despublicar AND h.despublicado_em IS NULL
              AND h.periodo_inicio IS NOT DISTINCT FROM u.ini_depois
              AND h.periodo_fim IS NOT DISTINCT FROM u.fim_depois
              AND h.observacoes = u.obs_depois)) <> 8
  THEN
    RAISE EXCEPTION 'hist-federal-20260925: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
