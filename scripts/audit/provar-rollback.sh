#!/usr/bin/env bash
#
# Prova executavel do rollback da 20260809060000, nos DOIS ramos.
#
# Rollback so vale como rollback depois de executado. Este harness sobe Postgres
# 17 efemero (imagem presa por digest, como o replay), aplica o conjunto de
# schema com a migration, e entao:
#
#   RAMO 1  coluna COM verificacao gravada  -> o rollback tem de ABORTAR e nao
#           destruir nada;
#   RAMO 2  coluna vazia                    -> o rollback roda inteiro e o
#           `pg_dump --schema-only` resultante tem de ficar IDENTICO ao de um
#           container que nunca recebeu a migration.
#
# Nao toca banco nenhum persistente. Exige Docker.
#
# Uso: bash scripts/audit/provar-rollback.sh [dir-temporario]
set -euo pipefail
cd "$(dirname "$0")/../.."
T="${1:-$(mktemp -d)}"
IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
NOVA="20260809060000_verificacao_campos_schema_publico.sql"
CRIADOS=()
limpar(){ for c in "${CRIADOS[@]:-}"; do docker rm -f "$c" >/dev/null 2>&1 || true; done; }
trap limpar EXIT
npx tsx scripts/audit/classificar-migrations.ts --json 2>/dev/null > "$T/cls.json"
node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const a=Array.isArray(m)?m:Object.values(m).find(Array.isArray);console.log(a.filter(x=>x.replaySchema).map(x=>x.arquivo).join("\n"))' "$T/cls.json" > "$T/lista67.txt"
grep -v "$NOVA" "$T/lista67.txt" > "$T/lista66.txt"
subir(){ local n="pf-rb2-$$-$1"; CRIADOS+=("$n")
  docker run -d --name "$n" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null
  # Sonda TCP, nao socket: durante o initdb o entrypoint sobe um servidor
  # temporario so no socket unix, e uma sonda de socket aprova cedo demais.
  for _ in $(seq 1 90); do
    if docker exec "$n" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 &&
       docker exec "$n" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
      echo "$n"; return 0
    fi
    sleep 1
  done
  echo "postgres nao subiu" >&2; return 1; }
run(){ docker exec -i "$1" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q; }
aplicar(){ docker exec -i "$1" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction -f - ; }
# O bootstrap e extraido por casamento de TEXTO do replay-migrations.sh. Se
# alguem renomear a funcao, trocar a tag do heredoc ou reindentar, o `sed`
# devolve vazio, o `psql` aceita stdin vazio e sai 0, e o harness seguiria
# contra um banco sem os papeis e schemas do Supabase. Fail-closed.
boot(){
  local sql
  sql="$(sed -n '/^bootstrap() {/,/^}/p' scripts/audit/replay-migrations.sh \
        | sed -n "/psql_run <<'SQL'/,/^SQL$/p" | sed '1d;$d')"
  if [ "$(printf '%s' "$sql" | grep -c 'create schema')" -lt 2 ]; then
    echo "extracao do bootstrap veio vazia ou incompleta: o formato de scripts/audit/replay-migrations.sh mudou" >&2
    return 1
  fi
  printf '%s\n' "$sql" | run "$1"
}
prep(){ local c="$1" lista="$2"; boot "$c"
  # ledger de migrations, como o Supabase tem
  run "$c" <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, name text);
SQL
  while read -r f; do [ -z "$f" ] && continue; aplicar "$c" < "supabase/migrations/$f" >/dev/null 2>&1 || { echo "FALHOU: $f" >&2; exit 1; }; done < "$lista"; }

A=$(subir a); prep "$A" "$T/lista67.txt"
run "$A" <<SQL
insert into supabase_migrations.schema_migrations(version,name) values ('20260809060000','verificacao_campos_schema_publico');
SQL
echo "ledger antes: $(docker exec "$A" psql -U postgres -d postgres -tAc "select count(*) from supabase_migrations.schema_migrations where version='20260809060000'")"

