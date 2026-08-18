-- Readback somente leitura da compatibilidade security_invoker da view publica.
DO $readback$
DECLARE
  v_tem_categorias boolean;
  v_acl_atual integer;
  v_acl_esperado integer;
  v_acl_diferencas integer;
  v_view_def text;
  v_security_invoker boolean;
BEGIN
  -- Este readback exige a própria versão aplicada, e só isso do ledger.
  --
  -- Ele já cravou o TOPO do ledger duas vezes, e as duas vezes interromperam a
  -- Fase 4 sem defeito nenhum de dado: primeiro quando a 20260812124000 entrou,
  -- depois quando a 20260812125000 entrou. Enumerar topos aceitos não resolve,
  -- só adia, porque cada migration nova cria mais um estado legítimo.
  --
  -- A identidade do ledger não é assunto deste arquivo: o runner da Fase 4 já
  -- roda `audit:ledger:gate` sobre a lista integral de versões remotas e ainda
  -- confere o par (total, topo) esperado do release. Migration não prevista
  -- aplicada por fora continua sendo detectada lá, que é onde essa asserção
  -- pertence e onde ela é atualizada a cada release.
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260812123000') <> 1 THEN
    RAISE EXCEPTION 'readback 20260812123000: versao ausente ou duplicada no ledger';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'financiamento'
       AND column_name = 'categorias_origem'
  ) INTO v_tem_categorias;
  SELECT pg_get_viewdef('public.financiamento_publico'::regclass, true)
    INTO v_view_def;
  SELECT coalesce(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']
    INTO v_security_invoker
    FROM pg_class c
   WHERE c.oid = 'public.financiamento_publico'::regclass;

  WITH expected(grantee, column_name) AS (
    SELECT role_name, column_name
      FROM unnest(ARRAY['anon', 'authenticated']) role_name
      CROSS JOIN unnest(
        ARRAY[
          'id', 'candidato_id', 'ano_eleicao', 'total_arrecadado',
          'total_fundo_partidario', 'total_fundo_eleitoral', 'total_pessoa_fisica',
          'total_recursos_proprios', 'maiores_doadores_publicos', 'fonte', 'created_at',
          'despublicado_em'
        ] || CASE WHEN v_tem_categorias THEN ARRAY['categorias_origem'] ELSE ARRAY[]::text[] END
      ) column_name
  ), actual AS (
    SELECT grantee, column_name
      FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'financiamento'
       AND privilege_type = 'SELECT'
       AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ), diffs AS (
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    UNION ALL
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
  )
  SELECT (SELECT count(*) FROM actual),
         (SELECT count(*) FROM expected),
         (SELECT count(*) FROM diffs)
    INTO v_acl_atual, v_acl_esperado, v_acl_diferencas;

  IF NOT v_security_invoker OR v_view_def NOT ILIKE '%despublicado_em IS NULL%'
     OR v_acl_atual <> v_acl_esperado OR v_acl_diferencas <> 0
     OR has_table_privilege('anon', 'public.financiamento', 'SELECT')
     OR has_table_privilege('authenticated', 'public.financiamento', 'SELECT')
     OR NOT has_column_privilege('anon', 'public.financiamento', 'despublicado_em', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.financiamento', 'despublicado_em', 'SELECT')
     OR EXISTS (
       SELECT 1
         FROM information_schema.column_privileges
        WHERE table_schema = 'public'
          AND table_name = 'financiamento'
          AND column_name IN ('cpf_hash', 'cnpj_doador')
          AND privilege_type = 'SELECT'
          AND grantee IN ('PUBLIC', 'anon', 'authenticated')
     ) THEN
    RAISE EXCEPTION
      'readback 20260812123000: view/ACL divergiu: atual=% esperado=% diferencas=%',
      v_acl_atual, v_acl_esperado, v_acl_diferencas;
  END IF;
END
$readback$;

SET ROLE anon;
SELECT id, candidato_id, ano_eleicao, total_arrecadado, total_fundo_partidario,
       total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios,
       maiores_doadores, fonte, created_at, categorias_origem
  FROM public.financiamento_publico
 LIMIT 1;
RESET ROLE;

SET ROLE authenticated;
SELECT id, candidato_id, ano_eleicao, total_arrecadado, total_fundo_partidario,
       total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios,
       maiores_doadores, fonte, created_at, categorias_origem
  FROM public.financiamento_publico
 LIMIT 1;
RESET ROLE;
