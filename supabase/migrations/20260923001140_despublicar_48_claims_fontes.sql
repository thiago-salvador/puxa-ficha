-- Despublica somente as 48 claims com defeito de fonte no run 35798572764
-- (22/09/2026): 22 com fonte morta confirmada, 25 sem caminho e 1 sem substancia.
-- Os 32 casos apenas indisponiveis ficam fora. IDs da lista: MD5
-- 096f425b8979b5eb9bc9fd01bca13a71 (string_agg ordenado dos UUIDs).
-- A preimagem completa foi medida em producao. Drift ou ficha agora publica
-- abortam a transacao. Snapshot completo permite readback e rollback CAS.

BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.pontos_atencao IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_hide_48 (
  id uuid PRIMARY KEY,
  preimage_hash text NOT NULL,
  motivo text NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_hide_48 (id, preimage_hash, motivo) VALUES
  ('020f3f6f-50d6-42ed-b9f6-182e81c946e5'::uuid, '310b36f1f06d5d5658c9f305cce7c1a1', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('063f63f8-0fbe-4028-8e39-94834148ac6d'::uuid, '6f1adf1d27fec4f9620deea1c652584c', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('06d6d52d-902d-4ed4-aa2c-0f3a6d6b80a2'::uuid, '4d295f5261a438f2b8dae35605bf5dce', 'Link-check 22/09/2026 (run 35798572764): Fonte sem caminho especifico; a URL e apenas a raiz do TSE e nao sustenta a claim.'),
  ('09f569a7-9dd8-41ad-80ea-31bda9bd047b'::uuid, '0cd106103eba62055a848fa1a8ab374c', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('0a34adaa-8f1f-4832-95b0-1440d96b9233'::uuid, 'c4fb97e22ca11de440ec826a55f4627b', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('0b67b436-4d8e-45c3-a4fa-b4bd0c48a7eb'::uuid, '5f3a9a84f5124e910fc1f216db26f9e5', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('0be9f284-06e3-444d-b745-18f9ee2bb2bb'::uuid, 'd43af488ddcb879839b9bff838b41bcc', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('1e6ee577-bfef-4bfb-aead-a1520b6b5c2b'::uuid, '1fd8194259feb4a503046a999ff46a26', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('223e5e9b-65cc-4e40-a891-cfdf8ec6f1a0'::uuid, '0554556e1249ff424b1a9d97b0109e11', 'Link-check 22/09/2026 (run 35798572764): Fonte sem caminho especifico; a URL e apenas a raiz do TSE e nao sustenta a claim.'),
  ('291cf694-8e8b-453e-a53a-69134f62e400'::uuid, '6e951c69ac6d388bd04d1222bc56d3f0', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('30709a00-5b06-469b-8b3a-4050ba677381'::uuid, 'fd21e11ea1201bf1798067c889d96083', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('355dd31a-37e1-4cd3-8d68-a4d4b6ae8a56'::uuid, '5f212aab099e628d6e98e06934ad7498', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('35f3d298-c61b-43e9-b64a-abda40524840'::uuid, '75078b551f21c5e88a04b0f7ecccf787', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('3f10f40b-97ba-4bd1-aea1-f0b62033473f'::uuid, '34a2f94208c5d0007d240c062638d5c6', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('4131d869-ec15-4585-904c-08e26f4ed8f9'::uuid, '3eef4268b27086fd1e367974db09d948', 'Link-check 22/09/2026 (run 35798572764): Fonte sem caminho especifico; a URL e apenas a raiz do TSE e nao sustenta a claim.'),
  ('4ac7cf88-4db1-4985-ba34-6e90b3247917'::uuid, '61262fd31674d7b1a88578a4f1602b59', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('4ccf2e70-b7e8-4414-a924-225e3bc9fdf8'::uuid, '945a4ec8b01c76f74fdc3fffbd8de573', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('4dbb88ba-ce2d-4676-92e7-6354076dc3a4'::uuid, '7dbd7930841fc9a34bfa94e862bfed56', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('4e0989cc-2df4-4eb5-a250-2f4d9a1c6357'::uuid, '95c172db0bde895a284019307caf5299', 'Link-check 22/09/2026 (run 35798572764): Fonte sem caminho especifico; a URL e apenas a raiz do TSE e nao sustenta a claim.'),
  ('4e2f13a0-47f4-42c0-8c51-4db0fe6eb4a1'::uuid, 'c2b4a13faea1895c5043b9bc48bd6171', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('4ea818c4-865d-4503-bd53-d50ef9e704a1'::uuid, '24b1eebf6924fb0e3bf9c7a1689cebc8', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; a URL e apenas a raiz do TSE e nao sustenta a claim.'),
  ('58814104-24d8-4b70-bf83-1d2271316047'::uuid, '550c1afd7e3d16ae6dfbec9a529afc9b', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('5a9d9a65-b498-49bf-bd33-6e2c62ba8455'::uuid, '8b882138ddbdaa47db2f7912e5801400', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('647c916d-69b0-4152-ac90-b661852c8e04'::uuid, '810c4669bf67f7287adf503314e03e17', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('67942ea6-c21a-4c89-9876-9790c1de5e6e'::uuid, 'ec5b3a35436918cfdddd5068e5ebc323', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('78c804d9-df99-42d2-9978-f980b00b6f9f'::uuid, '480c109f737991fac601d0b39db95e75', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('89eb2561-8911-4329-9be2-1064b4a8c75b'::uuid, 'ff582b02bb8a5a201b9979065d07b89e', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('8caca319-a3d2-4aef-867e-b242009d3c27'::uuid, '683f0d2975f44a6141f270b3751eb4b9', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('8fb90ea8-d380-4311-8e73-dbf59cc68f98'::uuid, '767f48a709c2fce4187ed573ab32b3ba', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('9315c3e4-a72c-4404-a095-0e70f0981292'::uuid, '74b631d7db79f9a13281b109667175c4', 'Link-check 22/09/2026 (run 35798572764): Fonte sem caminho especifico; a URL e apenas a raiz do TSE e nao sustenta a claim.'),
  ('9ecc1bc4-7ecf-40c9-8179-4ff7d881f0c7'::uuid, 'db2fd1ec915ba9bcbc555813f1b7b3e9', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('9faa0f83-4a65-4905-9a1b-b418f6320b3e'::uuid, '964ce525da0f93e7df2de324e75b124a', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('a1b3850e-6fb7-4652-8438-4ca7155a76da'::uuid, '0a544c6a00c5717ca0e51e09b7ff78c3', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; a URL e apenas a raiz do G1 e nao sustenta a claim.'),
  ('a35ef613-e165-40d8-98b2-2d55c10b88f3'::uuid, 'a849a4ee2754c23949015fcfc22605d6', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; a URL e apenas a raiz do Datafolha e nao sustenta a claim.'),
  ('a3bec2b9-6588-4451-822f-69e1ebaca28b'::uuid, '99808144192952e1620c300ea4a4bd61', 'Link-check 22/09/2026 (run 35798572764): Fonte sem caminho especifico; a URL e apenas a raiz do TSE e nao sustenta a claim.'),
  ('a7ea5cc8-92aa-4cbb-b46d-0f68cebfc2b5'::uuid, '63bf9ea8c1c3956e100079976605faea', 'Link-check 22/09/2026 (run 35798572764): Fonte sem caminho especifico; a URL e apenas a raiz do TSE e nao sustenta a claim.'),
  ('b0f094ce-981c-4e9b-81bf-33bd057b076a'::uuid, '35e5f121a872afc6cf34c8a27d86537a', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('c52ef3ae-c90b-4c83-b286-8d55e8cc8793'::uuid, '5e136c30045c26bc077fb1edc4c78bd2', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('d1e99ff7-5859-4f0e-8e48-1fb634e70522'::uuid, 'd4afa078504b61373466a9f5bbcec72b', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('d459b445-d1e0-44f9-8b8d-1ea52c11dc3b'::uuid, '44cdf8888e5c75dece0b97f74e075e7b', 'Link-check 22/09/2026 (run 35798572764): Fonte sem caminho especifico; a URL e apenas a raiz do TSE e nao sustenta a claim.'),
  ('d470ed69-3778-4a78-95c8-ddedbbc69333'::uuid, '8538c1ad38e43b9dde58e7b465496357', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('df1ea0bc-afc2-407f-8db0-c031841d438e'::uuid, 'a130d157ea0d3658bb4eaec01c6dcca3', 'Link-check 22/09/2026 (run 35798572764): Fonte sem substancia: a pagina acessivel nao apresenta conteudo verificavel para a claim.'),
  ('df20fe00-e14c-4e9c-9d8c-66cff2e8ee20'::uuid, '986ddcea97cb32ee9ee5cbf7780a35c1', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('e1aa7708-22e5-465b-b3a6-253303b443d2'::uuid, '867eed50827f9c3d4d9daff2039f41db', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; as URLs sao apenas raizes de dominio e nao sustentam a claim.'),
  ('e986b7c1-13e2-47bc-a0eb-55ef4246a963'::uuid, 'b31b2de5244df9f3c545e2c8c5d5c107', 'Link-check 22/09/2026 (run 35798572764): Fonte sem caminho especifico; a URL e apenas a raiz do TSE e nao sustenta a claim.'),
  ('f25ad23f-1d7a-43dc-ba6a-c764ba8d0a2a'::uuid, 'c9f648aea02313ed94527beffed264ed', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('f2fa7b99-035c-4f49-a142-58031226057b'::uuid, 'a1c6b69946fed59b07c3928d263c9f35', 'Link-check 22/09/2026 (run 35798572764): Fonte morta confirmada pelo link-check; a claim nao possui fonte recuperavel.'),
  ('fed9d96e-873d-4024-be96-65b699db2079'::uuid, 'f0aada1ca01c584dae81c40e5868cb82', 'Link-check 22/09/2026 (run 35798572764): Fontes sem caminho especifico; a URL e apenas a raiz de dominio e nao sustenta a claim.');

DO $apply$
DECLARE
  target_count integer;
  present_count integer;
  public_count integer;
  ready_count integer;
  snapshot_count integer;
  snapshot_match_count integer;
  written_count integer;
  final_count integer;
BEGIN
  SELECT count(*) INTO target_count FROM _pf_hide_48;
  IF target_count <> 48 THEN
    RAISE EXCEPTION 'hide-48: alvos esperados=48, atuais=%', target_count;
  END IF;

  SELECT count(*) INTO present_count
  FROM _pf_hide_48 t JOIN public.pontos_atencao p ON p.id=t.id;
  -- O replay linear usa um banco sintetico sem esta coorte. So nesse ambiente
  -- descartavel, ausencia TOTAL e no-op; ausencia parcial sempre falha.
  IF present_count = 0 AND current_setting('pf.replay', true) = 'true' THEN
    RETURN;
  END IF;
  IF present_count <> 48 THEN
    RAISE EXCEPTION 'hide-48: linhas esperadas=48, atuais=%', present_count;
  END IF;

  SELECT count(*) INTO public_count
  FROM _pf_hide_48 t
  JOIN public.pontos_atencao p ON p.id=t.id
  JOIN public.candidatos_publico c ON c.id=p.candidato_id;
  IF public_count <> 0 THEN
    RAISE EXCEPTION 'hide-48: % alvos entraram em ficha publica; reavaliar', public_count;
  END IF;

  SELECT count(*) INTO snapshot_count
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260923001140' AND s.tabela='pontos_atencao';

  IF snapshot_count = 0 THEN
    SELECT count(*) INTO ready_count
    FROM _pf_hide_48 t JOIN public.pontos_atencao p ON p.id=t.id
    WHERE p.visivel IS TRUE
      AND p.despublicado_em IS NULL
      AND p.despublicacao_motivo IS NULL
      AND md5(to_jsonb(p)::text)=t.preimage_hash;
    IF ready_count <> 48 THEN
      RAISE EXCEPTION 'hide-48: CAS/preimagem divergente; prontos=%', ready_count;
    END IF;

    -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260923001140 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
    INSERT INTO public.identidade_timeline_quarentena_snapshot
      (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
    SELECT '20260923001140','pontos_atencao',p.id,p.candidato_id,to_jsonb(p),
           to_jsonb(p) || jsonb_build_object(
             'visivel',false,
             'despublicacao_motivo',t.motivo,
             'despublicado_em',now()
           ),
           now()
    FROM _pf_hide_48 t JOIN public.pontos_atencao p ON p.id=t.id;
    GET DIAGNOSTICS written_count=ROW_COUNT;
    IF written_count <> 48 THEN
      RAISE EXCEPTION 'hide-48: snapshots gravados=%, esperado=48', written_count;
    END IF;

    -- @write tabela=pontos_atencao ref=20260923001140 campos=visivel,despublicacao_motivo,despublicado_em
    UPDATE public.pontos_atencao p
    SET visivel=false,
        despublicacao_motivo=s.postimage->>'despublicacao_motivo',
        despublicado_em=(s.postimage->>'despublicado_em')::timestamptz
    FROM public.identidade_timeline_quarentena_snapshot s
    WHERE s.migration_version='20260923001140'
      AND s.tabela='pontos_atencao'
      AND s.row_id=p.id
      AND to_jsonb(p)=s.preimage;
    GET DIAGNOSTICS written_count=ROW_COUNT;
    IF written_count <> 48 THEN
      RAISE EXCEPTION 'hide-48: despublicadas=%, esperado=48', written_count;
    END IF;

  ELSIF snapshot_count = 48 THEN
    SELECT count(*) INTO snapshot_match_count
    FROM _pf_hide_48 t
    JOIN public.identidade_timeline_quarentena_snapshot s ON s.row_id=t.id
    WHERE s.migration_version='20260923001140'
      AND s.tabela='pontos_atencao'
      AND md5(s.preimage::text)=t.preimage_hash;
    IF snapshot_match_count <> 48 THEN
      RAISE EXCEPTION 'hide-48: snapshots nao correspondem aos 48 alvos';
    END IF;
  ELSE
    RAISE EXCEPTION 'hide-48: snapshot parcial: %', snapshot_count;
  END IF;

  SELECT count(*) INTO final_count
  FROM _pf_hide_48 t
  JOIN public.identidade_timeline_quarentena_snapshot s ON s.row_id=t.id
  JOIN public.pontos_atencao p ON p.id=t.id
  WHERE s.migration_version='20260923001140'
    AND s.tabela='pontos_atencao'
    AND to_jsonb(p)=s.postimage
    AND p.visivel IS FALSE
    AND p.despublicado_em IS NOT NULL
    AND p.despublicacao_motivo=t.motivo;
  IF final_count <> 48 THEN
    RAISE EXCEPTION 'hide-48: pos-condicao falhou, finais=%', final_count;
  END IF;
END
$apply$;

COMMIT;
