#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
export DOCKER_CONTEXT=colima
export DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}"
source scripts/audit/replay-migrations.sh
CONTAINER=''
R_APLICADAS=0
R_PULADAS=0

RUN="$(mktemp -d "${TMPDIR:-/tmp}/pf-tse-live-pg17.XXXXXX")"
NET="pf-tse-live-net-$$"
PGRST="pf-tse-live-postgrest-$$"
SERVER_PID=""
cleanup_proof() {
  [[ -z "$SERVER_PID" ]] || kill "$SERVER_PID" >/dev/null 2>&1 || true
  docker rm -f "$PGRST" >/dev/null 2>&1 || true
  [[ -z "$CONTAINER" ]] || docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$RUN"
}
trap cleanup_proof EXIT INT TERM

subir_container live || exit 1
bootstrap || { echo "FAIL: bootstrap PG17" >&2; exit 1; }
lista_schema="$(lista_por_filtro 'm["replaySchema"]')"
replay "$lista_schema" 0
MODO="--schema-gate"
imprime_resumo "$lista_schema"
[[ ${#R_FALHAS[@]} -eq 0 ]] || exit 1
schema_dump="$(dump_schema)"
schema_hash="$(printf '%s\n' "$schema_dump" | python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())')"
expected_hash="$(python3 -c 'import json; print(json.load(open("scripts/audit/schema-replay-substituicoes.json"))["schema_dump_sha256"])')"
[[ "$schema_hash" == "$expected_hash" ]] || { echo "FAIL: schema digest $schema_hash differs from pinned $expected_hash" >&2; exit 1; }
echo "PASS pinned replay schema digest: $schema_hash (migrations=$R_APLICADAS skipped=$R_PULADAS)"

docker network create "$NET" >/dev/null
docker network connect "$NET" "$CONTAINER"
docker exec "$CONTAINER" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -q -c \
  'GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;'
docker run -d --name "$PGRST" --network "$NET" -p 127.0.0.1::3000 \
  -e PGRST_DB_URI="postgres://authenticator:postgres@$CONTAINER:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET='local-only-pg17-tse-live-proof-signing-secret' \
  -e PGRST_SERVER_PORT=3000 public.ecr.aws/supabase/postgrest:v14.10 >/dev/null
PGRST_PORT="$(docker port "$PGRST" 3000/tcp | sed 's/.*://')"
[[ "$PGRST_PORT" =~ ^[0-9]+$ ]] || { echo "FAIL: PostgREST local port unavailable" >&2; exit 1; }
export PF_TSE_PGRST_URL="http://127.0.0.1:$PGRST_PORT"
export SUPABASE_URL="http://127.0.0.1:43871"
export SUPABASE_SERVICE_ROLE_KEY="$(node -e 'const c=require("node:crypto");const b=x=>Buffer.from(JSON.stringify(x)).toString("base64url");const i=Math.floor(Date.now()/1000);const h=b({alg:"HS256",typ:"JWT"});const p=b({role:"service_role",iss:"supabase",iat:i,exp:i+3600});const s=c.createHmac("sha256","local-only-pg17-tse-live-proof-signing-secret").update(`${h}.${p}`).digest("base64url");process.stdout.write(`${h}.${p}.${s}`)')"
export PF_TSE_LIVE_ROOT="$RUN"
export PF_TSE_LIVE_SERVER_PORT=43871
export HOME="$RUN/home"
mkdir -m 700 -p "$HOME"

docker exec -i "$CONTAINER" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.candidatos (id,nome_completo,nome_urna,slug,partido_atual,partido_sigla,cargo_disputado,estado,status,publicavel)
VALUES
 ('00000000-0000-4000-8000-000000000101','Perfil Sintético Seguro','Seguro','pf-live-safe','Partido Sintético','SYN','Deputado Federal','SP','candidato',true),
 ('00000000-0000-4000-8000-000000000102','Perfil Sintético em Revisão','Risco','pf-live-risk','Partido Sintético','SYN','Deputado Federal','SP','candidato',true);
INSERT INTO public.financiamento (id,candidato_id,ano_eleicao,sq_candidato,uf_candidatura,cargo_candidatura,total_arrecadado,total_fundo_partidario,total_fundo_eleitoral,total_pessoa_fisica,total_recursos_proprios,categorias_origem,maiores_doadores,fonte)
VALUES
 ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',2026,'260000000101','SP','Deputado Federal',1000,0,1000,0,0,
 '{"fundo_eleitoral":1000,"fundo_partidario":0,"outros_recursos":0,"nao_informado_pelo_tse":0}',
 '[{"nome":"PARTIDO SINTÉTICO","valor":1000,"tipo":"fundo_eleitoral"}]','TSE'),
 ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102',2026,'260000000102','SP','Deputado Federal',4444,0,4444,0,0,
 '{"fundo_eleitoral":4444,"fundo_partidario":0,"outros_recursos":0,"nao_informado_pelo_tse":0}',
 '[{"nome":"PARTIDO SINTÉTICO","valor":4444,"tipo":"fundo_eleitoral"}]','TSE');
INSERT INTO public.patrimonio (candidato_id,ano_eleicao,valor_total,bens,fonte)
VALUES ('00000000-0000-4000-8000-000000000102',2026,7777,'[{"tipo":"fixture","descricao":"synthetic sentinel","valor":7777}]','curadoria');
INSERT INTO public.historico_politico (candidato_id,cargo,periodo_inicio,periodo_fim,partido,estado)
VALUES ('00000000-0000-4000-8000-000000000101','Deputado Federal',2018,2022,'SYN','SP');
SQL

for _ in $(seq 1 60); do
  if curl -fsS "$PF_TSE_PGRST_URL/" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "$PF_TSE_PGRST_URL/" >/dev/null || { echo "FAIL: local PostgREST did not become ready" >&2; exit 1; }
node --import tsx scripts/audit/provar-tse-local-live-pg17.ts --serve >"$RUN/local-site.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PF_TSE_LIVE_SERVER_PORT/api/candidato-slugs" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PF_TSE_LIVE_SERVER_PORT/api/candidato-slugs" >/dev/null || { cat "$RUN/local-site.log" >&2; echo "FAIL: local profile API did not become ready" >&2; exit 1; }

node --import tsx scripts/audit/provar-tse-local-live-pg17.ts

echo "== SQL assertions: domain writes and receipts"
docker exec -i "$CONTAINER" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 <<'SQL'
DO $proof$
DECLARE safe_id uuid := '00000000-0000-4000-8000-000000000101';
DECLARE risk_id uuid := '00000000-0000-4000-8000-000000000102';
BEGIN
  ASSERT (SELECT count(*)=1 FROM public.financiamento WHERE id='00000000-0000-4000-8000-000000000201' AND candidato_id=safe_id AND ano_eleicao=2026 AND total_arrecadado=1250 AND fonte='TSE'), 'safe finance row not updated as planned';
  ASSERT (SELECT count(*)=1 FROM public.financiamento WHERE id='00000000-0000-4000-8000-000000000202' AND candidato_id=risk_id AND ano_eleicao=2026 AND total_arrecadado=4444 AND fonte='TSE'), 'risk financing row changed';
  ASSERT (SELECT count(*)=1 FROM public.patrimonio WHERE candidato_id=risk_id AND ano_eleicao=2026 AND valor_total=7777 AND bens='[{"tipo":"fixture","descricao":"synthetic sentinel","valor":7777}]'::jsonb), 'risk patrimônio row changed';
  ASSERT NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE alvo='pf-live-risk'), 'risk profile received coleta_log row';
  ASSERT (SELECT count(*) >= 3 FROM public.coleta_log WHERE alvo='pf-live-safe'), 'expected finance/family/history receipts missing';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.coleta_log
    WHERE volume IS NULL OR volume < 0
       OR (resultado='encontrado' AND volume=0)
       OR (resultado IN ('vazio_confirmado','nao_aplicavel','indeterminado') AND volume<>0)
       OR (escopo<>'candidato' AND candidato_id IS NOT NULL)
  ), 'coleta_log constraint predicate violated';
