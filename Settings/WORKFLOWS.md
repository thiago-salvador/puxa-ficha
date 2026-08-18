# Workflows

## Gate de entrada da task

Antes de planejar ou editar, responda em uma frase: "Como esta task aproxima o
Puxa Ficha da base mais completa e confiável possível sobre cada candidato?"

A resposta deve indicar um efeito verificável na cobertura, atualidade,
identidade, proveniência, publicação no frontend ou capacidade de manter esses
resultados. Registre também a menor prova que confirmará o avanço. Se não houver
ligação concreta com o objetivo, não execute a task.

## Mudança de código

1. Comece do `main` atual e limpo na pasta canônica.
2. Crie uma branch `codex/<objetivo>` quando a mudança precisar de isolamento.
3. Inspecione chamadores, schema, contrato público e testes antes de editar.
4. Faça a menor mudança que corrija a causa compartilhada.
5. Rode os gates proporcionais e um teste que falharia sem a correção.
6. Faça commit com Thiago Salvador como autor principal. Quando um agente
   produzir a mudança, registre-o em um trailer `Co-Authored-By` válido.
7. Abra PR sem fazer merge, salvo autorização explícita.
8. Depois do merge/deploy, confirme commit, deployment e comportamento público.

## Atualização de dados

1. Defina o universo por `SQ_CANDIDATO` ou outro identificador oficial aceito.
2. Declare fonte, escopo, resultado possível e política de erro.
3. Execute dry-run e confira cardinalidade, duplicatas e identidade.
4. Persista em lote fechado. Casos ambíguos vão para quarentena.
5. Registre a tentativa em `coleta_log`, inclusive falha ou ausência confirmada.
   Quando o passo 4 tiver escrito em tabela de produção, essa linha não é
   opcional nem manual: ela sai de `escreverAuditado()` e é conferida por gate.
   Ver "Escrita em produção fora de migration", abaixo.
6. Leia o banco diretamente e compare totais, somas e amostras.
7. Revalide apenas as tags públicas afetadas.
8. Leia a API e a ficha pública.
9. Rode `npm run audit:cobertura` e registre a nova lacuna ou ganho.

Esse fluxo é indivisível para a definição de concluído. Um pipeline funcional
que não altera a ficha é um pipeline ainda não integrado.

## Migrations

O ledger `supabase_migrations.schema_migrations` significa uma coisa só:
migration aplicada. Nada além disso entra nele. Execução de script de serviço,
correção pontual de dado, carga manual e conserto de emergência não viram linha
de ledger, nem quando seria conveniente ter um registro em algum lugar. Inserir
ou reescrever linha ali para registrar algo que não é migration, ou para
acomodar o nome de um arquivo, é mudar produção para salvar a aparência do
repositório, e foi assim que a issue #131 nasceu. A decisão e as alternativas
descartadas estão em
[`docs/arquivo/decisao-trilha-de-escrita-20260808.md`](../docs/arquivo/decisao-trilha-de-escrita-20260808.md).

O que precisa de rastro e não é migration vai para a trilha de escrita descrita
na próxima seção. São duas superfícies separadas de propósito, e nenhuma
substitui a outra: o ledger responde "que schema é esse", a trilha responde
"quem mexeu no dado".

- Migrations são sequenciais e nunca devem reescrever o histórico já aplicado.
- Antes de `db push`, compare os ledgers local e remoto.
- Use allowlist fechada das migrations esperadas.
- Dados e schema devem ter dry-run ou consulta equivalente antes da escrita.
- Pare diante de migration inesperada, identidade ambígua ou mudança de
  cardinalidade fora do planejado.
- Depois da aplicação, confira ledger, tabelas/views e superfície pública.

### Schema e curadoria não moram no mesmo arquivo

