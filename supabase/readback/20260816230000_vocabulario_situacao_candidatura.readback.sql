-- Readback de 20260816230000_vocabulario_situacao_candidatura.sql
--
-- Roda DEPOIS da aplicacao, contra producao, e nao escreve nada. Prova de
-- comportamento, no padrao exigido por docs/MIGRATION-CHECKLIST.md: o bloco de
-- conferencia da propria migration roda dentro da transacao dela, e por isso
-- nao prova o estado que sobreviveu ao COMMIT.
DO $$
DECLARE
  total integer;
  fora integer;
  n_aguardando integer;
  n_declarada integer;
  n_incerto integer;
  n_nulas integer;
  pub_aguardando integer;
  pub_declarada integer;
  pub_incerto integer;
  pub_nulas integer;
  tem_constraint boolean;
  ex_deferido text;
BEGIN
  SELECT COUNT(*) INTO total FROM public.candidatos;

  -- 1. O vocabulario esta fechado de fato.
  SELECT COUNT(*) INTO fora FROM public.candidatos
   WHERE situacao_candidatura IS NOT NULL
     AND situacao_candidatura NOT IN ('aguardando julgamento', 'candidatura declarada', 'incerto');
  IF fora <> 0 THEN
    RAISE EXCEPTION 'readback: % linha(s) fora do dominio depois do commit', fora;
  END IF;

  -- 2. O CHECK sobreviveu ao commit e esta validado.
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
       AND contype = 'c' AND convalidated
  ) INTO tem_constraint;
  IF NOT tem_constraint THEN
    RAISE EXCEPTION 'readback: constraint ausente ou NOT VALID depois do commit';
  END IF;

  -- 3. Censo.
  SELECT COUNT(*) FILTER (WHERE situacao_candidatura = 'aguardando julgamento'),
         COUNT(*) FILTER (WHERE situacao_candidatura = 'candidatura declarada'),
         COUNT(*) FILTER (WHERE situacao_candidatura = 'incerto'),
         COUNT(*) FILTER (WHERE situacao_candidatura IS NULL)
    INTO n_aguardando, n_declarada, n_incerto, n_nulas
    FROM public.candidatos;

  SELECT COUNT(*) FILTER (WHERE situacao_candidatura = 'aguardando julgamento'),
         COUNT(*) FILTER (WHERE situacao_candidatura = 'candidatura declarada'),
         COUNT(*) FILTER (WHERE situacao_candidatura = 'incerto'),
         COUNT(*) FILTER (WHERE situacao_candidatura IS NULL)
    INTO pub_aguardando, pub_declarada, pub_incerto, pub_nulas
    FROM public.candidatos
   WHERE publicavel = true AND status <> 'removido';

  IF pub_nulas <> 0 THEN
    RAISE EXCEPTION 'readback: % ficha(s) publicavel(is) sem situacao', pub_nulas;
  END IF;

  IF total = 296 THEN
    IF n_aguardando <> 154 OR n_declarada <> 79 OR n_incerto <> 19 OR n_nulas <> 44 THEN
      RAISE EXCEPTION 'readback: censo da tabela esperado 154/79/19/44, encontrado %/%/%/%',
        n_aguardando, n_declarada, n_incerto, n_nulas;
    END IF;
    IF pub_aguardando <> 147 OR pub_declarada <> 25 OR pub_incerto <> 3 THEN
      RAISE EXCEPTION 'readback: censo publicavel esperado 147/25/3, encontrado %/%/%',
        pub_aguardando, pub_declarada, pub_incerto;
    END IF;
  ELSE
    RAISE NOTICE 'readback: tabela com % linha(s) em vez de 296; censo exato ignorado', total;
  END IF;

  -- 4. As tres fichas que carregavam deferimento sem lastro.
  SELECT string_agg(slug || '=' || coalesce(situacao_candidatura, '(NULL)'), ', ' ORDER BY slug)
    INTO ex_deferido
    FROM public.candidatos
   WHERE slug IN ('ciro-gomes-gov-ce', 'robson-raymundo', 'ronaldo-mansur');
  IF ex_deferido IS NOT NULL
     AND ex_deferido <> 'ciro-gomes-gov-ce=aguardando julgamento, robson-raymundo=aguardando julgamento, ronaldo-mansur=aguardando julgamento' THEN
    RAISE EXCEPTION 'readback: ex-deferidos em estado inesperado -> %', ex_deferido;
  END IF;

  RAISE NOTICE 'readback vocabulario_situacao OK: %/%/% mais % NULL em % linha(s)',
    n_aguardando, n_declarada, n_incerto, n_nulas, total;
END $$;

-- Prova de que o CHECK morde de verdade (deve falhar com 23514):
--
--   BEGIN;
--   UPDATE public.candidatos SET situacao_candidatura = 'deferido'
--    WHERE slug = 'ciro-gomes-gov-ce';
--   ROLLBACK;