END
$proof$;
SELECT 'PASS SQL: safe finance updated; risk finance/patrimônio unchanged; risk receipts=0; all collection receipts satisfy constraints' AS assertion;
SQL

before="$(docker exec "$CONTAINER" psql -U postgres -d postgres -X -Atqc 'SELECT count(*) FROM public.coleta_log')"
response_code="$(curl -sS -o "$RUN/invalid-batch.json" -w '%{http_code}' -X POST "$SUPABASE_URL/rest/v1/coleta_log" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
  --data '[{"fonte":"synthetic-live-control","escopo":"candidato","alvo":"pf-live-safe","candidato_id":"00000000-0000-4000-8000-000000000101","resultado":"encontrado","volume":1,"execucao":"negative-control"},{"fonte":"synthetic-live-control","escopo":"candidato","alvo":"pf-live-safe","candidato_id":"00000000-0000-4000-8000-000000000101","resultado":"encontrado","volume":0,"execucao":"negative-control"}]' || true)"
after="$(docker exec "$CONTAINER" psql -U postgres -d postgres -X -Atqc 'SELECT count(*) FROM public.coleta_log')"
error_code="$(node -e 'try{process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).code ?? "")}catch{}' "$RUN/invalid-batch.json")"
[[ "$response_code" == 400 && "$error_code" == 23514 && "$before" == "$after" ]] || { echo "FAIL: invalid bulk receipt batch did not fail atomically on CHECK (HTTP=$response_code SQLSTATE=$error_code before=$before after=$after)" >&2; cat "$RUN/invalid-batch.json" >&2; exit 1; }
echo "PASS negative batch control: SQLSTATE 23514, HTTP $response_code; coleta_log count unchanged ($before)"
echo "PASS PG17 live proof complete: pinned production-schema replay + local PostgREST + actual reviewed writer paths + SQL assertions"
