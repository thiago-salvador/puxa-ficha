-- Readback somente leitura do estado forward.

DO $assert$
DECLARE
  alvo_count integer;
  receipt_count integer;
  ledger_count integer;
BEGIN
  SELECT count(*) INTO alvo_count
  FROM public.votos_candidato v
  JOIN public.candidatos c ON c.id = v.candidato_id
  JOIN public.votacoes_chave vc ON vc.id = v.votacao_id
  WHERE c.id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND c.slug = 'jhc'
    AND vc.id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
    AND vc.fonte = 'camara'
    AND vc.votacao_id_api = '2123843-93'
    AND v.voto = 'artigo_17';

  SELECT count(*) INTO receipt_count
  FROM public.coleta_log
  WHERE fonte = 'camara-votos'
    AND escopo = 'candidato'
    AND alvo = 'jhc'
    AND candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND resultado = 'encontrado'
    AND volume = 1
    AND url = 'https://dadosabertos.camara.leg.br/api/v2/votacoes/2123843-93/votos'
    AND execucao = 'migration:20260830143500';

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260830143500';

  IF alvo_count <> 1 OR receipt_count <> 1 OR ledger_count <> 1 THEN
    RAISE EXCEPTION 'readback jhc artigo_17 falhou (alvo=%, receipt=%, ledger=%)',
      alvo_count, receipt_count, ledger_count;
  END IF;
END
$assert$;

SELECT c.slug, vc.votacao_id_api, v.voto, cl.executado_em, cl.execucao
FROM public.votos_candidato v
JOIN public.candidatos c ON c.id = v.candidato_id
JOIN public.votacoes_chave vc ON vc.id = v.votacao_id
JOIN public.coleta_log cl
  ON cl.candidato_id = c.id AND cl.execucao = 'migration:20260830143500'
WHERE c.slug = 'jhc' AND vc.votacao_id_api = '2123843-93';
