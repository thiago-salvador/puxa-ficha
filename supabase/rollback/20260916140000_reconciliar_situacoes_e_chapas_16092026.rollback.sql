-- Rollback da 20260916140000 (seis situacoes de candidatos, carlos-jararaca
-- despublicado, tres chapas de RN/SE substituidas).
--
-- Candidatos: restaura a partir da pre-imagem gravada em
-- identidade_timeline_quarentena_snapshot (migration_version =
-- 'issue-340-situacoes-16092026'). Chapas_2026: restaura a partir da
-- pre-imagem gravada em coleta_log (execucao = 'migration:20260916140000',
-- detalhe->'linhas'). Nenhum valor antigo esta hardcoded aqui: repetir os
-- nomes/SQ antigos como literais criaria uma segunda fonte de verdade livre
-- para divergir da que foi realmente gravada.
BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_topo text;
  recibo_forward integer;
  recibo_rollback integer;
  snapshot_count integer;
  linhas_chapas integer;
BEGIN
  SELECT count(*), coalesce(max(version), '')
    INTO ledger_count, ledger_topo
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260916140000';
  IF ledger_count <> 1 OR ledger_topo <> '20260916140000' THEN
    RAISE EXCEPTION 'rollback issue-340: ledger inesperado (count=%, topo=%)', ledger_count, ledger_topo;
  END IF;

  SELECT count(*) INTO recibo_forward
  FROM public.coleta_log WHERE execucao = 'migration:20260916140000' AND detalhe IS NOT NULL;
  IF recibo_forward <> 1 THEN
    RAISE EXCEPTION 'rollback issue-340: recibo de pre-imagem de chapas ausente ou duplicado (%)', recibo_forward;
  END IF;

  SELECT count(*) INTO recibo_rollback
  FROM public.coleta_log WHERE execucao = 'rollback:20260916140000';
  IF recibo_rollback <> 0 THEN
    RAISE EXCEPTION 'rollback issue-340: rollback ja executado';
  END IF;

  SELECT count(*) INTO snapshot_count
  FROM public.identidade_timeline_quarentena_snapshot
  WHERE migration_version = 'issue-340-situacoes-16092026' AND tabela = 'candidatos';
  IF snapshot_count <> 7 THEN
    RAISE EXCEPTION 'rollback issue-340: snapshot de candidatos com % linha(s), esperado 7', snapshot_count;
  END IF;

  SELECT jsonb_array_length(r.detalhe::jsonb -> 'linhas') INTO linhas_chapas
  FROM public.coleta_log r WHERE r.execucao = 'migration:20260916140000';
  IF linhas_chapas <> 3 THEN
    RAISE EXCEPTION 'rollback issue-340: pre-imagem de chapas com % linha(s), esperado 3', linhas_chapas;
  END IF;
END
$precondition$;

-- Candidatos: devolve os campos que o snapshot preservou, so quando o estado
-- atual bate com o POSTIMAGE gravado (senao alguem mexeu na linha depois desta
-- migration e o rollback deve abortar, nao sobrescrever). A comparacao e
-- campo a campo (status, situacao_candidatura, ultima_atualizacao), nao
-- `to_jsonb(c) = s.postimage`: o postimage grava `ultima_atualizacao` como
-- string ISO com sufixo "Z", mas `to_jsonb` de uma coluna timestamptz
-- serializa com offset "+00:00", entao a igualdade de objeto inteiro nunca
-- bateria mesmo sem nenhuma escrita a mais ter acontecido.
-- @write tabela=candidatos ref=rollback:issue-340-situacoes-16092026 campos=situacao_candidatura,ultima_atualizacao,status
UPDATE public.candidatos c
SET status = s.preimage->>'status',
    situacao_candidatura = s.preimage->>'situacao_candidatura',
    ultima_atualizacao = (s.preimage->>'ultima_atualizacao')::timestamptz
FROM public.identidade_timeline_quarentena_snapshot s
WHERE s.migration_version = 'issue-340-situacoes-16092026'
  AND s.tabela = 'candidatos'
  AND s.row_id = c.id
  AND c.status = s.postimage->>'status'
  AND coalesce(c.situacao_candidatura,'') = coalesce(s.postimage->>'situacao_candidatura','')
  AND c.ultima_atualizacao = (s.postimage->>'ultima_atualizacao')::timestamptz;

-- Verificado por COUNT, nao por GET DIAGNOSTICS: um DO block novo nao herda o
-- ROW_COUNT de um UPDATE de nivel superior executado antes dele.
DO $rollback_candidatos_check$
DECLARE
  quantidade integer;
BEGIN
  SELECT count(*) INTO quantidade
  FROM public.identidade_timeline_quarentena_snapshot s
  JOIN public.candidatos c ON c.id = s.row_id
  WHERE s.migration_version = 'issue-340-situacoes-16092026'
    AND s.tabela = 'candidatos'
    AND to_jsonb(c) = s.preimage;
  IF quantidade <> 7 THEN
    RAISE EXCEPTION 'rollback issue-340: restauracao de candidatos esperada=7 atual=%', quantidade;
  END IF;
END
$rollback_candidatos_check$;

