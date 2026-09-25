-- Uma claim pública "Carreira política: N mandato(s) registrado(s)" ainda contava
-- cargos como mandatos. Mesmo defeito corrigido pela migration 20260922160000
-- e barrado para escrita nova de IA pelo trigger
-- bloquear_contagem_ia_cargos_como_mandatos (decisão de 2026-08-05). O
-- trigger só age em escrita e só para gerado_por='ia', então linhas antigas
-- e linhas de curadoria continuaram no banco.
--
-- Varredura em 2026-09-25 sobre todas as claims com visivel=true e sem
-- despublicacao: títulos ou descrições com contagem de mandatos
-- ("N mandato(s)", "N mandatos", "mandato(s) registrado(s)") e todas as claims
-- intituladas "Carreira política". Duas contam cargos como mandatos (abaixo). A
-- claim de Ricardo Ferraço ("5 cargo(s) eletivo(s)") lista apenas cargos
-- eletivos, com os mandatos repetidos contados à parte, e fica como está.
--
-- 1. 59afc792-415e-4e59-9fc0-6f71ea883b0c, hana-ghassan (pública). "2
--    mandato(s): Vice-Governador (PA), Secretário Estadual". Secretaria
--    estadual é cargo de governo, não mandato eletivo, e a contagem omite que
--    ela governa o Pará desde 02/04/2026. Fontes:
--      - DivulgaCandContas 2022, SQ 140001651992: Vice-governador, PA, "Eleito".
--      - g1, 2026-04-02, "Hana Ghassan assume o governo do Pará; Helder
--        Barbalho deixa cargo": servidora concursada, cargos na Secretaria de
--        Estado da Fazenda, secretária de Estado de Planejamento e
--        Administração (Seplad) antes de ser vice-governadora.
--    A página da Agência Pará citada antes mostra hoje só o comunicado do
--    período eleitoral, sem o texto da notícia, e sai da lista de fontes.
--
-- A outra claim com o mesmo título, ddf1d924-7480-41ba-b212-7ebfef785cd0
-- (janaina-riva, gerada por IA e não verificada), fica fora da superfície
-- pública pela RLS e não pode ser publicada como está: qualquer UPDATE nela
-- mantém o título "Carreira política: 1 mandato(s)" e é recusado pelo trigger.
-- Não é reescrita aqui porque o rollback preservador não conseguiria devolver
-- esse título.
--
-- Título "Carreira política" e descrição que nomeia os cargos sem contá-los
-- como mandatos, no padrão da 20260922160000. Snapshot de preimagem e recibo
-- em coleta_log com before/after. Fail-closed: aceita só a preimagem medida em
-- 2026-09-25.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-dados-no-ar-senado-claims-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.pontos_atencao IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_claims_mandatos_20260925 (
  id uuid PRIMARY KEY,
  titulo_antes text NOT NULL,
  descricao_antes text NOT NULL,
  fontes_antes jsonb NOT NULL,
  titulo_depois text NOT NULL,
  descricao_depois text NOT NULL,
  fontes_depois jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_claims_mandatos_20260925 (
  id, titulo_antes, descricao_antes, fontes_antes,
  titulo_depois, descricao_depois, fontes_depois
) VALUES
(
  '59afc792-415e-4e59-9fc0-6f71ea883b0c',
  'Carreira política: 2 mandato(s) registrado(s)',
  'Hana Ghassan Tuma (MDB) possui 2 mandato(s) registrado(s): Vice-Governador (PA), Secretário Estadual.',
  $j$[{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/PA/2040602022/candidato/140001651992","titulo":"TSE DivulgaCand 2022 - Hana Ghassan"},{"url":"https://www.agenciapara.com.br/noticia/65077/hana-ghassan-assume-o-governo-do-para-em-cerimonia-no-palacio-dos-despachos","titulo":"Agencia Para - posse no Governo do Para"}]$j$::jsonb,
  'Carreira política',
  'Servidora concursada do Pará, ocupou cargos na Secretaria de Estado da Fazenda e foi secretária de Estado de Planejamento e Administração. Eleita vice-governadora em 2022, assumiu o governo do estado em 2 de abril de 2026, com a saída de Helder Barbalho. Secretaria estadual é cargo de governo, não mandato eletivo.',
  $j$[{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/PA/2040602022/candidato/140001651992","titulo":"TSE DivulgaCandContas 2022: Hana Ghassan, vice-governadora eleita no Pará"},{"url":"https://g1.globo.com/pa/para/noticia/2026/04/02/hana-ghassan-assume-governo-do-para.ghtml","data":"2026-04-02","titulo":"g1: Hana Ghassan assume o governo do Pará; Helder Barbalho deixa cargo"}]$j$::jsonb
);

DO $apply$
DECLARE
  quantidade integer;
  verificado_em timestamptz := timestamptz '2026-09-25T22:30:00Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pontos_atencao p JOIN _pf_claims_mandatos_20260925 u ON u.id = p.id) THEN
    RAISE NOTICE 'claims-mandatos-20260925: claims ausentes; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'claims-mandatos-20260925: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.pontos_atencao p
       JOIN _pf_claims_mandatos_20260925 u ON u.id = p.id
       WHERE p.visivel IS TRUE
         AND p.despublicado_em IS NULL
         AND p.titulo = u.titulo_antes
         AND p.descricao = u.descricao_antes
         AND p.fontes = u.fontes_antes) <> 1
  THEN
    RAISE EXCEPTION 'claims-mandatos-20260925: preimagem da claim divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=claims-mandatos-20260925 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'claims-mandatos-20260925','pontos_atencao',p.id,p.candidato_id,to_jsonb(p),
         to_jsonb(p) || jsonb_build_object(
           'titulo', u.titulo_depois,
           'descricao', u.descricao_depois,
           'fontes', u.fontes_depois),
         verificado_em
  FROM public.pontos_atencao p
  JOIN _pf_claims_mandatos_20260925 u ON u.id = p.id
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=pontos_atencao ref=claims-mandatos-20260925 campos=titulo,descricao,fontes
  UPDATE public.pontos_atencao p
  SET titulo = s.postimage->>'titulo',
      descricao = s.postimage->>'descricao',
      fontes = s.postimage->'fontes'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'claims-mandatos-20260925'
    AND s.tabela = 'pontos_atencao'
    AND s.row_id = p.id
    AND to_jsonb(p) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'claims-mandatos-20260925: escrita esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260925220100 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'curadoria-pontos-atencao','global',
         'pontos_atencao.titulo,pontos_atencao.descricao,pontos_atencao.fontes',
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Claim de carreira de hana-ghassan deixou de contar secretaria estadual como mandato; nomeia vice-governadoria (TSE 2022) e governo do Para desde 2026-04-02 (g1).',
           'linhas', jsonb_agg(jsonb_build_object(
             'id', p.id,
             'before', s.preimage,
             'after', to_jsonb(p)) ORDER BY p.id)
         )::text,
         'https://g1.globo.com/pa/para/noticia/2026/04/02/hana-ghassan-assume-governo-do-para.ghtml',
         'migration:20260925220100','escrita'
  FROM public.identidade_timeline_quarentena_snapshot s
  JOIN public.pontos_atencao p ON p.id = s.row_id
  WHERE s.migration_version = 'claims-mandatos-20260925'
    AND s.tabela = 'pontos_atencao'
  HAVING NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260925220100');

  IF (SELECT count(*) FROM public.pontos_atencao p
       JOIN _pf_claims_mandatos_20260925 u ON u.id = p.id
       WHERE p.titulo = u.titulo_depois
         AND p.descricao = u.descricao_depois
         AND p.fontes = u.fontes_depois
         AND p.visivel IS TRUE) <> 1
  THEN
    RAISE EXCEPTION 'claims-mandatos-20260925: pos-condicao falhou';
  END IF;

  -- Nenhuma claim de curadoria visivel continua contando mandatos no titulo.
  -- As de IA com esse titulo sao recusadas pelo trigger em qualquer UPDATE.
  IF EXISTS (SELECT 1 FROM public.pontos_atencao
             WHERE visivel IS TRUE AND despublicado_em IS NULL
               AND gerado_por IS DISTINCT FROM 'ia'
               AND titulo ~* '^Carreira pol[ií]tica:[[:space:]]*[0-9]+[[:space:]]+mandato') THEN
    RAISE EXCEPTION 'claims-mandatos-20260925: ainda ha claim de curadoria visivel com contagem de mandatos no titulo';
  END IF;
END
$apply$;

COMMIT;
