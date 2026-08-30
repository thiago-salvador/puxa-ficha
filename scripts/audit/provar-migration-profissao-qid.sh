#!/usr/bin/env bash
#
# Prova EXECUTAVEL da 20260830120000, do rollback e dos dois readbacks, em
# Postgres 17 efemero. Nao toca producao: sobe container proprio, monta a tabela
# minima e roda o SQL de verdade.
#
# Mesma razao das irmas (provar-migration-daciolo.sh, provar-migration-trilha-a.sh):
# asserção sobre TEXTO de SQL nao julga guard que nao dispara. O que precisa ser
# provado aqui e que as precondicoes ABORTAM, e que o UPDATE e estrito por par
# slug+QID em vez de varrer a coluna.
#
# Oito ramos, todos fail-closed. Qualquer divergencia sai RC=1.
#
#   F0 estado real medido      -> aplica 39 ocupacoes TSE e 24 NULL; nenhum QID
#                                 sobra; quem nao tinha QID fica intacto
#   F1 QID a mais que o medido -> ABORTA; mapa incompleto nao pode aplicar
#                                 parcial e deixar o resto invisivel
#   F2 slug do mapa ausente    -> ABORTA; medicao envelhecida
#   F3 valor mudou desde a medicao -> ABORTA; o backfill nao adivinha estado
#   F4 rerodar sobre F0        -> no-op, zero linha afetada
#   F5 banco vazio             -> guard de ausencia devolve no-op; sem ele a
#                                 migration entraria no conjunto de quebras de
#                                 replay do repositorio
#   F6 base sem nenhum alvo    -> no-op, linha alheia intacta
#   R0 mudanca posterior       -> rollback recusa, mesmo se o valor continua NULL
#   R1 rollback sobre F0       -> devolve byte a byte os 63 QIDs e timestamps
#
# ESCOPO: a semantica dos guards. Fidelidade de schema e do replay-migrations.
#
# Uso: bash scripts/audit/provar-migration-profissao-qid.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VER="20260830120000"
NOME="backfill_profissao_declarada_qid_wikidata"
FWD="supabase/migrations/${VER}_${NOME}.sql"
RBK="supabase/rollback/${VER}_${NOME}.rollback.sql"
READBACK="supabase/readback/${VER}_${NOME}.readback.sql"
READBACK_RBK="supabase/readback/${VER}_${NOME}.rollback.readback.sql"
FIXTURE="data/qid-profissao/profissao-declarada-qid-20260830.json"

for arquivo in "$FWD" "$RBK" "$READBACK" "$READBACK_RBK" "$FIXTURE"; do
  [[ -f "$arquivo" ]] || { echo "FAIL: $arquivo nao existe"; exit 1; }
done

C="pf-profissao-qid-$$"
limpar() { docker rm -f "$C" >/dev/null 2>&1; }
trap limpar EXIT INT TERM

docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null || {
  echo "FAIL: docker nao subiu o container"; exit 1; }
pronto=0
for _ in $(seq 1 90); do
  if docker exec "$C" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    pronto=1; break
  fi
  sleep 1
done
[[ "$pronto" == 1 ]] || { echo "FAIL: postgres nao ficou pronto"; exit 1; }

