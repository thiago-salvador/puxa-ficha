-- Despublica as 33 linhas de projetos_lei associadas ao código Senado 1757
-- na ficha pedro-cunha-lima. O código corresponde a outro parlamentar.
-- CAS restrito ao conjunto de UUIDs lido por SELECT na produção; snapshot
-- integral e recibo permitem auditoria e rollback.
-- Base anterior: 20260927030200_data_nascimento_sem_sentinela_check.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.projetos_lei IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_pedro_senado_1757_20260927 (
  id uuid PRIMARY KEY
) ON COMMIT DROP;
INSERT INTO _pf_pedro_senado_1757_20260927 (id) VALUES
  ('06e26273-aa48-42c2-8b15-164bd6756c85'::uuid),
  ('07fbc164-0a36-475a-b1ea-d3fffe0c4814'::uuid),
  ('0e490fa1-a390-417e-913b-ea1649404d5c'::uuid),
  ('29586bcd-855c-44c6-b4f5-9f3cc1cc48ef'::uuid),
  ('2b61ac03-7dbc-47cd-9930-e5c987c11faf'::uuid),
  ('2b79dd87-998d-43f7-902b-d7c8a03c0280'::uuid),
  ('331bd1e1-13a4-4a5e-89d2-e33ced173a7a'::uuid),
  ('37eeb668-1a9f-4583-bbca-3ee0f96f6a4f'::uuid),
  ('3c27a805-14a2-4dfb-8c95-b4d06f138152'::uuid),
  ('3f916490-4254-40fc-b0a9-44c8fa3b6ecb'::uuid),
  ('52a80ab4-b686-4aa9-96da-ad5c01a78b0b'::uuid),
  ('5ba63109-95ec-47a1-8773-577b10806c07'::uuid),
  ('74611c16-51aa-4b33-a90d-31af22934f37'::uuid),
  ('7659f71f-ef0c-48b9-952f-22e774c8ed70'::uuid),
  ('7b0dc8cf-b9b4-475e-a007-ccb173d1a129'::uuid),
  ('80e78404-94eb-4df0-96ba-149d119d807c'::uuid),
  ('881d77b1-3203-4734-b75e-dbfa97d50820'::uuid),
  ('88cdffe3-d813-4ebc-bf53-e65fa17205b4'::uuid),
  ('9396f8c2-cfe3-42b5-b336-9d4bcc48a281'::uuid),
  ('a3c2db84-f6a8-49b2-973a-442aceac454c'::uuid),
  ('b09efee6-149d-4163-92b1-6223c3ddba27'::uuid),
  ('b29a130a-d5f3-4690-81d2-cbb837f417c1'::uuid),
  ('b820fb93-2797-4414-b720-32977dfc4286'::uuid),
  ('bc60274e-6329-49a4-8e81-d49f485a649c'::uuid),
  ('bd0b85ea-6ae1-4289-84ec-0949f9892c27'::uuid),
  ('c213ec27-1ee9-49e6-9e40-5b99ec692664'::uuid),
  ('c56c8944-4808-4131-a3b7-72b07f3a0366'::uuid),
  ('c5ed9eee-6633-4354-b0f6-6e24e4976e36'::uuid),
  ('d5af5d00-c8f3-43d7-8643-4c5e5963b91b'::uuid),
  ('df91c5c8-71a1-4b2f-92f6-f74c06db7b3b'::uuid),
  ('e9a1ba0f-800c-48e1-9479-fd9fc109280a'::uuid),
  ('ef3000b1-55ac-4af7-9334-580860c4abb8'::uuid),
  ('fac50008-734d-429e-a87e-bdd58e360f3a'::uuid);

