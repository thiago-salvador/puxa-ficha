#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
C="pf-financiamento-universo-$$"
M="$ROOT/QA/evidencias/2026-08-10-financiamento-universo/manifesto-235.json"
SCHEMA="$ROOT/supabase/migrations/20260810120000_financiamento_verificacoes_por_pleito.sql"
READBACK_SCHEMA="$ROOT/supabase/readback/20260810120000_financiamento_verificacoes_por_pleito.readback.sql"
FORWARD="$ROOT/supabase/migrations/20260810121000_financiamento_reconciliado_universo.sql"
READBACK="$ROOT/supabase/readback/20260810121000_financiamento_reconciliado_universo.readback.sql"
ROLLBACK="$ROOT/supabase/rollback/20260810121000_financiamento_reconciliado_universo.rollback.sql"
ROLLBACK_SCHEMA="$ROOT/supabase/rollback/20260810120000_financiamento_verificacoes_por_pleito.rollback.sql"

cleanup() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null
for _ in $(seq 1 40); do
  if docker exec "$C" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then break; fi
  sleep 0.25
done
docker exec "$C" pg_isready -U postgres -h 127.0.0.1 >/dev/null

psql_run() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_apply() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction "$@"; }
query() { docker exec "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtAc "$1" | tr -d '[:space:]'; }
assinatura_financiamento() {
  query "select md5(string_agg(concat_ws(chr(30),c.slug,f.ano_eleicao::text,f.total_arrecadado::text,f.total_fundo_partidario::text,f.total_fundo_eleitoral::text,f.total_pessoa_fisica::text,f.total_recursos_proprios::text,f.maiores_doadores::text,coalesce(f.fonte,'<null>'),coalesce(f.sq_candidato,'<null>'),coalesce(f.uf_candidatura,'<null>')),chr(31) order by c.slug,f.ano_eleicao)) from public.financiamento f join public.candidatos c on c.id=f.candidato_id where f.fonte='pf-ajustes-financiamento-20260810'"
}

psql_run <<'SQL'
CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome_completo text NOT NULL,
  nome_urna text NOT NULL
);
CREATE TABLE public.financiamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  ano_eleicao integer NOT NULL,
  total_arrecadado numeric NOT NULL DEFAULT 0,
  total_fundo_partidario numeric NOT NULL DEFAULT 0,
  total_fundo_eleitoral numeric NOT NULL DEFAULT 0,
  total_pessoa_fisica numeric NOT NULL DEFAULT 0,
  total_recursos_proprios numeric NOT NULL DEFAULT 0,
  maiores_doadores jsonb NOT NULL DEFAULT '[]'::jsonb,
  fonte text,
  UNIQUE (candidato_id, ano_eleicao)
);
CREATE TABLE public.coleta_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fonte text NOT NULL,
  escopo text NOT NULL,
  alvo text NOT NULL,
  candidato_id uuid REFERENCES public.candidatos(id),
  resultado text NOT NULL,
  volume integer NOT NULL DEFAULT 0,
  detalhe text,
  url text,
  execucao text,
  natureza text NOT NULL DEFAULT 'coleta'
);
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
SQL

node - "$M" <<'NODE' | psql_run
const manifest = require(process.argv[2])
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
const identities = new Map()
for (const row of manifest.targets) {
  const current = identities.get(row.slug)
  const identity = { nome_completo: row.nome_completo, nome_urna: row.nome_urna }
  if (current && JSON.stringify(current) !== JSON.stringify(identity)) {
    throw new Error(`identidade divergente no manifesto: ${row.slug}`)
  }
  identities.set(row.slug, identity)
}
const ordinary = [...identities].filter(([slug]) => slug !== "orleans-brandao")
process.stdout.write(`INSERT INTO public.candidatos (slug,nome_completo,nome_urna) VALUES ${ordinary.map(([slug, row]) => `(${quote(slug)},${quote(row.nome_completo)},${quote(row.nome_urna)})`).join(",")};\n`)
const orleans = identities.get("orleans-brandao")
process.stdout.write(`INSERT INTO public.candidatos (id,slug,nome_completo,nome_urna) VALUES ('47a1de10-1cf7-47f8-837b-dbbf94480421','orleans-brandao',${quote(orleans.nome_completo)},${quote(orleans.nome_urna)});\n`)
NODE

