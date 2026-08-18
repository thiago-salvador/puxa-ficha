-- Rollback do contrato estrutural 20260811100100.
DO $$
DECLARE v_assinatura_constraint text;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
       WHERE version='20260811100100') <> 1 THEN
    RAISE EXCEPTION 'rollback 20260811100100: ledger ausente ou duplicado';
  END IF;
  SELECT md5(regexp_replace(pg_get_constraintdef(oid), '[[:space:]]+', '', 'g'))
    INTO v_assinatura_constraint
    FROM pg_constraint
   WHERE conrelid='public.votacoes_chave'::regclass
     AND conname='votacoes_chave_senado_exige_evento_exato_check';
  IF v_assinatura_constraint IS DISTINCT FROM 'ca437759d753dde40d2f9888bfa6bcf0' THEN
    RAISE EXCEPTION 'rollback 20260811100100: definição estrutural diverge da forward (%)', v_assinatura_constraint;
  END IF;
END
$$;

alter table public.votacoes_chave
  drop constraint if exists votacoes_chave_senado_exige_evento_exato_check;

delete from supabase_migrations.schema_migrations
 where version = '20260811100100';