q()      { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
aplicar(){ docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - ; }

FALHAS=0
ok()   { echo "  PASS  $1"; }
nok()  { echo "  FAIL  $1"; FALHAS=$((FALHAS + 1)); }
igual(){ if [[ "$2" == "$3" ]]; then ok "$1 ($2)"; else nok "$1: esperado '$3', observado '$2'"; fi }
rodar(){ local saida rc; saida="$(aplicar < "$1" 2>&1)"; rc=$?; printf '%s|%s' "$rc" "$saida"; }
abortou(){
  if [[ "$2" != 0 ]] && grep -q "$4" <<<"$3"; then
    ok "$1"
  else
    nok "$1 (rc=$2): $(tr '\n' ' ' <<<"$3" | cut -c1-220)"
  fi
}

# Schema minimo, mais o SEED derivado da MESMA fixture que a migration usa.
# Derivar em vez de repetir e proposital: uma lista copiada a mao aqui provaria
# a copia, nao a migration.
q <<'SQL' >/dev/null
create schema if not exists supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
create table public.candidatos(
  id uuid primary key,
  slug text not null unique,
  profissao_declarada text,
  ultima_atualizacao timestamptz
);
create table public.coleta_log(
  id bigint generated always as identity primary key,
  fonte text not null,
  escopo text not null,
  alvo text not null,
  candidato_id uuid references public.candidatos(id),
  executado_em timestamptz not null,
  resultado text not null,
  volume integer not null,
  detalhe text,
  url text,
  execucao text,
  natureza text
);
SQL

seed() {
  node -e '
    const fx = require("./data/qid-profissao/profissao-declarada-qid-20260830.json")
    const lit = (v) => "'"'"'" + String(v).replace(/'"'"'/g, "'"'"''"'"'") + "'"'"'"
    const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`
    const linhas = fx.records.map((r,i) => `(${lit(uuid(i+1))},${lit(r.slug)},${lit(r.previous_value)},${lit("2026-08-01T12:00:00Z")})`)
    // Controle: dois registros que NUNCA podem ser tocados.
    linhas.push(`(${lit(uuid(64))},${lit("controle-sem-qid")},${lit("Torneiro Mecânico")},${lit("2026-08-01T12:00:00Z")})`)
    linhas.push(`(${lit(uuid(65))},${lit("controle-nulo")},NULL,${lit("2026-08-01T12:00:00Z")})`)
    console.log("truncate public.coleta_log,public.candidatos restart identity cascade;")
    console.log("insert into public.candidatos(id,slug,profissao_declarada,ultima_atualizacao) values")
    console.log(linhas.join(",\n") + ";")
    console.log(`delete from supabase_migrations.schema_migrations where version = '"'"'20260830120000'"'"';`)
  ' | q >/dev/null
}

echo "F0 estado real medido"
seed
before_digest="$(q -c "select md5(string_agg(row_to_json(c)::text,'|' order by slug)) from public.candidatos c")"
IFS='|' read -r rc saida <<<"$(rodar "$FWD")"
if [[ "$rc" == 0 ]]; then ok "aplica sem erro"; else nok "aplicou com erro: $(tr '\n' ' ' <<<"$saida" | cut -c1-220)"; fi
igual "sobrou QID cru" "$(q -c "select count(*) from public.candidatos where profissao_declarada ~ '^Q[0-9]+\$'")" "0"
igual "ocupações oficiais TSE 2026" "$(q -c "select count(*) from public.coleta_log l join public.candidatos c on c.id=l.candidato_id where l.execucao='migration:20260830120000:profissao-qid-tse-2026' and substring(l.detalhe from 27)::jsonb->>'source_kind'='tse_2026_declared_occupation' and c.profissao_declarada is not null")" "39"
igual "sem vínculo TSE verificável virou NULL" "$(q -c "select count(*) from public.coleta_log l join public.candidatos c on c.id=l.candidato_id where l.execucao='migration:20260830120000:profissao-qid-tse-2026' and substring(l.detalhe from 27)::jsonb->>'source_kind'='no_verified_tse_2026_link' and c.profissao_declarada is null")" "24"
igual "receipts exatos" "$(q -c "select count(*) from public.coleta_log where execucao='migration:20260830120000:profissao-qid-tse-2026'")" "63"
igual "controle sem QID intacto" "$(q -c "select profissao_declarada from public.candidatos where slug = 'controle-sem-qid'")" "Torneiro Mecânico"
igual "controle nulo intacto" "$(q -c "select count(*) from public.candidatos where slug = 'controle-nulo' and profissao_declarada is null")" "1"
igual "total de linhas preservado" "$(q -c "select count(*) from public.candidatos")" "65"

echo "F0b readback forward"
q -c "insert into supabase_migrations.schema_migrations(version) values ('$VER')" >/dev/null
IFS='|' read -r rc saida <<<"$(rodar "$READBACK")"
if [[ "$rc" == 0 ]]; then ok "readback passa sobre o estado aplicado"; else nok "readback reprovou: $(tr '\n' ' ' <<<"$saida" | cut -c1-220)"; fi

echo "F4 rerodar e no-op"
IFS='|' read -r rc saida <<<"$(rodar "$FWD")"
if [[ "$rc" == 0 ]]; then ok "rerodar nao falha"; else nok "rerodar falhou: $(tr '\n' ' ' <<<"$saida" | cut -c1-220)"; fi
igual "receipts continuam 63 (nao dobrou)" "$(q -c "select count(*) from public.coleta_log where execucao='migration:20260830120000:profissao-qid-tse-2026'")" "63"

echo "R0 rollback recusa mudanca posterior"
q -c "update public.candidatos c set ultima_atualizacao='2026-08-30T23:59:59Z' from public.coleta_log l where c.id=l.candidato_id and l.execucao='migration:20260830120000:profissao-qid-tse-2026' and substring(l.detalhe from 27)::jsonb->>'source_kind'='no_verified_tse_2026_link' and c.slug=(select alvo from public.coleta_log where execucao='migration:20260830120000:profissao-qid-tse-2026' and substring(detalhe from 27)::jsonb->>'source_kind'='no_verified_tse_2026_link' order by alvo limit 1)" >/dev/null
IFS='|' read -r rc saida <<<"$(rodar "$RBK")"
abortou "rollback recusa perfil alterado depois" "$rc" "$saida" "rollback recusado"
q -c "update public.candidatos c set ultima_atualizacao=l.executado_em from public.coleta_log l where c.id=l.candidato_id and l.execucao='migration:20260830120000:profissao-qid-tse-2026' and c.ultima_atualizacao='2026-08-30T23:59:59Z'" >/dev/null

echo "R1 rollback sobre o estado aplicado"
IFS='|' read -r rc saida <<<"$(rodar "$RBK")"
if [[ "$rc" == 0 ]]; then ok "rollback aplica"; else nok "rollback falhou: $(tr '\n' ' ' <<<"$saida" | cut -c1-220)"; fi
igual "os 63 QIDs voltaram" "$(q -c "select count(*) from public.candidatos where profissao_declarada ~ '^Q[0-9]+\$'")" "63"
igual "versao saiu do ledger" "$(q -c "select count(*) from supabase_migrations.schema_migrations where version = '$VER'")" "0"
igual "controle sem QID segue intacto" "$(q -c "select profissao_declarada from public.candidatos where slug = 'controle-sem-qid'")" "Torneiro Mecânico"
igual "snapshot restaurado byte a byte" "$(q -c "select md5(string_agg(row_to_json(c)::text,'|' order by slug)) from public.candidatos c")" "$before_digest"
IFS='|' read -r rc saida <<<"$(rodar "$READBACK_RBK")"
if [[ "$rc" == 0 ]]; then ok "readback de rollback passa"; else nok "readback de rollback reprovou: $(tr '\n' ' ' <<<"$saida" | cut -c1-220)"; fi

echo "F1 QID a mais que o medido"
seed
q -c "insert into public.candidatos(id,slug,profissao_declarada,ultima_atualizacao) values ('99999999-9999-4999-8999-999999999999','qid-novo-fora-do-mapa','Q999999',now())" >/dev/null
IFS='|' read -r rc saida <<<"$(rodar "$FWD")"
abortou "aborta com 64 QIDs" "$rc" "$saida" "estado divergente qids=64 pares_exatos=63"
igual "nada foi escrito" "$(q -c "select count(*) from public.coleta_log")" "0"

echo "F2 slug do mapa ausente"
seed
q -c "delete from public.candidatos where slug = (select slug from public.candidatos where profissao_declarada = 'Q82955' order by slug limit 1)" >/dev/null
q -c "insert into public.candidatos(id,slug,profissao_declarada,ultima_atualizacao) values ('99999999-9999-4999-8999-999999999998','outro-slug-com-qid','Q82955',now())" >/dev/null
IFS='|' read -r rc saida <<<"$(rodar "$FWD")"
abortou "aborta quando um alvo medido sumiu" "$rc" "$saida" "estado divergente qids=63 pares_exatos=62"
igual "nada foi escrito" "$(q -c "select count(*) from public.coleta_log")" "0"

echo "F3 valor mudou desde a medicao"
seed
q -c "update public.candidatos set profissao_declarada = 'Q33999' where profissao_declarada = 'Q82955' and slug = (select slug from public.candidatos where profissao_declarada = 'Q82955' order by slug limit 1)" >/dev/null
IFS='|' read -r rc saida <<<"$(rodar "$FWD")"
abortou "aborta quando o par slug+QID divergiu" "$rc" "$saida" "estado divergente qids=63 pares_exatos=62"
igual "nada foi escrito" "$(q -c "select count(*) from public.coleta_log")" "0"

echo "F5 banco vazio (replay linear)"
q -c "truncate public.coleta_log,public.candidatos restart identity cascade" >/dev/null
IFS='|' read -r rc saida <<<"$(rodar "$FWD")"
if [[ "$rc" == 0 ]]; then ok "guard de ausencia deixa passar em banco vazio"; else nok "quebraria o replay: $(tr '\n' ' ' <<<"$saida" | cut -c1-220)"; fi
if grep -q "nenhum alvo presente" <<<"$saida"; then ok "diz que nao aplicou nada"; else nok "aplicou em silencio: $(tr '\n' ' ' <<<"$saida" | cut -c1-160)"; fi
igual "nenhuma linha criada" "$(q -c "select count(*) from public.candidatos")" "0"

echo "F6 base com candidatos, mas nenhum alvo"
q -c "truncate public.coleta_log,public.candidatos restart identity cascade" >/dev/null
q -c "insert into public.candidatos(id,slug,profissao_declarada,ultima_atualizacao) values ('99999999-9999-4999-8999-999999999997','outro-candidato','Torneiro Mecânico',now())" >/dev/null
IFS='|' read -r rc saida <<<"$(rodar "$FWD")"
if [[ "$rc" == 0 ]]; then ok "no-op sem estourar"; else nok "estourou: $(tr '\n' ' ' <<<"$saida" | cut -c1-220)"; fi
igual "linha alheia intacta" "$(q -c "select profissao_declarada from public.candidatos where slug = 'outro-candidato'")" "Torneiro Mecânico"

echo
if [[ "$FALHAS" == 0 ]]; then
  echo "PROVA_PROFISSAO_QID_PASS"
  exit 0
fi
echo "PROVA_PROFISSAO_QID_FAIL ($FALHAS)"
exit 1
