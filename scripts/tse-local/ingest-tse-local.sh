#!/usr/bin/env bash
# Coleta local do TSE a partir da main publicada, sob demanda ou via launchd.
# Uso: ingest-tse-local.sh <clone> [--verificar]
set -euo pipefail
umask 077

falhar() { echo "ERRO: $*" >&2; exit 1; }
avisar() { echo "AVISO: $*" >&2; }
[ "$(id -u)" -ne 0 ] || falhar "não rode como root"
repo="${1:-}"
modo_verificacao="${2:-}"
[ -n "$repo" ] || falhar "uso: ingest-tse-local.sh <caminho do clone> [--verificar]"
[ -z "$modo_verificacao" ] || [ "$modo_verificacao" = "--verificar" ] || falhar "opção desconhecida: $modo_verificacao"

repo_url="https://github.com/thiago-salvador/puxa-ficha.git"
caminho_launcher="scripts/tse-local/ingest-tse-local.sh"
credenciais="$HOME/.config/puxa-ficha/ingest-tse.env"
dir_log="$HOME/Library/Logs/puxa-ficha"
dir_estado="$HOME/Library/Application Support/puxa-ficha"
node_bin="/opt/homebrew/opt/node@24/bin"
carimbo="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dir_log" "$dir_estado"
chmod 700 "$dir_log" "$dir_estado"
log="$dir_log/ingest-tse-$carimbo.log"
echo "Log: $log"
exec >>"$log" 2>&1
echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) inicio pid=$$"

trava="$dir_log/.ingest-tse.lock"
if ! mkdir "$trava" 2>/dev/null; then
  pid_anterior="$(cat "$trava/pid" 2>/dev/null || true)"
  if [[ "$pid_anterior" =~ ^[0-9]+$ ]] && kill -0 "$pid_anterior" 2>/dev/null; then falhar "outra rodada em curso (pid $pid_anterior)"; fi
  avisar "trava órfã (pid '${pid_anterior:-?}' não está vivo); retomando"
  rm -rf "$trava"
  mkdir "$trava" || falhar "não consegui retomar a trava $trava"
fi
echo "$$" >"$trava/pid"
base=""
limpar() {
  local rc=$?
  if [ -n "$base" ]; then
    git -C "$repo" worktree remove --force "$base/repo" >/dev/null 2>&1 || true
    rm -rf "$base"
    git -C "$repo" worktree prune >/dev/null 2>&1 || true
  fi
  if [ "$(cat "$trava/pid" 2>/dev/null || true)" = "$$" ]; then rm -rf "$trava"; fi
  echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) fim rc=$rc"
}
trap limpar EXIT

export PATH="$node_bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
versao_node="$(node -v 2>/dev/null || true)"
case "$versao_node" in v24.*) ;; *) falhar "Node 24 esperado em $node_bin, achei '${versao_node:-nenhum}'" ;; esac
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || falhar "não é um clone git: $repo"
git -C "$repo" fetch --quiet --no-tags "$repo_url" "+refs/heads/main:refs/remotes/origin/main"
sha="$(git -C "$repo" rev-parse --verify "refs/remotes/origin/main^{commit}")"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || falhar "SHA inválido para a main: $sha"
remoto="$(git -C "$repo" ls-remote "$repo_url" refs/heads/main | cut -f1)"
[ "$remoto" = "$sha" ] || falhar "SHA buscado ($sha) difere do ls-remote ($remoto)"
echo "main fixada em $sha (conferida com ls-remote)"

arquivo_sha="$dir_estado/ingest-tse-ultimo-sha-main"
sha_anterior="$(cat "$arquivo_sha" 2>/dev/null || true)"
if [[ "$sha_anterior" =~ ^[0-9a-f]{40}$ ]] && [ "$sha_anterior" != "$sha" ] && ! git -C "$repo" merge-base --is-ancestor "$sha_anterior" "$sha" 2>/dev/null; then
  avisar "SHA anterior $sha_anterior não é ancestral de $sha: a main pode ter sido reescrita"
