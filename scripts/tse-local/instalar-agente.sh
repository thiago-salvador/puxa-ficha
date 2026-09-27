#!/usr/bin/env bash
# Instala a cópia local do launcher e o plist. Não carrega o serviço launchd.
set -euo pipefail
umask 077
falhar() { echo "ERRO: $*" >&2; exit 1; }
[ "$(id -u)" -ne 0 ] || falhar "não rode como root nem com sudo"
[ "$(uname -s)" = "Darwin" ] || falhar "este agente é para macOS"

origem="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rotulo="br.com.puxaficha.ingest-tse"
repo_url="https://github.com/thiago-salvador/puxa-ficha.git"
repo="$(dirname "$(git -C "$origem" rev-parse --path-format=absolute --git-common-dir)")"
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || falhar "clone não encontrado a partir de $origem"
git -C "$repo" fetch --quiet --no-tags "$repo_url" "+refs/heads/main:refs/remotes/origin/main"
sha_main="$(git -C "$repo" rev-parse --verify "refs/remotes/origin/main^{commit}")"
[ "$(git -C "$repo" ls-remote "$repo_url" refs/heads/main | cut -f1)" = "$sha_main" ] || falhar "main buscada difere do ls-remote"
[ "$(git -C "$origem" rev-parse HEAD)" = "$sha_main" ] || falhar "HEAD deste checkout não é a main atual; atualize e rode de novo"
[ -z "$(git -C "$origem" status --porcelain --untracked-files=all -- .)" ] || falhar "scripts/tse-local/ tem alterações locais; limpe antes de instalar"
for arquivo in ingest-tse-local.sh "$rotulo.plist.template"; do
  cmp -s "$origem/$arquivo" <(git -C "$repo" show "$sha_main:scripts/tse-local/$arquivo") || falhar "$arquivo difere da main $sha_main"
done

dir_app="$HOME/Library/Application Support/puxa-ficha"
dir_agentes="$HOME/Library/LaunchAgents"
dir_log="$HOME/Library/Logs/puxa-ficha"
dir_config="$HOME/.config/puxa-ficha"
script_destino="$dir_app/ingest-tse-local.sh"
plist_destino="$dir_agentes/$rotulo.plist"
log_launchd="$dir_log/launchd-ingest-tse.log"
credenciais="$dir_config/ingest-tse.env"
for caminho in "$repo" "$script_destino" "$log_launchd"; do
  case "$caminho" in *"&"*|*"<"*|*">"*) falhar "caminho com caractere inválido para XML plist: $caminho" ;; esac
done

# Quinta-feira às 06:00 no fuso local do Mac.
instante="$(date -j -f "%Y-%m-%d %H:%M:%S" "2026-10-01 06:00:00" +%s)"
read -r dia hora minuto <<<"$(date -r "$instante" "+%w %H %M")"
hora=$((10#$hora)); minuto=$((10#$minuto))
mkdir -p "$dir_app" "$dir_agentes" "$dir_log" "$dir_config"
chmod 700 "$dir_app" "$dir_log" "$dir_config"
install -m 700 "$origem/ingest-tse-local.sh" "$script_destino"
if [ -L "$credenciais" ]; then falhar "arquivo de credenciais não pode ser link simbólico"; fi
touch "$credenciais"
chmod 600 "$credenciais"

modelo="$(cat "$origem/$rotulo.plist.template")"
modelo="${modelo//__SCRIPT__/$script_destino}"
modelo="${modelo//__REPO__/$repo}"
modelo="${modelo//__WEEKDAY__/$dia}"
modelo="${modelo//__HOUR__/$hora}"
modelo="${modelo//__MINUTE__/$minuto}"
modelo="${modelo//__LOG__/$log_launchd}"
case "$modelo" in *__SCRIPT__*|*__REPO__*|*__WEEKDAY__*|*__HOUR__*|*__MINUTE__*|*__LOG__*) falhar "marcador sem substituir no plist" ;; esac
printf '%s\n' "$modelo" >"$plist_destino.tmp"
chmod 644 "$plist_destino.tmp"
plutil -lint "$plist_destino.tmp" >/dev/null || falhar "plist inválido"
mv "$plist_destino.tmp" "$plist_destino"

cat <<EOF
Copiado da main $sha_main:
  script: $script_destino
  plist:  $plist_destino (quinta, $hora:$(printf '%02d' "$minuto") hora local)
  clone:  $repo
  env:    $credenciais (permissão 600; conteúdo não exibido)

O agente NÃO foi carregado. Próximos passos (docs/operations/ingest-tse-local.md):
  1. Preencher o arquivo env com as credenciais documentadas.
  2. Verificar sem executar coleta:
       bash "$script_destino" "$repo" --verificar
  3. Carregar somente após revisar o modo TSE_LOCAL_MODE:
       launchctl bootstrap gui/\$(id -u) "$plist_destino"
EOF