Regra de 08/08/2026, issue #136. **Migration que cria objeto persistente não
carrega dado de ficha.** Precisa dos dois, são dois arquivos: um de schema, um
de curadoria. `tests/migrations-classificacao.test.ts` reprova migration nova
que misture, contra uma lista fechada de 25 casos históricos, e congela o
conjunto inteiro de quebras previstas em
`scripts/audit/quebras-previstas.json`: entrada nova ali é regressão de replay
em qualquer posição, não só depois da 178ª.

A regra existe porque `supabase/migrations/` não é ordenado por dependência, e
não há como consertar isso sem reescrever o passado, que a #131 proíbe:

- Migration que consome uma entidade vem antes da que a cria. A `20260507130000`
  e a `20260511112000` leem `eduardo-paes`; quem o insere é a `20260522160000`,
  quinze arquivos depois.
- Metade das migrations de curadoria esconde isso com `IF ... IS NULL THEN
  RETURN`, que aplica e não faz nada. A `20260511112000` não tem o guard, trata
  candidato ausente como violação de invariante e derrota o replay.
- O CLI do Supabase não oferece saída: `schema_paths = []`,
  `[db.seed] enabled = false`, e a ordem é o prefixo do nome do arquivo. Não
  existe manifesto nativo para pular ou reordenar, então a separação é convenção
  verificada por gate.

Comandos, os dois de custo zero e sem `--linked`:

```bash
npm run audit:migrations:classificar
npm run audit:migrations:replay -- --schema-gate
npm run audit:migrations:replay -- --comparar
```

O replay sobe containers Postgres 17 próprios com nome único por execução (um
trap remove só o que a execução criou), aplica migration a migration numa
transação cada (como o CLI faz). Medição de 09/08/2026, refeita depois de a
vistoria dos PRs #141/#142 derrubar a prova anterior por contagem de objetos:

| Modo | Resultado |
|---|---|
| linear, todas as 375 | 178 aplicam limpo; a 179ª (`20260511112000`) quebra na pós-condição; tolerante: 290/86 (era 289/86 antes de a 20260809060000 entrar) |
| só a classe `schema` | 23 limpas, e então quebra: `alert_subscribers` nasce dentro de uma migration mista |
| `--schema-gate` | **66 de 66 aplicam**, zero falhas; cinco origens mistas substituídas e duas retidas excluídas mecanicamente |
| `--comparar` | **prova estrutural por diff de `pg_dump --schema-only`**, linha a linha (165 CREATEs, com colunas, índices, constraints, policies e grants): equivalente, com delta único conhecido |

O delta único do `--comparar` é a constraint `candidatos_status_dominio` (2
linhas), da mista `20260805120633`: ela falha no replay linear por pré-condição
de dado e aplica no só-DDL. Produção TEM a constraint, então o lado só-DDL é o
correto. O delta esperado é canônico, congelado com lado e conteúdo exatos em
`scripts/audit/lib/comparar-dumps.py` (rodada 3 da vistoria): linha inesperada
reprova, delta esperado ausente reprova, e definição alterada da constraint
deixa de passar por conter a substring certa.

E a previsão estática deixou de ser o único gate: o modo `--gate` roda o replay
linear REAL (tolerante) e compara o conjunto de falhas com o manifesto
congelado em `scripts/audit/falhas-replay-linear.json` (290 aplicadas, 86
falhas). O workflow `.github/workflows/replay-migrations.yml` executa isso em
todo PR que toque migrations ou o harness, então uma migration que classifica
como schema mas quebra o Postgres de verdade (FK para tabela inexistente, por
exemplo) reprova no CI, em qualquer posição da fila. O mesmo workflow roda
`--schema-gate`; o piso deixa de ser uma constante estática e passa a ser 66
migrations aplicadas de verdade, sem tolerância a falha. O `pg_dump` canônico
desse schema também tem SHA-256 congelado no manifesto; a imagem Postgres 17 é
presa a digest para a ferramenta não mudar por baixo do gate.

