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
   não baixa nem recompõe os recibos e o plano. O relatório revisado expira
   após 24 horas e cada SHA de plano só pode ser consumido uma vez. Depois da
   escrita auditada, exporta novamente os perfis públicos e aplica a projeção
   de cobertura fixada contra o readback;
5. guarda logs em `~/Library/Logs/puxa-ficha/` e remove o worktree ao terminar.

O runner exige Node 24 em `/opt/homebrew/opt/node@24/bin`. Downloads TSE são
mantidos no worktree durante a rodada por `PF_KEEP_TSE_DOWNLOADS=1`; o worktree
é removido no encerramento.
O launchd não lê nada sob `~/Documents` (nem `~/Desktop` ou `~/Downloads`):
a privacidade do macOS nega o acesso ao processo do agente, que falha sem
coletar. O instalador grava no plist o caminho do clone de onde ele foi
executado, então instale e rode sempre a partir do clone dedicado em
`~/Library/Application Support/puxa-ficha/repo`, o mesmo do agente da Câmara.
Um clone de trabalho em `~/Documents` serve para desenvolver, nunca para o
agente. Se o clone dedicado ainda não existir:

```bash
git clone https://github.com/thiago-salvador/puxa-ficha.git \
  "$HOME/Library/Application Support/puxa-ficha/repo"
```

Antes de instalar ou atualizar, deixe esse clone na `main` atual
(`git -C "$HOME/Library/Application Support/puxa-ficha/repo" fetch origin main`
e `checkout --detach origin/main`): o instalador recusa HEAD diferente da
`main` publicada.

O coletor usa Chrome visível para os ZIPs oficiais
`consulta_cand_<ano>` (1996–2026), `bem_candidato_<ano>` (2006–2026) e receitas
de prestação de contas (2002–2026, com os nomes oficiais próprios de cada
período). O manifesto privado registra URL e SHA-256 de cada ZIP. A revisão de
histórico usa as candidaturas oficiais e certifica identidade por identificador
oficial ou por vínculo nominal revisado e listado em arquivo privado. Nesse caso,
nome e nascimento precisam coincidir com a âncora; UF e cargo também são
conferidos para cada vínculo revisado. Um vínculo não remove a revisão de uma
âncora descartada do seed em 2026. Em outros anos, essa revisão só sai quando o
SQ do vínculo é o próprio SQ do seed naquele ano. Linhas nominais não cobertas
permanecem em revisão. A leitura
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
cd "$HOME/Library/Application Support/puxa-ficha/repo"
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
# Opcional: vínculos nominais revisados, fora do repositório.
# TSE_LOCAL_IDENTITY_REVIEWED=/caminho/privado/identidade-revisada.json
# Somente para live: diretório de saída do dry-run revisado e SHAs hexadecimais.
# TSE_LOCAL_REVIEWED_RUN_DIR=/caminho/privado/rodada-revisada
# TSE_LOCAL_EXPECTED_PLAN_SHA=...
# TSE_LOCAL_EXPECTED_PLAN_FILE_SHA=...
# TSE_LOCAL_EXPECTED_REPORT_SHA=...
# TSE_LOCAL_EXPECTED_FAMILY_SHA=...
# TSE_LOCAL_EXPECTED_HISTORY_SHA=...
# TSE_LOCAL_EXPECTED_COHORT_SHA=...
# TSE_LOCAL_EXPECTED_PROJECTION_SHA=...
# TSE_LOCAL_EXPECTED_IDENTITY_SHA=...  # obrigatório no live se houver arquivo de identidade
```

Mantenha o arquivo privado (`chmod 600 ~/.config/puxa-ficha/ingest-tse.env`)
e o diretório `~/.config/puxa-ficha` em modo 700. O modo padrão é `dry-run`.
O arquivo `TSE_LOCAL_RECIBOS` é obrigatório também no dry-run. Revise o
`relatorio.json`, `financas/plano-privado.json`, `recibos-familias-aplicaveis.json`,
`recibos-familias-projecao.json`, `coorte-perfis.json` e `historico-recibos.json` da mesma rodada. O plano privado contém
`plano_sha256`: copie esse valor para `TSE_LOCAL_EXPECTED_PLAN_SHA`. Calcule o
SHA-256 dos bytes de cada arquivo com `shasum -a 256` e preencha, na ordem,
`TSE_LOCAL_EXPECTED_PLAN_FILE_SHA`, `TSE_LOCAL_EXPECTED_REPORT_SHA`,
`TSE_LOCAL_EXPECTED_FAMILY_SHA`, `TSE_LOCAL_EXPECTED_HISTORY_SHA`,
`TSE_LOCAL_EXPECTED_COHORT_SHA` e `TSE_LOCAL_EXPECTED_PROJECTION_SHA`. Se usou
`TSE_LOCAL_IDENTITY_REVIEWED`, calcule também seu SHA em
`TSE_LOCAL_EXPECTED_IDENTITY_SHA`. O live fixa os mesmos bytes em `pinned/`.
Aponte `TSE_LOCAL_REVIEWED_RUN_DIR` para o
diretório dessa rodada e só então defina `TSE_LOCAL_MODE=live`. O runner confere
os digests e os gates do relatório antes de qualquer escrita de domínio. Ações
financeiras de perfis com identidade em revisão saem de `acoes` e entram em
`revisao` com motivo `identidade_em_revisao` antes do cálculo de `plano_sha256`.
Seus recibos financeiros passam a `indeterminado`, sem alegação de volume. A
projeção e o histórico desses perfis não geram recibos de cobertura nessa rodada.
O relatório distingue ações adiadas de ações de risco ainda no plano, que devem
ser zero. No live, o gate fixa a revisão histórica, os candidatos da coorte e os
diagnósticos de família pelos SHAs incluídos no relatório, recompõe a coorte de
risco e confere cada ação do plano. O writer relê o estado para CAS,
aplica o plano revisado, faz readback e a cobertura usa o snapshot público
pós-escrita. A gravação live requer autorização explícita para escrever no
banco de produção. Credenciais ficam no ambiente do subshell, fora dos
argumentos e logs.

Verifique a instalação e o carregamento das dependências sem executar a coleta:

```bash
bash "$HOME/Library/Application Support/puxa-ficha/ingest-tse-local.sh" \
  "$HOME/Library/Application Support/puxa-ficha/repo" --verificar
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
  "$HOME/Library/Application Support/puxa-ficha/repo"
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
