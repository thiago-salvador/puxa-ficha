#!/usr/bin/env bash
# Instala o agente launchd da coleta judicial por candidato. Passo MANUAL do
# mantenedor. Só copia arquivos para o próprio usuário:
#   - o script para ~/Library/Application Support/puxa-ficha/
#   - o plist para ~/Library/LaunchAgents/
# Não carrega o agente, não pede sudo e recusa rodar como root. Carregar é o
# último passo do runbook: docs/operations/processos-local.md
#
# Uso, a partir de um checkout cujo HEAD é a main atual, sem alteração em
# scripts/processos-local/ (o instalador busca a main e recusa qualquer outra coisa):
#   bash scripts/processos-local/instalar-agente.sh
set -euo pipefail
umask 077

falhar() { echo "ERRO: $*" >&2; exit 1; }

# `sudo` sem -u vira uid 0 e cai aqui; o instalador nunca pede privilégio.
[ "$(id -u)" -ne 0 ] || falhar "não rode como root nem com sudo"
[ "$(uname -s)" = "Darwin" ] || falhar "este agente é para macOS"

origem="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rotulo="br.com.puxaficha.processos-local"
repo_url="https://github.com/thiago-salvador/puxa-ficha.git"
# O clone principal, e não o worktree de onde o instalador rodou: o agente
# precisa de um caminho que continue existindo.
repo="$(dirname "$(git -C "$origem" rev-parse --path-format=absolute --git-common-dir)")"
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || falhar "clone não encontrado a partir de $origem"

# Só instala o que está na main publicada: HEAD igual à main recém-buscada
# (conferida com ls-remote) e scripts/processos-local/ limpo e idêntico a ela.
git -C "$repo" fetch --quiet --no-tags "$repo_url" "+refs/heads/main:refs/remotes/origin/main"
sha_main="$(git -C "$repo" rev-parse --verify "refs/remotes/origin/main^{commit}")"
[ "$(git ls-remote "$repo_url" refs/heads/main | cut -f1)" = "$sha_main" ] || falhar "main buscada difere do ls-remote"
head_origem="$(git -C "$origem" rev-parse HEAD)"
[ "$head_origem" = "$sha_main" ] || falhar "HEAD deste checkout ($head_origem) não é a main atual ($sha_main); atualize e rode de novo"
[ -z "$(git -C "$origem" status --porcelain --untracked-files=all -- .)" ] || falhar "scripts/processos-local/ tem alteração local; limpe antes de instalar"
for arquivo in coletar-local.sh "$rotulo.plist.template"; do
  cmp -s "$origem/$arquivo" <(git -C "$repo" show "$sha_main:scripts/processos-local/$arquivo") ||
    falhar "$arquivo difere da main $sha_main"
done

dir_app="$HOME/Library/Application Support/puxa-ficha"
dir_agentes="$HOME/Library/LaunchAgents"
dir_log="$HOME/Library/Logs/puxa-ficha"
script_destino="$dir_app/processos-coletar-local.sh"
plist_destino="$dir_agentes/$rotulo.plist"
log_launchd="$dir_log/launchd-processos-local.log"

for caminho in "$repo" "$script_destino" "$log_launchd"; do
  case "$caminho" in *"&"* | *"<"* | *">"*) falhar "caminho com caractere que quebra o XML do plist: $caminho" ;; esac
done

# Segunda e quinta 09:17 UTC (06:17 em Brasília) no fuso desta máquina, o mesmo
# horário do antigo cron "17 9 * * 1,4". 28/09/2026 é segunda e 01/10/2026 é
# quinta; em fuso com horário de verão a hora local muda, e reinstalar corrige.
horario_local() {
  local instante
  instante="$(date -j -u -f "%Y-%m-%d %H:%M:%S" "$1" +%s)"
  date -r "$instante" "+%w %H %M"
}
read -r dia_a hora_a minuto_a <<<"$(horario_local "2026-09-28 09:17:00")"
read -r dia_b hora_b minuto_b <<<"$(horario_local "2026-10-01 09:17:00")"
hora_a=$((10#$hora_a)); minuto_a=$((10#$minuto_a))
hora_b=$((10#$hora_b)); minuto_b=$((10#$minuto_b))

mkdir -p "$dir_app" "$dir_agentes" "$dir_log"
install -m 700 "$origem/coletar-local.sh" "$script_destino"

modelo="$(cat "$origem/$rotulo.plist.template")"
modelo="${modelo//__SCRIPT__/$script_destino}"
modelo="${modelo//__REPO__/$repo}"
modelo="${modelo//__WEEKDAY_A__/$dia_a}"
modelo="${modelo//__HOUR_A__/$hora_a}"
modelo="${modelo//__MINUTE_A__/$minuto_a}"
modelo="${modelo//__WEEKDAY_B__/$dia_b}"
modelo="${modelo//__HOUR_B__/$hora_b}"
modelo="${modelo//__MINUTE_B__/$minuto_b}"
modelo="${modelo//__LOG__/$log_launchd}"
case "$modelo" in *__SCRIPT__* | *__REPO__* | *__WEEKDAY_* | *__HOUR_* | *__MINUTE_* | *__LOG__*) falhar "marcador sem substituir no plist" ;; esac
printf '%s\n' "$modelo" >"$plist_destino.tmp"
chmod 644 "$plist_destino.tmp"
plutil -lint "$plist_destino.tmp" >/dev/null || falhar "plist inválido"
mv "$plist_destino.tmp" "$plist_destino"

cat <<EOF
Copiado da main $sha_main:
  script: $script_destino
  plist:  $plist_destino
          dia $dia_a às $hora_a:$(printf '%02d' "$minuto_a") e dia $dia_b às $hora_b:$(printf '%02d' "$minuto_b") no fuso local
  clone:  $repo

O agente NÃO foi carregado. Próximos passos (docs/operations/processos-local.md):
  1. Criar ~/.config/puxa-ficha/processos-local.env com chmod 600.
  2. Verificar sem credenciais e sem escrever no banco:
       bash "$script_destino" "$repo" --verificar
  3. Carregar:
       launchctl bootstrap gui/\$(id -u) "$plist_destino"
EOF
