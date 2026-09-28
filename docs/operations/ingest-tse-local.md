# Coleta local do TSE

## O agente local

O launchd roda `scripts/tse-local/ingest-tse-local.sh` toda quinta-feira às
06:00 no fuso local do Mac. O launcher:

1. busca `main` pela URL explícita do repositório, confere o SHA com
   `git ls-remote` e avisa se o SHA da rodada anterior não for ancestral;
2. confere que sua própria cópia é idêntica à da `main` fixada;
3. cria um worktree descartável nesse SHA e roda `npm ci --ignore-scripts`;
4. exige `TSE_LOCAL_RECIBOS` para recortar a coorte pós-turno em toda rodada.
   Por padrão, invoca `npm run ingest:tse:local -- --dry-run --recibos=<snapshot>`.
   O live usa os arquivos da rodada revisada, fixados pelos SHAs abaixo; ele
   não baixa nem recompõe os recibos e o plano. Depois da escrita auditada,
   exporta novamente os perfis públicos e só então calcula a cobertura;
5. guarda logs em `~/Library/Logs/puxa-ficha/` e remove o worktree ao terminar.

O runner exige Node 24 em `/opt/homebrew/opt/node@24/bin`. Downloads TSE são
mantidos no worktree durante a rodada por `PF_KEEP_TSE_DOWNLOADS=1`; o worktree
é removido no encerramento.

O coletor usa Chrome visível para os ZIPs oficiais
`consulta_cand_<ano>` (1996–2026), `bem_candidato_<ano>` (2006–2026) e receitas
de prestação de contas (2002–2026, com os nomes oficiais próprios de cada
período). O manifesto privado registra URL e SHA-256 de cada ZIP. A revisão de
histórico usa as candidaturas oficiais e só certifica identidade vinculada por
identificador oficial; vínculos apenas nominais ficam em revisão. A leitura
complementar por candidato consulta
`/divulga/rest/v1/eleicao/ordinarias` e
`/divulga/rest/v1/candidatura/buscar/2026/<UF>/<idEleicao>/candidato/<SQ>`.
Para Presidente, `<UF>` é `BR`; para outros cargos, a UF é conferida no ZIP
oficial de 2026. O detalhe também fornece SQs de candidaturas anteriores.
Para SQs antigos repetidos entre UFs, a UF precisa constar no histórico desse
detalhe e as linhas do ZIP devem identificar uma única candidatura na UF.
Os CSVs são lidos em fluxo; CPF e título não passam para os recibos derivados.
Quando a conta está disponível, o coletor consulta
`/divulga/rest/v1/prestador/consulta/<idEleicao>/2026/<UF>/<cargo>/<partido>/<numero>/<SQ>`
e pagina `/divulga/rest/v1/prestador/consulta/receitas/<idEleicao>/<idPrestador>/<idUltimaEntrega>/lista?pagina=N`.
Os resultados são guardados em artefatos privados com campos permitidos; sem readback
compatível e escritor auditado, ele não fecha células nem é aplicado ao banco.
Falhas de leitura ficam como erro, nunca como vazio confirmado.

## Configuração e instalação manuais

O instalador copia arquivos para o usuário atual e cria o arquivo de ambiente
com modo 600. Não carrega o serviço launchd.

```bash
bash scripts/tse-local/instalar-agente.sh
```

Preencha `~/.config/puxa-ficha/ingest-tse.env`, uma chave por linha, sem aspas
nem `export`. O workflow `.github/workflows/ingest.yml`, job `ingest-tse`,
fornece o padrão dos nomes de credenciais usados pelo ingest:

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
PF_DOADOR_CPF_HASH_SALT=...
TSE_LOCAL_MODE=dry-run
# Snapshot privado atual de coleta_log com encerramentos pós-turno; obrigatório em ambos os modos.
TSE_LOCAL_RECIBOS=/caminho/privado/recibos-atuais.json
# Somente para live: diretório de saída do dry-run revisado e SHAs hexadecimais.
# TSE_LOCAL_REVIEWED_RUN_DIR=/caminho/privado/rodada-revisada
# TSE_LOCAL_EXPECTED_PLAN_SHA=...
# TSE_LOCAL_EXPECTED_PLAN_FILE_SHA=...
# TSE_LOCAL_EXPECTED_REPORT_SHA=...
# TSE_LOCAL_EXPECTED_FAMILY_SHA=...
# TSE_LOCAL_EXPECTED_HISTORY_SHA=...
```

Mantenha o arquivo privado (`chmod 600 ~/.config/puxa-ficha/ingest-tse.env`)
e o diretório `~/.config/puxa-ficha` em modo 700. O modo padrão é `dry-run`.
O arquivo `TSE_LOCAL_RECIBOS` é obrigatório também no dry-run. Revise o
`relatorio.json`, `financas/plano-privado.json`, `recibos-familias-aplicaveis.json`
e `historico-recibos.json` da mesma rodada. O plano privado contém
`plano_sha256`: copie esse valor para `TSE_LOCAL_EXPECTED_PLAN_SHA`. Calcule o
SHA-256 dos bytes de cada arquivo com `shasum -a 256` e preencha, na ordem,
`TSE_LOCAL_EXPECTED_PLAN_FILE_SHA`, `TSE_LOCAL_EXPECTED_REPORT_SHA`,
`TSE_LOCAL_EXPECTED_FAMILY_SHA` e `TSE_LOCAL_EXPECTED_HISTORY_SHA`. Aponte `TSE_LOCAL_REVIEWED_RUN_DIR` para o
diretório dessa rodada e só então defina `TSE_LOCAL_MODE=live`. O runner confere
os cinco digests e os gates do relatório antes de qualquer escrita. O writer relê o estado para CAS,
aplica o plano revisado, faz readback e a cobertura usa o snapshot público
pós-escrita. A gravação live requer autorização explícita para escrever no
banco de produção. Credenciais ficam no ambiente do subshell, fora dos
argumentos e logs.

Verifique a instalação e o carregamento das dependências sem executar a coleta:

```bash
bash "$HOME/Library/Application Support/puxa-ficha/ingest-tse-local.sh" \
  "/caminho/do/clone/puxa-ficha" --verificar
```

Após revisar o arquivo de ambiente e o modo escolhido, o carregamento é manual:

```bash
launchctl bootstrap gui/$(id -u) \
  "$HOME/Library/LaunchAgents/br.com.puxaficha.ingest-tse.plist"
```

Uma execução manual pode ser iniciada pelo launcher instalado. Sem
`TSE_LOCAL_MODE=live` e os SHAs revisados, ela continua em `dry-run`:

```bash
bash "$HOME/Library/Application Support/puxa-ficha/ingest-tse-local.sh" \
  "/caminho/do/clone/puxa-ficha"
```

## Atualização e desinstalação

O launcher instalado é uma cópia. Se mudar na `main`, a autoconferência para
até que o instalador seja executado novamente a partir da `main` atual. O
instalador compara o HEAD e os arquivos com o SHA remoto e recusa checkout
alterado.

Para desativar o agente, descarregue-o e remova os arquivos instalados:

```bash
launchctl bootout gui/$(id -u)/br.com.puxaficha.ingest-tse
rm "$HOME/Library/LaunchAgents/br.com.puxaficha.ingest-tse.plist"
rm "$HOME/Library/Application Support/puxa-ficha/ingest-tse-local.sh"
rm "$HOME/.config/puxa-ficha/ingest-tse.env"
```