As cinco mistas aplicadas foram separadas de forma aditiva. Os arquivos abaixo
continuam imutáveis como histórico de curadoria; a DDL deles foi reproduzida em
`20260809052600_schema_extraido_migrations_mistas.sql`. O manifesto
`scripts/audit/schema-replay-substituicoes.json` congela o SHA-256 de cada
origem, exige o substituto puro e impede que a exclusão vire uma allowlist cega:

- `20260710222500_sc_state_completion.sql`
- `20260726160000_despublicar_historico_por_homonimo.sql`
- `20260726180000_identidade_jeronimo_e_homonimo_dorinha.sql`
- `20260805123929_aplicar_decisoes_editoriais_20260805.sql`
- `20260807181000_patrimonio_ausencia_oficial.sql`

O recorte bruto agora tem 73 migrations com DDL. O replay efetivo tem 66: as
cinco origens acima saem em favor do substituto e as duas mistas retidas ficam
fora porque não pertencem ao schema aplicado de produção. Isso não altera linha
do ledger nem afirma que a curadoria é reconstruível; apenas prova que o schema
é.

## Escrita em produção fora de migration

Toda escrita de operador em tabela de produção que não vem de uma migration
passa pelo helper `escreverAuditado()`, em
[`scripts/lib/escrita-auditada.ts`](../scripts/lib/escrita-auditada.ts).
"Escrita de operador" é o recorte exato da regra e da conferência: código de
`scripts/`, rodado por uma pessoa contra o banco de produção. Escrita de runtime
disparada por request do usuário final é outro regime, tratado em "O que fica
fora do recorte", abaixo. Ele
grava uma linha em `coleta_log` com `natureza = 'escrita'` carregando quem
executou (`fonte` e `execucao`), por que (`detalhe`, começando pelo motivo
declarado), qual tabela (`alvo`), quantas linhas o banco confirmou ter tocado
(`volume`) e quando (`executado_em` e `duracao_ms`).

Três propriedades do helper valem como contrato, não como detalhe de
implementação:

- **Volume é medido, não estimado.** A contagem sai do `.select()` encadeado na
  própria escrita. Payload de 300 linhas com `WHERE` que casa 12 é exatamente o
  caso em que estimativa vira mentira registrada.
- **Falha também deixa rastro.** Escrita que abortou grava `resultado = 'erro'`
  antes de a exceção subir. Sem isso, um `--apply` que quebrou na metade fica
  indistinguível de um `--apply` que nunca rodou.
- **Trilha que não grava derruba o processo.** É o oposto da regra de
  `scripts/lib/coleta-log.ts`, onde telemetria nunca mata o ingest. Ingest sem
  telemetria perde uma linha de relatório; escrita de operador sem trilha é o
  defeito da issue #131 acontecendo de novo.

### A regra deixou de ser só texto

O passo 5 de "Atualização de dados" manda registrar a tentativa em `coleta_log`
desde 04/08. Ninguém nunca conferiu, e a medição de 08/08 mostrou o resultado:
oito scripts escreviam em tabela de domínio sem passar por trilha auditada, e um
deles é o caso 1 da própria issue #131. Desses oito, sete não mencionavam
`coleta_log` em lugar nenhum do arquivo; o oitavo, `backfill-cpf-tse.ts`,
registrava, mas como coleta, sem dizer o motivo nem quantas linhas mudou. Regra
escrita e não conferida é regra que não existe.

Os oito foram migrados para o helper na mesma rodada. A medição de
`auditarRepositorio()` sobre o repositório inteiro passou a dar **zero
inadimplentes** em 270 arquivos lidos, com 30 exceções declaradas e nenhuma
obsoleta.

A conferência agora é mecânica e mora em dois arquivos:

- [`scripts/audit/lib/escrita-auditada-gate.ts`](../scripts/audit/lib/escrita-auditada-gate.ts)
  varre os `.ts` dos recortes declarados em `RECORTES_AUDITADOS`, hoje `scripts/`
  e `src/`, e detecta escrita que não passa pelo helper. A unidade de detecção é
  a cadeia de chamadas a partir de `.from(...)`, não o verbo isolado:
  `crypto.Hash#update` e `Map#delete` não são escrita em banco, e um gate que os
  acusasse seria desligado na primeira sexta-feira.
