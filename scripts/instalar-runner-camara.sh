#!/usr/bin/env bash
# Instala o runner auto-hospedado que executa o job `ingest-camara` do
# .github/workflows/ingest.yml. Passo MANUAL do mantenedor, nunca de CI nem de
# agente: registra uma máquina no repositório e instala um serviço launchd.
# Runbook completo: docs/operations/ingest-camara-runner.md
#
# Uso (no Mac que vai rodar o job):
#   bash scripts/instalar-runner-camara.sh            # pré-checagem + instalação
#   bash scripts/instalar-runner-camara.sh --checar   # só a pré-checagem
#
# O token de registro é pedido de forma interativa (não fica no histórico do
# shell). Gere em Settings > Actions > Runners > New self-hosted runner; ele
# expira em 1 hora.
set -euo pipefail

REPO_URL="https://github.com/thiago-salvador/puxa-ficha"
RUNNER_VERSION="2.337.0"
# SHA-256 publicado nas notas da release v2.337.0 do actions/runner (osx-arm64).
RUNNER_SHA256="5a2cd92908a93d7276a194e1de6008099f3e7946f3f8e14aa7a1a7b4a31fdec2"
RUNNER_TARBALL="actions-runner-osx-arm64-${RUNNER_VERSION}.tar.gz"
RUNNER_DIR="$HOME/actions-runner-puxa-ficha"
RUNNER_NAME="puxa-ficha-camara-mac"
RUNNER_LABEL="puxa-ficha-camara"
SONDA_URL="https://dadosabertos.camara.leg.br/api/v2/deputados?itens=1"

falhar() { echo "ERRO: $*" >&2; exit 1; }

checar() {
  [ "$(uname -s)" = "Darwin" ] || falhar "este script é para macOS"
  [ "$(uname -m)" = "arm64" ] || falhar "tarball fixado é osx-arm64; ajuste RUNNER_TARBALL/RUNNER_SHA256 para $(uname -m)"
  command -v curl >/dev/null || falhar "curl ausente"
  command -v shasum >/dev/null || falhar "shasum ausente"
  local status
  status="$(curl -s -o /dev/null --connect-timeout 15 -m 30 -w '%{http_code}' "$SONDA_URL" || true)"
  [ "$status" = "200" ] || falhar "API da Câmara respondeu '$status' desta máquina; o runner não resolveria o bloqueio"
  echo "OK: macOS arm64, API da Câmara responde 200 desta máquina."
}

instalar() {
  if [ -f "$RUNNER_DIR/.runner" ]; then
    falhar "já existe runner configurado em $RUNNER_DIR (remova com ./config.sh remove antes de reinstalar)"
  fi
  mkdir -p "$RUNNER_DIR"
  cd "$RUNNER_DIR"
  if [ ! -f "$RUNNER_TARBALL" ]; then
    curl -fsSL -o "$RUNNER_TARBALL" \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_TARBALL}"
  fi
  echo "${RUNNER_SHA256}  ${RUNNER_TARBALL}" | shasum -a 256 -c - || falhar "SHA-256 do tarball não confere"
  tar xzf "$RUNNER_TARBALL"

  local token
  read -r -s -p "Token de registro (Settings > Actions > Runners > New self-hosted runner): " token
  echo
  [ -n "$token" ] || falhar "token vazio"

  ./config.sh --unattended \
    --url "$REPO_URL" \
    --token "$token" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABEL" \
    --work _work \
    --replace
  unset token

  # svc.sh instala um LaunchAgent do usuário atual: o runner sobe no login.
  ./svc.sh install
  ./svc.sh start
  ./svc.sh status || true

  cat <<EOF

Runner instalado. Falta, no GitHub (Settings > Secrets and variables > Actions
> Variables), criar a variável de repositório:
  PF_INGEST_CAMARA_RUNNER = ["self-hosted","${RUNNER_LABEL}"]
Depois, disparar o ingest.yml com sources=camara e conferir o job
"Câmara dos Deputados" rodando em ${RUNNER_NAME}.
EOF
}

case "${1:-}" in
  --checar) checar ;;
  "") checar; instalar ;;
  *) falhar "argumento desconhecido: $1 (use --checar ou nenhum)" ;;
esac
