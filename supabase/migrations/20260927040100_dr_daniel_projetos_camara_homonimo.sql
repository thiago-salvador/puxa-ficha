-- A ficha dr-daniel (Daniel Barbosa Santos, PA; inscrição 2026 SQ
-- 140002549930) nunca teve mandato na Câmara dos Deputados, mas publicava 100
-- proposições de 2023 a 2025 do deputado federal 220614, DANIEL RICARDO SORANZ
-- PINTO ("Dr. Daniel Soranz", RJ). A ficha chegou a ser ligada a esse id pelo
-- nome de urna; o id já saiu do seed, as linhas ficaram.
--
-- Prova (Câmara Dados Abertos, lida em 2026-09-26):
--   /api/v2/deputados/220614: nome civil DANIEL RICARDO SORANZ PINTO, nascido em
--     Vassouras/RJ em 16/02/1979. O TSE registra Daniel Barbosa Santos nascido
--     em Açailândia/MA em 25/08/1986.
--   /api/v2/proposicoes?idDeputadoAutor=220614: 235 proposições; os 100
--     proposicao_id_api da ficha estão todos nessa lista (100/100).
-- Outras famílias da Câmara na ficha: votos_candidato 0 linhas; nenhuma
-- proposição em destaque; gastos_parlamentares 2023, 2024 e 2025 já
-- despublicados; historico_politico sem mandato federal.
--
-- Escrita:
--   projetos_lei: despublicado_em + despublicacao_motivo nas 100 linhas (nenhuma
--     é apagada). CAS: exatamente 100 linhas da ficha, todas fonte 'Camara',
--     publicadas, sem destaque, e o conjunto de proposicao_id_api tem md5
--     085c70d5d104d0a4837aa39084ab1d1b (ids ordenados, separados por vírgula).
--   candidatos.verificacao_campos de dr-daniel: as chaves 'projetos-de-lei' e
--     'votacoes-chave' deixam de afirmar achado da Câmara e passam a
--     nao_aplicavel, como nas fichas sem mandato federal. CAS pelo valor exato.
-- Snapshot integral em identidade_timeline_quarentena_snapshot; recibo em
-- coleta_log.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-projetos-lei-despublicacao-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.projetos_lei IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  ficha constant uuid := 'dcc4a93e-4114-43e9-b067-4581ed12cfd5';
  verificado_em timestamptz := timestamptz '2026-09-27T01:00:00Z';
  motivo constant text := 'homonimo-camara-220614: proposicao do deputado federal 220614 (Daniel Ricardo Soranz Pinto, RJ); a ficha e de Daniel Barbosa Santos (PA), sem mandato na Camara.';
  pl_antes constant jsonb := '{"fonte": "camara", "estado": "encontrado", "verificado_em": "2026-04-05"}';
  vc_antes constant jsonb := '{"fonte": "camara", "estado": "encontrado", "verificado_em": "2026-04-05"}';
  pl_depois constant jsonb := '{"fonte": "camara", "estado": "nao_aplicavel", "motivo": "sem mandato na Camara dos Deputados; as proposicoes antes exibidas eram do deputado homonimo 220614 e foram despublicadas", "verificado_em": "2026-09-26"}';
  vc_depois constant jsonb := '{"fonte": "camara", "estado": "nao_aplicavel", "motivo": "sem mandato na Camara dos Deputados; nenhum voto nominal na ficha", "verificado_em": "2026-09-26"}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projetos_lei WHERE candidato_id = ficha) THEN
    RAISE NOTICE 'dr-daniel-camara-20260927: linhas ausentes; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'dr-daniel-camara-20260927: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.id = ficha
         AND c.slug = 'dr-daniel'
         AND c.nome_completo = 'Daniel Barbosa Santos'
         AND c.estado = 'PA'
         AND c.sq_candidato_2026 = '140002549930'
         AND c.verificacao_campos->'projetos-de-lei' = pl_antes
         AND c.verificacao_campos->'votacoes-chave' = vc_antes) <> 1
  THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927: ficha ou verificacao_campos divergiu';
  END IF;

  IF (SELECT count(*) FROM public.projetos_lei p WHERE p.candidato_id = ficha) <> 100
     OR (SELECT count(*) FROM public.projetos_lei p
          WHERE p.candidato_id = ficha
            AND p.fonte = 'Camara'
            AND p.despublicado_em IS NULL
            AND p.despublicacao_motivo IS NULL
            AND p.destaque IS NOT TRUE) <> 100
     OR (SELECT md5(string_agg(p.proposicao_id_api, ',' ORDER BY p.proposicao_id_api COLLATE "C"))
          FROM public.projetos_lei p WHERE p.candidato_id = ficha) IS DISTINCT FROM '085c70d5d104d0a4837aa39084ab1d1b'
     OR EXISTS (SELECT 1 FROM public.votos_candidato v WHERE v.candidato_id = ficha)
  THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927: preimagem das 100 proposicoes divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=dr-daniel-camara-20260927 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'dr-daniel-camara-20260927','projetos_lei',p.id,p.candidato_id,to_jsonb(p),
         to_jsonb(p) || jsonb_build_object(
           'despublicado_em', verificado_em,
           'despublicacao_motivo', motivo),
         verificado_em
  FROM public.projetos_lei p
  WHERE p.candidato_id = ficha
  UNION ALL
  SELECT 'dr-daniel-camara-20260927','candidatos',c.id,c.id,to_jsonb(c),
         jsonb_set(jsonb_set(to_jsonb(c), '{verificacao_campos,projetos-de-lei}', pl_depois),
                   '{verificacao_campos,votacoes-chave}', vc_depois),
         verificado_em
  FROM public.candidatos c
  WHERE c.id = ficha
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=projetos_lei slug=dr-daniel campos=despublicado_em,despublicacao_motivo
  UPDATE public.projetos_lei p
  SET despublicado_em = (s.postimage->>'despublicado_em')::timestamptz,
      despublicacao_motivo = s.postimage->>'despublicacao_motivo'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'dr-daniel-camara-20260927'
    AND s.tabela = 'projetos_lei'
    AND s.row_id = p.id
    AND p.candidato_id = ficha
    AND EXISTS (SELECT 1 FROM public.candidatos c WHERE c.id = p.candidato_id AND c.slug = 'dr-daniel')
    AND to_jsonb(p) = s.preimage;
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 100 THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927: escrita em projetos_lei esperada=100 atual=%', quantidade;
  END IF;

  -- @write tabela=candidatos slug=dr-daniel campos=verificacao_campos
  UPDATE public.candidatos c
  SET verificacao_campos = s.postimage->'verificacao_campos'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'dr-daniel-camara-20260927'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug = 'dr-daniel'
    AND to_jsonb(c) = s.preimage;
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927: escrita em candidatos esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260927040100 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'camara-identidade-homonima','global',
         'projetos_lei.despublicado_em,projetos_lei.despublicacao_motivo,candidatos.verificacao_campos',
         'encontrado', 101,
         jsonb_build_object(
           'resumo','dr-daniel: 100 proposicoes do deputado federal 220614 (Daniel Ricardo Soranz Pinto, RJ) despublicadas; verificacao_campos projetos-de-lei e votacoes-chave passam a nao_aplicavel. A ficha e de Daniel Barbosa Santos (PA), sem mandato na Camara.',
           'proposicao_id_api_md5', '085c70d5d104d0a4837aa39084ab1d1b',
           'projetos', (SELECT jsonb_agg(jsonb_build_object('id', s.row_id, 'proposicao_id_api', s.preimage->>'proposicao_id_api') ORDER BY s.preimage->>'proposicao_id_api')
                        FROM public.identidade_timeline_quarentena_snapshot s
                        WHERE s.migration_version = 'dr-daniel-camara-20260927' AND s.tabela = 'projetos_lei'),
           'verificacao_campos', jsonb_build_object(
             'before', jsonb_build_object('projetos-de-lei', pl_antes, 'votacoes-chave', vc_antes),
             'after', jsonb_build_object('projetos-de-lei', pl_depois, 'votacoes-chave', vc_depois))
         )::text,
         'https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=220614',
         'migration:20260927040100','escrita'
  WHERE NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260927040100');

  IF (SELECT count(*) FROM public.projetos_lei p
       WHERE p.candidato_id = ficha AND p.despublicado_em IS NOT NULL AND p.despublicacao_motivo = motivo) <> 100
     OR (SELECT count(*) FROM public.candidatos c
       WHERE c.id = ficha
         AND c.verificacao_campos->'projetos-de-lei' = pl_depois
         AND c.verificacao_campos->'votacoes-chave' = vc_depois) <> 1
  THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
