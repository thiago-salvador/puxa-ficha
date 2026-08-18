#!/usr/bin/env bash
#
# Prova EXECUTAVEL da 20260810085000 e do rollback dela, em Postgres 17 efemero.
#
# Mesma razao da provar-migration-b2.sh: asserção sobre TEXTO de SQL nao pega
# guard que nao dispara. Aqui o que precisa ser provado e a CARDINALIDADE, que
# e a condicao imposta na aprovacao do plano: a escrita so pode acontecer quando
# o alvo por SQ_CANDIDATO 280000625869 + cargo + 2018 for exatamente um.
#
# Sete ramos, todos fail-closed. Qualquer divergencia sai RC=1.
#
#   F0 base sem a ficha       -> ABORTA (cardinalidade 0); e a falha registrada
#                                no manifesto de replay, nao um no-op mentiroso
#   F1 alvo ausente            -> ABORTA (cardinalidade 0), nada escrito
#   F2 alvo duplicado          -> ABORTA (cardinalidade 2), nada escrito
#   F3 ja corrigido (NULL)     -> ABORTA (pre-condicao), nada destruido
#   F4 estado real de producao -> aplica; eleito_por NULL, observacoes intacta,
#                                 e o readback do invariante (a') cai de 2 para 1
#   R1 rollback sobre F4       -> restaura 'nao eleito'
#   R2 rollback com curadoria posterior -> ABORTA e nao destroi o valor novo
#
# ESCOPO: a semantica dos guards. Fidelidade de schema e do
# `audit:migrations:replay --gate`; aqui a tabela e minima de proposito.
#
# Uso: bash scripts/audit/provar-migration-trilha-a.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD="supabase/migrations/20260810085000_lula_2018_registro_indeferido_eleito_por.sql"
RBK="supabase/rollback/20260810085000_lula_2018_registro_indeferido_eleito_por.rollback.sql"
READBACK="supabase/readback/20260810085000_lula_2018_registro_indeferido_eleito_por.readback.sql"

OBS_LULA="Candidatura: registro INDEFERIDO pelo TSE (divulgacandcontas 2018, SQ_CANDIDATO 280000625869, nome de urna LULA, numero 13). Nao participou da votacao."
OBS_RUI="candidatura: pleito a Presidencia em 2006 (TSE); registro Indeferido pelo TSE (descricaoSituacao=''Indeferido'', descricaoTotalizacao=''Nao eleito'')."

for arquivo in "$FWD" "$RBK" "$READBACK"; do
  [[ -f "$arquivo" ]] || { echo "FAIL: $arquivo nao existe"; exit 1; }
done

C="pf-trilha-a-$$"
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
aplicar(){ docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction -f - ; }

FALHAS=0
ok()   { echo "  PASS  $1"; }
nok()  { echo "  FAIL  $1"; FALHAS=$((FALHAS + 1)); }
igual(){ if [[ "$2" == "$3" ]]; then ok "$1 ($2)"; else nok "$1: esperado '$3', observado '$2'"; fi }
rodar(){ local saida rc; saida="$(aplicar < "$1" 2>&1)"; rc=$?; printf '%s|%s' "$rc" "$saida"; }

q <<'SQL' >/dev/null
create extension if not exists "pgcrypto";
create table public.candidatos(
  id uuid primary key default gen_random_uuid(),
  slug text unique not null
);
create table public.historico_politico(
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid references public.candidatos(id) on delete cascade,
  cargo text not null,
  periodo_inicio integer,
  periodo_fim integer,
  eleito_por text,
  observacoes text
);
create schema if not exists supabase_migrations;
create table supabase_migrations.schema_migrations(
  version text primary key
);
SQL

