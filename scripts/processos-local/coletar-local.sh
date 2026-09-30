#!/usr/bin/env bash
# Coleta judicial por candidato no Mac: a API do DJEN responde HTTP 403 ao
# runner hospedado do GitHub (issue #582). Mesma sequência e mesmas travas do
# antigo passo de coleta de processos-coleta-judicial.yml.
# Instalação, renovação e limites: docs/operations/processos-local.md.
# Uso: coletar-local.sh <clone principal> [--verificar|--dry-run]
set -euo pipefail
umask 077

falhar() { echo "ERRO: $*" >&2; exit 1; }
[ "$(id -u)" -ne 0 ] || falhar "não rode como root"
[ "$(uname -s)" = "Darwin" ] || falhar "este agente é para macOS"

repo="${1:-}"
modo="${2:-coletar}"
[ -n "$repo" ] || falhar "uso: coletar-local.sh <clone principal> [--verificar|--dry-run]"
case "$modo" in coletar|--verificar|--dry-run) ;; *) falhar "modo desconhecido: $modo" ;; esac

repo_url="https://github.com/thiago-salvador/puxa-ficha.git"
launcher="scripts/processos-local/coletar-local.sh"
credenciais="$HOME/.config/puxa-ficha/processos-local.env"
dir_log="$HOME/Library/Logs/puxa-ficha"
dir_estado="$HOME/Library/Application Support/puxa-ficha"
node_bin="/opt/homebrew/opt/node@24/bin"
psql_bin="/opt/homebrew/opt/libpq/bin"
# Mesma margem do agendamento no GitHub: renova recibos com 14 - 5 = 9+ dias.
margem_dias=5
carimbo="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dir_log" "$dir_estado"
chmod 700 "$dir_log" "$dir_estado"
log="$dir_log/processos-local-$carimbo.log"
echo "Log: $log"
exec >>"$log" 2>&1
echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) inicio modo=$modo pid=$$"

trava="$dir_log/.processos-local.lock"
if ! mkdir "$trava" 2>/dev/null; then
  pid_anterior="$(cat "$trava/pid" 2>/dev/null || true)"
  if [[ "$pid_anterior" =~ ^[0-9]+$ ]] && kill -0 "$pid_anterior" 2>/dev/null; then
    falhar "outra coleta em curso (pid $pid_anterior)"
  fi
  echo "AVISO: retomando trava órfã (pid ${pid_anterior:-?})"
  rm -f "$trava/pid"
  rmdir "$trava" 2>/dev/null || falhar "trava órfã com conteúdo inesperado: $trava"
  mkdir "$trava" || falhar "não consegui retomar a trava"
fi
echo "$$" >"$trava/pid"

base=""
limpar() {
  local rc=$?
  if [ -n "$base" ]; then
    git -C "$repo" worktree remove --force "$base/repo" >/dev/null 2>&1 || true
    rm -rf "$base"
    git -C "$repo" worktree prune >/dev/null 2>&1 || true
  fi
  if [ "$(cat "$trava/pid" 2>/dev/null || true)" = "$$" ]; then
    rm "$trava/pid"
    rmdir "$trava"
  fi
  echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) fim rc=$rc"
}
trap limpar EXIT

export PATH="$node_bin:$psql_bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
case "$(node -v 2>/dev/null || true)" in v24.*) ;; *) falhar "Node 24 ausente em $node_bin" ;; esac
command -v psql >/dev/null 2>&1 || falhar "psql ausente em $psql_bin (brew install libpq)"
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || falhar "clone Git inválido: $repo"
git -C "$repo" fetch --quiet --no-tags "$repo_url" "+refs/heads/main:refs/remotes/origin/main"
sha="$(git -C "$repo" rev-parse --verify 'refs/remotes/origin/main^{commit}')"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || falhar "SHA da main inválido"
[ "$(git ls-remote "$repo_url" refs/heads/main | cut -f1)" = "$sha" ] || falhar "main mudou entre fetch e ls-remote"
echo "main fixada em $sha"
git -C "$repo" cat-file -e "$sha:$launcher" || falhar "launcher ausente na main"
cmp -s "$0" <(git -C "$repo" show "$sha:$launcher") || falhar "launcher instalado difere da main; reinstale"

base="$(mktemp -d "${TMPDIR:-/tmp}/pf-processos.XXXXXX")"
git -C "$repo" worktree add --quiet --detach "$base/repo" "$sha"
cd "$base/repo"
[ "$(git rev-parse HEAD)" = "$sha" ] || falhar "worktree fora da main fixada"
npm ci --ignore-scripts --no-audit --no-fund --loglevel=error
[ -x ./node_modules/.bin/tsx ] || falhar "tsx não instalado"

