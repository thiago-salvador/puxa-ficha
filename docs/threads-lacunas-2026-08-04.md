# Log das 6 threads de fechamento de lacunas (2026-08-04)

Log compartilhado das sessões que rodam em paralelo no plano de fechamento de
lacunas de dados. Cada thread trabalha no próprio git worktree, então **este
arquivo vive no checkout principal de propósito**, e não numa branch: é o único
caminho que todas as sessões enxergam enquanto o trabalho ainda não foi mergeado.

Caminho absoluto, para citar em prompt de outra sessão:

```
/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-oss/docs/threads-lacunas-2026-08-04.md
```

## Como usar

- Ao **terminar** uma fatia que outra thread possa consumir, acrescente a entrada
  na seção da sua thread: o que ficou pronto, em que branch, e o contrato que os
  outros chamam (nome de tabela, de função, de arquivo).
- Ao **começar** algo que toca arquivo compartilhado, anote antes, para a próxima
  sessão não editar o mesmo arquivo às cegas. Os pontos quentes conhecidos hoje
  são `scripts/audit/lib/coverage-model.ts`, `scripts/audit/coverage-report.ts`,
  `scripts/ingest-all.ts` e `scripts/lib/types.ts`.
- Não reescreva entrada de outra thread. Acrescente abaixo, com hora.
- Migration nova: confira o prefixo de timestamp contra o que já está aqui antes
  de escolher o seu, porque duas threads criando migration no mesmo minuto geram
  ordem ambígua. Os prefixos `20260804160000` e `20260804170000` já estão usados.

## Estado das threads

**Todas as frentes estão na `main` desde 05/08.** A sessão de integração está
registrada no fim deste arquivo, na seção "Integração das 5 frentes". A tabela
abaixo guarda o estado de cada thread no fim do próprio trabalho dela, que é o
que as outras sessões consultavam; a coluna de PR diz onde cada uma foi parar.

