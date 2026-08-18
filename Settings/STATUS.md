# Status atual

Snapshot mais recente verificado em **12/08/2026**.

## Snapshot 12/08/2026: Fase 4 chega ao último readback e para num marcador ausente

- A PR #184 foi mergeada e publicada no SHA
  `c6c3090c8640996788c1b960c9bab3283434138d`.
- A Fase 4, run `31643039377`, passou o ledger gate, os 24 readbacks, o de
  destaques, o de honestidade com `fichasAfetadas: []` e o do universo de
  financiamento com as 194 fichas. Parou no último, o readback público.
- O log do CI não trouxe a mensagem, porque os JSON grandes truncaram o passo.
  A execução local do mesmo script contra produção reproduziu:
  `locator.getAttribute: Timeout 30000ms exceeded` esperando
  `[data-pf-trajetoria-count]`.
- Causa medida na superfície: `orleans-brandao` tem zero ocorrências do
  marcador, enquanto outras fichas têm uma ou duas. Ele só era emitido quando
  `historico.length > 0`, e o perfil novo não tem trajetória.
- A correção emite o marcador com `0`, nas rotas direta e diferida. Ficha sem
  trajetória passa a DECLARAR zero, em vez de ficar silenciosa para quem lê o
  DOM, que é a mesma regra que o projeto aplica ao dado.
- Provas: teste de componente novo com vermelho antes do verde (2 de 3 falham
  sem a correção), suíte 3.048/3.048, typecheck, lint e dead-code.

## Snapshot 12/08/2026: Fase 4 vence os readbacks e para por chave anônima ausente

- A PR #183 foi mergeada em `main` e publicada no SHA
  `0172b849934d9cb63c7787fc17c130a164fe3746`.
- A Fase 4, run `31641356334`, foi a mais longe de todas: passou o ledger gate,
  os **24 readbacks canônicos**, o readback de destaques (as duas células
  silenciosas do Orleans sumiram) e o de honestidade da superfície, este com
  `fichasAfetadas: []`.
- Parou no passo seguinte, o readback do universo de financiamento, com
  `Missing SUPABASE_URL/SUPABASE_ANON_KEY`. Não é defeito de dado nem de prova:
  o workflow passava `SUPABASE_SERVICE_ROLE_KEY` mas não a chave anônima, e essa
  etapa lê a superfície **como o público lê**, de propósito.
- O secret `SUPABASE_ANON_KEY` já existe no repositório e já é usado assim em
  `data-quality.yml`. A correção passa a env para o job e acrescenta a chave à
  validação de secrets, para a falta ser detectada no primeiro passo em vez de
  depois dos 24 readbacks.
- Nenhuma migration, coleta ou cron. Ledger segue em 395, topo
  `20260812125000`.

## Snapshot 12/08/2026: 20260812125000 aplicada, e o pin de topo saiu do readback

- A PR #182 foi mergeada em `main` e publicada no SHA
  `8f5e13c016f77718d4e1c25a99d5f9d19f9e9557`.
- A `20260812125000` foi aplicada em produção pelo caminho canônico, com a linha
  do ledger na mesma transação e `md5(statements[1])` igual ao arquivo. Ledger
  em 395, topo `20260812125000`, zero linhas degradadas.
- Efeito conferido: as duas chaves inventadas sumiram do banco e as 194 fichas
  públicas passaram a ter proveniência de sanções, contra 193 antes.
- A Fase 4, run `31639498568`, parou de novo no readback da `20260812123000`,
  pelo mesmo pin de topo: a correção anterior aceitava dois topos nomeados e a
  `125000` criou um terceiro estado legítimo.
- A varredura dos 24 readbacks contra produção isola o problema: 23 passam e só
  este falha. O pin foi removido, porque a identidade do ledger já é conferida
  pelo runner da Fase 4, com `audit:ledger:gate` mais o par (total, topo).
- Falta integrar essa correção, publicar o mesmo SHA e repetir a Fase 4.

## Snapshot 12/08/2026: PR #181 publicada, Fase 4 parou em duas células silenciosas do Orleans

- A PR #181 foi mergeada em `main` e publicada no SHA
  `5abcb53e6f987c7d20ce9d01b9414ef5ee3a02bf`.
- A Fase 4, run `31633733621`, foi a mais longe até agora e parou na primeira
  divergência: `fichas=194/194, células=970/970, silenciosas=2/0, vazias
  honestas=29/29`. O ledger gate e os 23 readbacks canônicos passaram.
- As duas silenciosas são `orleans-brandao` em `sancoes` e `processos`. A causa
  não é prova envelhecida: a `20260812124000` gravou essas duas proveniências
  sob `destaques-sancoes` e `destaques-processos`, mas a superfície lê sanções
  de `transparencia-sanctions` e processos de `processos-curadoria`.
- Medido em produção: Orleans tem zero linhas nas duas chaves canônicas,
  `transparencia-sanctions` cobre 193 das 194 públicas e falta só ele, e as duas
  chaves inventadas existem em uma única ficha, sem nenhuma outra no banco.
- A correção `20260812125000` move apenas o campo `fonte`, preservando resultado,
  detalhe, data e execução, porque `indeterminado` já é estado honesto no DTO.
  O readback da `124000` passa a aceitar os dois estados nomeados e só eles.
- Provas: dry-run completo contra produção em transação com rollback e resíduo
  zero, harness PostgreSQL 17 com dez cenários, replay 297+103=400 medido,
  allowlist e recorte próprios, testes focais 8/8 e os contratos operacionais
  atualizados na mesma PR.
- Nada aplicado. Falta integrar, publicar o mesmo SHA, aplicar a `20260812125000`
  com ledger e readback, e repetir a Fase 4.

## Snapshot 12/08/2026: PR #180 publicada, 20260812124000 aplicada, Fase 4 parada num pin de topo

- A PR #180 foi mergeada em `main` e publicada no SHA
  `37c1c01f941af93dd1277e19cfa2355d70594298`.
- A migration `20260812124000` foi aplicada em transação com a linha do ledger.
  Produção está com 394 versões, topo `20260812124000`, zero linhas degradadas e
  `md5(statements[1])` idêntico ao arquivo do merge.
- As dez tags de cache foram revalidadas no mesmo SHA.
- A Fase 4, run `31628201963`, parou na primeira divergência: o readback da
  `20260812123000` exigia ser ele próprio o topo do ledger, o que deixou de ser
  verdade quando a `124000` entrou no mesmo ato autorizado. É contrato de prova
  envelhecido, não defeito de dado nem de permissão.
- A correção condiciona o topo aceito à presença da `20260812124000`, aceitando
  dois estados nomeados e recusando qualquer outro. A varredura dos 23 readbacks
  canônicos confirma que este era o único com pin de topo.
- Provas: 23/23 readbacks canônicos executados read-only contra produção,
  vermelho reproduzido antes do verde, harness PostgreSQL 17 focal com três
  cenários novos de ledger e testes focais 34/34.
- Nenhuma migration nova, coleta, cron ou escrita de dado. Falta integrar a
  correção, publicar o mesmo SHA e repetir a Fase 4.

## Snapshot 12/08/2026: PR #179 publicada, Fase 4 encontrou cinco células silenciosas de Orleans

- A PR #179 foi mergeada em `main` e publicada no SHA
  `b96cec8b0c338c824fdab6f2351d8ef4e8f9def7`.
- O workflow manual da Fase 4, run `31621678781`, executou no mesmo SHA e
  interrompeu no primeiro desvio real: `194/194` fichas e `970/970` células,
  mas cinco células `nunca_verificado`, todas do novo perfil
  `orleans-brandao`.
- A causa é a ordem das cargas. A `20260811101000` registrou os estados das
  194 identidades anteriores; a `20260811102100` separou o homônimo e criou o
  novo perfil público sem registrar seus cinco estados de proveniência.
- A correção local `20260812124000` grava exatamente cinco estados explícitos:
  quatro `indeterminado` e uma trajetória `sem_achado_no_escopo`. Ela exige a
  identidade nominal e o ledger do split, não copia dado do governador e não
  fabrica ausência.
- Provas locais: 3.037/3.037 testes, build, 17 harnesses PostgreSQL 17, replay
  297+102=399, schema 74+325=399, typecheck, lint, Settings e allowlist verdes.
- A migration não foi aplicada e a Fase 4 não foi repetida. Nenhum item da
  matriz foi promovido a verde. O próximo ato externo é integrar a correção,
  aplicar somente `20260812124000` com ledger/readback e repetir cache/Fase 4.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Snapshot 12/08/2026: produção no SHA da PR #178, Fase 4 parada em 121000

- A PR #178 foi mergeada em `main` e publicada no SHA
  `eca104f4910a4a1398716ea10f4ac8d3e82d0e1c`.
- A Fase 4 manual, run `31609453915`, executou no mesmo SHA e parou na primeira
  divergência, no readback `20260810121000`: três estados, três payloads e três
  alvos `nao_coletado`, com as coortes globais preservadas em 141
  financiamentos, 94 verificações e 235 logs.
- A causa é temporal, não um defeito de dados. A migration
  `20260811102100` separou o governador Carlos Brandão do pré-candidato Orleans
  Brandão e transferiu o slug público. Os três pleitos históricos continuam
  corretamente ligados ao UUID do governador arquivado.
- A correção local resolve o manifesto por identidade nominal e UUID, preserva
  o slug como caminho normal e só aceita o fallback histórico quando a
  migration de divisão está no ledger. O harness PostgreSQL 17, os testes
  focados e a leitura read-only de produção passaram; adulterar a identidade
  faz o readback abortar.
- Nenhuma migration, coleta ou cron foi executado. Nenhum item da matriz foi
  promovido a verde. Falta integrar, publicar o mesmo SHA e repetir a Fase 4.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Snapshot 12/08/2026: produção no SHA da PR #177, Fase 4 parada em 120000

- `main`, produção e `/api/deployment-info` coincidem em
  `f0f5b391dc42a37675179b344f6d7fbce59e5a31`.
- O ledger tem 393 versões e topo `20260812123000`. A linha do topo agora tem
  nome e statement byte a byte iguais à migration versionada, com MD5
  `ed32564d8f0398e3ba12c6da1fcc0819`.
- A Fase 4 manual, run `31606691534`, parou na primeira divergência. O readback
  de schema `20260810120000` ainda exigia zero linhas, mas a carga posterior
  `20260810121000` deixa corretamente 94 verificações, 57 ausências oficiais e
  37 erros.
- A correção local faz o contrato distinguir os estados antes e depois da
  `121000`, preservando cardinalidade exata e as validações de schema,
  exclusividade e payload. O harness PostgreSQL 17 e o readback read-only em
  produção passaram. Falta integrar, publicar o mesmo SHA e repetir a Fase 4.
- Nenhuma migration nova, coleta ou cron foi executado. Nenhum item da matriz
  foi promovido a verde neste snapshot.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Snapshot 11/08/2026: release interrompido no primeiro readback divergente