psql_run <<'SQL'
INSERT INTO public.financiamento (candidato_id, ano_eleicao, total_arrecadado, fonte)
SELECT id, 2006, 11000, 'TSE'
FROM public.candidatos
WHERE slug = 'rui-costa-pimenta';
SQL

psql_apply < "$SCHEMA"
psql_run -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260810120000');"
psql_run < "$READBACK_SCHEMA"
echo "PASS readback de schema: contrato, RLS, exclusividade e ledger"
psql_run <<'SQL'
INSERT INTO public.financiamento_verificacoes(candidato_id,ano_eleicao,resultado,detalhe,execucao)
SELECT id,2098,'erro','posterior','posterior' FROM public.candidatos WHERE slug='cabo-daciolo';
SQL
if psql_run < "$READBACK_SCHEMA" >/dev/null 2>&1; then
  echo "FAIL: readback de schema aceitou linha posterior antes da carga" >&2
  exit 1
fi
psql_run -c "DELETE FROM public.financiamento_verificacoes WHERE execucao='posterior';"
psql_run < "$READBACK_SCHEMA"
echo "PASS contrato vazio: linha posterior foi recusada"
psql_run <<'SQL'
CREATE OR REPLACE FUNCTION public.financiamento_publicado_recusa_verificacao()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.financiamento_verificacao_recusa_publicado()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
SQL
if psql_run < "$READBACK_SCHEMA" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou funções de exclusividade inertes" >&2
  exit 1
fi
if psql_apply < "$ROLLBACK_SCHEMA" >/dev/null 2>&1; then
  echo "FAIL: rollback derrubou contrato com funções inertes" >&2
  exit 1
fi
[[ "$(query "select count(*) from supabase_migrations.schema_migrations where version='20260810120000'")" == 1 ]]
[[ "$(query "select count(*) from information_schema.tables where table_schema='public' and table_name='financiamento_verificacoes'")" == 1 ]]
awk '/^CREATE OR REPLACE FUNCTION public\.financiamento_publicado_recusa_verificacao\(\)/,/^\$\$;/' "$SCHEMA" | psql_run
awk '/^CREATE OR REPLACE FUNCTION public\.financiamento_verificacao_recusa_publicado\(\)/,/^\$\$;/' "$SCHEMA" | psql_run
psql_run < "$READBACK_SCHEMA"
echo "PASS anti-inércia: readback e rollback recusam funções adulteradas"
psql_run <<'SQL'
ALTER TABLE public.financiamento DISABLE TRIGGER financiamento_publicado_recusa_verificacao_trigger;
ALTER TABLE public.financiamento_verificacoes ALTER COLUMN resultado DROP NOT NULL;
ALTER TABLE public.financiamento_verificacoes ALTER COLUMN detalhe SET STATISTICS 42;
ALTER VIEW public.financiamento_verificacoes_publico SET (security_invoker=false);
GRANT SELECT ON public.financiamento_verificacoes_publico TO anon;
GRANT SELECT(detalhe) ON public.financiamento_verificacoes TO anon;
GRANT SELECT(detalhe) ON public.financiamento_verificacoes_publico TO anon;
GRANT UPDATE(sq_candidato) ON public.financiamento TO anon;
GRANT SELECT ON public.financiamento_verificacoes_publico TO service_role WITH GRANT OPTION;
CREATE POLICY posterior ON public.financiamento_verificacoes FOR SELECT TO anon USING (true);
ALTER TABLE public.financiamento_verificacoes FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN public.financiamento_verificacoes.detalhe IS 'posterior';
CREATE RULE financiamento_verificacoes_publico_posterior AS
  ON UPDATE TO public.financiamento_verificacoes_publico DO INSTEAD NOTHING;
CREATE TRIGGER financiamento_verificacoes_publico_posterior
  INSTEAD OF UPDATE ON public.financiamento_verificacoes_publico
  FOR EACH ROW EXECUTE FUNCTION public.financiamento_verificacao_recusa_publicado();
SQL
if psql_run < "$READBACK_SCHEMA" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou trigger, coluna, view e ACL adulterados" >&2
  exit 1
fi
if psql_apply < "$ROLLBACK_SCHEMA" >/dev/null 2>&1; then
  echo "FAIL: rollback derrubou estrutura adulterada" >&2
  exit 1