- [`tests/escrita-auditada-gate.test.ts`](../tests/escrita-auditada-gate.test.ts)
  roda essa varredura contra o repositório real e trava a lista de arquivos
  inadimplentes. Arquivo novo na lista exige decisão humana; arquivo que saiu da
  lista derruba o teste até alguém tirá-lo de lá. É essa trava que cobre a
  limitação conhecida da varredura, que é análise de texto e não de tipos.

### Isenções que o gate conhece, e por que cada uma existe

Estas vivem no código do gate, como constante exportada, e o teste as consome.
Nada entra sem motivo escrito.

- **Tabelas de trilha** (`TABELAS_DE_TRILHA`): escrita cujo alvo é `coleta_log`.
  Cobre `scripts/lib/coleta-log.ts`, que é a outra metade da trilha, e o próprio
  `scripts/lib/escrita-auditada.ts`, porque passar o helper por si mesmo é
  recursão. Não expiram.
- **Estado de ferramenta** (`TABELAS_DE_ESTADO_DE_FERRAMENTA`):
  `link_check_url_observacao`, escrita em toda execução inclusive dry-run, porque
  confirmar URL morta em duas rodadas é o algoritmo. Nada dela chega ao leitor.
- **Pipeline de coleta** (`PADRAO_PIPELINE_DE_COLETA`, que casa
  `scripts/lib/ingest-*.ts` e `scripts/lib/enrich-*.ts`): já deixam trilha, só
  não escrita pelo próprio módulo, porque `scripts/ingest-all.ts` registra o lote
  com `registrarColetaDeResultados()`. A isenção é verificada, não confiada: o
  teste confere que todo arquivo isento por esta classe declara um `source:` que
  `FONTES` conhece. Além disso, rotear ingest pelo helper faria telemetria matar
  coleta, que é o oposto da regra de ouro de `coleta-log.ts`.
- **Por forma do código**: alvo em tabela temporária (`tmp_*`, `temp_*`,
  `_temp`) e cliente cujo identificador diz `local`, `test`, `fixture`, `stub`,
  `fake` ou `mock`, porque nenhum dos dois é estado publicado.

Nenhuma exceção é regex genérica sobre verbo: cada uma é entrada nomeada, com
motivo escrito ao lado, e `auditarRepositorio()` acusa exceção **obsoleta**, ou
seja, entrada que parou de escrever direto e ficou mentindo na lista. A lista não
cresce sozinha e também não pode envelhecer em silêncio.

### Escrita de runtime em `src/`

`src/` está dentro do recorte, não fora. Entrou porque o cron de notícias e as
rotas de alerta escrevem em produção tanto quanto um script, e deixar a superfície
de runtime fora seria um buraco do tamanho do app.

O que é exceção nomeada ali (`EXCECOES_DE_RUNTIME`, 8 entradas) são escritas
disparadas por request do usuário final sob consentimento, não por operador: as
rotas de alerta em `src/app/api/alerts/` (alvos `alert_subscribers`,
`alert_subscriptions` e `notification_log`), mais
`src/lib/analytics-launch-store.ts` e `src/lib/quiz-short-link-store.ts`. As
tabelas envolvidas não têm nenhuma ocorrência em `src/lib/api.ts`, logo estão
fora da superfície pública, e uma linha de trilha por request inundaria a tabela
que o gate lê, transformando trilha de operador em log de tráfego.

Separada dessas, `EXCECOES_DE_COLETA_EM_RUNTIME` cobre
`src/app/api/news/refresh/route.ts`, que já deixa trilha própria em `coleta_log`,
no mesmo contrato dos `ingest-*` de `scripts/lib`.

