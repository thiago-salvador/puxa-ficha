-- Nome civil errado em dez fichas não publicadas (publicavel=false).
--
-- Varredura em 2026-09-25 das asserções de nome civil de
-- scripts/lib/factual-assertions.ts contra as fontes oficiais. Nas fichas
-- publicadas, o banco confere com NM_CANDIDATO do TSE 2026 em todas. Nas fichas
-- fora do ar com deputado vinculado, dez guardam um nome que o cadastro da
-- Câmara dos Deputados não sustenta (nomeCivil em
-- https://dadosabertos.camara.leg.br/api/v2/deputados/{id}, lido em 2026-09-25;
-- nome parlamentar, UF e data de nascimento conferidos com a ficha):
--
--   slug                   Câmara  antes                          depois (nomeCivil)
--   nikolas-ferreira       209787  Nikolas Ferreira Oliveira      NIKOLAS FERREIRA DE OLIVEIRA
--   rodrigo-pacheco        178897  Rodrigo Pacheco Amaral         RODRIGO OTAVIO SOARES PACHECO
--   da-vitoria             204355  Josias da Vitoria              JOSIAS MARIO DA VITORIA
--   sergio-vidigal         178874  Sergio Vidigal                 ANTONIO SERGIO ALVES VIDIGAL
--   adriana-accorsi        220565  Adriana Accorsi de Queiroz     ADRIANA SAUTHIER ACCORSI
--   beto-faro              141335  Jose Beto Faro Pereira         JOSÉ ROBERTO OLIVEIRA FARO
--   pedro-cunha-lima       178912  Pedro Cunha Lima               PEDRO OLIVEIRA CUNHA LIMA
--   paulo-martins-gov-pr   193726  Paulo Martins                  PAULO EDUARDO LIMA MARTINS
--   confucio-moura         74097   José Confúcio Aires Moura      CONFÚCIO AIRES MOURA
--   thiago-de-joaldo       220560  Thiago Rezende de Oliveira     JOSE THIAGO ALVES DE CARVALHO
--
-- Só nome_completo muda; publicavel continua false. Snapshot de preimagem e
-- recibo em coleta_log com before/after. Fail-closed: aceita só a preimagem
-- medida em 2026-09-25.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-historico-mandatos-federais-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_nome_civil_20260925 (
  slug text PRIMARY KEY,
  antes text NOT NULL,
  depois text NOT NULL,
  camara_id integer NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_nome_civil_20260925 (slug, antes, depois, camara_id) VALUES
  ('nikolas-ferreira', 'Nikolas Ferreira Oliveira', 'NIKOLAS FERREIRA DE OLIVEIRA', 209787),
  ('rodrigo-pacheco', 'Rodrigo Pacheco Amaral', 'RODRIGO OTAVIO SOARES PACHECO', 178897),
  ('da-vitoria', 'Josias da Vitoria', 'JOSIAS MARIO DA VITORIA', 204355),
  ('sergio-vidigal', 'Sergio Vidigal', 'ANTONIO SERGIO ALVES VIDIGAL', 178874),
  ('adriana-accorsi', 'Adriana Accorsi de Queiroz', 'ADRIANA SAUTHIER ACCORSI', 220565),
  ('beto-faro', 'Jose Beto Faro Pereira', 'JOSÉ ROBERTO OLIVEIRA FARO', 141335),
  ('pedro-cunha-lima', 'Pedro Cunha Lima', 'PEDRO OLIVEIRA CUNHA LIMA', 178912),
  ('paulo-martins-gov-pr', 'Paulo Martins', 'PAULO EDUARDO LIMA MARTINS', 193726),
  ('confucio-moura', 'José Confúcio Aires Moura', 'CONFÚCIO AIRES MOURA', 74097),
  ('thiago-de-joaldo', 'Thiago Rezende de Oliveira', 'JOSE THIAGO ALVES DE CARVALHO', 220560);

DO $apply$
DECLARE
  quantidade integer;
  verificado_em timestamptz := timestamptz '2026-09-25T23:30:00Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos c JOIN _pf_nome_civil_20260925 u ON u.slug = c.slug) THEN
    RAISE NOTICE 'nome-civil-20260925: fichas ausentes; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'nome-civil-20260925: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       JOIN _pf_nome_civil_20260925 u ON u.slug = c.slug
       WHERE c.nome_completo = u.antes
         AND c.publicavel IS NOT TRUE) <> 10
  THEN
    RAISE EXCEPTION 'nome-civil-20260925: preimagem das dez fichas divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=nome-civil-20260925 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'nome-civil-20260925','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object('nome_completo', u.depois),
         verificado_em
  FROM public.candidatos c
  JOIN _pf_nome_civil_20260925 u ON u.slug = c.slug
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=nikolas-ferreira campos=nome_completo
  -- @write tabela=candidatos slug=rodrigo-pacheco campos=nome_completo
  -- @write tabela=candidatos slug=da-vitoria campos=nome_completo
  -- @write tabela=candidatos slug=sergio-vidigal campos=nome_completo
  -- @write tabela=candidatos slug=adriana-accorsi campos=nome_completo
  -- @write tabela=candidatos slug=beto-faro campos=nome_completo
  -- @write tabela=candidatos slug=pedro-cunha-lima campos=nome_completo
  -- @write tabela=candidatos slug=paulo-martins-gov-pr campos=nome_completo
  -- @write tabela=candidatos slug=confucio-moura campos=nome_completo
  -- @write tabela=candidatos slug=thiago-de-joaldo campos=nome_completo
  UPDATE public.candidatos c
  SET nome_completo = s.postimage->>'nome_completo'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'nome-civil-20260925'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug IN ('nikolas-ferreira','rodrigo-pacheco','da-vitoria','sergio-vidigal','adriana-accorsi',
                   'beto-faro','pedro-cunha-lima','paulo-martins-gov-pr','confucio-moura','thiago-de-joaldo')
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 10 THEN
    RAISE EXCEPTION 'nome-civil-20260925: escrita esperada=10 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260925230100 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'camara','global','candidatos.nome_completo','encontrado', 10,
         jsonb_build_object(
           'resumo','Nome civil de dez fichas nao publicadas alinhado ao nomeCivil do cadastro da Camara dos Deputados, lido em 2026-09-25.',
           'linhas', jsonb_agg(jsonb_build_object(
             'slug', c.slug,
             'camara_id', u.camara_id,
             'before', s.preimage,
             'after', to_jsonb(c)) ORDER BY c.slug)
         )::text,
         'https://dadosabertos.camara.leg.br/api/v2/deputados',
         'migration:20260925230100','escrita'
  FROM public.identidade_timeline_quarentena_snapshot s
  JOIN public.candidatos c ON c.id = s.row_id
  JOIN _pf_nome_civil_20260925 u ON u.slug = c.slug
  WHERE s.migration_version = 'nome-civil-20260925'
    AND s.tabela = 'candidatos'
  HAVING NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260925230100');

  IF (SELECT count(*) FROM public.candidatos c
       JOIN _pf_nome_civil_20260925 u ON u.slug = c.slug
       WHERE c.nome_completo = u.depois AND c.publicavel IS NOT TRUE) <> 10
  THEN
    RAISE EXCEPTION 'nome-civil-20260925: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
