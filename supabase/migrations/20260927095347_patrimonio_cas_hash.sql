BEGIN;

-- A server-computed equality token keeps the full asset list out of PostgREST URLs.
-- A tabela anterior tinha SELECT integral para anon/authenticated. Retirá-lo
-- antes de expor o hash e devolver SELECT somente às colunas anteriores.
-- O writer auditado lê o token com service_role.
DO $acl$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(c.relacl) acl
                 WHERE c.oid = 'public.patrimonio'::regclass
                   AND acl.grantee = 'anon'::regrole::oid AND acl.privilege_type = 'SELECT')
     OR NOT EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(c.relacl) acl
                    WHERE c.oid = 'public.patrimonio'::regclass
                      AND acl.grantee = 'authenticated'::regrole::oid AND acl.privilege_type = 'SELECT')
     OR EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(c.relacl) acl
                WHERE c.oid = 'public.patrimonio'::regclass
                  AND acl.grantee = 0 AND acl.privilege_type = 'SELECT')
     OR EXISTS (SELECT 1 FROM pg_attribute a, LATERAL aclexplode(a.attacl) acl
                WHERE a.attrelid = 'public.patrimonio'::regclass
                  AND acl.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid)
                  AND acl.privilege_type = 'SELECT') THEN
    RAISE EXCEPTION 'patrimonio CAS: ACL anterior inesperada; não alterar grants sem revisão';
  END IF;
END
$acl$;
ALTER TABLE public.patrimonio
  ADD COLUMN IF NOT EXISTS bens_hash text
  GENERATED ALWAYS AS (md5(COALESCE(bens::text, 'null'))) STORED;

REVOKE SELECT ON TABLE public.patrimonio FROM anon, authenticated;
GRANT SELECT (
  id, candidato_id, ano_eleicao, valor_total, bens, fonte, created_at,
  despublicacao_motivo, despublicado_em, ano_arquivo, sq_candidato,
  uf_candidatura, cargo_candidatura, data_eleicao, tipo_eleicao
) ON TABLE public.patrimonio TO anon, authenticated;

COMMIT;