Consequência que continua valendo: escrita de operador nova que apareça em `src/`
é acusada pelo gate como qualquer outra, e só sai da lista com entrada nomeada e
motivo escrito.

### Ordem obrigatória de rollout

> **Cumprida em 08/08/2026.** A `20260808120000` está aplicada, o ledger foi de
> 368 para 369. O passo 2 foi conferido no banco; o passo 3 permanece como
> pré-condição para futuras execuções com `--apply`. A ordem fica
> registrada porque vale para a próxima migration que a trilha exigir, e porque
> o motivo dela é o que não pode ser esquecido.

Esta é a parte que quebra produção se for ignorada, e é a única ordem aceita:

```text
1. aplicar 20260808120000_coleta_log_natureza_escrita.sql
2. conferir no banco: coluna natureza existe e coleta_log_ultima filtra por ela
3. só então rodar qualquer script migrado com --apply
```

O passo 1 **não** pode ser o `apply_migration` do MCP da Management API: ele
carimba timestamp próprio em vez de usar o nome do arquivo, e foi assim que
nasceu o terceiro caso de divergência da #131. Nem `db push`, que arrastaria as
5 migrations retidas da completude. O caminho usado foi o DDL explícito mais a
linha do ledger na MESMA transação, com a versão tirada do nome do arquivo,
precedido de um dry-run em `BEGIN … ROLLBACK`.

A migration `20260808120000` cria `coleta_log.natureza` e recria a view
`coleta_log_ultima` com `where natureza = 'coleta'`. As duas coisas andam na
mesma migration porque a view é `distinct on` sem `where` e é servida na
superfície pública por `src/lib/api.ts`: acrescentar a coluna sem recriar a view
faria uma linha de escrita, por ser a mais recente do trio, aparecer para o
usuário final como "última tentativa de coleta".

**Se a ordem for invertida**, o estrago é pior do que uma falha limpa. O helper
executa a escrita de domínio primeiro e grava a trilha depois. Com a coluna
ausente em produção, o script migrado rodando com `--apply` grava o dado, o
insert da trilha falha por coluna inexistente, o helper lança e o processo morre.
Resultado: dado dentro, rastro fora, script interrompido no meio. É o defeito da
issue #131 produzido pela correção dela, e com o agravante de acontecer sem que
ninguém tenha feito nada errado no script.

**O que transforma isso em falha segura é o preflight, e ele já está no helper.**
Antes da primeira escrita de domínio, `escreverAuditado()` faz um `select` das
nove colunas que o insert da trilha realmente preenche (`natureza`, `fonte`,
`escopo`, `alvo`, `resultado`, `volume`, `detalhe`, `execucao`, `duracao_ms`),
com `limit(1)`. Sondar só `natureza` provaria menos do que o insert precisa.

Três propriedades desse preflight importam:

- **É leitura, não escrita, e prova menos que um insert.** RLS de INSERT, grant
  e violação de CHECK só aparecem no insert de verdade; o `select` pega o
  `42703` de coluna ausente, que é o modo de falha que este preflight existe
  para impedir. A troca é deliberada: insert de teste sujaria a tabela que o
  próprio gate lê, e não há como desfazê-lo, porque a transação do PostgREST
  termina junto com a requisição que a abriu.
- **É fail-closed.** Reprovou, a função `aplicar` não chega a ser chamada e nada
  de domínio é tentado. Não existe modo degradado que escreve sem trilha.
- **É memoizado por processo**, inclusive quando reprova. Script que escreve
  milhares de linhas não paga um round-trip por linha, e fail-closed não vira
  loteria por tentativa.

Com o preflight, a ordem invertida custa uma mensagem de erro antes de qualquer
mudança de dado. Sem ele, custaria uma escrita órfã. A ordem deixou de ser
cerimônia e virou propriedade verificável: o passo 3 falha sozinho se o passo 1
não aconteceu, sem depender de o operador lembrar da ordem.

