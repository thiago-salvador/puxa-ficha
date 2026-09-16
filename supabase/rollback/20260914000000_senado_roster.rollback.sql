BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260914000000' THEN
    RAISE EXCEPTION 'senado roster rollback: ledger divergiu';
  END IF;
  IF to_regclass('public.senado_suplencias_2026') IS NOT NULL AND EXISTS (SELECT 1 FROM public.senado_suplencias_2026) THEN
    RAISE EXCEPTION 'senado roster rollback recusado: tabela contém dados; preservar histórico e fazer rollback curado';
  END IF;
END $$;
DROP VIEW IF EXISTS public.senado_suplencias_publico;
DROP TABLE IF EXISTS public.senado_suplencias_2026;
REVOKE SELECT (sq_candidato_2026) ON public.candidatos FROM anon, authenticated;
DO $$
BEGIN
  PERFORM set_config(
    'pf.senado_roster_publicacao_previa',
    COALESCE((
      SELECT CASE WHEN convalidated THEN 'validada' ELSE 'not_valid' END
      FROM pg_constraint
      WHERE conrelid='public.candidatos'::regclass
        AND conname='candidatos_publicacao_minima_2026_check'
    ), 'ausente'),
    true
  );
END $$;

-- Restaura o contrato de publicação vigente antes desta migration: Presidente
-- e Governador continuam sujeitos à completude editorial; Senado volta a
-- ficar fora da regra até uma aplicação futura autorizada.
ALTER TABLE public.candidatos DROP CONSTRAINT IF EXISTS candidatos_publicacao_minima_2026_check;
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_publicacao_minima_2026_check CHECK (
  publicavel IS DISTINCT FROM true
  OR cargo_disputado NOT IN ('Presidente','Governador')
  OR (
    COALESCE(btrim(foto_url),'') <> ''
    AND COALESCE(btrim(partido_sigla),'') <> ''
    AND COALESCE(btrim(situacao_candidatura),'') <> ''
    AND COALESCE(btrim(biografia),'') <> ''
    AND COALESCE(btrim(naturalidade),'') <> ''
    AND data_nascimento IS NOT NULL
    AND COALESCE(btrim(formacao),'') <> ''
    AND COALESCE(btrim(profissao_declarada),'') <> ''
    AND COALESCE(btrim(genero),'') <> ''
    AND COALESCE(btrim(estado_civil),'') <> ''
    AND COALESCE(btrim(cor_raca),'') <> ''
    AND COALESCE(verificacao_campos,'{}'::jsonb) ? 'candidate_registration'
    AND COALESCE(verificacao_campos,'{}'::jsonb) ? 'candidate_complement'
  )
) NOT VALID;
-- Antes desta migration a constraint estava validada em produção (20260829030001).
-- A forward validou a definição que inclui Senador, que implica a anterior; logo
-- a revalidação aqui passa e o rollback não rebaixa para NOT VALID. Só um estado
-- sintético que já estava NOT VALID continua NOT VALID.
DO $$
BEGIN
  IF current_setting('pf.senado_roster_publicacao_previa', true) = 'not_valid' THEN
    RAISE NOTICE 'senado roster rollback: constraint já estava NOT VALID; validação mantida adiada';
  ELSE
    ALTER TABLE public.candidatos VALIDATE CONSTRAINT candidatos_publicacao_minima_2026_check;
  END IF;
END $$;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260914000000';
COMMIT;
