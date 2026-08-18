#!/usr/bin/env bash
# Prova executável da carga judicial 69/21 aprovada editorialmente e não aplicada.
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSAO="20260810122000"
FWD="supabase/migrations/${VERSAO}_processos_curadoria_djen.sql"
RBK="supabase/rollback/${VERSAO}_processos_curadoria_djen.rollback.sql"
READBACK="QA/evidencias/2026-08-10-item2-judicial/proposta-69-21/${VERSAO}_processos_curadoria_djen.readback.sql"
MANIFESTO="QA/evidencias/2026-08-10-item2-judicial/proposta-69-21/manifesto-processos-curadoria-69.json"

for arquivo in "$FWD" "$RBK" "$READBACK" "$MANIFESTO"; do
  [[ -f "$arquivo" ]] || { echo "FAIL: $arquivo nao existe"; exit 1; }
done

C="pf-processos-69-$$"
limpar() { docker rm -f "$C" >/dev/null 2>&1; }
trap limpar EXIT INT TERM

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null || {
  echo "FAIL: docker nao subiu o container"; exit 1; }
pronto=0
for _ in $(seq 1 90); do
  if docker exec "$C" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    pronto=1
    break
  fi
  sleep 1
done
[[ "$pronto" == 1 ]] || { echo "FAIL: postgres nao ficou pronto"; exit 1; }

q() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
sql() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction -f -; }

FALHAS=0
ok() { echo "  PASS  $1"; }
nok() { echo "  FAIL  $1"; FALHAS=$((FALHAS + 1)); }
igual() {
  if [[ "$2" == "$3" ]]; then ok "$1 ($2)"; else nok "$1: esperado '$3', observado '$2'"; fi
}

schema_minimo() {
  q <<'SQL'
DROP SCHEMA public CASCADE;
DROP SCHEMA IF EXISTS supabase_migrations CASCADE;
CREATE SCHEMA public;
CREATE SCHEMA supabase_migrations;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome_completo text,
  nome_urna text
);
CREATE TABLE public.processos (
  id bigserial PRIMARY KEY,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  tipo text NOT NULL,
  tribunal text NOT NULL,
  numero_processo text NOT NULL,
  descricao text NOT NULL,
  status text NOT NULL,
  data_inicio date,
  data_decisao date,
  gravidade text,
  fonte text,
  url_fonte text
);
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
SQL
}

inserir_candidatos() {
  local limite="${1:-21}"
  jq -r '.linhas[].slug' "$MANIFESTO" | sort -u | head -n "$limite" | while IFS= read -r slug; do
    [[ "$slug" =~ ^[a-z0-9-]+$ ]] || { echo "FAIL: slug invalido no manifesto"; return 1; }
    if [[ "$slug" == "orleans-brandao" ]]; then
      printf "INSERT INTO public.candidatos(id,slug,nome_completo,nome_urna) VALUES ('47a1de10-1cf7-47f8-837b-dbbf94480421','orleans-brandao','Carlos Orleans Brandão Junior','Orleans Brandao');\n" | q >/dev/null
    else
      printf "INSERT INTO public.candidatos(slug,nome_completo,nome_urna) VALUES ('%s','%s','%s');\n" "$slug" "$slug" "$slug" | q >/dev/null
    fi
  done
}

aplicar_forward() {
  {
    printf 'BEGIN;\n'
    cat "$FWD"
    printf "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('%s');\n" "$VERSAO"
    printf 'COMMIT;\n'
  } | docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f -
}

echo "F0: universo vazio recusa carga"
schema_minimo
saida="$(aplicar_forward 2>&1)"; rc=$?
[[ "$rc" -ne 0 && "$saida" == *"slugs nao resolvidos"* ]] && ok "guard de identidade" || nok "guard de identidade"
igual "zero escrita" "$(q -c 'SELECT count(*) FROM public.processos')" "0"
igual "zero ledger" "$(q -c 'SELECT count(*) FROM supabase_migrations.schema_migrations')" "0"

