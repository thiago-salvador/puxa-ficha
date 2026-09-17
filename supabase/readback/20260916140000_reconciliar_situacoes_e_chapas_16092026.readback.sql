DO $readback$
DECLARE
  ledger_count integer;
  situacoes_ok integer;
  carlos_ok integer;
  chapas_ok integer;
  sobrou_antigo integer;
  recibo integer;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations WHERE version = '20260916140000';
  IF ledger_count <> 1 THEN
    RAISE EXCEPTION 'readback issue-340: ledger sem a migration (count=%)', ledger_count;
  END IF;

  SELECT count(*) FROM (VALUES
    ('ariel-capistrano',   'deferido'),
    ('roberto-rocha',      'indeferido com recurso'),
    ('elizeu-aguiar',      'deferido com recurso'),
    ('marcelo-brigadeiro', 'deferido'),
    ('ruth-reis',          'pendente de julgamento'),
    ('leonardo-avalanche', 'pendente de julgamento')
  ) AS esperado(slug, situacao)
  JOIN public.candidatos c ON c.slug = esperado.slug AND c.situacao_candidatura = esperado.situacao
  INTO situacoes_ok;
  IF situacoes_ok <> 6 THEN
    RAISE EXCEPTION 'readback issue-340: % de 6 situacoes conferem', situacoes_ok;
  END IF;

  SELECT count(*) INTO carlos_ok FROM public.candidatos
  WHERE slug = 'carlos-jararaca' AND status = 'removido' AND publicavel IS FALSE
    AND situacao_candidatura = 'indeferido';
  IF carlos_ok <> 1 THEN
    RAISE EXCEPTION 'readback issue-340: carlos-jararaca nao esta despublicado';
  END IF;

  SELECT count(*) INTO chapas_ok FROM public.chapas_2026
  WHERE (chave = '2026:RN:carlos-alberto-de-almeida-cavalcante' AND titular_sq_candidato = '200002554482' AND titular_candidato_id IS NULL)
     OR (chave = '2026:RN:henrique-othon-costa-de-lyra' AND vice_sq_candidato = '200002554523')
     OR (chave = '2026:SE:emanuel-messias-oliveira-cacho' AND vice_sq_candidato = '260002554525');
  IF chapas_ok <> 3 THEN
    RAISE EXCEPTION 'readback issue-340: % de 3 chapas conferem', chapas_ok;
  END IF;

  SELECT count(*) INTO sobrou_antigo FROM public.chapas_2026
  WHERE titular_sq_candidato = '200002550223'
     OR vice_sq_candidato = '200002553302'
     OR vice_sq_candidato = '260002551711';
  IF sobrou_antigo <> 0 THEN
    RAISE EXCEPTION 'readback issue-340: SQ substituido ainda aparece em chapas_2026 (%)', sobrou_antigo;
  END IF;

  SELECT count(*) INTO recibo FROM public.coleta_log WHERE execucao = 'migration:20260916140000';
  IF recibo <> 1 THEN
    RAISE EXCEPTION 'readback issue-340: recibo de coleta_log ausente ou duplicado (%)', recibo;
  END IF;
END
$readback$;
