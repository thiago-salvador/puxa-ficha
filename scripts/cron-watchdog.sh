#!/usr/bin/env bash
set -euo pipefail

REPO="${GH_REPO:-thiago-salvador/puxa-ficha}"
DRY_RUN="${WATCHDOG_DRY_RUN:-0}"
GRACE_DAYS="${WATCHDOG_GRACE_DAYS:-8}"
SELF_FILE="cron-watchdog.yml"
LABEL="cron-failure"
OPTOUT_MARKER="cron-watchdog: skipped-ok-com-gate-desligado"
NOW_EPOCH="$(date +%s)"
ANOMALIES=0

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "comando obrigatório ausente: $1" >&2
    exit 1
  }
}

require_command gh
require_command jq
require_command node
require_command curl

iso_to_epoch() {
  node -e 'const value=Date.parse(process.argv[1]); if(!Number.isFinite(value)) process.exit(1); console.log(Math.floor(value/1000))' "$1"
}

json_get() {
  gh api --method GET "$@"
}

ensure_label() {
  if [[ "$DRY_RUN" == "1" ]]; then return 0; fi
  gh label create "$LABEL" \
    --repo "$REPO" \
    --description "Falha ou ausência de execução agendada detectada pelo watchdog" \
    --color B60205 \
    --force >/dev/null
}