fi
psql_run <<'SQL'
ALTER TABLE public.financiamento ENABLE TRIGGER financiamento_publicado_recusa_verificacao_trigger;
ALTER TABLE public.financiamento_verificacoes ALTER COLUMN resultado SET NOT NULL;
ALTER TABLE public.financiamento_verificacoes ALTER COLUMN detalhe SET STATISTICS -1;
ALTER VIEW public.financiamento_verificacoes_publico SET (security_invoker=true);
REVOKE SELECT ON public.financiamento_verificacoes_publico FROM anon;
REVOKE SELECT(detalhe) ON public.financiamento_verificacoes FROM anon;
REVOKE SELECT(detalhe) ON public.financiamento_verificacoes_publico FROM anon;
REVOKE UPDATE(sq_candidato) ON public.financiamento FROM anon;
REVOKE GRANT OPTION FOR SELECT ON public.financiamento_verificacoes_publico FROM service_role;
DROP POLICY posterior ON public.financiamento_verificacoes;
ALTER TABLE public.financiamento_verificacoes NO FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN public.financiamento_verificacoes.detalhe IS NULL;
DROP TRIGGER financiamento_verificacoes_publico_posterior ON public.financiamento_verificacoes_publico;
DROP RULE financiamento_verificacoes_publico_posterior ON public.financiamento_verificacoes_publico;
SQL
psql_run < "$READBACK_SCHEMA"
echo "PASS contrato estrutural: colunas, trigger, security_invoker e ACL assinados"
psql_run <<'SQL'
GRANT EXECUTE ON FUNCTION public.financiamento_publicado_recusa_verificacao() TO anon;
COMMENT ON FUNCTION public.financiamento_verificacao_recusa_publicado() IS 'posterior';
SQL
if psql_run < "$READBACK_SCHEMA" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou ACL ou comentário posterior nas funções" >&2
  exit 1
fi
if psql_apply < "$ROLLBACK_SCHEMA" >/dev/null 2>&1; then
  echo "FAIL: rollback derrubou funções com ACL ou comentário posterior" >&2
  exit 1
fi
[[ "$(query "select count(*) from supabase_migrations.schema_migrations where version='20260810120000'")" == 1 ]]
[[ "$(query "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('financiamento_publicado_recusa_verificacao','financiamento_verificacao_recusa_publicado')")" == 2 ]]
psql_run <<'SQL'
DROP TRIGGER financiamento_verificacao_recusa_publicado_trigger ON public.financiamento_verificacoes;
DROP TRIGGER financiamento_publicado_recusa_verificacao_trigger ON public.financiamento;
DROP FUNCTION public.financiamento_verificacao_recusa_publicado();
DROP FUNCTION public.financiamento_publicado_recusa_verificacao();
SQL
awk '/^CREATE OR REPLACE FUNCTION public\.financiamento_publicado_recusa_verificacao\(\)/,/^\$\$;/' "$SCHEMA" | psql_run
awk '/^CREATE TRIGGER financiamento_publicado_recusa_verificacao_trigger/,/FOR EACH ROW EXECUTE FUNCTION public\.financiamento_publicado_recusa_verificacao\(\);/' "$SCHEMA" | psql_run
awk '/^CREATE OR REPLACE FUNCTION public\.financiamento_verificacao_recusa_publicado\(\)/,/^\$\$;/' "$SCHEMA" | psql_run
awk '/^CREATE TRIGGER financiamento_verificacao_recusa_publicado_trigger/,/FOR EACH ROW EXECUTE FUNCTION public\.financiamento_verificacao_recusa_publicado\(\);/' "$SCHEMA" | psql_run
psql_run < "$READBACK_SCHEMA"
echo "PASS ACL de função: proacl e comentários posteriores são recusados"
psql_run <<'SQL'
ALTER TABLE public.financiamento_verificacoes OWNER TO anon;
ALTER VIEW public.financiamento_verificacoes_publico OWNER TO anon;
ALTER FUNCTION public.financiamento_publicado_recusa_verificacao() OWNER TO anon;
ALTER FUNCTION public.financiamento_verificacao_recusa_publicado() OWNER TO anon;
SQL
if psql_run < "$READBACK_SCHEMA" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou ownership transferido a anon" >&2
  exit 1
fi
if psql_apply < "$ROLLBACK_SCHEMA" >/dev/null 2>&1; then
  echo "FAIL: rollback derrubou objetos com owner posterior" >&2
  exit 1
