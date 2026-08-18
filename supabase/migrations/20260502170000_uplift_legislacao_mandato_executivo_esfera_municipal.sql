-- ============================================================================
-- Uplift: legislacao_mandato_executivo passa a aceitar esfera = 'municipal'.
--
-- Contexto:
--   - Prompt 10 fechou Ciro Gomes como ampliado_parcial bloqueado documentado:
--       * CE estadual 1991-1994: limite_epistemico (BELT/ALECE catalogo tematico)
--       * Fortaleza municipal 1989-1990: limite_estrutural pre-existente
--         porque schema/registry vigente aceitava apenas federal/estadual.
--   - Esta migration destrava SOMENTE o bloqueio estrutural municipal.
--   - NAO insere nenhuma row de Fortaleza nem promove Ciro a coverage_id completo.
--   - CE estadual continua limite_epistemico independente desta migration.
--
-- Mudancas DDL:
--   1. ADD COLUMN municipio_norma TEXT (nullable).
--   2. DROP CONSTRAINT chk_leg_esfera + recreate com 'municipal' incluido.
--   3. DROP CONSTRAINT chk_leg_federal_uf_null + recreate proibindo
--      municipio_norma para federal.
--   4. DROP CONSTRAINT chk_leg_estadual_uf_preenchida + recreate proibindo
--      municipio_norma para estadual (estadual continua sendo apenas UF).
--   5. ADD CONSTRAINT chk_leg_municipal_uf_municipio_preenchidos:
--      municipal exige uf_norma NOT NULL e municipio_norma NOT NULL/nao-vazio.
--   6. ADD CONSTRAINT chk_leg_municipio_norma_format: municipio_norma
--      ou e NULL ou tem comprimento > 0 apos TRIM.
--   7. CREATE INDEX idx_legislacao_mandato_executivo_esfera_uf_municipio
--      para suportar lookup municipal sem alterar o indice existente.
--
-- Idempotencia:
--   - ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS / CREATE INDEX
--     IF NOT EXISTS sao usados onde Postgres suporta para tornar a migration
--     repetivel localmente sem risco em re-execucoes manuais.
--   - As constraints sao recriadas com nomes estaveis para que o estado
--     final do schema seja deterministico.
--   - Nenhuma linha de dados e modificada por esta migration.
--
-- Guards:
--   - Aborta se a tabela legislacao_mandato_executivo nao existir.
--   - Aborta se municipio_norma ja for NOT NULL (estado inesperado).
--
-- Fora de escopo:
--   - Nao toca em outras tabelas alem de legislacao_mandato_executivo.
--   - Nao toca em historico_politico.
--   - Nao cria rows em legislacao_mandato_executivo.
--   - Nao registra fonte oficial municipal de Fortaleza no registry local
--     (isso exige prova de fonte primaria reproduzivel em prompt futuro).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'legislacao_mandato_executivo'
  ) THEN
    RAISE EXCEPTION 'Pre-condicao falha: tabela legislacao_mandato_executivo nao existe; uplift municipal abortado.';
  END IF;
END $$;

ALTER TABLE legislacao_mandato_executivo
  ADD COLUMN IF NOT EXISTS municipio_norma TEXT;

DO $$
DECLARE
  v_is_nullable TEXT;
BEGIN
  SELECT is_nullable INTO v_is_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'legislacao_mandato_executivo'
     AND column_name = 'municipio_norma';

  IF v_is_nullable IS NULL THEN
    RAISE EXCEPTION 'Pos-condicao falha: coluna municipio_norma nao foi criada.';
  END IF;

  IF v_is_nullable <> 'YES' THEN
    RAISE EXCEPTION 'Pre-condicao inesperada: municipio_norma ja existe como NOT NULL; uplift abortado para evitar destruicao de estado.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- IMPORTANTE: a migration historica 20260419100000_create_legislacao_mandato_executivo.sql
-- nomeou os constraints originais SEM o prefixo `chk_leg_`:
--   - chk_esfera
--   - chk_federal_uf_null
--   - chk_estadual_uf_preenchida
-- O reflexo declarativo em supabase/migrations evoluiu para `chk_leg_*` em sessoes
-- posteriores, mas o banco remoto ainda carrega os nomes historicos. Sem dropar
-- os dois conjuntos antes do recreate, a constraint chk_esfera continuaria
-- vetando esfera='municipal' apesar da nova chk_leg_esfera ser permissiva.
-- Esta secao DROPa explicitamente os DOIS nomes (historico + canonico) e
-- recria apenas a forma canonica chk_leg_*. IF EXISTS protege execucoes em
-- ambientes onde apenas um dos nomes esteja presente.
-- ----------------------------------------------------------------------------
ALTER TABLE legislacao_mandato_executivo
  DROP CONSTRAINT IF EXISTS chk_esfera;

