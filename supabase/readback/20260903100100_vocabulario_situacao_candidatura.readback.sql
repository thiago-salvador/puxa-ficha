DO $readback$
DECLARE
  ledger_count integer;
  tem_constraint boolean;
  fora integer;
  pub_nulas integer;
  aposentados integer;
  receipt_count integer;
  rico text;
  well text;
  cleber text;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('20260903100000', '20260903100100');
  IF ledger_count <> 2 THEN
    RAISE EXCEPTION 'readback vocabulario_situacao: ledger sem o par (count=%)', ledger_count;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
       AND contype = 'c'
       AND convalidated
  ) INTO tem_constraint;
  IF NOT tem_constraint THEN
    RAISE EXCEPTION 'readback vocabulario_situacao: CHECK ausente ou NOT VALID';
  END IF;

  SELECT count(*) INTO fora FROM public.candidatos
   WHERE situacao_candidatura IS NOT NULL
     AND situacao_candidatura NOT IN ('aguardando julgamento', 'candidatura declarada', 'incerto');
  IF fora <> 0 THEN
    RAISE EXCEPTION 'readback vocabulario_situacao: % linha(s) fora do dominio', fora;
  END IF;

  SELECT count(*) INTO pub_nulas FROM public.candidatos
   WHERE publicavel = true AND status <> 'removido' AND situacao_candidatura IS NULL;
  IF pub_nulas <> 0 THEN
    RAISE EXCEPTION 'readback vocabulario_situacao: % ficha(s) publicavel(is) sem situacao', pub_nulas;
  END IF;

  SELECT count(*) INTO aposentados FROM public.candidatos
   WHERE situacao_candidatura IN ('deferido', 'deferido com recurso', 'pre-candidato', 'desistente', 'renúncia');
  IF aposentados <> 0 THEN
    RAISE EXCEPTION 'readback vocabulario_situacao: % linha(s) com valor aposentado', aposentados;
  END IF;

  SELECT count(*) INTO receipt_count
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903100000' AND detalhe IS NOT NULL;
  IF receipt_count <> 1 THEN
    RAISE EXCEPTION 'readback vocabulario_situacao: recibo de pre-imagem ausente ou duplicado (%)', receipt_count;
  END IF;

  -- As tres fichas do diagnostico de 02/09, quando existem no banco.
  SELECT situacao_candidatura INTO rico FROM public.candidatos WHERE slug = 'rico-pinheiro';
  SELECT situacao_candidatura INTO well FROM public.candidatos WHERE slug = 'well-macedo';
  SELECT situacao_candidatura INTO cleber FROM public.candidatos WHERE slug = 'cleber-rabelo';
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'rico-pinheiro') AND rico IS DISTINCT FROM 'aguardando julgamento' THEN
    RAISE EXCEPTION 'readback vocabulario_situacao: rico-pinheiro = %', rico;
  END IF;
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'well-macedo') AND well IS DISTINCT FROM 'aguardando julgamento' THEN
    RAISE EXCEPTION 'readback vocabulario_situacao: well-macedo = %', well;
  END IF;
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'cleber-rabelo') AND cleber IS NOT NULL THEN
    RAISE EXCEPTION 'readback vocabulario_situacao: cleber-rabelo = %', cleber;
  END IF;
END
$readback$;
