-- Reconcilia seis fichas e tres chapas de 2026 com o estado oficial do TSE.
-- Issue #340. Fonte: TSE dados abertos, censo de 16/09/2026, DT_GERACAO
-- 16/09/2026 HH_GERACAO 19:31:04 (America/Sao_Paulo, UTC-3 = 2026-09-16T22:31:04Z):
--   consulta_cand_complementar_2026_BRASIL.csv (DS_SITUACAO_JULGAMENTO/
--   CD_SITUACAO_JULGAMENTO, coluna que scripts/lib/tse-situacao-julgamento.ts
--   traduz) para o bloco A e B abaixo;
--   consulta_cand_2026_RN.csv e consulta_cand_2026_SE.csv (identidade, partido,
--   coligacao) para o bloco C.
-- Reconferido ao vivo no DivulgaCandContas no mesmo dia; os dois lados
-- concordam para as nove candidaturas tocadas por esta migration.
--
-- SO APLICA DEPOIS de 20260916130000 (alargamento do vocabulario para
-- 'pendente de julgamento'): sem ela, o UPDATE de ruth-reis e
-- leonardo-avalanche reprova no CHECK.
--
-- NAO aplicar por `supabase db push` nem por automacao: producao so recebe
-- esta migration pelo workflow apply-situacoes-e-chapas-16092026-production.yml.
--
-- =====================================================================
-- BLOCO A. Situacao ja no dominio, so troca de texto (4 fichas)
-- =====================================================================
--
--   ariel-capistrano    BA Governador  'deferido com recurso' -> 'deferido'
--                        (recurso fechado; DS_SITUACAO_JULGAMENTO DEFERIDO cod 2)
--   roberto-rocha       MA Governador  'aguardando julgamento' -> 'indeferido com recurso'
--                        (DS_SITUACAO_JULGAMENTO INDEFERIDO EM PRAZO RECURSAL
--                        OU COM RECURSO cod 4; nao sai do ar, totalizacao Concorrendo)
--   elizeu-aguiar       PI Governador  'deferido' -> 'deferido com recurso'
--                        (DS_SITUACAO_JULGAMENTO DEFERIDO EM PRAZO RECURSAL OU
--                        COM RECURSO cod 16)
--   marcelo-brigadeiro  SC Governador  'aguardando julgamento' -> 'deferido'
--                        (DS_SITUACAO_JULGAMENTO DEFERIDO cod 2)
--
-- =====================================================================
-- BLOCO B. Situacao nova do dominio, codigo 17 (2 fichas)
-- =====================================================================
--
--   ruth-reis            PA Governador   'aguardando julgamento' -> 'pendente de julgamento'
--   leonardo-avalanche   BR Presidente   'aguardando julgamento' -> 'pendente de julgamento'
--
-- Ambos DS_SITUACAO_JULGAMENTO "PENDENTE DE JULGAMENTO", CD_SITUACAO_JULGAMENTO
-- 17. leonardo-avalanche e o titular vigente da chapa presidencial do PRTB
-- (coligacao 280001801455): `chapas_2026.chave =
-- '2026:BR:pablo-henrique-costa-marcal'` ja aponta para ele e para SILVIA como
-- vice (titular_sq_candidato 280002554479, vice_sq_candidato 280002554490,
-- medido em producao em 16/09/2026), entao esta migration nao mexe em
-- chapas_2026 para o PRTB: o unico residuo era a ficha de leonardo-avalanche
-- ainda dizer "aguardando julgamento", que este bloco corrige. Os SQ terminais
-- da chapa antiga (280002553884 Pablo Marcal, indeferido/substituido;
-- 280002553883 Leonardo Avalanche como vice antigo, renuncia/substituido) nao
-- ganham ficha: 280002553884 ja esta em `candidatos` como pablo-marcal,
-- status=removido, publicavel=false (medido); 280002553883 nunca teve ficha e
-- continua sem.
--
-- =====================================================================
-- BLOCO C. Substituicao de chapa (3 coligacoes de RN e SE)
-- =====================================================================
--
--   RN Governador       coligacao 200001801097
--     titular: CARLOS ALBERTO DE ALMEIDA CAVALCANTE / Carlos Jararaca (200002550223, DC)
--       -> GLADYER LINHARES GODEIRO / Godeiro Linharess (200002554482, DC)
--     Ficha carlos-jararaca ja esta publicavel=false (medido; situacao_candidatura
--     ja e 'indeferido' desde ingest anterior). Esta migration fecha o registro
--     formal: status 'candidato' -> 'removido', mesma convencao de
--     gustavo-henrique/jose-moita/subtenente-luiz-carlos. Godeiro NAO ganha
--     ficha propria (decisao do issue): so entra em chapas_2026.
--   RN Vice-Governador  coligacao 200001801344
--     vice: ANDRE GUSTAVO MEDEIROS DE OLIVEIRA (200002553302, PCO)
--       -> MAVIAEL RIBEIRO DA COSTA JUNIOR (200002554523, PCO). Sem ficha dos
--     dois lados (vice_candidato_id ja era NULL); so chapas_2026 muda.
--   SE Vice-Governador  coligacao 260001801269
--     vice: SUELY CHAVES BARRETO (260002551711, CIDADANIA)
--       -> FABRICIO MOREIRA MENEZES / Dr. Fabricio Menezes (260002554525, CIDADANIA).
--     Mesmo padrao: sem ficha dos dois lados, so chapas_2026 muda.
--
-- Todos os tres titulares/vices substitutos estao HOJE em 'pendente de
-- julgamento' no censo complementar (codigo 17), mas esta migration nao
-- escreve julgamento em chapas_2026: as colunas tse_situacao_titular_codigo/
-- tse_situacao_vice_codigo desta tabela carregam CD_SITUACAO_CANDIDATURA de
-- consulta_cand (que vale '-3'/#NE para as tres linhas, antes e depois; o
-- julgamento de codigo 17 fica so no lado `candidatos`, como o resto do
-- catalogo).
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

