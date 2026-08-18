#!/usr/bin/env bash
#
# Prova EXECUTAVEL da 20260810094000 e do rollback dela, em Postgres 17 efemero.
#
# Mesma razao da provar-migration-trilha-a.sh: asserção sobre TEXTO de SQL nao
# julga guard que nao dispara. O que precisa ser provado aqui e a SEPARACAO
# ENTRE OS DOIS CASOS, que e a condicao da tarefa: 2006 tem declaracao de zero e
# vai para `patrimonio`; 2008 nao tem declaracao nenhuma e vai para
# `patrimonio_ausencia_oficial`. Trocar os dois de lugar faz a ficha afirmar
# sobre a fonte o oposto do que a fonte diz, e por isso o cruzamento invertido
# tem ramo proprio nesta prova.
#
# Nove ramos, todos fail-closed. Qualquer divergencia sai RC=1.
#
#   F0 base sem a ficha        -> ABORTA (cardinalidade 0); e a falha medida no
#                                 manifesto de replay, nao um no-op mentiroso
#   F1 sem a candidatura 2006  -> ABORTA, nada escrito
#   F2 sem a candidatura 2008  -> ABORTA, e o patrimonio de 2006 NAO entra
#                                 sozinho (a transacao e uma so)
#   F3 2006 ja tem patrimonio  -> ABORTA, curadoria anterior intacta
#   F4 2008 ja tem ausencia    -> ABORTA, curadoria anterior intacta
#   F5 cruzamento invertido    -> ABORTA nomeando a divergencia (2006 gravado
#                                 como ausencia oficial, que a fonte desmente)
#   F6 estado real de producao -> aplica; 2006 vira declaracao de R$ 0,00 com o
#                                 bem literal, 2008 vira ausencia com SQ 14144,
#                                 e 2014/2018/2022 ficam intactos
#   R1 rollback sobre F6       -> devolve os dois anos ao estado nao_coletado
#   R2 rollback com curadoria posterior -> ABORTA e nao destroi o valor novo
#
# ESCOPO: a semantica dos guards. Fidelidade de schema e do
# `audit:migrations:replay --gate`; aqui a tabela e minima de proposito.
#
# Uso: bash scripts/audit/provar-migration-daciolo.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FWD="supabase/migrations/20260810094000_daciolo_patrimonio_2006_2008.sql"
RBK="supabase/rollback/20260810094000_daciolo_patrimonio_2006_2008.rollback.sql"
READBACK="supabase/readback/20260810094000_daciolo_patrimonio_2006_2008.readback.sql"

BEM_2006='[{"tipo":"Outros bens e direitos","descricao":"Nenhum bem a declarar","valor":0}]'
BEM_2014='[{"tipo":"Veiculo automotor terrestre","descricao":"VERSA NISSAN 2013 FIQ1695","valor":40000}]'
URL_2008="https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2008.zip"
URL_2018="https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip"

for arquivo in "$FWD" "$RBK" "$READBACK"; do
  [[ -f "$arquivo" ]] || { echo "FAIL: $arquivo nao existe"; exit 1; }
done

C="pf-daciolo-$$"
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
abortou(){
  # abortou <rotulo> <rc> <saida> <trecho esperado na mensagem>
  if [[ "$2" != 0 ]] && grep -q "$4" <<<"$3"; then
    ok "$1"
  else
    nok "$1 (rc=$2): $(tr '\n' ' ' <<<"$3" | cut -c1-220)"
  fi
}

q <<'SQL' >/dev/null
create extension if not exists "pgcrypto";
create schema if not exists supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
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
  proveniencia text,
  observacoes text
);
create table public.patrimonio(
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid references public.candidatos(id) on delete cascade,
  ano_eleicao integer not null,
  valor_total numeric(15,2),
  bens jsonb,
  fonte text default 'TSE'
);
create table public.patrimonio_ausencia_oficial(
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  ano_eleicao integer not null,
  sq_candidato text not null,
  fonte_url text,
  verificado_em timestamptz,
  detalhe text,
  execucao text not null default 'A2B-ausencias-oficiais-20260807',
  unique (candidato_id, ano_eleicao)
);
SQL

