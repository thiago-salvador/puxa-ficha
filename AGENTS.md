<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Migrations: GRANT explícito em objeto novo de `public`

A partir de 30/10/2026, a Supabase deixa de conceder por padrão
`SELECT/INSERT/UPDATE/DELETE` em tabelas, `EXECUTE` em funções e
`USAGE, SELECT` em sequences **novas** do schema `public` para `anon`,
`authenticated` e `service_role`. Objetos que já existem não mudam. Fontes:
[discussão #45329](https://github.com/orgs/supabase/discussions/45329) e
[Securing your API](https://supabase.com/docs/guides/api/securing-your-api).

Regra: toda migration que cria tabela, view, função/RPC ou sequence em `public`
traz, no mesmo arquivo, o `GRANT` explícito para cada papel que precisa do
objeto. Tabela nova também traz `ENABLE ROW LEVEL SECURITY` e só as policies de
que algum papel além de `service_role` precisa: tabela só de servidor fica com
RLS ligado e sem policy, como `request_ip_quotas`. View, função e sequence não
têm RLS nem policy. Objeto interno ou só de servidor recebe grant só para
`service_role` (ou nenhum) e diz isso num comentário. Sem o grant, o objeto existe no banco, mas a API recusa o acesso.

O padrão é o que as migrations desde `20260905` já seguem: `REVOKE ALL` antes,
`GRANT` mínimo depois. Referências: `20260929100000_financiamento_despesas.sql`
(tabela com grant por coluna e view pública) e
`20260905220100_request_ip_quota.sql` (função só de servidor).

```sql
-- Tabela lida pelo site e escrita só pelo servidor.
ALTER TABLE public.exemplo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exemplo FROM PUBLIC;
REVOKE ALL ON TABLE public.exemplo FROM anon, authenticated;
REVOKE ALL ON TABLE public.exemplo FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exemplo TO service_role;
GRANT SELECT ON TABLE public.exemplo TO anon, authenticated;

DROP POLICY IF EXISTS "Leitura pública" ON public.exemplo;
CREATE POLICY "Leitura pública"
  ON public.exemplo
  FOR SELECT
  TO anon, authenticated
  USING (public.is_public_candidate(candidato_id));

-- Função chamada só pelo servidor: sem grant para anon e authenticated.
REVOKE ALL ON FUNCTION public.exemplo_rpc(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exemplo_rpc(uuid) TO service_role;

-- Sequence, só quando a tabela usa identity ou serial (o padrão do repo é uuid).
REVOKE ALL ON SEQUENCE public.exemplo_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.exemplo_id_seq TO service_role;
```
