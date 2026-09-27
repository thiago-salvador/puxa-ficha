# Coleta semanal de checagens no Mac

## Motivo e alcance

O runner hospedado do GitHub respondeu HTTP 403 ao arquivo nativo do UOL
Confere e à busca da AFP no PR #519. Aos Fatos, Fato ou Fake e Estadão
responderam HTTP 200 no mesmo runner. A coleta completa de sete agências foi validada
no Mac em modo somente leitura: 204 candidaturas, 7/7 respostas por ficha,
zero erro, sem Google. O workflow `checagens-coleta.yml` fica apenas para
diagnóstico manual e não recebe credencial de escrita nem tem schedule.

O agente `scripts/checagens-local/coletar-local.sh` reúne as sete respostas
num único recibo por candidatura. Ele usa a `main` fixada por SHA e confere a
cópia instalada contra ela, como o agente de `scripts/camara-local/`. Não
executa código de PR. Segunda às 10:00 UTC, até 04/10/2026, é o horário do
launchd; o instalador converte para o fuso local.

## Ordem da rodada

1. Busca a `main` pela URL explícita, confere o SHA com `ls-remote`, valida a
   cópia instalada e cria um worktree temporário nesse SHA.
2. Usa Node 24 e `npm ci --ignore-scripts`.
3. Consulta as sete fontes com `--sem-google`, intervalo compartilhado de dois
   segundos por host e três trabalhadores. Salva `roster.json`, recibos,
   `resumo.json` e checkpoint em
   `~/Library/Application Support/puxa-ficha/checagens/<UTC>-<SHA>/`.
4. Só se o processo retornar zero e todos os recibos tiverem sete agências
   `ok`, importa esses mesmos recibos no `coleta_log` e gera `catalogo.json`
   local. Erro de qualquer rota bloqueia a escrita remota.

O `catalogo.json` é artefato para revisão editorial e PR. O agente não faz
commit, push, merge, deploy nem publica leads automaticamente. O site lê o
catálogo versionado em `scripts/data/checagens-recibos.json`; um artefato
local, sozinho, não altera a página pública.

## Instalação após o merge do código

O instalador só aceita checkout limpo cujo HEAD seja a `main` remota atual.
Ele copia script e plist para o usuário, mas não carrega o agente.

```bash
mkdir -p ~/.config/puxa-ficha
chmod 700 ~/.config/puxa-ficha
touch ~/.config/puxa-ficha/checagens-local.env
chmod 600 ~/.config/puxa-ficha/checagens-local.env
bash scripts/checagens-local/instalar-agente.sh
```

O arquivo de credenciais, fora do repositório, aceita apenas estas três
chaves, uma por linha, sem aspas nem `export`:

```text
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Antes de carregar, executar a prova sem credenciais e sem escrita no banco:

```bash
bash ~/Library/Application\ Support/puxa-ficha/checagens-coletar-local.sh <clone-principal> --verificar
```

O log em `~/Library/Logs/puxa-ficha/checagens-local-<UTC>.log` deve terminar
com `VERIFICACAO_OK`. Essa prova consulta e valida as cinco rotas diretas
afetadas. Depois, carregar o plist instalado:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/br.com.puxaficha.checagens-local.plist
```

Se o Mac estiver desligado, a semana passa sem coleta; o agente não transforma
ausência de execução em `vazio_confirmado`. Se a `main` ou o launcher instalado
divergirem, a rodada para com erro no log antes de ler segredos.

## Verificação e retorno

Após uma rodada, conferir `COLETA_OK`, `resumo.json`, 7/7 `ok` e o SHA do log.
Importar `catalogo.json` no repositório só por revisão e PR separados.
Para suspender as próximas rodadas:

```bash
launchctl bootout gui/$(id -u)/br.com.puxaficha.checagens-local
```
