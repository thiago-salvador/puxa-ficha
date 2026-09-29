#!/usr/bin/env bash
# Coleta semanal da Câmara fora do GitHub Actions.
#
# Desde 26/09/2026 a API de Dados Abertos da Câmara recusa conexão TCP dos
# runners hospedados do GitHub. Este script roda no Mac do mantenedor, pelo
# agente launchd instalado por scripts/camara-local/instalar-agente.sh.
# Runbook: docs/operations/ingest-camara-local.md
#
# O que ele faz, nesta ordem:
#   1. busca a main pela URL explícita do repositório, confere o SHA com
#      `git ls-remote` e avisa se o SHA anterior não é ancestral (force-push);
#   2. confere a si mesmo contra a cópia deste arquivo nesse SHA e para se
#      diferir (launcher instalado de checkout alterado ou desatualizado);
#   3. cria um worktree descartável nesse SHA, fora do clone;
#   4. `npm ci --ignore-scripts` (nenhum script de instalação de dependência roda);
#   5. roda `./node_modules/.bin/tsx scripts/ingest-all.ts camara
#      --skip-camara-validated` com Node 24, com as credenciais lidas de um
#      arquivo fora do repo (chmod 600);
#   6. marca os recibos de `coleta_log` com `local:<random hex>:<timestamp UTC>`;
#   7. revalida o cache público, se o arquivo trouxer PF_REVALIDATE_SECRET;
#   8. grava o log em ~/Library/Logs/puxa-ficha/ e apaga o worktree.
#
# Uso:
#   ingest-camara-local.sh <caminho do clone>              coleta de verdade
#   ingest-camara-local.sh <caminho do clone> --verificar  tudo menos coleta e
#       revalidação: prova fetch, autoconferência, worktree, npm ci e carga do
#       ingest, sem credencial e sem escrita no banco.
set -euo pipefail
umask 077

falhar() { echo "ERRO: $*" >&2; exit 1; }
avisar() { echo "AVISO: $*" >&2; }

[ "$(id -u)" -ne 0 ] || falhar "não rode como root"

repo="${1:-}"
modo="${2:-coletar}"
[ -n "$repo" ] || falhar "uso: ingest-camara-local.sh <caminho do clone> [--verificar]"
case "$modo" in coletar|--verificar) ;; *) falhar "modo desconhecido: $modo" ;; esac

repo_url="https://github.com/thiago-salvador/puxa-ficha.git"
caminho_launcher="scripts/camara-local/ingest-camara-local.sh"
credenciais="$HOME/.config/puxa-ficha/ingest-camara.env"
dir_log="$HOME/Library/Logs/puxa-ficha"
dir_estado="$HOME/Library/Application Support/puxa-ficha"
node_bin="/opt/homebrew/opt/node@24/bin"
revalidate_url="https://puxaficha.com.br/api/revalidate"
# Mesmo conjunto de tags do job `revalidate` de .github/workflows/ingest.yml;
# tests/ingest-camara-local.test.ts reprova divergência.
tags_json='["public-candidatos","public-candidato-metadata","public-candidato-ficha","public-candidatos-resumo","public-candidatos-comparaveis","public-indicadores-all","public-indicadores-estado","quiz-dataset","ranking-data","doador-reverse"]'

carimbo="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dir_log" "$dir_estado"
chmod 700 "$dir_log" "$dir_estado"
log="$dir_log/ingest-camara-$carimbo.log"
echo "Log: $log"
exec >>"$log" 2>&1
echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) inicio modo=$modo pid=$$"

# Trava com pid: rodada viva bloqueia; trava de processo morto é retomada.
trava="$dir_log/.ingest-camara.lock"
if ! mkdir "$trava" 2>/dev/null; then
  pid_anterior="$(cat "$trava/pid" 2>/dev/null || true)"
  if [[ "$pid_anterior" =~ ^[0-9]+$ ]] && kill -0 "$pid_anterior" 2>/dev/null; then
    falhar "outra rodada em curso (pid $pid_anterior, trava $trava)"
  fi
  avisar "trava órfã (pid '${pid_anterior:-?}' não está vivo); retomando"
  rm -rf "$trava"
  mkdir "$trava" || falhar "não consegui retomar a trava $trava"
fi
echo "$$" >"$trava/pid"

base=""
# shellcheck disable=SC2329 # chamada pelo trap EXIT abaixo.
limpar() {
  local rc=$?
  if [ -n "$base" ]; then
    git -C "$repo" worktree remove --force "$base/repo" >/dev/null 2>&1 || true
    rm -rf "$base"
    git -C "$repo" worktree prune >/dev/null 2>&1 || true
  fi
  if [ "$(cat "$trava/pid" 2>/dev/null || true)" = "$$" ]; then rm -rf "$trava"; fi
  echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) fim rc=$rc"
}
trap limpar EXIT