Isso protege contra a coluna ausente, que é o modo de falha conhecido. Não
substitui os passos 1 e 2: o preflight mostra que as colunas da trilha estão
legíveis, não que a trilha é gravável e não que a view `coleta_log_ultima` foi
recriada com o filtro certo. As duas coisas continuam sendo conferência humana
no passo 2.

## Identidade eleitoral decidida fora do código

Regra de 09/08/2026, etapa 2 da execução `pf-reverificacao-20260809`.

Uma decisão de identidade que vive só em `output/` não existe para o CI, e
`output/` é ignorado pelo Git. A classificação dos 71 perfis sem casamento
seguro passou a morar em
[`data/identidade-etapa2-2026.json`](../data/identidade-etapa2-2026.json), no
mesmo padrão de `data/identidades-bloqueadas.json`: registro versionado, parser
que falha fechado e consumidor que consulta **antes** de escrever.

- **Só a classe `match_fresco` promove chave.** As outras 59 entradas carregam
  `SQ_CANDIDATO` dentro de `hits[]` como **evidência** para quem revisar, nunca
  como identidade confirmada. O invariante é "nenhuma chave promovida", não
  "nenhum SQ em lugar nenhum", e 16 dessas entradas de fato trazem SQ.
- **O consumidor real é `npm run validate:seed`**, que roda em todo PR. Ele
  confere a pós-condição: nenhum slug bloqueado pode ter `tse_sq_candidato`
  de 2026 no seed, nenhum `match_fresco` pode ter SQ diferente do confirmado, e
  nenhum SQ de `hits[]` pode virar chave em ano nenhum. É deliberadamente mais
  forte que varrer o código escritor, porque não depende de **como** o valor
  chegou lá.
- **A porta de materialização é `exigirMaterializacaoTse2026()`**, em
  `scripts/lib/identidade-etapa2.ts`. Ela devolve a chave, devolve `null` para
  slug fora do universo decidido, ou lança nomeando a classe.
- **Adulteração falha fechado.** As 71 entradas são transcrição verbatim, e dois
  hashes recomputáveis em CI provam isso sem nenhum artefato gitignorado.
  Editar uma entrada à mão quebra o hash; a correção é regenerar, nunca
  reescrever o hash.

### Renovação, e por que ela tem data

O diagnóstico foi medido contra o snapshot do TSE de 08/08/2026, com a janela de
pedidos de registro ainda aberta até 15/08 às 19h. Sem prazo, "não localizado em
08/08" congelaria como "não existe", que é exatamente o que
`Settings/EXPECTED_BEHAVIOR.md` proíbe: ausência de linha não prova ausência de
fato. O registro declara `revalidar_ate`, o responsável e o procedimento, e o
teste falha depois da data com essa instrução na mensagem.

O procedimento roda em checkout limpo, e isso foi **medido**, não afirmado: os
três artefatos gitignorados de que a derivação original dependia
(`pendentes-agosto.json`, `db-snapshot-83.json` e o ledger da B2) foram
escondidos, e a renovação reproduziu os mesmos hashes sem eles.

```bash
npm run data:identidade-etapa2:fontes   # baixa os 3 pacotes do catálogo oficial do TSE
npm run data:identidade-etapa2:gerar    # reclassifica e reescreve o registro
node --import tsx --test tests/etapa2-identidade-protecao.test.ts
```

O modo default é `--reclassificar`: ele reaproveita os **perfis** já congelados
no registro (nome civil, nome de urna, cargo e UF, lidos do banco em 09/08) e
roda a cascata contra o snapshot NOVO do TSE. Não é circular, porque os perfis
são a entrada da classificação, não a saída; o que muda entre uma renovação e
outra é o snapshot.

`--do-zero` rederiva o universo a partir dos três artefatos gitignorados e só
roda em máquina que os tenha. Sem eles, ele falha, como deve.

### As cinco retidas são congeladas por hash