fi
echo "$sha" >"$arquivo_sha"
git -C "$repo" cat-file -e "$sha:$caminho_launcher" 2>/dev/null || falhar "a main $sha não contém $caminho_launcher"
cmp -s "$0" <(git -C "$repo" show "$sha:$caminho_launcher") || falhar "este launcher difere de $caminho_launcher na main $sha; reinstale pelo instalador"
echo "launcher confere com a main"

base="$(mktemp -d "${TMPDIR:-/tmp}/pf-tse.XXXXXX")"
git -C "$repo" worktree add --quiet --detach "$base/repo" "$sha"
cd "$base/repo"
[ "$(git rev-parse HEAD)" = "$sha" ] || falhar "worktree fora do SHA fixado"
npm ci --ignore-scripts --no-audit --no-fund --loglevel=error

if [ "$modo_verificacao" = "--verificar" ]; then
  [ -x ./node_modules/.bin/tsx ] || falhar "tsx não instalado"
  echo "VERIFICACAO_OK sha=$sha node=$versao_node"
  exit 0
fi

[ -f "$credenciais" ] || falhar "arquivo de credenciais ausente: $credenciais"
[ ! -L "$credenciais" ] || falhar "arquivo de credenciais não pode ser link simbólico"
[ "$(stat -f %u "$credenciais")" = "$(id -u)" ] || falhar "arquivo de credenciais precisa ser deste usuário"
[ "$(stat -f %Lp "$credenciais")" = "600" ] || falhar "arquivo de credenciais precisa de chmod 600"
url_supabase=""; chave_supabase=""; salt=""; modo_config=""; sha_plano_config=""
sha_arquivo_plano=""; sha_relatorio=""; sha_familia=""; sha_historico=""; sha_coorte=""; sha_projecao=""; sha_identidade=""; arquivo_identidade=""; dir_revisado=""; recibos_pos_turno=""
while IFS= read -r linha || [ -n "$linha" ]; do
  case "$linha" in ""|"#"*) continue ;; esac
  nome="${linha%%=*}"; valor="${linha#*=}"
  case "$nome" in
    SUPABASE_URL) url_supabase="$valor" ;;
    SUPABASE_SERVICE_ROLE_KEY) chave_supabase="$valor" ;;
    PF_DOADOR_CPF_HASH_SALT) salt="$valor" ;;
    TSE_LOCAL_MODE) modo_config="$valor" ;;
    TSE_LOCAL_EXPECTED_PLAN_SHA) sha_plano_config="$valor" ;;
    TSE_LOCAL_EXPECTED_PLAN_FILE_SHA) sha_arquivo_plano="$valor" ;;
    TSE_LOCAL_EXPECTED_REPORT_SHA) sha_relatorio="$valor" ;;
    TSE_LOCAL_EXPECTED_FAMILY_SHA) sha_familia="$valor" ;;
    TSE_LOCAL_EXPECTED_HISTORY_SHA) sha_historico="$valor" ;;
    TSE_LOCAL_EXPECTED_COHORT_SHA) sha_coorte="$valor" ;;
    TSE_LOCAL_EXPECTED_PROJECTION_SHA) sha_projecao="$valor" ;;
    TSE_LOCAL_IDENTITY_REVIEWED) arquivo_identidade="$valor" ;;
    TSE_LOCAL_EXPECTED_IDENTITY_SHA) sha_identidade="$valor" ;;
    TSE_LOCAL_REVIEWED_RUN_DIR) dir_revisado="$valor" ;;
    TSE_LOCAL_RECIBOS) recibos_pos_turno="$valor" ;;
    *) falhar "chave não permitida no arquivo de credenciais: $nome" ;;
  esac
done <"$credenciais"
[ -n "$url_supabase" ] && [ -n "$chave_supabase" ] && [ -n "$salt" ] ||
  falhar "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e PF_DOADOR_CPF_HASH_SALT são obrigatórias"
