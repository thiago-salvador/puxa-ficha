-- Rollback seguro do backfill estrito da issue #138.
-- Remove somente as quatro linhas Camara cujo payload oficial abaixo coincide.
-- Nunca remove as quatro linhas Senado homonimas. Roda apenas apos autorizacao.

DO $precondition$
DECLARE
  camara_alvos integer;
  senado_alvos integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
      AND slug = 'ronaldo-caiado'
  ) THEN
    RAISE EXCEPTION 'issue_138 rollback: Ronaldo Caiado ausente';
  END IF;
  SELECT count(*) INTO camara_alvos
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('123202', '123149', '123094', '121483')
    AND metadata->>'backfill_issue' = '138';
  SELECT count(*) INTO senado_alvos
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Senado'
    AND proposicao_id_api IN ('123202', '123149', '123094', '121483');
  IF camara_alvos <> 4 OR senado_alvos <> 4 THEN
    RAISE EXCEPTION 'issue_138 rollback: guard de payload falhou (Camara marcadas=%, Senado protegidas=%)', camara_alvos, senado_alvos;
  END IF;
END
$precondition$;

-- @write tabela=projetos_lei ref=123202 campos=delete
DELETE FROM public.projetos_lei
WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
  AND fonte = 'Camara' AND proposicao_id_api = '123202'
  AND tipo = 'EMC' AND numero = '188' AND ano = 2003
  AND ementa = 'Adita o art. 1º da PEC dando nova redação ao § 9º do art. 201 da Constituição Federal.'
  AND metadata->>'backfill_issue' = '138';

-- @write tabela=projetos_lei ref=123149 campos=delete
DELETE FROM public.projetos_lei
WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
  AND fonte = 'Camara' AND proposicao_id_api = '123149'
  AND tipo = 'EMC' AND numero = '163' AND ano = 2003
  AND ementa = 'Acrescentem-se, no art. 1º da PEC, as seguintes disposições aos arts. 40 e 42 da Constituição Federal, promovendo-se, em conseqüência, as seguintes modificações no art. 2º da PEC, relativamente ao caput do art. 8º da Emenda Constitucional nº 20, de 15 de dezembro de 1998:'
  AND metadata->>'backfill_issue' = '138';

-- @write tabela=projetos_lei ref=123094 campos=delete
DELETE FROM public.projetos_lei
WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
  AND fonte = 'Camara' AND proposicao_id_api = '123094'
  AND tipo = 'EMC' AND numero = '143' AND ano = 2003
  AND ementa = 'Modifica os arts. 37, 40, 42, 48, 96, 142 e 149 da Constituição Federal, o art. 8º da Emenda Constitucional nº 20, de 15 de dezembro de 1998, e dá outras providências.'
  AND metadata->>'backfill_issue' = '138';

-- @write tabela=projetos_lei ref=121483 campos=delete
DELETE FROM public.projetos_lei
WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
  AND fonte = 'Camara' AND proposicao_id_api = '121483'
  AND tipo = 'EMC' AND numero = '89' AND ano = 2003
  AND ementa = 'Altera o Sistema Tributário Nacional e dá outras providências.'
  AND metadata->>'backfill_issue' = '138';

DO $postcondition$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.projetos_lei
    WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
      AND fonte = 'Camara'
      AND proposicao_id_api IN ('123202', '123149', '123094', '121483')
  ) THEN
    RAISE EXCEPTION 'issue_138 rollback: sobrou linha Camara alvo';
  END IF;
  IF (SELECT count(*) FROM public.projetos_lei
      WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
        AND fonte = 'Senado'
        AND proposicao_id_api IN ('123202', '123149', '123094', '121483')) <> 4 THEN
    RAISE EXCEPTION 'issue_138 rollback: rollback tocou nas 4 linhas Senado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.projetos_lei
    WHERE proposicao_id_api IS NOT NULL
    GROUP BY candidato_id, proposicao_id_api
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'issue_138 rollback: nao e seguro restaurar a constraint antiga, ha colisoes cross-source';
  END IF;
END
$postcondition$;

DROP INDEX IF EXISTS public.uq_projetos_lei_candidato_fonte_proposicao;
DO $restore_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.projetos_lei'::regclass
      AND c.conname = 'uq_projetos_lei_candidato_proposicao'
  ) THEN
    EXECUTE 'ALTER TABLE public.projetos_lei
      ADD CONSTRAINT uq_projetos_lei_candidato_proposicao
      UNIQUE (candidato_id, proposicao_id_api)';
  END IF;
END
$restore_constraint$;