- `rc-lancamento` está em `84b8a47c76d456d3cc5fb4cca71851c02ddfc59c`, após
  a PR #167. `main` e o deploy continuam em `7e3e416`.
- Dois backups frescos foram confirmados nos runs `31521051342` e
  `31521500098`; o segundo ocorreu imediatamente antes da despublicação de
  votações.
- Nove migrations autorizadas foram aplicadas, de `20260809070000` até
  `20260810120500`. Ledger: 380 versões, topo `20260810120500`.
- O readback da `20260810120500` passou. O readback repetido da `120000`
  recusou os grants `EXECUTE` explícitos e redundantes que o Supabase acrescentou
  às duas trigger functions. A execução parou antes da `20260810121000`, sem
  carga na tabela nova: `financiamento_verificacoes=0`, view pública=0 e
  `financiamento=651`.
- A correção local é a migration adicional `20260810120600`, com readback,
  rollback e prova PostgreSQL 17 que reproduz os seis grants diretos, preserva
  o default semântico `PUBLIC + owner` e fecha a ordem reversa completa. Gates
  locais: 3.003/3.003 testes, 15/15 provas PG17, replay 295 + 100 = 395 e
  schema 72 + 323 = 395, com o hash canônico preservado. Ela não foi aplicada;
  continuação, rollback, merge em `main`, deploy, coleta e cron seguem não
  autorizados. A implementação foi integrada ao RC pela PR #167.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

- O executor único da Fase 4 está preparado em branch isolada e ainda não foi
  integrado. Ele vincula checkout limpo, SHA completo, projeto Supabase,
  ledger integral, 21 readbacks, site de produção, 194 fichas em desktop e
  mobile e 970 células sem estado silencioso. O harness adversarial executável
  passou em 17/17 testes executáveis e a suíte integral integrada em
  3.027/3.027 testes.
  A remedição sem cache também expôs cinco fichas com timeline partidária
  degradada. A correção global está preparada na PR #168, com 639/639 SQs
  auditados e duas migrations ainda não aplicadas. Orleans Brandão foi separado
  do governador homônimo, preserva o universo público de 194 com declaração de
  pré-candidatura rastreável, `cargo_atual` nulo e fontes oficiais para o cargo
  exercido e a exoneração. A Fase 4 continua falhando fechada até integração,
  aplicação, deploy e readback.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Snapshot 11/08/2026: PF Ajustes 1 a 17 prontos localmente, não verdes

- A matriz canônica está em
  `QA/2026-08-10-matriz-17-itens.md`. O item 18 permanece adiado.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Os lotes judiciais 69/21 e 66/25 e o TSE-8 foram aprovados editorialmente e
  estão em migrations aplicáveis, mas nenhuma foi executada. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Os quatro resíduos reabertos foram tratados globalmente: itens 4 e 14 têm
  970/970 células com estado, fonte, identidade, tentativa e payload, projetando
  zero `nunca_verificado`, zero célula sem payload e zero conteúdo sem endpoint
  externo; item 7 reconciliou 13 linhas e 81
  pares do Senado em 6 eventos e 75 pares; item 11 comparou o conteúdo integral
  do DTO e do DOM em 194 fichas, desktop e mobile. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- A projeção final dos destaques persiste 292 estados residuais: 80 de
  trajetória, 32 de patrimônio e 180 de votações, sendo 241
  `indeterminado` e 51 `sem_achado_no_escopo`. Depois das cargas de votações,
  o universo termina em 14 fichas com conteúdo, 28 com resultado limitado e
  152 indeterminadas. As migrations `20260811101100` e `20260811101200`
  corrigem, respectivamente, a proveniência oficial de Cadu Xavier e Ricardo
  Cappelli e seis processos legados, dos quais cinco recebem identificação e
  fonte oficial e um é despublicado com bloqueio editorial indeterminado.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- O RC remoto final está em `7bd30e3`, depois dos merges autorizados das PRs
  #160, #163 e #164. As PRs #157, #158, #159 e #161 foram fechadas como
  superadas, sem merge. A PR #156 continua aberta contra `main`.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Gates no SHA final: 2.997/2.997 testes; replay 293 + 100 = 393; schema
  70 + 323 = 393; 13/13 provas PostgreSQL 17 cobrindo as 17 migrations.
  Typecheck, check de scripts, lint, Settings, build Turbopack, CodeQL e CI
  remoto passaram. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Não houve aplicação de migration, coleta com escrita, merge em `main`, deploy
  ou ativação de cron. Os atos que ainda exigem autorização estão em
  `QA/2026-08-11-autorizacoes-release-pf-ajustes.md`. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

O restante deste arquivo preserva os snapshots anteriores como histórico.

## Snapshot 09/08/2026: os dois perfis da B2 que a etapa 9 não alcançou

Migration de curadoria **criada e provada, não aplicada**:
`20260809070000_verificacao_campos_b2_cleber_gilberto.sql`, com allowlist em
`scripts/audit/allowlist-verificacao-campos-b2-20260809.json` e rollback em
`supabase/rollback/`.

- **O diagnóstico anterior estava errado, e a leitura do banco é que mostrou.**
  A pendência registrada acima dizia que `cleber-rabelo` e `gilberto-vasconcelos`
  tinham `social_networks` em `null` no banco. Medido em produção em 09/08:
  `select count(*) ... where verificacao_campos -> 'social_networks' = 'null'::jsonb`
  dá **0 em 280 linhas**, e os dois slugs estão com `verificacao_campos = '{}'`.
  O `null` nunca chegou lá porque a migration que o carregava,
  `20260807052000`, está **retida e ausente do ledger**. O defeito de escrita foi
  corrigido na origem antes de a saída defeituosa ser aplicada.
- **O buraco real é o oposto de um `null` a trocar.** As duas fichas não têm
  verificação de campo nenhuma, enquanto o ledger da B2 (SHA-256 `78dec978…`)
  prova as três frentes TSE consultadas para elas em `2026-08-06`. Ficaram de
  fora da etapa 9 porque aquele universo sai de `data/identidade-etapa2-2026.json`,
  o recorte dos 71 perfis **sem** casamento seguro, e estes dois nunca estiveram
  lá: a identidade deles já era segura pelo SQ do próprio ledger da B2.
- **Por isso a migration escreve as três chaves, não uma.** Corrigir só
  `social_networks` deixaria `resolverFrescorTsePerfil` em `parcial`, que não
  produz data nenhuma: seria uma aplicação em produção para não mudar nada.
- **O efeito no selo é menor do que a pendência prometia, e isso foi medido.**
  Simulando `buildSectionFreshness` com os valores reais de produção:

  | Slug | Selo antes | Selo depois |
  |---|---|---|
  | `cleber-rabelo` | Curadoria de processos, 05/08/2026 | **inalterado** |
  | `gilberto-vasconcelos` | Sanções: CEIS, CNEP e CEAF, 05/08/2026 | **TSE candidaturas 2026, 06/08/2026** |

  Nenhum dos dois exibia "Perfil factual curado". E o de `cleber-rabelo` não
  muda porque a coleta `processos-curadoria` dele é de `2026-08-06T00:47:20Z`,
  47 minutos mais recente que a data de calendário do TSE ancorada em meia-noite
  UTC. O selo escolhe a candidata **mais recente**: é o contrato funcionando, não
  defeito. O ganho dele é de cobertura, não de selo: as três frentes TSE saem de
  `ausente` para `completa`.
- **`ultima_atualizacao` não é tocada, de propósito.** Nenhum campo da ficha
  mudou, só o carimbo de verificação. Além de ser falso, bumpar para `now()`
  poria "Perfil factual curado" em 09/08 na frente da data TSE de 06/08 e
  esconderia exatamente o selo que a correção existe para expor.
- **Revisão independente achou dois bloqueios na primeira versão, e os dois
  procediam.** Corrigidos e provados em Postgres antes de qualquer outra coisa:
  - **Presença parcial virava no-op bem-sucedido.** O guard usava
    `HAVING count(*) = 2`, então UMA ficha presente também devolvia `NULL` e a
    migration retornava sem erro: a transação externa gravaria a linha do ledger
    e a ficha existente ficaria sem correção para sempre. Agora zero fichas é
    no-op e uma ficha **aborta**.
  - **`jsonb ||` não é monotônico.** Reproduzido em Postgres 17:
    `'{"social_networks":"2026-09-01"}' || '{"social_networks":"2026-08-06"}'`
    devolve `2026-08-06`. A migration rebaixaria verificação mais nova. Agora
    uma pré-condição **aborta** diante de frente TSE já datada com valor
    diferente de `2026-08-06`; valor igual continua sendo no-op idempotente.
- **O dry-run virou gate executável e versionado.** Os nove testes anteriores
  eram estáticos e ficavam **verdes com os dois defeitos dentro do arquivo**:
  asserção sobre texto de SQL não julga guard. `scripts/audit/provar-migration-b2.sh`
  (`npm run audit:b2:provar`, no workflow `replay-migrations.yml`) roda oito
  ramos contra Postgres 17, fail-closed, e foi **verificado vermelho contra cada
  um dos dois defeitos**, restaurados um de cada vez.
- **A migration passou a falhar o replay linear, e isso é o guard funcionando.**
  As três migrations que inserem `cleber-rabelo` falham no replay e a que insere
  `gilberto-vasconcelos` aplica, então o banco do replay fica com **uma** das
  duas fichas e a presença parcial aborta. `--gate` mede **290 aplicadas e 87
  falhas**, com a entrada nova declarada e motivada em
  `falhas-replay-linear.json`. Produção tem as duas fichas, medido em 09/08.
- **O `--gate` ganhou invariante de conservação:** `aplicadas + falhas únicas =
  total de migrations do diretório` (290 + 87 = 377). Antes os dois números eram
  conferidos separadamente e nenhum enxergava migration **pulada**: um filtro que
  deixasse arquivos de fora sairia como "290 aplicadas, 87 falhas" com o
  diretório em 400 e o gate aprovaria. Falha repetida na lista bruta também
  reprova, para a deduplicação não esconder arquivo replayado duas vezes.
- **Demais provas,** em leitura somente ou container efêmero: allowlist do
  recorte OK (2 writes declarados, 0 violações); classificação `curadoria`,
  `mista: false`.
- **Não aplicada, não commitada e não mergeada.** Os três atos dependem de
  autorização que nomeie o ato.

## Snapshot 09/08/2026: data de calendário deixa de recuar um dia no selo

Correção de código, sem migration e sem escrita no banco. O dado gravado sempre
esteve certo; quem errava era a exibição.

- **Medido em produção em 09/08/2026:** com `2026-08-09` gravado nas três frentes
  TSE, as **12 fichas materializadas** exibiam `Perfil verificado em 08/08/2026
  (TSE candidaturas 2026)`. A causa é uma conversão a mais: `validarDataDeVerificacao`
  ancora data pura em meia-noite UTC de propósito, `resolverFrescorTsePerfil`
  devolvia só um `Date`, e o formatador público usa `America/Sao_Paulo`, que
  recua três horas e cai no dia anterior.
