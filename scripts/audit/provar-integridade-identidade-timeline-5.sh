#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD_SCHEMA="supabase/migrations/20260811102000_quarentena_identidade_timeline_schema.sql"
FWD="supabase/migrations/20260811102100_integridade_identidade_timeline_5.sql"
RBK="supabase/rollback/20260811102100_integridade_identidade_timeline_5.rollback.sql"
RBK_SCHEMA="supabase/rollback/20260811102000_quarentena_identidade_timeline_schema.rollback.sql"
READBACK="supabase/readback/20260811102100_integridade_identidade_timeline_5.readback.sql"
READBACK_SCHEMA="supabase/readback/20260811102000_quarentena_identidade_timeline_schema.readback.sql"
MANIFEST="tests/fixtures/integridade-identidade-timeline-5-manifest.json"
C="pf-identidade-timeline-$$"
DEP_ID="ffffffff-0000-0000-0000-000000000001"
EXPECTED_SCHEMA_SEM_CATEGORIAS_SHA256="ebce2da99eb2950893c67732a21df717d8a1f38ee580bccebf8c0c84cf0fa1d2"
EXPECTED_SCHEMA_COM_CATEGORIAS_SHA256="6e30487f921929be6ab5132d7261359527c61002fa1071b5018e396e2817fa3f"
EXPECTED_LEDGER_BASELINE_MD5="d41d8cd98f00b204e9800998ecf8427e"
limpar() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap limpar EXIT INT TERM

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres "$IMG" >/dev/null || exit 1
for _ in $(seq 1 60); do docker exec "$C" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
q() { docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
apply() { docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -q --single-transaction -f -; }
tx_file() { apply < "$1"; }
apply_migration() { { cat "$1"; printf "\nINSERT INTO supabase_migrations.schema_migrations(version) VALUES ('%s');\n" "$2"; } | apply; }
must_fail_tx() { { printf '%s\n' "$1"; cat "$2"; } | apply >/dev/null 2>&1 && { echo "FAIL esperado: $3"; exit 1; }; echo "PASS adversarial: $3"; }
must_pass_rollback() {
  { printf 'BEGIN;\n%s\n' "$1"; cat "$2"; printf '\nROLLBACK;\n'; } |
    q >/dev/null 2>&1 || { echo "FAIL esperado passar: $3"; exit 1; }
  echo "PASS compatibilidade: $3"
}
schema_dump() {
  docker exec "$C" pg_dump -U postgres --schema-only --no-owner --no-comments postgres |
    sed -E '/^(--|SET |SELECT pg_catalog\.set_config|\\restrict|\\unrestrict|$)/d'
}
schema_hash() { schema_dump | shasum -a 256 | awk '{print $1}'; }
ledger_hash() { q -c "select md5(coalesce(string_agg(version,'|' order by version),'')) from supabase_migrations.schema_migrations"; }
seed_manifest() {
  node - "$MANIFEST" <<'NODE' | apply
const fs = require("node:fs")
const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
for (const [table, rows] of Object.entries(manifest.tables)) {
  for (const row of rows) {
    const json = JSON.stringify(row)
    process.stdout.write(`INSERT INTO public.${table} SELECT (jsonb_populate_record(NULL::public.${table}, \$payload\$${json}\$payload\$::jsonb)).*;\n`)
  }
}
NODE
}

q <<'SQL' >/dev/null
create schema extensions;
create extension if not exists pgcrypto schema extensions;
create role anon; create role authenticated; create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
create table candidatos(
 id uuid primary key, nome_completo text not null, nome_urna text not null, slug text unique not null,
 data_nascimento date, idade integer, naturalidade text, formacao text, profissao_declarada text,
 genero text, estado_civil text, cor_raca text,
 partido_atual text not null, partido_sigla text not null, cargo_atual text, cargo_disputado text not null,
 estado text, status text not null constraint candidatos_status_dominio check(status in ('pre-candidato','candidato','indeferido','desistente','removido')),
 situacao_candidatura text, redes_sociais jsonb default '{}', fonte_dados text[], biografia text,
 publicavel boolean not null, ultima_atualizacao timestamptz not null, created_at timestamptz not null,
 site_campanha text, foto_url text, verificacao_campos jsonb
);
create view candidatos_publico with (security_invoker=true) as
select id,nome_completo,nome_urna,slug,data_nascimento,
       coalesce(idade,extract(year from age(current_date::timestamptz,data_nascimento::timestamptz))::integer) as idade,
       naturalidade,formacao,profissao_declarada,genero,estado_civil,cor_raca,
       partido_atual,partido_sigla,cargo_atual,cargo_disputado,estado,status,
       situacao_candidatura,biografia,foto_url,site_campanha,redes_sociais,
       (select array_agg(f.valor order by f.ord)
          from unnest(c.fonte_dados) with ordinality as f(valor,ord)
         where f.valor not like 'interno:%') as fonte_dados,
       ultima_atualizacao,verificacao_campos
  from candidatos c
 where status <> 'removido'::text and publicavel=true;
grant select on candidatos_publico to anon, authenticated;
create function is_public_candidate(uuid) returns boolean language sql stable as $$select true$$;
create table historico_politico(
 id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade,
 cargo text,periodo_inicio int,periodo_fim int,partido text,estado text,eleito_por text,
 observacoes text,created_at timestamptz,cargo_canonico text,tipo_evento text,proveniencia text,
 despublicacao_motivo text,despublicado_em timestamptz
);
create table mudancas_partido(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade,partido_anterior text not null,partido_novo text not null,data_mudanca date,ano int,contexto text,created_at timestamptz not null);
create table patrimonio(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade,ano_eleicao int,valor_total numeric(15,2),bens jsonb,fonte text,created_at timestamptz not null);
create table financiamento(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade,ano_eleicao int,total_arrecadado numeric(15,2),total_fundo_partidario numeric(15,2),total_fundo_eleitoral numeric(15,2),total_pessoa_fisica numeric(15,2),total_recursos_proprios numeric(15,2),maiores_doadores jsonb,maiores_doadores_publicos jsonb,fonte text,sq_candidato text,uf_candidatura text,created_at timestamptz not null);
create view financiamento_publico with (security_invoker=true) as
select f.id,f.candidato_id,f.ano_eleicao,f.total_arrecadado,f.total_fundo_partidario,
       f.total_fundo_eleitoral,f.total_pessoa_fisica,f.total_recursos_proprios,
       f.maiores_doadores_publicos as maiores_doadores,f.fonte,f.created_at,
       null::jsonb as categorias_origem
from financiamento f where is_public_candidate(f.candidato_id);
grant select on financiamento_publico to anon, authenticated;
create table processos(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table coleta_log(id uuid primary key,candidato_id uuid references candidatos(id) on delete set null);
create table notification_log(id uuid primary key,candidato_ids uuid[] not null default '{}');
create table votos_candidato(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table projetos_lei(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table pontos_atencao(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table gastos_parlamentares(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table sancoes_administrativas(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table noticias_candidato(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table posicoes_declaradas(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table legislacao_mandato_executivo(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table alert_subscriptions(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table candidate_changes(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table patrimonio_ausencia_oficial(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);
create table financiamento_verificacoes(id uuid primary key,candidato_id uuid references candidatos(id) on delete cascade);

insert into candidatos(
 id,nome_completo,nome_urna,slug,data_nascimento,naturalidade,formacao,profissao_declarada,
 partido_atual,partido_sigla,cargo_atual,cargo_disputado,estado,status,situacao_candidatura,
 redes_sociais,fonte_dados,biografia,publicavel,ultima_atualizacao,created_at
) values
('23dc2553-0fd3-489f-9ac1-4ed50b8ec5e3','João Jacques Soares Busnello','Coronel Busnello','coronel-busnello','1970-08-06',null,null,null,'Partido Missão','MISSAO',null,'Governador','RJ','pre-candidato','pre-candidato','{}','{}',null,true,'2026-08-05 11:54:11.147893+00','2026-07-30 14:27:52.971837+00'),
('baf8abd2-9386-48df-876e-1e8b16fa1e7f','Jeremias Cosmo Silva dos Santos','Professor Jeremias','jeremias-cosmo','1980-03-27',null,null,null,'Democrata','D35',null,'Governador','PE','pre-candidato','pre-candidato','{}','{}',null,true,'2026-07-30 16:18:35.732083+00','2026-07-30 14:27:52.971837+00'),
('a5fa816e-9e3b-40ae-8679-71568bed63da','João Rodrigues','João Rodrigues','joao-rodrigues','1967-03-23',null,null,null,'Partido Social Democrático','PSD',null,'Governador','SC','pre-candidato','pre-candidato','{}','{}',null,true,'2026-08-05 08:52:57.97+00','2026-03-31 02:25:56.070567+00'),
('47a1de10-1cf7-47f8-837b-dbbf94480421','Carlos Orleans Brandão Junior','Orleans Brandao','orleans-brandao','1958-06-02',null,null,null,'Movimento Democrático Brasileiro','MDB',null,'Governador','MA','pre-candidato','pre-candidato','{}','{}',null,true,'2026-06-09 14:31:33.240661+00','2026-03-31 02:47:47.335142+00'),
('81e00cd6-ea5b-4c19-8bff-a116fb73e5a7','José Renan Vasconcelos Calheiros Filho','Renan Filho','renan-filho','1979-10-08',null,null,null,'Movimento Democrático Brasileiro','MDB',null,'Governador','AL','pre-candidato','pre-candidato','{}','{}',null,true,'2026-08-09 05:52:15.681+00','2026-03-31 02:47:47.335142+00');

-- Completa o universo público congelado sem interferir nas cinco identidades.
insert into candidatos(
 id,nome_completo,nome_urna,slug,partido_atual,partido_sigla,cargo_disputado,
 estado,status,situacao_candidatura,publicavel,ultima_atualizacao,created_at
)
select format('90000000-0000-0000-0000-%s',lpad(i::text,12,'0'))::uuid,
       format('Fixture pública %s',i),format('Fixture %s',i),format('fixture-publica-%s',lpad(i::text,3,'0')),
       'Partido Fixture','FIX','Governador','SP','pre-candidato','pre-candidato',true,
       timestamptz '2026-08-11 00:00:00+00',timestamptz '2026-08-11 00:00:00+00'
from generate_series(1,189) i;

insert into historico_politico(id,candidato_id,periodo_inicio,estado,partido,despublicado_em,despublicacao_motivo) values
('aaaaaaaa-0000-0000-0000-000000002011','a5fa816e-9e3b-40ae-8679-71568bed63da',2011,'RS','PDT',null,null),
('aaaaaaaa-0000-0000-0000-000000002022','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7',2022,'RR','SD',null,null);
insert into mudancas_partido values
('bbbbbbbb-0000-0000-0000-000000000001','a5fa816e-9e3b-40ae-8679-71568bed63da','PDT','PODE',null,2022,'SQ 210001596122','2026-01-01'),
('bbbbbbbb-0000-0000-0000-000000000002','a5fa816e-9e3b-40ae-8679-71568bed63da','PDT','PODE',null,2022,'SQ 210001596122 duplicado','2026-01-02'),
('bbbbbbbb-0000-0000-0000-000000000003','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7','PRB','SD',null,2022,'RR','2026-01-03');
insert into patrimonio values('cccccccc-0000-0000-0000-000000000001','a5fa816e-9e3b-40ae-8679-71568bed63da',2011,1,'{}','TSE','2026-01-01');
insert into financiamento(id,candidato_id,ano_eleicao,total_arrecadado,maiores_doadores_publicos,fonte,created_at)
values('dddddddd-0000-0000-0000-000000000001','81e00cd6-ea5b-4c19-8bff-a116fb73e5a7',2011,1,'{}','TSE','2026-01-01');
SQL

seed_manifest
[[ "$(q -c "select count(*) from candidatos_publico")" == "194" ]] || { echo 'FAIL universo público inicial pela view canônica'; exit 1; }

# Prova a variante real de replay em que categorias_origem ainda não existe.
schema_without_categories_dump="$(schema_dump)"
schema_without_categories_before="$(printf '%s' "$schema_without_categories_dump" | shasum -a 256 | awk '{print $1}')"
ledger_without_categories_before="$(ledger_hash)"
[[ "$schema_without_categories_before" == "$EXPECTED_SCHEMA_SEM_CATEGORIAS_SHA256" ]] || { echo "FAIL baseline versionada sem categorias_origem: $schema_without_categories_before"; exit 1; }
[[ "$ledger_without_categories_before" == "$EXPECTED_LEDGER_BASELINE_MD5" ]] || { echo 'FAIL baseline versionada do ledger'; exit 1; }
apply_migration "$FWD_SCHEMA" "20260811102000"
[[ "$(q -f - < "$READBACK_SCHEMA" | tail -1)" == "1|6|3|1" ]] || { echo 'FAIL readback schema fallback'; exit 1; }
tx_file "$RBK_SCHEMA"
[[ "$(q -c "select to_regclass('public.identidade_timeline_quarentena_snapshot') is null")" == "t" ]] || exit 1
schema_without_categories_after_dump="$(schema_dump)"
if [[ "$schema_without_categories_after_dump" != "$schema_without_categories_dump" ]]; then
  echo 'FAIL pg_dump schema sem categorias_origem'
  diff -u <(printf '%s\n' "$schema_without_categories_dump") <(printf '%s\n' "$schema_without_categories_after_dump") | head -c 6000
  exit 1
fi
[[ "$(ledger_hash)" == "$ledger_without_categories_before" ]] || { echo 'FAIL ledger sem categorias_origem'; exit 1; }
q -c 'alter table financiamento add column categorias_origem jsonb' >/dev/null
q <<'SQL' >/dev/null
create or replace view financiamento_publico with (security_invoker=true) as
select f.id,f.candidato_id,f.ano_eleicao,f.total_arrecadado,f.total_fundo_partidario,
       f.total_fundo_eleitoral,f.total_pessoa_fisica,f.total_recursos_proprios,
       f.maiores_doadores_publicos as maiores_doadores,f.fonte,f.created_at,
       f.categorias_origem
from financiamento f where is_public_candidate(f.candidato_id);
grant select on financiamento_publico to anon, authenticated;
SQL
schema_with_categories_dump="$(schema_dump)"
schema_with_categories_before="$(printf '%s' "$schema_with_categories_dump" | shasum -a 256 | awk '{print $1}')"
ledger_with_categories_before="$(ledger_hash)"
[[ "$schema_with_categories_before" == "$EXPECTED_SCHEMA_COM_CATEGORIAS_SHA256" ]] || { echo "FAIL baseline versionada com categorias_origem: $schema_with_categories_before"; exit 1; }
[[ "$ledger_with_categories_before" == "$EXPECTED_LEDGER_BASELINE_MD5" ]] || { echo 'FAIL baseline versionada do ledger com categorias_origem'; exit 1; }
apply_migration "$FWD_SCHEMA" "20260811102000"

# O cron pode avançar o timestamp sem alterar identidade ou curadoria. A
# migration deve aceitar esse drift volátil e manter todo o restante fail-closed.
must_pass_rollback "update candidatos set ultima_atualizacao=timestamptz '2026-08-12 08:00:00.411+00' where id='a5fa816e-9e3b-40ae-8679-71568bed63da';" "$FWD" "cron altera somente ultima_atualizacao"

# Cada campo estável da tupla canônica é fail-closed, inclusive o domínio real de status.
while IFS='|' read -r campo valor; do
  must_fail_tx "update candidatos set $campo=$valor where id='23dc2553-0fd3-489f-9ac1-4ed50b8ec5e3';" "$FWD" "drift $campo"
done <<'EOF'
id|'eeeeeeee-0000-0000-0000-000000000001'::uuid
slug|'pessoa-errada'
nome_completo|'Pessoa Errada'
nome_urna|'Pessoa Errada'
data_nascimento|'1971-01-01'
estado|'SP'
cargo_disputado|'Senador'
partido_atual|'Outro'
partido_sigla|'OUTRO'
status|'candidato'
situacao_candidatura|'confirmada'
publicavel|false
created_at|'2026-01-01'
EOF

# O UUID allowlisted não basta. Ausência e drift em qualquer payload assinado
# devem abortar a transação inteira.
must_fail_tx "update mudancas_partido set partido_novo='OUTRO' where id='00a4b5e3-7bd7-4824-9aa2-573fe51a06e3';" "$FWD" "manifesto partido_novo adulterado"
must_fail_tx "update historico_politico set periodo_inicio=2099 where id='2cdb9e2c-fd82-4ff2-9535-c768cf723248';" "$FWD" "manifesto periodo_inicio adulterado"
must_fail_tx "update historico_politico set estado='ZZ' where id='2cdb9e2c-fd82-4ff2-9535-c768cf723248';" "$FWD" "manifesto UF adulterada"
must_fail_tx "update historico_politico set partido='OUTRO' where id='2cdb9e2c-fd82-4ff2-9535-c768cf723248';" "$FWD" "manifesto partido adulterado"
must_fail_tx "delete from patrimonio where id='33ad044c-71c7-4964-b563-b1f7f31e62da';" "$FWD" "manifesto linha ausente"
must_fail_tx "update financiamento set categorias_origem='{}'::jsonb where id='89c59acc-00ae-446e-9164-a82f01d25224';" "$FWD" "manifesto categorias_origem preenchida"

baseline="$(q -c "select md5(string_agg(x::text,'|' order by x::text)) from (select to_jsonb(c) x from candidatos c union all select to_jsonb(h) from historico_politico h union all select to_jsonb(m) from mudancas_partido m union all select to_jsonb(p) from patrimonio p union all select to_jsonb(f) from financiamento f) z")"
apply_migration "$FWD" "20260811102100"
must_pass_rollback "update candidatos set ultima_atualizacao=timestamptz '2026-08-12 09:00:00+00' where id='a5fa816e-9e3b-40ae-8679-71568bed63da';" "$READBACK" "readback aceita avanço posterior de ultima_atualizacao"
[[ "$(q -f - < "$READBACK" | tail -1)" == "1|5|1|0|3|1" ]] || { echo 'FAIL readback curadoria'; exit 1; }
[[ "$(q -c "select count(*) from identidade_timeline_quarentena_snapshot where row_id='aaaaaaaa-0000-0000-0000-000000002011' and postimage->>'despublicado_em' is not null")" == "1" ]] || { echo 'FAIL 2011 não quarentenado'; exit 1; }
[[ "$(q -c "select count(*) from identidade_timeline_quarentena_snapshot where preimage=postimage and tabela='historico_politico'")" == "12" ]] || { echo 'FAIL manifesto histórico'; exit 1; }
[[ "$(q -c "select count(*) from identidade_timeline_quarentena_snapshot where preimage=postimage and tabela='mudancas_partido'")" == "6" ]] || { echo 'FAIL manifesto partido'; exit 1; }
[[ "$(q -c "select count(*) from identidade_timeline_quarentena_snapshot where preimage=postimage and tabela='patrimonio'")" == "4" ]] || { echo 'FAIL manifesto patrimônio'; exit 1; }
[[ "$(q -c "select count(*) from identidade_timeline_quarentena_snapshot where preimage=postimage and tabela='financiamento'")" == "4" ]] || { echo 'FAIL manifesto financiamento'; exit 1; }
[[ "$(q -c "select count(*) from candidatos where slug='orleans-brandao' and status='pre-candidato' and publicavel=true and site_campanha='https://orleansbrandao.com.br/' and situacao_candidatura='Pré-candidatura declarada publicamente; não é candidatura registrada ou deferida no TSE.'")" == "1" ]] || { echo 'FAIL Orleans não ficou publicável com proveniência editorial'; exit 1; }
[[ "$(q -c "select count(*) from candidatos where slug='orleans-brandao' and cargo_atual is null")" == "1" ]] || { echo 'FAIL Orleans manteve cargo_atual stale'; exit 1; }
[[ "$(q -c "select count(*) from candidatos_publico")" == "194" ]] || { echo 'FAIL universo público pós-forward pela view canônica'; exit 1; }

# O readback mede novamente os postimages integrais, inclusive as âncoras
# recém-criadas. Cada mutação roda e é revertida na mesma transação.
must_fail_tx "update mudancas_partido set partido_novo='OUTRO' where id='65ed4abb-2b3e-4092-aeed-bee9bfd38fde';" "$READBACK" "readback âncora partido_novo adulterada"
must_fail_tx "update historico_politico set periodo_inicio=2099 where id='2cdb9e2c-fd82-4ff2-9535-c768cf723248';" "$READBACK" "readback período adulterado"
must_fail_tx "update historico_politico set estado='ZZ' where id='2cdb9e2c-fd82-4ff2-9535-c768cf723248';" "$READBACK" "readback UF adulterada"
must_fail_tx "update historico_politico set partido='OUTRO' where id='2cdb9e2c-fd82-4ff2-9535-c768cf723248';" "$READBACK" "readback partido adulterado"
must_fail_tx "delete from financiamento where id='89c59acc-00ae-446e-9164-a82f01d25224';" "$READBACK" "readback linha allowlisted ausente"
must_fail_tx "insert into candidatos(id,nome_completo,nome_urna,slug,partido_atual,partido_sigla,cargo_disputado,estado,status,situacao_candidatura,publicavel,ultima_atualizacao,created_at) values('90000000-0000-0000-0000-000000000999','Fixture indeferida','Fixture indeferida','fixture-indeferida','Partido Fixture','FIX','Governador','SP','indeferido','indeferido',true,now(),now());" "$READBACK" "readback recusa indeferido publicável que eleva a view a 195"
must_fail_tx "insert into candidatos(id,nome_completo,nome_urna,slug,partido_atual,partido_sigla,cargo_disputado,estado,status,situacao_candidatura,publicavel,ultima_atualizacao,created_at) values('90000000-0000-0000-0000-000000000998','Fixture desistente','Fixture desistente','fixture-desistente','Partido Fixture','FIX','Governador','SP','desistente','desistente',true,now(),now());" "$READBACK" "readback recusa desistente publicável que eleva a view a 195"
must_fail_tx "update candidatos set cargo_atual='Secretário de Estado de Assuntos Municipalistas' where slug='orleans-brandao';" "$READBACK" "readback recusa cargo_atual stale"
must_fail_tx "update candidatos set fonte_dados=array_append(fonte_dados,'https://seam.ma.gov.br/quem-e-quem') where slug='orleans-brandao';" "$READBACK" "readback recusa URL oficial 404"

# 102000 é recusada fora de ordem.
tx_file "$RBK_SCHEMA" >/dev/null 2>&1 && { echo 'FAIL rollback schema fora de ordem'; exit 1; }
echo 'PASS adversarial: rollback schema fora de ordem'

for caso in historico_politico mudancas_partido patrimonio financiamento votos_candidato projetos_lei processos pontos_atencao gastos_parlamentares sancoes_administrativas noticias_candidato posicoes_declaradas legislacao_mandato_executivo alert_subscriptions candidate_changes patrimonio_ausencia_oficial financiamento_verificacoes coleta_log future_fk notification_log; do
  case "$caso" in
    historico_politico) q -c "insert into historico_politico(id,candidato_id) values('$DEP_ID','b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601')" >/dev/null ;;
    mudancas_partido) q -c "insert into mudancas_partido(id,candidato_id,partido_anterior,partido_novo,created_at) values('$DEP_ID','b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601','A','B',now())" >/dev/null ;;
    patrimonio) q -c "insert into patrimonio(id,candidato_id,created_at) values('$DEP_ID','b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601',now())" >/dev/null ;;
    financiamento) q -c "insert into financiamento(id,candidato_id,created_at) values('$DEP_ID','b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601',now())" >/dev/null ;;
    processos) q -c "insert into processos values('$DEP_ID','b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601')" >/dev/null ;;
    coleta_log) q -c "insert into coleta_log values('$DEP_ID','b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601')" >/dev/null ;;
    future_fk) q -c "create table future_candidate_child(id uuid primary key,candidate_ref uuid references candidatos(id) on delete cascade); insert into future_candidate_child values('$DEP_ID','b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601')" >/dev/null ;;
    notification_log) q -c "insert into notification_log values('$DEP_ID',array['b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'::uuid])" >/dev/null ;;
    *) q -c "insert into $caso values('$DEP_ID','b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601')" >/dev/null ;;
  esac
  tx_file "$RBK" >/dev/null 2>&1 && { echo "FAIL rollback aceitou $caso"; exit 1; }
  [[ "$(q -c "select count(*) from candidatos where id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'")" == '1' ]] || { echo "FAIL rollback destruiu Orleans em $caso"; exit 1; }
  case "$caso" in
    processos) q -c "delete from processos where id='$DEP_ID'" >/dev/null ;;
    historico_politico|mudancas_partido|patrimonio|financiamento|votos_candidato|projetos_lei|pontos_atencao|gastos_parlamentares|sancoes_administrativas|noticias_candidato|posicoes_declaradas|legislacao_mandato_executivo|alert_subscriptions|candidate_changes|patrimonio_ausencia_oficial|financiamento_verificacoes) q -c "delete from $caso where id='$DEP_ID'" >/dev/null ;;
    coleta_log) q -c "delete from coleta_log where id='$DEP_ID'" >/dev/null ;;
    future_fk) q -c 'drop table future_candidate_child' >/dev/null ;;
    notification_log) q -c "delete from notification_log where id='$DEP_ID'" >/dev/null ;;
  esac
  echo "PASS adversarial: dependência $caso preservada"