zerar() {
  q -c "delete from public.historico_politico; delete from public.candidatos; delete from supabase_migrations.schema_migrations;" >/dev/null
}
ficha() { q -c "insert into public.candidatos(slug) values ('$1');" >/dev/null; }
linha() {
  # linha <slug> <cargo> <ano> <eleito_por|NULL> <observacoes>
  local ep="$4"
  [[ "$ep" == "NULL" ]] && ep="null" || ep="'$ep'"
  q -c "insert into public.historico_politico(candidato_id,cargo,periodo_inicio,periodo_fim,eleito_por,observacoes)
        select id,'$2',$3,$3,$ep,'$5' from public.candidatos where slug='$1';" >/dev/null
}
eleito_por_de() {
  q -c "select coalesce((select coalesce(eleito_por,'<NULL>') from public.historico_politico h
        join public.candidatos c on c.id=h.candidato_id
        where c.slug='$1' and h.periodo_inicio=$2 limit 1),'<ausente>');"
}
# Readback do invariante (a'), a mesma query que a Raiz roda na Fase 4.
readback_a() {
  q -c "select count(*) from public.historico_politico where observacoes ~* 'INDEFERID' and eleito_por = 'nao eleito';"
}

# Estado equivalente ao de producao: Lula 2018 divergente do raw, Rui 2006 fiel.
producao() {
  zerar
  ficha lula; ficha rui-costa-pimenta
  linha lula 'Presidente' 2018 'nao eleito' "$OBS_LULA"
  linha rui-costa-pimenta 'Presidente' 2006 'nao eleito' "$OBS_RUI"
}

echo "== forward"

echo "F0 base sem a ficha -> aborta (nao ha no-op silencioso)"
zerar
r="$(rodar "$FWD")"; rc="${r%%|*}"; saida="${r#*|}"
if [[ "$rc" != 0 ]] && grep -q "cardinalidade 0" <<<"$saida"; then
  ok "F0 abortou em base vazia, como no replay linear"
else
  nok "F0 nao abortou (rc=$rc): $(tr '\n' ' ' <<<"$saida" | cut -c1-200)"
fi
igual "F0 nada criado" "$(q -c 'select count(*) from public.historico_politico;')" "0"

echo "F1 alvo ausente -> aborta por cardinalidade 0"
zerar; ficha lula
linha lula 'Presidente' 2018 'nao eleito' 'Candidatura sem o SQ conferido'
r="$(rodar "$FWD")"; rc="${r%%|*}"; saida="${r#*|}"
if [[ "$rc" != 0 ]] && grep -q "cardinalidade 0" <<<"$saida"; then
  ok "F1 abortou por cardinalidade 0"
else
  nok "F1 nao abortou (rc=$rc): $(tr '\n' ' ' <<<"$saida" | cut -c1-200)"
fi
igual "F1 linha intacta" "$(eleito_por_de lula 2018)" "nao eleito"

echo "F2 alvo duplicado -> aborta por cardinalidade 2"
zerar; ficha lula
linha lula 'Presidente' 2018 'nao eleito' "$OBS_LULA"
linha lula 'Presidente' 2018 'nao eleito' "$OBS_LULA"
r="$(rodar "$FWD")"; rc="${r%%|*}"; saida="${r#*|}"
if [[ "$rc" != 0 ]] && grep -q "cardinalidade 2" <<<"$saida"; then
  ok "F2 abortou por cardinalidade 2"
else
  nok "F2 nao abortou (rc=$rc): $(tr '\n' ' ' <<<"$saida" | cut -c1-200)"
fi
igual "F2 nada escrito" "$(q -c "select count(*) from public.historico_politico where eleito_por='nao eleito';")" "2"

echo "F3 ja corrigido -> aborta na pre-condicao"
zerar; ficha lula
linha lula 'Presidente' 2018 NULL "$OBS_LULA"
r="$(rodar "$FWD")"; rc="${r%%|*}"; saida="${r#*|}"
if [[ "$rc" != 0 ]] && grep -q "esperado eleito_por" <<<"$saida"; then
  ok "F3 abortou na pre-condicao"
else
  nok "F3 nao abortou (rc=$rc): $(tr '\n' ' ' <<<"$saida" | cut -c1-200)"
fi