echo "--- RAMO 1: coluna com dado gravado, rollback DEVE abortar ---"
# O replay e schema-only: candidatos esta vazia. Insere UMA linha minima, com as
# colunas NOT NULL sem default descobertas do proprio catalogo.
docker exec "$A" psql -U postgres -d postgres -tAc "select string_agg(column_name,',') from information_schema.columns where table_schema='public' and table_name='candidatos' and is_nullable='NO' and column_default is null" > "$T/naonulos.txt"
echo "colunas NOT NULL sem default: $(cat "$T/naonulos.txt")"
run "$A" <<'SQL'
insert into public.candidatos (nome_completo, nome_urna, slug, partido_atual, partido_sigla, cargo_disputado, verificacao_campos)
values ('Fulano De Prova','Fulano','fx-prova-rollback','Partido De Prova','PDP','Governador','{"candidate_registration":"2026-08-06"}'::jsonb);
SQL
if aplicar "$A" < supabase/rollback/20260809060000_verificacao_campos_schema_publico.rollback.sql 2>"$T/erro.txt"; then
  echo "REPROVADO: o rollback deveria ter abortado com verificacao gravada" >&2; exit 1
fi
# Sair diferente de zero nao basta: erro de sintaxe ou container morto tambem
# sairia diferente de zero. A prova exige a mensagem da guarda.
if ! grep -q "rollback abortado: [0-9]* linha(s) com verificacao gravada" "$T/erro.txt"; then
  echo "REPROVADO: abortou por outra causa, nao pela guarda:" >&2; cat "$T/erro.txt" >&2; exit 1
fi
grep -o "rollback abortado: [0-9]* linha(s) com verificacao gravada" "$T/erro.txt" | head -1
col_apos_abortar=$(docker exec "$A" psql -U postgres -d postgres -tAc "select count(*) from information_schema.columns where table_schema='public' and table_name='candidatos' and column_name='verificacao_campos'")
echo "coluna ainda existe apos abortar: $col_apos_abortar (1 = sim)"
[ "$col_apos_abortar" = "1" ] || { echo "REPROVADO: o abort destruiu a coluna" >&2; exit 1; }

echo "--- RAMO 2: coluna vazia, rollback COMPLETO ---"
run "$A" <<'SQL'
update public.candidatos set verificacao_campos = '{}'::jsonb;
SQL
aplicar "$A" < supabase/rollback/20260809060000_verificacao_campos_schema_publico.rollback.sql
echo "ROLLBACK COMPLETO EXECUTOU"
conferir_zero(){ # rotulo, sql
  local medido; medido=$(docker exec "$A" psql -U postgres -d postgres -tAc "$2" | tr -d ' ')
  echo "$1 $medido (0 = sim)"
  [ "$medido" = "0" ] || { echo "REPROVADO: $1 deveria ser 0, medido $medido" >&2; exit 1; }
}
conferir_zero "coluna removida?     " "select count(*) from information_schema.columns where table_schema='public' and table_name='candidatos' and column_name='verificacao_campos'"
conferir_zero "ledger reconciliado? " "select count(*) from supabase_migrations.schema_migrations where version='20260809060000'"
conferir_zero "privilegio de coluna?" "select count(*) from information_schema.column_privileges where table_schema='public' and table_name='candidatos' and column_name='verificacao_campos'"
docker exec "$A" pg_dump -U postgres -d postgres --schema-only --no-owner --exclude-schema=supabase_migrations > "$T/dump-pos2.sql"

B=$(subir b); prep "$B" "$T/lista66.txt"
docker exec "$B" pg_dump -U postgres -d postgres --schema-only --no-owner --exclude-schema=supabase_migrations > "$T/dump-sem2.sql"
echo "--- schema pos-rollback vs schema sem a migration ---"
if diff <(grep -vE '^\\(restrict|unrestrict)' "$T/dump-pos2.sql") <(grep -vE '^\\(restrict|unrestrict)' "$T/dump-sem2.sql") > "$T/diff2.txt"; then
  echo "IDENTICOS"
else
  echo "REPROVADO: schema pos-rollback difere do schema sem a migration ($(wc -l < "$T/diff2.txt") linhas)" >&2
  head -20 "$T/diff2.txt" >&2
  exit 1
fi
echo "PROVA DO ROLLBACK: APROVADA nos dois ramos"
