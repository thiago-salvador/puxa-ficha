#!/usr/bin/env bash
set -euo pipefail

limpar_apt() {
  sudo pkill -9 -x apt-get 2>/dev/null || true
  sudo pkill -9 -x dpkg 2>/dev/null || true
  sudo rm -f /var/lib/apt/lists/lock /var/cache/apt/archives/lock \
             /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend 2>/dev/null || true
  sudo dpkg --configure -a 2>/dev/null || true
}

instalar() {
  # Sem -qq: o ledger-guard de 19/08 ficou 30 min sem uma linha de
  # progresso ate o cancelamento do job.
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates
  sudo install -d /usr/share/postgresql-common/pgdg
  sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
    https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" |
    sudo tee /etc/apt/sources.list.d/pgdg.list
  sudo apt-get update
  sudo apt-get install -y postgresql-client-17
}

export -f instalar

for tentativa in 1 2; do
  # Sem -k, o GNU timeout manda SIGTERM e espera para sempre se o
  # apt-get neto ignorar o sinal. -k 15 manda SIGKILL.
  if timeout -k 15 300 bash -c instalar; then
    echo "/usr/lib/postgresql/17/bin" >> "$GITHUB_PATH"
    exit 0
  fi
  echo "::warning::tentativa $tentativa de instalar postgresql-client-17 falhou ou travou em 5 min"
  limpar_apt
  sleep 10
done

echo "::error::duas tentativas de instalar postgresql-client-17 falharam"
exit 1