# Recibo estruturado da falha.
#
# O motivo real ja sai tipado dos proprios scripts do repo: status de
# consolidacao (PESQUISAS_CONSOLIDATION_STATUS), ::error:: nomeado nos gates de
# secret, exit code. O watchdog estava descartando tudo isso e publicando so a
# URL do run, entao cada investigacao comecava baixando o log inteiro
# (medido em 19/09: 75 KB no pesquisas-monitoramento, 113 KB no data-quality).
# Ler e filtrar aqui, no runner, custa nada e a issue passa a carregar o motivo.
#
# O filtro e lexico, nao semantico: mantem linha que casa com marcador de erro
# conhecido e descarta eco de fonte do shell. Nada aqui decide se a falha e
# grave; isso continua sendo leitura humana.
#
# Os tetos sao operados por env, entao valor torto tem que cair no fallback em
# vez de virar recibo vazio com mensagem sem sentido: jq --argjson recusa "abc",
# [:0] devolve nada e Number("abc") vira NaN, que zera o slice no lado do node.
# Teto maximo tambem existe para o recibo nao inchar o corpo da issue.
receipt_limit() {
  local value="$1" fallback="$2" ceiling="$3"
  if [[ "$value" =~ ^[0-9]+$ ]] && ((10#$value >= 1)) && ((10#$value <= ceiling)); then
    printf '%s' "$((10#$value))"
  else
    printf '%s' "$fallback"
  fi
}

RECEIPT_MAX_JOBS="$(receipt_limit "${WATCHDOG_RECEIPT_MAX_JOBS:-3}" 3 20)"
RECEIPT_MAX_LINES="$(receipt_limit "${WATCHDOG_RECEIPT_MAX_LINES:-8}" 8 100)"

receipt_filter() {
  WATCHDOG_RECEIPT_MAX_LINES="$RECEIPT_MAX_LINES" node -e '
const requested = Number(process.env.WATCHDOG_RECEIPT_MAX_LINES)
const max = Number.isSafeInteger(requested) && requested > 0 ? requested : 8
const text = require("node:fs").readFileSync(0, "utf8")
// Duas faixas. A forte e o que localiza a causa (asserção, erro nomeado); a
// fraca e contexto util (status tipado, exit code). Quando ha mais linha
// marcada que o teto, a fraca sai primeiro: medido no run 35448599774, em que
// nomes de teste contendo "falha" ocupavam as 8 linhas e empurravam a
// AssertionError para fora do recibo.
const strong = /(##\[error\]|::error::|AssertionError|^not ok |^FAIL:|^✖|^Error:|^npm (?:error|ERR!)|^\s*at .*\.(ts|mjs|js):\d+)/
const weak = /([A-Z][A-Z0-9_]*_STATUS=|operation_status=|coverage_status=|\bError:|\bfalha\b|exit code)/
// Linha de teste que passou nunca e causa, e ✔/ℹ sao o ruido mais volumoso de
// uma suite grande.
const drop = /(DeprecationWarning|if-no-files-found|^[✔✓ℹ]|^\* \[|^echo |>&2|^set -euo|^shell:|^##\[group\]|^if \[)/
const out = []
const seen = new Set()
let total = 0
for (const raw of text.split(/\r?\n/)) {
  const line = raw
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, "")
    .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, "")
    .trim()
  if (!line || drop.test(line)) continue
  const rank = strong.test(line) ? 2 : weak.test(line) ? 1 : 0
  if (rank === 0) continue
  total += 1
  const short = line.length > 240 ? line.slice(0, 240) + "..." : line
  if (seen.has(short)) continue
  seen.add(short)
  out.push({ short, rank, order: out.length })
}
if (out.length === 0) process.exit(0)
// Corta por prioridade, devolve na ordem original do log.
const shown = out
  .slice()
  .sort((a, b) => b.rank - a.rank || b.order - a.order)
  .slice(0, max)
  .sort((a, b) => a.order - b.order)
  .map((item) => item.short)
if (total > shown.length) console.log("(" + total + " linhas marcadas, mostrando as ultimas " + shown.length + ")")
console.log(shown.join("\n"))
'
}

# gh se recusa a imprimir log de job com escape ANSI sem esta flag, e o log de
# Actions sempre tem. Versao antiga de gh nao conhece a flag, entao cai para a
# chamada simples em vez de perder o recibo inteiro.
job_log() {
  local job_id="$1"
  if gh api --method GET --allow-escape-sequences "repos/${REPO}/actions/jobs/${job_id}/logs" 2>/dev/null; then return 0; fi
  if gh api --method GET "repos/${REPO}/actions/jobs/${job_id}/logs" 2>/dev/null; then return 0; fi
  # Silencio aqui esconderia token sem actions:read ou log expirado para sempre.
  echo "watchdog: log do job ${job_id} indisponivel, recibo sai sem linhas" >&2
  return 0
}

failure_receipt() {
  local run_id="$1"
  if [[ -z "$run_id" ]]; then return 0; fi

  local jobs_json
  if ! jobs_json="$(json_get "repos/${REPO}/actions/runs/${run_id}/jobs" -f per_page=100 2>/dev/null)"; then
    echo "watchdog: jobs do run ${run_id} indisponiveis, issue sai sem recibo" >&2
    return 0
  fi
  if ! jq -e '.jobs' >/dev/null 2>&1 <<<"$jobs_json"; then
    echo "watchdog: resposta de jobs do run ${run_id} sem campo .jobs, issue sai sem recibo" >&2
    return 0
  fi

  local failed
  # Ids sao numericos na API; filtrar aqui evita passar lixo para --argjson
  # adiante e deixar o watchdog cuspindo erro de jq no meio do loop.
  if ! failed="$(jq -r --argjson limit "$RECEIPT_MAX_JOBS" \
    '[.jobs[] | select(.conclusion == "failure" and (.id | type) == "number")][:$limit][] | "\(.id)\t\(.name)"' <<<"$jobs_json")"; then
    echo "watchdog: nao consegui listar jobs com falha do run ${run_id}, issue sai sem recibo" >&2
    return 0
  fi
  if [[ -z "$failed" ]]; then return 0; fi

  printf '### Recibo da falha\n\n'
  local job_id job_name steps lines
  while IFS=$'\t' read -r job_id job_name; do
    if [[ -z "$job_id" ]]; then continue; fi
    if ! steps="$(jq -r --argjson id "$job_id" \
      '.jobs[] | select(.id == $id) | [.steps[]? | select(.conclusion == "failure") | .name] | join(" / ")' \
      <<<"$jobs_json" 2>/dev/null)"; then
      steps=""
    fi
    printf -- '- job: **%s**\n' "$job_name"
    if [[ -n "$steps" ]]; then printf -- '- step: `%s`\n' "$steps"; fi
    if ! lines="$(job_log "$job_id" | receipt_filter)"; then
      lines=""
    fi
    if [[ -n "$lines" ]]; then
      printf -- '\n```\n%s\n```\n\n' "$lines"
    else
      printf -- '- sem linha marcada no log do job\n\n'
    fi
  done <<<"$failed"
}

publish_anomaly() {
  local workflow_file="$1"
  local workflow_name="$2"
  local status_label="$3"
  local run_url="$4"
  local run_id="$5"
  local source_path="${6:-.github/workflows/${workflow_file}}"
  local marker="<!-- cron-watchdog-workflow:${workflow_file} -->"
  # Exact observation identity, excluding the clock. A new failed run remains
  # actionable even if its conclusion matches yesterday's failure.
  local fingerprint
  fingerprint=$(node -e 'const {createHash}=require("node:crypto"); console.log(createHash("sha256").update(JSON.stringify(process.argv.slice(1))).digest("hex"))' \
    "$workflow_file" "$source_path" "$status_label" "$run_url" "$run_id")
  local fingerprint_marker="<!-- cron-watchdog-fingerprint:${fingerprint} -->"
  local title="[cron-failure] ${workflow_name}"
  local recovery_note
  if [[ "$source_path" == "vercel.json" ]]; then
    recovery_note="A sonda HTTP autenticada precisa responder 200 com \`ok: true\`."
  else
    recovery_note="O watchdog considera a última execução \`schedule\`. Um rerun posterior em verde (dispatch ou push) conta como recuperado."
  fi
  local run_line
  if [[ -n "$run_id" ]]; then
    run_line="- Última execução agendada concluída: [${run_id}](${run_url})"
  else
    run_line="- Execução: [abrir workflow](${run_url})"
  fi
  local receipt
  receipt="$(failure_receipt "$run_id")"
  if [[ -n "$receipt" ]]; then receipt=$'\n'"$receipt"; fi

  local body
  body=$(cat <<EOF
## Anomalia de cron detectada

- Workflow: **${workflow_name}**
- Arquivo: \`${source_path}\`
- Estado: **${status_label}**
${run_line}
- Detectado em: $(date -u +%Y-%m-%dT%H:%M:%SZ)
${receipt}
${recovery_note}

${marker}
${fingerprint_marker}
EOF
)

  local existing existing_json
  existing_json=$(json_get --paginate "repos/${REPO}/issues" -f state=open -f labels="$LABEL" -f per_page=100 |
    jq -sc --arg marker "$marker" 'add | map(select(.pull_request == null and (.body // "" | contains($marker)))) | first // {}')
  existing=$(jq -r '.number // empty' <<<"$existing_json")

  if [[ -n "$existing" ]] && jq -e --arg marker "$fingerprint_marker" \
    '(.body // "") | contains($marker)' <<<"$existing_json" >/dev/null; then
    echo "ação: manter issue #${existing}; ocorrência idêntica já registrada"
    return 0
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "--- WATCHDOG DRY-RUN ---"
    if [[ -n "$existing" ]]; then
      echo "ação: comentar issue #${existing}"
    else
      echo "ação: criar issue"
    fi
    echo "título: ${title}"
    echo "$body"
    return 0
  fi

  if [[ -n "$existing" ]]; then
    jq -n --arg body "$body" '{body:$body}' |
      gh api --method POST "repos/${REPO}/issues/${existing}/comments" --input - >/dev/null
    # Persist only after the comment succeeds, so a failed publication retries.
    jq -n --arg body "$body" '{body:$body}' |
      gh api --method PATCH "repos/${REPO}/issues/${existing}" --input - >/dev/null
  else
    jq -n --arg title "$title" --arg body "$body" --arg label "$LABEL" \
      '{title:$title,body:$body,labels:[$label]}' |
      gh api --method POST "repos/${REPO}/issues" --input - >/dev/null
  fi
}

WORKFLOW_FILES=()
while IFS= read -r file; do
  if grep -Eq '^  schedule:' "$file"; then
    WORKFLOW_FILES+=("$(basename "$file")")
  fi
done < <(find .github/workflows -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) -print | sort)

ensure_label

for workflow_file in "${WORKFLOW_FILES[@]}"; do
  [[ "$workflow_file" == "$SELF_FILE" ]] && continue

  workflow_json=$(json_get "repos/${REPO}/actions/workflows/${workflow_file}")
  workflow_name=$(jq -r '.name' <<<"$workflow_json")
  workflow_created_at=$(jq -r '.created_at' <<<"$workflow_json")
  workflow_url=$(jq -r '.html_url' <<<"$workflow_json")
  runs_json=$(json_get "repos/${REPO}/actions/workflows/${workflow_file}/runs" \
    -f event=schedule -f status=completed -f per_page=1)
  run_count=$(jq '.workflow_runs | length' <<<"$runs_json")

  if [[ "$run_count" -eq 0 ]]; then
    created_epoch=$(iso_to_epoch "$workflow_created_at")
    age_days=$(( (NOW_EPOCH - created_epoch) / 86400 ))
    if [[ "$age_days" -ge "$GRACE_DAYS" ]]; then
      ANOMALIES=$((ANOMALIES + 1))
      publish_anomaly "$workflow_file" "$workflow_name" \
        "nenhuma execução agendada concluída em ${GRACE_DAYS} dias" "$workflow_url" ""
    else
      echo "ok: ${workflow_name}, sem run e dentro da carência (${age_days}/${GRACE_DAYS} dias)"
    fi
    continue
  fi

  conclusion=$(jq -r '.workflow_runs[0].conclusion' <<<"$runs_json")
  run_id=$(jq -r '.workflow_runs[0].id' <<<"$runs_json")
  run_url=$(jq -r '.workflow_runs[0].html_url' <<<"$runs_json")
  run_completed_at=$(jq -r '.workflow_runs[0].updated_at // .workflow_runs[0].created_at' <<<"$runs_json")
  run_epoch=$(iso_to_epoch "$run_completed_at")
  run_age_days=$(( (NOW_EPOCH - run_epoch) / 86400 ))
  # Workflow com gate de ativação declarado conclui "skipped" de propósito
  # enquanto está desligado. O marcador mora no próprio arquivo do workflow,
  # para o motivo ser lido junto com o gate. Sem marcador, "skipped" continua
  # sendo anomalia, e o watchdog segue fail-closed.
  if [[ "$conclusion" == "skipped" ]] &&
    grep -q "$OPTOUT_MARKER" ".github/workflows/${workflow_file}"; then
    echo "ok: ${workflow_name}, execução pulada com o gate declarado desligado"
    continue
  fi

  if [[ "$conclusion" != "success" ]]; then
    # Cron vermelho com rerun posterior em verde (dispatch ou push) está
    # recuperado: senão a issue fecha hoje e o watchdog reabre amanhã.
    latest_json=$(json_get "repos/${REPO}/actions/workflows/${workflow_file}/runs" \
      -f status=completed -f per_page=1)
    latest_conclusion=$(jq -r '.workflow_runs[0].conclusion // empty' <<<"$latest_json")
    latest_id=$(jq -r '.workflow_runs[0].id // empty' <<<"$latest_json")
    if [[ "$latest_conclusion" == "success" && "$latest_id" != "$run_id" ]]; then
      echo "ok: ${workflow_name}, cron ${conclusion} mas rerun ${latest_id} em verde"
    else
      ANOMALIES=$((ANOMALIES + 1))
      publish_anomaly "$workflow_file" "$workflow_name" "$conclusion" "$run_url" "$run_id"
    fi
  elif [[ "$run_age_days" -ge "$GRACE_DAYS" ]]; then
    ANOMALIES=$((ANOMALIES + 1))
    publish_anomaly "$workflow_file" "$workflow_name" \
      "sem execução agendada concluída nos últimos ${GRACE_DAYS} dias" "$run_url" "$run_id"
  else
    echo "ok: ${workflow_name}"
  fi
done

list_vercel_crons() {
  local count
  count="$(jq '.crons | length' vercel.json)"
  echo "vercel_crons_declarados=${count}"
  jq -r '.crons[] | "vercel-cron: \(.path) \(.schedule)"' vercel.json
}

origin_allowed_for_secret() {
  local origin="$1"
  case "$origin" in
    https://*) return 0 ;;
    http://localhost|http://localhost:*|http://127.0.0.1|http://127.0.0.1:*) return 0 ;;
    *) return 1 ;;
  esac
}

probe_runtime_smoke() {
  local origin="${PF_RUNTIME_SMOKE_ORIGIN:-https://puxaficha.com.br}"
  origin="${origin%/}"
  local smoke_url="${origin}/api/internal/runtime-smoke"
  local http_code="000"
  local smoke_ok="false"
  local smoke_body
  local status_label

  if ! origin_allowed_for_secret "$origin"; then
    ANOMALIES=$((ANOMALIES + 1))
    publish_anomaly "runtime-smoke" "runtime-smoke" \
      "origem recusada (exige https ou loopback)" "$smoke_url" "" "vercel.json"
    return 0
  fi

  if [[ -z "${CRON_SECRET:-}" ]]; then
    ANOMALIES=$((ANOMALIES + 1))
    publish_anomaly "runtime-smoke" "runtime-smoke" \
      "CRON_SECRET ausente no ambiente do watchdog" "$smoke_url" "" "vercel.json"
    return 0
  fi

  smoke_body="$(mktemp)"
  if ! http_code="$(curl -sS -o "$smoke_body" -w "%{http_code}" \
      --max-time 45 \
      -H "Authorization: Bearer ${CRON_SECRET}" \
      -H "User-Agent: puxaficha-cron-watchdog/1.0" \
      "$smoke_url")"; then
    http_code="${http_code:-000}"
    status_label="curl falhou (HTTP ${http_code})"
  else
    smoke_ok="$(jq -r '.ok // false' "$smoke_body" 2>/dev/null || echo false)"
    if [[ "$http_code" == "200" && "$smoke_ok" == "true" ]]; then
      echo "ok: runtime-smoke"
      rm -f "$smoke_body"
      return 0
    fi
    status_label="HTTP ${http_code}, ok=${smoke_ok}"
  fi
  rm -f "$smoke_body"

  ANOMALIES=$((ANOMALIES + 1))
  publish_anomaly "runtime-smoke" "runtime-smoke" \
    "$status_label" "$smoke_url" "" "vercel.json"
}

# Frescor dos crons com rastro de coleta/envio ou recibo operacional privado.
# A rota /api/internal/cron-freshness devolve o último instante de cada um; se
# o cron deixar de disparar (plano, cron desativado, CRON_SECRET rotacionado de
# um lado só), nenhum 500 acontece e só esta sonda percebe.
probe_cron_freshness() {
  local origin="${PF_RUNTIME_SMOKE_ORIGIN:-https://puxaficha.com.br}"
  origin="${origin%/}"
  local url="${origin}/api/internal/cron-freshness"
  local max_hours="${WATCHDOG_FRESHNESS_MAX_HOURS:-36}"
  local http_code="000"
  local body

  if ! origin_allowed_for_secret "$origin" || [[ -z "${CRON_SECRET:-}" ]]; then
    # Já denunciado por probe_runtime_smoke com o mesmo motivo.
    return 0
  fi

  body="$(mktemp)"
  if ! http_code="$(curl -sS -o "$body" -w "%{http_code}" \
      --max-time 45 \
      -H "Authorization: Bearer ${CRON_SECRET}" \
      -H "User-Agent: puxaficha-cron-watchdog/1.0" \
      "$url")" || [[ "$http_code" != "200" ]]; then
    rm -f "$body"
    ANOMALIES=$((ANOMALIES + 1))
    publish_anomaly "cron-freshness" "cron-freshness" \
      "sonda de frescor respondeu HTTP ${http_code:-000}" "$url" "" "vercel.json"
    return 0
  fi

  # HTTP 200 sozinho não prova que todos os crons foram medidos. Um deploy
  # antigo ou payload malformado não pode transformar uma lista vazia em verde.
  if ! jq -e '
    .ok == true and (.checks | type == "array") and
    ([.checks[].name] | sort == ["news-refresh", "news-refresh-recover", "published-consistency", "revalidate-public-cache", "send-digest"]) and
    all(.checks[]; has("age_hours") and (.age_hours == null or
      ((.age_hours | type) == "number" and .age_hours >= 0)))
  ' "$body" >/dev/null 2>&1; then
    rm -f "$body"
    ANOMALIES=$((ANOMALIES + 1))
    publish_anomaly "cron-freshness" "cron-freshness" \
      "contrato de frescor inválido: roster ou idades ausentes" "$url" "" "vercel.json"
    return 0
  fi

  local name age limit_hours
  while IFS=$'\t' read -r name age; do
    [[ -z "$name" ]] && continue
    limit_hours="$max_hours"
    [[ "$name" == "revalidate-public-cache" ]] && limit_hours=1
    if [[ "$age" == "null" ]]; then
      if [[ "$name" == "news-refresh-recover" || "$name" == "published-consistency" || "$name" == "revalidate-public-cache" ]]; then
        ANOMALIES=$((ANOMALIES + 1))
        publish_anomaly "vercel-cron-${name}" "vercel-cron-${name}" \
          "recibo de execução ausente" "$url" "" "vercel.json"
        continue
      fi
      echo "frescor: ${name} sem rastro ainda"
      continue
    fi
    if awk -v a="$age" -v m="$limit_hours" 'BEGIN { exit !(a > m) }'; then
      ANOMALIES=$((ANOMALIES + 1))
      publish_anomaly "vercel-cron-${name}" "vercel-cron-${name}" \
        "último rastro há ${age}h (limite ${limit_hours}h)" "$url" "" "vercel.json"
    else
      echo "ok: frescor ${name} (${age}h)"
    fi
  done < <(jq -r '.checks[]? | [.name, (.age_hours // "null" | tostring)] | @tsv' "$body")
  rm -f "$body"
}

# Produção atrás de main. A promoção é manual por desenho; o que não pode é
# main ficar à frente por dias sem ninguém notar.
probe_main_drift() {
  local origin="${PF_RUNTIME_SMOKE_ORIGIN:-https://puxaficha.com.br}"
  origin="${origin%/}"
  local url="${origin}/api/deployment-info"
  local max_hours="${WATCHDOG_DRIFT_MAX_HOURS:-24}"
  local body prod_sha head_sha head_epoch now_epoch age_hours

  # Sem segredo o watchdog está mal configurado e já abriu issue; não faz
  # nenhuma chamada de rede nesse estado (contrato do teste).
  if ! origin_allowed_for_secret "$origin" || [[ -z "${CRON_SECRET:-}" ]]; then
    return 0
  fi

  body="$(mktemp)"
  if ! curl -sS -o "$body" --max-time 20 -H "User-Agent: puxaficha-cron-watchdog/1.0" "$url"; then
    rm -f "$body"
    echo "drift: deployment-info indisponível, sem comparação"
    return 0
  fi
  prod_sha="$(jq -r '.commitSha // empty' "$body" 2>/dev/null || true)"
  rm -f "$body"
  if [[ ! "$prod_sha" =~ ^[0-9a-f]{7,40}$ ]]; then
    echo "drift: deployment-info sem commitSha, sem comparação"
    return 0
  fi
  head_sha="$(git rev-parse HEAD 2>/dev/null || true)"
  if [[ -z "$head_sha" || "$head_sha" == "$prod_sha"* || "$prod_sha" == "$head_sha"* ]]; then
    echo "ok: produção serve o HEAD de main (${prod_sha})"
    return 0
  fi
  head_epoch="$(git log -1 --format=%ct HEAD 2>/dev/null || echo 0)"
  now_epoch="$(date -u +%s)"
  age_hours=$(( (now_epoch - head_epoch) / 3600 ))
  if (( age_hours > max_hours )); then
    ANOMALIES=$((ANOMALIES + 1))
    publish_anomaly "producao-atras-de-main" "producao-atras-de-main" \
      "produção em ${prod_sha}, main em ${head_sha} há ${age_hours}h (limite ${max_hours}h)" "$url" "" "vercel.json"
  else
    echo "drift: main à frente de produção há ${age_hours}h, dentro do limite de ${max_hours}h"
  fi
}

list_vercel_crons
probe_runtime_smoke
probe_cron_freshness
probe_main_drift

echo "anomalias_detectadas=${ANOMALIES}"
