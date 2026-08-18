#!/usr/bin/env bash
# Dump do banco Supabase do Puxa Ficha.
#
# Por que existe. Duas tabelas so existem no banco e nao sao reconstrutiveis
# pelas migrations versionadas: noticias_candidato (ingerida por
# /api/news/refresh e scripts/lib/ingest-google-news.ts) e alert_subscribers
# (emails de assinantes, PII). Sem dump, um erro de escrita em massa perde as
# duas sem caminho de volta.
#
# Este dump NAO substitui o backup gerenciado do Supabase, e o inverso tambem
# nao vale. O gerenciado restaura um estado dentro da conta Supabase; este aqui
# produz um artifact cifrado que voce controla, independente daquela conta, e
# que pode ser restaurado em outro projeto. Cobrem falhas diferentes.
#
# Nota de 08/08/2026: o cabecalho anterior afirmava que o projeto rodava no
# plano Free e que por isso nao havia backup automatico. A organizacao esta no
# Pro, entao aquela justificativa estava errada. O que o Pro cobre de retencao e
# se ha PITR ativo ainda nao foi conferido; enquanto nao for, nao trate nenhum
# dos dois como suficiente sozinho.
#
# Uso:
#   SUPABASE_DB_URL="postgresql://..." scripts/backup-supabase.sh [dir-saida]
#
# A connection string e a "Direct connection" (ou o pooler em modo session)
# do painel do Supabase: Project Settings -> Database -> Connection string.
# Requer pg_dump com major >= a do servidor (Supabase hoje: 15/17; instale
# postgresql-client-17 que cobre todas).
#
# Saida (formato custom do pg_dump, restauravel com pg_restore):
#   <dir>/puxa-ficha-<UTC>.dump          schema + dados do schema public
#
# Restore de teste (empurrar para um projeto Supabase NOVO, nunca o de
# producao):
#   pg_restore --no-owner --no-privileges -d "postgresql://<projeto-novo>" \
#     puxa-ficha-<UTC>.dump
#
# O dump contem PII: nunca commitar (backups/ esta no .gitignore) e so
# armazenar cifrado fora da maquina local.
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERRO: defina SUPABASE_DB_URL com a connection string do Postgres." >&2
  echo "Painel Supabase: botao Connect no topo -> Direct/Connection string ->" >&2
  echo "Session pooler -> Type URI." >&2
  exit 1
fi

# Validacao de forma antes de chamar o pg_dump. Sem ela, um valor que nao seja
# URI faz o pg_dump trata-lo como NOME DE BANCO e tentar o socket local, e o erro
# que aparece e:
#
#   connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed
#
# que nao menciona a variavel, nao menciona a URI e manda quem le procurar um
# Postgres local que nunca existiu. Aconteceu no primeiro apply de 08/08/2026.
if [[ ! "${SUPABASE_DB_URL}" =~ ^postgres(ql)?:// ]]; then
  # NUNCA ecoar o valor, nem um prefixo dele. O log do Actions e publico neste
  # repositorio, e o valor recebido aqui e, por definicao, algo que nao era para
  # estar nesta variavel: pode ser outro segredo colado por engano. A primeira
  # versao desta validacao imprimia os 12 primeiros caracteres e vazou um
  # fragmento de chave em 08/08/2026. O diagnostico vem da FORMA, nao do
  # conteudo.
  echo "ERRO: SUPABASE_DB_URL nao parece uma URI de conexao." >&2
  echo "Esperado comecar com postgresql:// (ou postgres://)." >&2
  echo "Recebido: ${#SUPABASE_DB_URL} caracteres, sem esse prefixo." >&2
  echo >&2
  echo "Causas comuns, em ordem de frequencia:" >&2
  echo "  1. colar o valor de OUTRO secret (a chave de criptografia, por exemplo);" >&2
  echo "  2. copiar o bloco 'Connection parameters' (host, port, user) em vez do" >&2
  echo "     campo 'Connection string';" >&2
  echo "  3. copiar so o trecho visivel de um campo truncado na tela." >&2
  echo >&2
  echo "Se caiu no caso 1: o outro segredo esta agora no log de um workflow, e" >&2
  echo "este repositorio e publico. Rotacione aquele segredo antes de seguir." >&2
  exit 1
fi

if [[ "${SUPABASE_DB_URL}" == *"[YOUR-PASSWORD]"* || "${SUPABASE_DB_URL}" == *"[YOUR-PASS"* ]]; then
  echo "ERRO: SUPABASE_DB_URL ainda contem o placeholder [YOUR-PASSWORD]." >&2
  echo "Troque o placeholder, colchetes inclusive, pela senha do banco." >&2
  echo "Se a senha tiver caractere especial, faca percent-encode: @ vira %40," >&2
  echo "# vira %23, / vira %2F, : vira %3A, ? vira %3F." >&2
  exit 1
fi

# Senha vazia passa por todas as validacoes de forma e morre la na frente como
# "password authentication failed", que manda quem le procurar a senha errada em
# vez da senha ausente. Aconteceu em 08/08/2026: um paste que nao foi capturado
# por um prompt silencioso (`read -rs` nao ecoa nem asterisco) produziu
# `postgresql://user:@host/...`, e o diagnostico custou tres rodadas de CI.
SENHA_NA_URI="${SUPABASE_DB_URL#*://}"
SENHA_NA_URI="${SENHA_NA_URI%@*}"
SENHA_NA_URI="${SENHA_NA_URI#*:}"
if [[ -z "${SENHA_NA_URI}" ]]; then
  echo "ERRO: a URI nao tem senha entre ':' e '@'." >&2
  echo "Forma recebida: postgresql://USUARIO:@HOST/..." >&2
  echo >&2
  echo "Causa comum: um prompt silencioso que nao capturou o paste. Prompt que" >&2
  echo "nao mostra nem asterisco nao prova captura; confira o tamanho antes de" >&2
  echo "enviar." >&2
  exit 1
fi

# O host precisa estar la: URI sem host tambem cai no socket local.
if [[ ! "${SUPABASE_DB_URL}" =~ @[^/]+ ]]; then
  echo "ERRO: SUPABASE_DB_URL nao tem host depois do '@'." >&2
  echo "A URI do Session pooler termina em algo como" >&2
  echo "@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERRO: pg_dump nao encontrado. Instale postgresql-client-17 (ou use" >&2
  echo "'supabase db dump --db-url ...' que exige Docker)." >&2
  exit 1
fi

DIR_SAIDA="${1:-backups}"
CARIMBO="$(date -u +%Y%m%dT%H%M%SZ)"
ARQUIVO="${DIR_SAIDA}/puxa-ficha-${CARIMBO}.dump"

mkdir -p "${DIR_SAIDA}"

echo "gerando dump em ${ARQUIVO}"
pg_dump "${SUPABASE_DB_URL}" \
  --format=custom \
  --schema=public \
  --no-owner \
  --no-privileges \
  --file="${ARQUIVO}"

TAMANHO="$(du -h "${ARQUIVO}" | cut -f1)"
echo "dump concluido: ${ARQUIVO} (${TAMANHO})"

# Prova minima de integridade: um dump que o proprio pg_restore nao consegue
# listar esta corrompido e nao serve de backup.
pg_restore --list "${ARQUIVO}" >/dev/null
echo "verificacao pg_restore --list: ok"
