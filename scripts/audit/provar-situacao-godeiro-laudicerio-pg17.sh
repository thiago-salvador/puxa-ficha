#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartável as migrations 20260926180000 (situação de
# godeiro-linharess e laudicerio-aguiar), 20260926180100 (chapa de
# laudicerio-aguiar com a vice vigente) e 20260926180200 (biografia de
# laudicerio-aguiar sem a frase de ausência no TSE), sobre o schema real de candidatos,
# chapas_2026 e coleta_log (scripts/audit/lib/chapas-2026-real-schema.sql, com
# os CHECK de produção): readbacks reprovam o pré-estado, migrations reprovam
# preimagem adulterada, ficha despublicada, chapa já confirmada e chapa da
# inscrição indeferida alterada, forward e readbacks em ordem, a linha
# promovida passa nos CHECK reais de chapas_2026, a expressão de vice do
# snapshot da auditoria (lida do arquivo entregue) devolve só a vice da
# inscrição ativa, readback reprova postimagem adulterada, rollback recusa
# migration posterior no ledger, rollback em ordem inversa com readbacks de
# rollback, e sentinelas intactas.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
V="20260926180000_situacao_godeiro_laudicerio"
V2="20260926180100_chapa_laudicerio_vice_vigente"
V3="20260926180200_biografia_laudicerio_sem_ausencia_tse"
REAL_SCHEMA="scripts/audit/lib/chapas-2026-real-schema.sql"
SNAPSHOT_SQL="scripts/audit/data-freshness-snapshot.sql"
for f in "supabase/migrations/$V.sql" "supabase/migrations/$V2.sql" "supabase/migrations/$V3.sql" "$REAL_SCHEMA" "$SNAPSHOT_SQL"; do
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
q -q <<'SQL'
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
INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key)
VALUES ('20260925230100', 'sha256:fixture');

