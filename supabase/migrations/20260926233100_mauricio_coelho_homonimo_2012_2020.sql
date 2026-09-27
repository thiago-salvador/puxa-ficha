-- A ficha mauricio-coelho (Mauricio Coelho de Souza Junior, nascido em
-- 18/04/1994, inscrição 110002553058 ao governo de MT em 2026) publicava
-- patrimônio e financiamento de 2012 e 2020 de outra pessoa: MAURICIO COELHO
-- RIBEIRO DA SILVA, nascido em 05/10/1974, vereador em Pontal do Araguaia (MT),
-- inscrições 110000010928 (2012) e 110000951550 (2020). As duas âncoras vinham
-- do seed e casaram pelo nome de urna "MAURICIO COELHO" e pela UF.
--
-- Prova (TSE Dados Abertos, lida em 2026-09-26):
--   consulta_cand_2012/2020: as duas inscrições têm CPF, título e nascimento
--     diferentes dos da inscrição 110002553058; o CPF e o título do candidato de
--     2026 não aparecem em nenhum pacote de 2002 a 2024.
--   bem_candidato_2012 (SQ 110000010928): 2 bens, total R$ 29.000,00 = patrimônio
--     2012 da ficha (f65e7932).
--   bem_candidato_2020 (SQ 110000951550): 4 bens, total R$ 254.787,56 = patrimônio
--     2020 da ficha (e78469f8).
--   financiamento 7ead02ce (2012, R$ 7.838,83) e aacde5cd (2020, R$ 172,00)
--     gravam sq_candidato 110000010928 e 110000951550, e o doador listado é o
--     próprio MAURICIO COELHO RIBEIRO DA SILVA.
-- Histórico político, mudanças de partido e processos da ficha não têm linha do
-- homônimo.
--
-- Escrita: despublicado_em + despublicacao_motivo nas quatro linhas (nenhuma é
-- apagada). A trigger sync_financiamento_doador_search tira as cinco linhas de
-- busca por doador das duas receitas. CAS pela preimagem integral medida;
-- snapshot em identidade_timeline_quarentena_snapshot e recibo em coleta_log.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-datas-nascimento-tse-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.patrimonio IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.financiamento IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_mauricio_homonimo_20260926 (
  tabela text NOT NULL,
  id uuid PRIMARY KEY,
  ano integer NOT NULL,
  valor numeric NOT NULL,
  sq_homonimo text NOT NULL,
  motivo text NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_mauricio_homonimo_20260926 (tabela, id, ano, valor, sq_homonimo, motivo)
VALUES
  ('patrimonio', 'f65e7932-574f-4377-a27c-334458471b64', 2012, 29000.00, '110000010928',
   'homonimo-20260926: bens de MAURICIO COELHO RIBEIRO DA SILVA (TSE bem_candidato_2012, SQ 110000010928), vereador em Pontal do Araguaia nascido em 1974; nao e o candidato desta ficha.'),
  ('patrimonio', 'e78469f8-de18-4104-aa4c-1a78360228d1', 2020, 254787.56, '110000951550',
   'homonimo-20260926: bens de MAURICIO COELHO RIBEIRO DA SILVA (TSE bem_candidato_2020, SQ 110000951550), vereador em Pontal do Araguaia nascido em 1974; nao e o candidato desta ficha.'),
  ('financiamento', '7ead02ce-acfd-417d-b482-a0e92f56b801', 2012, 7838.83, '110000010928',
   'homonimo-20260926: receitas da candidatura 110000010928 de MAURICIO COELHO RIBEIRO DA SILVA, vereador em Pontal do Araguaia nascido em 1974; nao e o candidato desta ficha.'),
  ('financiamento', 'aacde5cd-aafa-466e-9ad4-cb095c75e5b6', 2020, 172.00, '110000951550',
   'homonimo-20260926: receitas da candidatura 110000951550 de MAURICIO COELHO RIBEIRO DA SILVA, vereador em Pontal do Araguaia nascido em 1974; nao e o candidato desta ficha.');

DO $apply$
DECLARE
  quantidade integer;
  total integer := 0;
  verificado_em timestamptz := timestamptz '2026-09-26T23:31:00Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.patrimonio p JOIN _pf_mauricio_homonimo_20260926 u ON u.id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.financiamento f JOIN _pf_mauricio_homonimo_20260926 u ON u.id = f.id) THEN
    RAISE NOTICE 'mauricio-homonimo-20260926: linhas ausentes; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'mauricio-homonimo-20260926: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.id = 'c7a28e0e-06d0-412b-98ee-b79a7a4354f9'
         AND c.slug = 'mauricio-coelho'
         AND c.nome_completo = 'Mauricio Coelho de Souza Junior'
         AND c.data_nascimento = DATE '1994-04-18'
         AND c.sq_candidato_2026 = '110002553058') <> 1
  THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926: ficha divergiu';
  END IF;

  IF (SELECT count(*) FROM public.patrimonio p
       JOIN _pf_mauricio_homonimo_20260926 u ON u.id = p.id AND u.tabela = 'patrimonio'
       WHERE p.candidato_id = 'c7a28e0e-06d0-412b-98ee-b79a7a4354f9'
         AND p.despublicado_em IS NULL
         AND p.ano_eleicao = u.ano
         AND p.valor_total = u.valor
         AND p.fonte = 'TSE') <> 2
     OR (SELECT count(*) FROM public.financiamento f
       JOIN _pf_mauricio_homonimo_20260926 u ON u.id = f.id AND u.tabela = 'financiamento'
       WHERE f.candidato_id = 'c7a28e0e-06d0-412b-98ee-b79a7a4354f9'
         AND f.despublicado_em IS NULL
         AND f.ano_eleicao = u.ano
         AND f.total_arrecadado = u.valor
         AND f.sq_candidato = u.sq_homonimo
         AND f.fonte = 'TSE') <> 2
  THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926: preimagem das quatro linhas divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=mauricio-homonimo-20260926 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'mauricio-homonimo-20260926','patrimonio',p.id,p.candidato_id,to_jsonb(p),
         to_jsonb(p) || jsonb_build_object(
           'despublicado_em', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'despublicacao_motivo', u.motivo),
         verificado_em
  FROM public.patrimonio p
  JOIN _pf_mauricio_homonimo_20260926 u ON u.id = p.id AND u.tabela = 'patrimonio'
  UNION ALL
  SELECT 'mauricio-homonimo-20260926','financiamento',f.id,f.candidato_id,to_jsonb(f),
         to_jsonb(f) || jsonb_build_object(
           'despublicado_em', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'despublicacao_motivo', u.motivo),
         verificado_em
  FROM public.financiamento f
  JOIN _pf_mauricio_homonimo_20260926 u ON u.id = f.id AND u.tabela = 'financiamento'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=patrimonio slug=mauricio-coelho campos=despublicado_em,despublicacao_motivo
  UPDATE public.patrimonio p
  SET despublicado_em = (s.postimage->>'despublicado_em')::timestamptz,
      despublicacao_motivo = s.postimage->>'despublicacao_motivo'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'mauricio-homonimo-20260926'
    AND s.tabela = 'patrimonio'
    AND s.row_id = p.id
    AND p.candidato_id = 'c7a28e0e-06d0-412b-98ee-b79a7a4354f9'
    AND EXISTS (SELECT 1 FROM public.candidatos c WHERE c.id = p.candidato_id AND c.slug = 'mauricio-coelho')
    AND to_jsonb(p) = s.preimage;
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  total := total + quantidade;

  -- @write tabela=financiamento slug=mauricio-coelho campos=despublicado_em,despublicacao_motivo
  UPDATE public.financiamento f
  SET despublicado_em = (s.postimage->>'despublicado_em')::timestamptz,
      despublicacao_motivo = s.postimage->>'despublicacao_motivo'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'mauricio-homonimo-20260926'
    AND s.tabela = 'financiamento'
    AND s.row_id = f.id
    AND f.candidato_id = 'c7a28e0e-06d0-412b-98ee-b79a7a4354f9'
    AND EXISTS (SELECT 1 FROM public.candidatos c WHERE c.id = f.candidato_id AND c.slug = 'mauricio-coelho')
    AND to_jsonb(f) = s.preimage;
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  total := total + quantidade;

  IF total <> 4 THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926: escrita esperada=4 atual=%', total;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260926233100 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-identidade-homonima','global',
         'patrimonio.despublicado_em,patrimonio.despublicacao_motivo,financiamento.despublicado_em,financiamento.despublicacao_motivo',
         'encontrado', 4,
         jsonb_build_object(
           'resumo','mauricio-coelho: patrimonio e financiamento de 2012 e 2020 pertencem a MAURICIO COELHO RIBEIRO DA SILVA (SQ 110000010928 e 110000951550, nascido em 1974), nao ao candidato de 2026 (SQ 110002553058, nascido em 1994). Quatro linhas despublicadas.',
           'linhas', (SELECT jsonb_agg(jsonb_build_object(
               'tabela', s.tabela,
               'id', s.row_id,
               'before', s.preimage,
               'after', CASE s.tabela
                          WHEN 'patrimonio' THEN (SELECT to_jsonb(p) FROM public.patrimonio p WHERE p.id = s.row_id)
                          ELSE (SELECT to_jsonb(f) FROM public.financiamento f WHERE f.id = s.row_id)
                        END) ORDER BY s.tabela, s.row_id)
             FROM public.identidade_timeline_quarentena_snapshot s
             WHERE s.migration_version = 'mauricio-homonimo-20260926')
         )::text,
         'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip',
         'migration:20260926233100','escrita'
  WHERE NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260926233100');

  IF (SELECT count(*) FROM public.patrimonio p
       JOIN _pf_mauricio_homonimo_20260926 u ON u.id = p.id
       WHERE p.despublicado_em IS NOT NULL AND p.despublicacao_motivo = u.motivo)
     + (SELECT count(*) FROM public.financiamento f
       JOIN _pf_mauricio_homonimo_20260926 u ON u.id = f.id
       WHERE f.despublicado_em IS NOT NULL AND f.despublicacao_motivo = u.motivo) <> 4
     OR EXISTS (SELECT 1 FROM public.financiamento_doador_search d
                JOIN _pf_mauricio_homonimo_20260926 u ON u.id = d.financiamento_id)
  THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
