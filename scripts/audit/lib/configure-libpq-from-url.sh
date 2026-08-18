#!/usr/bin/env bash

# Converte a URI validada de producao em variaveis libpq. O psql nao interpreta
# uma URI recebida por PGDATABASE: nesse caso ele trata o valor como nome do
# banco e tenta o socket local. A senha permanece no ambiente do processo e
# nunca entra no argv.
pf_configure_libpq_from_url() {
  local -a partes=()
  local parte

  while IFS= read -r -d '' parte; do
    partes[${#partes[@]}]="$parte"
  done < <(
    node <<'NODE'
const raw = process.env.PF_DATABASE_URL ?? ""
let url
try { url = new URL(raw) } catch { process.exit(2) }

const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.test(url.hostname)
const pooler = /(?:^|\.)pooler\.supabase\.com$/.test(url.hostname)
const portaValida = direct
  ? url.port === "5432"
  : pooler && ["5432", "6543"].includes(url.port)

let usuario
let senha
try {
  usuario = decodeURIComponent(url.username)
  senha = decodeURIComponent(url.password)
} catch {
  process.exit(2)
}

if (
  !/^(?:postgres|postgresql):$/.test(url.protocol) ||
  url.search || url.hash || url.pathname !== "/postgres" ||
  !portaValida || !usuario || !senha
) process.exit(2)

for (const valor of [url.hostname, url.port, usuario, senha, "postgres"]) {
  process.stdout.write(valor)
  process.stdout.write("\0")
}
NODE
  )

  if [[ "${#partes[@]}" -ne 5 ]]; then
    echo "FAIL: nao foi possivel decompor PF_DATABASE_URL para o libpq" >&2
    return 1
  fi

  export PGHOST="${partes[0]}"
  export PGPORT="${partes[1]}"
  export PGUSER="${partes[2]}"
  export PGPASSWORD="${partes[3]}"
  export PGDATABASE="${partes[4]}"
}
