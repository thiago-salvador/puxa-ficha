-- Dá coluna à âncora de identidade da candidatura de 2026.
--
-- POR QUE ESTA MIGRATION EXISTE
-- =============================
-- O TSE garante uma única chave estável por candidatura: o SQ_CANDIDATO. Ela é
-- o degrau mais alto da escada de casamento de `scripts/lib/tse-resolver.ts`,
-- acima do CPF e do nome. E até hoje ela não tinha coluna: vivia escrita à mão
-- num `VALUES` de 15 linhas dentro de
-- `20260515043000_refresh_tier1_identity_observability_view.sql`, atualizado a
-- mão, sem nenhuma restrição do banco garantindo unicidade.
--
-- Sem coluna, a ingestão cai para o nome, e nome de político brasileiro repete.
-- O custo já está medido, não é hipótese:
--
--   julho/2026  a migration 20260726180000 corrigiu DUAS fichas que carregavam
--               a identidade de outra pessoa (jeronimo e professora-dorinha).
--   17/08/2026  a varredura das 175 fichas publicadas achou mais DEZ com CPF de
--               terceiro. Todas as dez eram candidatura a governador; nenhum
--               presidenciável tinha CPF errado. Não é coincidência: com 13
--               pessoas o nome basta, com 194 ele colide.
--
-- O caso mais claro foi `renan-filho`: o CPF gravado pertencia a RENAN BEKEL DE
-- MELO PACHECO, deputado estadual em Roraima, cujo nome de urna é "RENAN FILHO",
-- idêntico letra por letra ao do governador de Alagoas.
--
-- POR QUE UMA COLUNA E NÃO UM ÍNDICE MELHOR
-- =========================================
-- Porque o defeito não é de busca, é de afirmação. Enquanto a ficha não declara
-- QUAL candidatura ela é, qualquer rotina futura tem que redescobrir isso por
-- heurística, e heurística erra em silêncio. Com a coluna, a pergunta "esta
-- ficha é esta pessoa?" passa a ter resposta verificável contra o pacote
-- oficial, e a restrição UNIQUE impede que duas fichas reivindiquem a mesma
-- candidatura.
--
-- O QUE ESTA MIGRATION NÃO FAZ
-- ============================
-- Não preenche a coluna. Os valores vêm do pacote `consulta_cand_2026` e são
-- aplicados por `scripts/apply-ancora-sq-2026.py`, que lê a fonte em tempo de
-- execução. É a mesma política das migrations 20260725123000, 20260725150000 e
-- 20260726180000: identificador de pessoa real não entra em arquivo versionado.
--
-- Não mexe na view pública. `candidatos_publico` não passa a expor a coluna, e o
-- teste de contrato da view continua valendo sem alteração de ordem.
--
-- ELIZEU AGUIAR, o caso que justifica a forma da restrição
-- ========================================================
-- No universo de 2026 há 207 candidaturas para 206 pessoas: ELIZEU MORAIS DE
-- AGUIAR (PI, NOVO) tem DOIS sequenciais vivos com o mesmo CPF, 180002533958 e
-- 180002549920, e `ST_SUBSTITUIDO` é N nos dois. Ou seja, CPF não é chave de
-- candidatura, só o sequencial é. Por isso a UNIQUE vai no sequencial e nunca
-- no CPF, e por isso a coluna é anulável: ficha que não corresponde a uma
-- candidatura de 2026 (pré-candidato que não registrou, mandato antigo) fica
-- com NULL, que é ausência legítima e não lacuna.

BEGIN;

ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS sq_candidato_2026 text;

COMMENT ON COLUMN public.candidatos.sq_candidato_2026 IS
  'Sequencial da candidatura de 2026 no pacote consulta_cand do TSE (SQ_CANDIDATO). '
  'Âncora de identidade: é a única chave que o TSE garante única por candidatura, '
  'acima do CPF, que se repete quando a mesma pessoa tem duas candidaturas. '
  'NULL significa que a ficha não corresponde a uma candidatura registrada em 2026, '
  'o que é ausência legítima. Preenchida fora do versionamento, a partir da fonte.';

-- Só dígitos. Barra colagem de nome, de CPF formatado e de string vazia, que são
-- as três formas que um backfill descuidado costuma gravar.
ALTER TABLE public.candidatos
  DROP CONSTRAINT IF EXISTS candidatos_sq_candidato_2026_formato;
ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_sq_candidato_2026_formato
  CHECK (sq_candidato_2026 IS NULL OR sq_candidato_2026 ~ '^[0-9]{9,15}$');

-- Duas fichas não podem reivindicar a mesma candidatura. Parcial, porque NULL
-- se repete de propósito.
CREATE UNIQUE INDEX IF NOT EXISTS candidatos_sq_candidato_2026_unico
  ON public.candidatos (sq_candidato_2026)
  WHERE sq_candidato_2026 IS NOT NULL;

DO $$
DECLARE
  tem_coluna boolean;
  tem_check boolean;
  tem_indice boolean;
  fora_do_formato integer;
  duplicados integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'candidatos'
       AND column_name = 'sq_candidato_2026'
  ) INTO tem_coluna;
  IF NOT tem_coluna THEN
    RAISE EXCEPTION 'ancora_sq: a coluna sq_candidato_2026 nao existe depois do ALTER';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_sq_candidato_2026_formato'
  ) INTO tem_check;
  IF NOT tem_check THEN
    RAISE EXCEPTION 'ancora_sq: o CHECK de formato nao foi criado';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'candidatos_sq_candidato_2026_unico'
  ) INTO tem_indice;
  IF NOT tem_indice THEN
    RAISE EXCEPTION 'ancora_sq: o indice unico parcial nao foi criado';
  END IF;

  -- Em replay linear a tabela está vazia e as duas contagens abaixo dão zero de
  -- graça. Elas existem para a aplicação em produção, onde a tabela tem dado.
  SELECT COUNT(*) INTO fora_do_formato FROM public.candidatos
   WHERE sq_candidato_2026 IS NOT NULL AND sq_candidato_2026 !~ '^[0-9]{9,15}$';
  IF fora_do_formato <> 0 THEN
    RAISE EXCEPTION 'ancora_sq: % linha(s) com sequencial fora do formato', fora_do_formato;
  END IF;

  SELECT COUNT(*) INTO duplicados FROM (
    SELECT sq_candidato_2026 FROM public.candidatos
     WHERE sq_candidato_2026 IS NOT NULL
     GROUP BY sq_candidato_2026 HAVING COUNT(*) > 1
  ) d;
  IF duplicados <> 0 THEN
    RAISE EXCEPTION 'ancora_sq: % sequencial(is) reivindicado(s) por mais de uma ficha', duplicados;
  END IF;

  RAISE NOTICE 'ancora_sq: coluna, CHECK e indice unico no lugar';
END $$;

COMMIT;