Até 09/08 o gate conferia presença do arquivo e o aviso no topo, e a
documentação afirmava proteção byte a byte que não existia: uma edição no corpo
passava em silêncio, justamente nos arquivos que escrevem em 194 fichas e que
ninguém revisa porque "estão retidos". Os SHA-256 vivem em
`scripts/audit/migrations-retidas.json` e `tests/migrations-retidas-gate.test.ts`
os confere. Liberar uma é ato deliberado, com entrada removida do manifesto e
decisão registrada em `Settings/STATUS.md` no mesmo commit.

`data:identidade-etapa2:fontes` faz rede e nunca entra em CI nem em workflow: é
comando de operador, e escreve sob `output/`, que segue ignorado. Use
`-- --dry-run` para conferir que o catálogo oficial continua no ar e com os
mesmos nomes de recurso, sem baixar nada. Prorrogar `revalidar_ate` sem
regenerar exige decisão registrada em `Settings/STATUS.md` no mesmo commit.

## Data de verificação por campo passa por um helper

Regra de 09/08/2026, mesma família de "Escrita em produção fora de migration".

Toda escrita em `candidatos.verificacao_campos` passa por
`construirPatchVerificacaoCampos()`, em
[`src/lib/verificacao-campos.ts`](../src/lib/verificacao-campos.ts). O helper é o
único lugar que decide o que pode virar data, e a semântica completa está em
`Settings/SOURCES_AND_DATA.md`, seção "Data de verificação por campo".

A regra existe porque não havia enforcement nenhum: o gerador lia
`source_verification_dates.proposed_value` do ledger da B2 e emitia o mapa
**verbatim**. O que estivesse no ledger virava coluna, inclusive `null` em campos
que a própria pesquisa provou serem `vazio_confirmado`. Escrever `null` é pior
que não escrever: o merge com `||` sobrescreve, então uma segunda passada
apagaria a data boa anterior.

O gerador foi portado de `.mjs` para `.ts` na mesma rodada, por dois motivos. O
primeiro é poder importar o helper. O segundo é que, como `.mjs`, ele ficava fora
de `tsconfig.scripts.json` e do `knip`: o escritor de uma coluna pública não era
typechecado por ninguém.

`tests/generate-b2-migration-verificacao.test.ts` julga o **SQL emitido**, não o
helper chamado de lado, porque o defeito nasceu na costura entre o ledger e o
SQL.

Na mesma rodada o gerador **deixou de emitir schema**. Ele ainda carregava
`ALTER TABLE ... ADD COLUMN`, `GRANT SELECT (verificacao_campos)` e um
`CREATE OR REPLACE VIEW` completo. Com a coluna e a view morando em
`20260809060000_verificacao_campos_schema_publico.sql`, continuar emitindo DDL
faria a próxima regeneração produzir migration **mista** de novo, que é o que a
regra acima proíbe, e mantinha uma quarta cópia da definição da view para
divergir. O teste reprova `ALTER TABLE`, `CREATE OR REPLACE VIEW` e `GRANT` no
SQL gerado. Pré-condição para aplicar o arquivo gerado: a `20260809060000` já
aplicada.

### Migration nova não tem fronteira de transação própria

Regra de 09/08/2026, achada por revisão independente.

Migration aplicada pelo procedimento canônico (DDL mais a linha do ledger na
MESMA transação) **não pode trazer `BEGIN;`/`COMMIT;` próprios**. O `COMMIT;` do
meio do arquivo encerraria a transação externa antes da gravação do ledger,
quebrando a atomicidade e o dry-run em `BEGIN … ROLLBACK`: a DDL ficaria
aplicada e o rollback não a desfaria. Sob `psql --single-transaction`, que é como
o replay roda, um `BEGIN` interno ainda emite "there is already a transaction in
progress" e o `COMMIT` interno fecha a transação do harness. A `20260809052600`,
aplicada por esse mesmo procedimento, também não tem fronteiras internas.

### Rollback de recriação de view é `DROP … CASCADE`, não `CREATE OR REPLACE`