export PATH="$node_bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
versao_node="$(node -v 2>/dev/null || true)"
case "$versao_node" in v24.*) ;; *) falhar "Node 24 esperado em $node_bin, achei '${versao_node:-nenhum}'" ;; esac

git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || falhar "não é um clone git: $repo"
git -C "$repo" fetch --quiet --no-tags "$repo_url" "+refs/heads/main:refs/remotes/origin/main"
sha="$(git -C "$repo" rev-parse --verify "refs/remotes/origin/main^{commit}")"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || falhar "SHA inválido para a main: $sha"
remoto="$(git ls-remote "$repo_url" refs/heads/main | cut -f1)"
[ "$remoto" = "$sha" ] || falhar "SHA buscado ($sha) difere do ls-remote ($remoto)"
echo "main fixada em $sha (conferida com ls-remote)"

arquivo_sha="$dir_estado/ultimo-sha-main"
sha_anterior="$(cat "$arquivo_sha" 2>/dev/null || true)"
if [[ "$sha_anterior" =~ ^[0-9a-f]{40}$ ]] && [ "$sha_anterior" != "$sha" ]; then
  if ! git -C "$repo" merge-base --is-ancestor "$sha_anterior" "$sha" 2>/dev/null; then
    avisar "SHA anterior $sha_anterior não é ancestral de $sha: a main foi reescrita (force-push?). Confira antes de confiar nesta rodada."
  fi
fi
echo "$sha" >"$arquivo_sha"

# Autoconferência: o launcher em execução precisa ser o desta main.
if ! git -C "$repo" cat-file -e "$sha:$caminho_launcher" 2>/dev/null; then
  falhar "a main $sha não contém $caminho_launcher"
fi
if ! cmp -s "$0" <(git -C "$repo" show "$sha:$caminho_launcher"); then
  falhar "este launcher ($0) difere de $caminho_launcher na main $sha; reinstale com scripts/camara-local/instalar-agente.sh"
fi
echo "launcher confere com a main"

base="$(mktemp -d "${TMPDIR:-/tmp}/pf-camara.XXXXXX")"
git -C "$repo" worktree add --quiet --detach "$base/repo" "$sha"
cd "$base/repo"
[ "$(git rev-parse HEAD)" = "$sha" ] || falhar "worktree fora do SHA fixado"

npm ci --ignore-scripts --no-audit --no-fund --loglevel=error
tsx="./node_modules/.bin/tsx"
[ -x "$tsx" ] || falhar "tsx não instalado em $tsx"

if [ "$modo" = "--verificar" ]; then
  # Carrega o grafo inteiro do ingest pelo tsx (prova que --ignore-scripts
  # basta) e para na validação de fonte, antes de qualquer rede ou banco.
  set +e
  saida="$(env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY "$tsx" scripts/ingest-all.ts __verificacao__ 2>&1)"
  set -e
  echo "$saida"
  case "$saida" in
    *"Fonte desconhecida: __verificacao__"*) echo "VERIFICACAO_OK sha=$sha node=$versao_node" ;;
    *) falhar "o ingest não carregou com --ignore-scripts" ;;
  esac
  exit 0
fi

[ -f "$credenciais" ] || falhar "arquivo de credenciais ausente: $credenciais"
[ ! -L "$credenciais" ] || falhar "arquivo de credenciais não pode ser link simbólico"
[ "$(stat -f %u "$credenciais")" = "$(id -u)" ] || falhar "arquivo de credenciais precisa ser deste usuário"
[ "$(stat -f %Lp "$credenciais")" = "600" ] || falhar "arquivo de credenciais precisa de chmod 600"

url_supabase=""
chave_supabase=""
segredo_revalidacao=""
while IFS= read -r linha || [ -n "$linha" ]; do
  case "$linha" in "" | "#"*) continue ;; esac
  nome="${linha%%=*}"
  valor="${linha#*=}"
  case "$nome" in
    SUPABASE_URL) url_supabase="$valor" ;;
    SUPABASE_SERVICE_ROLE_KEY) chave_supabase="$valor" ;;
    PF_REVALIDATE_SECRET) segredo_revalidacao="$valor" ;;
    *) falhar "chave não permitida no arquivo de credenciais: $nome" ;;
  esac
done <"$credenciais"
[ -n "$url_supabase" ] && [ -n "$chave_supabase" ] || falhar "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias"

run_id="$(uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]' | cut -c1-16)"
[[ "$run_id" =~ ^[a-f0-9]{16}$ ]] || falhar "identificador aleatório de execução inválido"
execucao="local:$run_id:$carimbo"
echo "execucao=$execucao"

