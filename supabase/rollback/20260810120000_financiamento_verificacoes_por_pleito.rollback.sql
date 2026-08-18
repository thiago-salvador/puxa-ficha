-- Rollback fail-closed do contrato vazio. A carga reconciliada deve ser
-- revertida primeiro pelo rollback pareado dela.
DO $$
DECLARE
  v_rows integer;
  v_financiamento_identificado integer;
  v_assinatura_funcoes text;
  v_assinatura_triggers text;
  v_assinatura_constraints text;
  v_assinatura_view text;
  v_assinatura_colunas text;
  v_assinatura_relacoes text;
  v_assinatura_indices text;
  v_view_security integer;
  v_acl_invalidos integer;
  v_acl_funcoes_exato_invalidos integer;
  v_acl_funcoes_automatico_invalidos integer;
  v_acl_automatico_invalidos integer;
  v_donos_invalidos integer;
  v_extras_estruturais integer;
  v_rls integer;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
       WHERE version='20260810120000') <> 1 THEN
    RAISE EXCEPTION 'rollback financiamento_verificacoes: ledger ausente ou duplicado';
  END IF;
  SELECT md5(string_agg(p.proname||chr(30)||pg_get_functiondef(p.oid)||chr(30)||
           p.prosecdef::text||chr(30)||p.provolatile::text||chr(30)||
           coalesce(array_to_string(p.proconfig,','),'<null>')||chr(30)||
           acldefault('f',p.proowner)::text||chr(30)||
           coalesce(obj_description(p.oid,'pg_proc'),'<null>'),chr(31) ORDER BY p.proname))
    INTO v_assinatura_funcoes
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN (
     'financiamento_publicado_recusa_verificacao',
     'financiamento_verificacao_recusa_publicado'
   );
  SELECT md5(string_agg(regexp_replace(pg_get_triggerdef(oid),'[[:space:]]+','','g')||
           chr(30)||tgenabled::text||chr(30)||coalesce(obj_description(oid,'pg_trigger'),'<null>'),
           chr(31) ORDER BY tgname))
    INTO v_assinatura_triggers FROM pg_trigger
   WHERE tgname IN (
     'financiamento_publicado_recusa_verificacao_trigger',
     'financiamento_verificacao_recusa_publicado_trigger'
   );
  SELECT md5(string_agg(conname||chr(30)||regexp_replace(pg_get_constraintdef(oid),'[[:space:]]+','','g')||
           chr(30)||coalesce(obj_description(oid,'pg_constraint'),'<null>'),
           chr(31) ORDER BY conrelid::regclass::text,conname))
    INTO v_assinatura_constraints FROM pg_constraint
   WHERE (conrelid='public.financiamento_verificacoes'::regclass
          OR (conrelid='public.financiamento'::regclass AND conname='financiamento_uf_candidatura_check'))
     AND contype IN ('c','u','p','f');
  SELECT md5(regexp_replace(pg_get_viewdef('public.financiamento_verificacoes_publico'::regclass,true),'[[:space:]]+','','g'))
    INTO v_assinatura_view;
  SELECT md5(string_agg(c.relname||chr(30)||a.attname||chr(30)||
           format_type(a.atttypid,a.atttypmod)||chr(30)||a.attnotnull::text||chr(30)||
           coalesce(pg_get_expr(d.adbin,d.adrelid),'<null>')||chr(30)||coalesce(a.attidentity::text,'<null>')||chr(30)||
           coalesce(a.attgenerated::text,'<null>')||chr(30)||
           CASE WHEN a.attcollation=0 THEN '<null>' ELSE coalesce(a.attcollation::regcollation::text,'<null>') END||chr(30)||
           coalesce(a.attstorage::text,'<null>')||chr(30)||coalesce(a.attcompression::text,'<null>')||chr(30)||
           coalesce(a.attstattarget::text,'<null>')||chr(30)||
           coalesce(array_to_string(a.attoptions,','),'<null>')||chr(30)||
           coalesce(a.attacl::text,'<null>')||chr(30)||
           coalesce(col_description(a.attrelid,a.attnum),'<null>'),
           chr(31) ORDER BY c.relname,a.attname))
    INTO v_assinatura_colunas
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
     AND ((c.relname='financiamento' AND a.attname IN ('sq_candidato','uf_candidatura'))
          OR c.relname IN ('financiamento_verificacoes','financiamento_verificacoes_publico'));
  SELECT md5(string_agg(relname||chr(30)||relkind::text||chr(30)||relpersistence::text||chr(30)||
           relrowsecurity::text||chr(30)||relforcerowsecurity::text||chr(30)||
           relreplident::text||chr(30)||
           CASE WHEN reltablespace=0 THEN '<default>' ELSE (SELECT spcname FROM pg_tablespace WHERE oid=reltablespace) END||chr(30)||
           coalesce((SELECT amname FROM pg_am WHERE oid=relam),'<null>')||chr(30)||
           coalesce(array_to_string(reloptions,','),'<null>'),
           chr(31) ORDER BY relname))
    INTO v_assinatura_relacoes FROM pg_class
   WHERE oid IN ('public.financiamento_verificacoes'::regclass,
                 'public.financiamento_verificacoes_publico'::regclass);
  SELECT md5(string_agg(c.relname||chr(30)||regexp_replace(pg_get_indexdef(c.oid),'[[:space:]]+','','g')||
           chr(30)||coalesce(array_to_string(c.reloptions,','),'<null>')||chr(30)||
           coalesce(obj_description(c.oid,'pg_class'),'<null>'),chr(31) ORDER BY c.relname))
    INTO v_assinatura_indices
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
   WHERE i.indrelid='public.financiamento_verificacoes'::regclass;
  SELECT count(*) INTO v_view_security FROM pg_class
   WHERE oid='public.financiamento_verificacoes_publico'::regclass
     AND reloptions @> ARRAY['security_invoker=true'] AND cardinality(reloptions)=1;
  SELECT count(*) INTO v_rls FROM pg_class
   WHERE oid='public.financiamento_verificacoes'::regclass
     AND relrowsecurity AND NOT relforcerowsecurity;
  SELECT count(*) INTO v_donos_invalidos
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN (
     'financiamento_publicado_recusa_verificacao','financiamento_verificacao_recusa_publicado'
   ) AND p.proowner IS DISTINCT FROM (SELECT relowner FROM pg_class WHERE oid='public.financiamento'::regclass);
  v_donos_invalidos := v_donos_invalidos + (
    SELECT count(*) FROM pg_class
     WHERE oid IN ('public.financiamento_verificacoes'::regclass,'public.financiamento_verificacoes_publico'::regclass)
       AND relowner IS DISTINCT FROM (SELECT relowner FROM pg_class WHERE oid='public.financiamento'::regclass)
  );
  WITH atual AS (
    SELECT p.proname, p.proowner, x.grantor, x.grantee,
           x.privilege_type, x.is_grantable
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
     WHERE n.nspname='public' AND p.proname IN (
       'financiamento_publicado_recusa_verificacao',
       'financiamento_verificacao_recusa_publicado'
     )
  ), por_funcao AS (
    SELECT proname,
           count(*) FILTER (
             WHERE grantor IS DISTINCT FROM proowner
                OR grantee NOT IN (0::oid,proowner)
                OR privilege_type <> 'EXECUTE'
                OR is_grantable
           ) + abs(count(*)-2) AS invalidos
      FROM atual
     GROUP BY proname
  )
  SELECT coalesce(sum(invalidos),0) + abs(count(*)-2)
    INTO v_acl_funcoes_exato_invalidos
    FROM por_funcao;
  WITH atual AS (
    SELECT p.proname, p.proowner, x.grantor, x.grantee,
           x.privilege_type, x.is_grantable
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
     WHERE n.nspname='public' AND p.proname IN (
       'financiamento_publicado_recusa_verificacao',
       'financiamento_verificacao_recusa_publicado'
     )
  ), por_funcao AS (
    SELECT proname,
           count(*) FILTER (
             WHERE grantor IS DISTINCT FROM proowner
                OR grantee NOT IN (
                  0::oid,proowner,
                  (SELECT oid FROM pg_roles WHERE rolname='anon'),
                  (SELECT oid FROM pg_roles WHERE rolname='authenticated'),
                  (SELECT oid FROM pg_roles WHERE rolname='service_role')
                )
                OR privilege_type <> 'EXECUTE'
                OR is_grantable
           ) + abs(count(*)-5) AS invalidos
      FROM atual
     GROUP BY proname
  )
  SELECT coalesce(sum(invalidos),0) + abs(count(*)-2)
    INTO v_acl_funcoes_automatico_invalidos
    FROM por_funcao;
  WITH objetos AS (
    SELECT c.oid,c.relname,c.relowner,a.*
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
     WHERE c.oid IN ('public.financiamento_verificacoes'::regclass,'public.financiamento_verificacoes_publico'::regclass)
  )
  SELECT
    count(*) FILTER (WHERE grantor IS DISTINCT FROM relowner)
    + count(*) FILTER (WHERE grantee NOT IN (relowner,(SELECT oid FROM pg_roles WHERE rolname='service_role')))
    + count(*) FILTER (WHERE grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role') AND is_grantable)
    + count(*) FILTER (WHERE grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role')
                       AND NOT ((relname='financiamento_verificacoes' AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE'))
                                OR (relname='financiamento_verificacoes_publico' AND privilege_type='SELECT')))
    + CASE WHEN count(*) FILTER (WHERE grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role'))=5 THEN 0 ELSE 1 END
    INTO v_acl_invalidos
    FROM objetos;
  WITH esperado(relname,rolname,privilege_type) AS (
    VALUES
      ('financiamento_verificacoes','service_role','SELECT'),
      ('financiamento_verificacoes','service_role','INSERT'),
      ('financiamento_verificacoes','service_role','UPDATE'),
      ('financiamento_verificacoes','service_role','DELETE'),
      ('financiamento_verificacoes','service_role','TRUNCATE'),
      ('financiamento_verificacoes','service_role','REFERENCES'),
      ('financiamento_verificacoes','service_role','TRIGGER'),
      ('financiamento_verificacoes','service_role','MAINTAIN'),
      ('financiamento_verificacoes_publico','service_role','SELECT'),
      ('financiamento_verificacoes_publico','service_role','INSERT'),
      ('financiamento_verificacoes_publico','service_role','UPDATE'),
      ('financiamento_verificacoes_publico','service_role','DELETE'),
      ('financiamento_verificacoes_publico','service_role','TRUNCATE'),
      ('financiamento_verificacoes_publico','service_role','REFERENCES'),
      ('financiamento_verificacoes_publico','service_role','TRIGGER'),
      ('financiamento_verificacoes_publico','service_role','MAINTAIN'),
      ('financiamento_verificacoes_publico','anon','SELECT'),
      ('financiamento_verificacoes_publico','authenticated','SELECT')
  ), atual AS (
    SELECT c.relname,coalesce(r.rolname,'PUBLIC') AS rolname,
           x.privilege_type,x.is_grantable,x.grantor,c.relowner
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
      LEFT JOIN pg_roles r ON r.oid=x.grantee
     WHERE c.oid IN ('public.financiamento_verificacoes'::regclass,
                     'public.financiamento_verificacoes_publico'::regclass)
       AND x.grantee<>c.relowner
  )
  SELECT count(*) FILTER (
           WHERE e.relname IS NULL OR a.is_grantable OR a.grantor IS DISTINCT FROM a.relowner
         ) + abs(count(*)-18)
    INTO v_acl_automatico_invalidos
    FROM atual a LEFT JOIN esperado e USING (relname,rolname,privilege_type);
  SELECT
    (SELECT count(*) FROM pg_policy WHERE polrelid='public.financiamento_verificacoes'::regclass)
    + abs((SELECT count(*) FROM pg_index WHERE indrelid='public.financiamento_verificacoes'::regclass)-2)
    + abs((SELECT count(*) FROM pg_trigger WHERE tgrelid='public.financiamento_verificacoes'::regclass AND NOT tgisinternal)-1)
    + (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.financiamento_verificacoes_publico'::regclass)
    + abs((SELECT count(*) FROM pg_rewrite WHERE ev_class='public.financiamento_verificacoes_publico'::regclass)-1)
    + (SELECT count(*) FROM pg_class v JOIN pg_class t ON t.oid='public.financiamento_verificacoes'::regclass
        WHERE v.oid='public.financiamento_verificacoes_publico'::regclass AND v.relowner IS DISTINCT FROM t.relowner)
    + (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
        CROSS JOIN LATERAL aclexplode(a.attacl) x
        WHERE a.attrelid='public.financiamento_verificacoes'::regclass AND a.attnum>0 AND x.grantee<>c.relowner)
    + CASE WHEN obj_description('public.financiamento_verificacoes'::regclass,'pg_class')
        IS DISTINCT FROM 'Desfecho por pleito sem linha financeira. Erro e nao coletado nunca afirmam ausencia.' THEN 1 ELSE 0 END
    + CASE WHEN obj_description('public.financiamento_verificacoes_publico'::regclass,'pg_class')
        IS DISTINCT FROM 'Proveniencia publica para ausencia oficial, nao coletado e erro de financiamento.' THEN 1 ELSE 0 END
    INTO v_extras_estruturais;
  IF v_assinatura_funcoes IS DISTINCT FROM '5f0c407b16814ae8204796628b83b32a'
     OR v_assinatura_triggers IS DISTINCT FROM 'ac36e44ec96c498594295c9607385ee6'
     OR v_assinatura_constraints IS DISTINCT FROM '22ffda2d082617d326188a377113741e'
     OR v_assinatura_view IS DISTINCT FROM 'e3051e92a595f2c92a68cebb05113c23'
     OR v_assinatura_colunas IS DISTINCT FROM '933e637cc9019772de2504fc9491e314'
     OR v_assinatura_relacoes IS DISTINCT FROM '9f2dd5dcf4ba85f61acec972768f0e88'
     OR v_assinatura_indices IS DISTINCT FROM '8a415c82daabd61ce9527da966c689b6'
     OR v_view_security <> 1
     OR (v_acl_invalidos <> 0 AND v_acl_automatico_invalidos <> 0)
     OR (v_acl_funcoes_exato_invalidos <> 0 AND v_acl_funcoes_automatico_invalidos <> 0)
     OR v_donos_invalidos <> 0
     OR v_extras_estruturais <> 0 OR v_rls <> 1 THEN
    RAISE EXCEPTION 'rollback financiamento_verificacoes: definição estrutural diverge da forward';
  END IF;
  SELECT count(*) INTO v_rows FROM public.financiamento_verificacoes;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'rollback financiamento_verificacoes: tabela contem % linha(s); reverta a carga primeiro',
      v_rows;
  END IF;

  SELECT count(*) INTO v_financiamento_identificado
  FROM public.financiamento
  WHERE sq_candidato IS NOT NULL OR uf_candidatura IS NOT NULL;
  IF v_financiamento_identificado <> 0 THEN
    RAISE EXCEPTION
      'rollback financiamento_verificacoes: financiamento contem % linha(s) com identidade nova; reverta a carga primeiro',
      v_financiamento_identificado;
  END IF;
END
$$;

DROP VIEW public.financiamento_verificacoes_publico;
DROP TRIGGER financiamento_verificacao_recusa_publicado_trigger
  ON public.financiamento_verificacoes;
DROP TRIGGER financiamento_publicado_recusa_verificacao_trigger
  ON public.financiamento;
DROP FUNCTION public.financiamento_verificacao_recusa_publicado();
DROP FUNCTION public.financiamento_publicado_recusa_verificacao();
DROP TABLE public.financiamento_verificacoes;
ALTER TABLE public.financiamento
  DROP CONSTRAINT IF EXISTS financiamento_uf_candidatura_check,
  DROP COLUMN IF EXISTS uf_candidatura,
  DROP COLUMN IF EXISTS sq_candidato;

DELETE FROM supabase_migrations.schema_migrations
 WHERE version = '20260810120000';
