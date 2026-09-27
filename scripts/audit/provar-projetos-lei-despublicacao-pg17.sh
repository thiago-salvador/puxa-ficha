#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartável as migrations 20260927040000 (despublicação
# em projetos_lei: colunas, política pública, índice parcial e snapshot) e
# 20260927040100 (100 proposições do deputado federal 220614 despublicadas em
# dr-daniel), e 20260927040200 (33 proposições do Senado 1757 vinculadas
# indevidamente a pedro-cunha-lima), sobre o schema real de candidatos e coleta_log
# (scripts/audit/lib/chapas-2026-real-schema.sql). projetos_lei, votos_candidato,
# o snapshot e is_public_candidate reproduzem produção: RLS ligada, política
# "Leitura pública" para anon e o CHECK de tabela do snapshot antes da mudança.
#
# Prova: readbacks reprovam o pré-estado; a migration de schema reprova política
# divergente; a curadoria reprova conjunto de proposições adulterado, proposição
# a mais, proposição já despublicada, destaque, voto na ficha e verificacao_campos
# diferente; forward e readbacks em ordem; o papel anon deixa de ler as 100
# linhas e continua lendo a sentinela; readback reprova linha republicada;
# rollback de schema recusa com dado despublicado; rollback recusa migration
# posterior; rollback inverso devolve o estado inicial byte a byte.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
V="20260927040000_projetos_lei_despublicacao_schema"
V2="20260927040100_dr_daniel_projetos_camara_homonimo"
V3="20260927040200_pedro_cunha_lima_senado_homonimo"
BASE="20260927030200"
REAL_SCHEMA="scripts/audit/lib/chapas-2026-real-schema.sql"
IDS="2354661,2354692,2354799,2354943,2355241,2355283,2355344,2355389,2355557,2355611,2355760,2355789,2356102,2356107,2356276,2356433,2356493,2356494,2356591,2357406,2357475,2357618,2357649,2357651,2357668,2357715,2357839,2357846,2357885,2358142,2358198,2358217,2358451,2358597,2358671,2358824,2358930,2359093,2359209,2359788,2359791,2359816,2359975,2360033,2360034,2360100,2360273,2360277,2360290,2360314,2360372,2360388,2360726,2361150,2361473,2361652,2362134,2362231,2362505,2362529,2362533,2362989,2363320,2363529,2363683,2364298,2364304,2364442,2405514,2405515,2405601,2408590,2408610,2408611,2408612,2408615,2408627,2408628,2408977,2433829,2435522,2436298,2436301,2445885,2448732,2448899,2448900,2448901,2459627,2474813,2475459,2484589,2485427,2583128,2583129,2583130,2583131,2583335,2583336,2599009"
PEDRO_ID="aa9ca0e4-794c-409d-91fe-4d18c13a449a"
PEDRO_IDS="06e26273-aa48-42c2-8b15-164bd6756c85,07fbc164-0a36-475a-b1ea-d3fffe0c4814,0e490fa1-a390-417e-913b-ea1649404d5c,29586bcd-855c-44c6-b4f5-9f3cc1cc48ef,2b61ac03-7dbc-47cd-9930-e5c987c11faf,2b79dd87-998d-43f7-902b-d7c8a03c0280,331bd1e1-13a4-4a5e-89d2-e33ced173a7a,37eeb668-1a9f-4583-bbca-3ee0f96f6a4f,3c27a805-14a2-4dfb-8c95-b4d06f138152,3f916490-4254-40fc-b0a9-44c8fa3b6ecb,52a80ab4-b686-4aa9-96da-ad5c01a78b0b,5ba63109-95ec-47a1-8773-577b10806c07,74611c16-51aa-4b33-a90d-31af22934f37,7659f71f-ef0c-48b9-952f-22e774c8ed70,7b0dc8cf-b9b4-475e-a007-ccb173d1a129,80e78404-94eb-4df0-96ba-149d119d807c,881d77b1-3203-4734-b75e-dbfa97d50820,88cdffe3-d813-4ebc-bf53-e65fa17205b4,9396f8c2-cfe3-42b5-b336-9d4bcc48a281,a3c2db84-f6a8-49b2-973a-442aceac454c,b09efee6-149d-4163-92b1-6223c3ddba27,b29a130a-d5f3-4690-81d2-cbb837f417c1,b820fb93-2797-4414-b720-32977dfc4286,bc60274e-6329-49a4-8e81-d49f485a649c,bd0b85ea-6ae1-4289-84ec-0949f9892c27,c213ec27-1ee9-49e6-9e40-5b99ec692664,c56c8944-4808-4131-a3b7-72b07f3a0366,c5ed9eee-6633-4354-b0f6-6e24e4976e36,d5af5d00-c8f3-43d7-8643-4c5e5963b91b,df91c5c8-71a1-4b2f-92f6-f74c06db7b3b,e9a1ba0f-800c-48e1-9479-fd9fc109280a,ef3000b1-55ac-4af7-9334-580860c4abb8,fac50008-734d-429e-a87e-bdd58e360f3a"
for f in "supabase/migrations/$V.sql" "supabase/migrations/$V2.sql" "supabase/migrations/$V3.sql" "$REAL_SCHEMA"; do
  [[ -f "$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
done
grep -q "^base_version=$BASE$" scripts/audit/apply-projetos-lei-despublicacao-production.sh || { echo "FAIL: predecessor do runner não é $BASE" >&2; exit 1; }

CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"
cleanup() {
  docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
     && docker exec "$CONTAINER_ID" psql -U postgres -h 127.0.0.1 -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q() {
  docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

falha_esperada() {
  local rotulo="$1" arquivo="$2"
  if q -q < "$arquivo" >/dev/null 2>&1; then
    echo "FAIL: $rotulo" >&2
    exit 1
  fi
}

q -q < "$REAL_SCHEMA"
q -q <<SQL
CREATE ROLE anon NOLOGIN;
CREATE TABLE public.identidade_timeline_quarentena_snapshot (
  migration_version text NOT NULL,
  tabela text NOT NULL,
  row_id uuid NOT NULL,
  candidato_id uuid,
  preimage jsonb NOT NULL,
  postimage jsonb NOT NULL,
  registrado_em timestamptz NOT NULL,
  PRIMARY KEY (migration_version, tabela, row_id),
  CONSTRAINT identidade_timeline_quarentena_snapshot_tabela_check CHECK (tabela IN (
    'candidatos','historico_politico','mudancas_partido','patrimonio','financiamento','pontos_atencao','chapas_2026'))
);
CREATE FUNCTION public.is_public_candidate(target_candidate_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path TO 'public' AS \$f\$
  SELECT EXISTS (SELECT 1 FROM public.candidatos c WHERE c.id = target_candidate_id AND c.publicavel = true AND c.status <> 'removido');
\$f\$;
CREATE TABLE public.projetos_lei (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid REFERENCES public.candidatos(id) ON DELETE CASCADE,
  tipo text, numero text, ano integer, ementa text, tema text, situacao text,
  url_inteiro_teor text, destaque boolean DEFAULT false, destaque_motivo text,
  fonte text, proposicao_id_api text, created_at timestamptz DEFAULT now(),
  coverage_id text, coverage_scope text, metadata jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.projetos_lei ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON public.projetos_lei FOR SELECT USING (is_public_candidate(candidato_id));
GRANT SELECT ON public.projetos_lei TO anon;
GRANT SELECT ON public.candidatos TO anon;
GRANT EXECUTE ON FUNCTION public.is_public_candidate(uuid) TO anon;
CREATE TABLE public.votos_candidato (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), candidato_id uuid, voto text);

INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$BASE', 'sha256:fixture');

INSERT INTO public.candidatos (id, slug, nome_completo, nome_urna, partido_atual, partido_sigla, cargo_disputado,
  estado, status, publicavel, situacao_candidatura, sq_candidato_2026, foto_url, biografia, naturalidade, formacao,
  profissao_declarada, genero, estado_civil, cor_raca, data_nascimento, verificacao_campos, ultima_atualizacao) VALUES
  ('dcc4a93e-4114-43e9-b067-4581ed12cfd5','dr-daniel','Daniel Barbosa Santos','Dr. Daniel','Podemos','PODE','Governador',
   'PA','candidato',true,'deferido','140002549930','https://example.test/d.jpg','bio','Vassouras/RJ','Superior completo',
   'Médico','Masculino','Casado(a)','Parda','1979-02-16',
   '{"candidate_registration":{},"candidate_complement":{},"projetos-de-lei":{"fonte":"camara","estado":"encontrado","verificado_em":"2026-04-05"},"votacoes-chave":{"fonte":"camara","estado":"encontrado","verificado_em":"2026-04-05"}}',
   '2026-09-06T14:23:20.273Z'),
  ('00000000-0000-4000-8000-0000000000a2','sentinela-gov','SENTINELA','SENTINELA','PARTIDO','PTD','Governador',
   'RN','candidato',true,'deferido','200009999999','https://example.test/s.jpg','bio','Natal (RN)','Superior completo',
   'Outra','Feminino','Casado(a)','Branca','1979-02-16','{"candidate_registration":{},"candidate_complement":{}}','2026-09-17T02:27:47Z'),
  ('$PEDRO_ID','pedro-cunha-lima','Pedro Oliveira Cunha Lima','Pedro Cunha Lima','PARTIDO','PSD','Governador',
   'PB','candidato',false,'deferido','150009999999','https://example.test/p.jpg','bio','Campina Grande (PB)','Superior completo',
   'Outra','Masculino','Casado(a)','Branca','1988-08-15','{"candidate_registration":{},"candidate_complement":{}}','2026-09-17T02:27:47Z');

INSERT INTO public.projetos_lei (candidato_id, tipo, numero, ano, ementa, fonte, proposicao_id_api, destaque)
SELECT 'dcc4a93e-4114-43e9-b067-4581ed12cfd5', 'PL', i::text, 2023, 'ementa '||i, 'Camara', pid, false
FROM unnest(string_to_array('$IDS', ',')) WITH ORDINALITY AS t(pid, i);
INSERT INTO public.projetos_lei (id, candidato_id, tipo, numero, ano, ementa, fonte, proposicao_id_api) VALUES
  ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000a2','PL','1',2024,'sentinela','Camara','9999999');
INSERT INTO public.projetos_lei (id, candidato_id, tipo, numero, ano, ementa, fonte, metadata)
SELECT pid::uuid, '$PEDRO_ID', 'PL', i::text, 1980, 'ementa senado '||i, 'Senado',
       '{"codigo_parlamentar_senado":"1757"}'::jsonb
FROM unnest(string_to_array('$PEDRO_IDS', ',')) WITH ORDINALITY AS t(pid, i);
SQL

digest_tudo() {
  q -Atq -c "SELECT md5((SELECT string_agg(to_jsonb(c)::text,'' ORDER BY c.id) FROM public.candidatos c) || (SELECT string_agg(to_jsonb(p)::text,'' ORDER BY p.id) FROM public.projetos_lei p))"
}
lidos_anon() {
  q -Atq -c "SET ROLE anon; SELECT count(*) FILTER (WHERE candidato_id='dcc4a93e-4114-43e9-b067-4581ed12cfd5')||':'||count(*) FILTER (WHERE candidato_id='00000000-0000-4000-8000-0000000000a2') FROM public.projetos_lei"
}
[[ "$(lidos_anon)" == "100:1" ]] || { echo "FAIL: fixture de leitura anon: $(lidos_anon)" >&2; exit 1; }

falha_esperada "readback de schema aceitou o pré-estado" "supabase/readback/$V.readback.sql"
falha_esperada "readback da curadoria aceitou o pré-estado" "supabase/readback/$V2.readback.sql"
falha_esperada "curadoria rodou sem as colunas de despublicação" "supabase/migrations/$V2.sql"

q -q -c "CREATE POLICY outra ON public.projetos_lei FOR SELECT USING (true)"
falha_esperada "migration de schema aceitou política divergente" "supabase/migrations/$V.sql"
q -q -c "DROP POLICY outra ON public.projetos_lei"
tudo_antes="$(digest_tudo)"

q -q < "supabase/migrations/$V.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260927040000', 'sha256:fixture')"
q -q < "supabase/readback/$V.readback.sql"
[[ "$(lidos_anon)" == "100:1" ]] || { echo "FAIL: schema sozinho escondeu linha" >&2; exit 1; }
falha_esperada "migration de schema rodou duas vezes" "supabase/migrations/$V.sql"
pos_schema="$(digest_tudo)"

# Adulterações da curadoria: cada uma derruba a migration inteira.
q -q -c "UPDATE public.projetos_lei SET proposicao_id_api='1' WHERE proposicao_id_api='2354661'"
falha_esperada "curadoria aceitou conjunto de proposições diferente" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.projetos_lei SET proposicao_id_api='2354661' WHERE proposicao_id_api='1'"
q -q -c "INSERT INTO public.projetos_lei (id, candidato_id, tipo, fonte, proposicao_id_api) VALUES ('00000000-0000-4000-8000-0000000000e2','dcc4a93e-4114-43e9-b067-4581ed12cfd5','PL','Camara','8888888')"
falha_esperada "curadoria aceitou proposição a mais" "supabase/migrations/$V2.sql"
q -q -c "DELETE FROM public.projetos_lei WHERE id='00000000-0000-4000-8000-0000000000e2'"
q -q -c "UPDATE public.projetos_lei SET despublicado_em=now() WHERE proposicao_id_api='2354692'"
falha_esperada "curadoria aceitou proposição já despublicada" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.projetos_lei SET despublicado_em=NULL WHERE proposicao_id_api='2354692'"
q -q -c "UPDATE public.projetos_lei SET destaque=true WHERE proposicao_id_api='2354692'"
falha_esperada "curadoria aceitou proposição em destaque" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.projetos_lei SET destaque=false WHERE proposicao_id_api='2354692'"
q -q -c "INSERT INTO public.votos_candidato (candidato_id, voto) VALUES ('dcc4a93e-4114-43e9-b067-4581ed12cfd5','sim')"
falha_esperada "curadoria aceitou ficha com voto" "supabase/migrations/$V2.sql"
q -q -c "DELETE FROM public.votos_candidato"
q -q -c "UPDATE public.candidatos SET verificacao_campos=jsonb_set(verificacao_campos,'{projetos-de-lei,verificado_em}','\"2026-04-06\"') WHERE slug='dr-daniel'"
falha_esperada "curadoria aceitou verificacao_campos diferente" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.candidatos SET verificacao_campos=jsonb_set(verificacao_campos,'{projetos-de-lei,verificado_em}','\"2026-04-05\"') WHERE slug='dr-daniel'"

[[ "$(q -Atq -c "SELECT count(*) FROM public.coleta_log")" == "0" ]] || { echo "FAIL: tentativa abortada deixou recibo" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot")" == "0" ]] || { echo "FAIL: tentativa abortada deixou snapshot" >&2; exit 1; }
[[ "$(digest_tudo)" == "$pos_schema" ]] || { echo "FAIL: fixture mudou antes do forward" >&2; exit 1; }

q -q < "supabase/migrations/$V2.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260927040100', 'sha256:fixture')"
q -q < "supabase/readback/$V2.readback.sql"
q -q < "supabase/readback/$V.readback.sql"
q -q < "supabase/readback/$V2.readback.sql"
pos_dr_daniel="$(digest_tudo)"

falha_esperada "readback de Pedro aceitou o pré-estado" "supabase/readback/$V3.readback.sql"
q -q -c "UPDATE public.projetos_lei SET metadata=jsonb_set(metadata,'{codigo_parlamentar_senado}','\"1758\"') WHERE id='06e26273-aa48-42c2-8b15-164bd6756c85'"
falha_esperada "Pedro aceitou código 1757 ausente" "supabase/migrations/$V3.sql"
q -q -c "UPDATE public.projetos_lei SET metadata=jsonb_set(metadata,'{codigo_parlamentar_senado}','\"1757\"') WHERE id='06e26273-aa48-42c2-8b15-164bd6756c85'"
q -q -c "INSERT INTO public.projetos_lei(id,candidato_id,fonte,metadata) VALUES ('00000000-0000-4000-8000-0000000000e3','$PEDRO_ID','Senado','{\"codigo_parlamentar_senado\":\"1757\"}')"
falha_esperada "Pedro aceitou linha 1757 fora dos 33 ids" "supabase/migrations/$V3.sql"
q -q -c "DELETE FROM public.projetos_lei WHERE id='00000000-0000-4000-8000-0000000000e3'"
q -q -c "UPDATE public.projetos_lei SET despublicado_em=now() WHERE id='07fbc164-0a36-475a-b1ea-d3fffe0c4814'"
falha_esperada "Pedro aceitou linha já despublicada" "supabase/migrations/$V3.sql"
q -q -c "UPDATE public.projetos_lei SET despublicado_em=NULL WHERE id='07fbc164-0a36-475a-b1ea-d3fffe0c4814'"
[[ "$(digest_tudo)" == "$pos_dr_daniel" ]] || { echo "FAIL: fixture mudou antes da curadoria de Pedro" >&2; exit 1; }
q -q < "supabase/migrations/$V3.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260927040200', 'sha256:fixture')"
q -q < "supabase/readback/$V3.readback.sql"
q -q < "supabase/readback/$V2.readback.sql"
[[ "$(q -Atq -c "SELECT count(*) FROM public.projetos_lei WHERE candidato_id='$PEDRO_ID' AND metadata->>'codigo_parlamentar_senado'='1757' AND despublicado_em IS NOT NULL")" == "33" ]] || { echo "FAIL: 33 linhas de Pedro não despublicadas" >&2; exit 1; }
q -q -c "UPDATE public.projetos_lei SET despublicado_em=NULL WHERE id='0e490fa1-a390-417e-913b-ea1649404d5c'"
falha_esperada "readback de Pedro aceitou linha republicada" "supabase/readback/$V3.readback.sql"
q -q -c "UPDATE public.projetos_lei p SET despublicado_em=(s.postimage->>'despublicado_em')::timestamptz FROM public.identidade_timeline_quarentena_snapshot s WHERE s.row_id=p.id AND p.id='0e490fa1-a390-417e-913b-ea1649404d5c'"
q -q < "supabase/readback/$V3.readback.sql"

[[ "$(lidos_anon)" == "0:1" ]] || { echo "FAIL: anon ainda lê proposição despublicada: $(lidos_anon)" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT count(*) FROM public.projetos_lei WHERE candidato_id='dcc4a93e-4114-43e9-b067-4581ed12cfd5'")" == "100" ]] || { echo "FAIL: linha apagada" >&2; exit 1; }
vc="$(q -Atq -c "SELECT (verificacao_campos->'projetos-de-lei'->>'estado')||':'||(verificacao_campos->'votacoes-chave'->>'estado') FROM public.candidatos WHERE slug='dr-daniel'")"
[[ "$vc" == "nao_aplicavel:nao_aplicavel" ]] || { echo "FAIL: verificacao_campos inesperado: $vc" >&2; exit 1; }

q -q -c "UPDATE public.projetos_lei SET despublicado_em=NULL WHERE proposicao_id_api='2354799'"
falha_esperada "readback aceitou proposição republicada" "supabase/readback/$V2.readback.sql"
q -q -c "UPDATE public.projetos_lei p SET despublicado_em=(s.postimage->>'despublicado_em')::timestamptz FROM public.identidade_timeline_quarentena_snapshot s WHERE s.row_id=p.id AND p.proposicao_id_api='2354799'"
q -q < "supabase/readback/$V2.readback.sql"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260930000000', 'sha256:future')"
falha_esperada "rollback de Pedro aceitou migration posterior" "supabase/rollback/$V3.rollback.sql"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260930000000'"
q -q < "supabase/rollback/$V3.rollback.sql"
q -q < "supabase/readback/$V3.rollback.readback.sql"
[[ "$(q -Atq -c "SELECT count(*) FROM public.projetos_lei WHERE candidato_id='$PEDRO_ID' AND metadata->>'codigo_parlamentar_senado'='1757' AND despublicado_em IS NULL")" == "33" ]] || { echo "FAIL: rollback de Pedro não restaurou 33 linhas" >&2; exit 1; }
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260930000000', 'sha256:future')"
falha_esperada "rollback da curadoria aceitou migration posterior" "supabase/rollback/$V2.rollback.sql"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260930000000'"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260927040100'"
falha_esperada "rollback de schema aceitou proposição despublicada" "supabase/rollback/$V.rollback.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260927040100', 'sha256:fixture')"

q -q < "supabase/rollback/$V2.rollback.sql"
q -q < "supabase/readback/$V2.rollback.readback.sql"
q -q < "supabase/rollback/$V.rollback.sql"
q -q < "supabase/readback/$V.rollback.readback.sql"

[[ "$(digest_tudo)" == "$tudo_antes" ]] || { echo "FAIL: rollback não devolveu o estado inicial" >&2; exit 1; }
[[ "$(lidos_anon)" == "100:1" ]] || { echo "FAIL: leitura anon após rollback: $(lidos_anon)" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT max(version) FROM supabase_migrations.schema_migrations")" == "$BASE" ]] || { echo "FAIL: ledger final" >&2; exit 1; }

echo "PASS: despublicação em projetos_lei, 100 proposições de dr-daniel e 33 linhas exatas do Senado 1757 em pedro-cunha-lima têm pré-estado, recortes adulterados, readbacks, rollback bloqueado, migration posterior e rollback inverso provados em PostgreSQL 17"