ALTER TABLE legislacao_mandato_executivo
  DROP CONSTRAINT IF EXISTS chk_leg_esfera;

ALTER TABLE legislacao_mandato_executivo
  ADD CONSTRAINT chk_leg_esfera
  CHECK (esfera IN ('federal', 'estadual', 'municipal'));

ALTER TABLE legislacao_mandato_executivo
  DROP CONSTRAINT IF EXISTS chk_federal_uf_null;

ALTER TABLE legislacao_mandato_executivo
  DROP CONSTRAINT IF EXISTS chk_leg_federal_uf_null;

ALTER TABLE legislacao_mandato_executivo
  ADD CONSTRAINT chk_leg_federal_uf_null
  CHECK (
    (esfera = 'federal' AND uf_norma IS NULL AND municipio_norma IS NULL) OR
    (esfera <> 'federal')
  );

ALTER TABLE legislacao_mandato_executivo
  DROP CONSTRAINT IF EXISTS chk_estadual_uf_preenchida;

ALTER TABLE legislacao_mandato_executivo
  DROP CONSTRAINT IF EXISTS chk_leg_estadual_uf_preenchida;

ALTER TABLE legislacao_mandato_executivo
  ADD CONSTRAINT chk_leg_estadual_uf_preenchida
  CHECK (
    (esfera = 'estadual' AND uf_norma IS NOT NULL AND municipio_norma IS NULL) OR
    (esfera <> 'estadual')
  );

ALTER TABLE legislacao_mandato_executivo
  DROP CONSTRAINT IF EXISTS chk_leg_municipal_uf_municipio_preenchidos;

ALTER TABLE legislacao_mandato_executivo
  ADD CONSTRAINT chk_leg_municipal_uf_municipio_preenchidos
  CHECK (
    (esfera = 'municipal' AND uf_norma IS NOT NULL AND municipio_norma IS NOT NULL AND TRIM(municipio_norma) <> '') OR
    (esfera <> 'municipal')
  );

ALTER TABLE legislacao_mandato_executivo
  DROP CONSTRAINT IF EXISTS chk_leg_municipio_norma_format;

ALTER TABLE legislacao_mandato_executivo
  ADD CONSTRAINT chk_leg_municipio_norma_format
  CHECK (
    municipio_norma IS NULL OR
    LENGTH(TRIM(municipio_norma)) > 0
  );

CREATE INDEX IF NOT EXISTS idx_legislacao_mandato_executivo_esfera_uf_municipio
  ON legislacao_mandato_executivo(esfera, uf_norma, municipio_norma);

-- Pos-condicao: garantir que os nomes historicos foram removidos e que apenas
-- os nomes canonicos chk_leg_* permanecem na tabela. Aborta se qualquer dos
-- nomes antigos sobreviver ao recreate.
DO $$
DECLARE
  v_legacy INTEGER;
  v_canonical INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_legacy
    FROM information_schema.table_constraints
   WHERE table_schema = 'public'
     AND table_name = 'legislacao_mandato_executivo'
     AND constraint_name IN ('chk_esfera', 'chk_federal_uf_null', 'chk_estadual_uf_preenchida');

  IF v_legacy <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao falha: % constraints historicos (chk_esfera/chk_federal_uf_null/chk_estadual_uf_preenchida) ainda presentes apos uplift; municipal pode estar bloqueado pelo enum antigo.', v_legacy;
  END IF;

  SELECT COUNT(*) INTO v_canonical
    FROM information_schema.table_constraints
   WHERE table_schema = 'public'
     AND table_name = 'legislacao_mandato_executivo'
     AND constraint_name IN (
       'chk_leg_esfera',
       'chk_leg_federal_uf_null',
       'chk_leg_estadual_uf_preenchida',
       'chk_leg_municipal_uf_municipio_preenchidos',
       'chk_leg_municipio_norma_format'
     );

  IF v_canonical <> 5 THEN
    RAISE EXCEPTION 'Pos-condicao falha: esperados 5 constraints chk_leg_* canonicos, encontrados %.', v_canonical;
  END IF;
END $$;

DO $$
DECLARE
  v_total INTEGER;
  v_municipal INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM legislacao_mandato_executivo;
  SELECT COUNT(*) INTO v_municipal FROM legislacao_mandato_executivo WHERE esfera = 'municipal';
  RAISE NOTICE 'Uplift municipal: total_rows=%, esfera_municipal_rows=% (esperado 0; uplift e schema-only).', v_total, v_municipal;
  IF v_municipal <> 0 THEN
    RAISE EXCEPTION 'Pos-condicao falha: encontradas % rows com esfera=municipal apos uplift schema-only; uplift nao deveria criar dados.', v_municipal;
  END IF;
END $$;