- **O que mudou:** o resolvedor devolve o par `{bruto, instante}` já existente no
  contrato. `instante` continua governando comparação e idade; `bruto` alimenta a
  exibição, e `formatDate` já trata string data-pura como data de calendário e
  timestamp com fuso como instante. Nenhuma regra de promoção do selo mudou.
- **Mesmo defeito no selo de votações, corrigido junto.** `votacoes_chave.data_votacao`
  é coluna `DATE`, e a mensagem passava pelo `Date` enquanto a lista de votos
  renderizava a string crua: as duas superfícies discordavam em um dia. Medido em
  `sergio-moro-gov-pr`, cujo voto mais recente é `2023-12-15`, o selo dizia 14/12.
- **Verificado contra o Supabase real, servidor local:** as seis fichas conferidas
  passam a exibir `09/08/2026` nas do caminho TSE (`felicio-ramuth`, `eduardo-paes`,
  `sergio-moro-gov-pr`, `daniel-vilela`, `hertz-dias`, `gabriel-souza`), e o caminho
  curado fica inalterado em `09/06/2026` (`acm-neto`), igual ao readback anterior.
- **Regressão coberta por teste que falha sem a correção:** o par data pura contra
  timestamp com fuso vive em `tests/verificacao-campos-frescor.test.ts`, e a guarda
  de forma contra o `Date` voltar à exibição está em `tests/freshness-window.test.ts`.
  Gates: `npm test` passa com 2466 testes, `typecheck` e `lint` limpos. `check:dead-code`
  reprova com as mesmas 4 devDependencies do estado anterior, sem relação com esta
  mudança.

## Snapshot 09/08/2026 (noite, 2): chave independente e frescor por última verificação

Duas mudanças de contrato, pedidas pelo dono, medidas antes de escrever.

- **`contrato.criterio_identidade` mudou, e por isso está registrado aqui**, como
  o próprio registro exige. A confirmação passou a ter dois caminhos: o antigo
  (nome civil + urna + cargo + UF) e a **chave independente** já prevista no
  texto original: nome civil 1:1 ou subconjunto, mais cargo, UF e **data de
  nascimento idêntica** à do nosso cadastro, com **hit único**. Registro na
  **versão 2**, `match_fresco` de 12 para **22**, `revisao_identidade` de 12 para
  **2**. Hash de diagnóstico `fc3e2235…` → `c08b3ef0…`; o de slugs **não mudou**,
  e não mudar é a prova de que a promoção reclassificou sem mexer no universo.
- **A chave não é circular, e isso é o ponto.** As datas vivem em
  `data/identidade-etapa2-nascimentos.json` com proveniência por slug, e toda
  proveniência é anterior ao pleito conferido (`consulta_cand` 2018/2020/2022/2024,
  DivulgaCandContas de ciclos passados, curadoria). Conferir 2026 com dado
  extraído do próprio snapshot 2026 seria a repetição do defeito que derrubou a
  rota 2 do backfill de CPF. `camila-falcao` e `witer-naves` seguem bloqueadas
  porque não têm data no cadastro, e o gerador reprova entrada sem proveniência.
- **O selo do bloco "Perfil atual" mudou de pergunta.** Antes respondia "quando o
  perfil foi verificado" olhando só `verificacao_campos` e `ultima_atualizacao`.
  Agora responde **"quando qualquer dado deste perfil foi verificado pela última
  vez"**, considerando também as consultas de sanções (CEIS, CNEP, CEAF) e a
  curadoria de processos, que a ficha já exibia em outras seções. Copy novo:
  `Dados do perfil verificados pela última vez em <data> (<fonte>).`
- **Consulta que falhou nunca vira selo.** Só `encontrado` e `vazio_confirmado`
  entram na disputa; `erro`, `indeterminado` e `nao_aplicavel` ficam de fora, pelo
  mesmo princípio de `ESTADOS_QUE_AVANCAM_FRESCOR`. Vence a data **mais recente**,
  assimetria deliberada com `resolverFrescorTsePerfil` (que escolhe a mais antiga
  porque as três frentes TSE compõem um atributo só).
- **Materializador idempotente:** 22 planejados, **12 pulados** (patch idêntico),
  **10 escritos**, com asserts de contabilidade. Reconciliação pós-escrita: 22
  linhas de domínio, 22 de trilha, zero órfã nos dois sentidos.
- Gates: `npm test` **2482 pass / 0 fail**, lint (1 aviso preexistente em
  `.firecrawl/`), typecheck, `check:dead-code`, `validate:seed` (271),
  `settings:check`, `build`, todos verdes.

### Dois achados sobre a recoleta de sanções, medidos e não resolvidos aqui

Foi autorizado recoletar as sanções das 30 fichas com `erro` de 05/08. A
recoleta **não foi feita**, e por dois motivos que valem mais registrados do
que a rodada valeria:

1. **`ingest.yml` não consegue recoletar sanções.** A fonte que persiste chama-se
   `sancoes` (`ingestTransparenciaSanctions`), e ela **não está na allowlist** do
   workflow (`camara|senado|tse|transparencia|google-news`). A fonte
   `transparencia`, que está na allowlist e foi a disparada, é um **stub
   declarado**: consulta a API e não persiste nada. O run 31336467753 saiu
   `success` sem escrever uma linha, e `coleta_log_ultima` ficou idêntico
   (30 `erro`, topo 05/08). Workflow verde não é prova de trabalho feito.

   **Corrigido na trilha B em 10/08/2026** (branch `trilha-b`, não mergeado
   quando este parágrafo foi escrito): `sancoes` entrou no input, na condição do
   job e no `case` da allowlist de `ingest.yml`. O achado 2 continua valendo, e é
   ele que decide se a recoleta rende alguma coisa.
2. **Os 30 `erro` não são falha de API.** O `detalhe` é o mesmo nos 30:
   **"sem CPF: nenhum cadastro foi consultado"**. O Portal exige CPF, e essas
   fichas não têm. Rodar de novo reescreveria os mesmos 30 erros. O que
   destravaria é backfill de CPF (`scripts/backfill-cpf-tse.ts`), que é trabalho
   de identidade com risco próprio, fora do escopo desta rodada.

   **Confirmado por caminho independente em 10/08/2026**, no dry-run do universo
   da trilha B: 194 fichas, 30 em `erro`, **os 30 por ausência de CPF** (cruzado
   com leitura de `candidatos.cpf` validada por `cpfEhValido`), 163
   `vazio_confirmado` e 1 `encontrado` (`jose-roberto-arruda`, 2 sanções CEIS
   ativas do TJDFT). A conclusão do achado 2 fica mais forte, não mais fraca:
   com a allowlist corrigida, a recoleta rende **2 linhas** e reescreve os mesmos
   30 erros enquanto o CPF não existir.

Consequência para a superfície: `augusto-cury`, `natasha-slhessarenko`,
`ricardo-cappelli`, `andre-luis`, `jarir-pereira` e `lais-chaud` continuam
exibindo data de junho, e isso está **correto**: ninguém verificou dado nenhum
deles desde então. O selo novo diz a verdade em vez de esconder a lacuna.

## Snapshot 09/08/2026 (noite): 20260809060000 aplicada e etapas 9 a 12 executadas

Autorização nomeada do dono na mesma conversa: aplicar a `20260809060000` e
rodar as etapas 9 a 12 para os 12 `match_fresco`. Supersede a frase "continuam
dependendo de confirmação nomeada" do snapshot anterior.

- **R1 aplicada pelo caminho canônico** (o mesmo da `20260809052600`): sonda de
  canal em `BEGIN … ROLLBACK`, dry-run da migration inteira mais a linha do
  ledger com gate `DO` fail-closed dentro da transação, prova de
  não-persistência (370/`20260809052600`/coluna 0 após rollback), aplicação de
  DDL mais `INSERT` no ledger na MESMA transação. Ledger foi de **370 para
  371**, topo `20260809060000`, `statements` sem comentários no formato da
  precedente, `created_by` do dono. `audit:ledger:gate` com a lista remota
  pós-aplicação: **"ledger e repositório contam a mesma história"**, cinco
  retidas reconhecidas.
- **Etapa 9:** `scripts/materializar-etapa9-tse-12.ts` (novo), universo derivado
  do registro versionado (nunca lista digitada), porta
  `exigirMaterializacaoTse2026` por slug, data carimbada = `decidido_em` do
  registro (`2026-08-09`), `social_networks` de `felicio-ramuth`
  (`social_count: 0`) gravada como `vazio_confirmado` pelo precedente de
  `cleber-rabelo`. Dry-run conferido antes; `--apply` escreveu **12 de 12**,
  cada escrita com exatamente 1 linha tocada, via `escreverAuditado()`.
- **Etapa 10:** reconciliação em produção: 12 linhas de domínio com o patch
  exato, 12 linhas de trilha (`natureza='escrita'`,
  `fonte='escrita:materializar-etapa9-tse-12'`), volume 12, conjuntos de slugs
  idênticos nos dois sentidos (0 domínio sem trilha, 0 trilha sem domínio).
- **Etapa 11:** tags de ficha revalidadas via workflow manual
  `revalidate-cache.yml` (run 31335012032, success). Readback público dos 83:
  **12 em `current` com "Perfil verificado em 08/08/2026 (TSE candidaturas
  2026)"**, os 71 restantes intactos nas datas curadas anteriores, zero falhas.
  Evidência em `output/pf-reverificacao-20260809/etapa-11-readback.json`.
- **Defeito de exibição anotado, não corrigido aqui:** data-só (`YYYY-MM-DD`) em
  `verificacao_campos` é ancorada em meia-noite UTC pelo contrato, e
  `formatDate` no caminho `Date` formata em `America/Sao_Paulo`, então o site
  exibe **um dia antes** do valor gravado (gravado 09/08, exibido 08/08). O
  valor exibido coincide com a data do snapshot do TSE, então não há mentira na
  superfície, mas o leitor (`src/lib/api.ts`) deveria preservar a semântica de
  data de calendário em vez de converter por instante. Corrigir exige deploy.
- **Etapa 12:** `audit:cobertura` reexecutado contra produção, 194 publicáveis,
  snapshot novo gravado. Recheque dos 43 `nao_localizado` continua **impossível
  antes de 15/08 às 19h** (janela de registro do TSE); procedimento e prazo no
  registro da etapa 2.

## Snapshot 09/08/2026: proteção da etapa 2, contrato de frescor e schema puro

Trabalho **inteiramente local**. Nenhuma migration foi aplicada, nada foi escrito
no banco, nenhum cache foi invalidado, nada foi publicado, e não houve commit,
push, PR, merge ou deploy. A aplicação da `20260809060000` e as etapas 9 a 12
continuam dependendo de confirmação nomeada.