echo "F1: coorte parcial 20/21 recusa sem escrita parcial"
schema_minimo
inserir_candidatos 20
saida="$(aplicar_forward 2>&1)"; rc=$?
[[ "$rc" -ne 0 && "$saida" == *"slugs nao resolvidos"* ]] && ok "coorte parcial aborta" || nok "coorte parcial aborta"
igual "zero escrita parcial" "$(q -c 'SELECT count(*) FROM public.processos')" "0"

echo "F2: coorte completa aplica e readback confere payload exato"
schema_minimo
inserir_candidatos 21
saida="$(aplicar_forward 2>&1)"; rc=$?
igual "forward rc" "$rc" "0"
igual "69 processos" "$(q -c 'SELECT count(*) FROM public.processos')" "69"
igual "ledger presente" "$(q -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='$VERSAO'")" "1"
readback="$(q -F '|' -f - < "$READBACK")"
igual "readback 69/21 exato" "$readback" "69|21|69|21|0|0|0|0|0|0|0|0"
id_mutado="$(q -c 'SELECT min(id) FROM public.processos')"
numero_original="$(q -c "SELECT numero_processo FROM public.processos WHERE id='$id_mutado'")"
q -c "UPDATE public.processos SET numero_processo=regexp_replace(numero_processo,'[^0-9]','','g') WHERE id='$id_mutado'" >/dev/null
saida="$(q -F '|' -f - < "$READBACK" 2>&1)"; rc=$?
[[ "$rc" -ne 0 && "$saida" == *'"payload_mismatch":1'* ]] && ok "readback recusa CNJ sem formatação literal" || nok "readback aceitou CNJ sem formatação"
q -c "UPDATE public.processos SET numero_processo='$numero_original' WHERE id='$id_mutado'" >/dev/null
q -F '|' -f - < "$READBACK" >/dev/null || { echo "FAIL: readback não restaurou"; exit 1; }
q -c "INSERT INTO public.processos(candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte) SELECT candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,'posterior-fora-do-marcador',url_fonte FROM public.processos WHERE id='$id_mutado'" >/dev/null
saida="$(q -F '|' -f - < "$READBACK" 2>&1)"; rc=$?
[[ "$rc" -ne 0 && "$saida" == *'"global_cnj_mismatch":1'* ]] && ok "readback recusa CNJ duplicado fora do marcador" || nok "readback aceitou CNJ duplicado fora do marcador"
q -c "DELETE FROM public.processos WHERE fonte='posterior-fora-do-marcador'" >/dev/null
q -F '|' -f - < "$READBACK" >/dev/null || { echo "FAIL: readback não restaurou após duplicata"; exit 1; }

echo "F2b: split de identidade preserva os dois processos no governador histórico"
q -c "UPDATE public.candidatos SET slug='carlos-brandao-ma-historico' WHERE id='47a1de10-1cf7-47f8-837b-dbbf94480421'; INSERT INTO public.candidatos(id,slug,nome_completo,nome_urna) VALUES ('b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601','orleans-brandao','Carlos Orleans Braide Brandão','Orleans Brandão'); INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260811102100')" >/dev/null
readback="$(q -F '|' -f - < "$READBACK")"
igual "readback pós-split exato" "$readback" "69|21|69|21|0|0|0|0|0|0|0|0"
igual "dois CNJs no governador histórico" "$(q -c "SELECT count(*) FROM public.processos WHERE candidato_id='47a1de10-1cf7-47f8-837b-dbbf94480421' AND regexp_replace(numero_processo,'[^0-9]','','g') IN ('08640775520258100001','08651982120258100001')")" "2"

