-- Correcao isolada: Eliziane Gama, SQ_CANDIDATO 100002541459, MA/Senador,
-- numero 133. O ZIP oficial do TSE gerado em 23/09/2026 12:30:09 traz
-- NR_PARTIDO=13, SG_PARTIDO=PT e NM_PARTIDO=PARTIDO DOS TRABALHADORES.
-- Fonte: https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip
-- ZIP lido em 2026-09-23T17:27:26Z; SHA256
-- dda125bc927941e4273fe60ccc9755cb1e05bc198d63ba8848178cc6d1b51a6c.
-- O snapshot anterior candidatos_roster_2026 tambem registra PT para o SQ
-- (SHA256 4e4c3bc9dd45a94890ad6c9d1e550d35e616981221d50817cdac7420a71d0c20).
-- Aplicacao em producao exige autorizacao separada e ledger/readback.
BEGIN;
DO $apply$
DECLARE
  before_row jsonb;
  after_row jsonb;
  affected integer;
  target_id uuid := 'b8e8b3d1-1e2e-482f-b0dd-dbf927c5c681';
  receipt text := 'migration:20260923175946';
BEGIN
  IF current_setting('pf.replay', true) = 'true' OR NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'eliziane partido: replay descartavel ou coorte vazia';
    RETURN;
  END IF;

  SELECT to_jsonb(c) INTO before_row
  FROM public.candidatos c
  WHERE c.id = target_id
    AND c.slug = 'tse-2026-100002541459'
    AND c.sq_candidato_2026 = '100002541459'
    AND c.nome_completo = 'ELIZIANE PEREIRA GAMA MELO'
    AND c.nome_urna = 'ELIZIANE GAMA'
    AND c.estado = 'MA'
    AND c.cargo_disputado = 'Senador'
    AND c.numero_urna = '133'
    AND c.partido_sigla = 'PSD'
    AND c.partido_atual = 'PSD'
    AND c.publicavel IS TRUE
    AND c.status <> 'removido'
  FOR UPDATE;
  IF before_row IS NULL
    OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = receipt)
    OR EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot WHERE migration_version = '20260923175946') THEN
    RAISE EXCEPTION 'eliziane partido: preimagem/identidade ou recibo divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260923175946 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  VALUES ('20260923175946','candidatos',target_id,target_id,before_row,
          before_row || jsonb_build_object('partido_sigla','PT','partido_atual','PT'),now());

  -- @write tabela=candidatos slug=tse-2026-100002541459 campos=partido_sigla,partido_atual
  UPDATE public.candidatos c
  SET partido_sigla = 'PT', partido_atual = 'PT'
  WHERE c.id = target_id AND c.slug = 'tse-2026-100002541459' AND to_jsonb(c) = before_row;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'eliziane partido: UPDATE afetou % linhas', affected; END IF;

  SELECT to_jsonb(c) INTO after_row FROM public.candidatos c WHERE c.id = target_id;
  IF after_row IS DISTINCT FROM before_row || jsonb_build_object('partido_sigla','PT','partido_atual','PT') THEN
    RAISE EXCEPTION 'eliziane partido: posimagem divergiu';
  END IF;

  -- @write tabela=coleta_log ref=migration:20260923175946 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  VALUES ('tse-consulta-cand-2026','candidato','tse-2026-100002541459',target_id,
          'encontrado',1,
          jsonb_build_object('before',before_row,'after',after_row,
            'source_sha256','dda125bc927941e4273fe60ccc9755cb1e05bc198d63ba8848178cc6d1b51a6c',
            'source_sq','100002541459','source_uf','MA','source_cargo','SENADOR',
            'source_numero','133','source_nr_partido','13','source_sg_partido','PT')::text,
          'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
          'migration:20260923175946','escrita');
END
$apply$;
COMMIT;