INSERT INTO public.candidatos (id, slug, nome_completo, nome_urna, partido_atual, partido_sigla, cargo_disputado,
  estado, status, publicavel, situacao_candidatura, sq_candidato_2026, foto_url, biografia, naturalidade, formacao,
  profissao_declarada, genero, estado_civil, cor_raca, data_nascimento, verificacao_campos, ultima_atualizacao) VALUES
  ('d45f1947-73a7-4292-9955-7e57927032f0','godeiro-linharess','GLADYER LINHARES GODEIRO','GODEIRO LINHARESS','DEMOCRACIA CRISTÃ','DC','Governador',
   'RN','candidato',true,'pendente de julgamento','200002554482','https://example.test/f.jpg','bio','Mossoró (RN)','Superior completo',
   'Empresário','Masculino','Solteiro(a)','Parda','1977-04-25','{"candidate_registration":{},"candidate_complement":{}}','2026-09-17T02:27:47Z'),
  ('9f4c6003-20a5-486e-9c7a-90d48d4cdcd0','laudicerio-aguiar','Laudicerio Aguiar Machado','Laudicerio Aguiar','Agir','AGIR','Governador',
   'MT','candidato',true,'indeferido com recurso','110002554073','https://example.test/l.jpg','Laudicério Aguiar Machado, conhecido como Sargento Laudicério, é sargento da Polícia Militar, cientista social e político de Mato Grosso, natural de Cuiabá. Em maio de 2026, confirmou candidatura ao governo de Mato Grosso pelo Agir. Encerrado o prazo de registro em 15 de agosto de 2026, o nome dele não consta na base oficial de candidaturas do TSE.','Cuiabá (MT)','Superior completo',
   'Sargento','Masculino','Solteiro(a)','Parda','1978-12-18','{"candidate_registration":{},"candidate_complement":{}}','2026-09-09T14:39:29.840203Z'),
  ('3cdec46b-b0b6-48f6-9de8-757958548a25','sargento-karen-fortes','KAREN DE ARRUDA FORTES','SARGENTO KAREN FORTES','AGIR','AGIR','VICE-GOVERNADOR',
   'MT','pre-candidato',false,'candidatura declarada','110002554503',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','2026-09-01T00:00:00Z'),
  ('1395c8a6-8d3d-4e7a-82de-7b7b6c0e3035','alex-pucineli','ALEX PEDDE PUCINELI','ALEX PUCINELI','AGIR','AGIR','VICE-GOVERNADOR',
   'MT','pre-candidato',false,NULL,'110002553938',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','2026-09-01T00:00:00Z'),
  -- sentinelas: governador com a mesma situação de partida e ficha com duas chapas da mesma inscrição
  ('00000000-0000-4000-8000-0000000000a1','sentinela-gov','SENTINELA','SENTINELA','PARTIDO','PTD','Governador',
   'RN','candidato',true,'pendente de julgamento','200009999999','https://example.test/s.jpg','bio','Natal (RN)','Superior completo',
   'Outra','Feminino','Casado(a)','Branca','1970-01-01','{"candidate_registration":{},"candidate_complement":{}}','2026-09-17T02:27:47Z'),
  ('00000000-0000-4000-8000-0000000000a2','garotinho','ANTHONY GAROTINHO','GAROTINHO','REPUBLICANOS','REPUBLICANOS','Governador',
   'RJ','candidato',false,'deferido','190002550196',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}','2026-09-17T02:27:47Z');

INSERT INTO public.chapas_2026 (id, chave, eleicao_codigo, eleicao_data, uf, cargo_titular, sq_coligacao,
  identidade_status, vinculo_titular_status, tse_situacao_codigo, tse_situacao_titular_codigo, tse_situacao_vice_codigo,
  tipo_agremiacao, composicao, titular_candidato_id, vice_candidato_id, titular_sq_candidato, vice_sq_candidato,
  titular_nome_completo, titular_nome_urna, titular_partido_sigla, vice_nome_completo, vice_nome_urna, vice_partido_sigla,
  alternativas_oficiais, fonte_url, fonte_sha256, snapshot_em, fonte_tipo) VALUES
  ('5be60ab8-7a47-4a75-ac7e-6e159998ea7d','2026:MT:laudicerio-aguiar-machado:duplicidade:110002554073:110002554503','6259','2026-10-04','MT','Governador','110001801510',
   'duplicidade_oficial','confirmado','#NE','-3','-3','PARTIDO ISOLADO','AGIR','9f4c6003-20a5-486e-9c7a-90d48d4cdcd0','3cdec46b-b0b6-48f6-9de8-757958548a25','110002554073','110002554503',
   'LAUDICERIO AGUIAR MACHADO','SARGENTO LAUDICÉRIO','AGIR','KAREN DE ARRUDA FORTES','SARGENTO KAREN FORTES','AGIR',
   '[{"sq_coligacao":"110001801468","titular_sq_candidato":"110002553937","vice_sq_candidato":"110002553938"},{"sq_coligacao":"110001801510","titular_sq_candidato":"110002554073","vice_sq_candidato":"110002554099"}]',
   'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip','eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27','2026-08-28T01:58:24.127Z','legado'),
  ('34c5ef27-87c4-4b3b-b150-4082e38f154f','2026:MT:laudicerio-aguiar-machado:duplicidade:110002553937:110002553938','6259','2026-10-04','MT','Governador','110001801468',
   'duplicidade_oficial','confirmado','#NE','-3','-3','PARTIDO ISOLADO','AGIR','9f4c6003-20a5-486e-9c7a-90d48d4cdcd0','1395c8a6-8d3d-4e7a-82de-7b7b6c0e3035','110002553937','110002553938',
   'LAUDICERIO AGUIAR MACHADO','SARGENTO LAUDICÉRIO (LAU)','AGIR','ALEX PEDDE PUCINELI','ALEX PUCINELI','AGIR',
   '[{"sq_coligacao":"110001801468","titular_sq_candidato":"110002553937","vice_sq_candidato":"110002553938"},{"sq_coligacao":"110001801510","titular_sq_candidato":"110002554073","vice_sq_candidato":"110002554099"}]',
   'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip','eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27','2026-08-28T01:58:24.127Z','legado'),
  ('250e9ca4-b101-4ec4-9835-bff18c596061','2026:RN:carlos-alberto-de-almeida-cavalcante','6259','2026-10-04','RN','Governador','200001801097',
   'confirmada','confirmado','#NE','-3','-3','PARTIDO ISOLADO','DC','d45f1947-73a7-4292-9955-7e57927032f0',NULL,'200002554482','200002550224',
   'GLADYER LINHARES GODEIRO','GODEIRO LINHARESS','DC','JULIO CESAR NEVES','PASTOR JÚLIO','DC','[]',
   'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip','eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27','2026-09-16T22:31:04Z','legado'),
  ('00000000-0000-4000-8000-0000000000c1','2026:RJ:garotinho:duplicidade:190002550196:190002554226','6259','2026-10-04','RJ','Governador','190001801094',
   'confirmada','confirmado','#NE','-3','-3','PARTIDO ISOLADO','REPUBLICANOS','00000000-0000-4000-8000-0000000000a2',NULL,'190002550196','190002554226',
   'ANTHONY GAROTINHO','GAROTINHO','REPUBLICANOS','VICE NOVA','VICE NOVA','REPUBLICANOS','[]',
   'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip','eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27','2026-08-28T01:58:24.127Z','legado'),
  ('00000000-0000-4000-8000-0000000000c2','2026:RJ:garotinho:duplicidade:190002550196:190002550197','6259','2026-10-04','RJ','Governador','190001801094',
   'duplicidade_oficial','confirmado','#NE','-3','-3','PARTIDO ISOLADO','REPUBLICANOS','00000000-0000-4000-8000-0000000000a2',NULL,'190002550196','190002550197',
   'ANTHONY GAROTINHO','GAROTINHO','REPUBLICANOS','VICE ANTIGA','VICE ANTIGA','REPUBLICANOS',
   '[{"sq_coligacao":"190001801094","titular_sq_candidato":"190002550196","vice_sq_candidato":"190002550197"},{"sq_coligacao":"190001801094","titular_sq_candidato":"190002550196","vice_sq_candidato":"190002554226"}]',
   'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip','eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27','2026-08-28T01:58:24.127Z','legado');
SQL

digest_tudo() {
  q -Atq -c "SELECT md5((SELECT string_agg(to_jsonb(c)::text,'' ORDER BY c.id) FROM public.candidatos c) || (SELECT string_agg(to_jsonb(ch)::text,'' ORDER BY ch.id) FROM public.chapas_2026 ch))"
}
digest_sentinelas() {
  q -Atq -c "SELECT md5((SELECT string_agg(to_jsonb(c)::text,'' ORDER BY c.id) FROM public.candidatos c WHERE c.slug NOT IN ('godeiro-linharess','laudicerio-aguiar')) || (SELECT string_agg(to_jsonb(ch)::text,'' ORDER BY ch.id) FROM public.chapas_2026 ch WHERE ch.id <> '5be60ab8-7a47-4a75-ac7e-6e159998ea7d'))"
}
tudo_antes="$(digest_tudo)"
sentinelas_antes="$(digest_sentinelas)"

# Expressão de vice da auditoria diária, lida do arquivo entregue. c é a ficha
# publicada e base a linha de candidatos, como no snapshot.
expr_vice="$(python3 - "$SNAPSHOT_SQL" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
m = re.search(r"'vice_sq_candidatos', (COALESCE\(\(.*?\), '\[\]'::jsonb\))", text, re.S)
if not m: raise SystemExit("expressao vice_sq_candidatos nao encontrada")
print(m.group(1))
PY
)"
vices() {
  q -Atq -F '|' -c "SELECT c.slug, ${expr_vice} FROM public.candidatos c JOIN public.candidatos base ON base.id = c.id WHERE c.slug IN ('godeiro-linharess','laudicerio-aguiar','garotinho') ORDER BY c.slug"
}
vices_esperadas=$'garotinho|["190002550197", "190002554226"]\ngodeiro-linharess|["200002550224"]\nlaudicerio-aguiar|["110002554503"]'

# Leitura do ledger pelo trecho real do runner, com as duas versões ainda não
# aplicadas: a consulta devolve idempotency_key vazio no fim da linha.
ledger_runner() {
  local cols="coalesce(max(version),'')"
  for v in 20260925230100 20260926180000 20260926180100 20260926180200; do
    cols+=" || '|' || count(*) filter (where version='$v') || '|' || coalesce(max(idempotency_key) filter (where version='$v'),'')"
  done
  q -Atq -F '|' -c "select $cols from supabase_migrations.schema_migrations"
}
trecho_leitura="$(awk '/^# read -a descarta campos vazios/{f=1} /^if \[\[ "\$aplicadas" == "\$\{#versions\[@\]\}" \]\]/{f=0} f' scripts/audit/apply-situacao-godeiro-laudicerio-production.sh)"
[[ -n "$trecho_leitura" ]] || { echo "FAIL: trecho de leitura do ledger não encontrado no runner" >&2; exit 1; }
programa_leitura="$(mktemp)"
{
  printf '%s\n' 'set -euo pipefail' 'versions=(20260926180000 20260926180100 20260926180200)' 'digests=(sha256:d0 sha256:d1 sha256:d2)'
  printf 'estado=%q\n' "$(ledger_runner)"
  printf '%s\n' "$trecho_leitura"
  # shellcheck disable=SC2016 # expansão acontece no programa gerado, não aqui
  printf '%s\n' 'echo "$topo $aplicadas"'
} > "$programa_leitura"
leitura="$(bash "$programa_leitura")" || { echo "FAIL: runner não leu o ledger com versões não aplicadas" >&2; exit 1; }
rm -f "$programa_leitura"
[[ "$leitura" == "20260925230100 0" ]] || { echo "FAIL: leitura do ledger inesperada: $leitura" >&2; exit 1; }

falha_esperada "readback de situação aceitou o pré-estado" "supabase/readback/$V.readback.sql"
falha_esperada "readback da chapa aceitou o pré-estado" "supabase/readback/$V2.readback.sql"
falha_esperada "readback da biografia aceitou o pré-estado" "supabase/readback/$V3.readback.sql"

q -q -c "UPDATE public.candidatos SET biografia=biografia||' ' WHERE slug='laudicerio-aguiar'"
falha_esperada "migration da biografia aceitou texto diferente da preimagem" "supabase/migrations/$V3.sql"
q -q -c "UPDATE public.candidatos SET biografia=rtrim(biografia) WHERE slug='laudicerio-aguiar'"

q -q -c "UPDATE public.candidatos SET situacao_candidatura='aguardando julgamento' WHERE slug='godeiro-linharess'"
falha_esperada "migration aceitou situação adulterada" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.candidatos SET situacao_candidatura='pendente de julgamento' WHERE slug='godeiro-linharess'"
q -q -c "UPDATE public.candidatos SET publicavel=false WHERE slug='laudicerio-aguiar'"
falha_esperada "migration aceitou ficha despublicada" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.candidatos SET publicavel=true WHERE slug='laudicerio-aguiar'"
q -q -c "UPDATE public.candidatos SET sq_candidato_2026='110002553937' WHERE slug='laudicerio-aguiar'"
falha_esperada "migration aceitou SQ da inscrição indeferida" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.candidatos SET sq_candidato_2026='110002554073' WHERE slug='laudicerio-aguiar'"

q -q -c "UPDATE public.chapas_2026 SET identidade_status='confirmada' WHERE id='5be60ab8-7a47-4a75-ac7e-6e159998ea7d'"
falha_esperada "migration da chapa aceitou chapa já confirmada" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.chapas_2026 SET identidade_status='duplicidade_oficial' WHERE id='5be60ab8-7a47-4a75-ac7e-6e159998ea7d'"
q -q -c "UPDATE public.chapas_2026 SET vice_sq_candidato='110002554099' WHERE id='34c5ef27-87c4-4b3b-b150-4082e38f154f'"
falha_esperada "migration da chapa aceitou chapa indeferida alterada" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.chapas_2026 SET vice_sq_candidato='110002553938' WHERE id='34c5ef27-87c4-4b3b-b150-4082e38f154f'"
q -q -c "UPDATE public.chapas_2026 SET vice_nome_urna='ALEX PUCINELI' WHERE id='5be60ab8-7a47-4a75-ac7e-6e159998ea7d'"
falha_esperada "migration da chapa aceitou vice diferente" "supabase/migrations/$V2.sql"
q -q -c "UPDATE public.chapas_2026 SET vice_nome_urna='SARGENTO KAREN FORTES' WHERE id='5be60ab8-7a47-4a75-ac7e-6e159998ea7d'"

[[ "$(q -Atq -c "SELECT count(*) FROM public.coleta_log")" == "0" ]] || { echo "FAIL: tentativa abortada deixou recibo" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot")" == "0" ]] || { echo "FAIL: tentativa abortada deixou snapshot" >&2; exit 1; }
[[ "$(digest_tudo)" == "$tudo_antes" ]] || { echo "FAIL: fixture mudou antes do forward" >&2; exit 1; }

q -q < "supabase/migrations/$V.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260926180000', 'sha256:fixture')"
q -q < "supabase/readback/$V.readback.sql"
q -q < "supabase/migrations/$V2.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260926180100', 'sha256:fixture')"
q -q < "supabase/readback/$V2.readback.sql"
q -q < "supabase/migrations/$V3.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260926180200', 'sha256:fixture')"
q -q < "supabase/readback/$V3.readback.sql"
bio="$(q -Atq -c "SELECT md5(biografia)||':'||length(biografia) FROM public.candidatos WHERE slug='laudicerio-aguiar'")"
[[ "$bio" == "5aa3e29c19da96a97d8832733ea7a8d8:232" ]] || { echo "FAIL: biografia inesperada: $bio" >&2; exit 1; }
# Mesma sequência de rodar_readbacks do runner: as três, depois do conjunto inteiro.
q -q < "supabase/readback/$V.readback.sql"
q -q < "supabase/readback/$V2.readback.sql"
q -q < "supabase/readback/$V3.readback.sql"
q -q -c "UPDATE public.candidatos SET biografia='outra' WHERE slug='laudicerio-aguiar'"
falha_esperada "readback de situação aceitou biografia fora das duas postimagens" "supabase/readback/$V.readback.sql"
q -q -c "UPDATE public.candidatos SET biografia='Laudicério Aguiar Machado, conhecido como Sargento Laudicério, é sargento da Polícia Militar, cientista social e político de Mato Grosso, natural de Cuiabá. Em maio de 2026, confirmou candidatura ao governo de Mato Grosso pelo Agir.' WHERE slug='laudicerio-aguiar'"

estado="$(q -Atq -c "SELECT string_agg(slug||':'||situacao_candidatura||':'||status||':'||publicavel||':'||to_char(ultima_atualizacao AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS'), ',' ORDER BY slug) FROM public.candidatos WHERE slug IN ('godeiro-linharess','laudicerio-aguiar')")"
esperado="godeiro-linharess:deferido:candidato:true:2026-09-26T17:39:58,laudicerio-aguiar:deferido:candidato:true:2026-09-26T17:39:58"
[[ "$estado" == "$esperado" ]] || { echo "FAIL: forward de situação inesperado: $estado" >&2; exit 1; }
chapas="$(q -Atq -c "SELECT string_agg(left(id::text,8)||':'||identidade_status, ',' ORDER BY id) FROM public.chapas_2026 WHERE titular_candidato_id='9f4c6003-20a5-486e-9c7a-90d48d4cdcd0'")"
[[ "$chapas" == "34c5ef27:duplicidade_oficial,5be60ab8:confirmada" ]] || { echo "FAIL: forward da chapa inesperado: $chapas" >&2; exit 1; }
[[ "$(digest_sentinelas)" == "$sentinelas_antes" ]] || { echo "FAIL: forward tocou sentinela" >&2; exit 1; }
[[ "$(vices)" == "$vices_esperadas" ]] || { echo "FAIL: vice da auditoria inesperado: $(vices)" >&2; exit 1; }

q -q -c "UPDATE public.candidatos SET situacao_candidatura='deferido com recurso' WHERE slug='godeiro-linharess'"
falha_esperada "readback aceitou situação adulterada" "supabase/readback/$V.readback.sql"
q -q -c "UPDATE public.candidatos SET situacao_candidatura='deferido' WHERE slug='godeiro-linharess'"
q -q < "supabase/readback/$V.readback.sql"
q -q -c "UPDATE public.chapas_2026 SET identidade_status='duplicidade_oficial' WHERE id='5be60ab8-7a47-4a75-ac7e-6e159998ea7d'"
falha_esperada "readback aceitou chapa adulterada" "supabase/readback/$V2.readback.sql"
q -q -c "UPDATE public.chapas_2026 SET identidade_status='confirmada' WHERE id='5be60ab8-7a47-4a75-ac7e-6e159998ea7d'"
q -q < "supabase/readback/$V2.readback.sql"
q -q -c "UPDATE public.candidatos SET biografia=biografia||' Frase nova.' WHERE slug='laudicerio-aguiar'"
falha_esperada "readback aceitou biografia adulterada" "supabase/readback/$V3.readback.sql"
q -q -c "UPDATE public.candidatos SET biografia=left(biografia, 232) WHERE slug='laudicerio-aguiar'"
q -q < "supabase/readback/$V3.readback.sql"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260930000000', 'sha256:future')"
falha_esperada "rollback da biografia aceitou migration posterior" "supabase/rollback/$V3.rollback.sql"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260930000000'"
falha_esperada "rollback da chapa aceitou migration posterior (biografia no topo)" "supabase/rollback/$V2.rollback.sql"
falha_esperada "rollback de situação aceitou migration posterior (biografia no topo)" "supabase/rollback/$V.rollback.sql"

q -q < "supabase/rollback/$V3.rollback.sql"
q -q < "supabase/readback/$V3.rollback.readback.sql"
q -q < "supabase/rollback/$V2.rollback.sql"
q -q < "supabase/readback/$V2.rollback.readback.sql"
q -q < "supabase/rollback/$V.rollback.sql"
q -q < "supabase/readback/$V.rollback.readback.sql"

[[ "$(digest_tudo)" == "$tudo_antes" ]] || { echo "FAIL: rollback não devolveu o estado inicial" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT max(version) FROM supabase_migrations.schema_migrations")" == "20260925230100" ]] || { echo "FAIL: ledger final" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot")" == "0" ]] || { echo "FAIL: snapshot sobrou" >&2; exit 1; }

echo "PASS: situação de godeiro-linharess e laudicerio-aguiar e chapa vigente de laudicerio-aguiar e biografia de laudicerio-aguiar têm pré-estado, adulteração, ficha despublicada, SQ indeferido, chapa já confirmada, chapa indeferida alterada, vice diferente, biografia fora da preimagem, forward com CHECK reais, vice da auditoria, readbacks, migration posterior, rollback inverso e sentinelas provados em PostgreSQL 17"
