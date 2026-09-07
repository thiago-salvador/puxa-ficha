-- Fonte oficial direta e sanitizada: data/siqueira-to-20260907.json.
-- Adiciona uma inscrição, sua chapa, candidatura histórica 2026 e ausência
-- oficial de bens. Nenhuma linha anterior, inclusive Subtenente, é alterada.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos, public.chapas_2026, public.historico_politico, public.patrimonio_ausencia_oficial IN SHARE ROW EXCLUSIVE MODE;
DO $admission$
DECLARE
  before_state jsonb;
  after_state jsonb;
  candidate_source jsonb := '{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/TO/20322002026/candidato/270002554375","checked_at":"2026-09-07T18:29:39.648Z","http_status":200,"payload_raw_sha256":"4b47d9752f0b97b0d711a4b93da88d1c2f507ce880fb81e87eadc8302ced56cd"}'::jsonb;
  verification jsonb;
  affected integer;
BEGIN
  IF current_setting('pf.replay',true)='true'
     AND NOT EXISTS (SELECT 1 FROM public.candidatos WHERE id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80' OR slug='siqueira-campos-jr' OR sq_candidato_2026='270002554375')
     AND NOT EXISTS (SELECT 1 FROM public.chapas_2026 WHERE id='a2d296dd-dde7-4791-8a00-1a6cf6e9cfe5' OR titular_sq_candidato='270002554375') THEN
    RAISE NOTICE 'siqueira: replay explícito sem coorte; admissão ignorada';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80' OR slug='siqueira-campos-jr' OR sq_candidato_2026='270002554375')
     OR EXISTS (SELECT 1 FROM public.chapas_2026 WHERE id='a2d296dd-dde7-4791-8a00-1a6cf6e9cfe5' OR chave='2026:TO:jose-wilson-siqueira-campos-junior:270002554375' OR titular_sq_candidato='270002554375' OR vice_sq_candidato='270002554376')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao IN ('migration:20260907193100','migration:20260907193100:patrimonio')) THEN
    RAISE EXCEPTION 'siqueira: colisão de inscrição/chapa ou recibo existente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE id='b474c1e4-2782-4434-8663-9e47a22e8b1a' AND slug='subtenente-luiz-carlos' AND sq_candidato_2026='270002546368' AND publicavel=false AND status='removido' AND situacao_candidatura='indeferido') THEN
    RAISE EXCEPTION 'siqueira: inscrição substituída deve permanecer despublicada';
  END IF;
  IF (SELECT count(DISTINCT eleicao_data) FROM public.chapas_2026 WHERE eleicao_codigo='6259')<>1
     OR EXISTS (SELECT 1 FROM public.chapas_2026 WHERE eleicao_codigo='6259' AND eleicao_data<>'2026-10-04'::date) THEN
    RAISE EXCEPTION 'siqueira: calendário eleitoral divergiu';
  END IF;
  before_state := jsonb_build_object(
    'candidatos',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.candidatos x),
    'chapas',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.chapas_2026 x),
    'historico',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.historico_politico x),
    'ausencias',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.patrimonio_ausencia_oficial x)
  );
  verification := jsonb_build_object('estado','publicado','verificado_em',candidate_source->>'checked_at',
    'fonte','TSE DivulgaCandContas','fontes_consultadas',jsonb_build_array(candidate_source),
    'escopo','Inscrição 270002554375; dados públicos declarados ao TSE. Fonte direta, sem atribuir campos ao pacote CSV.');
  -- @write tabela=candidatos slug=siqueira-campos-jr campos=id,slug,nome_completo,nome_urna,partido_sigla,partido_atual,cargo_disputado,estado,sq_candidato_2026,data_nascimento,naturalidade,formacao,profissao_declarada,genero,estado_civil,cor_raca,foto_url,biografia,situacao_candidatura,status,publicavel,fonte_dados,verificacao_campos,ultima_atualizacao,created_at
  INSERT INTO public.candidatos (id,slug,nome_completo,nome_urna,partido_sigla,partido_atual,cargo_disputado,estado,sq_candidato_2026,data_nascimento,naturalidade,formacao,profissao_declarada,genero,estado_civil,cor_raca,foto_url,biografia,situacao_candidatura,status,publicavel,fonte_dados,verificacao_campos,ultima_atualizacao,created_at)
  VALUES ('1d5c69c3-4a4e-4f8f-9796-aa2248775e80','siqueira-campos-jr','JOSÉ WILSON SIQUEIRA CAMPOS JÚNIOR','SIQUEIRA CAMPOS JR','DEMOCRATA','DEMOCRATA','Governador','TO','270002554375','1956-12-19','Campinas (SP)','Ensino Médio completo','Empresário','Masculino','Divorciado(a)','Branca',
    'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/20322002026/270002554375/TO',
    'José Wilson Siqueira Campos Júnior, conhecido nas urnas como Siqueira Campos Jr, consta no TSE como candidato ao Governo do Tocantins pelo DEMOCRATA em 2026, aguardando julgamento. Declarou ocupação de empresário e ensino médio completo.',
    'aguardando julgamento','candidato',true,ARRAY[candidate_source->>'url'],
    jsonb_build_object('candidate_registration',verification,'candidate_complement',verification),
    '2026-09-07T18:35:27.213Z','2026-09-07T18:35:27.213Z');
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'siqueira: candidato count'; END IF;
  -- @write tabela=chapas_2026 ref=siqueira-to-publication chave="2026:TO:jose-wilson-siqueira-campos-junior:270002554375" campos=id,chave,eleicao_codigo,eleicao_data,uf,cargo_titular,sq_coligacao,identidade_status,vinculo_titular_status,tse_situacao_codigo,tse_situacao_titular_codigo,tse_situacao_vice_codigo,tipo_agremiacao,composicao,titular_candidato_id,vice_candidato_id,titular_sq_candidato,vice_sq_candidato,titular_nome_completo,titular_nome_urna,titular_partido_sigla,vice_nome_completo,vice_nome_urna,vice_partido_sigla,alternativas_oficiais,fonte_url,fonte_sha256,snapshot_em,created_at,fonte_tipo,fonte_detalhe
  INSERT INTO public.chapas_2026 (id,chave,eleicao_codigo,eleicao_data,uf,cargo_titular,sq_coligacao,identidade_status,vinculo_titular_status,tse_situacao_codigo,tse_situacao_titular_codigo,tse_situacao_vice_codigo,tipo_agremiacao,composicao,titular_candidato_id,vice_candidato_id,titular_sq_candidato,vice_sq_candidato,titular_nome_completo,titular_nome_urna,titular_partido_sigla,vice_nome_completo,vice_nome_urna,vice_partido_sigla,alternativas_oficiais,fonte_url,fonte_sha256,snapshot_em,created_at,fonte_tipo,fonte_detalhe)
  VALUES ('a2d296dd-dde7-4791-8a00-1a6cf6e9cfe5','2026:TO:jose-wilson-siqueira-campos-junior:270002554375','6259','2026-10-04','TO','Governador',NULL,'confirmada','novo_perfil_oficial','Aguardando julgamento',NULL,NULL,'PARTIDO ISOLADO','DEMOCRATA','1d5c69c3-4a4e-4f8f-9796-aa2248775e80',NULL,'270002554375','270002554376','JOSÉ WILSON SIQUEIRA CAMPOS JÚNIOR','SIQUEIRA CAMPOS JR','DEMOCRATA','OSMAR GOMES DE LIMA','CAPITÃO OSMAR','DEMOCRATA','[]'::jsonb,candidate_source->>'url',candidate_source->>'payload_raw_sha256','2026-09-07T18:29:39.648Z','2026-09-07T18:35:27.213Z','divulgacand_detalhe',
    '{"titular":{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/TO/20322002026/candidato/270002554375","sha256":"4b47d9752f0b97b0d711a4b93da88d1c2f507ce880fb81e87eadc8302ced56cd","checked_at":"2026-09-07T18:29:39.648Z","http_status":200,"sq_candidato":"270002554375","nome_completo":"JOSÉ WILSON SIQUEIRA CAMPOS JÚNIOR","nome_urna":"SIQUEIRA CAMPOS JR","partido_sigla":"DEMOCRATA","cargo":"Governador","uf":"TO","descricao_situacao":"Aguardando julgamento","is_candidato_inapto":false,"substituido":false,"vice_vigente_sq":"270002554376","contagem_vices_vigentes":1},"vice":{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/TO/20322002026/candidato/270002554376","sha256":"cc8df3179916f1ab0556a5188995eff1ff6c2ba5167c5dcaa92f4292fcf4df4f","checked_at":"2026-09-07T18:35:27.213Z","http_status":200,"sq_candidato":"270002554376","nome_completo":"OSMAR GOMES DE LIMA","nome_urna":"CAPITÃO OSMAR","partido_sigla":"DEMOCRATA","cargo":"Vice-governador","uf":"TO","descricao_situacao":"Aguardando julgamento","is_candidato_inapto":false,"substituido":false}}'::jsonb);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'siqueira: chapa count'; END IF;
  -- @write tabela=historico_politico slug=siqueira-campos-jr campos=id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,observacoes,proveniencia,created_at
  INSERT INTO public.historico_politico (id,candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado,observacoes,proveniencia,created_at)
  SELECT '6db89cf8-3e4f-4141-ac0b-de1b5a4bd32a'::uuid,c.id,'Governador',2026,2026,'DEMOCRATA','TO',
    'Candidatura ao Governo do Tocantins em 2026. TSE: aguardando julgamento, concorrendo; registro de candidatura, sem mandato ou resultado eleitoral atribuído. Fonte: https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/TO/20322002026/candidato/270002554375',
    'tse','2026-09-07T18:35:27.213Z'::timestamptz
  FROM public.candidatos c WHERE c.id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80' AND c.slug='siqueira-campos-jr' AND c.sq_candidato_2026='270002554375';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'siqueira: histórico count'; END IF;
  -- @write tabela=patrimonio_ausencia_oficial slug=siqueira-campos-jr campos=id,candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao,created_at
  INSERT INTO public.patrimonio_ausencia_oficial (id,candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao,created_at)
  SELECT '7c5c3d27-acee-4efd-be9f-036a16a3c460'::uuid,c.id,2026,'270002554375',candidate_source->>'url','2026-09-07T18:29:39.648Z'::timestamptz,
    'Detalhe oficial TSE da inscrição 270002554375 retornou bens=[], totalDeBens=0 e st_DIVULGA_BENS=true. SHA256 4b47d9752f0b97b0d711a4b93da88d1c2f507ce880fb81e87eadc8302ced56cd. Ausência confirmada neste detalhe; nenhuma linha fictícia de valor zero.',
    'migration:20260907193100','2026-09-07T18:35:27.213Z'::timestamptz
  FROM public.candidatos c WHERE c.id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80' AND c.slug='siqueira-campos-jr' AND c.sq_candidato_2026='270002554375';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'siqueira: ausência patrimônio count'; END IF;
  after_state := jsonb_build_object(
    'candidato',(SELECT to_jsonb(x) FROM public.candidatos x WHERE id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80'),
    'chapa',(SELECT to_jsonb(x) FROM public.chapas_2026 x WHERE id='a2d296dd-dde7-4791-8a00-1a6cf6e9cfe5'),
    'historico',(SELECT to_jsonb(x) FROM public.historico_politico x WHERE id='6db89cf8-3e4f-4141-ac0b-de1b5a4bd32a'),
    'ausencia',(SELECT to_jsonb(x) FROM public.patrimonio_ausencia_oficial x WHERE id='7c5c3d27-acee-4efd-be9f-036a16a3c460')
  );
  IF before_state IS DISTINCT FROM jsonb_build_object(
    'candidatos',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.candidatos x WHERE id<>'1d5c69c3-4a4e-4f8f-9796-aa2248775e80'),
    'chapas',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.chapas_2026 x WHERE id<>'a2d296dd-dde7-4791-8a00-1a6cf6e9cfe5'),
    'historico',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.historico_politico x WHERE id<>'6db89cf8-3e4f-4141-ac0b-de1b5a4bd32a'),
    'ausencias',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.patrimonio_ausencia_oficial x WHERE id<>'7c5c3d27-acee-4efd-be9f-036a16a3c460')
  ) THEN RAISE EXCEPTION 'siqueira: alguma linha preexistente mudou'; END IF;
  -- Recibos atômicos com preimagem por digest e postimagem integral dos criados.
  -- @write tabela=coleta_log ref=migration:20260907193100 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES ('tse','candidato','siqueira-campos-jr:admissao','1d5c69c3-4a4e-4f8f-9796-aa2248775e80','encontrado',4,
    jsonb_build_object('before',before_state,'after',after_state,'source',candidate_source,'run','34152174008')::text,candidate_source->>'url','migration:20260907193100','escrita');
  -- @write tabela=coleta_log ref=migration:20260907193100:patrimonio campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES ('tse','candidato','patrimonio:2026','1d5c69c3-4a4e-4f8f-9796-aa2248775e80','vazio_confirmado',0,
    'Inscrição 270002554375: bens=[], totalDeBens=0, st_DIVULGA_BENS=true; fonte direta oficial com SHA256 4b47d9752f0b97b0d711a4b93da88d1c2f507ce880fb81e87eadc8302ced56cd.',
    candidate_source->>'url','migration:20260907193100:patrimonio','escrita');
END
$admission$;
COMMIT;
