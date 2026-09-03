-- Readback forward da 20260903140000.
--
-- Roda sozinho, depois do COMMIT, e por isso nao pode depender de nenhuma
-- tabela temporaria da migration. O "antes" que ele compara e o que a propria
-- migration gravou no recibo de pre-imagem (`outras_count` e `outras_digest`
-- em `detalhe`); o "depois" ele recomputa aqui.
DO $readback$
DECLARE
  ledger_topo text;
  ledger_count integer;
  alvo_sq text;
  alvo_nome_urna text;
  alvo_nome_completo text;
  alvo_partido text;
  alvo_situacao text;
  alvo_ficha uuid;
  alvo_sha text;
  alvo_snapshot timestamptz;
  alvo_titular text;
  alvo_alternativas jsonb;
  antigos integer;
  recibo integer;
  volume_recibo integer;
  preimagem_sq text;
  antes_count bigint;
  antes_digest text;
  agora_count bigint;
  agora_digest text;
BEGIN
  SELECT coalesce(max(version), ''), count(*) FILTER (WHERE version = '20260903140000')
    INTO ledger_topo, ledger_count
  FROM supabase_migrations.schema_migrations;
  IF ledger_count <> 1 OR ledger_topo <> '20260903140000' THEN
    RAISE EXCEPTION 'readback chapas ma vice: ledger sem a versao no topo (topo=%, count=%)', ledger_topo, ledger_count;
  END IF;

  SELECT count(*) INTO recibo
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903140000' AND detalhe IS NOT NULL;
  IF recibo <> 1 THEN
    RAISE EXCEPTION 'readback chapas ma vice: recibo de pre-imagem ausente ou duplicado (%)', recibo;
  END IF;

  SELECT volume INTO volume_recibo
  FROM public.coleta_log WHERE execucao = 'migration:20260903140000';
  IF volume_recibo <> 1 THEN
    RAISE EXCEPTION 'readback chapas ma vice: recibo com volume %, esperado 1', volume_recibo;
  END IF;

  -- A trilha do vice substituido vive no recibo, e so nele: depois do UPDATE
  -- BARTOLOMEU nao esta em nenhuma linha de chapas_2026. Se o recibo perder a
  -- pre-imagem, o rollback fica sem fonte e a trilha some.
  SELECT r.detalhe::jsonb -> 'linhas' -> 0 ->> 'vice_sq_candidato' INTO preimagem_sq
  FROM public.coleta_log r WHERE r.execucao = 'migration:20260903140000';
  IF preimagem_sq IS DISTINCT FROM '100002544074' THEN
    RAISE EXCEPTION 'readback chapas ma vice: pre-imagem sem o vice antigo (%)', coalesce(preimagem_sq, '(ausente)');
  END IF;

  SELECT vice_sq_candidato, vice_nome_urna, vice_nome_completo, vice_partido_sigla,
         tse_situacao_vice_codigo, vice_candidato_id, fonte_sha256, snapshot_em,
         titular_sq_candidato || '|' || titular_nome_completo || '|' ||
           titular_nome_urna || '|' || titular_partido_sigla || '|' ||
           tse_situacao_titular_codigo,
         alternativas_oficiais
    INTO alvo_sq, alvo_nome_urna, alvo_nome_completo, alvo_partido,
         alvo_situacao, alvo_ficha, alvo_sha, alvo_snapshot,
         alvo_titular, alvo_alternativas
  FROM public.chapas_2026
  WHERE chave = '2026:MA:reginaldo-lima-brauno';

  IF alvo_sq IS DISTINCT FROM '100002554354' THEN
    RAISE EXCEPTION 'readback chapas ma vice: vice_sq_candidato = %', coalesce(alvo_sq, '(linha ausente)');
  END IF;
  IF alvo_nome_urna IS DISTINCT FROM 'GATO FELIX' THEN
    RAISE EXCEPTION 'readback chapas ma vice: vice_nome_urna = %', alvo_nome_urna;
  END IF;
  IF alvo_nome_completo IS DISTINCT FROM 'FELIX LIMA E SILVA' THEN
    RAISE EXCEPTION 'readback chapas ma vice: vice_nome_completo = %', alvo_nome_completo;
  END IF;
  IF alvo_partido IS DISTINCT FROM 'PCB' THEN
    RAISE EXCEPTION 'readback chapas ma vice: vice_partido_sigla = %', alvo_partido;
  END IF;
  IF alvo_situacao IS DISTINCT FROM '-3' THEN
    RAISE EXCEPTION 'readback chapas ma vice: tse_situacao_vice_codigo = %', alvo_situacao;
  END IF;
  -- Vice de chapa estadual nao tem ficha publica neste catalogo. O readback
  -- cobra isso em voz alta para que uma versao futura da migration nao vincule
  -- um perfil sem que ninguem note.
  IF alvo_ficha IS NOT NULL THEN
    RAISE EXCEPTION 'readback chapas ma vice: vice_candidato_id deixou de ser NULL (%)', alvo_ficha;
  END IF;
  IF alvo_sha IS DISTINCT FROM 'b1b2613e246b85b7c3e002c3625232aac6abf5994a3639f1c834d6fda39b9217' THEN
    RAISE EXCEPTION 'readback chapas ma vice: fonte_sha256 = %', alvo_sha;
  END IF;
  IF alvo_snapshot IS DISTINCT FROM TIMESTAMPTZ '2026-09-03T11:00:01.358Z' THEN
    RAISE EXCEPTION 'readback chapas ma vice: snapshot_em = %', alvo_snapshot;
  END IF;
  -- O titular e as alternativas oficiais ficam de fora da troca de proposito.
  -- Sao as duas coisas que uma versao descuidada desta migration mexeria
  -- achando que "atualiza a chapa"; o readback cobra as duas em voz alta.
  IF alvo_titular IS DISTINCT FROM '100002544073|REGINALDO LIMA BRAUNO|REGINALDO LIMA|PCB|-3' THEN
    RAISE EXCEPTION 'readback chapas ma vice: titular mudou (%)', alvo_titular;
  END IF;
  IF alvo_alternativas IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'readback chapas ma vice: alternativas_oficiais mudou (%)', alvo_alternativas;
  END IF;

  SELECT count(*) INTO antigos
  FROM public.chapas_2026 WHERE vice_sq_candidato = '100002544074';
  IF antigos <> 0 THEN
    RAISE EXCEPTION 'readback chapas ma vice: % linha(s) ainda com o SQ da vice substituida', antigos;
  END IF;

  -- Nenhuma outra linha da tabela mudou: contagem e hash agregado do "antes",
  -- lidos do recibo, contra os mesmos numeros recomputados agora.
  SELECT (r.detalhe::jsonb ->> 'outras_count')::bigint,
         r.detalhe::jsonb ->> 'outras_digest'
    INTO antes_count, antes_digest
  FROM public.coleta_log r
  WHERE r.execucao = 'migration:20260903140000';

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(ch)::text, '' ORDER BY ch.chave), ''))
    INTO agora_count, agora_digest
  FROM public.chapas_2026 ch
  WHERE ch.chave <> '2026:MA:reginaldo-lima-brauno';

  IF antes_count IS NULL OR antes_digest IS NULL THEN
    RAISE EXCEPTION 'readback chapas ma vice: recibo sem outras_count/outras_digest';
  END IF;
  IF agora_count <> antes_count OR agora_digest IS DISTINCT FROM antes_digest THEN
    RAISE EXCEPTION 'readback chapas ma vice: outras linhas de chapas_2026 divergem do recibo (% -> %)', antes_count, agora_count;
  END IF;
END
$readback$;
