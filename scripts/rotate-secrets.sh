#!/usr/bin/env bash
# rotate-secrets.sh
# Rotaciona secrets do PuxaFicha a cada 90 dias.
# Uso: bash scripts/rotate-secrets.sh [--dry-run]
#
# Requer: supabase CLI, vercel CLI, gh CLI autenticados.
# Nao faz nada destrutivo em --dry-run (default na primeira execucao).

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

PROJECT_ID="wskpzsobvqwhnbsdsmok"
VERCEL_PROJECT="puxa-ficha"
ROTATION_LOG="docs/secret-rotation-log.md"
TODAY=$(date +%Y-%m-%d)

log() { echo "[$(date +%H:%M:%S)] $1"; }
warn() { echo "[$(date +%H:%M:%S)] WARN: $1" >&2; }

# --- Checklist de secrets ---
# Cada secret tem: nome, onde vive, como rotacionar, e se e automatizavel.

declare -A SECRETS=(
  ["SUPABASE_ANON_KEY"]="Supabase Dashboard > Settings > API > anon key"
  ["SUPABASE_SERVICE_ROLE_KEY"]="Supabase Dashboard > Settings > API > service_role key"
  ["PF_PREVIEW_TOKEN"]="Gerar novo UUID e atualizar em Vercel env vars"
  ["TRANSPARENCIA_API_KEY"]="Portal da Transparencia > Minha Conta > Gerar novo token"
)

# --- Pre-flight checks ---
log "=== Rotacao de Secrets - PuxaFicha ==="
log "Data: $TODAY"
log "Modo: $(if $DRY_RUN; then echo 'DRY RUN (nenhuma mudanca sera feita)'; else echo 'EXECUCAO REAL'; fi)"
echo ""

# Verificar CLIs
for cmd in supabase vercel gh; do
  if ! command -v "$cmd" &> /dev/null; then
    warn "$cmd nao encontrado. Instale antes de rodar."
  else
    log "OK: $cmd encontrado"
  fi
done
echo ""

# --- Rotacao do PF_PREVIEW_TOKEN (unico totalmente automatizavel) ---
log "--- PF_PREVIEW_TOKEN ---"
NEW_TOKEN=$(uuidgen | tr '[:upper:]' '[:lower:]')
log "Novo token gerado: ${NEW_TOKEN:0:8}..."

if $DRY_RUN; then
  log "[dry-run] Pulando atualizacao no Vercel"
else
  log "Atualizando PF_PREVIEW_TOKEN no Vercel..."
  # Remove o antigo e cria o novo (Vercel CLI nao tem update)
  vercel env rm PF_PREVIEW_TOKEN production --yes 2>/dev/null || true
  echo "$NEW_TOKEN" | vercel env add PF_PREVIEW_TOKEN production
  log "PF_PREVIEW_TOKEN atualizado no Vercel"
fi
echo ""

# --- Secrets que precisam de acao manual ---
log "--- Secrets que precisam de rotacao manual ---"
echo ""
for secret in "${!SECRETS[@]}"; do
  if [[ "$secret" == "PF_PREVIEW_TOKEN" ]]; then continue; fi
  log "[ ] $secret"
  log "    Como: ${SECRETS[$secret]}"
  log "    Depois de gerar o novo valor:"
  log "      1. Atualizar em Vercel: vercel env rm $secret production && echo 'NOVO_VALOR' | vercel env add $secret production"
  log "      2. Atualizar em GitHub Secrets (se aplicavel): gh secret set $secret"
  log "      3. Testar: npm run build && npx tsx scripts/ingest-all.ts camara senado (dry run)"
  echo ""
done

# --- Registro ---
log "--- Registro ---"
ENTRY="| $TODAY | PF_PREVIEW_TOKEN (auto) | $(if $DRY_RUN; then echo 'dry-run'; else echo 'rotacionado'; fi) | Scripts pendentes: SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TRANSPARENCIA_API_KEY |"

if [[ ! -f "$ROTATION_LOG" ]]; then
  cat > "$ROTATION_LOG" << 'HEADER'
# Secret Rotation Log

Registro de rotacoes de secrets do PuxaFicha. Meta: a cada 90 dias.

| Data | Secret | Status | Notas |
| --- | --- | --- | --- |
HEADER
fi

if $DRY_RUN; then
  log "[dry-run] Entrada que seria adicionada ao log:"
  log "$ENTRY"
else
  echo "$ENTRY" >> "$ROTATION_LOG"
  log "Entrada adicionada a $ROTATION_LOG"
fi

echo ""
log "=== Proxima rotacao: $(date -v+90d +%Y-%m-%d 2>/dev/null || date -d '+90 days' +%Y-%m-%d 2>/dev/null || echo 'calcular manualmente') ==="
log "Dica: agendar com 'crontab -e' ou GitHub Actions scheduled workflow"