fi
psql_run <<'SQL'
ALTER TABLE public.financiamento_verificacoes OWNER TO postgres;
ALTER VIEW public.financiamento_verificacoes_publico OWNER TO postgres;
ALTER FUNCTION public.financiamento_publicado_recusa_verificacao() OWNER TO postgres;
ALTER FUNCTION public.financiamento_verificacao_recusa_publicado() OWNER TO postgres;
SQL
psql_run < "$READBACK_SCHEMA"
echo "PASS ownership: objetos novos ancorados ao owner da tabela existente"
psql_run <<'SQL'
INSERT INTO public.financiamento_verificacoes (
  candidato_id, ano_eleicao, resultado, detalhe, execucao
)
SELECT id, 2099, 'erro', 'prova de exclusividade', 'harness-exclusividade'
FROM public.candidatos
WHERE slug = 'cabo-daciolo';
SQL
if psql_run <<'SQL' >/dev/null 2>&1
INSERT INTO public.financiamento (candidato_id, ano_eleicao, total_arrecadado, fonte)
SELECT id, 2099, 1, 'harness-exclusividade'
FROM public.candidatos
WHERE slug = 'cabo-daciolo';
SQL
then
  echo "FAIL: schema aceitou financiamento ao lado de verificacao" >&2
  exit 1
fi
psql_run <<'SQL'
DELETE FROM public.financiamento_verificacoes WHERE execucao = 'harness-exclusividade';
INSERT INTO public.financiamento (candidato_id, ano_eleicao, total_arrecadado, fonte)
SELECT id, 2099, 1, 'harness-exclusividade'
FROM public.candidatos
WHERE slug = 'cabo-daciolo';
SQL
if psql_run <<'SQL' >/dev/null 2>&1
INSERT INTO public.financiamento_verificacoes (
  candidato_id, ano_eleicao, resultado, detalhe, execucao
)
SELECT id, 2099, 'erro', 'nao deve coexistir', 'harness-exclusividade'
FROM public.candidatos
WHERE slug = 'cabo-daciolo';
SQL
then
  echo "FAIL: schema aceitou verificacao ao lado de financiamento publicado" >&2
  exit 1
fi
psql_run <<'SQL'
DELETE FROM public.financiamento WHERE fonte = 'harness-exclusividade';
SQL
echo "PASS exclusividade atomica: os dois estados se recusam mutuamente"

psql_apply < "$FORWARD"
psql_run -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260810121000');"
psql_run < "$READBACK"
psql_run < "$READBACK_SCHEMA"

[[ "$(query "select count(*) from public.financiamento where fonte='pf-ajustes-financiamento-20260810'")" == 141 ]]
[[ "$(query "select count(*) from public.financiamento_verificacoes where execucao='pf-ajustes-financiamento-20260810'")" == 94 ]]
[[ "$(query "select count(*) from public.coleta_log where execucao='pf-ajustes-financiamento-20260810'")" == 235 ]]
echo "PASS forward/readback: 235 alvos, 141 publicados, 57 ausencias, 37 erros"
echo "PASS readback schema: contrato 120000 permanece valido apos a carga 121000"

psql_run <<'SQL'
UPDATE public.candidatos
SET slug = 'carlos-brandao-ma-historico'
WHERE id = '47a1de10-1cf7-47f8-837b-dbbf94480421'
  AND slug = 'orleans-brandao'
  AND nome_completo = 'Carlos Orleans Brandão Junior'
  AND nome_urna = 'Orleans Brandao';
INSERT INTO public.candidatos(id,slug,nome_completo,nome_urna)
VALUES (
  'b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601',
  'orleans-brandao',
  'Carlos Orleans Braide Brandão',
  'Orleans Brandao'
);
INSERT INTO supabase_migrations.schema_migrations(version)
VALUES ('20260811102100');
SQL
psql_run < "$READBACK"
echo "PASS composição temporal: split de identidade preserva os três alvos do homônimo arquivado"

psql_run -c "UPDATE public.candidatos SET nome_completo='Pessoa Errada' WHERE id='47a1de10-1cf7-47f8-837b-dbbf94480421';"
if psql_run < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou identidade adulterada do homônimo arquivado" >&2
  exit 1
