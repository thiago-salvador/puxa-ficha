#!/usr/bin/env bash
# Coleta semanal da Câmara fora do GitHub Actions.
#
# Desde 26/09/2026 a API de Dados Abertos da Câmara recusa conexão TCP dos
# runners hospedados do GitHub. Este script roda no Mac do mantenedor, pelo
# agente launchd instalado por scripts/camara-local/instalar-agente.sh.
# Runbook: docs/operations/ingest-camara-local.md
#
# O que ele faz, nesta ordem:
#   1. busca origin/main e fixa o SHA (nunca branch de trabalho nem PR);
#   2. cria um worktree descartável nesse SHA, fora do clone;
#   3. `npm ci --ignore-scripts` (nenhum script de instalação de dependência roda);
#   4. roda `npx tsx scripts/ingest-all.ts camara --skip-camara-validated` com
#      Node 24, com as credenciais lidas de um arquivo fora do repo (chmod 600);
#   5. marca os recibos de `coleta_log` com `local:<host>:<timestamp UTC>`;
#   6. revalida o cache público, se o arquivo trouxer PF_REVALIDATE_SECRET;
#   7. grava o log em ~/Library/Logs/puxa-ficha/ e apaga o worktree.
#
# Uso:
#   ingest-camara-local.sh <caminho do clone>              coleta de verdade
#   ingest-camara-local.sh <caminho do clone> --verificar  tudo menos coleta e
#       revalidação: prova fetch, worktree, npm ci e carga do ingest, sem
#       credencial e sem escrita no banco.
set -euo pipefail
umask 077

falhar() { echo "ERRO: $*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || falhar "não rode como root"

repo="${1:-}"
modo="${2:-coletar}"
[ -n "$repo" ] || falhar "uso: ingest-camara-local.sh <caminho do clone> [--verificar]"
case "$modo" in coletar|--verificar) ;; *) falhar "modo desconhecido: $modo" ;; esac

credenciais="$HOME/.config/puxa-ficha/ingest-camara.env"
dir_log="$HOME/Library/Logs/puxa-ficha"
node_bin="/opt/homebrew/opt/node@24/bin"
revalidate_url="https://puxaficha.com.br/api/revalidate"
# Mesmo conjunto de tags do job `revalidate` de .github/workflows/ingest.yml;
# tests/ingest-camara-local.test.ts reprova divergência.
tags_json='["public-candidatos","public-candidato-metadata","public-candidato-ficha","public-candidatos-resumo","public-candidatos-comparaveis","public-indicadores-all","public-indicadores-estado","quiz-dataset","ranking-data","doador-reverse"]'

carimbo="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dir_log"
log="$dir_log/ingest-camara-$carimbo.log"
echo "Log: $log"
exec >>"$log" 2>&1
echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) inicio modo=$modo"

trava="$dir_log/.ingest-camara.lock"
mkdir "$trava" 2>/dev/null || falhar "outra rodada em curso (trava $trava)"

base=""
# shellcheck disable=SC2329 # chamada pelo trap EXIT abaixo.
limpar() {
  local rc=$?
  if [ -n "$base" ]; then
    git -C "$repo" worktree remove --force "$base/repo" >/dev/null 2>&1 || true
    rm -rf "$base"
    git -C "$repo" worktree prune >/dev/null 2>&1 || true
  fi
  rmdir "$trava" 2>/dev/null || true
  echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) fim rc=$rc"
}
trap limpar EXIT

export PATH="$node_bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
versao_node="$(node -v 2>/dev/null || true)"
case "$versao_node" in v24.*) ;; *) falhar "Node 24 esperado em $node_bin, achei '${versao_node:-nenhum}'" ;; esac

git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || falhar "não é um clone git: $repo"
git -C "$repo" fetch --quiet --no-tags origin "+refs/heads/main:refs/remotes/origin/main"
sha="$(git -C "$repo" rev-parse --verify "refs/remotes/origin/main^{commit}")"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || falhar "SHA inválido para origin/main: $sha"
echo "origin/main fixado em $sha"