`CREATE OR REPLACE VIEW` só aceita **acrescentar** coluna no fim. Tentar remover
devolve `ERROR: cannot drop columns from view`, medido em Postgres 17. Como
`candidatos_publico` tem duas dependentes que leem dela (`v_ficha_candidato` e
`v_comparador`), desfazer uma coluna exige `DROP … CASCADE` e recriar as três,
mais o `COMMENT ON VIEW` e os `GRANT`, que o `DROP` destrói.

O rollback e o harness que o prova são **versionados**: `supabase/rollback/` e
`scripts/audit/provar-rollback.sh`, com `npm run audit:rollback:provar`.
Recovery que vive em `output/` não sobrevive a um PR, e é dele que a aplicação
futura depende. `supabase/rollback/` não é lido pelo CLI do Supabase nem pelo
classificador, que só enxergam `supabase/migrations/`.

Rollback só vale como rollback depois de executado, e só está completo quando
desfaz **tudo** o que a forward fez: a view, o privilégio de coluna, a coluna e a
linha do ledger. Guarda de segurança fica no próprio SQL, não em linha
comentada esperando que alguém lembre de descomentar; um rollback que depende de
memória é um bilhete.

O desta rodada foi executado em Postgres 17 efêmero nos dois ramos: com dado
gravado ele **aborta** e nada é destruído; com a coluna vazia ele remove coluna,
privilégio e versão do ledger, e o `pg_dump --schema-only` resultante é idêntico
ao do conjunto sem a migration.

### Validade do registro morde na porta, não na suíte

O registro tem prazo (`revalidar_ate`), mas o prazo derruba
`exigirMaterializacaoTse2026()`, não `npm test`. O risco que o prazo protege,
tratar "não localizado em 08/08" como "não existe", só se materializa quando
alguém **usa** o registro para autorizar escrita. Um refactor de componente não
tem por que ficar vermelho por causa da janela de registro do TSE, e um gate que
reprova o repositório inteiro por um motivo alheio é um gate que alguém desliga.

## Curadoria editorial

Pesquisa, classificação, aprovação, aplicação e publicação são etapas distintas.
Nenhum item vai ao ar sem um `sim` explícito e individual quando a frente exigir
curadoria. A decisão deve preservar fontes por afirmação e o escopo pesquisado.

Use os comandos versionados de curadoria. Eles são dry-run por padrão e só
escrevem com `--apply`.

## Cobertura total do universo

Toda correção descoberta por amostragem deve virar uma consulta sobre as 194
fichas atuais, ou sobre o universo vigente quando ele mudar. O objetivo não é
corrigir o candidato que revelou o bug, mas a regra compartilhada e todos os
registros afetados.

Divida a execução por frentes independentes, como identidade, patrimônio,
histórico, justiça e renderização, quando elas não disputarem os mesmos arquivos
ou migrations. Integre e valide o conjunto no final.

## PR, Vercel e lançamento

- Repositório: `thiago-salvador/puxa-ficha`.
- Branch protegida de integração: `main`.
- Projeto Vercel: `puxa-ficha`, região `gru1`, Node 24.x.
- Domínio canônico: `https://puxaficha.com.br`.

Antes de lançar:

```text
CI verde -> PR revisada -> merge conhecido -> deployment Ready
-> /api/deployment-info no commit esperado
-> APIs públicas -> páginas reais -> cobertura e smoke
```

Um status Ready sem readback é apenas prova de infraestrutura.

## Fechamento

No fechamento, informe qual avanço previsto aconteceu e qual prova o confirma.
Não conte arquivos, commits, buscas ou pipelines como progresso quando eles não
mudaram a completude, a confiabilidade ou a capacidade de sustentar as fichas.

Atualize `Settings/STATUS.md` quando houver mudança relevante de produção,
cobertura, automação, fonte ou risco. Registre trabalho significativo no log
canônico do projeto, quando existir, e na Daily Note operacional.