-- Pre-imagem das tres linhas de chapas_2026 tocadas pelo bloco C, capturada
-- ANTES de qualquer UPDATE. `chapas_2026` nao tem tabela de quarentena como
-- `candidatos`; o recibo em coleta_log (abaixo) e a UNICA fonte de verdade
-- para o rollback, no mesmo padrao de 20260903140000.
CREATE TEMP TABLE issue_340_chapas_preimagem ON COMMIT DROP AS
SELECT jsonb_agg(to_jsonb(ch) ORDER BY ch.chave) AS linhas
FROM public.chapas_2026 ch
WHERE ch.chave IN (
  '2026:RN:carlos-alberto-de-almeida-cavalcante',
  '2026:RN:henrique-othon-costa-de-lyra',
  '2026:SE:emanuel-messias-oliveira-cacho'
);

DO $apply$
DECLARE
  quantidade integer;
  fonte_situacao text := 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip';
  fonte_chapas text := 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip';
  fonte_sha256_chapas text := '444969d5c29e600857c0e5bd21a13f04cd70d5ee126c752703b0d50b6e288771';
  verificado_em timestamptz := timestamptz '2026-09-16T22:31:04Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'issue-340: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'issue-340: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------
  -- Pre-imagem exata das nove linhas tocadas nesta transacao: seis de
  -- `candidatos` (bloco A+B) por identidade (slug+SQ) e situacao atual, tres
  -- de `chapas_2026` (bloco C) por coluna a coluna. Divergir de qualquer uma
  -- aborta antes de qualquer escrita.
  IF (
    SELECT count(*) FROM (VALUES
      ('ariel-capistrano',   '50002535253',  'deferido com recurso'),
      ('roberto-rocha',      '100002551399', 'aguardando julgamento'),
      ('elizeu-aguiar',      '180002549920', 'deferido'),
      ('marcelo-brigadeiro', '240002544118', 'aguardando julgamento'),
      ('ruth-reis',          '140002554434', 'aguardando julgamento'),
      ('leonardo-avalanche', '280002554479', 'aguardando julgamento')
    ) AS esperado(slug, sq, situacao)
    JOIN public.candidatos c ON c.slug = esperado.slug
    WHERE c.sq_candidato_2026 = esperado.sq
      AND c.situacao_candidatura = esperado.situacao
      AND c.status = 'candidato'
      AND c.publicavel IS TRUE
  ) <> 6 THEN
    RAISE EXCEPTION 'issue-340: preimagem de candidatos (bloco A/B) divergiu';
  END IF;

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:RN:carlos-alberto-de-almeida-cavalcante'
         AND titular_sq_candidato = '200002550223'
         AND titular_nome_completo = 'CARLOS ALBERTO DE ALMEIDA CAVALCANTE'
         AND titular_nome_urna = 'CARLOS JARARACA'
         AND titular_partido_sigla = 'DC'
         AND titular_candidato_id = '51e9be3d-bd06-45e5-828d-48160265925f'
         AND vice_sq_candidato = '200002550224') <> 1
  THEN
    RAISE EXCEPTION 'issue-340: preimagem de chapas_2026 RN Governador divergiu';
  END IF;

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:RN:henrique-othon-costa-de-lyra'
         AND vice_sq_candidato = '200002553302'
         AND vice_nome_completo = 'ANDRE GUSTAVO MEDEIROS DE OLIVEIRA'
         AND vice_nome_urna = 'ANDRE GUSTAVO'
         AND vice_partido_sigla = 'PCO'
         AND vice_candidato_id IS NULL) <> 1
  THEN
    RAISE EXCEPTION 'issue-340: preimagem de chapas_2026 RN Vice-Governador divergiu';
  END IF;

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:SE:emanuel-messias-oliveira-cacho'
         AND vice_sq_candidato = '260002551711'
         AND vice_nome_completo = 'SUELY CHAVES BARRETO'
         AND vice_nome_urna = 'SUELY BARRETO'
         AND vice_partido_sigla = 'CIDADANIA'
         AND vice_candidato_id IS NULL) <> 1
  THEN
    RAISE EXCEPTION 'issue-340: preimagem de chapas_2026 SE Vice-Governador divergiu';
  END IF;

  -- O SQ de cada substituto nao pode ja estar em uso em chapas_2026: se
  -- estiver, alguem ja escreveu isso por outro caminho.
  IF (SELECT count(*) FROM public.chapas_2026
       WHERE '200002554482' IN (titular_sq_candidato, vice_sq_candidato)
          OR '200002554523' IN (titular_sq_candidato, vice_sq_candidato)
          OR '260002554525' IN (titular_sq_candidato, vice_sq_candidato)) <> 0
  THEN
    RAISE EXCEPTION 'issue-340: substituto ja publicado em chapas_2026';
  END IF;

  -- -----------------------------------------------------------------
  -- BLOCO A+B: seis fichas de `candidatos`. Snapshot ANTES da escrita.
  -- @write tabela=identidade_timeline_quarentena_snapshot ref=issue-340-situacoes-16092026 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'issue-340-situacoes-16092026','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'situacao_candidatura', novo.situacao,
           'ultima_atualizacao', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         ),
         verificado_em
  FROM public.candidatos c
  JOIN (VALUES
    ('ariel-capistrano',   'deferido'),
    ('roberto-rocha',      'indeferido com recurso'),
    ('elizeu-aguiar',      'deferido com recurso'),
    ('marcelo-brigadeiro', 'deferido'),
    ('ruth-reis',          'pendente de julgamento'),
    ('leonardo-avalanche', 'pendente de julgamento')
  ) AS novo(slug, situacao) ON novo.slug = c.slug
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos ref=issue-340-situacoes-16092026 campos=situacao_candidatura,ultima_atualizacao
  UPDATE public.candidatos c
  SET situacao_candidatura = s.postimage->>'situacao_candidatura',
      ultima_atualizacao = (s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'issue-340-situacoes-16092026'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 6 THEN
    RAISE EXCEPTION 'issue-340: escritas de situacao esperadas=6 atuais=%', quantidade;
  END IF;

  -- carlos-jararaca: fecha o registro formal de despublicacao (status ->
  -- removido). publicavel e situacao_candidatura ja estavam corretos.
  -- @write tabela=identidade_timeline_quarentena_snapshot ref=issue-340-situacoes-16092026 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'issue-340-situacoes-16092026','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'status','removido',
           'ultima_atualizacao', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         ),
         verificado_em
  FROM public.candidatos c
  WHERE c.slug = 'carlos-jararaca'
    AND c.sq_candidato_2026 = '200002550223'
    AND c.status = 'candidato'
    AND c.publicavel IS FALSE
    AND c.situacao_candidatura = 'indeferido'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=carlos-jararaca campos=status,ultima_atualizacao
  UPDATE public.candidatos c
  SET status = s.postimage->>'status',
      ultima_atualizacao = (s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'issue-340-situacoes-16092026'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug = 'carlos-jararaca'
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'issue-340: escrita de carlos-jararaca esperada=1 atual=%', quantidade;
  END IF;

  -- -----------------------------------------------------------------
  -- BLOCO C: tres substituicoes em `chapas_2026`. Statement auto-limitante:
  -- o WHERE carrega chave + SQ do titular/vice antigo, entao nao depende so
  -- do guard acima para nao alcancar linha errada.
  -- @write tabela=chapas_2026 ref=issue-340-chapas-16092026 chave=2026:RN:carlos-alberto-de-almeida-cavalcante campos=titular_sq_candidato,titular_nome_completo,titular_nome_urna,titular_partido_sigla,titular_candidato_id,fonte_sha256,snapshot_em
  UPDATE public.chapas_2026
  SET titular_sq_candidato = '200002554482',
      titular_nome_completo = 'GLADYER LINHARES GODEIRO',
      titular_nome_urna = 'GODEIRO LINHARESS',
      titular_partido_sigla = 'DC',
      titular_candidato_id = NULL,
      fonte_sha256 = fonte_sha256_chapas,
      snapshot_em = verificado_em
  WHERE chave = '2026:RN:carlos-alberto-de-almeida-cavalcante'
    AND titular_sq_candidato = '200002550223';

  -- @write tabela=chapas_2026 ref=issue-340-chapas-16092026 chave=2026:RN:henrique-othon-costa-de-lyra campos=vice_sq_candidato,vice_nome_completo,vice_nome_urna,vice_partido_sigla,fonte_sha256,snapshot_em
  UPDATE public.chapas_2026
  SET vice_sq_candidato = '200002554523',
      vice_nome_completo = 'MAVIAEL RIBEIRO DA COSTA JUNIOR',
      vice_nome_urna = 'MAVIAEL RIBEIRO',
      vice_partido_sigla = 'PCO',
      fonte_sha256 = fonte_sha256_chapas,
      snapshot_em = verificado_em
  WHERE chave = '2026:RN:henrique-othon-costa-de-lyra'
    AND vice_sq_candidato = '200002553302';

  -- @write tabela=chapas_2026 ref=issue-340-chapas-16092026 chave=2026:SE:emanuel-messias-oliveira-cacho campos=vice_sq_candidato,vice_nome_completo,vice_nome_urna,vice_partido_sigla,fonte_sha256,snapshot_em
  UPDATE public.chapas_2026
  SET vice_sq_candidato = '260002554525',
      vice_nome_completo = 'FABRICIO MOREIRA MENEZES',
      vice_nome_urna = 'DR. FABRÍCIO MENEZES',
      vice_partido_sigla = 'CIDADANIA',
      fonte_sha256 = fonte_sha256_chapas,
      snapshot_em = verificado_em
  WHERE chave = '2026:SE:emanuel-messias-oliveira-cacho'
    AND vice_sq_candidato = '260002551711';

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE (chave = '2026:RN:carlos-alberto-de-almeida-cavalcante' AND titular_sq_candidato = '200002554482')
          OR (chave = '2026:RN:henrique-othon-costa-de-lyra' AND vice_sq_candidato = '200002554523')
          OR (chave = '2026:SE:emanuel-messias-oliveira-cacho' AND vice_sq_candidato = '260002554525')
     ) <> 3
  THEN
    RAISE EXCEPTION 'issue-340: as tres substituicoes de chapas_2026 nao fecharam';
  END IF;
  IF (SELECT count(*) FROM public.chapas_2026
       WHERE titular_sq_candidato = '200002550223' OR vice_sq_candidato = '200002553302'
          OR vice_sq_candidato = '260002551711') <> 0
  THEN
    RAISE EXCEPTION 'issue-340: SQ substituido sobrou em chapas_2026';
  END IF;

  -- -----------------------------------------------------------------
  -- Recibo unico de coleta_log para o lote inteiro. `detalhe` carrega a
  -- pre-imagem das tres linhas de chapas_2026 em `linhas`: e a UNICA fonte de
  -- verdade que o rollback le para restaurar essas colunas (mesmo padrao de
  -- 20260903140000).
  -- @write tabela=coleta_log ref=migration:20260916140000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-consulta-cand-complementar-2026','global','candidatos.situacao_candidatura,chapas_2026',
         'encontrado', 9,
         jsonb_build_object(
           'resumo','Issue #340: seis fichas reconciliadas com DS_SITUACAO_JULGAMENTO (ariel-capistrano, roberto-rocha, elizeu-aguiar, marcelo-brigadeiro, ruth-reis, leonardo-avalanche), carlos-jararaca despublicado (substituido por Godeiro Linharess) e tres chapas de RN/SE atualizadas com o titular/vice vigente (Godeiro Linharess, Maviael Ribeiro, Dr. Fabricio Menezes).',
           'linhas', p.linhas
         )::text,
         fonte_situacao,'migration:20260916140000','escrita'
  FROM issue_340_chapas_preimagem p
  WHERE NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260916140000');

  -- -----------------------------------------------------------------
  -- Pos-condicao final.
  IF (SELECT count(*) FROM (VALUES
        ('ariel-capistrano',   'deferido'),
        ('roberto-rocha',      'indeferido com recurso'),
        ('elizeu-aguiar',      'deferido com recurso'),
        ('marcelo-brigadeiro', 'deferido'),
        ('ruth-reis',          'pendente de julgamento'),
        ('leonardo-avalanche', 'pendente de julgamento')
      ) AS esperado(slug, situacao)
      JOIN public.candidatos c ON c.slug = esperado.slug AND c.situacao_candidatura = esperado.situacao
     ) <> 6
  THEN
    RAISE EXCEPTION 'issue-340: pos-condicao de situacao falhou';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'carlos-jararaca' AND status = 'removido' AND publicavel IS FALSE
      AND situacao_candidatura = 'indeferido'
  ) THEN
    RAISE EXCEPTION 'issue-340: pos-condicao de carlos-jararaca falhou';
  END IF;
END
$apply$;

COMMIT;
