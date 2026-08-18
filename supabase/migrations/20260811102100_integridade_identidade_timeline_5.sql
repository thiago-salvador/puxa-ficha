-- Correção fail-closed das cinco fichas cuja timeline expôs colisões de identidade.
-- Fonte primária: consulta_cand oficial do TSE, snapshots 2018, 2022 e 2026.

DO $$
DECLARE
  identidades_exatas integer;
BEGIN
  -- Slug não é identidade. A tupla estável abaixo foi medida antes do forward.
  -- ultima_atualizacao é deliberadamente excluída: o cron pode avançá-la sem
  -- alterar identidade ou curadoria.
  WITH esperadas(
    id, slug, nome_completo, nome_urna, nascimento, estado, cargo,
    partido_atual, partido_sigla, status, situacao, publicavel,
    created_at
  ) AS (
    VALUES
      ('23dc2553-0fd3-489f-9ac1-4ed50b8ec5e3'::uuid, 'coronel-busnello', 'João Jacques Soares Busnello', 'Coronel Busnello', date '1970-08-06', 'RJ', 'Governador', 'Partido Missão', 'MISSAO', 'pre-candidato', 'pre-candidato', true, timestamptz '2026-07-30 14:27:52.971837+00'),
      ('baf8abd2-9386-48df-876e-1e8b16fa1e7f'::uuid, 'jeremias-cosmo', 'Jeremias Cosmo Silva dos Santos', 'Professor Jeremias', date '1980-03-27', 'PE', 'Governador', 'Democrata', 'D35', 'pre-candidato', 'pre-candidato', true, timestamptz '2026-07-30 14:27:52.971837+00'),
      ('a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid, 'joao-rodrigues', 'João Rodrigues', 'João Rodrigues', date '1967-03-23', 'SC', 'Governador', 'Partido Social Democrático', 'PSD', 'pre-candidato', 'pre-candidato', true, timestamptz '2026-03-31 02:25:56.070567+00'),
      ('47a1de10-1cf7-47f8-837b-dbbf94480421'::uuid, 'orleans-brandao', 'Carlos Orleans Brandão Junior', 'Orleans Brandao', date '1958-06-02', 'MA', 'Governador', 'Movimento Democrático Brasileiro', 'MDB', 'pre-candidato', 'pre-candidato', true, timestamptz '2026-03-31 02:47:47.335142+00'),
      ('81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid, 'renan-filho', 'José Renan Vasconcelos Calheiros Filho', 'Renan Filho', date '1979-10-08', 'AL', 'Governador', 'Movimento Democrático Brasileiro', 'MDB', 'pre-candidato', 'pre-candidato', true, timestamptz '2026-03-31 02:47:47.335142+00')
  )
  SELECT count(*) INTO identidades_exatas
  FROM esperadas e
  JOIN public.candidatos c ON
       c.id=e.id AND c.slug=e.slug
   AND c.nome_completo=e.nome_completo AND c.nome_urna=e.nome_urna
   AND c.data_nascimento=e.nascimento AND c.estado=e.estado
   AND c.cargo_disputado=e.cargo AND c.partido_atual=e.partido_atual
   AND c.partido_sigla=e.partido_sigla AND c.status=e.status
   AND c.situacao_candidatura=e.situacao AND c.publicavel=e.publicavel
   AND c.created_at=e.created_at;

  IF identidades_exatas <> 5 THEN
    RAISE EXCEPTION 'integridade timeline: tuplas canônicas divergiram; esperadas 5, encontradas %', identidades_exatas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug='carlos-brandao-ma-historico' OR id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'
  ) OR EXISTS (
    SELECT 1 FROM public.mudancas_partido
    WHERE id IN ('65ed4abb-2b3e-4092-aeed-bee9bfd38fde','30f87192-dc08-473c-aa19-21c7fadfb44b','24e9d2d1-9008-4dfd-916d-03a6713820ec')
  ) OR EXISTS (
    SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
    WHERE migration_version='20260811102100'
  ) THEN
    RAISE EXCEPTION 'integridade timeline: IDs reservados ou snapshots já existem';
  END IF;
END $$;

-- Manifesto medido em produção antes do forward. O hash cobre o payload
-- integral, excetuando somente as colunas de quarentena, que são validadas
-- separadamente como NULL. categorias_origem também deve ser NULL quando
-- existir, mantendo compatibilidade com o replay anterior à coluna.
CREATE TEMP TABLE identidade_timeline_manifesto_allowlisted(
  tabela text NOT NULL,
  id uuid NOT NULL,
  candidato_id uuid NOT NULL,
  sha256 text NOT NULL,
  PRIMARY KEY(tabela,id)
) ON COMMIT DROP;

INSERT INTO identidade_timeline_manifesto_allowlisted(tabela,id,candidato_id,sha256) VALUES
('historico_politico','2cdb9e2c-fd82-4ff2-9535-c768cf723248'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'a94de3a13cae72dbc7cfbdc21a227d351de432dfc045da64eef5851fa8b42892'),
  ('historico_politico','3a7f6d38-d643-45ec-978a-7955d1d59ad8'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'4a1dab04018b69f256f0c04c79e13afe6207e20e1c0fe390c3f60dfc8999289c'),
  ('historico_politico','470def37-f018-4dcc-a917-4ed07e42679b'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'fb32f0c6edcfa99207d9ce7b5c36f1f492ca3c93c3b6c6265d23bdcb4a2a9af1'),
  ('historico_politico','51341284-613b-4c99-86da-929c7f174e0e'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'a49613352310d0480d19187051f4a4db9afabfb5ddf8b03f7c24e9976abfe7ca'),
  ('historico_politico','633b3e5b-6e0a-42b8-b120-152349e89f7e'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'8d9249609c683b0c84222757a8f2c8c0b141bcc40a827e1e4fe2ea6390480fa5'),
  ('historico_politico','6b8c42f2-7124-42e4-ae9b-ca4dcaf453f4'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'ca989d9b8dd2f6ae0f6f43b193b5fdceee3bdc4b08a6049ff7efdfd7f720acf6'),
  ('historico_politico','6bfe178b-bd43-4ecd-9312-e5ef07fd7ee9'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'90805d72b213ee9b8c5dd8e09270d55cd8e8d221061646ba67d31a972f088cd5'),
  ('historico_politico','6fb20705-8476-4b0e-a816-551cd347db37'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'c7f45d15b79e35919fab45d6366e61c5c1767f35126f7cfc28997d0a2fa4e49d'),
  ('historico_politico','7ac8d8f8-a0ef-410b-8d7a-efa62a1a1a72'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'bce1693dabbc332e22fa8dd07cdfda48f04633aaf6789045f123469c486008da'),
  ('historico_politico','863ee379-1fb7-4416-8f25-e38260337eb8'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'3021a01b0c25e6ae6e3e48d0dcc5f10d66e0a4d41c0344adbdb0edc08d677023'),
  ('historico_politico','b2f7b24f-d828-43de-bc0d-4071fb86df82'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'7b3bf089d11b9da92f3f016ef900643339c9f4dd9bad26ad7203317109e17546'),
  ('historico_politico','e4d5e5ea-aa99-4ab0-8748-c5bffc942b31'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'9908b58e8598b75b4835a81bc05ea7428490e4635d9b92556efc238fb4a09b0a'),
  ('mudancas_partido','00a4b5e3-7bd7-4824-9aa2-573fe51a06e3'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'9b4b4d61e2ea02a9c86592d36d231314061c4007c0a36a93c40adc6b0e7f55ae'),
  ('mudancas_partido','102e508b-6a63-45e2-a889-e1474123ffea'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'925d1564da05e291366a8a18bf6617fc88c6a24d975162aa6ca16d1e371905c0'),
  ('mudancas_partido','826cab46-0271-40d9-9979-035ff260be54'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'102e6f07e4d16869238cffae3fa36d44d98bb618b8df357501993a3abc123024'),
  ('mudancas_partido','ae226065-88b2-4b86-b4e6-92e8c5400210'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'81c944d6f5d505de4ffa05106cee982f59fade7c48554d0f81f680c92047d0e7'),
  ('mudancas_partido','c3f281e6-f38f-4a79-82f1-1621064c9e9f'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'222a6a7b8ee9c2405c7c7859f0af1aefe912d654376ab63967dee1bbbf035ef9'),
  ('mudancas_partido','dc3ae172-4577-4cd8-bb49-dd33a599735a'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'30859d7c5e265fd1b21108048306d10dccd772a2cbc0d262aa4b1bcfed9b2267'),
  ('patrimonio','33ad044c-71c7-4964-b563-b1f7f31e62da'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'8e40627581e2e5a50462d6d142d23ef5c762f810ef82806b3170a6925a59263f'),
  ('patrimonio','61a49b91-a0d8-42f6-83c4-545fdd0eb570'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'d937f9a12e014b37d993569bb8e4f7803d7c877e6228eb4ab512d5948ab4afdc'),
  ('patrimonio','6cc29a4b-bb69-4e57-804b-fd6a3e7eb93d'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'1b8d55981d7870432ab736c5543f2002e31c54a87aaec24b141d0f5ed8a0c8f5'),
  ('patrimonio','75d858a8-4678-45f5-bfd2-631983d67224'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'af74c4de9fca43ee24e0a293a9ee165139058f1dc729b08bcd1d3efdf4e24614'),
  ('financiamento','89c59acc-00ae-446e-9164-a82f01d25224'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'f52453b50546d464d74b5991f81eff1b5426ae527096cb7f9c6082b63a327b42'),
  ('financiamento','99d896e5-f18c-471e-8f0e-e023a50ec8bb'::uuid,'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid,'5d7c18c243ca75720d5e0770f7d734949f19a34106a9dcebe25251cfd7ccff25'),
  ('financiamento','c1e117bb-4caa-45f6-ae7b-7dadb5e012ca'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'a4f75862e1de758f9f2d98b9d2f80ae11f9590b4fafbf3cf7ef1efccf9533eb7'),
  ('financiamento','e9c1abcb-22af-4ab1-afde-9b317c25391a'::uuid,'81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid,'db479054f6592495a7689767506551427ee69b44657631bb0ebc2a01c4914c1f');

DO $$
DECLARE
  divergentes integer;
  categorias_preenchidas boolean := false;
BEGIN
  IF (SELECT count(*) FROM identidade_timeline_manifesto_allowlisted WHERE tabela='historico_politico') <> 12
     OR (SELECT count(*) FROM identidade_timeline_manifesto_allowlisted WHERE tabela='mudancas_partido') <> 6
     OR (SELECT count(*) FROM identidade_timeline_manifesto_allowlisted WHERE tabela='patrimonio') <> 4
     OR (SELECT count(*) FROM identidade_timeline_manifesto_allowlisted WHERE tabela='financiamento') <> 4 THEN
    RAISE EXCEPTION 'integridade timeline: cardinalidade do manifesto allowlisted divergente';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financiamento' AND column_name='categorias_origem'
  ) THEN
    EXECUTE $q$
      SELECT EXISTS(
        SELECT 1 FROM public.financiamento f
        JOIN identidade_timeline_manifesto_allowlisted m ON m.tabela='financiamento' AND m.id=f.id
        WHERE f.categorias_origem IS NOT NULL
      )
    $q$ INTO categorias_preenchidas;
  END IF;
  IF categorias_preenchidas THEN
    RAISE EXCEPTION 'integridade timeline: categorias_origem allowlisted deve permanecer NULL';
  END IF;

  SELECT count(*) INTO divergentes FROM identidade_timeline_manifesto_allowlisted m
  WHERE NOT CASE m.tabela
    WHEN 'historico_politico' THEN EXISTS(
      SELECT 1 FROM public.historico_politico t
      WHERE t.id=m.id AND t.candidato_id=m.candidato_id
        AND t.despublicado_em IS NULL AND t.despublicacao_motivo IS NULL
        AND encode(extensions.digest(convert_to((to_jsonb(t)-'despublicado_em'-'despublicacao_motivo'-'categorias_origem')::text,'UTF8'),'sha256'),'hex')=m.sha256
    )
    WHEN 'mudancas_partido' THEN EXISTS(
      SELECT 1 FROM public.mudancas_partido t
      WHERE t.id=m.id AND t.candidato_id=m.candidato_id
        AND t.despublicado_em IS NULL AND t.despublicacao_motivo IS NULL
        AND encode(extensions.digest(convert_to((to_jsonb(t)-'despublicado_em'-'despublicacao_motivo'-'categorias_origem')::text,'UTF8'),'sha256'),'hex')=m.sha256
    )
    WHEN 'patrimonio' THEN EXISTS(
      SELECT 1 FROM public.patrimonio t
      WHERE t.id=m.id AND t.candidato_id=m.candidato_id
        AND t.despublicado_em IS NULL AND t.despublicacao_motivo IS NULL
        AND encode(extensions.digest(convert_to((to_jsonb(t)-'despublicado_em'-'despublicacao_motivo'-'categorias_origem')::text,'UTF8'),'sha256'),'hex')=m.sha256
    )
    WHEN 'financiamento' THEN EXISTS(
      SELECT 1 FROM public.financiamento t
      WHERE t.id=m.id AND t.candidato_id=m.candidato_id
        AND t.despublicado_em IS NULL AND t.despublicacao_motivo IS NULL
        AND encode(extensions.digest(convert_to((to_jsonb(t)-'despublicado_em'-'despublicacao_motivo'-'categorias_origem')::text,'UTF8'),'sha256'),'hex')=m.sha256
    )
    ELSE false
  END;
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'integridade timeline: manifesto allowlisted ausente ou adulterado em % linha(s)', divergentes;
  END IF;
END $$;

-- Snapshot integral das 26 linhas preservadas. O readback e o rollback passam
-- a comparar payload, não apenas UUID.
-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260811102100 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260811102100','historico_politico',t.id,t.candidato_id,to_jsonb(t),to_jsonb(t),timestamptz '2026-08-11 18:00:00+00'
FROM public.historico_politico t JOIN identidade_timeline_manifesto_allowlisted m ON m.tabela='historico_politico' AND m.id=t.id;

-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260811102100 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260811102100','mudancas_partido',t.id,t.candidato_id,to_jsonb(t),to_jsonb(t),timestamptz '2026-08-11 18:00:00+00'
FROM public.mudancas_partido t JOIN identidade_timeline_manifesto_allowlisted m ON m.tabela='mudancas_partido' AND m.id=t.id;

-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260811102100 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260811102100','patrimonio',t.id,t.candidato_id,to_jsonb(t),to_jsonb(t),timestamptz '2026-08-11 18:00:00+00'
FROM public.patrimonio t JOIN identidade_timeline_manifesto_allowlisted m ON m.tabela='patrimonio' AND m.id=t.id;

-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260811102100 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260811102100','financiamento',t.id,t.candidato_id,to_jsonb(t),to_jsonb(t),timestamptz '2026-08-11 18:00:00+00'
FROM public.financiamento t JOIN identidade_timeline_manifesto_allowlisted m ON m.tabela='financiamento' AND m.id=t.id;

-- Snapshot integral do registro composto. O rollback não reconstrói campos de memória.
-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260811102100 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260811102100','candidatos',c.id,c.id,to_jsonb(c),
       to_jsonb(c) || jsonb_build_object(
         'slug','carlos-brandao-ma-historico','status','removido','publicavel',false,
         'ultima_atualizacao','2026-08-11T18:00:00+00:00'
       ), timestamptz '2026-08-11 18:00:00+00'
FROM public.candidatos c WHERE c.id='47a1de10-1cf7-47f8-837b-dbbf94480421';

-- @write tabela=candidatos slug=orleans-brandao campos=slug,status,publicavel,ultima_atualizacao
UPDATE public.candidatos c
SET slug='carlos-brandao-ma-historico', status='removido', publicavel=false,
    ultima_atualizacao=timestamptz '2026-08-11 18:00:00+00'
FROM public.identidade_timeline_quarentena_snapshot s
WHERE s.migration_version='20260811102100' AND s.tabela='candidatos'
  AND s.row_id=c.id AND c.slug='orleans-brandao' AND to_jsonb(c)=s.preimage;

-- A pré-candidatura é sustentada pela declaração pública do próprio Orleans e
-- pelo lançamento registrado na Assembleia Legislativa do Maranhão. O SQ do
-- TSE ancora a identidade, mas o resultado #NULO não é tratado como pedido,
-- registro ou deferimento de candidatura.
-- @write tabela=candidatos slug=orleans-brandao campos=id,nome_completo,nome_urna,slug,data_nascimento,naturalidade,formacao,profissao_declarada,partido_atual,partido_sigla,cargo_atual,cargo_disputado,estado,status,situacao_candidatura,site_campanha,redes_sociais,fonte_dados,biografia,publicavel,ultima_atualizacao,created_at
INSERT INTO public.candidatos (
  id,nome_completo,nome_urna,slug,data_nascimento,naturalidade,formacao,
  profissao_declarada,partido_atual,partido_sigla,cargo_atual,cargo_disputado,
  estado,status,situacao_candidatura,site_campanha,redes_sociais,fonte_dados,biografia,
  publicavel,ultima_atualizacao,created_at
) VALUES (
  'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601','Carlos Orleans Braide Brandão',
  'Orleans Brandao','orleans-brandao',date '1994-12-08','São Luís/MA',
  'Superior completo','Administrador','Movimento Democrático Brasileiro','MDB',
  NULL,'Governador','MA','pre-candidato',
  'Pré-candidatura declarada publicamente; não é candidatura registrada ou deferida no TSE.',
  'https://orleansbrandao.com.br/','{}'::jsonb,ARRAY[
    'https://www.al.ma.leg.br/sitealema/discurso/tempo-dos-blocos-iracema-vale-3/',
    'https://orleansbrandao.com.br/',
    'https://orleansbrandao.com.br/saiba-mais/',
    'https://www.seam.ma.gov.br/noticias/orleans-brandao-participa-da-18-cavalgada-de-sao-joao-do-paraiso-e-anuncia-obras-para-o-municipio',
    'https://pm.ssp.ma.gov.br/wp-content/uploads/2026/04/Publicacao-da-promocao-dos-Oficiais-no-Diario-Oficial-no-059-de-31-de-marco-de-2026.pdf',
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip'
  ],
  'Administrador público do Maranhão. Esta ficha corresponde ao registro TSE 2026 de Carlos Orleans Braide Brandão e não ao governador Carlos Orleans Brandão Júnior.',
  true,timestamptz '2026-08-11 18:00:00+00',timestamptz '2026-08-11 18:00:00+00'
);

-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260811102100 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260811102100','candidatos',c.id,c.id,'{}'::jsonb,to_jsonb(c),
       timestamptz '2026-08-11 18:00:00+00'
FROM public.candidatos c WHERE c.id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601';

-- @write tabela=mudancas_partido slug=orleans-brandao campos=id,candidato_id,partido_anterior,partido_novo,ano,data_mudanca,contexto,created_at
INSERT INTO public.mudancas_partido(id,candidato_id,partido_anterior,partido_novo,ano,data_mudanca,contexto,created_at) VALUES
('65ed4abb-2b3e-4092-aeed-bee9bfd38fde',(SELECT id FROM public.candidatos WHERE id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601' AND slug='orleans-brandao'),'Histórico anterior não determinado','MDB',2026,NULL,'Âncora de filiação observada no consulta_cand 2026 do TSE, SQ 100002543869, UF MA, cargo GOVERNADOR. O resultado #NULO não é tratado como candidatura confirmada. Fonte: https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',timestamptz '2026-08-11 18:00:00+00');

-- Inventário confiável é uma allowlist de UUIDs. Toda linha pública adicional,
-- inclusive um ano inesperado, é snapshotada integralmente e despublicada.
-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260811102100 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260811102100','historico_politico',h.id,h.candidato_id,to_jsonb(h),
       to_jsonb(h)||jsonb_build_object('despublicado_em','2026-08-11T18:00:00+00:00','despublicacao_motivo','integridade-identidade-timeline-5-20260811: fora do inventário canônico.'),
       timestamptz '2026-08-11 18:00:00+00'
FROM public.historico_politico h
WHERE h.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7')
  AND h.despublicado_em IS NULL AND h.id <> ALL (ARRAY[
    '863ee379-1fb7-4416-8f25-e38260337eb8','e4d5e5ea-aa99-4ab0-8748-c5bffc942b31','633b3e5b-6e0a-42b8-b120-152349e89f7e','7ac8d8f8-a0ef-410b-8d7a-efa62a1a1a72','2cdb9e2c-fd82-4ff2-9535-c768cf723248',
    '3a7f6d38-d643-45ec-978a-7955d1d59ad8','470def37-f018-4dcc-a917-4ed07e42679b','51341284-613b-4c99-86da-929c7f174e0e','6fb20705-8476-4b0e-a816-551cd347db37','b2f7b24f-d828-43de-bc0d-4071fb86df82','6bfe178b-bd43-4ecd-9312-e5ef07fd7ee9','6b8c42f2-7124-42e4-ae9b-ca4dcaf453f4'
  ]::uuid[]);

-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260811102100 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260811102100','mudancas_partido',m.id,m.candidato_id,to_jsonb(m),
       to_jsonb(m)||jsonb_build_object('despublicado_em','2026-08-11T18:00:00+00:00','despublicacao_motivo','integridade-identidade-timeline-5-20260811: fora do inventário canônico.'),
       timestamptz '2026-08-11 18:00:00+00'
FROM public.mudancas_partido m
WHERE m.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7')
  AND m.despublicado_em IS NULL AND m.id <> ALL (ARRAY[
    'ae226065-88b2-4b86-b4e6-92e8c5400210','00a4b5e3-7bd7-4824-9aa2-573fe51a06e3','102e508b-6a63-45e2-a889-e1474123ffea','826cab46-0271-40d9-9979-035ff260be54',
    'dc3ae172-4577-4cd8-bb49-dd33a599735a','c3f281e6-f38f-4a79-82f1-1621064c9e9f'
  ]::uuid[]);

-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260811102100 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260811102100','patrimonio',p.id,p.candidato_id,to_jsonb(p),
       to_jsonb(p)||jsonb_build_object('despublicado_em','2026-08-11T18:00:00+00:00','despublicacao_motivo','integridade-identidade-timeline-5-20260811: fora do inventário canônico.'),
       timestamptz '2026-08-11 18:00:00+00'
FROM public.patrimonio p
WHERE p.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7')
  AND p.despublicado_em IS NULL AND p.id <> ALL (ARRAY[
    '33ad044c-71c7-4964-b563-b1f7f31e62da','61a49b91-a0d8-42f6-83c4-545fdd0eb570','75d858a8-4678-45f5-bfd2-631983d67224','6cc29a4b-bb69-4e57-804b-fd6a3e7eb93d'
  ]::uuid[]);

-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260811102100 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260811102100','financiamento',f.id,f.candidato_id,to_jsonb(f),
       to_jsonb(f)||jsonb_build_object('despublicado_em','2026-08-11T18:00:00+00:00','despublicacao_motivo','integridade-identidade-timeline-5-20260811: fora do inventário canônico.'),
       timestamptz '2026-08-11 18:00:00+00'
FROM public.financiamento f
WHERE f.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7')
  AND f.despublicado_em IS NULL AND f.id <> ALL (ARRAY[
    '89c59acc-00ae-446e-9164-a82f01d25224','99d896e5-f18c-471e-8f0e-e023a50ec8bb','c1e117bb-4caa-45f6-ae7b-7dadb5e012ca','e9c1abcb-22af-4ab1-afde-9b317c25391a'
  ]::uuid[]);

-- @write tabela=historico_politico slug=joao-rodrigues campos=despublicado_em,despublicacao_motivo
-- @write tabela=historico_politico slug=renan-filho campos=despublicado_em,despublicacao_motivo
UPDATE public.historico_politico t SET despublicado_em=(s.postimage->>'despublicado_em')::timestamptz,despublicacao_motivo=s.postimage->>'despublicacao_motivo' FROM public.identidade_timeline_quarentena_snapshot s WHERE s.migration_version='20260811102100' AND s.tabela='historico_politico' AND s.row_id=t.id AND to_jsonb(t)=s.preimage AND EXISTS(SELECT 1 FROM public.candidatos c WHERE c.id=t.candidato_id AND c.slug IN ('joao-rodrigues','renan-filho'));
-- @write tabela=mudancas_partido slug=joao-rodrigues campos=despublicado_em,despublicacao_motivo
-- @write tabela=mudancas_partido slug=renan-filho campos=despublicado_em,despublicacao_motivo
UPDATE public.mudancas_partido t SET despublicado_em=(s.postimage->>'despublicado_em')::timestamptz,despublicacao_motivo=s.postimage->>'despublicacao_motivo' FROM public.identidade_timeline_quarentena_snapshot s WHERE s.migration_version='20260811102100' AND s.tabela='mudancas_partido' AND s.row_id=t.id AND to_jsonb(t)=s.preimage AND EXISTS(SELECT 1 FROM public.candidatos c WHERE c.id=t.candidato_id AND c.slug IN ('joao-rodrigues','renan-filho'));
-- @write tabela=patrimonio slug=joao-rodrigues campos=despublicado_em,despublicacao_motivo
-- @write tabela=patrimonio slug=renan-filho campos=despublicado_em,despublicacao_motivo
UPDATE public.patrimonio t SET despublicado_em=(s.postimage->>'despublicado_em')::timestamptz,despublicacao_motivo=s.postimage->>'despublicacao_motivo' FROM public.identidade_timeline_quarentena_snapshot s WHERE s.migration_version='20260811102100' AND s.tabela='patrimonio' AND s.row_id=t.id AND to_jsonb(t)=s.preimage AND EXISTS(SELECT 1 FROM public.candidatos c WHERE c.id=t.candidato_id AND c.slug IN ('joao-rodrigues','renan-filho'));
-- @write tabela=financiamento slug=joao-rodrigues campos=despublicado_em,despublicacao_motivo
-- @write tabela=financiamento slug=renan-filho campos=despublicado_em,despublicacao_motivo
UPDATE public.financiamento t SET despublicado_em=(s.postimage->>'despublicado_em')::timestamptz,despublicacao_motivo=s.postimage->>'despublicacao_motivo' FROM public.identidade_timeline_quarentena_snapshot s WHERE s.migration_version='20260811102100' AND s.tabela='financiamento' AND s.row_id=t.id AND to_jsonb(t)=s.preimage AND EXISTS(SELECT 1 FROM public.candidatos c WHERE c.id=t.candidato_id AND c.slug IN ('joao-rodrigues','renan-filho'));

-- @write tabela=mudancas_partido slug=coronel-busnello campos=id,candidato_id,partido_anterior,partido_novo,ano,data_mudanca,contexto,created_at
INSERT INTO public.mudancas_partido(id,candidato_id,partido_anterior,partido_novo,ano,data_mudanca,contexto,created_at) VALUES
('30f87192-dc08-473c-aa19-21c7fadfb44b',(SELECT id FROM public.candidatos WHERE id='23dc2553-0fd3-489f-9ac1-4ed50b8ec5e3' AND slug='coronel-busnello'),'PSD','MISSAO',2026,NULL,'Filiação observada no consulta_cand 2026 do TSE, SQ 190002544120, nome civil JOÃO JACQUES SOARES BUSNELLO, UF RJ, cargo GOVERNADOR. Resultado #NULO, sem inferir candidatura confirmada. Fonte: https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',timestamptz '2026-08-11 18:00:00+00');

-- @write tabela=mudancas_partido slug=jeremias-cosmo campos=id,candidato_id,partido_anterior,partido_novo,ano,data_mudanca,contexto,created_at
INSERT INTO public.mudancas_partido(id,candidato_id,partido_anterior,partido_novo,ano,data_mudanca,contexto,created_at) VALUES
('24e9d2d1-9008-4dfd-916d-03a6713820ec',(SELECT id FROM public.candidatos WHERE id='baf8abd2-9386-48df-876e-1e8b16fa1e7f' AND slug='jeremias-cosmo'),'AGIR','D35',2026,NULL,'Filiação observada no consulta_cand 2026 do TSE, SQ 170002541258, nome civil JEREMIAS COSMO SILVA DOS SANTOS, UF PE, cargo GOVERNADOR, partido DEMOCRATA. Resultado #NULO, sem inferir candidatura confirmada. Fonte: https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',timestamptz '2026-08-11 18:00:00+00');

-- As três âncoras criadas também são assinadas pelo postimage integral.
-- @write tabela=identidade_timeline_quarentena_snapshot ref=20260811102100 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
INSERT INTO public.identidade_timeline_quarentena_snapshot
  (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT '20260811102100','mudancas_partido',m.id,m.candidato_id,'{}'::jsonb,to_jsonb(m),
       timestamptz '2026-08-11 18:00:00+00'
FROM public.mudancas_partido m
WHERE m.id IN (
  '65ed4abb-2b3e-4092-aeed-bee9bfd38fde',
  '30f87192-dc08-473c-aa19-21c7fadfb44b',
  '24e9d2d1-9008-4dfd-916d-03a6713820ec'
);

DO $$
DECLARE divergentes integer; publicas_fora integer;
BEGIN
  SELECT count(*) INTO divergentes FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260811102100' AND NOT (
    CASE s.tabela
      WHEN 'candidatos' THEN EXISTS(SELECT 1 FROM public.candidatos t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
      WHEN 'historico_politico' THEN EXISTS(SELECT 1 FROM public.historico_politico t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
      WHEN 'mudancas_partido' THEN EXISTS(SELECT 1 FROM public.mudancas_partido t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
      WHEN 'patrimonio' THEN EXISTS(SELECT 1 FROM public.patrimonio t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
      WHEN 'financiamento' THEN EXISTS(SELECT 1 FROM public.financiamento t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)
    END
  );
  SELECT sum(n)::integer INTO publicas_fora FROM (
    SELECT count(*) n FROM public.historico_politico t WHERE t.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7') AND t.despublicado_em IS NULL AND NOT EXISTS(SELECT 1 FROM public.identidade_timeline_quarentena_snapshot s WHERE s.migration_version='20260811102100' AND s.tabela='historico_politico' AND s.row_id=t.id) AND t.id <> ALL(ARRAY['863ee379-1fb7-4416-8f25-e38260337eb8','e4d5e5ea-aa99-4ab0-8748-c5bffc942b31','633b3e5b-6e0a-42b8-b120-152349e89f7e','7ac8d8f8-a0ef-410b-8d7a-efa62a1a1a72','2cdb9e2c-fd82-4ff2-9535-c768cf723248','3a7f6d38-d643-45ec-978a-7955d1d59ad8','470def37-f018-4dcc-a917-4ed07e42679b','51341284-613b-4c99-86da-929c7f174e0e','6fb20705-8476-4b0e-a816-551cd347db37','b2f7b24f-d828-43de-bc0d-4071fb86df82','6bfe178b-bd43-4ecd-9312-e5ef07fd7ee9','6b8c42f2-7124-42e4-ae9b-ca4dcaf453f4']::uuid[])
    UNION ALL SELECT count(*) FROM public.mudancas_partido t WHERE t.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7') AND t.despublicado_em IS NULL AND t.id NOT IN ('ae226065-88b2-4b86-b4e6-92e8c5400210','00a4b5e3-7bd7-4824-9aa2-573fe51a06e3','102e508b-6a63-45e2-a889-e1474123ffea','826cab46-0271-40d9-9979-035ff260be54','dc3ae172-4577-4cd8-bb49-dd33a599735a','c3f281e6-f38f-4a79-82f1-1621064c9e9f')
    UNION ALL SELECT count(*) FROM public.patrimonio t WHERE t.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7') AND t.despublicado_em IS NULL AND t.id NOT IN ('33ad044c-71c7-4964-b563-b1f7f31e62da','61a49b91-a0d8-42f6-83c4-545fdd0eb570','75d858a8-4678-45f5-bfd2-631983d67224','6cc29a4b-bb69-4e57-804b-fd6a3e7eb93d')
    UNION ALL SELECT count(*) FROM public.financiamento t WHERE t.candidato_id IN ('a5fa816e-9e3b-40ae-8679-71568bed63da','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7') AND t.despublicado_em IS NULL AND t.id NOT IN ('89c59acc-00ae-446e-9164-a82f01d25224','99d896e5-f18c-471e-8f0e-e023a50ec8bb','c1e117bb-4caa-45f6-ae7b-7dadb5e012ca','e9c1abcb-22af-4ab1-afde-9b317c25391a')
  ) q;
  IF divergentes<>0 OR publicas_fora<>0 THEN RAISE EXCEPTION 'integridade timeline: postimage divergente %, linhas públicas fora do inventário %',divergentes,publicas_fora; END IF;
END $$;