- **A decisão de identidade da etapa 2 saiu de `output/` e virou gate de CI.**
  As 71 entradas viraram `data/identidade-etapa2-2026.json`, com parser
  fail-closed em `scripts/lib/identidade-etapa2.ts` e consumidor real em
  `npm run validate:seed`, que roda em todo PR. A classificação é
  **12 `match_fresco` / 12 `revisao_identidade` / 1 `conflito_cargo_uf` /
  1 `registro_encontrado_outro_cargo` / 2 `proxima_possivel_urna` /
  43 `nao_localizado_pelos_matchers`**, e só `match_fresco` promove chave.
  A cascata foi portada para `scripts/lib/identidade-etapa2-classificador.ts`, e
  o porte é validado por reprodução **byte a byte** dos dois hashes da execução
  original: `fc3e2235…3f8d1cf7` (diagnóstico) e `c059935…22bcff9` (conjunto de
  slugs). O teste antigo em `output/` tinha quatro furos medidos: laço de
  contenção de forma vacuous-pass, nenhuma afirmação de que `match_fresco` tem
  chave, nenhuma contagem afirmada, e hashes conferidos contra o arquivo que o
  próprio script acabara de reescrever.
- **Pendência temporal real, com desarme:** os 43 não localizados foram medidos
  contra o snapshot do TSE de 08/08, com a janela de pedidos de registro aberta
  até **15/08 às 19h**. O registro declara `revalidar_ate: 2026-08-16`, o
  responsável e os três comandos. Depois dessa data,
  `exigirMaterializacaoTse2026()` deixa de promover chave e a mensagem traz o
  procedimento. O prazo morde **na porta de materialização, não em `npm test`**:
  um gate que reprovasse o repositório inteiro por causa da janela do TSE seria
  desligado na primeira sexta-feira. A aquisição da fonte oficial virou
  `scripts/audit/fetch-tse-fontes-2026.ts`, então a renovação roda em checkout
  limpo. Nenhum recheque pós-15/08 foi simulado.
- **`verificacao_campos` ganhou contrato, no leitor e no escritor.**
  `src/lib/verificacao-campos.ts` é o único lugar que decide o que vira data.
  Só `publicado` e `vazio_confirmado` carimbam; os demais estados produzem
  **chave ausente**, que é o que preserva a data anterior, porque o merge é
  `COALESCE(...) || patch` e em jsonb o `||` com null **sobrescreve**. O
  agregado do perfil só avança com as três frentes TSE resolvidas, e avança pela
  data **mais antiga**; antes disso, `buildSectionFreshness` pegava a mais
  recente de qualquer campo, então verificação parcial promovia o perfil inteiro.
- **Defeito de escrita encontrado e corrigido na origem.** O gerador lia
  `source_verification_dates.proposed_value` e emitia o mapa verbatim. Medição
  das 194 linhas: 43 com as três frentes datadas, 149 com nenhuma, e **2**
  (`cleber-rabelo`, `gilberto-vasconcelos`) com `social_networks` em `null`
  apesar de `no_row_for_safe_sq` com zero linhas, que é `vazio_confirmado` e
  merece data. O gerador foi portado para `.ts`, ligado ao contrato, e agora
  emite certo; regenerado sobre o ledger real, o diff é cirúrgico: zero coluna
  não-jsonb alterada, zero valor preexistente alterado, **837 nulls → 0**, e só
  esses 2 slugs mudam de conjunto de chaves.
  O gerador também **deixou de emitir schema**: ele ainda carregava
  `ALTER TABLE`, `GRANT` e um `CREATE OR REPLACE VIEW` completo, então uma
  regeneração futura produziria migration **mista** de novo, contra a issue #136,
  além de manter uma quarta cópia da definição da view.
  **Pendência endereçada em 09/08/2026, e o diagnóstico mudou na medição.** Ver
  a seção "Os dois perfis da B2 que a etapa 9 não alcançou", abaixo: o `null`
  nunca chegou ao banco, porque a `20260807052000` nunca foi aplicada. O buraco
  real é outro e a correção é outra.
- **Migration de schema puro criada, não aplicada.**
  `20260809060000_verificacao_campos_schema_publico.sql` cria a coluna, o
  `GRANT SELECT` de coluna e recria `candidatos_publico` a partir da definição de
  registro (`20260803142851`), com a coluna nova **no fim** da lista. Zero DML,
  zero `@write`. Classificada `schema`, `mista: false`.
  `tests/candidatos-publico-view-contrato.test.ts` confere a derivação por parse,
  para deixar de depender de leitura humana.

### Replay remedido em 09/08/2026, com a migration nova no repositório

| Modo | Antes | Agora |
|---|---|---|
| `classificar` | 375 total, 50 schema, 25 mistas | **376 total, 51 schema, 25 mistas** |
| `--gate` (linear tolerante) | 289 aplicadas, 86 falhas | **290 aplicadas, 86 falhas**, conjunto bate |
| `--schema-gate` | 66 aplicadas, 0 falhas | **67 aplicadas, 309 puladas, 0 falhas** |
| hash do `pg_dump` | `f267becc…5a96378a` | **`e95b2aa2…91c1a3e9`** |
| `--comparar` | 165 CREATEs, 2 deltas conhecidos | **165 CREATEs, conhecidos=2, inesperados=0, faltantes=0** |

Baselines atualizadas com o valor **medido**, não estimado:
`schema_dump_sha256`, `MEDICAO_REPLAY.schemaReplayTamanho` (66→67),
`ddlSetTamanho` (73→74), `compararCreatesComparados` (159→165, defasagem
anterior a esta mudança) e `falhas-replay-linear.json.aplicadas_esperadas`
(289→290).

### Gatilho datado que ninguém deve descobrir tarde

Com o agregado promovendo pela data mais antiga, as 43 fichas com as três
frentes TSE resolvidas em `2026-08-06` cruzam a janela de 75 dias
(`PROFILE_FRESHNESS_WINDOW_DAYS`) **juntas, por volta de 20/10/2026**, se o TSE
não for reverificado antes. É um penhasco, não uma rampa.

### Revisão independente reprovou a primeira autorização, e os 6 achados procediam

Segunda rodada de 09/08. A autorização anterior foi **bloqueada**, e cada achado
foi reproduzido antes de corrigir:

1. **Migration untracked.** Aplicar criaria versão remota sem arquivo na `main`,
   que é a regra R1 de `scripts/audit/lib/ledger-guard.ts`, ou seja a issue #131
   de novo. Versionar virou pré-condição nomeada; a autorização atual cobre só commit, push e abertura de PR.
2. **`BEGIN`/`COMMIT` internos** encerrariam a transação externa antes da
   gravação do ledger. Removidos.
3. **Rollback não executava.** `CREATE OR REPLACE VIEW` não remove coluna:
   `ERROR: cannot drop columns from view`, medido em Postgres 17. Reescrito com
   `DROP … CASCADE` e recriação das três views, e **verificado por diff de
   `pg_dump` contra o schema pré-migration**.
4. **Validade da etapa 2 desligada do escritor**, e fail-open em data ilegível.
   `exigirMaterializacaoTse2026()` foi ligado ao gerador (provado por mutação: um
   registro forjado para `alysson-bezerra` barra a geração inteira), e prazo que
   não se consegue ler passou a contar como vencido.
5. **`candidate_complement` carimbava com a data de um só constituinte**, e
   comparava datas por ordem de string. Agora cada constituinte exige data
   válida, e a comparação é por instante.
6. **`2026-02-30` era aceita** e rolava para 02/03. Validação estrita de ISO e de
   calendário real.
7. **`PF_B2_SEM_CARDINALIDADE`** desligava, com uma variável de ambiente, o guard
   de contagem **e** o de SQ divergente contra o seed. Removido: a fixture é
   reconhecida pelo caminho, e o gate de identidade não tem exceção de teste.

### Terceira rodada da revisão independente: mais seis bloqueios, todos procedentes

A segunda autorização também foi bloqueada, e de novo com razão:

1. **Timestamp sem fuso era aceito.** Medido: `2026-08-06T23:30:00` dava
   `1786059000000` em UTC e `1786069800000` em America/Sao_Paulo. Fuso passou a
   ser obrigatório quando há hora.
2. **Rollback estava incompleto**, com `DROP COLUMN` comentado, sem `REVOKE` e
   sem reconciliar o ledger. Agora é literal: guarda fail-closed dentro do SQL,
   `REVOKE`, `DROP COLUMN` e `DELETE` da versão no ledger. Executado nos dois
   ramos em Postgres 17: com dado gravado **aborta**; com a coluna vazia, o
   `pg_dump` resultante fica idêntico ao do conjunto sem a migration.
3. **O bypass tinha só mudado de forma:** qualquer arquivo sob
   `tests/fixtures/` desligava cardinalidade e comparação de SQ. A cardinalidade
   passou a ser amarrada ao **SHA-256 do ledger congelado**, e a comparação de
   SQ contra o seed roda sempre, para qualquer ledger.
4. **A renovação não rodava em checkout limpo**, porque dependia de três
   artefatos gitignorados que o fetch não reconstrói. O modo `--reclassificar`
   reaproveita os perfis já congelados no registro; provado escondendo os três
   artefatos e reproduzindo os mesmos hashes.
5. **As cinco retidas não tinham congelamento por hash**, apesar de a
   documentação afirmar proteção byte a byte. Congeladas em
   `scripts/audit/migrations-retidas.json`, com o gate provado por mutação.
6. **Dois testes sobredeclaravam.** O que dizia "fila real" rodava sobre 5
   fixtures sintéticas, e virou uma prova versionada sobre os 271 slugs do seed;
   o teste temporal ganhou um par cuja ordem lexical **diverge** da cronológica
   (`2026-08-07T00:30:00+03:00` é mais antigo que `2026-08-06T23:00:00Z`), então
   ele deixa de passar com ordenação de strings.

### Quarta rodada da revisão independente: mais seis, todos procedentes

1. **A renovação regravava datas fixas.** `decidido_em` e `revalidar_ate` eram
   literais, então uma renovação rodada depois de 16/08 nascia vencida. Agora são
   calculadas na execução, com `VALIDADE_EM_DIAS = 7`, e há teste que exercita o
   cálculo com o relógio em 20/08, 01/10 e 15/01/2027.
2. **Ledger com SHA divergente só avisava.** O bypass continuava de pé por
   alteração de conteúdo. O CLI passou a ser **fail-closed**, e as fixtures
   migraram para `scripts/lib/b2-perfil-builder.ts`, função pura que o teste
   chama diretamente: não há mais escape nenhum no executável.
3. **Registro com SQ cujo slug não existe no seed era excluído da comparação**,
   o que permitia materializar sem identidade canônica comparável. Agora
   **bloqueia**: não poder comparar identidade é razão para não materializar.
4. **O teste do leitor não usava ordem temporal adversarial.** Passou a usar o
   par em que a ordem lexical diverge da cronológica, nos dois lados.
5. **Rollback e sua prova viviam só em `output/`**, ignorado pelo Git, então o
   PR não preservaria o recovery que sustenta a aplicação futura. Versionados em
   `supabase/rollback/` e `scripts/audit/provar-rollback.sh`, com
   `npm run audit:rollback:provar` e gate que impede sumiço ou deriva.