base="$(mktemp -d "${TMPDIR:-/tmp}/pf-camara.XXXXXX")"
git -C "$repo" worktree add --quiet --detach "$base/repo" "$sha"
cd "$base/repo"
[ "$(git rev-parse HEAD)" = "$sha" ] || falhar "worktree fora do SHA fixado"

npm ci --ignore-scripts --no-audit --no-fund --loglevel=error

if [ "$modo" = "--verificar" ]; then
  # Carrega o grafo inteiro do ingest pelo tsx (prova que --ignore-scripts
  # basta) e para na validação de fonte, antes de qualquer rede ou banco.
  set +e
  saida="$(env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY npx tsx scripts/ingest-all.ts __verificacao__ 2>&1)"
  set -e
  echo "$saida"
  case "$saida" in
    *"Fonte desconhecida: __verificacao__"*) echo "VERIFICACAO_OK sha=$sha node=$versao_node" ;;
    *) falhar "o ingest não carregou com --ignore-scripts" ;;
  esac
  exit 0
fi

[ -f "$credenciais" ] || falhar "arquivo de credenciais ausente: $credenciais"
[ ! -L "$credenciais" ] || falhar "arquivo de credenciais não pode ser link simbólico"
[ "$(stat -f %u "$credenciais")" = "$(id -u)" ] || falhar "arquivo de credenciais precisa ser deste usuário"
[ "$(stat -f %Lp "$credenciais")" = "600" ] || falhar "arquivo de credenciais precisa de chmod 600"

url_supabase=""
chave_supabase=""
segredo_revalidacao=""
while IFS= read -r linha || [ -n "$linha" ]; do
  case "$linha" in "" | "#"*) continue ;; esac
  nome="${linha%%=*}"
  valor="${linha#*=}"
  case "$nome" in
    SUPABASE_URL) url_supabase="$valor" ;;
    SUPABASE_SERVICE_ROLE_KEY) chave_supabase="$valor" ;;
    PF_REVALIDATE_SECRET) segredo_revalidacao="$valor" ;;
    *) falhar "chave não permitida no arquivo de credenciais: $nome" ;;
  esac
done <"$credenciais"
[ -n "$url_supabase" ] && [ -n "$chave_supabase" ] || falhar "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias"

host="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
host="$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | sed -E 's/^-+//; s/-+$//' | cut -c1-63)"
[ -n "$host" ] || host="mac"
execucao="local:$host:$carimbo"
echo "execucao=$execucao"

set +e
SUPABASE_URL="$url_supabase" \
  SUPABASE_SERVICE_ROLE_KEY="$chave_supabase" \
  PF_COLETA_EXECUCAO="$execucao" \
  npx tsx scripts/ingest-all.ts camara --skip-camara-validated
rc=$?
set -e
echo "ingest camara rc=$rc"

# Como o job `revalidate` do Actions: revalida mesmo com erro parcial, para
# publicar o que chegou ao banco; o rc do ingest continua sendo o do script.
if [ -n "$segredo_revalidacao" ]; then
  cabecalho="$base/revalidate-header"
  printf 'x-pf-revalidate-secret: %s\n' "$segredo_revalidacao" >"$cabecalho"
  status="$(printf '{"tags":%s}' "$tags_json" | curl -sS -o "$base/revalidate.json" -w '%{http_code}' \
    -X POST "$revalidate_url" -H "content-type: application/json" -H "@$cabecalho" --data-binary @- || true)"
  echo "revalidate HTTP $status"
  [ "$status" = "200" ] || [ "$rc" -ne 0 ] || rc=1
else
  echo "revalidate pulado: PF_REVALIDATE_SECRET ausente no arquivo de credenciais"
fi

exit "$rc"
