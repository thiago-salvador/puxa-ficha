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
  local marker="<!-- cron-watchdog-workflow:${workflow_file} -->"
  local title="[cron-failure] ${workflow_name}"
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
- Arquivo: \`.github/workflows/${workflow_file}\`
- Estado: **${status_label}**
${run_line}
- Detectado em: $(date -u +%Y-%m-%dT%H:%M:%SZ)

O watchdog considera a última execução \`schedule\`. Um rerun posterior em verde (dispatch ou push) conta como recuperado.

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

echo "anomalias_detectadas=${ANOMALIES}"
