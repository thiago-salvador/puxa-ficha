-- Issue #289: dados confirmados no DivulgaCandContas em 2026-09-09.
-- Execução manual autorizada; não é migration de schema.
-- Escopo: nome de urna da vice de RO e inscrição canônica de Laudicério.
-- Preserva preimage/postimage para reversão, recusa qualquer drift.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL TIME ZONE 'UTC';
DO $apply$
DECLARE n integer;
BEGIN
PERFORM id FROM public.candidatos WHERE id='9f4c6003-20a5-486e-9c7a-90d48d4cdcd0' FOR UPDATE;
PERFORM id FROM public.chapas_2026 WHERE id='b73063da-a24e-4755-8879-55f77ba8a8e7' FOR UPDATE;
IF NOT EXISTS (SELECT 1 FROM public.candidatos c WHERE c.id='9f4c6003-20a5-486e-9c7a-90d48d4cdcd0'
AND c.slug='laudicerio-aguiar' AND c.sq_candidato_2026='110002553937'
AND md5(to_jsonb(c)::text)='d5018208b4c61cb60c7daadece02e761')
THEN RAISE EXCEPTION 'issue289: preimage Laudicério divergiu'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.chapas_2026 ch WHERE ch.id='b73063da-a24e-4755-8879-55f77ba8a8e7'
AND ch.vice_sq_candidato='220002551252' AND ch.uf='RO' AND ch.vice_nome_urna='MAURO PEREIRA'
AND md5(to_jsonb(ch)::text)='1802674c1046c0b1be68142731b068b6')
THEN RAISE EXCEPTION 'issue289: preimage vice RO divergiu'; END IF;
IF (SELECT count(*) FROM public.chapas_2026 WHERE titular_candidato_id='9f4c6003-20a5-486e-9c7a-90d48d4cdcd0'
AND titular_sq_candidato IN ('110002553937','110002554073'))<>2 THEN
RAISE EXCEPTION 'issue289: inscrições históricas Laudicério divergiram'; END IF;
INSERT INTO public.identidade_timeline_quarentena_snapshot(migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT 'freshness-issue-289-tse-20260909','candidatos',c.id,c.id,to_jsonb(c),
to_jsonb(c)||jsonb_build_object('sq_candidato_2026','110002554073',
'verificacao_campos',jsonb_set(coalesce(c.verificacao_campos,'{}'::jsonb),'{candidate_registration}',
coalesce(c.verificacao_campos->'candidate_registration','{}'::jsonb)||jsonb_build_object(
'fonte','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073',
'estado','publicado','situacao','aguardando julgamento','sq_candidato','110002554073',
'inscricao_historica','110002553937','situacao_inscricao_historica','Indeferido',
'identidade_conferida','nome completo, CPF e data de nascimento coincidem entre as duas inscrições',
'verificado_em',now(),'execucao','freshness-issue-289-tse-20260909'),true),
'ultima_atualizacao',now()),now()
FROM public.candidatos c WHERE c.id='9f4c6003-20a5-486e-9c7a-90d48d4cdcd0';
INSERT INTO public.identidade_timeline_quarentena_snapshot(migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
SELECT 'freshness-issue-289-tse-20260909','chapas_2026',ch.id,ch.titular_candidato_id,to_jsonb(ch),
to_jsonb(ch)||jsonb_build_object('vice_nome_urna','MAURO SANTOS'),now()
FROM public.chapas_2026 ch WHERE ch.id='b73063da-a24e-4755-8879-55f77ba8a8e7';
UPDATE public.candidatos c SET sq_candidato_2026=s.postimage->>'sq_candidato_2026',
verificacao_campos=s.postimage->'verificacao_campos',ultima_atualizacao=(s.postimage->>'ultima_atualizacao')::timestamptz
FROM public.identidade_timeline_quarentena_snapshot s WHERE s.migration_version='freshness-issue-289-tse-20260909'
AND s.tabela='candidatos' AND s.row_id=c.id AND to_jsonb(c)=s.preimage;
GET DIAGNOSTICS n=ROW_COUNT;
IF n<>1 THEN RAISE EXCEPTION 'issue289: candidato esperado1, atual%',n; END IF;
UPDATE public.chapas_2026 ch SET vice_nome_urna=s.postimage->>'vice_nome_urna'
FROM public.identidade_timeline_quarentena_snapshot s WHERE s.migration_version='freshness-issue-289-tse-20260909'
AND s.tabela='chapas_2026' AND s.row_id=ch.id AND to_jsonb(ch)=s.preimage;
GET DIAGNOSTICS n=ROW_COUNT;
IF n<>1 THEN RAISE EXCEPTION 'issue289: chapa esperada1, atual%',n; END IF;
IF NOT EXISTS (SELECT 1 FROM candidatos c JOIN identidade_timeline_quarentena_snapshot s ON s.row_id=c.id
WHERE s.migration_version='freshness-issue-289-tse-20260909' AND s.tabela='candidatos' AND to_jsonb(c)=s.postimage)
OR NOT EXISTS (SELECT 1 FROM chapas_2026 ch JOIN identidade_timeline_quarentena_snapshot s ON s.row_id=ch.id
WHERE s.migration_version='freshness-issue-289-tse-20260909' AND s.tabela='chapas_2026' AND to_jsonb(ch)=s.postimage)
THEN RAISE EXCEPTION 'issue289: postimage divergiu'; END IF;
INSERT INTO public.coleta_log(fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
VALUES
('tse-divulgacand-2026','candidato','laudicerio-aguiar','9f4c6003-20a5-486e-9c7a-90d48d4cdcd0','encontrado',1,
'Inscrição canônica aprovada 110002554073: Aguardando julgamento. 110002553937: Indeferido, preservada na chapa histórica. Identidade conferida entre ambas.',
'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073','freshness-issue-289-tse-20260909','escrita'),
('tse-divulgacand-2026','candidato','chapas_2026.vice_nome_urna','d4aa4311-0b4a-4adc-a338-b01e8118d6a9','encontrado',1,
'Mesmo SQ220002551252 e nome civil MAURO PEREIRA DOS SANTOS. Nome de urna atualizado para MAURO SANTOS, sem substituição de pessoa.',
'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/RO/20322002026/candidato/220002551252','freshness-issue-289-tse-20260909','escrita');
END $apply$;
COMMIT;