echo "F4 estado de producao -> aplica"
producao
igual "F4 readback (a') ANTES" "$(readback_a)" "2"
r="$(rodar "$FWD")"; rc="${r%%|*}"; saida="${r#*|}"
igual "F4 rc" "$rc" "0"
[[ "$rc" == 0 ]] || echo "       saida: $(tr '\n' ' ' <<<"$saida" | cut -c1-200)"
igual "F4 lula 2018 eleito_por" "$(eleito_por_de lula 2018)" "<NULL>"
igual "F4 rui 2006 intacto (fiel ao raw)" "$(eleito_por_de rui-costa-pimenta 2006)" "nao eleito"
igual "F4 readback (a') DEPOIS" "$(readback_a)" "1"
igual "F4 dado bruto preservado" \
  "$(q -c "select count(*) from public.historico_politico where observacoes like '%280000625869%';")" "1"
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260810085000');" >/dev/null
r="$(rodar "$READBACK")"
igual "F4 readback pos-commit" "${r%%|*}" "0"
linha lula 'Presidente' 2018 'nao eleito' "$OBS_LULA"
r="$(rodar "$READBACK")"
if [[ "${r%%|*}" != 0 ]] && grep -q "cardinalidade total Lula" <<<"${r#*|}"; then ok "F4 readback recusa linha Lula duplicada"; else nok "F4 readback aceitou linha Lula duplicada"; fi
igual "F4 duplicata preservada" "$(q -c "select count(*) from public.historico_politico h join public.candidatos c on c.id=h.candidato_id where c.slug='lula' and h.periodo_inicio=2018")" "2"
q -c "delete from public.historico_politico where id=(select h.id from public.historico_politico h join public.candidatos c on c.id=h.candidato_id where c.slug='lula' and h.periodo_inicio=2018 and h.eleito_por='nao eleito' limit 1)" >/dev/null
r="$(rodar "$READBACK")"; igual "F4 readback sem duplicata" "${r%%|*}" "0"
q -c "insert into public.candidatos(slug) values ('substituto'); update public.historico_politico set candidato_id=(select id from public.candidatos where slug='substituto') where candidato_id=(select id from public.candidatos where slug='rui-costa-pimenta') and periodo_inicio=2006" >/dev/null
r="$(rodar "$READBACK")"
if [[ "${r%%|*}" != 0 ]] && grep -q "Rui 2006" <<<"${r#*|}"; then ok "F4 readback recusa residual substituto"; else nok "F4 readback aceitou residual substituto"; fi
q -c "update public.historico_politico set candidato_id=(select id from public.candidatos where slug='rui-costa-pimenta') where candidato_id=(select id from public.candidatos where slug='substituto'); delete from public.candidatos where slug='substituto'" >/dev/null
r="$(rodar "$READBACK")"; igual "F4 readback Rui restaurado" "${r%%|*}" "0"

echo "== rollback"

echo "R1 rollback sobre F4 -> restaura"
r="$(rodar "$RBK")"; rc="${r%%|*}"; saida="${r#*|}"
igual "R1 rc" "$rc" "0"
[[ "$rc" == 0 ]] || echo "       saida: $(tr '\n' ' ' <<<"$saida" | cut -c1-200)"
igual "R1 lula 2018 restaurado" "$(eleito_por_de lula 2018)" "nao eleito"
igual "R1 readback (a') de volta" "$(readback_a)" "2"
igual "R1 ledger removido" "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260810085000';")" "0"

echo "R2 curadoria posterior -> aborta e nao destroi"
producao
rodar "$FWD" >/dev/null
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260810085000');" >/dev/null
q -c "update public.historico_politico h set eleito_por='indeferido pelo TSE'
      from public.candidatos c where c.id=h.candidato_id and c.slug='lula' and h.periodo_inicio=2018;" >/dev/null
r="$(rodar "$RBK")"; rc="${r%%|*}"; saida="${r#*|}"
if [[ "$rc" != 0 ]] && grep -q "ABORTADO" <<<"$saida"; then
  ok "R2 abortou diante de curadoria posterior"
else
  nok "R2 nao abortou (rc=$rc): $(tr '\n' ' ' <<<"$saida" | cut -c1-200)"
fi
igual "R2 valor novo preservado" "$(eleito_por_de lula 2018)" "indeferido pelo TSE"
igual "R2 ledger preservado" "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260810085000';")" "1"

echo
if [[ "$FALHAS" -eq 0 ]]; then
  echo "OK: 7 ramos, todos como esperado."
  exit 0
fi
echo "FALHOU: $FALHAS verificacao(oes)."
exit 1
