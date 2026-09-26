#!/usr/bin/env bash
# Instala o agente launchd da coleta semanal da Câmara. Passo MANUAL do
# mantenedor. Só copia arquivos para o próprio usuário:
#   - o script para ~/Library/Application Support/puxa-ficha/
#   - o plist para ~/Library/LaunchAgents/
# Não carrega o agente, não pede sudo e recusa rodar como root. Carregar é o
# último passo do runbook: docs/operations/ingest-camara-local.md
#
# Uso, a partir de qualquer checkout do repositório:
#   bash scripts/camara-local/instalar-agente.sh
set -euo pipefail
umask 077

falhar() { echo "ERRO: $*" >&2; exit 1; }

# `sudo` sem -u vira uid 0 e cai aqui; o instalador nunca pede privilégio.
[ "$(id -u)" -ne 0 ] || falhar "não rode como root nem com sudo"
[ "$(uname -s)" = "Darwin" ] || falhar "este agente é para macOS"

origem="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rotulo="br.com.puxaficha.ingest-camara"
# O clone principal, e não o worktree de onde o instalador rodou: o agente
# precisa de um caminho que continue existindo.
repo="$(dirname "$(git -C "$origem" rev-parse --path-format=absolute --git-common-dir)")"
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || falhar "clone não encontrado a partir de $origem"

dir_app="$HOME/Library/Application Support/puxa-ficha"
dir_agentes="$HOME/Library/LaunchAgents"
dir_log="$HOME/Library/Logs/puxa-ficha"
script_destino="$dir_app/ingest-camara-local.sh"
plist_destino="$dir_agentes/$rotulo.plist"
log_launchd="$dir_log/launchd-ingest-camara.log"

for caminho in "$repo" "$script_destino" "$log_launchd"; do
  case "$caminho" in *"&"* | *"<"* | *">"*) falhar "caminho com caractere que quebra o XML do plist: $caminho" ;; esac
done

# Quarta 06:00 UTC no fuso desta máquina. 30/09/2026 é uma quarta; em fuso com
# horário de verão a hora local muda duas vezes por ano, e reinstalar corrige.
instante="$(date -j -u -f "%Y-%m-%d %H:%M:%S" "2026-09-30 06:00:00" +%s)"
read -r dia hora minuto <<<"$(date -r "$instante" "+%w %H %M")"
hora=$((10#$hora))
minuto=$((10#$minuto))

mkdir -p "$dir_app" "$dir_agentes" "$dir_log"
install -m 700 "$origem/ingest-camara-local.sh" "$script_destino"

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
Copiado:
  script: $script_destino
  plist:  $plist_destino (dia $dia, $hora:$(printf '%02d' "$minuto") no fuso local)
  clone:  $repo

O agente NÃO foi carregado. Próximos passos (docs/operations/ingest-camara-local.md):
  1. Criar ~/.config/puxa-ficha/ingest-camara.env com chmod 600.
  2. Verificar sem escrever no banco:
       bash "$script_destino" "$repo" --verificar
  3. Carregar:
       launchctl bootstrap gui/\$(id -u) "$plist_destino"
EOF
