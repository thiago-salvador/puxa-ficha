BEGIN;
DO $$
DECLARE
  view_def text;
BEGIN
  IF to_regclass('public.senado_suplencias_2026') IS NULL
     OR to_regclass('public.senado_suplencias_publico') IS NULL THEN
    RAISE EXCEPTION 'senado roster: tabela/view ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.senado_suplencias_2026'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'senado roster: RLS/force ausente';
  END IF;
  IF NOT has_column_privilege('anon','public.senado_suplencias_2026','nome_urna','SELECT')
     OR NOT has_column_privilege('authenticated','public.senado_suplencias_2026','nome_urna','SELECT')
     OR has_column_privilege('anon','public.senado_suplencias_2026','created_at','SELECT')
     OR has_column_privilege('authenticated','public.senado_suplencias_2026','created_at','SELECT') THEN
    RAISE EXCEPTION 'senado roster: ACL pública da tabela base divergiu';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    WHERE c.oid='public.senado_suplencias_2026'::regclass
      AND p.polname='senado_suplencias_public_read'
  ) THEN
    RAISE EXCEPTION 'senado roster: policy de leitura ausente';
  END IF;
  IF NOT has_table_privilege('anon','public.senado_suplencias_publico','SELECT') OR NOT has_table_privilege('authenticated','public.senado_suplencias_publico','SELECT') THEN
    RAISE EXCEPTION 'senado roster: view pública sem SELECT';
  END IF;
  SELECT pg_get_viewdef('public.senado_suplencias_publico'::regclass, true) INTO view_def;
  IF view_def NOT LIKE '%publicavel = true%' OR view_def NOT LIKE '%vinculo_verificado = true%' OR view_def NOT LIKE '%candidatos_publico%' OR view_def NOT LIKE '%cargo_disputado = ''Senador''%' OR view_def NOT LIKE '%tbase.slug = s.titular_slug%' OR view_def NOT LIKE '%tbase.sq_candidato_2026 = s.titular_sq_candidato%' THEN
    RAISE EXCEPTION 'senado roster: view sem predicados de publicação/identidade';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.candidatos'::regclass
      AND conname='candidatos_publicacao_minima_2026_check'
      AND convalidated
      AND pg_get_constraintdef(oid) LIKE '%Senador%'
  ) THEN
    RAISE EXCEPTION 'senado roster: contrato de publicação mínima ausente, sem Senador ou NOT VALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.senado_suplencias_2026 GROUP BY ano,uf,chave_chapa,ordem HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'senado roster: slot duplicado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.senado_suplencias_2026 WHERE ordem NOT IN (1,2) OR sq_candidato = titular_sq_candidato) THEN
    RAISE EXCEPTION 'senado roster: slot ou identidade inválida';
  END IF;
  -- O GRANT (id, slug, sq_candidato_2026) em candidatos só é seguro enquanto o
  -- RLS da tabela filtrar as linhas publicadas. Sem isso, o SQ de fichas não
  -- publicadas ficaria legível para anon/authenticated.
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.candidatos'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'senado roster: RLS de candidatos desabilitado; grant de sq_candidato_2026 exporia linhas não publicadas';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid='public.candidatos'::regclass
      AND p.polname='Leitura pública'
      AND p.polpermissive
      AND p.polcmd IN ('r','*')
      AND pg_get_expr(p.polqual, p.polrelid) LIKE '%(publicavel = true)%'
  ) THEN
    RAISE EXCEPTION 'senado roster: policy Leitura pública de candidatos não exige publicavel = true';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid='public.candidatos'::regclass
      AND p.polpermissive
      AND p.polcmd IN ('r','*')
      AND (p.polroles @> ARRAY[0::oid]
           OR p.polroles && ARRAY(SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated')))
      AND COALESCE(pg_get_expr(p.polqual, p.polrelid),'') NOT LIKE '%(publicavel = true)%'
  ) THEN
    RAISE EXCEPTION 'senado roster: policy permissiva de leitura em candidatos sem publicavel = true';
  END IF;
  IF NOT has_column_privilege('anon','public.candidatos','sq_candidato_2026','SELECT')
     OR NOT has_column_privilege('authenticated','public.candidatos','sq_candidato_2026','SELECT') THEN
    RAISE EXCEPTION 'senado roster: grant de sq_candidato_2026 ausente';
  END IF;
END $$;
COMMIT;