if [ "$modo" = "--verificar" ]; then
  # Sem credenciais e sem escrita: prova que a fonte que bloqueia o GitHub
  # responde a esta máquina. O inventário de tribunais não tem dado nominal.
  env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_DB_URL node --input-type=module - <<'JS'
const resposta = await fetch("https://comunicaapi.pje.jus.br/api/v1/comunicacao/tribunal", { signal: AbortSignal.timeout(30000) })
if (resposta.status !== 200) throw new Error(`DJEN respondeu HTTP ${resposta.status}`)
const inventario = await resposta.json()
if (!Array.isArray(inventario) || inventario.length === 0) throw new Error("inventário do DJEN vazio")
console.log(`DJEN inventario HTTP 200, ${inventario.length} grupos`)
JS
  echo "VERIFICACAO_OK sha=$sha node=$(node -v) psql=$(psql --version | cut -d' ' -f3)"
  exit 0
fi

# A rotina agendada termina após o segundo turno, como a de checagens.
# Renovar é reinstalar a partir de uma main que traga data nova aqui.
if [ "$(date -u +%Y%m%d)" -gt 20261025 ]; then
  echo "Vigência agendada encerrada após 25/10/2026"
  exit 0
fi

[ -f "$credenciais" ] && [ ! -L "$credenciais" ] || falhar "arquivo de credenciais ausente ou simbólico"
[ "$(stat -f %u "$credenciais")" = "$(id -u)" ] || falhar "credenciais precisam pertencer a este usuário"
[ "$(stat -f %Lp "$credenciais")" = "600" ] || falhar "credenciais exigem chmod 600"
url_supabase=""; chave_servico=""; url_banco=""
while IFS= read -r linha || [ -n "$linha" ]; do
  case "$linha" in ""|"#"*) continue ;; esac
  nome="${linha%%=*}"; valor="${linha#*=}"
  case "$nome" in
    SUPABASE_URL) url_supabase="$valor" ;;
    SUPABASE_SERVICE_ROLE_KEY) chave_servico="$valor" ;;
    SUPABASE_DB_URL) url_banco="$valor" ;;
    *) falhar "chave não permitida nas credenciais: $nome" ;;
  esac
done <"$credenciais"
[ -n "$url_supabase" ] && [ -n "$chave_servico" ] && [ -n "$url_banco" ] || falhar "faltam credenciais obrigatórias"

# 16 hex: o formato local:<hex>:<carimbo> que scripts/lib/coleta-log.ts aceita.
run_id="$(uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]' | cut -c1-16)"
execucao="local:$run_id:$carimbo"
saida="$dir_estado/processos-local/$carimbo-${sha:0:12}"
mkdir -p "$saida/diagnostico-publico"
chmod 700 "$dir_estado/processos-local" "$saida" "$saida/diagnostico-publico"
resumo="$saida/resumo-coleta.txt"
: >"$resumo"
echo "execucao=$execucao artefatos=$saida"
aplicar=true
if [ "$modo" = "--dry-run" ]; then aplicar=false; fi
echo "Aplicar: $aplicar · margem: $margem_dias dias" | tee -a "$resumo"

# Snapshot da coorte e checker de 14 dias, os mesmos do workflow. A URL do
# banco vai ao psql por variáveis PG*, nunca pela linha de comando.
conferir_recibos() {
  local rotulo="$1"
  SUPABASE_DB_URL="$url_banco" node - "$saida/recibos-$rotulo.json" <<'JS' || return 1
const { spawnSync } = require("node:child_process")
const { openSync, closeSync } = require("node:fs")
const url = new URL(process.env.SUPABASE_DB_URL)
if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("SUPABASE_DB_URL precisa ser postgres://")
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) || "postgres" }
delete env.SUPABASE_DB_URL
for (const [chave, valor] of url.searchParams) {
  if (chave !== "sslmode") throw new Error(`parâmetro não suportado em SUPABASE_DB_URL: ${chave}`)
  env.PGSSLMODE = valor
}
const saida = openSync(process.argv[2], "w", 0o600)
const r = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-Atq", "-f", "scripts/audit/processos-coverage-snapshot.sql"],
  { env, stdio: ["ignore", saida, "inherit"] })
closeSync(saida)
process.exit(r.status ?? 1)
JS
  node --import tsx scripts/audit/check-processos-receipts.ts \
    --input="$saida/recibos-$rotulo.json" | tee "$saida/recibos-$rotulo-resumo.json"
}

# Antes: informativo, como o continue-on-error do workflow. Depois: bloqueia.
set +e
conferir_recibos antes
rc_antes=$?
set -e
[ "$rc_antes" -eq 0 ] || echo "AVISO: conferência anterior à coleta terminou com código $rc_antes"