set +e
SUPABASE_URL="$url_supabase" \
  SUPABASE_SERVICE_ROLE_KEY="$chave_supabase" \
  PF_COLETA_EXECUCAO="$execucao" \
  "$tsx" scripts/ingest-all.ts camara --skip-camara-validated --apply
rc=$?
echo "ingest camara rc=$rc"

# Os coletores complementares usam o mesmo SHA, cliente auditado, credenciais
# e identificador de execução. Uma falha na API da Câmara não impede a leitura
# independente dos CSVs oficiais e do histórico partidário parlamentar.
SUPABASE_URL="$url_supabase" \
  SUPABASE_SERVICE_ROLE_KEY="$chave_supabase" \
  PF_COLETA_EXECUCAO="$execucao" \
  "$tsx" scripts/ingest-all.ts camara-cotas ceaps-senado partidos-parlamentares --apply
rc_complementos=$?
set -e
echo "ingest complementos rc=$rc_complementos"
if [ "$rc_complementos" -ne 0 ]; then rc="$rc_complementos"; fi

# Como o job `revalidate` do Actions: revalida mesmo com erro parcial, para
# publicar o que chegou ao banco; o rc do ingest continua sendo o do script.
if [ -n "$segredo_revalidacao" ]; then
  cabecalho="$base/revalidate-header"
  printf 'x-pf-revalidate-secret: %s\n' "$segredo_revalidacao" >"$cabecalho"
  status="$(printf '{"tags":%s}' "$tags_json" | curl -sS -o "$base/revalidate.json" -w '%{http_code}' \
    -X POST "$revalidate_url" -H "content-type: application/json" -H "@$cabecalho" --data-binary @- || true)"
  echo "revalidate HTTP $status"
  [ "$status" = "200" ] || [ "$rc" -ne 0 ] || rc=1
else
  echo "revalidate pulado: PF_REVALIDATE_SECRET ausente no arquivo de credenciais"
fi

# A prova de cobertura é uma segunda leitura: captura a revisão oficial e o
# DTO público após a revalidação. Só o aplicador auditado grava recibos que a
# régua aceita; falhas de leitura permanecem erro/indeterminado.
prova="$dir_log/prova-parlamentar-$carimbo"
mkdir -m 700 "$prova"
export SUPABASE_URL="$url_supabase" SUPABASE_SERVICE_ROLE_KEY="$chave_supabase"
if "$tsx" scripts/audit/exportar-perfis-publicos.ts --out="$prova/perfis.json" &&
   "$tsx" scripts/audit/exportar-votacoes-chave-camara.ts --out="$prova/camara-votacoes.json" &&
   "$tsx" scripts/audit/exportar-votacoes-chave-senado.ts --out="$prova/senado-votacoes.json" &&
   "$tsx" scripts/audit/exportar-recibos-parlamentares.ts --out="$prova/recibos-atuais.json" &&
   "$tsx" scripts/audit/audit-cobertura-fichas.ts \
     --input="$prova/perfis.json" --receipts="$prova/recibos-atuais.json" \
     --out="$prova/matriz.json" &&
   "$tsx" scripts/audit/select-parliamentary-open-slugs.ts \
     --matrix="$prova/matriz.json" --out="$prova/slugs-abertos.txt" &&
   "$tsx" scripts/audit/fetch-parliamentary-family-sources-local.ts \
     --destino="$prova/fontes" --public-profiles="$prova/perfis.json" \
     --slugs-file="$prova/slugs-abertos.txt" \
     --camara-votacoes="$prova/camara-votacoes.json" \
     --senado-votacoes="$prova/senado-votacoes.json" &&
   "$tsx" scripts/audit/collect-parliamentary-family-receipts-local.ts \
     --input="$prova/fontes/parliamentary-family-sources.json" \
     --out="$prova/recibos-novos.json" --abertos; then
  set +e
  "$tsx" scripts/audit/apply-coverage-receipts.ts \
    --in="$prova/recibos-novos.json" \
    --allow-fonte=camara-proposicoes,camara-votacoes,camara-gastos,senado-proposicoes,senado-votacoes,ceaps-senado \
    --profiles="$prova/perfis.json" --out-dir="$prova/aplicacao" \
    --incluir-abertos --recibos-atuais="$prova/recibos-atuais.json" \
    --apply --execucao="$execucao:parlamentares"
  rc_prova=$?
  set -e
else
  rc_prova=1
fi
echo "prova parlamentar rc=$rc_prova"
if [ "$rc_prova" -ne 0 ]; then rc="$rc_prova"; fi

exit "$rc"