local_mode="${TSE_LOCAL_MODE:-${modo_config:-dry-run}}"
case "$local_mode" in dry-run|live) ;; *) falhar "TSE_LOCAL_MODE aceita somente dry-run ou live" ;; esac
expected_plan_sha="${TSE_LOCAL_EXPECTED_PLAN_SHA:-$sha_plano_config}"
if [ -n "$expected_plan_sha" ] && [[ ! "$expected_plan_sha" =~ ^[a-fA-F0-9]{64}$ ]]; then
  falhar "TSE_LOCAL_EXPECTED_PLAN_SHA precisa ser um SHA-256 hexadecimal de 64 caracteres"
fi
[ -n "$recibos_pos_turno" ] && [ -f "$recibos_pos_turno" ] || falhar "TSE_LOCAL_RECIBOS precisa apontar ao snapshot pós-turno"
for hash in "$sha_arquivo_plano" "$sha_relatorio" "$sha_familia" "$sha_historico" "$sha_coorte" "$sha_projecao" "$sha_identidade"; do
  if [ -n "$hash" ] && [[ ! "$hash" =~ ^[a-fA-F0-9]{64}$ ]]; then falhar "SHA-256 revisado inválido"; fi
done
expected_plan_sha_lower="$(printf '%s' "$expected_plan_sha" | tr 'A-F' 'a-f')"
if [ "$local_mode" = "live" ] && [ -n "$expected_plan_sha" ] && [ -f "$dir_estado/tse-local/consumed-plans/$expected_plan_sha_lower.json" ]; then
  avisar "plano revisado já consumido; próxima rodada em dry-run até configurar novo SHA"
  local_mode="dry-run"
fi
echo "modo TSE=$local_mode"

(
export SUPABASE_URL="$url_supabase"
export SUPABASE_SERVICE_ROLE_KEY="$chave_supabase"
export PF_DOADOR_CPF_HASH_SALT="$salt"
export PF_KEEP_TSE_DOWNLOADS=1
export TSE_LOCAL_IDENTITY_REVIEWED="$arquivo_identidade"
export TSE_LOCAL_EXPECTED_IDENTITY_SHA="$sha_identidade"
if [ -n "$arquivo_identidade" ]; then [ -f "$arquivo_identidade" ] || falhar "arquivo de identidade revisada ausente"; fi
if [ "$local_mode" = "live" ] && { [ -n "$arquivo_identidade" ] || [ -n "$sha_identidade" ]; }; then
  [ -n "$arquivo_identidade" ] && [ -n "$sha_identidade" ] || falhar "live exige arquivo e SHA da identidade revisada juntos"
fi
if [ "$local_mode" = "live" ]; then
  [ -n "$expected_plan_sha" ] || falhar "TSE_LOCAL_EXPECTED_PLAN_SHA é obrigatório no modo live"
  [ -n "$sha_arquivo_plano" ] && [ -n "$sha_relatorio" ] && [ -n "$sha_familia" ] && [ -n "$sha_historico" ] && [ -n "$sha_coorte" ] && [ -n "$sha_projecao" ] && [ -d "$dir_revisado" ] ||
    falhar "live exige diretório revisado e SHAs do relatório, plano, coorte, projeção e recibos"
  npm run ingest:tse:local -- --live "--recibos=$recibos_pos_turno" \
    "--reviewed-run-dir=$dir_revisado" "--expected-plan-sha=$expected_plan_sha" \
    "--expected-plan-file-sha=$sha_arquivo_plano" "--expected-report-sha=$sha_relatorio" "--expected-family-sha=$sha_familia" \
    "--expected-history-sha=$sha_historico" "--expected-cohort-sha=$sha_coorte" "--expected-projection-sha=$sha_projecao"
else
  npm run ingest:tse:local -- --dry-run "--recibos=$recibos_pos_turno"
fi
)