6. **A interface se contradizia:** o relatório dizia "versionar e mergear" e a
   frase dizia `SEM MERGE`. Alinhada: o próximo ato autoriza **só commit, push e
   abertura de PR**.

### `audit:cobertura:allowlist` era vermelho por construção, e virou verde sem anistiar nada

Estado anterior, medido em 09/08/2026: **exit 1, 550 violações**. A composição
diz por que ninguém lia o número. **252 delas não eram defeito de migration
nenhuma**: 208 "fora da coorte"/"fora por construção" e 44 de entrada ou
referência que não casa, todas artefato de invocar o comando sem `--desde`,
sem `--ate` e sem `--allowlist`. Sem flags ele caía numa allowlist default e
conferia TODOS os recortes contra a autorização de UM. Pior: a default era
`allowlist-presidenciaveis.json`, que nasceu sem migration junto (`7e2a19e`) e
nunca governou recorte nenhum. O default foi removido.

**As duas dívidas reais foram separadas e nomeadas:**

1. **905 statements de escrita sem `@write`, em 298 arquivos** (280 anteriores à
   convenção de 02/08, 18 posteriores). Congelados por ARQUIVO em
   `scripts/audit/baseline-escritas-sem-anotacao.json`, com `sha256`. Nunca por
   total: um total quebraria no merge da próxima migration vinda de outro PR, e
   ainda diria "piorou" sem dizer onde. Arquivo novo com escrita sem anotação
   reprova, arquivo do baseline editado reprova, entrada obsoleta reprova.
2. **13 migrations com `@write` que allowlist nenhuma autoriza.** Conferido
   rodando cada arquivo contra as doze allowlists do repositório: a melhor delas
   ainda reprova. Não é janela errada, é autorização que não existe. Declaradas
   como três recortes de dívida em `recortes.json`, impressas e nomeadas a cada
   run. Fechar exige a decisão editorial de quem aprovou, não allowlist inventada.

**E um buraco que a medição achou:** `allowlist-correcoes-claims.json` (`fda8063`)
e `allowlist-limpeza-familia-sem-mandato.json` (`a881e03`) nasceram no MESMO
commit da migration que deviam governar, e as duas migrations saíram sem uma
anotação `@write` sequer. Autorização registrada no repositório, jamais conferida
contra o SQL. É a dívida mais barata da lista: 7 statements, allowlist já
aprovada. O checker agora reprova allowlist órfã, então isso não se repete.

**A dívida é congelada EXATA, não dispensada.** Cada recorte de dívida carrega o
conjunto de arquivos da janela e a impressão digital das violações. Arquivo novo
na janela, arquivo que sumiu ou violação a mais reprovam com exit 1, e o roster
de nomes que podem carregar dívida mora em `DIVIDAS_CONGELADAS`, no código do
checker, para dívida nova exigir mudança de código revisada. A primeira versão
deste trabalho errou aqui: `divida` era só uma string de motivo e o laço dava
`continue` no recorte inteiro, então a dispensa de reprovar virava a saída mais
barata para escrita que não passasse na allowlist.

Estado atual: **exit 0**, com a dívida impressa numa seção `DÍVIDA CONGELADA` que
não derruba o comando enquanto for exatamente a que foi medida. `npm test` cobre
o mapa contra a árvore, e `tests/audit-gate-divida-e2e.test.ts` sobe o processo
real contra árvore de fixture para afirmar o exit code das seis bordas
fail-closed, então migration mergeada de outro PR com `@write` e sem recorte
aparece no CI.

## Snapshot 08/08/2026: consolidação em uma branch e deploy