-- Chapas_2026: devolve as sete colunas tocadas, uma linha por vez, lidas do
-- JSON da pre-imagem.
-- @write tabela=chapas_2026 chave=2026:RN:carlos-alberto-de-almeida-cavalcante campos=titular_sq_candidato,titular_nome_completo,titular_nome_urna,titular_partido_sigla,titular_candidato_id,fonte_sha256,snapshot_em
UPDATE public.chapas_2026 ch
SET titular_sq_candidato = linha.valor->>'titular_sq_candidato',
    titular_nome_completo = linha.valor->>'titular_nome_completo',
    titular_nome_urna = linha.valor->>'titular_nome_urna',
    titular_partido_sigla = linha.valor->>'titular_partido_sigla',
    titular_candidato_id = (linha.valor->>'titular_candidato_id')::uuid,
    fonte_sha256 = linha.valor->>'fonte_sha256',
    snapshot_em = (linha.valor->>'snapshot_em')::timestamptz
FROM (
  SELECT jsonb_array_elements(r.detalhe::jsonb -> 'linhas') AS valor
  FROM public.coleta_log r WHERE r.execucao = 'migration:20260916140000'
) linha
WHERE ch.chave = linha.valor->>'chave'
  AND ch.chave = '2026:RN:carlos-alberto-de-almeida-cavalcante';

-- @write tabela=chapas_2026 chave=2026:RN:henrique-othon-costa-de-lyra campos=vice_sq_candidato,vice_nome_completo,vice_nome_urna,vice_partido_sigla,fonte_sha256,snapshot_em
UPDATE public.chapas_2026 ch
SET vice_sq_candidato = linha.valor->>'vice_sq_candidato',
    vice_nome_completo = linha.valor->>'vice_nome_completo',
    vice_nome_urna = linha.valor->>'vice_nome_urna',
    vice_partido_sigla = linha.valor->>'vice_partido_sigla',
    fonte_sha256 = linha.valor->>'fonte_sha256',
    snapshot_em = (linha.valor->>'snapshot_em')::timestamptz
FROM (
  SELECT jsonb_array_elements(r.detalhe::jsonb -> 'linhas') AS valor
  FROM public.coleta_log r WHERE r.execucao = 'migration:20260916140000'
) linha
WHERE ch.chave = linha.valor->>'chave'
  AND ch.chave = '2026:RN:henrique-othon-costa-de-lyra';

-- @write tabela=chapas_2026 chave=2026:SE:emanuel-messias-oliveira-cacho campos=vice_sq_candidato,vice_nome_completo,vice_nome_urna,vice_partido_sigla,fonte_sha256,snapshot_em
UPDATE public.chapas_2026 ch
SET vice_sq_candidato = linha.valor->>'vice_sq_candidato',
    vice_nome_completo = linha.valor->>'vice_nome_completo',
    vice_nome_urna = linha.valor->>'vice_nome_urna',
    vice_partido_sigla = linha.valor->>'vice_partido_sigla',
    fonte_sha256 = linha.valor->>'fonte_sha256',
    snapshot_em = (linha.valor->>'snapshot_em')::timestamptz
FROM (
  SELECT jsonb_array_elements(r.detalhe::jsonb -> 'linhas') AS valor
  FROM public.coleta_log r WHERE r.execucao = 'migration:20260916140000'
) linha
WHERE ch.chave = linha.valor->>'chave'
  AND ch.chave = '2026:SE:emanuel-messias-oliveira-cacho';

-- Recibo de rollback, para a precondicao de uma segunda execucao recusar.
-- @write tabela=coleta_log ref=rollback:20260916140000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
SELECT 'rollback-manual','global','candidatos.situacao_candidatura,chapas_2026','encontrado',9,
       'Rollback de 20260916140000: seis situacoes e carlos-jararaca restaurados da quarentena; tres chapas restauradas da pre-imagem em coleta_log.',
       NULL,'rollback:20260916140000','escrita';

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260916140000';

DO $postcondition$
DECLARE
  candidatos_ok integer;
  chapas_ok integer;
  ledger_count integer;
BEGIN
  SELECT count(*) INTO candidatos_ok
  FROM public.identidade_timeline_quarentena_snapshot s
  JOIN public.candidatos c ON c.id = s.row_id
  WHERE s.migration_version = 'issue-340-situacoes-16092026'
    AND s.tabela = 'candidatos'
    AND to_jsonb(c) = s.preimage;
  IF candidatos_ok <> 7 THEN
    RAISE EXCEPTION 'rollback issue-340: pos-condicao de candidatos falhou (%)', candidatos_ok;
  END IF;

  SELECT count(*) INTO chapas_ok
  FROM public.chapas_2026
  WHERE (chave = '2026:RN:carlos-alberto-de-almeida-cavalcante' AND titular_sq_candidato = '200002550223')
     OR (chave = '2026:RN:henrique-othon-costa-de-lyra' AND vice_sq_candidato = '200002553302')
     OR (chave = '2026:SE:emanuel-messias-oliveira-cacho' AND vice_sq_candidato = '260002551711');
  IF chapas_ok <> 3 THEN
    RAISE EXCEPTION 'rollback issue-340: pos-condicao de chapas_2026 falhou (%)', chapas_ok;
  END IF;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations WHERE version = '20260916140000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback issue-340: ledger ainda tem a migration';
  END IF;
END
$postcondition$;

COMMIT;
