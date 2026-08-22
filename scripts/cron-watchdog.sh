#!/usr/bin/env bash
set -euo pipefail

REPO="${GH_REPO:-thiago-salvador/puxa-ficha}"
DRY_RUN="${WATCHDOG_DRY_RUN:-0}"
GRACE_DAYS="${WATCHDOG_GRACE_DAYS:-8}"
SELF_FILE="cron-watchdog.yml"
LABEL="cron-failure"
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

publish_anomaly() {
  local workflow_file="$1"
  local workflow_name="$2"
  local status_label="$3"
  local run_url="$4"
  local run_id="$5"
  local source_path="${6:-.github/workflows/${workflow_file}}"
  local marker="<!-- cron-watchdog-workflow:${workflow_file} -->"
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
  local body
  body=$(cat <<EOF
## Anomalia de cron detectada

- Workflow: **${workflow_name}**
- Arquivo: \`${source_path}\`
- Estado: **${status_label}**
${run_line}
- Detectado em: $(date -u +%Y-%m-%dT%H:%M:%SZ)

${recovery_note}

${marker}
EOF
)

  local existing
  existing=$(json_get "repos/${REPO}/issues" -f state=open -f labels="$LABEL" -f per_page=100 |
    jq -r --arg marker "$marker" '.[] | select(.pull_request == null and (.body // "" | contains($marker))) | .number' |
    head -n 1)

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

list_vercel_crons
probe_runtime_smoke

echo "anomalias_detectadas=${ANOMALIES}"