zerar() {
  q -c "delete from public.patrimonio_ausencia_oficial; delete from public.patrimonio;
        delete from public.historico_politico; delete from public.candidatos;" >/dev/null
}
ficha() { q -c "insert into public.candidatos(slug) values ('$1');" >/dev/null; }
candidatura() {
  # candidatura <slug> <cargo> <ano>
  q -c "insert into public.historico_politico(candidato_id,cargo,periodo_inicio,periodo_fim,proveniencia,observacoes)
        select id,'$2',$3,$3,'tse','Candidatura: SUPLENTE (TSE $3)' from public.candidatos where slug='$1';" >/dev/null
}
patrimonio() {
  # patrimonio <slug> <ano> <valor> <bens json>
  q -c "insert into public.patrimonio(candidato_id,ano_eleicao,valor_total,bens,fonte)
        select id,$2,$3,'$4'::jsonb,'TSE DivulgaCandContas' from public.candidatos where slug='$1';" >/dev/null
}
ausencia() {
  # ausencia <slug> <ano> <sq> <url>
  q -c "insert into public.patrimonio_ausencia_oficial(candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe)
        select id,$2,'$3','$4',now(),'ausencia previa' from public.candidatos where slug='$1';" >/dev/null
}

conta_patrimonio() { q -c "select count(*) from public.patrimonio p join public.candidatos c on c.id=p.candidato_id where c.slug='cabo-daciolo' and p.ano_eleicao=$1;"; }
conta_ausencia()   { q -c "select count(*) from public.patrimonio_ausencia_oficial a join public.candidatos c on c.id=a.candidato_id where c.slug='cabo-daciolo' and a.ano_eleicao=$1;"; }
valor_de()         { q -c "select coalesce((select valor_total::text from public.patrimonio p join public.candidatos c on c.id=p.candidato_id where c.slug='cabo-daciolo' and p.ano_eleicao=$1),'<ausente>');"; }
bem_de()           { q -c "select coalesce((select bens->0->>'descricao' from public.patrimonio p join public.candidatos c on c.id=p.candidato_id where c.slug='cabo-daciolo' and p.ano_eleicao=$1),'<ausente>');"; }
sq_de()            { q -c "select coalesce((select sq_candidato from public.patrimonio_ausencia_oficial a join public.candidatos c on c.id=a.candidato_id where c.slug='cabo-daciolo' and a.ano_eleicao=$1),'<ausente>');"; }
payload_patrimonio_de() {
  q -c "select coalesce((select jsonb_build_object('valor_total',p.valor_total,'bens',p.bens,'fonte',p.fonte)::text from public.patrimonio p join public.candidatos c on c.id=p.candidato_id where c.slug='cabo-daciolo' and p.ano_eleicao=$1),'<ausente>');"
}
payload_ausencia_de() {
  q -c "select coalesce((select jsonb_build_object('sq_candidato',a.sq_candidato,'fonte_url',a.fonte_url,'verificado_em',a.verificado_em,'detalhe',a.detalhe,'execucao',a.execucao)::text from public.patrimonio_ausencia_oficial a join public.candidatos c on c.id=a.candidato_id where c.slug='cabo-daciolo' and a.ano_eleicao=$1),'<ausente>');"
}
payload_2006_ok() {
  q -c "select count(*)=1 from public.patrimonio p join public.candidatos c on c.id=p.candidato_id where c.slug='cabo-daciolo' and p.ano_eleicao=2006 and p.valor_total=0.00 and p.bens='$BEM_2006'::jsonb and p.fonte='TSE Dados Abertos bem_candidato_2006 SQ 12132 RJ (declaracao de nenhum bem)';"
}
payload_2008_ok() {
  q -c "select count(*)=1 from public.patrimonio_ausencia_oficial a join public.candidatos c on c.id=a.candidato_id where c.slug='cabo-daciolo' and a.ano_eleicao=2008 and a.sq_candidato='14144' and a.fonte_url='$URL_2008' and a.verificado_em='2026-08-10T19:00:00Z'::timestamptz and length(a.detalhe)>100 and a.execucao='R1-daciolo-2006-2008-20260810';"
}

# Estado equivalente ao de producao lido em 10/08/2026: as duas candidaturas
# existem no historico, 2014 e 2022 tem patrimonio publicado, 2018 tem ausencia
# oficial, e 2006/2008 nao tem nada (por isso a ficha os exibia nao_coletado).
producao() {
  zerar
  ficha cabo-daciolo
  candidatura cabo-daciolo 'Deputado Estadual' 2006
  candidatura cabo-daciolo 'Vereador' 2008
  candidatura cabo-daciolo 'Deputado Federal' 2014
  patrimonio cabo-daciolo 2014 40000 "$BEM_2014"
  patrimonio cabo-daciolo 2022 64650 '[{"tipo":"OUTROS BENS E DIREITOS","descricao":"CAVALO","valor":64650}]'
  ausencia cabo-daciolo 2018 '280000602500' "$URL_2018"
}

