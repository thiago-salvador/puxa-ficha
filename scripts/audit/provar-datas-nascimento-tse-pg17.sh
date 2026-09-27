#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartável as migrations 20260926233000 (data de
# nascimento de cinco fichas pelo TSE e biografia de silvio-mendes),
# 20260926233100 (patrimônio e financiamento 2012/2020 do homônimo em
# mauricio-coelho) e 20260926233200 (CHECK de data sentinela), sobre o schema
# real de candidatos, patrimonio e coleta_log (scripts/audit/lib/chapas-2026-real-schema.sql,
# com os CHECK de produção). financiamento e financiamento_doador_search são
# mínimos, com uma trigger que reproduz o contrato da de produção: receita
# despublicada sai da busca, receita republicada volta.
#
# Prova: readbacks reprovam o pré-estado; migrations reprovam preimagem
# adulterada (data, SQ, nome, biografia, valor, SQ do homônimo, linha já
# despublicada, data da ficha de mauricio); forward e readbacks em ordem; o
# CHECK recusa 1900-01-01 e aceita 1º de janeiro real; o CHECK falha se ainda
# houver sentinela; readback reprova postimagem adulterada; rollback recusa
# migration posterior no ledger; rollback em ordem inversa com readbacks de
# rollback devolve o estado inicial byte a byte; sentinelas intactas.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
V="20260926233000_datas_nascimento_tse"
V2="20260926233100_mauricio_coelho_homonimo_2012_2020"
V3="20260926233200_data_nascimento_sem_sentinela_check"
BASE="20260926190100"
REAL_SCHEMA="scripts/audit/lib/chapas-2026-real-schema.sql"
for f in "supabase/migrations/$V.sql" "supabase/migrations/$V2.sql" "supabase/migrations/$V3.sql" "$REAL_SCHEMA"; do
  [[ -f "$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
done

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
CREATE TABLE public.identidade_timeline_quarentena_snapshot (
  migration_version text NOT NULL,
  tabela text NOT NULL CHECK (tabela = ANY (ARRAY['candidatos','historico_politico','mudancas_partido','patrimonio','financiamento','pontos_atencao','chapas_2026'])),
  row_id uuid NOT NULL,
  candidato_id uuid,
  preimage jsonb NOT NULL,
  postimage jsonb NOT NULL,
  registrado_em timestamptz NOT NULL,
  PRIMARY KEY (migration_version, tabela, row_id)
);
CREATE TABLE public.financiamento (
  id uuid PRIMARY KEY,
  candidato_id uuid REFERENCES public.candidatos(id),
  ano_eleicao integer NOT NULL,
  total_arrecadado numeric,
  maiores_doadores jsonb,
  fonte text DEFAULT 'TSE',
  sq_candidato text,
  uf_candidatura text,
  despublicacao_motivo text,
  despublicado_em timestamptz
);
CREATE TABLE public.financiamento_doador_search (
  id bigserial PRIMARY KEY,
  financiamento_id uuid NOT NULL,
  candidato_id uuid,
  ano_eleicao integer,
  doador_nome_exibicao text
);
CREATE FUNCTION public.sync_financiamento_doador_search() RETURNS trigger LANGUAGE plpgsql AS \$f\$
BEGIN
  DELETE FROM public.financiamento_doador_search WHERE financiamento_id = NEW.id;
  INSERT INTO public.financiamento_doador_search (financiamento_id, candidato_id, ano_eleicao, doador_nome_exibicao)
  SELECT NEW.id, NEW.candidato_id, NEW.ano_eleicao, d->>'nome'
  FROM jsonb_array_elements(coalesce(NEW.maiores_doadores, '[]'::jsonb)) d
  WHERE NEW.despublicado_em IS NULL;
  RETURN NULL;
END
\$f\$;
CREATE TRIGGER sync_financiamento_doador_search
AFTER INSERT OR UPDATE OF maiores_doadores, candidato_id, ano_eleicao, despublicado_em ON public.financiamento
FOR EACH ROW EXECUTE FUNCTION public.sync_financiamento_doador_search();

INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$BASE', 'sha256:fixture');

INSERT INTO public.candidatos (id, slug, nome_completo, nome_urna, partido_atual, partido_sigla, cargo_disputado,
  estado, status, publicavel, situacao_candidatura, sq_candidato_2026, foto_url, biografia, naturalidade, formacao,
  profissao_declarada, genero, estado_civil, cor_raca, data_nascimento, verificacao_campos, ultima_atualizacao) VALUES
  ('dcc4a93e-4114-43e9-b067-4581ed12cfd5','dr-daniel','Daniel Barbosa Santos','Dr. Daniel','Podemos','PODE','Governador',
   'PA','candidato',true,'deferido','140002549930','https://example.test/d.jpg','bio','Vassouras/RJ','Superior completo',
   'Médico','Masculino','Casado(a)','Parda','1979-02-16','{"candidate_registration":{},"candidate_complement":{}}','2026-09-06T14:23:20.273Z'),
  ('2081565f-e38d-4246-81d6-4f28979e8136','gabriel-azevedo','Gabriel Sousa Marques de Azevedo','Gabriel Azevedo','MDB','MDB','Governador',
   'MG','candidato',true,'deferido','130002549557','https://example.test/g.jpg','bio','Belo Horizonte/MG','Superior completo',
   'Advogado','Masculino','Solteiro(a)','Branca','1989-02-16','{"candidate_registration":{},"candidate_complement":{}}','2026-09-06T14:23:20.273Z'),
  ('5a325c79-3414-4d70-8926-673e91cbd578','hildon-chaves','Hildon de Lima Chaves','Hildon Chaves','PSDB','PSDB','Governador',
   'RO','candidato',true,'deferido','220002542916','https://example.test/h.jpg','bio','Recife','Superior completo',
   'Advogado','Masculino','Casado(a)','Branca','1968-01-01','{"candidate_registration":{},"candidate_complement":{}}','2026-09-06T14:23:20.273Z'),
  ('1191e8d3-da51-4724-a1b6-ed577406cf9d','silvio-mendes','Silvio Mendes de Oliveira Filho','Silvio Mendes','União Brasil','UNIAO','Governador',
   'PI','pre-candidato',false,NULL,NULL,NULL,'Silvio Mendes de Oliveira Filho (UNIAO) e pre-candidato(a) ao governo de PI. Com ensino superior completo, nascido em 1976, natural de PR.','PR',NULL,
   NULL,NULL,NULL,NULL,'1976-04-02','{}','2026-08-31T00:33:03.612136Z'),
  ('e55a7e1a-e3db-4b01-8f11-c89da7a2e524','tse-2026-20002553726','JOSE WANDERLEY NETO','DR. WANDERLEY','MDB','MDB','Senador',
   'AL','candidato',true,'deferido','20002553726','https://example.test/w.jpg','bio','CACIMBINHAS','Superior completo',
   'Médico','Masculino','Casado(a)','Branca','1900-01-01','{"candidate_registration":{},"candidate_complement":{}}','2026-09-25T22:27:15.291Z'),
  ('c7a28e0e-06d0-412b-98ee-b79a7a4354f9','mauricio-coelho','Mauricio Coelho de Souza Junior','Mauricio Coelho','Mobiliza','MOBILIZA','Governador',
   'MT','candidato',true,'deferido','110002553058','https://example.test/m.jpg','bio','Itabira, MG','SUPERIOR INCOMPLETO',
   'EMPRESÁRIO','Masculino','Solteiro(a)','Branca','1994-04-18','{"candidate_registration":{},"candidate_complement":{}}','2026-09-06T14:23:20.273Z'),
  -- sentinelas: 1º de janeiro real declarado ao TSE e uma ficha qualquer
  ('00000000-0000-4000-8000-0000000000a1','tse-2026-110002553701','NELSON CARLOS FERREIRA JUNIOR','NELSON','PARTIDO','PTD','Senador',
   'MT','candidato',true,'deferido','110002553701','https://example.test/n.jpg','bio','Cuiabá','Superior completo',
   'Outra','Masculino','Casado(a)','Branca','1973-01-01','{"candidate_registration":{},"candidate_complement":{}}','2026-09-17T02:27:47Z'),
  ('00000000-0000-4000-8000-0000000000a2','sentinela-gov','SENTINELA','SENTINELA','PARTIDO','PTD','Governador',
   'RN','candidato',true,'deferido','200009999999','https://example.test/s.jpg','bio','Natal (RN)','Superior completo',
   'Outra','Feminino','Casado(a)','Branca','1979-02-16','{"candidate_registration":{},"candidate_complement":{}}','2026-09-17T02:27:47Z');

INSERT INTO public.patrimonio (id, candidato_id, ano_eleicao, valor_total, bens, fonte) VALUES
  ('f65e7932-574f-4377-a27c-334458471b64','c7a28e0e-06d0-412b-98ee-b79a7a4354f9',2012,29000.00,'[{"valor":29000}]','TSE'),
  ('e78469f8-de18-4104-aa4c-1a78360228d1','c7a28e0e-06d0-412b-98ee-b79a7a4354f9',2020,254787.56,'[{"valor":254787.56}]','TSE'),
  ('e3d6dbf1-3aa4-4fe7-9b59-91b5bcd66c31','c7a28e0e-06d0-412b-98ee-b79a7a4354f9',2026,2159005.73,'[]','TSE DivulgaCand 2026, totalDeBens do SQ 110002553058'),
  ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a2',2012,29000.00,'[]','TSE');

INSERT INTO public.financiamento (id, candidato_id, ano_eleicao, total_arrecadado, maiores_doadores, fonte, sq_candidato, uf_candidatura) VALUES
  ('7ead02ce-acfd-417d-b482-a0e92f56b801','c7a28e0e-06d0-412b-98ee-b79a7a4354f9',2012,7838.83,'[{"nome":"LEILANE ALVES DA CONCEICAO"},{"nome":"MAURICIO COELHO RIBEIRO DA SILVA"},{"nome":"A"},{"nome":"B"}]','TSE','110000010928','MT'),
  ('aacde5cd-aafa-466e-9ad4-cb095c75e5b6','c7a28e0e-06d0-412b-98ee-b79a7a4354f9',2020,172.00,'[{"nome":"MAURICIO COELHO RIBEIRO DA SILVA"}]','TSE','110000951550','MT'),
  ('8126c8ff-df99-418c-a857-4e821c21966a','c7a28e0e-06d0-412b-98ee-b79a7a4354f9',2026,3550.00,'[{"nome":"MAURICIO COELHO DE SOUZA JUNIOR"},{"nome":"C"}]','TSE','110002553058','MT'),
  ('00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000a2',2012,7838.83,'[{"nome":"X"}]','TSE','110000010928','RN');
SQL

digest_tudo() {
  q -Atq -c "SELECT md5((SELECT string_agg(to_jsonb(c)::text,'' ORDER BY c.id) FROM public.candidatos c) || (SELECT string_agg(to_jsonb(p)::text,'' ORDER BY p.id) FROM public.patrimonio p) || (SELECT string_agg(to_jsonb(f)::text,'' ORDER BY f.id) FROM public.financiamento f) || (SELECT string_agg(financiamento_id::text||doador_nome_exibicao,'' ORDER BY financiamento_id, doador_nome_exibicao) FROM public.financiamento_doador_search))"
}
digest_sentinelas() {
  q -Atq -c "SELECT md5((SELECT string_agg(to_jsonb(c)::text,'' ORDER BY c.id) FROM public.candidatos c WHERE c.id::text LIKE '00000000-%' OR c.slug = 'mauricio-coelho') || (SELECT string_agg(to_jsonb(p)::text,'' ORDER BY p.id) FROM public.patrimonio p WHERE p.ano_eleicao <> 2012 AND p.ano_eleicao <> 2020 OR p.id::text LIKE '00000000-%') || (SELECT string_agg(to_jsonb(f)::text,'' ORDER BY f.id) FROM public.financiamento f WHERE f.ano_eleicao = 2026 OR f.id::text LIKE '00000000-%'))"
}
busca_homonimo() {
  q -Atq -c "SELECT count(*) FROM public.financiamento_doador_search WHERE financiamento_id IN ('7ead02ce-acfd-417d-b482-a0e92f56b801','aacde5cd-aafa-466e-9ad4-cb095c75e5b6')"
}
tudo_antes="$(digest_tudo)"
sentinelas_antes="$(digest_sentinelas)"
[[ "$(busca_homonimo)" == "5" ]] || { echo "FAIL: fixture de busca por doador" >&2; exit 1; }

# Leitura do ledger pelo trecho real do runner, com as três versões ainda não
# aplicadas: a consulta devolve idempotency_key vazio no fim da linha.
ledger_runner() {
  local cols="coalesce(max(version),'')"
  for v in $BASE 20260926233000 20260926233100 20260926233200; do
    cols+=" || '|' || count(*) filter (where version='$v') || '|' || coalesce(max(idempotency_key) filter (where version='$v'),'')"
  done
  q -Atq -F '|' -c "select $cols from supabase_migrations.schema_migrations"
}
trecho_leitura="$(awk '/^# read -a descarta campos vazios/{f=1} /^if \[\[ "\$aplicadas" == "\$\{#versions\[@\]\}" \]\]/{f=0} f' scripts/audit/apply-datas-nascimento-tse-production.sh)"
[[ -n "$trecho_leitura" ]] || { echo "FAIL: trecho de leitura do ledger não encontrado no runner" >&2; exit 1; }
grep -q "^base_version=$BASE$" scripts/audit/apply-datas-nascimento-tse-production.sh || { echo "FAIL: predecessor do runner não é $BASE" >&2; exit 1; }
programa_leitura="$(mktemp)"
{
  printf '%s\n' 'set -euo pipefail' 'versions=(20260926233000 20260926233100 20260926233200)' 'digests=(sha256:d0 sha256:d1 sha256:d2)'
  printf 'estado=%q\n' "$(ledger_runner)"
  printf '%s\n' "$trecho_leitura"
  # shellcheck disable=SC2016 # expansão acontece no programa gerado, não aqui
  printf '%s\n' 'echo "$topo $aplicadas"'
} > "$programa_leitura"
leitura="$(bash "$programa_leitura")" || { echo "FAIL: runner não leu o ledger com versões não aplicadas" >&2; exit 1; }
rm -f "$programa_leitura"
[[ "$leitura" == "$BASE 0" ]] || { echo "FAIL: leitura do ledger inesperada: $leitura" >&2; exit 1; }

falha_esperada "readback de datas aceitou o pré-estado" "supabase/readback/$V.readback.sql"
falha_esperada "readback do homônimo aceitou o pré-estado" "supabase/readback/$V2.readback.sql"
falha_esperada "readback do CHECK aceitou o pré-estado" "supabase/readback/$V3.readback.sql"
falha_esperada "CHECK aplicou com sentinela 1900-01-01 na tabela" "supabase/migrations/$V3.sql"

# Adulterações de M1: cada uma derruba a migration inteira.
q -q -c "UPDATE public.candidatos SET data_nascimento='1979-02-17' WHERE slug='dr-daniel'"
falha_esperada "migration de datas aceitou data diferente da preimagem" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.candidatos SET data_nascimento='1979-02-16' WHERE slug='dr-daniel'"
q -q -c "UPDATE public.candidatos SET sq_candidato_2026='130000000000' WHERE slug='gabriel-azevedo'"
falha_esperada "migration de datas aceitou SQ de 2026 diferente" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.candidatos SET sq_candidato_2026='130002549557' WHERE slug='gabriel-azevedo'"
q -q -c "UPDATE public.candidatos SET nome_completo='Hildon Chaves' WHERE slug='hildon-chaves'"
falha_esperada "migration de datas aceitou nome civil diferente" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.candidatos SET nome_completo='Hildon de Lima Chaves' WHERE slug='hildon-chaves'"
q -q -c "UPDATE public.candidatos SET biografia=biografia||' ' WHERE slug='silvio-mendes'"
falha_esperada "migration de datas aceitou biografia diferente da preimagem" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.candidatos SET biografia=rtrim(biografia) WHERE slug='silvio-mendes'"

# Adulterações de M2.
q -q -c "UPDATE public.patrimonio SET valor_total=29000.01 WHERE id='f65e7932-574f-4377-a27c-334458471b64'"
falha_esperada "migration do homônimo aceitou valor diferente" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.patrimonio SET valor_total=29000.00 WHERE id='f65e7932-574f-4377-a27c-334458471b64'"
q -q -c "UPDATE public.financiamento SET sq_candidato='110002553058' WHERE id='aacde5cd-aafa-466e-9ad4-cb095c75e5b6'"
falha_esperada "migration do homônimo aceitou SQ que não é do homônimo" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.financiamento SET sq_candidato='110000951550' WHERE id='aacde5cd-aafa-466e-9ad4-cb095c75e5b6'"
q -q -c "UPDATE public.financiamento SET despublicado_em='2026-01-01T00:00:00Z' WHERE id='7ead02ce-acfd-417d-b482-a0e92f56b801'"
falha_esperada "migration do homônimo aceitou linha já despublicada" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.financiamento SET despublicado_em=NULL WHERE id='7ead02ce-acfd-417d-b482-a0e92f56b801'"
q -q -c "UPDATE public.candidatos SET data_nascimento='1974-10-05' WHERE slug='mauricio-coelho'"
falha_esperada "migration do homônimo aceitou ficha com a data do homônimo" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.candidatos SET data_nascimento='1994-04-18' WHERE slug='mauricio-coelho'"

[[ "$(q -Atq -c "SELECT count(*) FROM public.coleta_log")" == "0" ]] || { echo "FAIL: tentativa abortada deixou recibo" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot")" == "0" ]] || { echo "FAIL: tentativa abortada deixou snapshot" >&2; exit 1; }
[[ "$(digest_tudo)" == "$tudo_antes" ]] || { echo "FAIL: fixture mudou antes do forward" >&2; exit 1; }

q -q < "supabase/migrations/$V.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260926233000', 'sha256:fixture')"
q -q < "supabase/readback/$V.readback.sql"
q -q < "supabase/migrations/$V2.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260926233100', 'sha256:fixture')"
q -q < "supabase/readback/$V2.readback.sql"
q -q < "supabase/migrations/$V3.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260926233200', 'sha256:fixture')"
q -q < "supabase/readback/$V3.readback.sql"
# Mesma sequência de rodar_readbacks do runner: as três, depois do conjunto inteiro.
q -q < "supabase/readback/$V.readback.sql"
q -q < "supabase/readback/$V2.readback.sql"
q -q < "supabase/readback/$V3.readback.sql"

datas="$(q -Atq -c "SELECT string_agg(slug||':'||data_nascimento, ',' ORDER BY slug) FROM public.candidatos WHERE slug IN ('dr-daniel','gabriel-azevedo','hildon-chaves','silvio-mendes','tse-2026-20002553726')")"
[[ "$datas" == "dr-daniel:1986-08-25,gabriel-azevedo:1986-03-12,hildon-chaves:1968-05-25,silvio-mendes:1949-08-31,tse-2026-20002553726:1949-07-08" ]] || { echo "FAIL: datas inesperadas: $datas" >&2; exit 1; }
bio="$(q -Atq -c "SELECT biografia FROM public.candidatos WHERE slug='silvio-mendes'")"
[[ "$bio" == "Silvio Mendes de Oliveira Filho (UNIAO) e pre-candidato(a) ao governo de PI. Com ensino superior completo." ]] || { echo "FAIL: biografia inesperada: $bio" >&2; exit 1; }
recibo="$(q -Atq -c "SELECT detalhe FROM public.coleta_log WHERE execucao='migration:20260926233000'")"
[[ "$recibo" != *cpf* ]] || { echo "FAIL: recibo de datas carrega a linha inteira" >&2; exit 1; }
[[ "$(busca_homonimo)" == "0" ]] || { echo "FAIL: busca por doador ainda indexa o homônimo" >&2; exit 1; }
publicados="$(q -Atq -c "SELECT (SELECT count(*) FROM public.patrimonio WHERE candidato_id='c7a28e0e-06d0-412b-98ee-b79a7a4354f9' AND despublicado_em IS NULL)||':'||(SELECT count(*) FROM public.financiamento WHERE candidato_id='c7a28e0e-06d0-412b-98ee-b79a7a4354f9' AND despublicado_em IS NULL)")"
[[ "$publicados" == "1:1" ]] || { echo "FAIL: mauricio-coelho deveria ficar só com 2026: $publicados" >&2; exit 1; }
[[ "$(digest_sentinelas)" == "$sentinelas_antes" ]] || { echo "FAIL: forward tocou sentinela" >&2; exit 1; }

# O CHECK recusa a sentinela e aceita 1º de janeiro real.
if q -q -c "UPDATE public.candidatos SET data_nascimento='1900-01-01' WHERE slug='sentinela-gov'" >/dev/null 2>&1; then
  echo "FAIL: CHECK aceitou 1900-01-01" >&2; exit 1
fi
q -q -c "UPDATE public.candidatos SET data_nascimento='1910-01-01' WHERE slug='sentinela-gov'"
q -q -c "UPDATE public.candidatos SET data_nascimento='1979-02-16' WHERE slug='sentinela-gov'"

# Readbacks reprovam postimagem adulterada.
q -q -c "UPDATE public.candidatos SET data_nascimento='1986-08-26' WHERE slug='dr-daniel'"
falha_esperada "readback de datas aceitou data adulterada" "supabase/readback/$V.readback.sql"
q -q -c "UPDATE public.candidatos SET data_nascimento='1986-08-25' WHERE slug='dr-daniel'"
q -q < "supabase/readback/$V.readback.sql"
q -q -c "UPDATE public.financiamento SET despublicado_em=NULL WHERE id='aacde5cd-aafa-466e-9ad4-cb095c75e5b6'"
falha_esperada "readback do homônimo aceitou receita republicada" "supabase/readback/$V2.readback.sql"
q -q -c "UPDATE public.financiamento f SET despublicado_em=(s.postimage->>'despublicado_em')::timestamptz FROM public.identidade_timeline_quarentena_snapshot s WHERE s.row_id=f.id AND f.id='aacde5cd-aafa-466e-9ad4-cb095c75e5b6'"
q -q < "supabase/readback/$V2.readback.sql"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260930000000', 'sha256:future')"
falha_esperada "rollback do CHECK aceitou migration posterior" "supabase/rollback/$V3.rollback.sql"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260930000000'"
falha_esperada "rollback do homônimo aceitou migration posterior (CHECK no topo)" "supabase/rollback/$V2.rollback.sql"
falha_esperada "rollback de datas aceitou migration posterior (CHECK no topo)" "supabase/rollback/$V.rollback.sql"

q -q < "supabase/rollback/$V3.rollback.sql"
q -q < "supabase/readback/$V3.rollback.readback.sql"
q -q < "supabase/rollback/$V2.rollback.sql"
q -q < "supabase/readback/$V2.rollback.readback.sql"
q -q < "supabase/rollback/$V.rollback.sql"
q -q < "supabase/readback/$V.rollback.readback.sql"

[[ "$(busca_homonimo)" == "5" ]] || { echo "FAIL: rollback não reindexou a busca por doador" >&2; exit 1; }
[[ "$(digest_tudo)" == "$tudo_antes" ]] || { echo "FAIL: rollback não devolveu o estado inicial" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT max(version) FROM supabase_migrations.schema_migrations")" == "$BASE" ]] || { echo "FAIL: ledger final" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot")" == "0" ]] || { echo "FAIL: snapshot sobrou" >&2; exit 1; }

echo "PASS: datas de nascimento pelo TSE, homônimo de mauricio-coelho e CHECK de sentinela têm pré-estado, adulteração de data, SQ, nome, biografia, valor, SQ do homônimo, linha já despublicada, forward com CHECK reais, busca por doador, 1º de janeiro real, readbacks, migration posterior, rollback inverso e sentinelas provados em PostgreSQL 17"
