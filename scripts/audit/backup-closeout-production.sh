#!/usr/bin/env bash
# Invocado somente pelo driver após guardas de SHA, main, projeto e TLS.
# O dump contém dados privados: só a cópia cifrada sai do runner.
set -euo pipefail
case $- in *x*) set +x ;; esac
umask 077
: "${BACKUP_ENCRYPTION_KEY:?chave de backup obrigatoria}"
: "${PF_EXPECTED_SHA:?SHA obrigatorio}"
[[ "$PF_EXPECTED_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ "${PGSSLMODE:-}" == verify-full && -f "${PGSSLROOTCERT:-}" ]] || exit 2
[[ "${PGDATABASE:-}" == postgres ]] || exit 2
if [[ "${PGHOST:-}" == db.wskpzsobvqwhnbsdsmok.supabase.co ]]; then
  [[ "${PGPORT:-}" == 5432 ]] || exit 2
else
  [[ "${PGHOST:-}" =~ (^|\.)pooler\.supabase\.com$ && "${PGUSER:-}" == postgres.wskpzsobvqwhnbsdsmok && "${PGPORT:-}" =~ ^(5432|6543)$ ]] || exit 2
fi
output_dir="${1:?diretorio de saida obrigatorio}"
[[ "$output_dir" == /* && ! -e "$output_dir" ]] || { echo 'FAIL: backup requer diretorio absoluto novo' >&2; exit 2; }
mkdir -m 700 "$output_dir"
private_dir="$(mktemp -d)"
cleanup() {
  rm -f "$private_dir/backup.dump" "$private_dir/restored.dump" "$private_dir/entries.txt"
  rmdir "$private_dir"
}
trap cleanup EXIT
# O snapshot é somente leitura, consistente e inclui somente as três tabelas
# necessárias à recuperação deste pacote. Nenhum subscriber é exportado.
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000' \
  pg_dump --format=custom --no-owner --no-privileges \
  --table=public.candidatos --table=public.chapas_2026 \
  --table=supabase_migrations.schema_migrations --file="$private_dir/backup.dump"
pg_restore --list "$private_dir/backup.dump" > "$private_dir/entries.txt"
for table in 'public candidatos' 'public chapas_2026' 'supabase_migrations schema_migrations'; do
  if ! grep -F "TABLE DATA $table " "$private_dir/entries.txt" >/dev/null; then
    echo 'FAIL: backup incompleto' >&2
    exit 1
  fi
done
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$private_dir/backup.dump" -out "$output_dir/closeout.dump.enc"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$output_dir/closeout.dump.enc" -out "$private_dir/restored.dump"
cmp "$private_dir/backup.dump" "$private_dir/restored.dump"
pg_restore --list "$private_dir/restored.dump" >/dev/null
(
  cd "$output_dir"
  shasum -a 256 closeout.dump.enc > closeout.dump.enc.sha256
  shasum -a 256 -c closeout.dump.enc.sha256
)
echo "PASS: backup cifrado validado para SHA=$PF_EXPECTED_SHA; restauracao logica completa nao executada"
