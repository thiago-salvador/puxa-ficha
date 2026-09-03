-- Readback forward da 20260903130000.
--
-- Roda sozinho, depois do COMMIT, e por isso nao pode depender de nenhuma
-- tabela temporaria da migration. O "antes" que ele compara e o que a propria
-- migration gravou no recibo de pre-imagem (`outras_count` e `outras_digest`
-- em `detalhe`); o "depois" ele recomputa aqui.
DO $readback$
DECLARE
  ledger_topo text;
  ledger_count integer;
  alvo_nome_urna text;
  alvo_nome_completo text;
  alvo_sq text;
  antigos integer;
  recibo integer;
  volume_recibo integer;
  antes_count bigint;
  antes_digest text;
  agora_count bigint;
  agora_digest text;
BEGIN
  SELECT coalesce(max(version), ''), count(*) FILTER (WHERE version = '20260903130000')
    INTO ledger_topo, ledger_count
  FROM supabase_migrations.schema_migrations;
  IF ledger_count <> 1 OR ledger_topo <> '20260903130000' THEN
    RAISE EXCEPTION 'readback chapas hermano: ledger sem a versao no topo (topo=%, count=%)', ledger_topo, ledger_count;
  END IF;

  SELECT count(*) INTO recibo
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903130000' AND detalhe IS NOT NULL;
  IF recibo <> 1 THEN
    RAISE EXCEPTION 'readback chapas hermano: recibo de pre-imagem ausente ou duplicado (%)', recibo;
  END IF;

  SELECT volume INTO volume_recibo
  FROM public.coleta_log WHERE execucao = 'migration:20260903130000';
  IF volume_recibo <> 1 THEN
    RAISE EXCEPTION 'readback chapas hermano: recibo com volume % , esperado 1', volume_recibo;
  END IF;

  SELECT vice_nome_urna, vice_nome_completo, vice_sq_candidato
    INTO alvo_nome_urna, alvo_nome_completo, alvo_sq
  FROM public.chapas_2026
  WHERE chave = '2026:RN:allyson-leandro-bezerra-silva';
  IF alvo_nome_urna IS DISTINCT FROM 'HERMANO' THEN
    RAISE EXCEPTION 'readback chapas hermano: vice_nome_urna = %', coalesce(alvo_nome_urna, '(linha ausente)');
  END IF;
  -- O nome civil e a ancora SQ ficam de fora da correcao de proposito; o
  -- readback cobra isso em voz alta para que uma versao futura da migration nao
  -- os inclua sem que ninguem note.
  IF alvo_nome_completo IS DISTINCT FROM 'HERMANO DA COSTA MORAES' THEN
    RAISE EXCEPTION 'readback chapas hermano: vice_nome_completo mudou (%)', alvo_nome_completo;
  END IF;
  IF alvo_sq IS DISTINCT FROM '200002535256' THEN
    RAISE EXCEPTION 'readback chapas hermano: vice_sq_candidato mudou (%)', alvo_sq;
  END IF;

  SELECT count(*) INTO antigos
  FROM public.chapas_2026 WHERE vice_nome_urna = 'HERMANO MORAIS';
  IF antigos <> 0 THEN
    RAISE EXCEPTION 'readback chapas hermano: % linha(s) ainda com o nome de urna antigo', antigos;
  END IF;

  -- Nenhuma outra linha da tabela mudou: contagem e hash agregado do "antes",
  -- lidos do recibo, contra os mesmos numeros recomputados agora.
  SELECT (r.detalhe::jsonb ->> 'outras_count')::bigint,
         r.detalhe::jsonb ->> 'outras_digest'
    INTO antes_count, antes_digest
  FROM public.coleta_log r
  WHERE r.execucao = 'migration:20260903130000';

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(ch)::text, '' ORDER BY ch.chave), ''))
    INTO agora_count, agora_digest
  FROM public.chapas_2026 ch
  WHERE ch.chave <> '2026:RN:allyson-leandro-bezerra-silva';

  IF antes_count IS NULL OR antes_digest IS NULL THEN
    RAISE EXCEPTION 'readback chapas hermano: recibo sem outras_count/outras_digest';
  END IF;
  IF agora_count <> antes_count OR agora_digest IS DISTINCT FROM antes_digest THEN
    RAISE EXCEPTION 'readback chapas hermano: outras linhas de chapas_2026 divergem do recibo (% -> %)', antes_count, agora_count;
  END IF;
END
$readback$;
