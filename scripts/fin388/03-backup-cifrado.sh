#!/usr/bin/env bash
# Issue #388, passo 3: backup cifrado de financiamento e financiamento_verificacoes
# antes de qualquer escrita. Nenhum segredo e impresso.
set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL ausente}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY ausente}"
# Uso: 03-backup-cifrado.sh <dir privado>
WORK="${1:?informe o diretorio privado de trabalho}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DIR="${WORK}/backup-${STAMP}"
mkdir -p "$DIR"; chmod 700 "$DIR"

dump() {
  local table="$1" out="$2" offset=0 n
  : > "$out"
  while :; do
    curl -sS --fail-with-body \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      "${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1000&offset=${offset}" > "${out}.page"
    n="$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))))' "${out}.page")"
    python3 -c 'import json,sys
rows=json.load(open(sys.argv[1]))
with open(sys.argv[2],"a") as f:
    for r in rows: f.write(json.dumps(r,ensure_ascii=False,sort_keys=True)+"\n")' "${out}.page" "$out"
    rm -f "${out}.page"
    [ "$n" -lt 1000 ] && break
    offset=$((offset + n))
  done
  wc -l < "$out" | tr -d ' '
}

FIN_ROWS="$(dump financiamento "${DIR}/financiamento.jsonl")"
VER_ROWS="$(dump financiamento_verificacoes "${DIR}/financiamento_verificacoes.jsonl")"

# Passphrase aleatoria de fonte criptografica. Fica 0600 ao lado do backup e
# nunca aparece em stdout nem em variavel exportada.
PASS_FILE="${DIR}/backup.passphrase"
python3 -c 'import secrets,sys
open(sys.argv[1],"w").write(secrets.token_urlsafe(48))' "$PASS_FILE"
chmod 600 "$PASS_FILE"

ARCHIVE="${DIR}/financiamento-388-${STAMP}.tar"
tar -cf "$ARCHIVE" -C "$DIR" financiamento.jsonl financiamento_verificacoes.jsonl
PLAIN_SHA="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -in "$ARCHIVE" -out "${ARCHIVE}.enc" -pass "file:${PASS_FILE}"
chmod 600 "${ARCHIVE}.enc"
rm -f "$ARCHIVE" "${DIR}/financiamento.jsonl" "${DIR}/financiamento_verificacoes.jsonl"

# Prova de reversibilidade: decifra para stdout e confere o sha do tar original.
CHECK_SHA="$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "${ARCHIVE}.enc" -pass "file:${PASS_FILE}" | shasum -a 256 | awk '{print $1}')"
[ "$PLAIN_SHA" = "$CHECK_SHA" ] || { echo "ABORT: backup cifrado nao decifra para o conteudo original"; exit 1; }

cat > "${DIR}/manifest.json" <<JSON
{
  "issue": 388,
  "step": "03-backup-cifrado",
  "generated_at": "${STAMP}",
  "tables": {"financiamento": ${FIN_ROWS}, "financiamento_verificacoes": ${VER_ROWS}},
  "archive": "$(basename "${ARCHIVE}.enc")",
  "cipher": "aes-256-cbc pbkdf2 200000 iteracoes",
  "plaintext_tar_sha256": "${PLAIN_SHA}",
  "roundtrip_verified": true,
  "passphrase_file": "backup.passphrase (modo 0600, nunca impresso)"
}
JSON
chmod 600 "${DIR}/manifest.json"
echo "OK backup: financiamento=${FIN_ROWS} linhas, verificacoes=${VER_ROWS} linhas"
echo "arquivo cifrado: ${ARCHIVE}.enc"
echo "roundtrip conferido por sha256 do tar original"
echo "$DIR" > "${WORK}/ultimo-backup.path"
