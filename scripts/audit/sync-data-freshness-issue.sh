#!/usr/bin/env bash
set -euo pipefail

repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY ausente}"
audit_result="${1:?resultado da auditoria ausente}"
run_url="${2:?URL da execução ausente}"
summary_path="${3:-reports/data-freshness/summary.md}"
assignee="${4:-thiago-salvador}"
dry_run="0"
existing_override=""
for argument in "${@:5}"; do
  case "$argument" in
    --dry-run) dry_run="1" ;;
    --existing=*) existing_override="${argument#--existing=}" ;;
    *) printf 'argumento inválido: %s\n' "$argument" >&2; exit 2 ;;
  esac
done
label="alerta-dados"
marker="<!-- data-freshness-alert -->"
title="🚨 PuxaFicha: dados precisam de revisão"

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

{
  printf '%s\n\n' "$marker"
  printf '# 🚨 Auditoria de dados requer ação\n\n'
  printf -- '- Resultado da execução: **%s**\n' "$audit_result"
  printf -- '- Execução: %s\n' "$run_url"
  printf -- '- Atualizado em: %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if [[ -s "$summary_path" ]]; then
    cat "$summary_path"
  else
    printf '## Próxima ação recomendada\n\n'
    printf 'A auditoria falhou antes de produzir o resumo. Inspecione os logs da execução e não altere o catálogo sem evidência oficial completa.\n'
  fi
  printf '\n## Acompanhamento\n\n'
  printf 'Esta issue permanece aberta e atribuída a @%s. Uma execução saudável comenta a recuperação e fecha o incidente automaticamente.\n' "$assignee"
} > "$body_file"

find_existing_issue() {
  if [[ "$dry_run" == "1" ]]; then
    printf '%s' "$existing_override"
    return
  fi
  gh api --paginate "repos/${repo}/issues?state=open&per_page=100" |
    jq -r --arg marker "$marker" \
      '.[] | select((.pull_request | not) and ((.body // "") | contains($marker))) | .number' |
    sed -n '1p'
}

ensure_label() {
  if gh api "repos/${repo}/labels/${label}" >/dev/null 2>&1; then
    return
  fi
  jq -n \
    --arg name "$label" \
    --arg color "B60205" \
    --arg description "Auditoria de atualização exige ação humana" \
    '{name:$name,color:$color,description:$description}' |
    gh api --method POST "repos/${repo}/labels" --input - >/dev/null
}

existing="$(find_existing_issue)"

if [[ "$audit_result" == "success" ]]; then
  if [[ -z "$existing" ]]; then
    printf 'Nenhum incidente de atualização aberto.\n'
    exit 0
  fi
  if [[ "$dry_run" == "1" ]]; then
    printf 'ação: comentar recuperação e fechar issue #%s\n' "$existing"
    exit 0
  fi
  jq -n --arg body "✅ A auditoria voltou ao estado saudável. Execução: ${run_url}" '{body:$body}' |
    gh api --method POST "repos/${repo}/issues/${existing}/comments" --input - >/dev/null
  jq -n --arg state "closed" '{state:$state}' |
    gh api --method PATCH "repos/${repo}/issues/${existing}" --input - >/dev/null
  printf 'Incidente #%s fechado após auditoria saudável.\n' "$existing"
  exit 0
fi

if [[ "$dry_run" == "1" ]]; then
  if [[ -n "$existing" ]]; then
    printf 'ação: atualizar issue #%s e comentar nova ocorrência\n' "$existing"
  else
    printf 'ação: criar issue atribuída a %s com label %s\n' "$assignee" "$label"
  fi
  printf 'título: %s\n' "$title"
  cat "$body_file"
  exit 0
fi

ensure_label
if [[ -n "$existing" ]]; then
  jq -n \
    --arg title "$title" \
    --rawfile body "$body_file" \
    --arg assignee "$assignee" \
    --arg label "$label" \
    '{title:$title,body:$body,assignees:[$assignee],labels:[$label]}' |
    gh api --method PATCH "repos/${repo}/issues/${existing}" --input - >/dev/null
  jq -n --arg body "🚨 Nova ocorrência detectada. Evidências e recomendações atualizadas: ${run_url}" '{body:$body}' |
    gh api --method POST "repos/${repo}/issues/${existing}/comments" --input - >/dev/null
  printf 'Incidente #%s atualizado e notificado.\n' "$existing"
else
  jq -n \
    --arg title "$title" \
    --rawfile body "$body_file" \
    --arg assignee "$assignee" \
    --arg label "$label" \
    '{title:$title,body:$body,assignees:[$assignee],labels:[$label]}' |
    gh api --method POST "repos/${repo}/issues" --input - >/dev/null
  printf 'Novo incidente de atualização criado e atribuído.\n'
fi
