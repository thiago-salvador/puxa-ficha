#!/usr/bin/env bash
# Coleta as sete agências no Mac quando o runner hospedado não alcança o UOL.
# Instalação e limites: docs/operations/checagens-local.md.
set -euo pipefail
umask 077

falhar() { echo "ERRO: $*" >&2; exit 1; }
[ "$(id -u)" -ne 0 ] || falhar "não rode como root"
[ "$(uname -s)" = "Darwin" ] || falhar "este agente é para macOS"

repo="${1:-}"
modo="${2:-coletar}"
[ -n "$repo" ] || falhar "uso: coletar-local.sh <clone principal> [--verificar]"
case "$modo" in coletar|--verificar) ;; *) falhar "modo desconhecido: $modo" ;; esac

repo_url="https://github.com/thiago-salvador/puxa-ficha.git"
launcher="scripts/checagens-local/coletar-local.sh"
credenciais="$HOME/.config/puxa-ficha/checagens-local.env"
dir_log="$HOME/Library/Logs/puxa-ficha"
dir_estado="$HOME/Library/Application Support/puxa-ficha"
node_bin="/opt/homebrew/opt/node@24/bin"
carimbo="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dir_log" "$dir_estado"
chmod 700 "$dir_log" "$dir_estado"
log="$dir_log/checagens-local-$carimbo.log"
echo "Log: $log"
exec >>"$log" 2>&1
echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) inicio modo=$modo pid=$$"

trava="$dir_log/.checagens-local.lock"
if ! mkdir "$trava" 2>/dev/null; then
  pid_anterior="$(cat "$trava/pid" 2>/dev/null || true)"
  if [[ "$pid_anterior" =~ ^[0-9]+$ ]] && kill -0 "$pid_anterior" 2>/dev/null; then
    falhar "outra coleta em curso (pid $pid_anterior)"
  fi
  echo "AVISO: retomando trava órfã (pid ${pid_anterior:-?})"
  rm -f "$trava/pid"
  rmdir "$trava" 2>/dev/null || falhar "trava órfã com conteúdo inesperado: $trava"
  mkdir "$trava" || falhar "não consegui retomar a trava"
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
  if [ "$(cat "$trava/pid" 2>/dev/null || true)" = "$$" ]; then
    rm "$trava/pid"
    rmdir "$trava"
  fi
  echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) fim rc=$rc"
}
trap limpar EXIT

export PATH="$node_bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
case "$(node -v 2>/dev/null || true)" in v24.*) ;; *) falhar "Node 24 ausente em $node_bin" ;; esac
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || falhar "clone Git inválido: $repo"
git -C "$repo" fetch --quiet --no-tags "$repo_url" "+refs/heads/main:refs/remotes/origin/main"
sha="$(git -C "$repo" rev-parse --verify 'refs/remotes/origin/main^{commit}')"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || falhar "SHA da main inválido"
[ "$(git ls-remote "$repo_url" refs/heads/main | cut -f1)" = "$sha" ] || falhar "main mudou entre fetch e ls-remote"
echo "main fixada em $sha"
git -C "$repo" cat-file -e "$sha:$launcher" || falhar "launcher ausente na main"
cmp -s "$0" <(git -C "$repo" show "$sha:$launcher") || falhar "launcher instalado difere da main; reinstale"

base="$(mktemp -d "${TMPDIR:-/tmp}/pf-checagens.XXXXXX")"
git -C "$repo" worktree add --quiet --detach "$base/repo" "$sha"
cd "$base/repo"
[ "$(git rev-parse HEAD)" = "$sha" ] || falhar "worktree fora da main fixada"
npm ci --ignore-scripts --no-audit --no-fund --loglevel=error
tsx="./node_modules/.bin/tsx"
[ -x "$tsx" ] || falhar "tsx não instalado"

if [ "$modo" = "--verificar" ]; then
  env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
    node --conditions react-server --import tsx scripts/audit/checagens-rotas-smoke.ts --exigir-todas
  echo "VERIFICACAO_OK sha=$sha node=$(node -v)"
  exit 0
fi

# A rotina agendada termina após o primeiro turno; a importação manual de
# recibos históricos continua disponível pelo CLI do repositório.
if [ "$(date -u +%Y%m%d)" -gt 20261004 ]; then
  echo "Vigência agendada encerrada após 04/10/2026"
  exit 0
fi

[ -f "$credenciais" ] && [ ! -L "$credenciais" ] || falhar "arquivo de credenciais ausente ou simbólico"
[ "$(stat -f %u "$credenciais")" = "$(id -u)" ] || falhar "credenciais precisam pertencer a este usuário"
[ "$(stat -f %Lp "$credenciais")" = "600" ] || falhar "credenciais exigem chmod 600"
url_supabase=""; chave_publica=""; chave_servico=""
while IFS= read -r linha || [ -n "$linha" ]; do
  case "$linha" in ""|"#"*) continue ;; esac
  nome="${linha%%=*}"; valor="${linha#*=}"
  case "$nome" in
    SUPABASE_URL) url_supabase="$valor" ;;
    SUPABASE_ANON_KEY) chave_publica="$valor" ;;
    SUPABASE_SERVICE_ROLE_KEY) chave_servico="$valor" ;;
    *) falhar "chave não permitida nas credenciais: $nome" ;;
  esac
done <"$credenciais"
[ -n "$url_supabase" ] && [ -n "$chave_publica" ] && [ -n "$chave_servico" ] || falhar "faltam credenciais obrigatórias"

run_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
execucao="local:$run_id:$carimbo"
saida="$dir_estado/checagens/$carimbo-${sha:0:12}"
mkdir -p "$saida"
chmod 700 "$dir_estado/checagens" "$saida"
cp scripts/data/checagens-recibos.json "$saida/catalogo.json"
echo "execucao=$execucao artefatos=$saida"

# Primeiro lê todas as fontes, sem escrita remota. Um erro de agência impede
# a etapa de gravação; os recibos e o resumo permanecem para diagnóstico.
SUPABASE_URL="$url_supabase" SUPABASE_ANON_KEY="$chave_publica" \
  PF_COLETA_EXECUCAO="$execucao" "$tsx" scripts/checagens-coletar.ts \
  --out "$saida" --sem-google --concorrencia 3 --pausa-ms 0

node - "$saida/recibos.json" "$saida/resumo.json" <<'JS'
const fs = require('node:fs')
const recibos = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).receipts
const resumo = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
if (!recibos.length || resumo.total !== recibos.length || resumo.erro !== 0 || resumo.pendentes_de_busca !== 0 ||
    recibos.some(r => Object.keys(r.agencias).length !== 7 || Object.values(r.agencias).some(a => a.status !== 'ok'))) {
  throw new Error('coleta incompleta: gravação bloqueada')
}
JS

# Reimporta os recibos já validados; só este passo escreve em coleta_log.
# O catálogo fica como artefato local para revisão e PR, sem publicação automática.
SUPABASE_URL="$url_supabase" SUPABASE_ANON_KEY="$chave_publica" \
  SUPABASE_SERVICE_ROLE_KEY="$chave_servico" PF_COLETA_EXECUCAO="$execucao" \
  "$tsx" scripts/checagens-coletar.ts --de-recibos "$saida/recibos.json" \
  --roster "$saida/roster.json" --catalogo "$saida/catalogo.json" --gravar-log
echo "COLETA_OK sha=$sha artefatos=$saida"