DO $apply$
DECLARE
  ficha constant uuid := 'aa9ca0e4-794c-409d-91fe-4d18c13a449a';
  quantidade integer;
  verificado_em timestamptz := timestamptz '2026-09-27T04:02:00Z';
  motivo constant text := 'homonimo-senado-1757: projetos vinculados a outro parlamentar; esta ficha pertence a Pedro Oliveira Cunha Lima.';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projetos_lei WHERE candidato_id = ficha) THEN
    RAISE NOTICE 'pedro-cunha-lima-senado-20260927: linhas ausentes; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'pedro-cunha-lima-senado-20260927: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM _pf_pedro_senado_1757_20260927) <> 33
     OR (SELECT md5(string_agg(id::text, ',' ORDER BY id::text COLLATE "C"))
           FROM _pf_pedro_senado_1757_20260927) IS DISTINCT FROM '5fb191b918a98a0c193108f5a8bdf1ea'
     OR (SELECT count(*) FROM public.candidatos
          WHERE id = ficha AND slug = 'pedro-cunha-lima'
            AND data_nascimento = DATE '1988-08-15') <> 1
     OR (SELECT count(*) FROM public.projetos_lei p
          JOIN _pf_pedro_senado_1757_20260927 u ON u.id = p.id
          WHERE p.candidato_id = ficha
            AND p.metadata->>'codigo_parlamentar_senado' = '1757'
            AND p.despublicado_em IS NULL
            AND p.despublicacao_motivo IS NULL) <> 33
     OR EXISTS (
          (SELECT p.id FROM public.projetos_lei p
           WHERE p.candidato_id = ficha AND p.metadata->>'codigo_parlamentar_senado' = '1757')
          EXCEPT
          (SELECT id FROM _pf_pedro_senado_1757_20260927)
        )
  THEN
    RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927: preimagem divergiu do recorte de 33 ids';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=pedro-cunha-lima-senado-20260927 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'pedro-cunha-lima-senado-20260927','projetos_lei',p.id,p.candidato_id,
         to_jsonb(p),
         to_jsonb(p) || jsonb_build_object(
           'despublicado_em', verificado_em,
           'despublicacao_motivo', motivo),
         verificado_em
  FROM public.projetos_lei p
  JOIN _pf_pedro_senado_1757_20260927 u ON u.id = p.id
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=projetos_lei slug=pedro-cunha-lima campos=despublicado_em,despublicacao_motivo
  UPDATE public.projetos_lei p
  SET despublicado_em = (s.postimage->>'despublicado_em')::timestamptz,
      despublicacao_motivo = s.postimage->>'despublicacao_motivo'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'pedro-cunha-lima-senado-20260927'
    AND s.tabela = 'projetos_lei'
    AND s.row_id = p.id
    AND p.candidato_id = ficha
    AND EXISTS (SELECT 1 FROM public.candidatos c WHERE c.id = p.candidato_id AND c.slug = 'pedro-cunha-lima')
    AND p.metadata->>'codigo_parlamentar_senado' = '1757'
    AND to_jsonb(p) = s.preimage;
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 33 THEN
    RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927: escrita esperada=33 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260927040200 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'senado-identidade-homonima','global',
         'projetos_lei.despublicado_em,projetos_lei.despublicacao_motivo',
         'encontrado', 33,
         jsonb_build_object(
           'resumo','pedro-cunha-lima: 33 projetos associados ao código Senado 1757 foram despublicados após divergência de identidade.',
           'ids', (SELECT jsonb_agg(id ORDER BY id) FROM _pf_pedro_senado_1757_20260927),
           'ids_md5','5fb191b918a98a0c193108f5a8bdf1ea'
         )::text,
         'https://legis.senado.leg.br/dadosabertos/senador/1757',
         'migration:20260927040200','escrita'
  WHERE NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260927040200');

  IF (SELECT count(*) FROM public.projetos_lei p
       JOIN _pf_pedro_senado_1757_20260927 u ON u.id = p.id
       WHERE p.despublicado_em IS NOT NULL
         AND p.despublicacao_motivo = motivo) <> 33 THEN
    RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927: pos-condicao falhou';
  END IF;
END
$apply$;
COMMIT;