fi
psql_run -c "UPDATE public.candidatos SET nome_completo='Carlos Orleans Brandão Junior' WHERE id='47a1de10-1cf7-47f8-837b-dbbf94480421';"
psql_run < "$READBACK"
echo "PASS identidade fail-closed: homônimo arquivado é ancorado por UUID, nome e nome de urna"

psql_run <<'SQL'
DELETE FROM supabase_migrations.schema_migrations WHERE version='20260811102100';
DELETE FROM public.candidatos WHERE id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601';
UPDATE public.candidatos SET slug='orleans-brandao'
WHERE id='47a1de10-1cf7-47f8-837b-dbbf94480421';
SQL

psql_run <<'SQL'
INSERT INTO public.coleta_log(fonte,escopo,alvo,resultado,volume,execucao,natureza)
VALUES ('financiamento-tse','candidato-ano','extra:2099','erro',0,'pf-ajustes-financiamento-20260810','coleta');
SQL
if psql_run < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou coleta_log extra no mesmo marcador" >&2
  exit 1
fi
[[ "$(query "select count(*) from public.coleta_log where execucao='pf-ajustes-financiamento-20260810'")" == 236 ]]
psql_run -c "DELETE FROM public.coleta_log WHERE alvo='extra:2099' AND execucao='pf-ajustes-financiamento-20260810';"
psql_run < "$READBACK"
echo "PASS readback adversarial: linha extra com o mesmo marcador foi recusada"

psql_run -c "UPDATE public.coleta_log SET fonte='tse-adulterado' WHERE alvo=(SELECT min(alvo) FROM public.coleta_log WHERE execucao='pf-ajustes-financiamento-20260810') AND execucao='pf-ajustes-financiamento-20260810';"
if psql_run < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou fonte adulterada com cardinalidade constante" >&2
  exit 1
fi
[[ "$(query "select count(*) from public.coleta_log where fonte='tse-adulterado'")" == 1 ]]
psql_run -c "UPDATE public.coleta_log SET fonte='tse' WHERE fonte='tse-adulterado' AND execucao='pf-ajustes-financiamento-20260810';"
psql_run < "$READBACK"
echo "PASS readback adversarial: nove campos de proveniência assinados"
psql_run -c "UPDATE public.coleta_log SET natureza='curadoria' WHERE alvo=(SELECT min(alvo) FROM public.coleta_log WHERE execucao='pf-ajustes-financiamento-20260810') AND execucao='pf-ajustes-financiamento-20260810';"
if psql_run < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou natureza adulterada" >&2
  exit 1
fi
psql_run -c "UPDATE public.coleta_log SET natureza='coleta' WHERE natureza='curadoria' AND execucao='pf-ajustes-financiamento-20260810';"
psql_run < "$READBACK"
echo "PASS readback adversarial: natureza da proveniência assinada"

psql_run <<'SQL'
UPDATE public.financiamento f
SET total_arrecadado = total_arrecadado + 1
FROM public.candidatos c
WHERE c.id = f.candidato_id
  AND f.fonte = 'pf-ajustes-financiamento-20260810'
  AND c.slug NOT IN ('cabo-daciolo', 'flavio-bolsonaro', 'rui-costa-pimenta')
  AND f.id = (
    SELECT f2.id
    FROM public.financiamento f2
    JOIN public.candidatos c2 ON c2.id = f2.candidato_id
    WHERE f2.fonte = 'pf-ajustes-financiamento-20260810'
      AND c2.slug NOT IN ('cabo-daciolo', 'flavio-bolsonaro', 'rui-costa-pimenta')
    ORDER BY c2.slug, f2.ano_eleicao
    LIMIT 1
  );
SQL
if psql_run < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou adulteracao de payload fora das regressoes nomeadas" >&2
  exit 1
fi
assinatura_mutada="$(assinatura_financiamento)"
[[ "$assinatura_mutada" != "69cf0d34f0760fca504e174d5bdf2ec2" ]]
if psql_apply < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback apagou payload financeiro adulterado" >&2
  exit 1