done

# Uma segunda linha com o mesmo SQ/prefixo não pode ser capturada pelo rollback.
q -c "insert into mudancas_partido values('eeeeeeee-0000-0000-0000-000000000002','23dc2553-0fd3-489f-9ac1-4ed50b8ec5e3','PSD','MISSAO',null,2026,'SQ 190002544120 segunda linha legítima','2026-08-12')" >/dev/null

tx_file "$RBK"
[[ "$(q -c "select count(*) from mudancas_partido where id='eeeeeeee-0000-0000-0000-000000000002'")" == '1' ]] || { echo 'FAIL rollback capturou segunda linha de mesmo SQ'; exit 1; }
q -c "delete from mudancas_partido where id='eeeeeeee-0000-0000-0000-000000000002'" >/dev/null
[[ "$(q -c "select count(*) from candidatos_publico")" == "194" ]] || { echo 'FAIL universo público pós-rollback pela view canônica'; exit 1; }
# Mesmo sem 102100 no ledger, 102000 não pode apagar colunas com valor residual.
q -c "update mudancas_partido set despublicado_em=now(),despublicacao_motivo='residual' where id='bbbbbbbb-0000-0000-0000-000000000001'" >/dev/null
tx_file "$RBK_SCHEMA" >/dev/null 2>&1 && { echo 'FAIL rollback schema aceitou valor residual'; exit 1; }
[[ "$(q -c "select count(*) from information_schema.columns where table_name='mudancas_partido' and column_name='despublicado_em'")" == '1' ]] || { echo 'FAIL rollback schema apagou coluna com residual'; exit 1; }
q -c "update mudancas_partido set despublicado_em=null,despublicacao_motivo=null where id='bbbbbbbb-0000-0000-0000-000000000001'" >/dev/null
depois="$(q -c "select md5(string_agg(x::text,'|' order by x::text)) from (select to_jsonb(c) x from candidatos c union all select to_jsonb(h) from historico_politico h union all select to_jsonb(m) from mudancas_partido m union all select to_jsonb(p) from patrimonio p union all select to_jsonb(f) from financiamento f) z")"
[[ "$baseline" == "$depois" ]] || { echo "FAIL rollback integral $baseline != $depois"; exit 1; }
tx_file "$RBK_SCHEMA"
schema_with_categories_after_dump="$(schema_dump)"
if [[ "$schema_with_categories_after_dump" != "$schema_with_categories_dump" ]]; then
  echo 'FAIL pg_dump schema com categorias_origem'
  diff -u <(printf '%s\n' "$schema_with_categories_dump") <(printf '%s\n' "$schema_with_categories_after_dump") | head -c 6000
  exit 1
fi
[[ "$(ledger_hash)" == "$ledger_with_categories_before" ]] || { echo 'FAIL ledger com categorias_origem'; exit 1; }
echo "SCHEMA_SHA256_SEM_CATEGORIAS=$schema_without_categories_before"
echo "SCHEMA_SHA256_COM_CATEGORIAS=$schema_with_categories_before"
echo "PASS PostgreSQL 17: candidatos_publico=194 e adversariais indeferido/desistente, domínio, manifesto 12/6/4/4, fallback, pg_dump+ledger, 2011, seletor exato, FKs dinâmicas, logs e igualdade forward+rollback"