echo "== forward"

echo "F0 base sem a ficha -> aborta (nao ha no-op silencioso)"
zerar
r="$(rodar "$FWD")"; abortou "F0 abortou em base vazia" "${r%%|*}" "${r#*|}" "cardinalidade 0"
igual "F0 nada criado" "$(q -c 'select count(*) from public.patrimonio;')" "0"

echo "F1 ficha sem a candidatura de 2006 -> aborta"
zerar; ficha cabo-daciolo; candidatura cabo-daciolo 'Vereador' 2008
r="$(rodar "$FWD")"; abortou "F1 abortou por candidatura de 2006 ausente" "${r%%|*}" "${r#*|}" "candidatura de 2006"
igual "F1 nada escrito em patrimonio" "$(conta_patrimonio 2006)" "0"

echo "F2 ficha sem a candidatura de 2008 -> aborta, e 2006 nao entra sozinho"
zerar; ficha cabo-daciolo; candidatura cabo-daciolo 'Deputado Estadual' 2006
r="$(rodar "$FWD")"; abortou "F2 abortou por candidatura de 2008 ausente" "${r%%|*}" "${r#*|}" "candidatura de 2008"
igual "F2 patrimonio de 2006 nao entrou pela metade" "$(conta_patrimonio 2006)" "0"
igual "F2 ausencia de 2008 nao entrou" "$(conta_ausencia 2008)" "0"

echo "F3 2006 ja tem patrimonio -> aborta e nao sobrescreve"
producao
patrimonio cabo-daciolo 2006 123456 '[{"tipo":"Imovel","descricao":"CURADORIA ANTERIOR","valor":123456}]'
r="$(rodar "$FWD")"; abortou "F3 abortou diante de patrimonio ja existente" "${r%%|*}" "${r#*|}" "ja existe"
igual "F3 curadoria anterior intacta" "$(bem_de 2006)" "CURADORIA ANTERIOR"
igual "F3 ausencia de 2008 nao entrou" "$(conta_ausencia 2008)" "0"

echo "F4 2008 ja tem ausencia -> aborta e nao sobrescreve"
producao
ausencia cabo-daciolo 2008 'SQ-ANTIGO' "$URL_2008"
r="$(rodar "$FWD")"; abortou "F4 abortou diante de ausencia ja registrada" "${r%%|*}" "${r#*|}" "ja existe ausencia oficial"
igual "F4 ausencia anterior intacta" "$(sq_de 2008)" "SQ-ANTIGO"
igual "F4 patrimonio de 2006 nao entrou" "$(conta_patrimonio 2006)" "0"

echo "F5 cruzamento invertido (2006 gravado como ausencia) -> aborta nomeando a divergencia"
producao
ausencia cabo-daciolo 2006 '12132' "$URL_2008"
r="$(rodar "$FWD")"; abortou "F5 abortou com 2006 classificado como ausencia" "${r%%|*}" "${r#*|}" "registrado como AUSENCIA"
igual "F5 patrimonio de 2006 nao entrou" "$(conta_patrimonio 2006)" "0"

echo "F6 estado de producao -> aplica"
producao
igual "F6 ANTES: patrimonio 2006" "$(conta_patrimonio 2006)" "0"
igual "F6 ANTES: ausencia 2008" "$(conta_ausencia 2008)" "0"
p2014_antes="$(payload_patrimonio_de 2014)"
p2022_antes="$(payload_patrimonio_de 2022)"
a2018_antes="$(payload_ausencia_de 2018)"
r="$(rodar "$FWD")"; rc="${r%%|*}"; saida="${r#*|}"
igual "F6 rc" "$rc" "0"
[[ "$rc" == 0 ]] || echo "       saida: $(tr '\n' ' ' <<<"$saida" | cut -c1-220)"
igual "F6 2006 valor" "$(valor_de 2006)" "0.00"
igual "F6 2006 bem literal do TSE" "$(bem_de 2006)" "Nenhum bem a declarar"
igual "F6 2006 payload completo" "$(payload_2006_ok)" "t"
igual "F6 2006 fora da tabela de ausencia" "$(conta_ausencia 2006)" "0"
igual "F6 2008 SQ da ausencia" "$(sq_de 2008)" "14144"
igual "F6 2008 payload completo" "$(payload_2008_ok)" "t"
igual "F6 2008 fora da tabela de patrimonio" "$(conta_patrimonio 2008)" "0"
igual "F6 2014 payload inteiro intacto" "$(payload_patrimonio_de 2014)" "$p2014_antes"
igual "F6 2022 payload inteiro intacto" "$(payload_patrimonio_de 2022)" "$p2022_antes"
igual "F6 2018 payload inteiro intacto" "$(payload_ausencia_de 2018)" "$a2018_antes"