| # | Assunto | Estado | Branch | PR |
|---|---|---|---|---|
| 1 | Log de proveniência de coleta | Mergeada | `worktree-coleta-log-proveniencia` | [#88](https://github.com/thiago-salvador/puxa-ficha-oss/pull/88) |
| 2 | Coleta dos 27 candidatos quase vazios de 03/08 | Mergeada | `data/escopo-slugs-e-27-candidatos` | [#87](https://github.com/thiago-salvador/puxa-ficha-oss/pull/87) |
| 3 | Relatório de cobertura | Mergeada, com a reconciliação resolvida | `worktree-cobertura-uma-regua` | [#89](https://github.com/thiago-salvador/puxa-ficha-oss/pull/89) |
| 4 | Falso positivo em massa no ingest de sanções, e auditoria do mesmo padrão | Mergeada | `claude/suspicious-panini-25734f` e `fix/ingest-guards-identidade` | [#85](https://github.com/thiago-salvador/puxa-ficha-oss/pull/85) e [#86](https://github.com/thiago-salvador/puxa-ficha-oss/pull/86) |
| 5 | Resgate dos pares duplicados e filtro de publicável nos ingests | Mergeada | `worktree-resgate-duplicados` | [#90](https://github.com/thiago-salvador/puxa-ficha-oss/pull/90) |
| 6 | (nunca preenchida) | | | |

> A linha 5 foi preenchida na integração de 05/08, a partir do relatório em
> `docs/resgate-pares-duplicados-2026-08-04.md`, que já existia. A 6 continua em
> branco: nenhuma sexta frente apareceu.
>
> **Aviso sobre a numeração:** a Daily Note do vault chama a thread do
> `coleta_log` de "Thread 6", e aqui ela é a 1. As duas numerações divergem desde
> o começo. Quem for cruzar os dois registros, cruze pelo assunto e não pelo
> número. A linha 2 acima foi ocupada por ser a primeira livre, e não porque o
> plano das 20:58 tenha chamado essa fatia de thread 2.

---

## Thread 1: log de proveniência de coleta

**Estado:** pronto. Branch `worktree-coleta-log-proveniencia`, commits `b11f2db` e
`95dccef`. As duas migrations já foram aplicadas no projeto de produção
(`wskpzsobvqwhnbsdsmok`). Os nove passos do job `verify` do CI passam.

### O problema que isso resolve

O banco guardava o que foi encontrado e nunca o fato de ter ido procurar. Com
isso, "zero" era ambíguo em 954 células do relatório de cobertura, e não havia
como provar a exigência do dono do projeto de que todo dado preenchível seja
preenchido: sem registro da tentativa, "verdadeiramente zero" é afirmação sem
prova.

O caso limite era sanções administrativas, vazias em 194 de 194 fichas. A causa
não era ausência de sanção: `ingest-transparencia-sanctions` avisava e voltava
quando faltava `TRANSPARENCIA_API_KEY`, e voltar sem escrever era indistinguível,
para quem lê o banco depois, de ter consultado os quatro cadastros e não achar
nada.

### O que existe agora

**`public.coleta_log`** (append-only, uma linha por tentativa) e a view
**`public.coleta_log_ultima`** (última tentativa por `fonte`/`escopo`/`alvo`).
Ambas sem grant para `anon` e `authenticated`; escrita é service role.

Colunas que interessam: `fonte`, `escopo` (`candidato` | `territorio` |
`global`), `alvo` (slug, UF ou `agregado_NNNN`), `candidato_id`, `executado_em`,
`resultado`, `volume`, `detalhe`, `url`, `execucao`, `duracao_ms`.

Cinco desfechos, mais um sexto estado que é a ausência de linha:

| Valor | Significa |
|---|---|
| `encontrado` | consultamos e veio dado (`volume` diz quanto) |
| `vazio_confirmado` | consultamos, a fonte respondeu, e respondeu vazio. **O único que autoriza dizer "é zero mesmo"** |
| `nao_aplicavel` | a pergunta não cabe para este alvo, por regra declarada |
| `erro` | fomos buscar e não deu (credencial, HTTP, pré-requisito). **Nunca é zero** |
| `indeterminado` | escreveu zero linhas e não sabe dizer se a fonte veio vazia ou se a consulta falhou |
| *(sem linha)* | **nunca verificado**. Lê-se pela negativa |

`indeterminado` é um quinto valor além dos quatro do escopo original, e é
deliberado: vários ingests engolem falha de rede num `catch` que devolve lista
vazia, e chamar isso de zero repetiria, em campo novo, o erro que a tabela veio
corrigir. **Todo `indeterminado` no relatório é dívida com endereço:** é um
ingest que ainda precisa declarar o próprio desfecho.

### Consulta canônica

```sql
-- Quais candidatos nunca foram verificados para a fonte X
select c.slug, c.nome_urna
  from public.candidatos c
 where not exists (
   select 1 from public.coleta_log l
    where l.escopo = 'candidato'
      and l.alvo   = c.slug
      and l.fonte  = 'transparencia-sanctions')
 order by c.nome_urna;

-- Situação por candidato, separando o zero provado do zero presumido
select c.slug,
       coalesce(u.resultado, 'nunca_verificado') as situacao,
       u.executado_em, u.detalhe
  from public.candidatos c
  left join public.coleta_log_ultima u
    on u.escopo = 'candidato' and u.alvo = c.slug and u.fonte = 'transparencia-sanctions';
```

### Números medidos no banco de produção (2026-08-04 21h)

Sobre os 280 registros da tabela `candidatos` (não sobre o recorte de 194
publicáveis; quem precisa do recorte filtra por `candidatos_publico`):

| Fonte | Nunca verificado | Encontrado | Zero provado |
|---|---:|---:|---:|
| `transparencia-sanctions` | **280** | 0 | **0** |
| `google-news` | 280 | 0 | 0 |
| `tse-historico` | 280 | 0 | 0 |
| `ceaps-senado` | 270 | 10 | 0 |
| `senado` | 254 | 26 | 0 |
| `camara` | 216 | 64 | 0 |
| `tse` | 50 | 230 | 0 |

Ou seja: as 194 fichas com sanções vazias **nunca foram consultadas**. Não foram
consultadas e vieram limpas. Nenhum zero provado existe hoje no banco, para
nenhuma fonte, porque nenhum ingest instrumentado rodou ainda.

### Contrato para quem for chamar

**Ingests.** O registro acontece em `runIngestTask`, em `scripts/ingest-all.ts`,
um ponto só. É por onde passam os três comandos do `.github/workflows/ingest.yml`,
então cobre os 20+ ingests e os que vierem depois. **Não** espalhe a chamada pelos
ingests: fonte nova sem rastro por esquecimento é o modo de falha que o log
existe para expor.

O que um ingest faz por conta própria é só o que aquele ponto não consegue saber:

- declarar `coleta_resultado` (campo novo, opcional, em `IngestResult`) quando
  sabe distinguir "a fonte respondeu vazio" de "a consulta falhou";
- chamar `registrarColetas` quando volta **antes** de montar resultado nenhum
  (o caso da credencial ausente).

Helper: `scripts/lib/coleta-log.ts`. Exporta `registrarColeta`,
`registrarColetas`, `registrarColetaDeResultados`, `FONTES` (mapa fonte para
escopo) e `montarLinhas`. **Falha de log nunca derruba ingest:** toda escrita é
try/catch com aviso no stderr.

**Relatório de cobertura (thread 3).** A régua em
`scripts/audit/lib/coverage-model.ts` **não foi tocada**, para não colidir com
quem tem esse arquivo. O que está pronto para ser plugado:

- `scripts/audit/coverage-snapshot.sql` já traz o campo `coleta`, um objeto
  `fonte -> { resultado, volume, executado_em, detalhe }` por candidato;
- `scripts/audit/lib/coleta-proveniencia.ts` é puro e testado, e expõe
  `FONTES_POR_COLUNA` (mapa das 23 colunas para as fontes que as alimentam),
  `provenienciaDaColuna(coluna, coleta)` e `ROTULO_PROVENIENCIA`.

O veredito tem cinco valores: `coletado`, `zero_provado`, `nunca_verificado`,
`nao_sabemos` e `sem_ingest`. A precedência carrega opinião e está documentada no
arquivo: `nunca_verificado` ganha de `nao_sabemos` porque fonte que ninguém
tentou é trabalho pendente com endereço, e esconder isso atrás de "houve um erro"
faz parecer que já foram lá e não deu.

`sem_ingest` marca coluna que nenhum ingest preenche (processos judiciais,
posições do quiz, legislação do Executivo). Ali o vazio se resolve com trabalho
editorial, e cobrar coleta automatizada seria cobrar o que não existe.

Falta só a thread 3 decidir **como desenhar** isso na tabela, ou seja separar
visualmente o `zero` provado do `zero` presumido.

### O que mudou nos ingests

- **`ingest-transparencia-sanctions`**: `fetchSancoes` fazia `catch { return [] }`,
  então uma sanção real atrás de um HTTP 500 chegava com a mesma cara de "não tem
  sanção". Falha e vazio agora são tipos distintos, e o ingest só declara
  `vazio_confirmado` com os **quatro** cadastros respondendo. A falha de cadastro
  **não** entra em `result.errors` de propósito: `ingest-all` faz `exit(1)` com
  qualquer erro ali, e indisponibilidade parcial do Portal passaria a derrubar a
  ingestão inteira, o que não é o comportamento de hoje nem decisão desta thread.
- **Credencial ausente** (`sanctions` e `transparencia`): os dois voltavam mudos.
  Agora gravam uma linha de `erro` por candidato.
- **`ingest-transparencia`** declara `indeterminado`, porque é stub e não persiste.
- **`enrich-wiki-historico`** declara `nao_aplicavel`: categoria da Wikipedia não
  traz `periodo_inicio`, então a fonte estruturalmente não tem o que preencher.

### Backfill: o que se permitiu concluir, e o que não

330 linhas, em `tse`, `camara`, `senado` e `ceaps-senado`. Idempotente
(conferido em duas execuções, 330 linhas nas duas).

A única inferência aceita: se a **própria coluna `fonte`** da linha diz "TSE...",
então o TSE foi consultado para aquele candidato. A evidência está na linha, não
numa suposição sobre qual código poderia tê-la escrito. Por isso a atribuição
nunca foi "esta tabela é escrita pelo ingest X": `projetos_lei` tem 10.910 linhas
de 'Camara' e 2.051 de 'Senado', mas também 265 de 'ALEP Transparencia', 174 de
'SAPL ALEAM' e mais 20 origens de assembleia estadual que vieram de curadoria.

**Nenhuma linha de `vazio_confirmado` foi gravada pelo backfill**, para ninguém.
O banco de hoje não prova que alguém foi ao Portal e não achou sanção; só sabe
que a tabela está vazia. Quem não recebeu linha ficou como nunca verificado.

Fora do backfill de propósito: `processos` (curadoria de STF, MP-RJ e imprensa),
`noticias_candidato` (ingest e quatro migrations de curadoria, indistinguíveis
pela coluna `fonte`, que guarda o nome do veículo), `votos_candidato` e
`historico_politico`/`mudancas_partido` (vários escritores, sem coluna `fonte`),
e `indicadores_estaduais` (a coorte de UFs coletadas está no código, não no
banco; fica para o primeiro run instrumentado).

### Limitação em aberto

Não existe `.env.local` no repo, então esta sessão não teve a service role para
rodar um ingest de ponta a ponta. O helper foi provado inserindo **na tabela
real** o payload exato que ele monta (as duas constraints aceitaram, as linhas
foram apagadas depois), mas ninguém ainda viu um `npx tsx scripts/ingest-all.ts
sancoes` gravando de verdade.

**Primeira coisa a fazer quando houver credencial:** rodar esse comando e
conferir as linhas em `coleta_log`. Enquanto isso não acontece, todo número de
"zero provado" no relatório vai ser 0, o que está correto e não é bug.

### Armadilhas achadas no caminho, que valem para as outras threads

- **Worktree novo não tem `node_modules` próprio.** Imports resolvem subindo até
  a raiz, então `tsc` e os testes passam, mas `npm run check:dead-code` sai 1 com
  "Unused devDependencies" e o erro parece defeito do seu diff. Rode
  `ln -sfn ../../../node_modules node_modules` no worktree antes dos gates. Se um
  gate falhar no worktree e passar na main no mesmo commit, `git stash -u` e
  reconfirme antes de culpar o próprio código.
- **`npm run verify` não existe** como script do `package.json`. `verify` é o
  nome do **job** no `.github/workflows/ci.yml`, com nove passos: audit de deps
  de produção, lint, cspell da UI, typecheck, typecheck dos scripts, validate
  seed, gate das fotos, knip, testes, e build (a cobertura c8 roda como
  `continue-on-error`).
- **`candidatos` tem 280 linhas, não 194.** 194 é o recorte publicável. Toda
  contagem precisa dizer qual universo está usando; foi o que gerou o falso
  alarme de regressão das 20h30.
- Migration com `INSERT`/`UPDATE`/`DELETE` precisa da anotação `-- @write` acima
  do statement, e o parser em `scripts/audit/lib/pending-writes.ts` **exige que o
  statement mencione literalmente o valor de `ref=` ou `slug=`**. Anotação que
  não bate com o SQL vira exceção, não aviso.

---

## Thread 2: coleta dos 27 candidatos quase vazios de 03/08

**Estado:** pronto. **Sem commit e no checkout principal (`main`), não em
worktree**, o que é a primeira coisa a coordenar (ver "O que falta"). Os nove
passos do CI passam. Ninguém foi despublicado: 194 publicáveis antes e depois,
os 27 seguem `publicavel = true`.

**Escopo:** os 27 slugs publicados em 03/08 com ficha quase vazia. Nenhuma outra
sessão tocou neles nesta janela.

### O problema que isso resolve

Os 27 entraram no ar com zero processos, zero sanções, zero pontos de atenção e
26 dos 27 sem nenhuma notícia. A leitura fácil era "candidato pequeno não tem
dado". Estava errada: a maior parte do que faltava estava em fonte pública que o
pipeline já baixava e jogava fora.

### O achado que destravou a thread

`buildSQMap`, em `scripts/lib/ingest-tse.ts`, lê o `consulta_cand_2026` inteiro
e **guarda só o `SQ_CANDIDATO`, descartando o resto de cada linha**. O comentário
da função diz que ela existe para cruzar o CSV de bens, que só tem o SQ, e isso
está certo. O efeito colateral é que `DS_GENERO`, `DS_COR_RACA`,
`DS_ESTADO_CIVIL`, `NR_CPF_CANDIDATO`, `SG_UF_NASCIMENTO` e `DS_EMAIL` passam
pela memória do processo a cada execução e nunca chegam ao banco.

Com o CPF em mãos, o histórico deixou de depender de casamento por nome: varri
`consulta_cand` de 2010 a 2024 (oito pleitos, cerca de 4,2 milhões de linhas)
casando por CPF, que é identidade exata.

### O que existe agora

**Escopo por slug no pipeline inteiro.** `loadCandidatos()` em
`scripts/lib/helpers.ts` passou a honrar `PF_INGEST_SLUGS`. Como todos os
módulos de ingestão passam por essa função, um filtro num ponto só escopa a
coleta inteira. Slug inexistente **aborta**, porque erro de digitação silencioso
viraria coleta vazia com cara de sucesso.

**`scripts/lib/helpers.ts` é arquivo compartilhado.** Está na lista de pontos
quentes junto com `ingest-all.ts`. A mudança é aditiva (sem `PF_INGEST_SLUGS` o
comportamento é idêntico ao anterior), mas quem for editar o mesmo arquivo, veja
antes.

**`data/candidatos.json` também foi tocado**, em 12 pontos: `wikipedia_title`
para 7 candidatos, `tse_sq_candidato` de 2026 para 4 que não tinham, e o
`nome_completo` de `gilberto-vasconcelos` corrigido de "Gilberto Vasconcelos"
para "Gilberto Vasconcelos da Silva" (o nome truncado era o motivo de ele não
casar com o TSE). `npm run validate:seed` passa.

### Contrato para quem for chamar

```
PF_INGEST_SLUGS=slug1,slug2 npx tsx scripts/ingest-all.ts wikipedia wikidata
```

- Vale para **qualquer** fonte do `ingest-all.ts`, porque o filtro está em
  `loadCandidatos()` e não em módulo específico.
- Sem a variável, nada muda: roda nos 271 do seed.
- Slug fora do seed lança erro com a lista dos desconhecidos.
- É o jeito de mexer num lote sem tocar na ficha de quem outra sessão está
  curando no mesmo repositório.

### Números medidos no banco de produção (2026-08-04 22h30)

Nos 27, depois da coleta: 53 linhas de histórico político, 16 mudanças de
partido, 215 notícias, 50 de patrimônio, 37 de financiamento, 19 fichas com
gênero, cor/raça e estado civil, 22 com naturalidade, 19 com CPF, 7 biografias e
11 fotos reais no lugar do avatar de iniciais.

Antes da sessão, quase tudo isso era zero: 0 linhas de histórico, 0 de partido,
0 de financiamento, 0 de gênero, 0 de naturalidade, 0 de CPF, 0 de biografia, 0
de foto real, 20 notícias (todas de um candidato só) e 13 de patrimônio.

**Fotos oficiais do TSE 2026 estão no Wikimedia Commons**, com o
`SQ_CANDIDATO` no nome do arquivo (`2026 NOME CANDIDATO CARGO UF TSE (SQ).jpg`).
Buscar no Commons pelo SQ achou 8 das 19. O `DivulgaCandContas` ainda não
publicou nenhum candidato de 2026, então essa é a única rota de foto oficial
hoje. Resolução baixa (111x155 ou 161x225), abaixo do slot de 562x750, mas o
gate `audit:fotos` só mede arquivo em `public/candidates` e não `foto_url`
remota, então não há gate quebrado.

### O que não preenchi de propósito

Três casos em que a fonte oferecia dado e a resposta certa era deixar vazio:

1. **`carlos-machado`**: o nome casa com **cinco pessoas diferentes** no TSE
   (cinco CPFs, cinco datas de nascimento, vereadores em RS, SP e MG). Nenhuma
   verificável como o pré-candidato do PCB em SP. Histórico rejeitado inteiro.
2. **`guilherme-fonseca`**: casou com um vereador de Dores do Indaiá/MG pelo
   UNIÃO, contra um pré-candidato do PSTU em PE. Rejeitado.
3. **`luciana-gurgel`**: a Wikipédia afirma "atualmente é deputada estadual pelo
   Amapá". A lista oficial da ALAP não tem o nome dela (tem Hildegard Gurgel) e o
   TSE 2022 registra **suplente**. Não gravei `cargo_atual`. O único
   `cargo_atual` gravado na thread foi o da `alessandra-campelo`, conferido na
   Mesa Diretora no site da ALEAM, onde ela consta como secretária-geral.

Também descartei 27 das 238 notícias coletadas, por citarem homônimo: "José
Carlos Machado" de Sergipe, "Larissa Moraes" da Bahia, "Larissa Gaspar" do
Ceará, um Guilherme Fonseca português e outro do Rio em 2018.

### Erro cometido nesta thread, e revertido

**Rodei `ingest-all.ts sancoes` e ele gravou 729 linhas falsas**: as mesmas 27
sanções genéricas para cada um dos 27 candidatos, com `vinculo = 'direto'`, sem
`cnpj_empresa` e sem `numero_processo`, com órgãos sancionadores sem relação
nenhuma com eles ("Prefeitura Municipal de Gravataí/RS", "Prefeitura Municipal
de Birigui - SP", "CAMARA DOS DEPUTADOS").

Revertido na mesma sessão com `delete from sancoes_administrativas`. A tabela
voltou a 0 linhas, que era o estado dela em todo o projeto. Conferido depois do
delete: `pontos_atencao` seguem 249, `processos` seguem 30, `publicavel` segue
194.

É o mesmo defeito que a sessão das 22h17 diagnosticou pela causa raiz (o
parâmetro `cpfCnpj` não existe na API do Portal da Transparência e é ignorado em
silêncio, devolvendo sempre a primeira página). **A lição operacional aqui é
outra e vale para todas as threads: eu rodei o ingest antes de ler o que ele
faz.** Num site de checagem eleitoral, o custo de rodar primeiro e conferir
depois é atribuir sanção falsa a pessoa real.

### Rastro que não existe: nada desta thread foi para a `coleta_log`

Conferido depois de tudo: `coleta_log` tem só `tse` (última em 03/08),
`camara`, `senado` e `ceaps-senado`. **Nenhuma linha das rodadas de hoje**, que
incluíram `tse`, `wikipedia`, `wikidata`, `wikidata-politico`, `wiki-historico`,
`instagram`, `tcu`, `transparencia`, `camara`, `senado` e `ceaps-senado`.

O motivo é estrutural e não é descuido do helper: `scripts/lib/coleta-log.ts`
vive na branch `worktree-coleta-log-proveniencia`, que não foi mergeada, e esta
thread rodou no `main`, que não tem o arquivo.

**Consequência para a thread 3:** as células dos 27 que eu acabei de preencher
continuam sem procedência, e as que continuam zeradas seguem contando como
"nunca verificado" mesmo onde eu verifiquei e o vazio é verdadeiro. É o mesmo
buraco que a varredura de sanções das 22h17 deixou, agora em mais fontes. Quem
mergear a thread 1 primeiro e rodar de novo com escopo resolve os dois casos de
uma vez.

### O que falta

1. **Decidir onde este trabalho mora.** Está sem commit e no `main`, enquanto
   todas as outras threads estão em worktree. Enquanto não for commitado, uma
   sessão que rode `git checkout` ou `git stash` no checkout principal leva as
   mudanças junto. É o item mais urgente.
2. **Re-rodar as fontes com escopo depois do merge da thread 1**, para os 27
   ganharem linha em `coleta_log` e a cobertura passar a ler verificado em vez de
   nunca verificado.
3. **Redes sociais: 25 dos 27 seguem sem nenhum perfil.** É o maior bloco de
   "não achei" do relatório. Wikipédia, Wikidata e o enriquecimento de Instagram
   não resolveram, e eu não gravei palpite: perfil errado numa ficha eleitoral é
   dano a pessoa real. Precisa de fonte oficial (site de partido, página de
   Assembleia, material de campanha).
4. **Biografia para 20 dos 27.** Os 7 que têm vieram de verbete na Wikipédia. Os
   outros só têm notícia, e escrever biografia a partir de notícia exige decisão
   editorial que não tomei sozinho.
5. **Cidade de nascimento para 10.** O registro de 2026 só publica a UF, e o
   histórico deles não preenche o município.
6. **Os 8 sem registro no TSE 2026** (prazo até 15/08) destravam sozinhos quando
   protocolarem: gênero, cor/raça, estado civil, patrimônio e foto oficial
   chegam juntos. Vale re-rodar depois do prazo.
7. **`preta-lu` tem candidatura a deputada federal em 2022 apta no TSE cujo
   resultado vem como `#NULO`.** O projeto não grava histórico sem resultado, e
   eu segui a regra em vez de inventar desfecho. Falta apurar a votação.

### Armadilhas achadas, que valem para as outras threads

- **`npm run verify` não existe neste repositório.** O enunciado da minha thread
  pedia "verify passando com 9 gates". `npm run verify` devolve
  `Missing script`. Os nove gates são os passos do job do `ci.yml`: `npm audit
  --omit=dev --audit-level=high`, `lint`, `lint:spell:ui`, `typecheck`,
  `check:scripts`, `validate:seed`, `audit:fotos:gate`, `check:dead-code` e
  `npm test`. Rodei os nove, todos passam.
- **`zsh` não faz word splitting de variável sem aspas.** Um laço
  `for g in "run lint" ...; do npm $g; done` manda `run lint` como argumento
  único e devolve `Unknown command` nos nove gates seguidos, o que parece
  falha real do projeto e não é. Use array ou `${=g}`.
- **A busca da Wikipédia do pipeline usa `nome_urna`.** Para `larissa-rosado`
  isso vira a busca "Larissa" e para `baba`, "Babá". Nos dois casos existe
  verbete, e a busca por `nome_completo` acha na primeira tentativa. Foi assim
  que 7 verbetes apareceram depois de o pipeline ter dito que não havia nenhum.
- **O guarda de relevância das notícias tem furo.** Duas matérias entraram para
  `ismar-marques` sem o nome dele aparecer no título (eram sobre Elizeu Aguiar,
  o cabeça de chapa). Conferi título a título antes de gravar e descartei as
  duas. Quem for confiar em `splitNewsByCandidateMention` sem revisão, saiba que
  ele deixa passar matéria do cabeça de chapa.
- **`bem_candidato_2026` distingue "não declarou" de "declarou zero".** Quatro
  dos 19 registrados aparecem no arquivo com zero bens. Isso é achado (patrimônio
  verdadeiramente vazio), não lacuna, e o relatório classifica assim.
- **A prestação de contas de 2026 ainda não existe**: o zip devolve 404. Todo
  financiamento gravado nesta thread é de pleitos de 2010 a 2024.

---

## Thread 3: relatório de cobertura, uma régua só

**Estado:** pronto e verificado, **sem commit**. Branch
`worktree-cobertura-uma-regua`, worktree
`.claude/worktrees/cobertura-uma-regua`. Lint, typecheck e os 1.758 testes
passam. Tem uma reconciliação pendente com a thread 1, descrita no fim.

### O problema que isso resolve

Existiam duas medidas de cobertura concorrentes e elas discordavam, o que gerou
um falso alarme de regressão em 04/08. Além disso o script canônico não rodava
mais sozinho: o caminho que lia o banco pelo `supabase-js` foi removido em 02/08
e o que sobrou exigia colar o resultado do SQL num arquivo à mão.

### O que existe agora

**Um comando:** `npm run audit:cobertura`. Lê o banco, monta o HTML, grava o
snapshot ao lado e gera as páginas de revisão.

**Acesso ao banco:** a Management API do Supabase
(`POST /v1/projects/:ref/database/query`), a mesma que o MCP usa, sempre com
`read_only: true`. O modo é imposto pelo servidor, não por confiança no código:
mandei um `create table` de teste e voltou
`25006: cannot execute CREATE TABLE in a read-only transaction`.

Credencial, nesta ordem: `SUPABASE_ACCESS_TOKEN` no ambiente, senão o Personal
Access Token que o `supabase login` guardou no Keychain do macOS.

**A REST do projeto não serve, e o 403 era esperado.** `SUPABASE_URL` mais
service role key é PostgREST: expõe tabelas e RPCs declaradas, não SQL
arbitrário, e não aceita token de CLI. Quem for tentar de novo por ali vai bater
no mesmo muro.

Isso **não** reabre o caminho removido em 02/08. O que foi removido reimplementava
a régua em JS; `scripts/audit/lib/snapshot-fetch.ts` lê o `.sql` como texto e
manda o banco executar. O SQL segue sendo a única descrição dos fatos.

Documentação em `docs/cobertura-de-dados.md`, apontada do README.

### A régua conferida contra o banco

| Ponto | Verificação |
|---|---|
| Universo é só publicável | A entrada é a view `candidatos_publico`: 194, contra 280 na tabela crua |
| Quiz é só presidencial | Os 183 não-presidenciáveis (164 Governador, 19 Vice) saem `n/a`; os 11 presidenciáveis pontuam em x/3, só com `verificado = true`, que é o filtro do quiz |
| Colunas de achado fora do índice | O índice usa 15 das 23 colunas. Ficam fora as 6 de achado (sanções, contradições, processos, alertas, itens a revisar, projeto em destaque) e mais duas: cargos ocupados e histórico partidário |

O critério que une as oito vale escrever, porque a pergunta volta: elas medem o
mundo, não o nosso esforço. Governador sem sanção não tem ficha pior que o com
cinco, e contar sanção como preenchimento premiaria quem tem mais problema.

### Comparação com o relatório de 02/08: não houve regressão

O índice médio caiu de 84,0% para 75,8%, e é composição, não perda de dado:

| Recorte | 02/08 | 04/08 |
|---|---:|---:|
| Fichas medidas | 166 | 194 |
| Índice médio **nos 165 presentes nos dois** | 84,1% | **84,5%** |
| Índice médio das 29 fichas novas | | 26,1% |

Nos comuns, 35 células mudaram, cada uma com migration nomeada: 25 de fila de
revisão esvaziada (`quiz_posicoes_com_fonte`, `claims_desatualizadas_no_ar`,
`descartar_claims_sem_mandato_contraditorias`), 7 de posição de quiz com fonte
(PRs #51 e #52), e uma cada de `ac_governadores_votos_mailza`,
`ac_governadores_tse_thor_bens` e
`fontes_profundas_roberto_claudio_e_veredito_marcelo_brigadeiro`. As 29 novas são
16 vices de `politica_de_vice_registro_tse_2026` e 13 governadores de
`roster_governadores_convencoes_agosto_2026`; a que saiu foi wilson-witzel.

### Comparação com a página feita à mão, que causou o alarme

`~/.disposable-html/2026-08-04-cobertura-dados-por-estado.descartavel.html`.
Mesmo universo e mesmas 23 colunas, 838 células divergentes de 4.462. Fui ao
banco em cada grupo em vez de assumir que o script estava certo:

| Grupo | Células | Veredito |
|---|---:|---|
| Quiz cobrado de quem disputa Governador | 183 | página errada |
| Alertas contando `feito_positivo` | 14 | página errada, conferido linha a linha |
| "Não se aplica" cobrindo dado existente | 17 | página errada |
| Zero troca de partido tratado como lacuna | 35 | página errada |
| 3 processos de Helder Salomão | 1 | **sem origem**: `processos`, `sancoes_administrativas` e `pontos_atencao` dele têm 0, 0 e 1; não há linha duplicada com o nome dele |
| Financiamento e doadores escondidos como `n/a` | 46 | **script certo e mais duro**: os 23 têm `SQ_CANDIDATO` no seed, então já declararam ao TSE |
| Cargos, destaques, itens a revisar, posições | ~220 | definição diferente, as duas defensáveis |
| Foto | 132 | **a página mede algo que o script não mede** |

A página levou banner vermelho de aposentada, com os desvios listados.

### O que a página à mão tinha de melhor

Ela separa foto nossa no slot de 562x750, foto nossa em resolução baixa (12
fichas) e foto de terceiro hospedada por Wikimedia, Câmara, Senado ou TSE (120
fichas). O script só pergunta se `foto_url` existe e pinta as 132 de verde. Está
registrado nas limitações de `docs/cobertura-de-dados.md`; virar coluna é decisão
do dono do projeto.

### Defeito achado na régua, com o estrago medido

`cargo_canonico` gravado como `Candidatura a Vereador` não casa com a lista
`CARGOS_ELETIVOS`, que tem `Vereador`. São 185 linhas de histórico em 66 fichas
publicáveis nessa forma, e 33 fichas só têm eventos assim. Para elas
`declarouAoTse` dá falso e patrimônio e financiamento saem como "não se aplica"
em vez de lacuna.

Medi em vez de estimar, rodando a régua com e sem normalização do prefixo:
**atinge 1 ficha hoje** (`jarbas-soares`), porque as outras 32 são salvas pelo
`SQ_CANDIDATO` do seed. Cresce conforme entrar ficha nova sem SQ. Não corrigi:
está documentado e é decisão do dono.

### Contrato para quem for chamar

- `npm run audit:cobertura` para o relatório inteiro.
- `tsx scripts/audit/coverage-report.ts --from-snapshot=PATH` roda sem rede, com
  snapshot em disco. É o modo para teste e para máquina sem credencial.
- `scripts/audit/lib/snapshot-fetch.ts` exporta `obterSnapshot`, `obterColetas`,
  `consultar` e `resolverToken`. `consultar(sql, ref, token)` serve para qualquer
  leitura pontual em produção e já vai com `read_only: true`.
- A data do arquivo de saída passou a ser local, não UTC: rodando depois das 21h
  em São Paulo o nome saía com a data de amanhã e o corpo dizia hoje.

### Reconciliação pendente com a thread 1

**Duplicamos trabalho, e o certo é resolver antes de mergear as duas.** Quando
esta sessão começou, a branch da thread 1 tinha zero commits e `coleta_log` não
existia no banco, então implementei a procedência por conta própria. A thread 1
commitou e aplicou a migration no meio da sessão.

O que existe em dobro:

| Assunto | Thread 1 | Thread 3 |
|---|---|---|
| Mapa coluna para fonte | `FONTES_POR_COLUNA` em `scripts/audit/lib/coleta-proveniencia.ts`, 23 colunas | `FONTES_POR_COLUNA` em `scripts/audit/lib/coverage-model.ts`, só as 6 de zero |
| Veredito | `provenienciaDaColuna`, 5 valores | `provenienciaDoZero`, 6 valores |
| Leitura do log | campo `coleta` dentro de `coverage-snapshot.sql` | `scripts/audit/coverage-coleta.sql`, consulta separada com probe de `to_regclass` |
| Teste | `tests/coleta-proveniencia.test.ts` | `tests/coverage-proveniencia.test.ts` |

Não há conflito textual de git: os arquivos novos têm nomes diferentes e não
toquei em `coverage-snapshot.sql`. O que há é duas descrições da mesma coisa, que
é exatamente o problema que esta thread existiu para acabar.

**Proposta de resolução, na ordem:**

1. Fica o módulo da thread 1 (`coleta-proveniencia.ts`) como fonte do mapa e do
   veredito, porque cobre as 23 colunas e a precedência dele está melhor
   argumentada: `nunca_verificado` ganhando de `nao_sabemos` está certo, e a minha
   fazia o contrário.
2. Fica o campo `coleta` dentro de `coverage-snapshot.sql`, e o meu
   `coverage-coleta.sql` sai junto com `obterColetas`. Uma consulta é melhor que
   duas. **Ressalva:** a versão da thread 1 referencia `coleta_log_ultima` sem
   guarda, então o snapshot inteiro quebra em banco sem a migration. Em produção
   ela já está aplicada, então isso só custa em banco novo ou em rollback.
3. `coverage-model.ts` passa a chamar o módulo da thread 1 em vez da cópia local.
   O desenho na tabela (o traço colorido embaixo da célula, a legenda e as dicas)
   fica como está: é a parte que a thread 1 deixou explicitamente em aberto.
4. **Resolver duas discordâncias reais de mapa, com evidência e não por
   antiguidade.** Levantei quem escreve em cada tabela com grep e cheguei a
   fontes que o mapa da thread 1 não tem:
   - `cargos`: a thread 1 tem `tse-historico` e `wikidata-politico`; `ingest-senado`
     e `enrich-wiki-historico` também escrevem em `historico_politico`.
   - `alertas`: a thread 1 marca como `[]`, sem ingest; `ingest-jarbas`,
     `ingest-tcu` e `ingest-transparencia-sanctions` escrevem em `pontos_atencao`.

   A diferença importa: fonte a menos no mapa faz um zero ser declarado
   confirmado sem que todas as fontes tenham respondido.

### O que o log de coleta já mostra

Rodei o relatório contra a `coleta_log` real. Das 853 células zeradas com
procedência, **nenhuma é zero provado**: 477 nunca verificadas (194 de sanções,
165 de alertas, 91 de cargos, 27 de partidos) e 376 sem ingest nenhum
(191 de contradições, 185 de processos). As outras 155 células zeradas são "itens
a revisar", que é fila de trabalho e não leva procedência.

**Ponto para a thread das sanções.** A varredura das 22h17 confirmou zero sanções
em 98 candidatos com CPF, consultando CEIS, CNEP e CEAF. Conferi `coleta_log`
depois: ela só tem `camara`, `senado`, `ceaps-senado` e `tse`, nenhuma linha de
`transparencia-sanctions`. **O achado existe e o rastro não**, então o relatório
segue marcando as 194 como nunca verificadas, e está certo em marcar. Basta o
ingest registrar o desfecho para as 98 virarem verde sozinhas, sobrando os 96 sem
CPF como lacuna real.

### O que falta

1. **Commitar a branch.** Está tudo sem commit, e o worktree é a única cópia.
2. **A reconciliação dos quatro passos acima**, antes de mergear as duas threads.
   Mergear as duas como estão repõe a duplicação em escala menor.
3. Decidir sobre o prefixo `Candidatura a X` (1 ficha hoje) e sobre levar a
   qualidade da foto para o relatório canônico. As duas estão documentadas como
   limitação conhecida, nenhuma foi corrigida por conta própria.

### Armadilhas achadas, que valem para as outras threads

- **`check-report.ts` escolhe sozinho o HTML mais recente** em `~/.disposable-html`
  que case com `puxa-ficha-cobertura-dados`. Relatório gerado com `--out` de nome
  diferente não é conferido, e o script confere silenciosamente um arquivo antigo.
  A flag é `--report`, não `--html`.
- **Edit com caminho absoluto do checkout principal escreve no checkout
  principal, mesmo com a sessão dentro do worktree.** Aconteceu aqui: as primeiras
  edições em `coverage-report.ts` foram parar na main. Detectado com
  `git status` na main, copiado para o worktree e revertido com `git checkout --`.
  Rode `git -C <main> status` antes de fechar se tiver usado caminho absoluto.
- **Confirme que uma mudança de código é neutra rodando o mesmo snapshot antes e
  depois.** Fiz isso aqui e deu 0 células diferentes, o que separou o que mudei do
  que o banco mudou sozinho enquanto as outras threads trabalhavam. Sem essa
  checagem eu teria atribuído à minha mudança um deslocamento de 26 células que
  era escrita de outra sessão.

---

## Thread 4: falso positivo em massa no ingest de sanções, e auditoria do mesmo padrão

**Estado:** pronto, **commitado e com PR aberta**, em duas branches, entrada
escrita na madrugada de 05/08 (00h11). Os nove gates passam nas duas.

| Branch | PR | Commit | Escopo |
|---|---|---|---|
| `claude/suspicious-panini-25734f` | [#85](https://github.com/thiago-salvador/puxa-ficha-oss/pull/85) | `11ccda1` | correção do ingest de sanções |
| `fix/ingest-guards-identidade` | [#86](https://github.com/thiago-salvador/puxa-ficha-oss/pull/86) | `47776a4` | guardas em `jarbas` e `ceaps-senado`, sai de `main` |

**Escopo:** o defeito que a thread 2 encontrou ao rodar `ingest-all.ts sancoes`
e reverteu (as 729 linhas falsas), levado até a causa raiz e fechado em código,
mais a varredura do mesmo padrão em todos os outros ingests.

**Nenhuma migration criada**, então os prefixos `20260804160000` e
`20260804170000` da thread 1 seguem sendo os únicos usados.

### O problema que isso resolve

`?cpfCnpj=<cpf>` **não existe** em nenhum dos quatro endpoints de sanção do
Portal da Transparência. A API aceita a requisição, ignora o parâmetro que não
conhece **em silêncio** e devolve a página 1 da lista nacional inteira. Cada
candidato recebia os mesmos registros de gente e empresa sem relação nenhuma com
ele, gravados com `vinculo = 'direto'`.

O guarda de CPF nulo já existia e não protegia nada, porque o problema não era
quem consultava, era o que a consulta significava.

### A causa raiz, reproduzida contra a API antes de mexer no código

| Chamada | Retorno | |
|---|---|---|
| `ceis?cpfCnpj=00000000191` | 15 registros | filtro ignorado |
| `ceaf?cpfCnpj=00000000191` | 15 registros | filtro ignorado |
| `cepim?cpfCnpj=00000000191` | 15 registros | filtro ignorado |
| `ceis?codigoSancionado=00000000191` | 0 registros | filtro respeitado |
| `ceaf?cpfSancionado=00000000191` | 0 registros | filtro respeitado |

Parâmetro correto por endpoint, conforme `v3/api-docs`: `ceis` e `cnep` usam
`codigoSancionado`, `ceaf` usa `cpfSancionado`, `cepim` usa `cnpjSancionado`.

### O que existe agora

**Duas travas independentes, nenhuma confiando na outra**, em
`scripts/lib/ingest-transparencia-sanctions.ts`:

1. **Antes da rede.** Sem CPF válido (11 dígitos, dígitos verificadores
   conferidos), não faz requisição nenhuma e marca `skipped`. CPF mascarado
   vindo de outra fonte é recusado aqui.
2. **Sobre a resposta.** Todo registro tem o documento conferido contra o CPF
   consultado, e o que não casa é descartado com aviso, **mesmo a API tendo dito
   que filtrou**. CNPJ nunca casa com CPF, documento ausente nunca casa.

**A API publica CPF de pessoa física mascarado** (`***.435.151-**`), só os 6
dígitos do meio. Casamento por máscara passa a exigir que o nome também bata: 6
dígitos não identificam ninguém, e homônimo viraria acusação.

**CEPIM saiu do pipeline.** Só filtra por CNPJ e só devolve pessoa jurídica,
então o CPF de um candidato jamais poderia casar. Aquelas linhas eram ruído por
construção.

**Três defeitos achados no caminho, no mesmo módulo:** as interfaces não
correspondiam a nenhum campo do DTO real (`numerosProcesso` contra
`numeroProcesso`, um `ativo` que a API não tem, `nomeInformacaoSancao`
inexistente), datas `DD/MM/AAAA` iam cruas para coluna `DATE`, e o dedupe
comparava `numero_processo` nulo com string vazia, o que duplicava a cada
rodada porque `NULL` nunca é igual a `''`.

**Guardas de identidade em outros dois ingests** (PR #86, sai de `main`):
`conferirReembolsos` em `ingest-jarbas.ts` e `agregarDespesasDoAno` em
`ingest-ceaps-senado.ts`. Detalhe em "O que não mudei de propósito" e em
`docs/fontes-pendentes.md`, que ganhou a seção "Fontes com endpoint morto".

### Contrato para quem for chamar

O módulo de sanções passou a exportar núcleo puro, testável sem rede e sem
banco. Quem for instrumentar ou estender:

```ts
import {
  coletarSancoesDoCandidato,  // guard de CPF + conferência, com rede injetável
  conferirDocumento,          // "exato" | "mascarado" | "nao-confere"
  cpfEhValido,
  normalizarRegistros,
  parseDataBR,
} from "./lib/ingest-transparencia-sanctions"
```

- `coletarSancoesDoCandidato(cpf, nome, deps)` devolve
  `{ consultou, motivoSkip?, sancoes, descartes }`. `consultou: false` significa
  que o guard barrou **antes de qualquer requisição**.
- `deps.buscar(endpoint, documento)` é o ponto de injeção da rede. É aí que a
  thread 1 reaplica o `RespostaCadastro`, e não mais em `fetchSancoes`, que
  deixou de existir.
- `ConferenciaReembolsos` e `ConferenciaDespesas`, nos outros dois módulos,
  seguem o mesmo formato: `{ ok: true, ... } | { ok: false, motivo }`.

### Números medidos no banco de produção (2026-08-04 23h50)

Varredura corrigida rodada nos **271** do seed, 289 segundos:

| | |
|---|---|
| Consultados de verdade | 141 |
| Pulados antes da rede, sem CPF válido | 130 |
| Sanções gravadas | 0 |
| Registros descartados pela trava 2 | 0 |
| Falhas de rede | 0 |

Conferido no banco depois, e não só no log: `sancoes_administrativas` segue com
**0 linhas**. Zero descarte é o resultado esperado agora, porque com o parâmetro
certo a API devolve vazio em vez de devolver a lista nacional.

**O zero tem duas naturezas e o relatório não deve confundir:** para os 141
consultados é achado (foram procurados nos três cadastros e não têm nada); para
os 130 sem CPF é lacuna, e só o CPF do TSE fecha.

### O que não mudei de propósito

**`ingest-camara.ts` não recebeu linha nenhuma**, e a razão é medida, não
suposição. Testado em 05/08 contra `dadosabertos.camara.leg.br`:

- honra o filtro (`idDeputadoAutor=0` e `=999999999` devolvem 0 registros);
- **rejeita parâmetro desconhecido com erro**, em vez de ignorar em silêncio
  (`idDeputadoAutorX=204554` não volta lista).

É o oposto do Portal da Transparência. As rotas de gasto e voto usam path param
(`/deputados/{id}/despesas`), onde id errado dá 404 e não dado de outra pessoa.
Espalhar guarda ali seria custo sem risco correspondente.

### As duas fontes que eu ia blindar estão com o endpoint morto

Verificado com chamada real em 05/08, e registrado em `docs/fontes-pendentes.md`:

| Fonte | Verificação |
|---|---|
| `jarbas.serenata.ai` | HTTP 404 em todas as rotas, inclusive na raiz |
| `legis.senado.leg.br/dadosabertos/senador/{id}/despesas` | HTTP 404 com `No static resource`, enquanto `/senador/{id}` segue 200 |

Os dois ingests rodam sem erro visível e devolvem "sem dados", que no relatório
de cobertura é **indistinguível de "procuramos e não achamos nada"**. As guardas
ficam dormentes até a fonte voltar, e é justamente na volta que elas importam.

Isso interessa direto às threads 1 e 3: são duas fontes que o relatório trata
hoje como lacuna a preencher e que na verdade não têm mais de onde vir.

### Os 9 candidatos do banco que estão fora do seed

Achado lateral da varredura, que responde uma dúvida das threads 2 e 3. O banco
tem **280** candidatos e `data/candidatos.json` tem **271**. Como todo ingest
itera pelo seed, os 9 de fora não são coletados por ninguém.

Investigados: todos são linha legada de **2026-03-29** com `publicavel = false`,
invisíveis no site. Seis são presidenciáveis que saíram do seed (Pablo Marçal,
Boulos, Marina Silva, Jair Bolsonaro, Simone Tebet, Michelle Bolsonaro), um é
`eduardo-leite`, e **dois são linha duplicada de quem está publicado**:

| Órfã | Publicada | Notícias órfã contra publicada |
|---|---|---|
| `tarcisio` | `tarcisio-gov-sp` | 101 contra 399 |
| `fernando-haddad` | `haddad-gov-sp` | 0 contra 247 |

A ficha publicada é a mais rica nos dois casos, então **não há dado publicado
faminto**. O que existe é dado filho velho pendurado em linha órfã, pontos de
atenção incluídos, que nenhum ingest atualiza. Não é lacuna de cobertura, é
limpeza, e conversa com a branch `worktree-resgate-duplicados`.

### O que falta

1. **Mergear as duas PRs.** Não mergeei: a decisão é do dono do projeto. A #86
   sai de `main` e não toca o arquivo de sanções, então mergeia em qualquer
   ordem.
2. **A colisão com a thread 1, que é o item que precisa de coordenação.** A
   branch `worktree-coleta-log-proveniencia` reescreve
   `ingest-transparencia-sanctions.ts` (instrumentação da `coleta_log`) e ainda
   carrega o `cpfCnpj` quebrado. As duas **não mergeiam sozinhas**, porque a
   `fetchSancoes` que ela altera deixou de existir. Ordem decidida: a #85
   primeiro, e a thread 1 rebaseia em cima reaplicando o `RespostaCadastro`
   dentro do `ColetaDeps`. Não rebaseei por conta própria porque o worktree
   daquela thread está `locked`.
3. **Esta varredura não gravou linha em `coleta_log`**, pelo mesmo motivo do item
   anterior: o módulo só existe na branch da thread 1. Depois do rebase, vale
   re-rodar para os 141 consultados virarem `vazio_confirmado` em vez de nunca
   verificado.
4. **Os 130 sem CPF continuam inverificáveis.** Depende de obter CPF pelo TSE,
   que é a rota que a thread 2 abriu com o `buildSQMap`.
5. **Decidir o destino das duas fontes mortas.** Se Jarbas e CEAPS foram
   descontinuadas de vez, o certo é remover os ingests e os cards em vez de
   deixar código morto rodando. Não removi: é decisão de produto.
6. **Limpar as 9 linhas órfãs**, junto com a `worktree-resgate-duplicados`.
7. **O ponto de atenção de sanção continua sendo recusado pelo guard de fonte**
   (`motivoRecusaDeFonte`), porque a rota consultada é API autenticada e a fonte
   exibida precisa ser a página pública equivalente. Comportamento preservado de
   propósito, e a correção continua pendente como antes.

### Armadilhas achadas, que valem para as outras threads

- **API que ignora parâmetro desconhecido em silêncio é a armadilha central, e
  não se generaliza entre fontes.** O Portal da Transparência devolve a lista
  nacional; a Câmara devolve erro. Descobrir custa duas chamadas: uma com id
  impossível (deve voltar vazio) e uma com o nome do parâmetro adulterado (deve
  falhar). Vale rodar isso antes de confiar em qualquer endpoint filtrado por
  query.
- **Conferir a identidade do retorno é a única defesa que sobrevive a mudança de
  API.** Nome de parâmetro pode estar certo hoje e mudar amanhã. O que não muda é
  que o registro precisa ser da pessoa consultada.
- **CPF em API pública vem mascarado.** `***.435.151-**` tem 6 dígitos úteis, que
  são as posições 4 a 9. Comparação exata falha, e comparação só pela máscara
  aceita homônimo. Quem for casar CPF de fonte pública precisa das duas coisas,
  máscara e nome.
- **Endpoint morto chega ao pipeline como "sem dados".** Três ingests desta
  janela (`jarbas`, `ceaps-senado`, e o próprio `sancoes` sem credencial) tratam
  falha com `catch` e seguem, então fonte fora do ar é indistinguível de fonte
  vazia. É exatamente o buraco que a `coleta_log` da thread 1 existe para fechar,
  e o `indeterminado` que ela criou é a peça certa.
- **`TRANSPARENCIA_API_KEY` é lida antes de o `.env.local` ser carregado.** O
  carregamento acontece dentro de `scripts/lib/supabase.ts`, no primeiro acesso
  ao client. Como `ingestTransparenciaSanctions` checa a chave antes de tocar o
  Supabase, rodar direto devolve "chave nao definida" em 0.0s, com cara de
  configuração faltando. Exporte a env antes
  (`set -a; . ./.env.local; set +a`) ou toque o Supabase primeiro.
- **Worktree novo não tem `node_modules`**, e `knip` falha nele passando na
  `main` no mesmo commit. Linkar antes de acusar o próprio diff.
- **Prove o teste de regressão por mutação.** Afrouxei de propósito a conferência
  de documento e as guardas dos outros dois ingests: 2 testes caíram no primeiro
  caso e 6 no segundo, e voltaram a passar depois do revert. Teste de guarda que
  ninguém tentou quebrar não é evidência de nada.
- **Contagem de teste igual não significa arquivo não coletado.** `main` sozinha
  dá 1.748 testes e as duas branches dão 1.760, e por coincidência os dois
  arquivos novos têm 12 testes cada. Conferi com `git stash` antes de acreditar.

---

## Thread 5: resgate dos pares duplicados e filtro de publicável nos ingests

**Estado:** mergeada em 05/08, PR [#90](https://github.com/thiago-salvador/puxa-ficha-oss/pull/90).
Relatório completo em `docs/resgate-pares-duplicados-2026-08-04.md`; esta seção só
registra o que as outras threads precisam saber.

**Contrato que mudou para todo mundo:** os 17 ingests/enriches passaram a montar a
lista com `loadCandidatosPublicos()` (`scripts/lib/helpers-db.ts`), que cruza o
seed com a view `candidatos_publico`. O roster processado caiu de **271 para
194**. `loadCandidatos()` continua intacto e continua sendo a fonte do roster
completo para `validate-seed`, `persist-sq` e para a hipótese de republicação.

Os dois filtros compõem: `PF_INGEST_SLUGS` age dentro de `loadCandidatos()`, então
`PF_INGEST_SLUGS=a,b` com o roster publicável devolve a interseção, e um slug
publicável fora do ar não volta pela variável.

**Banco já aplicado** por script com service role, antes do merge. Nenhum DELETE,
nenhuma mudança de `publicavel`; arquivar foi mudar flag e status. Todo achado
migrado entrou com `verificado=false` e `visivel=false`, mesmo quando a origem
estava verificada.

**Cinco casos de `status` x `publicavel` inconsistentes** ficaram listados no
relatório e não foram corrigidos: são decisão do dono do projeto, não de coleta.

---

## Integração das 5 frentes (2026-08-05)

Sessão de integração, sem feature nova, sem coleta nova e sem migration nova. O
objetivo era só levar as cinco frentes para a `main` na ordem que não perde
trabalho, com os nove gates passando a cada passo.

### Ordem em que mergeou, e por quê

| # | PR | Frente | Por que nesta posição |
|---|---|---|---|
| 1 | [#87](https://github.com/thiago-salvador/puxa-ficha-oss/pull/87) | Escopo por slug e seed dos 27 | Estava **sem commit e solto no checkout principal**. Enquanto ficasse assim, um `git checkout` de outra sessão levava tudo junto. Era o item urgente, e virou o primeiro |
| 2 | [#85](https://github.com/thiago-salvador/puxa-ficha-oss/pull/85) | Correção do ingest de sanções | Reescreve `ingest-transparencia-sanctions.ts` por inteiro. Tinha que ir antes da thread do log, que instrumenta o mesmo arquivo |
| 3 | [#86](https://github.com/thiago-salvador/puxa-ficha-oss/pull/86) | Guardas em jarbas e ceaps-senado | Sai de `main` e não toca sanções; a ordem contra a #85 era livre |
| 4 | [#88](https://github.com/thiago-salvador/puxa-ficha-oss/pull/88) | Log de proveniência de coleta | Rebaseada sobre a #85, reaplicando a instrumentação no ponto novo |
| 5 | [#89](https://github.com/thiago-salvador/puxa-ficha-oss/pull/89) | Relatório de cobertura, com a reconciliação | Precisa do módulo da #88 em `main` para poder chamá-lo em vez de duplicá-lo |
| 6 | [#90](https://github.com/thiago-salvador/puxa-ficha-oss/pull/90) | Resgate dos pares duplicados | Toca 17 arquivos de ingest, que são os mesmos que todas as outras mexeram. Por último, por cima de tudo |

A ordem planejada foi seguida sem inversão. Os nove gates do job `verify` do
`ci.yml` passaram localmente em cada branch antes do push, e o `verify` do CI
passou em cada PR antes do merge.

### O que a integração precisou decidir, e não estava no plano

**A instrumentação de sanções mudou de lugar, não só de linha.** A #85 removeu
`fetchSancoes`, que era onde a thread do log punha o `RespostaCadastro`. O ponto
de injeção da rede passou a ser `ColetaDeps.buscar`, e é lá que a distinção entre
falha e vazio foi reaplicada: `buscar` devolve `{ok: true, registros} | {ok:
false, erro}`, `ColetaResultado` ganhou `falhas: string[]`, e o veredito ficou
falha em algum cadastro → `erro`, gravou → `encontrado`, nada com todos
respondendo → `vazio_confirmado`. Sem isso, um HTTP 500 no CEIS viraria
"candidato sem sanção" no relatório público, que é a mesma classe de erro do
falso positivo que a #85 corrigiu, só que na direção contrária.

**O guard de `to_regclass` não cabe dentro do SELECT.** A ressalva registrada na
thread 3 era que o campo `coleta` do `coverage-snapshot.sql` referenciava
`coleta_log_ultima` sem guarda. A correção não podia ser um `to_regclass` no
próprio comando: a relação é resolvida na análise, então a consulta falharia
antes de qualquer guarda de runtime rodar. O bloco ficou delimitado por
marcadores e `snapshot-fetch.ts` o remove quando a view não existe, depois de
sondar. Teste cobre o strip e cobra os marcadores, para renomeá-los não desligar
a degradação em silêncio.

**Dois furos de mapa confirmados contra o código**, como a thread 3 propôs:
`cargos` ganhou `senado` e `wiki-historico` (quatro escritores em
`historico_politico`, não dois), e `alertas` deixou de ser coluna derivada e
ganhou `jarbas`, `tcu` e `transparencia-sanctions` (três ingests escrevem em
`pontos_atencao`). Levantado com `grep 'from("<tabela>")' scripts/`, descartando
`fix-*`, `apply-*`, `backfill-*` e `link-check-*`, que são intervenção humana e
não registram tentativa.

**O caminho de credencial ausente passou a usar o roster publicável.** Depois da
#90, `registrarColetas` no caminho sem `TRANSPARENCIA_API_KEY` usa
`loadCandidatosPublicos()`, e não o seed inteiro: o log tem que registrar
tentativa de quem o pipeline teria consultado, senão inventa 77 lacunas que
ninguém tem intenção de fechar. O mesmo vale para `ingest-transparencia`.

**Uma ressalva de review virou correção.** O `agregarDespesasDoAno` da #86 só
descartava bloco com ano DIFERENTE do pedido: bloco com `NumAno` ausente, vazio
ou só espaço era somado na linha do ano pedido, sem entrar em `anosDescartados`.
É o mesmo defeito que a guarda existe para fechar, sem nem a evidência de qual
ano foi somado. Corrigido, com teste, e a assimetria contra `CodigoParlamentar`
ausente (que continua tolerado) ficou escrita no comentário.

**Destino dos `tmp-resgate-*`: renomeados, não removidos.** O knip não opina
sobre eles, porque `scripts/*.ts` é entry no `knip.json` e os três são entry
point com qualquer nome. A decisão foi por conteúdo: o de apply é idempotente por
marcador e documenta o que foi escrito em produção, e o de acervo é citado pelo
relatório como o jeito de regerar a lista dos inativos. Foram para a convenção
que o repo já usa (`apply-resgate-pares-duplicados.ts`,
`audit-resgate-pares-duplicados.ts`, `audit-acervo-nao-publicados.ts`), porque o
prefixo `tmp-` prometia um descarte que não vai acontecer.

### Um defeito que só aparecia com as frentes juntas

`entradaDeResultado`, em `scripts/lib/coleta-log.ts`, descartava qualquer
`IngestResult` com `skipped` **antes** de olhar o `coleta_resultado`. Existem
duas puladas no pipeline e elas não são a mesma coisa:

| Pulada | Declara desfecho? | O que significa |
|---|---|---|
| `ingest-camara`, incremental | Não | "o dado já estava coberto, não fui buscar". Gravar sobrescreveria em `coleta_log_ultima` a última tentativa real |
| `ingest-transparencia-sanctions`, CPF ausente ou inválido | **Sim**, `erro` com o motivo | "não dá para consultar este candidato". A declaração era jogada fora em silêncio |

Medido na primeira varredura: 194 publicáveis processados, **98 linhas gravadas
e 96 candidatos sem nenhuma**. Os 96 não têm CPF válido e apareciam como "nunca
verificado", indistinguíveis de quem só está na fila. Separar lacuna com
endereço de trabalho pendente é a razão de ser da tabela, e era exatamente esse
caso que se perdia.

Corrigido em [#91](https://github.com/thiago-salvador/puxa-ficha-oss/pull/91): a
declaração ganha de `skipped`, e `skipped` sem declaração segue sem virar linha.
A regra 2 do próprio comentário da função já dizia isso; a ordem do código fazia
o contrário. `ingest-camara` é o único outro que seta `skipped` e nunca declara
desfecho, então o comportamento dele não muda.

### Verificação de ponta a ponta, no checkout principal

**Os nove gates do job `verify`** (`npm run verify` não existe; são os passos do
`ci.yml`): `npm audit --omit=dev --audit-level=high`, `lint`, `lint:spell:ui`,
`typecheck`, `check:scripts`, `validate:seed`, `audit:fotos:gate`,
`check:dead-code` e `npm test`. **9/9 PASS** na `main` final, e 9/9 em cada
branch antes de cada push.

**Estado do banco, conferido depois de tudo:** 280 candidatos, 194 publicáveis,
0 sanções, 260 pontos de atenção, 30 processos. Nada despublicado, nada
deletado.

**Linhas novas em `coleta_log`, por fonte** (rodadas de 05/08, madrugada):

| Fonte | Linhas | Candidatos | Encontrado | Zero provado | Erro | Indeterminado |
|---|---:|---:|---:|---:|---:|---:|
| `transparencia-sanctions` | 294 | 194 | 0 | 198 | 96 | 0 |
| `tse` | 73 | 16 | 73 | 0 | 0 | 0 |
| `wikipedia` | 27 | 27 | 4 | 0 | 0 | 23 |
| `wikidata` | 27 | 27 | 1 | 0 | 0 | 26 |

As 294 de sanções são três passadas (um smoke test de 2 slugs, a varredura antes
da correção do `skipped` e a varredura depois). O estado que vale é o da view
`coleta_log_ultima`: **194 de 194 publicáveis com linha, 98 `vazio_confirmado` e
96 `erro`**. Antes destas rodadas o banco tinha 330 linhas, todas `encontrado`,
vindas do backfill, e **nenhum zero provado para fonte nenhuma**.

`tse` cobriu 16 dos 27 porque só esses têm registro ou histórico no TSE; os 8 sem
registro de 2026 destravam sozinhos quando protocolarem (prazo 15/08). São 73
linhas para 16 candidatos porque o ingest do TSE devolve mais de um
`IngestResult` por candidato (perfil, patrimônio, financiamento).

**Os 49 `indeterminado` de `wikipedia` e `wikidata` são dívida com endereço**, no
sentido exato que a thread 1 definiu: os dois ingests terminam sem escrita e sem
declarar desfecho, então o log não sabe dizer se a fonte veio vazia ou se a
consulta falhou. Não foi corrigido nesta sessão: é mudança de comportamento de
ingest, não de integração.

**Relatório de cobertura** (`npm run audit:cobertura`, contra o banco real):

| Procedência do zero | Células | Onde |
|---|---:|---|
| `sem_ingest` | 376 | contradições 191, processos 185 |
| `nunca_verificado` | 283 | alertas 165, cargos 91, partidos 27 |
| (sem procedência) | 154 | itens a revisar, que é fila de trabalho |
| **`zero_provado`** | **98** | sanções |
| `nao_sabemos` | 96 | sanções, dos candidatos sem CPF |

Antes: 853 células zeradas com procedência e **nenhum zero provado**, 477 nunca
verificadas. Agora as 194 células de sanções saíram de "nunca verificado" para
uma afirmação: 98 são zero de verdade, e 96 são lacuna que só o CPF do TSE fecha.

## O que ficou de fora, e por quê

Nada do plano de integração ficou pendente. O que segue aberto é trabalho que
não era desta sessão, e cada item já estava registrado na thread de origem:

1. **`wikipedia` e `wikidata` não declaram desfecho** (49 `indeterminado` acima).
   Cada um precisa distinguir "a fonte respondeu e não tem verbete" de "a
   consulta falhou". É mudança de ingest.
2. **Os 96 publicáveis sem CPF válido** continuam inverificáveis no Portal. A
   rota é o CPF do registro do TSE, que a thread 2 abriu com o `buildSQMap`.
3. **Os 8 dos 27 sem registro no TSE 2026** (prazo 15/08). Gênero, cor/raça,
   estado civil, patrimônio e foto oficial chegam juntos quando protocolarem.
4. **25 dos 27 seguem sem nenhuma rede social**, e 20 sem biografia. Precisa de
   fonte oficial e de decisão editorial, não de coleta.
5. **`jarbas` e `ceaps-senado` estão com o endpoint morto** (404 verificado em
   05/08). As guardas ficam dormentes até a fonte voltar. Remover os ingests e os
   cards é decisão de produto.
6. **Prefixo `Candidatura a X` em `cargo_canonico`** atinge 1 ficha hoje
   (`jarbas-soares`) e cresce conforme entrar ficha nova sem SQ.
7. **Qualidade da foto** não entrou no relatório canônico: ele só pergunta se
   `foto_url` existe.
8. **Cinco casos de `status` x `publicavel` inconsistentes**, listados no
   relatório do resgate, esperando decisão.
9. **`preta-lu`** tem candidatura de 2022 apta cujo resultado vem como `#NULO`;
   falta apurar a votação para o histórico poder ser gravado.

## Thread 7 — cobertura por fonte e filtro de despublicados (05/08/2026)

Base: PR #97 (`fix/cobertura-totais-legenda`, commit `1402759`), em worktree
isolado fora de `.qwen`. A tabela original de 23 frentes foi preservada e cada
seção ganhou um segundo eixo com uma linha por fonte e candidato: desfecho,
volume, última tentativa e detalhe. As fontes nunca consultadas aparecem
primeiro e são contadas no cabeçalho do candidato.

A lista inclui as 17 fontes canônicas de escopo candidato e, com `tse-cpf`,
chega a 18 fontes, além das fontes adicionais já observadas no log. Fontes fora
do catálogo só aparecem onde há
tentativa registrada; elas não viram lacuna inventada para os demais. Fontes
territoriais ficam fora.

O snapshot agora filtra `historico_politico.despublicado_em is null`, igual à
ficha pública. A comparação antiga x nova rodou em uma única consulta Supabase
com `read_only: true`, sobre o mesmo snapshot transacional: 194 candidatos antes
e depois, **0 células alteradas em todas as 23 colunas**. O efeito visual atual é
nulo, mas a régua deixa de depender de linhas que a ficha não publica.

Verificação no relatório servido em `http://127.0.0.1:8899/`:

- legenda e DOM: 4.462/4.462 células, com os cinco estados iguais;
- `coleta_log_ultima`: Aroldo Félix 9/9, Lula 4/4 e Zé Cocá 6/6, sem divergência
  de fonte ou desfecho;
- viewport de 375 px: documento 360/360 px, sem rolagem horizontal da página;
  as 58 tabelas rolam dentro do próprio container;
- gates do job `verify`: 9/9 PASS, incluindo 1.821 testes.

### Follow-up: aplicabilidade das fontes (05/08/2026)

"Nunca verificado" agora significa somente fonte aplicável sem tentativa. Sem
tentativa registrada, Câmara e Jarbas viram `N/A` quando não há ID da Câmara nem
mandato de deputado federal; Senado e CEAPS viram `N/A` quando não há ID do
Senado nem mandato de senador. Uma tentativa real sempre prevalece e mantém seu
desfecho.

No relatório completo, 659 linhas antes marcadas como pendentes viraram `N/A`:
158 da Câmara, 159 do Jarbas, 171 do Senado e 171 do CEAPS. Augusto Cury caiu de
15 para 11 fontes nunca verificadas; as quatro fontes parlamentares agora
aparecem como `N/A`. A tabela de 23 frentes e o índice de preenchimento não
mudaram.

O relatório foi regenerado em modo somente leitura e verificado em navegador
real. O DOM tem 4.462 células de cobertura, 3.698 linhas por fonte e 659 `N/A`;
em 375 px, o documento mede 360/360 px e as tabelas continuam rolando dentro do
container. Após sincronizar a PR com a `main`, os nove gates passaram novamente,
incluindo 1.932 testes.
---

## Superfície de sanções na ficha (2026-08-05, 02h)

**Estado:** pronto, commitado, PR [#93](https://github.com/thiago-salvador/puxa-ficha-oss/pull/93)
aberta (não mergeada, decisão do dono). Branch `feat/sancoes-superficie-ficha`,
worktree `wf_634f4e8c-99c-3`. Os nove gates passam (1.831 testes, 13 novos).

### O que existe agora

- **`SancoesSection`** na aba Justiça: com registro, lista; zero provado
  ("Nada encontrado nos cadastros CEIS, CNEP e CEAF (verificado em
  DD/MM/AAAA)", lido de `coleta_log_ultima`); zero presumido, estado neutro
  sem afirmação de limpeza. `resolverEstadoSancoes` em
  `src/lib/sancoes-verificacao.ts` é a regra, pura e testada: só
  `vazio_confirmado` com data vira selo; `erro`, `indeterminado` e
  `encontrado` inconsistente degradam para o neutro.
- **Leitura da proveniência:** a view não tem grant para `anon` de propósito,
  então `fetchSancoesVerificacao` em `src/lib/api.ts` lê via service role no
  server, junto das demais consultas da ficha. Falha degrada para `null`
  (estado neutro), nunca para claim falsa nem ficha degradada. Cache keyPart
  novo: `sancoes-proveniencia-20260805`.
- **DTO público** expõe `sancoes_verificacao`.
- **Card `transparencia-sancoes` reinserido** em
  `src/data/methodology-sources.ts`, `sob demanda` (cadência real), sem CEPIM.
  `docs/fontes-pendentes.md` atualizado: fonte religada, com as pendências que
  sobram (fonte pública no ponto de atenção, 96 sem CPF).

### Verificado, não suposto

- Dev server contra produção via Playwright: `lula` mostra o vazio confirmado
  com data; `alexandre-kalil` (sem CPF, desfecho `erro`) mostra o neutro.
- Banco no momento do trabalho: `coleta_log_ultima` com 98 `vazio_confirmado`
  e 96 `erro` para `transparencia-sanctions`; `sancoes_administrativas` com 0
  linhas (achado para os 98, lacuna para os 96).
- `TRANSPARENCIA_API_KEY` **já estava** como secret do GitHub
  (`gh secret list`: 2026-08-05T01:09Z, setada por outra sessão desta janela).
  Nada a fazer no item 3 do plano; a chave também está no `.env.local` local.

### Armadilha achada

- O painel de preview do Claude Code renderizou a ficha em branco depois de
  `scrollIntoView` programático; o DOM estava certo (o JS devolvia o bloco).
  Screenshot confiável saiu pelo Playwright do próprio repo. Quem for validar
  visual em worktree: `npx next dev --turbopack --port <porta>` + script
  Playwright, e `.env.local` precisa também de `SUPABASE_ANON_KEY` (o do
  checkout principal não tem; o valor é público e sai de
  `get_publishable_keys` do MCP Supabase).

---

## Redes sociais e pendências pontuais dos 27 (2026-08-05, madrugada)

Sessão de coleta manual, sem mudança de código, sem migration, sem commit. Tudo
foi escrito direto no banco de produção com rastro em `coleta_log`
(`execucao = 'manual:redes-pendencias-20260805'`, ids 1095 a 1203, 110 linhas).

### O que foi feito

1. **Varredura de redes nos 98 publicáveis sem nenhuma rede** (25 novos de
   03/08 + 73 veteranos). Resultado: **43 fichas preenchidas** com fonte
   rastreável (7 novos + 36 veteranos), **55 registradas como não achadas**,
   cada uma com o rastro de onde se procurou no `detalhe` da `coleta_log`.
   Publicáveis com pelo menos uma rede: 96 antes, **139 depois**.
   Critério de identidade: só gravei perfil com bio/conteúdo que confere com o
   cargo/trajetória (várias bios verificadas via fetch da meta description do
   Instagram), ou citado por fonte oficial (site de campanha, Assembleia,
   Câmara, site de partido, ou matéria que nomeia o handle).
2. **Cidade de nascimento dos 10 com só UF**: preenchidas 3 com fonte
   (alessandra-campelo Manaus/AM via ALEAM; ricardo-leite Jales/SP via A Gazeta
   do Acre; lenilda-luna Cabo de Santo Agostinho/PE via eufemea.com). As outras
   7 ficaram NÃO ACHEI com rastro (catherine-teles, daniela-paiva,
   naf-nascimento, priscila-felizola, prof-enfermeira-kaelly,
   washington-bandeira, aroldo-felix).
3. **preta-lu 2022 apurada em fonte oficial**: o zip nacional
   `votacao_candidato_munzona_2022` (regenerado pelo TSE em 28/07/2026) **não
   traz mais cargos proporcionais**, só majoritárias; a apuração veio de
   `votacao_secao_2022_MA.zip` (cdn.tse.jus.br): **1.105 votos nominais em 913
   seções**, SQ 100001600016, CPF do cadastro confere com o banco. Gravada 1
   linha em `historico_politico` (Candidatura: NÃO ELEITA, Dep. Federal MA
   2022, PSTU, proveniência `manual`).
4. **Os 8 sem registro TSE 2026** (re-rodada após 15/08, quando protocolarem):
   carlos-machado, elisson-ferreira, guilherme-fonseca, yuri-ezequiel,
   jose-estevao, lenilda-luna, aroldo-felix, luis-cesar-bueno. Nada forçado.

### Flags editoriais colhidas de passagem (decisão do Thiago, nada alterado)

- **jose-estevao**: a DC retirou a pré-candidatura dele em 10/06 e há disputa
  interna (Ariel Capistrano); a ficha o mantém como candidato.
- **marcelo-maluf**: noticiado como **vice** na chapa de Wellington Fagundes
  (PL/MT); o cargo_disputado da ficha (Governador) pode estar defasado.
- **gustavo-henrique**: convenção de 30/07 não reconhecida pela direção do
  Avante; nova convenção marcada para 05/08.
- **jarbas-soares**: PSB pós-convenção o mantém "sem cargo definido" (O Tempo
  02/08).
- **jarir-pereira**: PSOL-CE admite rever a candidatura própria.
- Perfis possíveis mas NÃO gravados por identidade não confirmável (para
  revisão humana): prof-enfermeira-kaelly (facebook kaellyvirginia.saraiva),
  ralf-zimmer (@ralfzimmer62), ben-mendes (IG de ~500k citado sem handle).

### Armadilhas para as próximas sessões

- O zip `votacao_candidato_munzona_2022.zip` do CDN do TSE hoje só contém
  Presidente/Governador/Senador. Votação de deputado se apura por
  `votacao_secao_<ano>_<UF>.zip` (filtrar CD_CARGO + NR_VOTAVEL/SQ_CANDIDATO).
- A meta description de `instagram.com/<handle>/` via fetch simples devolve a
  bio na maioria dos perfis públicos, e foi suficiente para confirmar
  identidade em dúvida (draluciasantos, brenobarcelos14). Falha em alguns
  (reporterbenmendes devolveu página vazia).
- Candidato de partido pequeno (PSTU/UP/PCO/DC/AGIR/MISSAO-interior) em geral
  NÃO tem perfil público encontrável por busca; o que existe é a conta do
  partido estadual. Gravar a conta do partido na ficha da pessoa seria erro.

---

## CPFs faltantes, re-varredura de sanções e processos honestos (2026-08-05, 03h30)

**Estado:** pronto, commitado, PR
[#94](https://github.com/thiago-salvador/puxa-ficha-oss/pull/94) aberta (não
mergeada, decisão do dono). Branch `feat/cpf-tse-e-processos-honestos`,
worktree `wf_634f4e8c-99c-7`. Os nove gates passam (1.834 testes).

### 1. CPFs do TSE: publicáveis com CPF foram de 98 para 163

`scripts/backfill-cpf-tse.ts` (novo): varre `consulta_cand` 2026 + 2010-2024 e
persiste `candidatos.cpf` fill-only, casando SÓ por identidade exata. Rota
`sq` (SQ do seed por ano) persistiu **65**; rota `nome-nascimento` NUNCA
persiste, só marca revisão humana (1 caso); **30** sem rota exata ficaram como
lacuna com rastro. Fonte nova `tse-cpf` em `coleta_log`
(última por alvo: 65 `encontrado`, 30 `vazio_confirmado`, 1 `erro`).
Auditoria com evidência linha a linha em `data/tse-cpf/backfill-cpf-audit.json`
(fora do git). Idempotente: segunda execução persiste 0.

**Incidente pego e revertido na própria sessão: `jarbas-soares`.** A rota
nome+nascimento casou com um "Jarbas Soares" vice-prefeito 2020/MG. A ficha é
de Jarbas Soares Júnior, ex-PGJ de MG (confirmado em O Tempo/Hoje em Dia), que
não pode ter sido candidato a vereador em 2008 nem vice-prefeito em 2020. A
`data_nascimento` do banco tem proveniência TSE, provavelmente do MESMO
casamento por nome da era pré-guard: validação circular. CPF revertido para
NULL, linhas corretivas em `coleta_log` (`tse-cpf` e
`transparencia-sanctions`), rota rebaixada em código com teste de regressão.

**⚠ Pendência humana:** o `historico_politico` de `jarbas-soares` tem 2 linhas
TSE (Cand. a Vereador 2008 SQ 47351, Vice-prefeito 2020 SQ 130000743230) que
pelo mesmo raciocínio são de homônimo e estão na ficha pública. Não removi:
decisão editorial. A `data_nascimento` 1954-03-17 dele também fica sob
suspeita.

### 2. Re-varredura de sanções nos 194 publicáveis, agora com rastro

`coleta_log_ultima`, fonte `transparencia-sanctions`, depois da rodada:
**162 `vazio_confirmado` + 31 `erro` (sem CPF válido) + 1 `encontrado`**.
Distribuição bruta da tabela (todas as rodadas):
`encontrado` 1, `vazio_confirmado` 361, `erro` 126.

**Achado real: `jose-roberto-arruda` tem 2 sanções CEIS ativas** (TJDFT,
improbidade Lei 8.429, proibição de contratar 2018-2028 e 2021-2026, com
número de processo). `sancoes_administrativas` saiu de 0 para 2 linhas, as
primeiras verdadeiras do projeto, e só existem porque o CPF dele entrou nesta
sessão. O ponto de atenção segue bloqueado pelo guard de fonte (pendência da
#85); a superfície de ficha é a PR #93 (não mergeada), que já mostra o achado
quando entrar.

### 3. Processos judiciais: comunicação honesta implementada, coleta descartada

DataJud/CNJ avaliado com chamada real: a API pública **não expõe partes nem
CPF**, então "processos da pessoa X" é consulta que não existe; busca por nome
em tribunal é o vetor de homônimo proibido. Implementado (PR #94): empty state
da aba Justiça sem a claim falsa "nas bases consultadas" e negando a
inferência de ficha limpa; card de overview com "—"/"não verificado" no zero
(perfil e skeleton, `data-pf-overview-raw` mantém o cru); rótulo sem "(0)";
critério editorial de busca ativa em `docs/criterio-processos-judiciais.md`
(presidenciáveis, ex-chefes de Executivo, busca dirigida por menção, report de
leitor com número CNJ; vazio verificado futuro via `coleta_log` fonte
`processos-curadoria`). Pendência registrada: comparador ainda mostra
"0 processos" numérico.

### Armadilhas para as próximas sessões

- **Data de nascimento com proveniência TSE não serve de âncora de identidade**
  para candidato sem SQ: pode ter vindo do casamento por nome pré-guard que ela
  estaria confirmando. Toda rota nova de identidade precisa perguntar de onde
  veio o campo que a valida.
- `coleta_log` é append-only: correção de linha errada é linha nova mais
  recente (a view `coleta_log_ultima` resolve), nunca UPDATE.
- Zips do `consulta_cand` ficam em cache em `data/tse-cpf/` do worktree
  (gitignored, ~500MB); a segunda rodada do backfill é rápida. Apagar quando
  não precisar mais.
- Background task com `| tail -30` salva SÓ as últimas 30 linhas do log da
  varredura; o estado que vale se confere no banco, não no stdout.
- O `docs/threads-lacunas` do worktree fica defasado das entradas que outras
  sessões escrevem direto no checkout principal sem commit; o append desta
  entrada foi feito no checkout principal (via filesystem MCP, porque o guard
  de worktree bloqueia Edit/Bash fora do worktree).

---

## Biografias dos 20 e causa raiz do cron de notícias (2026-08-05, madrugada)

**Estado:** pronto, commitado, PR
[#95](https://github.com/thiago-salvador/puxa-ficha-oss/pull/95) aberta (não
mergeada, decisão do dono). Branch `fix/news-cron-alcance-e-rastro`, worktree
`wf_634f4e8c-99c-8`. Os nove gates do `verify` passam (1.830 testes).

### Entrega 1: rascunhos de biografia dos 20 sem bio

`docs/rascunhos-biografias-20-novos-2026-08-05.md`, na PR. **Nada gravado no
banco.** Cada frase com fonte anotada (TSE 2026; TSE de pleitos anteriores
casado por CPF; títulos de notícias já em `noticias_candidato`; coleta manual
de 05/08), mais a lista do que NÃO deu para afirmar, por candidato. 3 dos 20
(catherine-teles, daniela-paiva, prof-enfermeira-kaelly) só têm o registro do
TSE como fonte; carlos-machado, elisson-ferreira, guilherme-fonseca e
yuri-ezequiel não têm nem dado civil (sem registro 2026, homônimos no
histórico).

### Entrega 2: causa raiz do cron de notícias, em DUAS camadas

O sintoma: 21 dos 167 antigos e 26 dos 27 novos sem nenhuma notícia. Medido no
banco: de 24/07 a 04/08, só os 5 primeiros slugs por ordem alfabética
recebiam linha por dia.

1. **Camada 1 (já corrigida na #74, nunca exercitada):** o fetch encadeado
   mirava `*.vercel.app` atrás do SSO e morria num 302 silencioso. A #74
   mergeou 04/08 15:06, DEPOIS do cron das 08:00 UTC; nenhum cron rodou com
   ela até hoje.
2. **Camada 2 (descoberta hoje ao disparar o run manual de produção):** a
   proteção anti-recursão da Vercel devolve **HTTP 508 LOOP_DETECTED no 5º
   fetch encadeado**. Evidência nos runtime logs 06:19-06:20 UTC:
   `batch_complete` cursor 0→20 e `chain_fetch_failed {"nextCursor":25,
   "status":508}`. O desenho "1 página de 5 por invocação + 39 hops" NUNCA
   cobriria 194, mesmo com a origem certa.

### O fix (PR #95)

- Invocação com **orçamento de tempo**: `maxDuration 300` (plano Pro), budget
  240s, processa quantas páginas de 5 couberem; o chain vira válvula de 1-2
  hops. Retry único no elo (`chain_fetch_retry`/`chain_fetch_failed` com
  `attempt`).
- **Rastro em `coleta_log`** (fonte `google-news`), por candidato e por
  tentativa (`encontrado`/`vazio_confirmado`/`erro`), gravado por página;
  falha de telemetria nunca derruba o lote. Era a única coleta do projeto sem
  rastro nenhum (280x "nunca verificado" com cron rodando todo dia).
- Falha de página no MEIO da invocação não vira mais 503: a cabeça fica, a
  cauda encadeia do cursor onde parou.
- `scripts/news-refresh-dry-run.ts`: o pipeline real sem gravar nada, para
  revisão título a título (`--slugs=` para escopo; sem args, roda em quem não
  tem nenhuma notícia; paginação explícita ao ler `noticias_candidato`, o
  PostgREST corta select sem range em 1000 linhas).

### Prova de alcance (validação com coleta real, handler NOVO, banco real)

Execução `local:news-refresh:2026-08-05` em `coleta_log`:

- **2 invocações** cobriram os 194: cursor 0 (19 páginas, 95 candidatos,
  240s) e cursor 95 (20 páginas, 99 candidatos, 245s). `chainDepth` máximo
  **1**, zero `chain_fetch_failed`, zero erros.
- **194/194 publicáveis com linha `google-news`**: 186 `encontrado` (2.909
  linhas enviadas ao upsert) e 8 `vazio_confirmado`, 0 `erro`.
- Publicáveis sem NENHUMA notícia: **24 antes → 4 depois** (catherine-teles,
  daniela-paiva, laudicerio-aguiar, prof-enfermeira-kaelly), e para os 4 o
  zero agora é PROVADO (`vazio_confirmado`), não "nunca verificado".
- `noticias_candidato`: 20.046 linhas ao final.

### Furo do guard de relevância, medido com exemplos novos

Além do furo cabeça-de-chapa já documentado, o guard aceita homônimo por
token de primeiro nome ou de título genérico. Pegos na revisão título a
título dos 24 e **removidos do banco na mesma sessão** (revert de escrita
própria; 9 linhas, ids conferidos antes e depois):

- `gustavo-henrique` (PI): "Bolsonaro indica Gustavo Canuto...", "Com Gustavo
  Dias Henrique, DF volta a ter um vice-presidente na CBF", "Gustavo Fernandes
  é um dos deputados mais atuantes do RN" (3 pessoas diferentes).
- `vera-lucia` (PSTU/SP): "Vera Lúcia Ferreira Copetti" desembargadora (x2),
  "Missa de Sétimo Dia Vera Lúcia" (obituário de outra pessoa), "Vera Castelo
  Branco" (x2).
- `jeremias-cosmo` (PE): "Tuxaua Benísio e Professor Abraão..." (casou por
  "Professor").

**⚠ O próximo cron REINSERE as 9** (mesmo guard, upsert por candidato_id+url).
Apertar o guard é decisão editorial: o afrouxamento é deliberado e documentado
em `src/lib/news/name-match.ts`. A PR não muda a semântica; o dry-run é o
instrumento de revisão enquanto a decisão não sai.

### Flag editorial colhida de passagem (nada alterado)

- **olimpio-rocha**: a federação PSOL-Rede BARROU a candidatura dele ao
  governo da PB (03-04/08: G1 "PSOL-Rede retira apoio a Lucas Ribeiro e barra
  candidatura de Olímpio Rocha", ParaibaOnline, ClickPB). A ficha o mantém
  candidato a Governador/PB.

### Pendências

1. **Depois do merge, observar o cron das 08:00 UTC**: `batch_complete` com
   `paginas` > 1 e `chainDepth` <= 2, `coletaLogOk: true`, nenhum 508; e
   `coleta_log` com `execucao = vercel:news-refresh:<data>`.
2. **O cron de HOJE (08:00 UTC, pré-merge) ainda roda o código antigo**: vai
   cobrir ~25 candidatos e morrer no 508. Esperado, não é regressão.
3. Decisão editorial sobre o guard de homônimos (acima).
4. Os 4 com `vazio_confirmado` seguem sem notícia por falta de cobertura da
   imprensa, não por falha de coleta; re-verificação é automática no cron.

### Armadilhas para as próximas sessões

- A proteção anti-recursão da Vercel NÃO aparece em doc de limites óbvia: ela
  se manifesta como 508 no fetch de função para o próprio deployment a partir
  do ~5º hop da cadeia. Qualquer cron auto-encadeado do projeto
  (`send-digest` inclusive) está sujeito; o send-digest hoje só tem 1
  assinante (1 lote), então não dispara, mas vale vigiar se crescer.
- `npx vercel env pull` com `--cwd` grava o arquivo no cwd apontado, não no
  diretório atual; o `.env.vercel-prod` foi movido para o scratchpad e não
  ficou no checkout.
- O dry-run acidental provou outra armadilha: `select` sem `range` no
  PostgREST corta em 1000 linhas EM SILÊNCIO; um filtro "quem não tem
  notícia" montado assim rodou em 185 candidatos em vez de 24 (sem dano:
  captura sem escrita).

---

## Preparação da revisão editorial da fila de 61 (2026-08-05, 04h20)

Sessão somente leitura: nenhum `visivel`/`verificado` alterado, nenhum commit,
nenhuma migration. Preparou a pauta de decisão do Thiago.

- **Recontagem (SQL em produção, publicáveis):** 9 posições `verificado=false`
  + 47 pontos `visivel=false` sem `despublicacao_motivo` + 5 pontos de IA no ar
  sem revisão = **61**, igual ao pós-resgate. As etapas desta janela não
  somaram itens.
- **Os 5 IA-no-ar** são todos "Carreira política: N mandato(s)". Fontes
  oficiais conferidas por fetch: recomendação MANTER para cleitinho e
  roberto-claudio; TIRAR/reformular para fabio-trad (a própria fonte da Câmara
  registra 3 mandatos contra "1" do título), laurez-moreira (histórico da ficha
  não tem Vereador nem o mandato federal; omite Vice-Governador atual) e
  wellington-fagundes (Câmara registra 5 mandatos de dep. federal contra "2").
- **Amostragem de 10 "Carreira política" contra `historico_politico`: 4/10
  consistentes (40%)**, e os 4 só fecham lendo "N mandatos" como "N cargos
  distintos". Divergentes: fabio-trad, laurez-moreira, cicero-lucena (omite 2
  mandatos de Senador), david-almeida (lista Governador que no histórico é só
  candidatura 2018), omar-aziz (Vereador inexistente; omite Senador atual),
  tiao-bocalom (Vereador PR inexistente). **Recomendação: não aprovar em
  lote**; corrigir o gerador e re-emitir a família.
- **Trava que a decisão precisa respeitar:** 4 itens em alta/crítica SEM fonte
  (2 do felicio-ramuth, Operação Icaro e declaração sobre a PM do Tarcísio)
  são inaprováveis pelo gate da migration 20260725160000 até ganharem URL.
- **Sinalização de justiça:** o "Condenado em 2a instancia por caixa 2" do
  haddad-gov-sp registra na descrição que o TSE ANULOU em 2022; publicar sem a
  anulação no título é injusto. Item destacado na pauta com recomendação de
  reformular.
- **Anomalia achada:** `orleans-brandao` é o único item da fila com
  `gerado_por=curadoria` e `verificado=true`, invisível sem motivo.
- **Superfície de decisão:** `npm run audit:cobertura` gerou
  `~/.disposable-html/revisao/` (40 páginas + `lote.html`, 61 itens; servir com
  `npm run audit:cobertura:servir`, POST acumula JSONL sem tocar banco). Como o
  lote.html não traz gravidade/efeito/recomendação, foi gerada a página
  complementar `~/.disposable-html/2026-08-05-pauta-revisao-editorial.descartavel.html`
  (61 linhas: título, classe, gravidade, fonte clicável, efeito de
  aprovar/rejeitar, recomendação; + pauta de PRs #93/#94/#95 e gaps). Nada foi
  servido/aberto: entrega final é da sessão principal.

---

## Varredura sistemática de homônimos e correções (2026-08-05)

**Estado:** migrations `20260805132000` a `20260805137000` aplicadas no
Supabase e preparadas no mesmo PR; readback concluído. A PR #103 é a base. A
rota `nome+nascimento` continua apenas como sugestão para revisão humana e não
persiste CPF.

### Correções confirmadas

| Ficha | Dado de terceiro | Evidência que separa as pessoas | Ação |
|---|---|---|---|
| `renato-gomes` | 2 patrimônios, 1 financiamento, 2 candidaturas, nome civil, naturalidade, profissão e formação de Renato da Silveira Gomes | O SQ 120000886590 é vereador 2020/MDB e declara empresário com ensino médio completo; a pessoa da ficha é Renato Wanderley Gomes, economista e pré-candidato do DC. Nome de urna e UF não provam identidade | Remover 5 linhas; naturalidade, profissão e formação ficam nulas. `nome_completo`, que é `NOT NULL`, recua para o `nome_urna` já exibido, sem adotar o nome civil da imprensa. CPF, nascimento e idade já estavam nulos |
| `jarbas-soares` | 2 candidaturas de homônimo e nascimento antigo | MPMG oficial: Jarbas Soares Júnior nasceu em 06/09/1964 e foi procurador-geral em 2004-2008 e 2020-2022 | Despublicar as candidaturas e reapurar o nascimento pela fonte oficial |
| `cadu-xavier` | CPF, nascimento, 7 outros campos pessoais, patrimônio, financiamento e candidatura a vereador de um estudante de 2020 | TSE: estudante nascido em 1999, vereador Mossoró/DEM, SQ 200000998862. DOE-RN registra o Cadu da ficha como secretário em 2019; Itatiaia registra 2026 como primeira disputa | Zerar campos pessoais, remover dinheiro, despublicar histórico e invalidar vazios de sanções feitos com CPF do homônimo |
| `juliana-brizola` | Candidatura a vereadora em Ronda Alta/PSL | TSE 2020 separa Juliana Daudt Brizola, prefeita Porto Alegre/PDT, SQ 210001189949, de Juliana Maria Mittelstaedt Brizola, vereadora Ronda Alta/PSL, SQ 210001233500 | Despublicar só a linha de vereadora; preservar candidatura, patrimônio e financiamento da pessoa correta |

### Sinais varridos e descartados

- `nome+nascimento` em `coleta_log`: um único match recente, `jarbas-soares`,
  já bloqueado para revisão; nenhum outro CPF foi persistido por essa rota.
- SQ do histórico divergente do SQ do seed no mesmo ano: zero caso visível.
- idade abaixo do mínimo constitucional no pleito: zero caso real; o único
  sinal bruto, `samara-martins`, completa 35 anos antes da eleição de 2022.
- nome civil TSE divergente do nome que abre a biografia: apenas
  `renato-gomes` depois de eliminar abreviações e nomes de urna.
- duas candidaturas a cargos diferentes no mesmo pleito: `juliana-brizola` é
  o caso novo de homônimo; `henrique-areas` e `indira-xavier` são duplicatas
  tratadas pela migration `20260805133000`; `huggo-leonardo` é troca de
  pré-candidatura, e as linhas de filiação de `garotinho` não são outra pessoa.
- trajetória de Ministério Público: `ismar-marques` foi sinalizado pela bio,
  mas os arquivos oficiais TSE 2014 e 2018 repetem nome civil e nascimento da
  ficha; não há evidência de homônimo e nada foi alterado.
- cargo não eleitoral antes dos 21 anos: só `cadu-xavier`, confirmado como
  contaminação pelo conjunto TSE + DOE-RN + primeira candidatura em 2026.

Fontes principais: [TSE Candidatos 2020](https://dadosabertos.tse.jus.br/dataset/candidatos-2020-subtemas),
[DOE-RN de 08/08/2019](https://webdisk.diariooficial.rn.gov.br/Jornal/12019-08-08.pdf),
[perfil de Cadu Xavier](https://www.itatiaia.com.br/politica/eleicoes/conheca-a-carreira-politica-de-cadu-xavier-pre-candidato-ao-governo-do-rn/)
e [galeria oficial do MPMG](https://www.mpmg.mp.br/lumis/portal/file/fileDownload.jsp?fileId=8A9480678602D08F018636EF49986C71).

Revisão da PR: o `UPDATE` das duplicatas foi restringido aos dois slugs,
anos, partidos e tipos de evento confirmados. A migration `20260805137000`
corrigiu no banco o detalhe de auditoria de Renato: `nome_completo` recuou para
`nome_urna`; naturalidade e profissão voltaram a `NULL`.
[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## N9 — desfecho explícito de Wikipedia e Wikidata (2026-08-06)

**Estado:** os quatro ingests de Wiki agora devolvem `encontrado`,
`vazio_confirmado`, `nao_aplicavel` ou `erro` com detalhe explícito, sem
migration e sem executar ingest.

- `wikipedia` confirma verbete mesmo quando os dados já estavam no banco;
  título ausente fica `nao_aplicavel`, e fallback local não é atribuído à
  consulta remota.
- `wiki-historico` registra candidato sem título, separa payload inválido de
  resposta vazia e considera cargos retornados como encontrados mesmo sem data
  gravável.
- `wikidata` distingue QID ausente de consulta SPARQL vazia e preserva o
  fallback seguro de QID via Wikipedia. `wikidata-politico` mantém fonte,
  volume e erros de persistência separados.
- HTTP não-2xx, timeout, parse, schema remoto inválido e falha de banco viram
  `erro`. O mapper de `coleta_log` preserva volume parcial em erro declarado.
- Dois achados acionáveis do CodeRabbit foram validados e corrigidos: o
  `Retry-After` de `wiki-historico` agora respeita o teto de 60 segundos, e
  `wikidata-politico` preserva `rows_upserted` e `tables_updated` quando uma
  escrita posterior falha depois de linhas já persistidas.
- Projeção sobre o último retrato documentado: 49 indeterminados resolvíveis
  após nova coleta autorizada, sendo 23 de `wikipedia` e 26 de `wikidata`. O
  número é projeção; não houve readback nem nova linha em produção.
- Verificação local após o review: 66 testes focados, `check:scripts`,
  typecheck, lint sem erros, 2.085 testes completos e `git diff --check`. O aviso de lint em
  `scripts/audit/coverage-report.ts` já existia e está fora do diff.
- Não houve migration, escrita de dados editoriais, ingest de produção, merge
  ou deploy.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

---

## Infraestrutura de procedência da curadoria (2026-08-05)

**Estado:** pronta na branch `codex/curadoria-proveniencia`, baseada no commit
`013df47` da PR #105. Nenhum dado de candidato foi alterado e a migration nova
não foi aplicada no Supabase.

- `processos-curadoria` e `contradicoes-curadoria` agora têm procedência no
  `coleta_log` e no relatório de cobertura.
- `sem_achado_no_escopo` registra curadoria concluída sem prometer ausência
  absoluta. Contradições recusam `vazio_confirmado`.
- `npm run data:curadoria:registrar` valida slug público, frente, data, detalhe,
  URLs, identidade e evidência publicável. O padrão é dry-run; escrever exige
  `--apply`.
- Processos só aceitam `vazio_confirmado` quando o detalhe declara órgãos,
  jurisdição, período e termos da busca.
- Os nove gates passaram. O relatório real preservou 4.462 células, incluiu as
  duas fontes para os 194 candidatos e ficou sem rolagem horizontal a 375 px;
  as tabelas largas rolam dentro do container.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

---

## Ingests históricos pendentes (2026-08-05)

Execução em worktree isolado baseado na PR #105, com escrita no Supabase apenas
por `scripts/ingest-all.ts`. O inventário direto no banco encontrou 194
pendências em `tse-historico`, 194 em `filiacao`, 102 em
`wiki-historico` e 83 em `wikidata-politico`.

- `tse-historico`: 159 encontrados, 32 vazios confirmados e 3 não
  aplicáveis; +194 linhas em `historico_politico` e +80 em
  `mudancas_partido`.
- `wiki-historico`: 21 vazios confirmados e 81 não aplicáveis; nenhuma
  escrita.
- `wikidata-politico`: 76 encontrados e 7 vazios confirmados; +12 linhas em
  `historico_politico` e +15 em `mudancas_partido`.
- `filiacao`: 194 indeterminados e nenhuma escrita. O arquivo oficial atual é
  agregado por perfil e não contém filiação individual; a execução falha
  fechada em vez de converter esse bloqueio em vazio.
- A régua mudou 37 células, todas após TSE: 9 `zero -> ok` e 28
  `na -> missing`. As demais fontes não mudaram células.

Os nove gates locais passaram após substituir, apenas no worktree, o symlink de
`node_modules` por uma cópia local exigida pelo Turbopack. Evidência completa:
`~/.disposable-html/2026-08-05-puxa-ficha-ingests-historicos.evidence.json`.
---

## Busca ativa de processos da coorte pública (2026-08-05)

**Estado:** curadoria de processos aplicada no Supabase a partir da branch
`codex/processos-curadoria-20260805`, baseada exatamente no commit `022d3ed`
da PR #108. A coorte foi recalculada no banco: 194 fichas públicas, 185 sem
processos no snapshot inicial.

- Os 185 candidatos foram pesquisados em 10 lotes atômicos: 50 `encontrado`,
  16 `vazio_confirmado` e 119 `indeterminado` por bloqueio concreto.
- A evidência canônica registra 204 números CNJ atribuíveis e 3.558 ocorrências
  ambíguas descartadas da publicação. DataJud ficou indisponível por timeout em
  204/204 conferências auxiliares; nenhum achado dependeu dele para identificar
  a pessoa.
- O aplicador gravou 185 linhas em `coleta_log` (`processos-curadoria`) e não
  alterou `processos` nem `pontos_atencao`; os checksums antes/depois ficaram
  idênticos.
- O relatório final mostra, na coluna Processos, 50 `coletado`, 16
  `zero_provado` e 119 `nao_sabemos`. Os 204 achados permanecem sem publicação
  e dependem de aprovação editorial do Thiago; a lista separada está em
  `~/.disposable-html/2026-08-05-puxa-ficha-processos-aprovacao-thiago.csv`.
- A PR #113 foi aberta sobre `codex/curadoria-proveniencia`; `verify`, build das
  rotas e Vercel passaram, e o check de acessibilidade não se aplicou.
- Gates finais: dry-run 185/185, 94 testes integrados e 60 adversariais,
  `check:scripts`, typecheck, ESLint, `git diff --check`, readback do Supabase e
  renderização real do relatório.
[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

---

## Correção do handoff editorial de processos (2026-08-05)

**Estado:** a lista bruta de 204 CNJs foi substituída por uma revisão editorial
explicada e interativa. Nenhum processo foi publicado.

- O CSV anterior era um inventário técnico e não dava base suficiente para uma
  aprovação responsável.
- Dois revisores independentes classificaram os 204 registros, e uma auditoria
  principal reconciliou as recomendações pela régua I/R/P/S/D/L: identidade,
  papel direto, interesse público, estado oficial, família deduplicada e
  linguagem neutra.
- A primeira reconciliação foi rejeitada por ser caridosa demais: ela usava
  falta de interesse público como motivo para apagar processos pessoais e
  confundia ausência de acusação pessoal com ausência de interesse editorial.
- A auditoria adversarial dos 157 descartes manteve só 86 como exclusões
  seguras. A classificação corrigida tem 6 `publicar em Processos`, 65 CNJs que
  sustentam 6 pontos de atenção agregados, 47 `pesquisar mais` e 86 exclusões.
  O total foi conferido contra a evidência: 204 CNJs únicos, sem ausência,
  duplicata ou item extra.
- A página
  `~/.disposable-html/2026-08-05-puxa-ficha-processos-revisao-editorial.descartavel.html`
  explica cada decisão, mantém a recomendação pré-marcada e registra a escolha
  de Thiago sem escrever no Supabase.
- O fluxo corrigido foi testado em navegador automatizado, sem abrir o Comet:
  uma recomendação foi alterada para ponto de atenção, a instrução livre foi
  enviada por `POST /aplicar` e o JSON resultante preservou as 204 decisões. O
  teste não publicou ficha nem alterou dados.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Revisão final editorial de processos (2026-08-06)

**Estado:** os 204 CNJs foram editorialmente reconciliados em 56 publicáveis,
13 ligados a pontos de atenção aprovados, 108 não publicáveis e 27 bloqueios
concretos.
Nenhum dado foi escrito no Supabase.

- Os 47 casos de pesquisa foram revisados em lotes de 20, 20 e 7, com sete
  bloqueios por falta de prova pública suficiente. A revisão adversarial dos
  86 descartes anteriores manteve 49, promoveu 20 e bloqueou 17.
- Os seis processos antes publicáveis e os seis grupos de pontos de atenção
  foram reavaliados contra as fontes oficiais. Três grupos foram aprovados,
  dois rejeitados e um bloqueado.
- A evidência final passou por validação estrutural, teste focado, checagem de
  scripts, lint, `git diff --check`, 2.002 testes do repositório naquela execução
  e teste real do canal `POST /aplicar` no navegador. A sucessora integrada
  revalidou o conjunto com 2.013 testes.
- Aplicação no banco, leitura pós-migração e liberação do deploy continuam
  dependentes de aprovação explícita.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Aprovação editorial da revisão final (2026-08-06)

**Estado:** a classificação editorial dos 204 CNJs foi aprovada na task de
Thiago. O canal local `POST /aplicar` registrou o payload às 00:48 BRT, com
`decisao: aprovar` e sem instruções adicionais; esse endpoint local registra a
decisão, mas não funciona como prova de autenticação de identidade.

- A aprovação alcança somente a classificação editorial documentada na PR
  #115.
- Preparação e aplicação de migrations, escrita no Supabase, merge, métricas
  finais e deploy de produção continuam sem autorização.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## N12 — reconciliação definitiva do histórico de migrations (2026-08-06 08:52 BRT)

**Estado:** sucessora limpa da PR #107 preparada sobre `origin/main`
`181cca8fc948a97a19c4a601f787ec4cc9f51187`, sem escrita no Supabase.

- O ledger remoto reconhece `20260805003740`, `20260805004921`,
  `20260805120133`, `20260805120633` e `20260805123929` como aplicadas. Os
  quatro arquivos históricos foram renomeados para esses timestamps, e a
  migration editorial `20260805123929` foi recuperada; o SQL local corresponde
  ao remoto após normalizar comentários e espaços.
- Os efeitos antes preparados como `20260805160207` e `20260805160212`
  continuam pendentes. O readback confirmou a ausência da coluna e do índice
  de hash do pedido de e-mail; o índice de analytics existe, mas a tabela ainda
  não possui o comentário de retenção de 90 dias.
- A PR #117 integrou `20260805200145` já aplicada no ledger e mudou a ordenação.
  Por isso, os dois forwards foram portados para `20260806114753` e
  `20260806114754`, posteriores ao ledger atual. As demais integrações de #105,
  #110 e #116–#122 não acrescentaram migrations relevantes; a #122 permaneceu
  sem migration e os 204 CNJs ficaram fora deste escopo.
- `supabase db push --linked --dry-run` terminou com exit 0 e listou somente
  `20260806114753_alert_subscribers_last_email_request_ip_hash_forward.sql` e
  `20260806114754_analytics_launch_events_retencao_90_dias_forward.sql`.
- Verificação local em Node 24: 33/33 testes focados de migrations, 2.014/2.014
  testes completos, `check:scripts`, typecheck e lint passaram. O lint manteve
  um aviso preexistente em `scripts/audit/coverage-report.ts`; nenhum erro.
- Não houve `db push`, `migration repair`, `apply_migration`, SQL de escrita,
  migration dos 204 CNJs, merge, deploy ou revalidação de produção.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