publicar_diagnostico() {
  if [ -f "$evidencia.diagnostico.json" ]; then
    node --import tsx scripts/resumir-diagnostico-coleta-processos.ts \
      --entrada="$evidencia.diagnostico.json" --modo="$modo_coleta" \
      --saida="$saida/diagnostico-publico/$modo_coleta.json" | tee -a "$resumo" \
      || echo "AVISO: diagnóstico de $modo_coleta não pôde ser saneado"
  fi
}

export SUPABASE_URL="$url_supabase"
export SUPABASE_SERVICE_ROLE_KEY="$chave_servico"
export PF_COLETA_EXECUCAO="$execucao"
falhas=0
set +e
for modo_coleta in vencendo sem-recibo; do
  evidencia="$saida/processos-$modo_coleta.evidence.json"
  if [ "$modo_coleta" = "vencendo" ]; then
    set -- --alvos=vencendo --margem-dias="$margem_dias"
  else
    set -- --alvos=sem-recibo
  fi
  # Leitura das fontes sempre em dry-run de escrita; só o aplicador grava.
  if PF_DRY_RUN=1 node --import tsx scripts/curadoria-processos-lote.ts \
      --coorte-atual --dry-run "$@" \
      --evidence="$evidencia" --cache="$saida/cache-$modo_coleta" \
      >"$saida/coleta-$modo_coleta.log" 2>&1; then
    if [ ! -f "$evidencia" ]; then
      echo "$modo_coleta: nenhum alvo" | tee -a "$resumo"
      continue
    fi
    node -e 'const x=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));console.log(process.argv[2]+": "+JSON.stringify(x.resumo))' \
      "$evidencia" "$modo_coleta" | tee -a "$resumo"
    publicar_diagnostico
    if [ "$aplicar" = "true" ]; then
      if ! node --import tsx scripts/aplicar-evidencia-processos-curadoria.ts --apply \
          --evidence="$evidencia" >"$saida/aplicar-$modo_coleta.log" 2>&1; then
        echo "ERRO: aplicador falhou em $modo_coleta; log em $saida" | tee -a "$resumo"
        falhas=$((falhas + 1))
      else
        tail -n 1 "$saida/aplicar-$modo_coleta.log" \
          | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);const r=(x.revisao_humana||[]).length;if(r)console.error("AVISO: "+r+" CNJ com confirmação editorial foram para revisão humana; o recibo anterior desses alvos não foi renovado.");console.log(JSON.stringify({inseridos:x.candidatos_inseridos,pulados:x.candidatos_pulados,readback:x.readback.conferidos,divergentes:x.readback.divergentes.length,revisao_humana:r}))})' \
          | sed "s/^/$modo_coleta aplicado: /" | tee -a "$resumo"
      fi
    else
      node --import tsx scripts/aplicar-evidencia-processos-curadoria.ts --dry-run \
        --evidence="$evidencia" >"$saida/aplicar-$modo_coleta.log" 2>&1 \
        || { echo "ERRO: dry-run do aplicador falhou em $modo_coleta" | tee -a "$resumo"; falhas=$((falhas + 1)); }
    fi
  else
    echo "ERRO: coleta $modo_coleta interrompida; log em $saida" | tee -a "$resumo"
    falhas=$((falhas + 1))
    snapshot="$evidencia.snapshot.json"
    tipo="sem_classificacao"
    if [ -f "$evidencia.falha.json" ]; then
      tipo="$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).tipo)' "$evidencia.falha.json")"
    fi
    echo "$modo_coleta falhou: $tipo" | tee -a "$resumo"
    publicar_diagnostico
    if [ -f "$snapshot" ] && [ "$aplicar" = "true" ]; then
      if node --import tsx scripts/registrar-erro-coleta-processos.ts --apply \
          --snapshot="$snapshot" --tipo="$tipo" --modo="$modo_coleta" >"$saida/erro-$modo_coleta.log" 2>&1; then
        tail -n 1 "$saida/erro-$modo_coleta.log" | sed "s/^/$modo_coleta recibos de erro: /" | tee -a "$resumo"
      else
        echo "ERRO: não foi possível gravar os recibos de erro de $modo_coleta" | tee -a "$resumo"
      fi
    elif [ ! -f "$snapshot" ]; then
      echo "ERRO: coleta $modo_coleta caiu antes do snapshot de alvos; sem recibo possível" | tee -a "$resumo"
    fi
  fi
done

conferir_recibos depois
rc_depois=$?
set -e
unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY PF_COLETA_EXECUCAO

[ "$falhas" -eq 0 ] || falhar "coleta com $falhas falha(s); resumo em $resumo"
[ "$rc_depois" -eq 0 ] || falhar "conferência depois da coleta terminou com código $rc_depois"
echo "COLETA_OK sha=$sha aplicar=$aplicar artefatos=$saida"
