-- Admite a ficha de GODEIRO LINHARESS (SQ 200002554482), substituto oficial
-- de Carlos Jararaca ao Governo do RN (issue #340, coorte de titulares
-- substituídos de 20260917000100). A chapa RN Governador já existe (criada
-- por 20260916140000_reconciliar_situacoes_e_chapas_16092026.sql) e já
-- referencia titular_sq_candidato=200002554482 sem candidato_id; esta
-- migration só cria a ficha e o patrimônio, e vincula o candidato_id.
--
-- Re-sequenciada de 20260916160000 (mergeada em #357, nunca aplicada) para
-- depois de 20260917000000 (alarga chapas_2026_fonte_detalhe_check) e
-- 20260917000001 (refresca a chapa do PRTB), que juntas corrigem o
-- incidente de apply da chapa do PRTB. Conteúdo funcional idêntico: não
-- toca a chapa do PRTB nem chapas_2026_fonte_detalhe_check, só a chapa RN
-- (fonte_tipo=legado). O arquivo antigo foi removido de supabase/migrations/
-- nesta mesma PR (migration mergeada é imutável, mesmo nunca aplicada; ver
-- supabase/migrations-pendentes/README.md para a mesma convenção de
-- retomada com timestamp novo).
--
-- Fonte oficial direta e sanitizada: detalhe DivulgaCandContas do próprio
-- SQ, conferido em 2026-09-17T02:27:47.000Z, HTTP 200, sha256
-- 3eb9f33a03ed094192c81525349ea2da75639184114cd41661deb18dda7cbf5e.
-- Campos usados: nomeCompleto, nomeUrna, numero, cpf, partido{sigla,nome},
-- cargo.nome, sgUfNascimento+nomeMunicipioNascimento, dataDeNascimento,
-- descricaoSexo, grauInstrucao, ocupacao, descricaoEstadoCivil,
-- descricaoCorRaca, descricaoSituacao, fotoUrl/fotoUrlPublicavel, bens[],
-- totalDeBens. Nenhum dado de terceiros (imprensa, Wikipedia): biografia
-- limitada ao que o TSE declara, mesmo padrão de siqueira-campos-jr
-- (20260907193100_siqueira_to_publication.sql).
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos, public.chapas_2026, public.patrimonio IN SHARE ROW EXCLUSIVE MODE;
DO $admission$
DECLARE
  before_state jsonb;
  after_state jsonb;
  candidate_source jsonb := '{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/RN/20322002026/candidato/200002554482","checked_at":"2026-09-17T02:27:47.000Z","http_status":200,"payload_raw_sha256":"3eb9f33a03ed094192c81525349ea2da75639184114cd41661deb18dda7cbf5e"}'::jsonb;
  verification jsonb;
  affected integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chapas_2026) THEN
    RAISE NOTICE 'godeiro: coorte ausente; admissão ignorada (replay)';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE id='d45f1947-73a7-4292-9955-7e57927032f0' OR slug='godeiro-linharess' OR sq_candidato_2026='200002554482')
     OR EXISTS (SELECT 1 FROM public.patrimonio WHERE id='7d88a5ae-23ae-42cf-8285-c5499b489dd7' OR sq_candidato='200002554482')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao IN ('migration:20260917000100','migration:20260917000100:patrimonio')) THEN
    RAISE EXCEPTION 'godeiro: colisão de inscrição/patrimônio ou recibo existente';
  END IF;
  -- Preimagem exata da chapa: criada por 20260916140000 apontando para este
  -- SQ, ainda sem candidato_id vinculado.
  IF NOT EXISTS (
    SELECT 1 FROM public.chapas_2026
     WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061'
       AND chave='2026:RN:carlos-alberto-de-almeida-cavalcante'
       AND titular_sq_candidato='200002554482'
       AND titular_candidato_id IS NULL
       AND uf='RN' AND cargo_titular='Governador'
  ) THEN
    RAISE EXCEPTION 'godeiro: preimagem de chapas_2026 divergiu';
  END IF;
  before_state := jsonb_build_object(
    'candidatos',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.candidatos x),
    'patrimonio',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.patrimonio x),
    'chapa_outras',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.chapas_2026 x WHERE id<>'250e9ca4-b101-4ec4-9835-bff18c596061'),
    'chapa_alvo',(SELECT to_jsonb(x) FROM public.chapas_2026 x WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061')
  );
  verification := jsonb_build_object('estado','publicado','verificado_em',candidate_source->>'checked_at',
    'fonte','TSE DivulgaCandContas','fontes_consultadas',jsonb_build_array(candidate_source),
    'escopo','Inscrição 200002554482; dados públicos declarados ao TSE. Fonte direta, sem atribuir campos ao pacote CSV.');
  -- @write tabela=candidatos slug=godeiro-linharess campos=id,slug,nome_completo,nome_urna,partido_sigla,partido_atual,cargo_disputado,estado,sq_candidato_2026,data_nascimento,naturalidade,formacao,profissao_declarada,genero,estado_civil,cor_raca,foto_url,foto_credito,biografia,situacao_candidatura,status,publicavel,fonte_dados,verificacao_campos,ultima_atualizacao,created_at
  INSERT INTO public.candidatos (id,slug,nome_completo,nome_urna,partido_sigla,partido_atual,cargo_disputado,estado,sq_candidato_2026,data_nascimento,naturalidade,formacao,profissao_declarada,genero,estado_civil,cor_raca,foto_url,foto_credito,biografia,situacao_candidatura,status,publicavel,fonte_dados,verificacao_campos,ultima_atualizacao,created_at)
  VALUES ('d45f1947-73a7-4292-9955-7e57927032f0','godeiro-linharess','GLADYER LINHARES GODEIRO','GODEIRO LINHARESS','DC','DEMOCRACIA CRISTÃ','Governador','RN','200002554482','1977-04-25','Mossoró (RN)','Superior completo','Empresário','Masculino','Solteiro(a)','Parda',
    'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/20322002026/200002554482/RN',to_jsonb('Foto oficial de candidatura, TSE DivulgaCandContas'::text),
    'Godeiro Linharess é candidato ao Governo do Rio Grande do Norte pela Democracia Cristã nas eleições de 2026, como substituto oficial de Carlos Jararaca. Declarou ao TSE a ocupação de empresário e escolaridade superior completa.',
    'pendente de julgamento','candidato',true,ARRAY[candidate_source->>'url'],
    jsonb_build_object('candidate_registration',verification,'candidate_complement',verification,'patrimonio',verification),
    (candidate_source->>'checked_at')::timestamptz,(candidate_source->>'checked_at')::timestamptz);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'godeiro: candidato count'; END IF;
  -- @write tabela=patrimonio slug=godeiro-linharess ano=2026 campos=id,candidato_id,ano_eleicao,valor_total,bens,fonte,sq_candidato,uf_candidatura,cargo_candidatura,created_at
  INSERT INTO public.patrimonio (id,candidato_id,ano_eleicao,valor_total,bens,fonte,sq_candidato,uf_candidatura,cargo_candidatura,created_at)
  SELECT '7d88a5ae-23ae-42cf-8285-c5499b489dd7'::uuid, c.id, 2026, 130000::numeric,
    $bens$[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TRIO ELETRICO ESPECIAL SEMI-REBOQUE","valor":30000},{"tipo":"Outras participações societárias","descricao":"PARTICIPACAO DE 100% DO CAPITAL SOCIAL DA EMPRESA YNOVA GESTAO E ADMINISTRACAO PUBLICA LTDA","valor":50000},{"tipo":"Outras participações societárias","descricao":"PARTICIPACAO DE 50% DO CAPITAL SOCIAL DA EMPRESA GRUPO SEED CAPITAL LTDA","valor":25000},{"tipo":"Outras participações societárias","descricao":"PARTICIPACAO DE 50% DO CAPITAL SOCIAL DA EMPRESA CAMP SEED LTDA","valor":25000}]$bens$::jsonb,
    'TSE','200002554482','RN','GOVERNADOR',(candidate_source->>'checked_at')::timestamptz
  FROM public.candidatos c WHERE c.id='d45f1947-73a7-4292-9955-7e57927032f0' AND c.slug='godeiro-linharess' AND c.sq_candidato_2026='200002554482';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'godeiro: patrimônio count'; END IF;
  -- @write tabela=chapas_2026 ref=godeiro-linharess-admissao chave=2026:RN:carlos-alberto-de-almeida-cavalcante campos=titular_candidato_id
  UPDATE public.chapas_2026
  SET titular_candidato_id='d45f1947-73a7-4292-9955-7e57927032f0'
  WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061'
    AND chave='2026:RN:carlos-alberto-de-almeida-cavalcante'
    AND titular_sq_candidato='200002554482'
    AND titular_candidato_id IS NULL;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'godeiro: vínculo de chapas_2026 count'; END IF;
  IF (SELECT to_jsonb(x)-ARRAY['titular_candidato_id'] FROM public.chapas_2026 x WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061')
     IS DISTINCT FROM ((before_state->'chapa_alvo')-ARRAY['titular_candidato_id']) THEN
    RAISE EXCEPTION 'godeiro: coluna não autorizada de chapas_2026 mudou';
  END IF;
  after_state := jsonb_build_object(
    'candidato',(SELECT to_jsonb(x) FROM public.candidatos x WHERE id='d45f1947-73a7-4292-9955-7e57927032f0'),
    'patrimonio',(SELECT to_jsonb(x) FROM public.patrimonio x WHERE id='7d88a5ae-23ae-42cf-8285-c5499b489dd7'),
    'chapa',(SELECT to_jsonb(x) FROM public.chapas_2026 x WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061')
  );
  IF before_state->>'candidatos' IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.candidatos x WHERE id<>'d45f1947-73a7-4292-9955-7e57927032f0')
     OR before_state->>'patrimonio' IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.patrimonio x WHERE id<>'7d88a5ae-23ae-42cf-8285-c5499b489dd7')
     OR before_state->>'chapa_outras' IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.chapas_2026 x WHERE id<>'250e9ca4-b101-4ec4-9835-bff18c596061')
  THEN RAISE EXCEPTION 'godeiro: alguma linha preexistente mudou'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
     WHERE id='d45f1947-73a7-4292-9955-7e57927032f0' AND slug='godeiro-linharess' AND publicavel IS TRUE
       AND situacao_candidatura='pendente de julgamento' AND partido_sigla='DC'
       AND foto_url IS NOT NULL AND biografia IS NOT NULL AND naturalidade IS NOT NULL
       AND data_nascimento IS NOT NULL AND formacao IS NOT NULL AND profissao_declarada IS NOT NULL
       AND genero IS NOT NULL AND estado_civil IS NOT NULL AND cor_raca IS NOT NULL
  ) THEN RAISE EXCEPTION 'godeiro: pós-condição de completude falhou'; END IF;
  -- Recibos atômicos com preimagem por digest e postimagem integral dos criados.
  -- @write tabela=coleta_log ref=migration:20260917000100 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES ('tse','candidato','godeiro-linharess:admissao','d45f1947-73a7-4292-9955-7e57927032f0','encontrado',3,
    jsonb_build_object('before',before_state,'after',after_state,'source',candidate_source)::text,candidate_source->>'url','migration:20260917000100','escrita');
  -- @write tabela=coleta_log ref=migration:20260917000100:patrimonio campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES ('tse','candidato','patrimonio:2026','d45f1947-73a7-4292-9955-7e57927032f0','encontrado',4,
    'Inscrição 200002554482: bens=[4 itens], totalDeBens=130000; fonte direta oficial com SHA256 3eb9f33a03ed094192c81525349ea2da75639184114cd41661deb18dda7cbf5e.',
    candidate_source->>'url','migration:20260917000100:patrimonio','escrita');
END
$admission$;
COMMIT;