echo "F2c: readback recusa identidade histórica adulterada"
q -c "UPDATE public.candidatos SET nome_completo='Pessoa Errada' WHERE id='47a1de10-1cf7-47f8-837b-dbbf94480421'" >/dev/null
saida="$(q -F '|' -f - < "$READBACK" 2>&1)"; rc=$?
[[ "$rc" -ne 0 && "$saida" == *'"identity_mismatch":2'* ]] && ok "identidade histórica fail-closed" || nok "identidade histórica aceita rc=$rc"
q -c "UPDATE public.candidatos SET nome_completo='Carlos Orleans Brandão Junior' WHERE id='47a1de10-1cf7-47f8-837b-dbbf94480421'" >/dev/null

echo "F2d: estado pós-split sem ledger é recusado"
q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260811102100'" >/dev/null
saida="$(q -F '|' -f - < "$READBACK" 2>&1)"; rc=$?
[[ "$rc" -ne 0 && "$saida" == *'"identity_mismatch":2'* ]] && ok "split sem ledger fail-closed" || nok "split sem ledger aceito rc=$rc"
q -c "DELETE FROM public.candidatos WHERE id='b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601'; UPDATE public.candidatos SET slug='orleans-brandao' WHERE id='47a1de10-1cf7-47f8-837b-dbbf94480421'" >/dev/null
q -F '|' -f - < "$READBACK" >/dev/null || { echo "FAIL: readback pré-split não restaurou"; exit 1; }

echo "F3: reaplicacao recusa duplicidade"
saida="$(aplicar_forward 2>&1)"; rc=$?
[[ "$rc" -ne 0 && "$saida" == *"CNJs ja existem"* ]] && ok "reaplicacao aborta" || nok "reaplicacao aborta"
igual "69 preservados" "$(q -c 'SELECT count(*) FROM public.processos')" "69"

echo "R1: readback e rollback recusam URL cruzada por processo"
q -c "UPDATE public.processos SET url_fonte='https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=00104542320255030012' WHERE id=(SELECT min(id) FROM public.processos WHERE url_fonte LIKE 'https://comunicaapi.pje.jus.br/%' AND regexp_replace(numero_processo, '[^0-9]', '', 'g') <> '00104542320255030012')" >/dev/null
saida="$(q -F '|' -f - < "$READBACK" 2>&1)"; rc=$?
if [[ "$rc" -ne 0 && "$saida" == *"readback 20260810122000"* && "$saida" == *'"source_cnj_mismatch":1'* ]]; then
  ok "readback recusa URL de outro CNJ"
else
  nok "readback não recusou URL cruzada (rc=$rc)"
fi
saida="$(sql < "$RBK" 2>&1)"; rc=$?
[[ "$rc" -ne 0 && "$saida" == *"preservar curadoria posterior"* ]] && ok "rollback mutado aborta" || nok "rollback mutado aborta"
igual "URL cruzada preservada" "$(q -c "SELECT count(*) FROM public.processos WHERE url_fonte LIKE '%numeroProcesso=00104542320255030012' AND regexp_replace(numero_processo, '[^0-9]', '', 'g') <> '00104542320255030012'")" "1"
igual "ledger preservado" "$(q -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='$VERSAO'")" "1"

echo "R2: rollback exato remove lote e ledger"
q -c "UPDATE public.processos SET url_fonte='https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=' || regexp_replace(numero_processo, '[^0-9]', '', 'g') WHERE url_fonte LIKE '%numeroProcesso=00104542320255030012' AND regexp_replace(numero_processo, '[^0-9]', '', 'g') <> '00104542320255030012'" >/dev/null
saida="$(sql < "$RBK" 2>&1)"; rc=$?
igual "rollback rc" "$rc" "0"
igual "zero processos do lote" "$(q -c "SELECT count(*) FROM public.processos WHERE fonte LIKE 'curadoria-djen-20260805: %'")" "0"
igual "ledger removido" "$(q -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='$VERSAO'")" "0"

if [[ "$FALHAS" -ne 0 ]]; then
  echo "FAIL: $FALHAS assercao(oes)"
  exit 1
fi
echo "PASS: carga judicial 69/21, 8 cenarios e rollback fail-closed"
