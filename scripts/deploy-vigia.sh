#!/usr/bin/env bash
# Vigia do deploy de produção.
#
# Motivo (28/09/2026): no merge 63b73ec9 o GitHub não entregou o evento de push
# (nenhum workflow `on: push` rodou) e a Vercel não recebeu o webhook (nenhum
# deploy). A produção ficou parada no deploy anterior sem nenhum alarme.
#
# A cada rodada, para o topo atual de `main`, depois de uma carência:
#   1. sem deploy de produção da Vercel para o SHA: cria um, a partir do git;
#   2. sem run de production-deployment-check para o SHA: dispara um.
# Cada passo só age quando o artefato não existe, então rodar de novo não
# duplica nada. Não promove, não faz rollback e não mexe em alias: a promoção
# continua sendo decidida pelo smoke do production-deployment-check.
set -euo pipefail
case $- in *x*) set +x ;; esac

: "${GH_REPO:?GH_REPO e obrigatoria}"
: "${VERCEL_TOKEN:?VERCEL_TOKEN e obrigatoria}"
: "${VERCEL_TEAM_ID:?VERCEL_TEAM_ID e obrigatoria}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID e obrigatoria}"

CARENCIA_S="${VIGIA_CARENCIA_S:-300}"
AGORA="${VIGIA_AGORA:-$(date -u +%s)}"
CHECK_WORKFLOW="production-deployment-check.yml"

api() {
  curl -fsS --connect-timeout 10 --max-time 30 --retry 3 --retry-delay 5 \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" "$@"
}

sha="$(gh api "repos/${GH_REPO}/commits/main" --jq '.sha')"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "FAIL: SHA de main invalido" >&2; exit 1; }
quando="$(gh api "repos/${GH_REPO}/commits/${sha}" --jq '.commit.committer.date')"
idade=$(( AGORA - $(date -u -d "$quando" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$quando" +%s) ))
if (( idade < CARENCIA_S )); then
  echo "vigia: main ${sha:0:8} tem ${idade}s; dentro da carencia de ${CARENCIA_S}s, nada a fazer"
  exit 0
fi

org="${GH_REPO%%/*}"
repo="${GH_REPO##*/}"
acoes=0

deploys="$(api "https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}&target=production&meta-githubCommitSha=${sha}&limit=5")"
n_deploys="$(jq '.deployments | length' <<<"$deploys")"
if [[ "$n_deploys" == "0" ]]; then
  corpo="$(jq -cn --arg name "$repo" --arg org "$org" --arg repo "$repo" --arg sha "$sha" \
    '{name: $name, project: $name, target: "production", gitSource: {type: "github", org: $org, repo: $repo, ref: "main", sha: $sha}}')"
  novo="$(api -X POST -H "Content-Type: application/json" --data "$corpo" \
    "https://api.vercel.com/v13/deployments?teamId=${VERCEL_TEAM_ID}")"
  echo "vigia: deploy de producao ausente para ${sha:0:8}; criado $(jq -r '.id' <<<"$novo")"
  acoes=$((acoes + 1))
else
  echo "vigia: deploy de producao de ${sha:0:8} existe (${n_deploys})"
fi

n_checks="$(gh run list --workflow "$CHECK_WORKFLOW" --commit "$sha" --limit 5 --json databaseId --jq 'length')"
if [[ "$n_checks" == "0" ]]; then
  gh workflow run "$CHECK_WORKFLOW" --ref main -f "sha=${sha}"
  echo "vigia: ${CHECK_WORKFLOW} ausente para ${sha:0:8}; disparado"
  acoes=$((acoes + 1))
else
  echo "vigia: ${CHECK_WORKFLOW} de ${sha:0:8} existe (${n_checks})"
fi

echo "vigia: ${acoes} acao(oes) para ${sha:0:8}"