- **Uma branch local só, `main`.** A `codex/profiles-complete-2026` foi mergeada
  (`ae73df1`), junto com a PR #127 (`71264a9`). Dezessete branches remotas
  superadas foram apagadas, com o SHA de cada uma em
  `docs/arquivo/branches-apagadas-20260808.md`. Preservadas:
  `codex/lacunas-publicaveis-20260805`, `codex/reconciliacao-cobertura-zero`
  (PR #114) e `perf/ficha-em-cache` (PR #72).
- **Produção deixou de ser `0cf39b41`.** O deploy da consolidação subiu e a CI da
  `main` voltou a ficar verde pela primeira vez desde 06/08. O que a destravou
  foi `ec5ae2b`: o `npm audit` de produção reprovava por `nanoid <3.3.17`
  (GHSA-2v37-7h3g-55p8, severidade high), e o job `verify` é o único check
  exigido pela branch protection.
- **As 5 migrations da completude continuam fora do banco**
  (`20260807050000` a `20260807053000`). O código que as pressupõe está em
  produção e degrada com elegância: `isMissingVerificationColumnError` em
  `src/lib/api.ts` cai para `CANDIDATO_COLUMNS_LEGACY`. Estado deliberado, não
  esquecimento.
- **Correções de defeito nesta rodada:** `42703` (coluna inexistente) entrou em
  `NON_RETRYABLE_ERROR_CODES`, porque toda carga fria de ficha pagava 3
  tentativas com timeout antes do fallback que sempre funciona
  (`/candidato/lula` levava 20,9s; passou a 0,7 a 1,6s); os geradores de
  backfill de patrimônio passaram a aplicar `sanitizePublicText`, que faltava e
  fez a `20260807182000` reintroduzir marcadores `#NULO#` horas depois da
  limpeza; e `20260808032540` saneou os 9 itens que sobraram.

- **Divergência de ledger na migration dos marcadores, e o rename que a
  fechou.** Ela nasceu no repositório como `20260808010000` e foi aplicada pelo
  `apply_migration` do MCP da Management API, que carimba timestamp próprio em
  vez de usar o nome do arquivo. O banco registrou `20260808032540`, e o
  repositório passou a afirmar uma versão que nunca existiu em produção. A
  comparação entre o ledger remoto e `supabase/migrations/` na mesma data
  achou o par: 6 versões só locais e 1 só remota, sendo que a única remota tem
  o mesmo `name` e statements idênticos aos do arquivo local (md5 igual após
  normalizar comentário e espaço). As outras 5 só locais são as retidas da
  completude, divergência deliberada. O arquivo foi renomeado para
  `20260808032540`, porque quem tem razão sobre o que aconteceu é o banco;
  escrever no ledger para acomodar um nome de arquivo seria mudar produção
  para salvar o repositório. Terceiro caso do padrão da issue #131, registrado
  em `docs/arquivo/ledger-divergencia-20260808.md`.

- **O gate `@write` voltou a rodar, e agora existe guard de ledger.**
  `npm run audit:cobertura:allowlist` sem janela morria por exceção de parse. Não
  era um caso isolado: o parser rodado sobre as 373 migrations acusou quatro
  falhas distintas, e a quarta (`20260805137000`) era bug de parser de SQL, com
  `statementApos` sem entender dollar-quoting. O módulo ganhou a forma
  `chave=<literal>` para escrita endereçada por chave, que exige o literal ancorado
  no statement e joga essas escritas numa seção separada do relatório, rotulada
  como não verificável estaticamente. Anotação sem `chave=` cujo identificador não
  aparece no SQL continua reprovando. Em paralelo, `ledger-guard.yml` passou a
  comparar ledger e repositório por um invariante de três regras, com a função de
  comparação pura e coberta por 12 testes. Detalhe e verificação em
  `QA/2026-08-08-issue-131-ledger.md`.

- **Trilha de escrita de operador: código pronto, banco ainda não.** O ledger de
  migrations passou a significar apenas "migration aplicada", e escrita em
  produção fora de migration passou a exigir trilha própria. A política está em
  `Settings/WORKFLOWS.md`, seção "Escrita em produção fora de migration", e a
  decisão com as alternativas descartadas em
  `docs/arquivo/decisao-trilha-de-escrita-20260808.md`. Estado medido em 08/08,
  peça por peça:
  1. `scripts/lib/escrita-auditada.ts` existe, com 34 testes passando
     (`node --import tsx --test tests/escrita-auditada.test.ts`, 34 pass, 0
     fail). O preflight está no helper e ligado: `verificarTrilhaGravavel()`
     sonda por `select` as nove colunas de `COLUNAS_DA_TRILHA` com `limit(1)`,
     `memoizarPreflight()` resolve uma vez por processo, e `escreverAuditado()`
     injeta esse preflight de modo que o `await preflight()` roda ANTES do
     `aplicar()`. É fail-closed: reprovando, a função `aplicar` não chega a ser
     chamada.
  2. `scripts/audit/lib/escrita-auditada-gate.ts` existe, com 16 testes passando
     (`node --import tsx --test tests/escrita-auditada-gate.test.ts`, 16 pass, 0
     fail). A política está ligada ao código: o gate exporta `RECORTES_AUDITADOS`
     (hoje `scripts/` e `src/`), `TABELAS_DE_TRILHA`,
     `TABELAS_DE_ESTADO_DE_FERRAMENTA`, `PADRAO_PIPELINE_DE_COLETA`,
     `EXCECOES_DE_RUNTIME` e `EXCECOES_DE_COLETA_EM_RUNTIME`, e o teste roda a
     varredura contra o repositório com essas constantes aplicadas. Medição de
     `auditarRepositorio()` em 08/08, sobre 270 arquivos lidos: **zero
     inadimplentes**, 30 exceções confirmadas e zero obsoletas. Exceção obsoleta
     também reprova, para a lista não ficar mentindo depois que alguém consertar.
  3. `supabase/migrations/20260808120000_coleta_log_natureza_escrita.sql`
     **foi aplicada em 08/08**, por ato nomeado do dono. Ledger passou de 368
     para 369, e `20260808120000` é a última versão. Aplicada por DDL explícito
     mais a linha do ledger na MESMA transação, com a versão do nome do arquivo,
     e **não** pelo `apply_migration` do MCP: ele carimba timestamp próprio, que
     foi a causa do terceiro caso da #131. `db push` também ficou de fora, porque
     arrastaria as 5 retidas da completude. Verificado que elas continuam fora:
     zero linhas no ledger entre `20260807050000` e `20260807053000`.

     Dry-run antes: a migration inteira rodou dentro de `BEGIN … ROLLBACK` sem
     erro, e a reconferência mostrou coluna, índice e constraint com zero
     ocorrências depois do rollback. O canal foi validado antes disso com uma
     tabela-sonda que também não sobreviveu ao rollback.

     Readback pós-aplicação: `natureza` com default `'coleta'::text` e `NOT
     NULL`, CHECK em `('coleta','escrita')`, índice parcial
     `idx_coleta_log_escrita` sobre `executado_em DESC WHERE natureza =
     'escrita'`, view `coleta_log_ultima` com o filtro, `security_invoker=true`
     e comentário atualizado. As 4.922 linhas existentes ficaram como `coleta`,
     zero como `escrita`, e a view devolve 2.569 linhas. Fichas públicas de
     `lula`, `ronaldo-caiado` e `professora-dorinha` em HTTP 200. `anon` recebe
     401 na view e na tabela, com `candidatos_publico` em 200 como controle, o
     que prova que o 401 é permissão e não chave inválida.
  4. Com a migration aplicada, script migrado passa a conseguir escrever, e cada
     escrita deixa linha `natureza = 'escrita'` em `coleta_log`. Antes disso o
     preflight reprovava a rodada inteira, o que era mecânico e não disciplina.
     A ordem obrigatória de rollout está em `Settings/WORKFLOWS.md`, seção
     "Escrita em produção fora de migration".
  5. Oito scripts de operador foram migrados para o helper nesta rodada, entre
     eles `normalizar-marcadores-publicos.ts`, que é o caso 1 da própria issue
     #131, e `apply-current-factual-fixes.ts`, que tem 9079 linhas e escreve por
     default. Os outros seis: `apply-resgate-pares-duplicados.ts`,
     `backfill-cpf-tse.ts`, `backfill-historico-periodo-fim.ts`,
     `fix-party-timeline-consistency.ts`, `link-check-pontos-atencao.ts` e
     `recalc-financiamento-maiores-doadores.ts`.
  Nada disso tocou produção. O gate cobre `scripts/` e `src/`: a superfície de
  runtime entrou no recorte, e o que é escrita do próprio visitante está lá como
  exceção nomeada com motivo, não como ausência de varredura.

- **Cinco correções de durabilidade (revisão das soluções do QA, 08/08).** A
  releitura das cinco tasks olhou a forma da solução, não os números, e achou
  cinco coisas que iam doer depois:
  1. Contornar o ledger virou padrão (dois casos de escrita sem rastro). Virou a
     issue #131; depende do backup existir primeiro.
  2. O gate das 5 migrations retidas era só uma frase, e o timestamp delas é
     anterior ao de oito já aplicadas. Agora é mecânico:
     `tests/migrations-retidas-gate.test.ts` mais aviso no topo de cada arquivo.
  3. O selo `Destaque editorial` na legislação do Executivo prometia curadoria
     onde a seleção é regex de palavra-chave, e aquela tabela não tem campo
     editorial (medido: 4 de 14.061 linhas de `projetos_lei` têm curadoria real).
     Passou a `Relevância pública`, com regressão. O selo editorial de verdade
     segue na lista parlamentar, condicionado a `projeto.destaque`.
  4. A renomeação para Destaques criou dois números homônimos: a ficha conta
     todos os pontos públicos, a régua conta os visíveis menos os positivos. A
     coluna da régua passou a `Alertas (sem positivos)`, com teste de colisão.
  5. Limpeza de dado sem gate que impeça a volta. Agora existe
     `npm run audit:marcadores-tse:gate`, que reprova se `#NULO#` ou `#NE#`
     aparecer no recorte publicado.

- **Backup do banco: duas camadas, verificado em 08/08.** O Supabase já fazia
  backup físico diário (Pro), com Point in Time e Restore to new project no
  painel; a afirmação anterior de que o projeto não tinha backup nenhum era
  falsa. O workflow `backup-db.yml` passou a funcionar no mesmo dia e entrega a
  segunda camada: dump lógico cifrado, guardado fora da conta Supabase, artifact
  de 17 MB com retenção de 14 dias e verificação `pg_restore --list` dentro do
  próprio run. O projeto não usa Supabase Storage, então o aviso de que backups
  não incluem objetos de Storage não se aplica.
- **O que continua sem cobertura:** reconstruir o banco a partir do repositório.
  Nenhum dos dois backups resolve isso, e é o escopo da issue #131.

### Correções de registro (auditoria de 08/08)

Afirmações destes documentos que não se sustentaram quando reconferidas:

- "readback confirmou zero marcador restante" (`QA/2026-08-07-resumo-sessao.md`)
  era falsa duas vezes: o readback do script rodava sem o filtro dos publicados,
  e a `20260807182000` reintroduziu marcadores depois da limpeza.
- "gates verdes" e "allowlist da execução OK": `npm run audit:cobertura:allowlist`
  falha hoje em qualquer recorte, por inconsistência preexistente em
  `20260805123929`. Continua em aberto.
- Números com deriva: régua "6 faltante / 27 n/a" mede hoje 5 e 28; gate de
  identidade "643 pares" mede 645; "29 linhas com a fonte nova" não fecha em
  nenhum recorte (o padrão exato dá 27).

## Snapshot 07/08/2026: patrimônio por eleição e candidaturas na trajetória

- Delta local de 10/08, ainda não aplicado: o universo 2026 foi remedido em 32
  células contra `consulta_cand` e `bem_candidato` atuais. A migration
  `20260810093000` prepara 10 INSERT, 1 UPDATE e 10 DELETE. José Estevão passa a
  ter 1 bem, R$ 600.000,00, e Samara Mineiro 2 bens, R$ 69.196,63. Dr. Luisinho
  e Preta Lu ficam em `nao_coletado`: identidade exata e zero linhas de bens
  não provam ausência oficial porque o indicador de declaração não está
  disponível. Prova local em Postgres 17: 9 ramos PASS. Produção permanece sem
  alteração.

- Banco compartilhado: ledger reconciliado. Fantasma remoto `20260807144555`
  removido; `20260807054000` (neutralização judicial, já aplicada por fora)
  marcada no ledger. Aplicadas com allowlist fechada e readback:
  `20260807180000` (4 candidaturas oficiais nunca ingeridas: cintia-dias 2012;
  jayme-campos, jose-roberto-arruda e mailza-assis 2014), `20260807181000`
  (tabela `patrimonio_ausencia_oficial` + 48 ausências oficiais 2010-2024,
  confirmadas nos pacotes `bem_candidato` lidos de ponta a ponta, sem valor
  fabricado) e `20260807182000` (27 lacunas de bens 2006-2024 com fonte
  rastreável). Células de 2026 ficam de fora até o snapshot do TSE estabilizar.
- Migrations pendentes (pertencem ao gate de completude maior, não aplicadas):
  `20260807050000` a `20260807053000`.
- Código: eleição colapsada com posse volta a aparecer como candidatura no ano
  do pleito (81 casos ocultos pela regra de display); API pública expõe
  `patrimonio_eleicoes` por eleição aplicável (publicado, vazio_confirmado,
  nao_coletado); ficha exibe ausência oficial com fonte e data. 2.165 testes
  passando, gates verdes.
- Cobertura pós-apply (`npm run audit:cobertura`, produção read-only): índice
  médio 87,3; 39 fichas em 100; célula de patrimônio 94 ok / 67 parcial /
  6 faltante / 27 n/a; a régua agora mede patrimônio por eleição aplicável
  (>= 2006), não por presença.
- Ciclo 2026 fechado (migration `20260807183000`): 17 lacunas preenchidas com
  bens do pacote oficial `bem_candidato_2026` e 13 ausências oficiais
  registradas, todas declarando o snapshot 2026-08-04 (registros em fluxo;
  revalidar quando o TSE atualizar). Ausências oficiais totais: 61/61.
- Identidade (auditoria A2C): dos 29 slugs sem SQ no seed, 4 ganharam chave
  verificada (jose-estevao e samara-mineiro por rota CPF, SQs 2026 curados no
  seed; jarbas-soares e renan-santos em quarentena). Universo pré-2010
  auditado (2002-2008 por SQ+UF): 26 pares verificados, todos já cobertos na
  trajetória; nenhum SQ <= 2000 no seed dos publicados.
- Correção de dado falso: removidos os patrimônios 2008/2020 de jarbas-soares
  (homônimo, migração `20260807184000`); as candidaturas correspondentes já
  estavam despublicadas desde 05/08. Trilho 1 de prospecção de chaves (07/08):
  nenhuma chave nova para os bloqueados (as varreduras tse-cpf/tse-historico
  já tinham confirmado ausência em 2010-2026), mas encontrou reincidência do
  homônimo de renato-gomes (candidaturas 2008/2020 reinseridas por ingestão
  após a remoção de 05/08), removida de novo pela migração `20260807185000`.
  cadu-xavier 2020 segue corretamente despublicado.
- Causa raiz da reincidência, fechada em 08/08 (#130): a decisão de rejeitar uma
  identidade vivia só em comentário de migration, texto livre de `coleta_log` e
  na própria remoção, e remoção não deixa marca no lugar de onde a linha saiu.
  Passou a existir em `data/identidades-bloqueadas.json`, que a ingestão lê
  ANTES de escrever, em dois pontos: o índice de SQ do `tse-resolver` (o degrau
  de maior prioridade, que não degrada para os seguintes) e o laço de
  `buildSQMap` em `ingest-tse.ts`, que lê o seed direto e por isso escapava do
  primeiro. Bloqueio com SQ atinge só aquele SQ, para não apagar a candidatura
  verdadeira de juliana-brizola no mesmo ano de 2020; bloqueio sem SQ atinge o
  par (slug, ano), que é o que a decisão de renato-gomes 2008 diz. Fail-closed:
  arquivo ausente ou entrada malformada lança. Gate contra SQ bloqueado voltar
  ao seed, provado por mutação.
- Produção: commit `0cf39b41` segue no ar; dados novos revalidam sozinhos na
  janela de cache de 3600s; merge/deploy da branch
  `codex/profiles-complete-2026` permanece no gate de completude.
- Bloqueios remanescentes: 25 slugs sem rota de casamento exata, prospectados
  em fonte_dados/redes/site/coleta_log/migrations sem chave alguma; são
  pré-candidatos 2026 sem registro oficial no snapshot ou com ausência
  confirmada em 2010-2026. Destrave por re-scan pós-janela de registro do TSE
  (set/2026) ou por curadoria fornecendo uma chave oficial por pessoa.
  renan-santos com linha 2022 de homônimo em quarentena (decisão editorial);
  jarbas-soares em quarentena de identidade; rui-costa-pimenta 2002/2006 com
  UF=BR (candidaturas presidenciais, exceção estrutural da regra de UF, já
  cobertas na trajetória).

## Snapshot 06/08/2026 (anterior)

Snapshot verificado em **06/08/2026**. Este arquivo descreve o estado observado
nessa data. Reexecute os gates antes de usá-lo como prova futura.

## Código, banco e produção

| Item | Estado verificado |
|---|---|
| Pasta local canônica | `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha` |
| Branch de produção | `main` |
| Commit em produção | `0cf39b41` |
| Vercel | Deployment Ready, criado em 06/08/2026 às 13:19 BRT |
| Site | `https://puxaficha.com.br` e `/api/deployment-info` responderam no início da execução `pf-completeness-20260807T022551Z` |
| Universo público | 194 slugs únicos em `/api/candidato-slugs` |
| Coorte | 11 Presidente, 164 Governador e 19 Vice-Governador, cobrindo 27 UFs |
| Migrations | 360 locais e remotas; zero diferença de ledger |
| Checkout consolidado | Um worktree e uma branch local antes desta documentação |

## Cobertura pública

Resultado de `npm run audit:cobertura` contra produção em modo somente leitura:

- índice médio: 87,9;
- 60 fichas com índice 100;
- 134 fichas abaixo de 100;
- 191 fotos, 189 bios, 173 conjuntos de redes e 190 fichas com notícias;
- lacunas explícitas: 3 fotos, 5 bios, 21 redes, 13 patrimônios aplicáveis,
  21 financiamentos aplicáveis e 4 fichas sem notícias;
- somente 35 fichas têm votações publicadas; 11 estão sem dado aplicável e 148
  não se aplicam segundo a régua atual;
- posições do quiz: 5 completas, 6 parciais e 183 não aplicáveis.

Esses números não significam cobertura editorial completa. `partial` continua
dívida. Estados de zero precisam de procedência. A régua também documenta
limitações de aplicabilidade, qualidade de foto e dados pessoais ainda não
medidos no índice.

## O que mudou na carga de 30/07 a 06/08

O `main` recebeu 132 commits por 80 PRs mergeadas, com 431 arquivos únicos e 47
migrations únicas no intervalo reconciliado. As principais frentes que chegaram ao código integrado
foram:

- régua única de cobertura, procedência por fonte e `coleta_log_ultima`;
- gates de identidade, homônimos, CPF e `SQ_CANDIDATO`;
- ingestões históricas e normalização de cargos e partidos;
- curadoria e reconciliação de processos, sanções e outras frentes sensíveis;
- correções de patrimônio, financiamento e doadores;
- refresh de notícias com lotes, `execution_id`, cursor, recuperação e
  idempotência;
- coleta de Wikipedia/Wikidata e proteção de dados curados;
- indicadores da home ampliados para o universo publicável;
- segurança, observabilidade, cache, acessibilidade e revisão ampla do produto.

O resultado real da semana é infraestrutura de dados e muitos ganhos de
cobertura, mas não a conclusão do objetivo. As 134 fichas abaixo de 100 e as
limitações da régua provam que ainda existem lacunas. Parte do trabalho entregue
em scripts, migrations ou PRs ainda precisa de confirmação na ficha pública.

## Trabalho ainda aberto

| PR | Estado em 06/08/2026 | Leitura operacional |
|---|---|---|
| [#127](https://github.com/thiago-salvador/puxa-ficha/pull/127) | Bloqueada | Preservar redes curadas no merge de Wikidata. |
| [#114](https://github.com/thiago-salvador/puxa-ficha/pull/114) | Conflitante | Reconciliação de cobertura zero precisa ser refeita sobre o `main` atual. |
| [#72](https://github.com/thiago-salvador/puxa-ficha/pull/72) | Draft e atrasada | Cache da ficha precisa de decisão ou encerramento. |

Os checks recentes do GitHub não estavam totalmente verdes, incluindo execuções
de CodeQL e CI. Este snapshot não atribui causa sem diagnóstico específico.

### Replay de migrations e separação aditiva concluída localmente (issue #136)

`scripts/audit/replay-migrations.sh` reproduz, com custo zero e sem tocar em
produção, o que a issue mediu: **178 das 375 migrations aplicam limpo** num
Postgres vazio, e a 179ª (`20260511112000`) quebra com
`Pos-condicao eduardo-paes: 0 rows completos, esperado 339`.

Duas medições de 09/08, refeitas depois da separação aditiva e das cinco rodadas
de vistoria dos PRs #141/#142:

1. **Replay só da classe `schema` não funciona.** Para em 23 porque
   `alert_subscribers` é criada dentro de uma migration mista
   (`20260406150000`), e pular a migration pelo dado remove também a tabela.
2. **Replay do schema separado funciona inteiro, com prova por diff.** O recorte
   bruto tem 73 migrations com DDL. O conjunto efetivo tem 66: exclui as cinco
   origens mistas substituídas e as duas mistas retidas, e inclui a migration
   pura `20260809052600_schema_extraido_migrations_mistas.sql`. As 66 aplicam
   sem falha. Pelo `--comparar`, o schema continua equivalente ao do replay
   linear completo em diff de `pg_dump --schema-only` linha a linha: 165
   CREATEs com colunas, índices, constraints, policies e grants, e um único
   delta conhecido de 2 linhas (a constraint `candidatos_status_dominio` da
   mista `20260805120633`, que produção tem e o replay linear perde por falha
   de dado).

As cinco mistas aplicadas foram separadas sem reescrever o passado e sem tocar
no ledger. Os arquivos originais continuam byte a byte iguais, com SHA-256
congelado em `scripts/audit/schema-replay-substituicoes.json`; a nova migration
reproduz somente a DDL idempotente. O classificador só exclui uma origem depois
de validar hash, presença dos objetos declarados e substituto de schema puro.
As duas mistas retidas continuam fora do conjunto porque também continuam fora
do banco por decisão anterior.

O que foi entregue impede o problema de crescer e prova o caminho
reconstruível: classificação mecânica
(`npm run audit:migrations:classificar`), harness de replay reproduzível com
container único por execução, a prova estrutural do `--comparar`, e dois gates:
migration nova que misture DDL persistente com dado de ficha reprova contra a
lista fechada dos 25 casos históricos, e o conjunto de quebras previstas está
congelado em `scripts/audit/quebras-previstas.json`, então regressão de replay
reprova em qualquer posição, não só depois da 178ª. O workflow agora executa
também `--schema-gate`, que exige 66 aplicações e zero falhas. O replay linear
tolerante permanece congelado em 289 aplicações e 86 falhas conhecidas.

#### A migration da separação foi APLICADA em 09/08/2026

PR #144 mergeado em `dc96b91`, e a `20260809052600` aplicada em seguida pelo
procedimento canônico desta casa: DDL idempotente mais a linha do ledger na
**mesma transação**, com a versão tirada do nome do arquivo. Não foi
`apply_migration` do MCP, que carimba timestamp próprio e foi a causa do
terceiro caso da #131, nem `db push`, que arrastaria as cinco retidas.

A ordem foi a mesma da `20260808120000`: uma tabela-sonda validou o canal e não
sobreviveu ao `ROLLBACK`; depois a migration inteira mais a linha do ledger
rodaram dentro de `BEGIN … ROLLBACK`, dando `dry-run-ok` com 370 versões e topo
`20260809052600` **dentro** da transação, e voltando a 369 fora dela.

Readback pós-aplicação, com os números medidos:

- Ledger com **370 versões**; `20260809052600` aparece **uma única vez** e é a
  última. Nada foi gravado depois dela.
- As cinco retidas (`20260807050000` a `20260807053000`) **continuam ausentes**,
  e as cinco origens mistas continuam aplicadas e intactas.
- **Catálogo estrutural idêntico antes e depois**, nos 9 objetos das cinco
  origens (dois índices únicos, um índice parcial, duas colunas, uma tabela,
  uma função, um trigger e um comentário de coluna), comparados por definição e
  por md5. É a prova de que a migration é no-op no banco atual, que é
  exatamente o que se espera de DDL idempotente sobre schema já existente.
- `Ledger vs repositório` disparado **depois** da aplicação: 370 no ledger,
  375 arquivos no repo, veredito "ledger e repositório contam a mesma
  história".
- `--schema-gate` e `--comparar` reexecutados sobre o `main` mergeado: 66 de 66
  aplicando com zero falhas e hash `f267becc…5a96378a`, e 165 CREATEs com as 2
  linhas conhecidas, zero inesperadas e zero faltantes.

Com isso o ciclo da #136 fecha: código mergeado, migration aplicada, ledger
correto, catálogo verificado e replay reproduzível. O recibo com a tabela de
provas está em
[`QA/2026-08-09-issue-136-separacao-mistas.md`](../QA/2026-08-09-issue-136-separacao-mistas.md).

### Backfill da Câmara EXECUTADO em 09/08/2026 (issue #138)

Autorização nomeada do dono em 09/08: merge do PR #141, deploy e backfill. A
sequência executada, com prova em cada passo:

1. **Merge e deploy.** PR #141 mergeado por rebase (9 threads de review
   resolvidas antes, sem comentário postado); produção confirmada servindo o
   novo `main` via `/api/deployment-info`.
2. **Ingest incremental das 10 fichas.** 8 recarregadas por completo, com o
   log declarando `persistido == declarado == readback` para cada uma:
   `efraim-filho` 2089, `ronaldo-caiado` 1849, `professora-dorinha` 1639,
   `marcos-rogerio` 1064, `wellington-fagundes` 927, `alan-rick` 750,
   `cabo-daciolo` 204, `marconi-perillo` 117. Zero upserts recusados.
3. **Dois casos que o backfill revelou e que mudaram o gate:**
   `renan-filho` tem exatamente **100 proposições declaradas pela fonte**: as
   100 linhas dele eram acervo completo, não truncado, e o guard incremental o
   pulou corretamente. `dr-daniel` **não tem id da Câmara no seed** (as 100
   linhas `fonte='Camara'` dele vieram de curadoria nominal), então o
   invariante de backfill não se aplica a ele, e o readback declara essa
   ressalva em vez de engoli-la.
4. **Cache revalidado** pelo workflow canônico `revalidate-cache.yml`
   (dispatch, `success`); o secret é Sensitive na Vercel e não sai por
   `env pull`, então o workflow é o único caminho, e é o certo.
5. **Régua:** snapshot de 09/08 mostra `projetosCamara == declarado` nas 8
   recarregadas. `renan-filho` e `dr-daniel` ficam com procedência parcial
   honesta até o próximo ingest gravar a cardinalidade no caminho de skip
   (correção incluída no PR de follow-up).
6. **Readback público 10/10, RC=0**, fail-closed, com `camara == declarado`
   por ficha, card ancorado exibindo o total da API e rótulo "Proposições de
   autoria" em todas (as dez têm acervo misto).

Duas correções de gate saíram da execução real e vivem no PR de follow-up: o
invariante do readback virou **igualdade com o declarado pela fonte** (o limiar
`> 100` reprovaria o acervo legitimamente completo do `renan-filho`), e a perna
DOM passou a renderizar a ficha em Chromium headless via Playwright, porque o
perfil monta no cliente (`DeferredCandidatoProfileClient`) e o card nunca
existe no HTML que um `fetch` devolve.

O comando canônico do ciclo, para reexecuções futuras:

```bash
# 1. Ingest (escreve dezenas de milhares de linhas em produção)
npx tsx scripts/lib/ingest-camara.ts --slugs alan-rick,cabo-daciolo,dr-daniel,efraim-filho,marconi-perillo,marcos-rogerio,professora-dorinha,renan-filho,ronaldo-caiado,wellington-fagundes

# 2. Revalidar o cache das fichas (POST autenticado, all-or-nothing). O secret
#    entra pelo STDIN do curl (-H @-), nunca pelo argv: linha de comando é
#    visível em inspeção de processos. Não rodar com `set -x` ligado.
printf 'x-pf-revalidate-secret: %s\n' "$PF_REVALIDATE_SECRET" \
  | curl -sf -X POST https://www.puxaficha.com.br/api/revalidate \
      -H @- \
      -H "content-type: application/json" \
      -d '{"tags":["public-candidatos","public-candidato-ficha","public-candidatos-resumo","public-candidatos-comparaveis"]}'

# 3. Régua: as 10 fichas devem sair de "truncado"
npm run audit:cobertura

# 4. Readback público das DEZ fichas, FAIL-CLOSED: qualquer ficha reprovando
#    sai com código 1. O script confere API (total, composição por natureza e
#    contagem de fonte Câmara), coerência dos números, saída da assinatura do
#    corte NA DIMENSÃO POR FONTE (total global não prova backfill: sete das dez
#    fichas já passavam de 100 somando Senado e curadoria) e o CARD do DOM
#    ancorado por data-pf-overview-legislacao, com número igual ao da API.
npx tsx scripts/readback-fichas-camara.ts
```

O readback é `scripts/readback-fichas-camara.ts`, fail-closed: qualquer ficha
reprovando sai com código 1, "não consegui verificar" também reprova, o
invariante é `camara == declarado pela fonte` (sem limiar), e a perna DOM
renderiza a ficha em browser real antes de julgar o card ancorado. Com as dez
conferidas em 09/08, o ciclo `fonte -> coleta -> persistência -> API -> DOM`
da issue #138 está fechado para o recorte da Câmara; o que resta da issue é a
varredura de família nos demais ingests, já coberta pela correção do Senado no
próprio PR #141.

## Próximo marco

O próximo marco não é "rodar mais buscas". É transformar a régua em uma fila
fechada por ficha e frente, corrigir causas compartilhadas, integrar cada dado
até o componente público e reduzir a zero os campos aplicáveis sem conclusão.

O plano de execução está em
[`CANDIDATE_DATA_COMPLETENESS_WORKFLOW.md`](CANDIDATE_DATA_COMPLETENESS_WORKFLOW.md).
As Etapas 0 a 5 foram aprovadas e concluídas na execução
`pf-completeness-20260807T022551Z`, na branch local
`codex/profiles-complete-2026`. A baseline e a reconciliação da semana foram
concluídas. A auditoria global somente leitura fechou seis manifestos com
194/194 candidatos cada; a pesquisa dirigida fechou 4.923 propostas/estados.
A integração local preparou com segurança 294 financiamentos, 39 patrimônios, 3.595 links de
projetos, 45 pedidos de registro de 2026, 43 conjuntos de redes e metadados de
verificação para 194 fichas. O ledger bruto tinha 342/41, mas 49 conflitos e um
financiamento com SQ divergente foram bloqueados. Typecheck, 2.119 testes,
build, allowlist 12/12, identidade 642/642 e o self-test 30/30 passaram. Três
verificadores independentes aprovaram o código e as migrations no escopo local.
Banco, publicação editorial, merge, deploy e email continuam protegidos pelos
gates e não receberam autorização de aplicação em produção. O próximo passo é
o segundo gate da Etapa 6, com aplicação ordenada e readback real.

Critério de saída:

```text
universo atualizado + nenhuma lacuna aplicável silenciosa
+ cache revalidado + readback público + CI verde
```

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## PF Ajustes, deploy final e transporte da Fase 4, 12/08

A PR #176 foi mergeada e publicada no SHA
`9c5ae50930c1260b5a1f9b144f63ebc913ec4907`. O readback da
`20260812123000` passou em produção e as dez tags públicas foram revalidadas
com HTTP 200 no run `31602792598`.

A Fase 4 parou antes do ledger por defeito do executor: uma URI PostgreSQL em
`PGDATABASE` vira nome de banco no libpq e leva o `psql` ao socket local. O
runner também pressupunha que a CA do Supabase estava no trust store do host.
A correção local usa `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` e
`PGDATABASE`, preserva a senha fora do argv, fixa a CA oficial do Supabase e
adiciona workflow manual no SHA publicado com os secrets existentes. Nenhum
dos 17 itens deve ser promovido por essa tentativa incompleta. Coletas e cron
continuam não executados.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## PF Ajustes, migrations concluídas em 12/08

A PR #172 foi integrada em `rc-lancamento` no commit `1f7a847`. Depois de um
harness PostgreSQL 17 fresco, a `20260811102100` foi aplicada em produção na
mesma transação que seu ledger e seu readback. Uma primeira tentativa de conexão
recebeu HTTP 502 antes de o SQL alcançar o banco; a leitura imediata confirmou
391 versões e nenhuma linha da migration. A repetição do mesmo ato autorizado
concluiu e deixou o ledger em 392 versões, topo `20260811102100`, com MD5 do SQL
gravado igual ao arquivo do RC (`2decf80891fa9e4b38b2b327724811ac`).

O readback persistido confirmou 5 identidades exatas, 1 Carlos Brandão em
quarentena, zero linha contaminada pública, 3 âncoras TSE 2026 e 1 Orleans
correto. A view pública continua com 194 fichas. Todas as migrations do PF
Ajustes estão agora aplicadas. O conjunto permanece não verde até merge em
`main`, deploy do mesmo SHA, coletas autorizadas e readback público da Fase 4.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## PF Ajustes, aplicação parcial de 11/08

O lote autorizado foi interrompido corretamente na primeira divergência. O
ledger de produção está em 388, topo `20260811101000`; as quatro migrations
seguintes permanecem ausentes. A carga aplicada tem 292/292 linhas idênticas ao
manifesto, mas o readback usava ordenação dependente da collation. A correção
fixa ordem binária `COLLATE "C"` e hash `456ba86b…`, com prova em clusters
PostgreSQL 17 de locales distintos. Não fazer rollback nem reaplicar a carga.
Antes de retomar, integrar esta correção no RC e executar novamente o readback
`20260811101000` em produção.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## PF Ajustes, última migration retida em 12/08

A correção de collation foi integrada e os readbacks permitiram retomar o lote.
Produção está com 391 versões, topo `20260811102000`; apenas
`20260811102100` permanece ausente. Seu dry-run recusou cinco hashes do
manifesto, sem gravar dados. A investigação confirmou 21/26 SHA já idênticos e
cinco payloads JSONB semanticamente iguais: quatro valores financeiros `0`
passaram a ser serializados como `0.00` e um patrimônio como `633192.40`, em
conformidade com os tipos reais `numeric(15,2)` de produção. O harness usava
`numeric` sem escala e mascarava essa diferença. A correção local replica os
tipos reais, congela os cinco SHA pós-sequência e prova 26/26 no banco atual,
mantendo a allowlist 12/6/4/4 e todos os adversariais fail-closed. Antes de
qualquer nova aplicação, integrar a correção no RC e obter autorização nominal
para `20260811102100`.

A PR #171 foi integrada, porém o dry-run seguinte recusou a tupla de João
Rodrigues porque o cron das 08:00 UTC havia avançado apenas
`ultima_atualizacao`. A aplicação foi interrompida antes de qualquer escrita e
o ledger permaneceu em 391. Esse timestamp não é identidade nem payload de
curadoria; forward e readback agora o excluem das tuplas canônicas, preservando
`id`, slug, nome, nascimento, UF, cargo, partido, status, situação,
publicabilidade e `created_at`. O harness reproduz o cron e prova que os 13
campos estáveis continuam fail-closed. O dry-run remoto completo passou com
ledger temporário e readback, seguido de rollback. A correção está na PR #172 e
precisa ser integrada antes de pedir novamente a aplicação da
`20260811102100`.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## PF Ajustes, deploy publicado e ACL financeira retida em 12/08

O release autorizado foi integrado e publicado. `main`, deployment e
`/api/deployment-info` coincidem no SHA
`c075780cb92681a1f8c4563e98dca875ede2587f`, e a revalidação das dez tags de
cache terminou verde no run `31593363805`. O ledger de produção permanece em
392 versões, topo `20260811102100`.

O readback público da Fase 4 interrompeu o encerramento ao encontrar fichas com
`sourceStatus = degraded`. A causa é a ACL da view
`financiamento_publico`: ela é `security_invoker` e passou a filtrar
`financiamento.despublicado_em`, mas a tabela-base não concedia essa coluna aos
papéis públicos. O PostgREST retorna SQLSTATE `42501`; os dados persistidos não
foram alterados.

A correção `20260812123000` está preparada com grants mínimos, rollback,
readback e harness adversarial nos dois schemas suportados. Ela ainda não foi
integrada nem aplicada. Depois de aplicação autorizada, é obrigatório
revalidar o cache e repetir a Fase 4 antes de marcar os itens financeiros ou a
matriz como verdes. As coletas de CPF e sanções e a ativação do cron permanecem
fora do estado executado.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## PF Ajustes, ACL aplicada e readback portátil pendente em 12/08

A PR #175 foi mergeada e publicada no SHA
`5a6179efca1cc837cb675514f86acb5e85251691`. Depois de harness PostgreSQL 17
fresco, a `20260812123000` foi aplicada em transação com ledger. Produção está
com 393 versões, topo `20260812123000`; a view pública tem 561 linhas e os
grants mínimos de `despublicado_em` estão ativos sem conceder `SELECT` na
tabela bruta.

O readback imediato abortou porque sua fixture continha `cpf_hash`, mas a
tabela real não contém essa coluna. O readback chamava
`has_column_privilege` com o nome inexistente e falhava antes de avaliar a ACL.
O harness agora inclui o schema real sem `cpf_hash`/`cnpj_doador`, e a prova de
colunas sensíveis usa o catálogo, que é válido tanto quando as colunas existem
quanto quando não existem. A versão corrigida passou no PostgreSQL 17 e em
leitura direta de produção.

Cache e Fase 4 não foram retomados depois da divergência. Antes de qualquer
veredito verde, integrar a correção do readback e autorizar a repetição do
readback, da revalidação das dez tags e da Fase 4. Não reaplicar nem reverter a
migration. Coletas e cron permanecem fora do estado executado.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## PF Ajustes, readbacks temporais remanescentes em 12/08

Antes de integrar a PR #179, a varredura preventiva confirmou dois falsos
negativos adicionais causados pela divisão de identidade de Orleans. A carga
judicial `20260810122000` conserva dois CNJs no UUID do governador arquivado,
mas seu readback ainda exigia o slug antigo. A carga de destaques
`20260811101000` conserva 292 linhas exatas, mas a assinatura inclui o slug
atual e muda deterministicamente após a `20260811102100`.

Os dois contratos foram corrigidos no mesmo branch da PR #179. O judicial
resolve somente os dois CNJs afetados por UUID e identidade nominal, com ledger
do split obrigatório. O de destaques exige a assinatura antiga na ausência da
`102100` e a assinatura `95cc5a76055102f6b8684ad33818d731` quando ela está
presente. Harnesses pré/pós-split e adversariais passaram, assim como o gate
agregado PostgreSQL 17. Nenhuma migration, merge ou execução da Fase 4 ocorreu
neste ajuste.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