echo "== rollback"

echo "R1 rollback sobre F6 -> devolve os dois anos ao estado nao_coletado"
q -c "insert into supabase_migrations.schema_migrations(version) values ('20260810094000');" >/dev/null
r="$(rodar "$READBACK")"
igual "R1 readback pos-commit" "${r%%|*}" "0"
q -c "update public.patrimonio_ausencia_oficial a set detalhe=detalhe||' adulterado' from public.candidatos c where c.id=a.candidato_id and c.slug='cabo-daciolo' and a.ano_eleicao=2008" >/dev/null
r="$(rodar "$READBACK")"
abortou "R1 readback recusa detalhe adulterado" "${r%%|*}" "${r#*|}" "readback 20260810094000"
igual "R1 detalhe adulterado preservado" "$(q -c "select count(*) from public.patrimonio_ausencia_oficial a join public.candidatos c on c.id=a.candidato_id where c.slug='cabo-daciolo' and a.ano_eleicao=2008 and a.detalhe like '% adulterado'")" "1"
q -c "update public.patrimonio_ausencia_oficial a set detalhe=regexp_replace(detalhe,' adulterado$','') from public.candidatos c where c.id=a.candidato_id and c.slug='cabo-daciolo' and a.ano_eleicao=2008" >/dev/null
r="$(rodar "$READBACK")"
igual "R1 readback restaurado" "${r%%|*}" "0"
q -c "insert into public.patrimonio(candidato_id,ano_eleicao,valor_total,bens,fonte) select id,2006,999,'[]'::jsonb,'posterior' from public.candidatos where slug='cabo-daciolo'" >/dev/null
r="$(rodar "$READBACK")"
abortou "R1 readback recusa segunda linha 2006" "${r%%|*}" "${r#*|}" "total_2006"
igual "R1 linha concorrente preservada" "$(conta_patrimonio 2006)" "2"
q -c "delete from public.patrimonio p using public.candidatos c where c.id=p.candidato_id and c.slug='cabo-daciolo' and p.ano_eleicao=2006 and p.fonte='posterior'" >/dev/null
r="$(rodar "$READBACK")"
igual "R1 readback sem linha concorrente" "${r%%|*}" "0"
r="$(rodar "$RBK")"; rc="${r%%|*}"; saida="${r#*|}"
igual "R1 rc" "$rc" "0"
[[ "$rc" == 0 ]] || echo "       saida: $(tr '\n' ' ' <<<"$saida" | cut -c1-220)"
igual "R1 patrimonio 2006 removido" "$(conta_patrimonio 2006)" "0"
igual "R1 ausencia 2008 removida" "$(conta_ausencia 2008)" "0"
igual "R1 ledger removido" "$(q -c "select count(*) from supabase_migrations.schema_migrations where version='20260810094000';")" "0"
igual "R1 2014 intacto" "$(valor_de 2014)" "40000.00"
igual "R1 2022 intacto" "$(valor_de 2022)" "64650.00"
igual "R1 2018 intacto" "$(sq_de 2018)" "280000602500"

echo "R2 curadoria posterior -> aborta e nao destroi"
producao
rodar "$FWD" >/dev/null
q -c "update public.patrimonio p set valor_total=7500, bens='[{\"tipo\":\"Imovel\",\"descricao\":\"BEM ACHADO DEPOIS\",\"valor\":7500}]'::jsonb
      from public.candidatos c where c.id=p.candidato_id and c.slug='cabo-daciolo' and p.ano_eleicao=2006;" >/dev/null
r="$(rodar "$RBK")"; abortou "R2 abortou diante de curadoria posterior em 2006" "${r%%|*}" "${r#*|}" "ABORTADO"
igual "R2 valor novo preservado" "$(valor_de 2006)" "7500.00"
igual "R2 ausencia de 2008 preservada" "$(sq_de 2008)" "14144"

echo
if [[ "$FALHAS" -eq 0 ]]; then
  echo "OK: 9 ramos, todos como esperado."
  exit 0
fi
echo "FALHOU: $FALHAS verificacao(oes)."
exit 1