fi
[[ "$(assinatura_financiamento)" == "$assinatura_mutada" ]]
[[ "$(query "select count(*) from public.financiamento where fonte='pf-ajustes-financiamento-20260810'")" == 141 ]]
[[ "$(query "select count(*) from public.financiamento_verificacoes where execucao='pf-ajustes-financiamento-20260810'")" == 94 ]]
[[ "$(query "select count(*) from public.coleta_log where execucao='pf-ajustes-financiamento-20260810'")" == 235 ]]
[[ "$(query "select count(*) from supabase_migrations.schema_migrations where version='20260810121000'")" == 1 ]]
echo "PASS rollback adversarial: payload mutado e ledger preservados"
psql_run <<'SQL'
UPDATE public.financiamento f
SET total_arrecadado = total_arrecadado - 1
FROM public.candidatos c
WHERE c.id = f.candidato_id
  AND f.fonte = 'pf-ajustes-financiamento-20260810'
  AND c.slug NOT IN ('cabo-daciolo', 'flavio-bolsonaro', 'rui-costa-pimenta')
  AND f.id = (
    SELECT f2.id
    FROM public.financiamento f2
    JOIN public.candidatos c2 ON c2.id = f2.candidato_id
    WHERE f2.fonte = 'pf-ajustes-financiamento-20260810'
      AND c2.slug NOT IN ('cabo-daciolo', 'flavio-bolsonaro', 'rui-costa-pimenta')
    ORDER BY c2.slug, f2.ano_eleicao
    LIMIT 1
  );
SQL
psql_run < "$READBACK"
echo "PASS readback adversarial: payload adulterado foi recusado"

psql_apply < "$ROLLBACK"
[[ "$(query "select count(*) from public.financiamento where fonte='pf-ajustes-financiamento-20260810'")" == 0 ]]
[[ "$(query "select count(*) from public.financiamento_verificacoes where execucao='pf-ajustes-financiamento-20260810'")" == 0 ]]
[[ "$(query "select count(*) from public.coleta_log where execucao='pf-ajustes-financiamento-20260810'")" == 0 ]]
[[ "$(query "select count(*) from supabase_migrations.schema_migrations where version='20260810121000'")" == 0 ]]
[[ "$(query "select count(*) from supabase_migrations.schema_migrations where version='20260810120000'")" == 1 ]]
echo "PASS rollback: somente a coorte marcada foi removida"

psql_apply < "$FORWARD"
if psql_apply < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback da carga aceitou ledger ausente" >&2
  exit 1
fi
[[ "$(query "select count(*) from public.coleta_log where execucao='pf-ajustes-financiamento-20260810'")" == 235 ]]
psql_run -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260810121000');"
psql_apply < "$ROLLBACK"
echo "PASS rollback da carga: ledger ausente aborta preservando a coorte"

psql_run <<'SQL'
INSERT INTO public.financiamento (candidato_id, ano_eleicao, total_arrecadado, fonte)
SELECT id, 2006, 1, 'drift-adversarial'
FROM public.candidatos
WHERE slug = 'cabo-daciolo';
SQL
if psql_apply < "$FORWARD" >/dev/null 2>&1; then
  echo "FAIL: forward aceitou drift do universo" >&2
  exit 1
fi
[[ "$(query "select count(*) from public.coleta_log where execucao='pf-ajustes-financiamento-20260810'")" == 0 ]]
[[ "$(query "select count(*) from public.financiamento_verificacoes where execucao='pf-ajustes-financiamento-20260810'")" == 0 ]]
echo "PASS fail-closed: drift abortou a transacao sem escrita parcial"

psql_run <<'SQL'
DELETE FROM public.financiamento WHERE fonte = 'drift-adversarial';
SQL
psql_run -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260810120000';"
if psql_apply < "$ROLLBACK_SCHEMA" >/dev/null 2>&1; then
  echo "FAIL: rollback de schema aceitou ledger ausente" >&2
  exit 1
fi
[[ "$(query "select count(*) from information_schema.tables where table_schema='public' and table_name='financiamento_verificacoes'")" == 1 ]]
psql_run -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260810120000');"
psql_apply < "$ROLLBACK_SCHEMA"
[[ "$(query "select count(*) from information_schema.tables where table_schema='public' and table_name='financiamento_verificacoes'")" == 0 ]]
[[ "$(query "select count(*) from information_schema.columns where table_schema='public' and table_name='financiamento' and column_name in ('sq_candidato','uf_candidatura')")" == 0 ]]
[[ "$(query "select count(*) from pg_constraint where conname='financiamento_uf_candidatura_check'")" == 0 ]]
[[ "$(query "select count(*) from supabase_migrations.schema_migrations where version='20260810120000'")" == 0 ]]
echo "PASS rollback de schema: tabela, colunas e constraint removidas apos carga revertida"
