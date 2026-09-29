#!/usr/bin/env bash
# Instala o agente launchd da coleta semanal de checagens. Passo MANUAL do
# mantenedor. Só copia arquivos para o próprio usuário:
#   - o script para ~/Library/Application Support/puxa-ficha/
#   - o plist para ~/Library/LaunchAgents/
# Não carrega o agente, não pede sudo e recusa rodar como root. Carregar é o
# último passo do runbook: docs/operations/checagens-local.md
#
# Uso, a partir de um checkout cujo HEAD é a main atual, sem alteração em
# scripts/checagens-local/ (o instalador busca a main e recusa qualquer outra coisa):
#   bash scripts/checagens-local/instalar-agente.sh
set -euo pipefail
umask 077

falhar() { echo "ERRO: $*" >&2; exit 1; }

# `sudo` sem -u vira uid 0 e cai aqui; o instalador nunca pede privilégio.
[ "$(id -u)" -ne 0 ] || falhar "não rode como root nem com sudo"
[ "$(uname -s)" = "Darwin" ] || falhar "este agente é para macOS"

origem="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rotulo="br.com.puxaficha.checagens-local"
repo_url="https://github.com/thiago-salvador/puxa-ficha.git"
# O clone principal, e não o worktree de onde o instalador rodou: o agente
# precisa de um caminho que continue existindo.
repo="$(dirname "$(git -C "$origem" rev-parse --path-format=absolute --git-common-dir)")"
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || falhar "clone não encontrado a partir de $origem"

# Só instala o que está na main publicada: HEAD igual à main recém-buscada
# (conferida com ls-remote) e scripts/checagens-local/ limpo e idêntico a ela.
git -C "$repo" fetch --quiet --no-tags "$repo_url" "+refs/heads/main:refs/remotes/origin/main"
sha_main="$(git -C "$repo" rev-parse --verify "refs/remotes/origin/main^{commit}")"
[ "$(git ls-remote "$repo_url" refs/heads/main | cut -f1)" = "$sha_main" ] || falhar "main buscada difere do ls-remote"
head_origem="$(git -C "$origem" rev-parse HEAD)"
[ "$head_origem" = "$sha_main" ] || falhar "HEAD deste checkout ($head_origem) não é a main atual ($sha_main); atualize e rode de novo"
[ -z "$(git -C "$origem" status --porcelain --untracked-files=all -- .)" ] || falhar "scripts/checagens-local/ tem alteração local; limpe antes de instalar"
for arquivo in coletar-local.sh "$rotulo.plist.template"; do
  cmp -s "$origem/$arquivo" <(git -C "$repo" show "$sha_main:scripts/checagens-local/$arquivo") ||
    falhar "$arquivo difere da main $sha_main"
done

dir_app="$HOME/Library/Application Support/puxa-ficha"
dir_agentes="$HOME/Library/LaunchAgents"
dir_log="$HOME/Library/Logs/puxa-ficha"
script_destino="$dir_app/checagens-coletar-local.sh"
plist_destino="$dir_agentes/$rotulo.plist"
log_launchd="$dir_log/launchd-checagens-local.log"

for caminho in "$repo" "$script_destino" "$log_launchd"; do
  case "$caminho" in *"&"* | *"<"* | *">"*) falhar "caminho com caractere que quebra o XML do plist: $caminho" ;; esac
done

# Segunda 15:00 UTC no fuso desta máquina: 3 h depois do plano de resultados do
# TSE (12:00 UTC), para a rodada pós-turno já pegar o corte da coorte. 28/09/2026
# é uma segunda; em fuso com horário de verão a hora local muda, e reinstalar corrige.
instante="$(date -j -u -f "%Y-%m-%d %H:%M:%S" "2026-09-28 15:00:00" +%s)"
read -r dia hora minuto <<<"$(date -r "$instante" "+%w %H %M")"
hora=$((10#$hora))
minuto=$((10#$minuto))

mkdir -p "$dir_app" "$dir_agentes" "$dir_log"
install -m 700 "$origem/coletar-local.sh" "$script_destino"

modelo="$(cat "$origem/$rotulo.plist.template")"
modelo="${modelo//__SCRIPT__/$script_destino}"
modelo="${modelo//__REPO__/$repo}"
modelo="${modelo//__WEEKDAY__/$dia}"
modelo="${modelo//__HOUR__/$hora}"
modelo="${modelo//__MINUTE__/$minuto}"
modelo="${modelo//__LOG__/$log_launchd}"
case "$modelo" in *__SCRIPT__* | *__REPO__* | *__WEEKDAY__* | *__HOUR__* | *__MINUTE__* | *__LOG__*) falhar "marcador sem substituir no plist" ;; esac
printf '%s\n' "$modelo" >"$plist_destino.tmp"
chmod 644 "$plist_destino.tmp"
plutil -lint "$plist_destino.tmp" >/dev/null || falhar "plist inválido"
mv "$plist_destino.tmp" "$plist_destino"

cat <<EOF
Copiado da main $sha_main:
  script: $script_destino
  plist:  $plist_destino (dia $dia, $hora:$(printf '%02d' "$minuto") no fuso local)
  clone:  $repo

O agente NÃO foi carregado. Próximos passos (docs/operations/checagens-local.md):
  1. Criar ~/.config/puxa-ficha/checagens-local.env com chmod 600.
  2. Verificar sem escrever no banco:
       bash "$script_destino" "$repo" --verificar
  3. Carregar:
       launchctl bootstrap gui/\$(id -u) "$plist_destino"
EOF
