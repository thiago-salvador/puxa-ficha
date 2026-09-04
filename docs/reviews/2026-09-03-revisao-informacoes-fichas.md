# Revisão de informação das 209 fichas publicáveis

**Data:** 3 de setembro de 2026
**Universo:** as 209 linhas da view `candidatos_publico` (195 Governador, 13 Presidente, 1 Vice-Presidente).
**Acesso ao banco:** somente leitura, pela Management API do Supabase com `read_only: true`. Nenhuma escrita foi feita nesta revisão.
**Régua:** `npm run audit:cobertura` (`docs/cobertura-de-dados.md`). Todo número desta página é derivado do snapshot daquele comando rodado hoje. Em qualquer conflito, a régua vence este documento.

## Como reproduzir os números

```bash
npm run audit:cobertura -- --json
```

O snapshot que alimentou esta revisão e as demais provas estão em
`reports/2026-09-03-revisao-informacoes-fichas/`:

| Arquivo | O que é |
|---|---|
| `cobertura-snapshot-2026-09-03.json` | O snapshot de `coverage-snapshot.sql` que alimentou tudo. |
| `cobertura-celulas-2026-09-03.json` | O estado de cada célula por ficha, saída de `--json` do próprio relatório. |
| `inventario-por-coluna-2026-09-03.json` | O inventário da Parte 1, recalculado com `lerSnapshot` + `calcularCelulas` do script oficial. Divergência contra a saída oficial: **0**. |
| `consistencia-transversal-2026-09-03.json` | Os cruzamentos da Parte 3. |
| `bio-similaridade-2026-09-03.json` | Pares de biografias com similaridade de trigramas ≥ 0,30. |
| `amostra-30-fichas-2026-09-03.json` | As 30 fichas amostradas, com o dossiê que cada agente recebeu. |
| `amostra-30-checagens-2026-09-03.json` | O resultado das seis checagens por ficha, as 137 divergências confirmadas e as 63 refutadas, com as URLs consultadas. |
| `situacao-julgamento-dados-abertos-2026-09-03.json` | `DS_SITUACAO_JULGAMENTO` do `consulta_cand_complementar_2026` por ficha, e o cruzamento com o DivulgaCandContas. |
| `divulgacandcontas-situacao-2026-09-03.json` | A leitura do DivulgaCandContas, 28 de 28 unidades da federação. |
| `financiamento-sq-divergente-2026-09-03.json` | A varredura de `sq_candidato` das linhas vivas de financiamento (2010+). |
| `nome-urna-divergencias-2026-09-03.json` | As 45 divergências entre o nome exibido e o nome de urna oficial. |
| `link-check-2026-09-03.log` | Saída de `scripts/link-check-pontos-atencao.ts --dry-run --sem-estado`. |

`--sem-estado` é deliberado: sem a flag, o link-check grava memória de execução em
`link_check_url_observacao` mesmo em `--dry-run`, e esta revisão não escreve no banco.

## O banco andou durante a revisão

O snapshot que sustenta todo número desta página foi tirado às **20:58 de 03/09/2026**.
Entre 21:26 e 00:25 UTC outra frente de trabalho mexeu em produção e no repositório, e o
que ela mudou está registrado aqui para o leitor não confundir correção com erro de
medição:

| Medida | No snapshot (20:58) | Agora (00:25 UTC de 04/09) |
|---|---|---|
| Fichas publicáveis | 209 | 209 |
| `cpf` nulo | 3 | **1** (`vera-lucia-ce`) |
| `sq_candidato_2026` nulo | 3 | 3 (inalterado) |
| Publicáveis sem log de `tse-historico`, TCU e sanções | 42 | **40** |
| Fichas fora do seed `data/candidatos.json` | 47 | **45** (commit `bcfbf4c`) |

`well-macedo` e `rico-pinheiro` passaram de 1 para 10 fontes registradas em
`coleta_log`, e o CPF das duas foi resolvido. As demais 40 fichas seguem sem coleta, e
os três SQ nulos seguem nulos. Nada nas Partes 1, 2 e 4 muda de sinal: os números do
snapshot continuam sendo a medida da régua no momento em que ela foi rodada, e a
diferença acima é a primeira parcela do próprio plano de correção sendo executada.

---

## Relação com o relatório de execução da mesma noite

Uma frente paralela trabalhou o mesmo acervo hoje, com pergunta diferente: por que duas
fichas publicadas estavam vazias, e que gate impediria a próxima. O relatório dela é
"Por que duas fichas publicadas estavam vazias". Os dois documentos se completam e se
corrigem, e vale registrar onde:

**O que aquele relatório corrigiu aqui.** Duas premissas desta página estavam erradas e
foram consertadas depois de conferidas no código:

1. `PF_INGEST_SLUGS`, lida dentro de `loadCandidatos()`, escopa a coleta inteira por
   slug. A afirmação anterior, de que só `camara` e `senado` aceitavam recorte, valia
   para a flag `--slugs` do CLI, não para a variável. A correção está na Parte 4.
2. A fonte `filiacao` está quebrada na origem, para o acervo todo. Isso muda a leitura da
   coluna Hist. partidário, e a nota entrou na Parte 1.

**A causa raiz, dita melhor lá.** Esta página descreve a cadeia (fora do seed, sem
âncora, sem CPF, sem varredura). O relatório de execução nomeia o mecanismo com mais
precisão: `data/candidatos.json` **é a fila de trabalho do pipeline**, não um arquivo de
configuração. As nove fontes montam a lista de quem processar chamando `loadCandidatos()`,
que lê o seed. Candidato criado direto em `candidatos` por migration de chapas existe
para o site, que lê o banco, e não existe para a coleta, que lê o seed. É invisibilidade
permanente, não coleta que rodou mal.

**Os dois números de fichas com lacuna de coleta, e por que ambos estão certos.**

| Medida | Definição | Valor hoje |
|---|---|---|
| 54 | União de 5 condições: falta **qualquer uma** entre `tse-historico`, `filiacao`, `transparencia-sanctions`, `tcu` e `processos-curadoria` | 54 |
| 40 | Interseção de 3: falta **ao mesmo tempo** `tse-historico`, `tcu` e `transparencia-sanctions` | 40 |

O 54 é o número certo para desenhar um gate, porque gate reprova quando qualquer
condição falha. O 40 é o número certo para dizer "ficha que nunca passou pelo pipeline",
que é o recorte desta revisão. Por fonte, isolado: `filiacao` 50, `processos-curadoria`
49, `tse-historico` 48, `tcu` 45, `transparencia-sanctions` 40.

**O que esta página acrescenta.** O relatório de execução mediu presença de coleta. Esta
mede o conteúdo do que está publicado, e os dois maiores achados não aparecem lá: as 140
fichas pelo pacote de dados abertos, 141 pelo DivulgaCandContas, que publicam situação de
candidatura já superada pela fonte oficial, incluindo 4 com registro indeferido, e a ficha de `alvaro-dias-rn` exibindo a trajetória e o
financiamento de outra pessoa.

---

## Parte 1: inventário por coluna da régua

Recalculado com `lerSnapshot` + `calcularCelulas` + `calcularIndice` importados do
próprio `scripts/audit/coverage-report.ts`, sobre o snapshot de hoje. A conferência
contra a saída oficial de `--json` deu **0 divergências em 209 fichas × 25 colunas**,
então este inventário é a mesma régua, só agregada de outro jeito.

### As 15 colunas do índice de preenchimento

| Coluna | ok | partial | missing | n/a | Procedência das `missing` |
|---|---|---|---|---|---|
| Foto | 209 | 0 | 0 | 0 | - |
| Bio | 209 | 0 | 0 | 0 | - |
| Redes sociais | 198 | 0 | 11 | 0 | nunca coletado 8; tentativa inconclusiva 3 |
| Dados pessoais | 209 | 0 | 0 | 0 | - |
| Patrimônio (anos) | 112 | 24 | 2 | 71 | coletado 1; nunca coletado 1 |
| Evolução patrimonial | 129 | 51 | 2 | 27 | coletado 1; nunca coletado 1 |
| Bens ano a ano | 180 | 0 | 2 | 27 | coletado 1; nunca coletado 1 |
| Financiamento (anos) | 134 | 0 | 8 | 67 | verificado e vazio 4; nunca coletado 4 |
| Doadores detalhados | 131 | 3 | 8 | 67 | verificado e vazio 4; nunca coletado 4 |
| Votações-chave | 23 | 0 | 18 | 168 | coletado 15; nunca coletado 3 |
| Projetos de lei | 29 | 28 | 15 | 137 | nunca coletado 14; coletado 1 |
| Cota parlamentar | 34 | 0 | 8 | 167 | coletado 4; nunca coletado 4 |
| Legislação do Executivo | 35 | 0 | 15 | 159 | sem ingest automático 15 |
| Notícias | 209 | 0 | 0 | 0 | - |
| Posições (quiz) | 2 | 97 | 109 | 1 | sem ingest automático 109 |

"Verificado e vazio" é o `zero_provado` da régua: todas as fontes da coluna
responderam, e responderam vazio. "Nunca coletado" é o `nunca_verificado`: pelo menos
uma fonte nunca foi tentada para aquela ficha. A distinção sai de `coleta_log`, não de
suposição, e é conservadora por construção: uma fonte não consultada rebaixa o veredito.

### As colunas de achado (fora do índice)

Aqui o estado dominante é `zero`, e o que interessa é a procedência dele.

| Coluna | ok | partial | zero | missing | n/a | Procedência do zero (ou da lacuna) |
|---|---|---|---|---|---|---|
| Origem da foto | 165 | 44 | 0 | 0 | 0 | 44 `partial` = foto de terceiro, não TSE/Wikimedia/órgão oficial |
| Cargos ocupados | 206 | 0 | 3 | 0 | 0 | nunca coletado 3 |
| Hist. partidário | 153 | 0 | 56 | 0 | 0 | nunca coletado 40; coletado 11; tentativa inconclusiva 5. Ver a nota sobre `filiacao` abaixo |
| Contradições | 22 | 0 | 187 | 0 | 0 | curadoria sem achado 132; nunca coletado 43; tentativa inconclusiva 9; coletado 3 |
| Processos judiciais | 62 | 0 | 147 | 0 | 0 | tentativa inconclusiva 74; nunca coletado 40; coletado 23; verificado e vazio 10 |
| Alertas (sem positivos) | 52 | 0 | 157 | 0 | 0 | coletado 117; nunca coletado 40 |
| Proj. em destaque | 0 | 57 | 0 | 15 | 137 | nas 15 `missing`: nunca coletado 14; coletado 1 |
| Espectro do partido | 207 | 0 | 0 | 1 | 1 | sem ingest automático 1 |
| Sanções | 3 | 0 | 206 | 0 | 0 | **verificado e vazio 165**; nunca coletado 41 |
| Aguardando aprovação | 0 | 2 | 207 | 0 | 0 | fila de trabalho, não dado de candidato |

Sanções é a coluna mais bem provada do conjunto: em 165 das 209 fichas o zero é
afirmação, não silêncio. Processos é a mais fraca: só 10 dos 147 zeros são
"verificado e vazio", e 74 são tentativa inconclusiva. Isso está coerente com
`docs/criterio-processos-judiciais.md`, que declara que não há ingest automático e
que zero significa "ninguém verificou".

**`filiacao` está quebrada na origem, e isso muda como ler a coluna Hist. partidário.**
Das 196 execuções da fonte `filiacao` registradas em `coleta_log`, **nenhuma** tem
resultado `encontrado`: 194 são `indeterminado` (05/08/2026) e 2 são `erro` (04/09/2026).
O zip oficial `perfil_filiacao_partidaria.zip` do TSE deixou de trazer as colunas que
`scripts/lib/ingest-filiacao.ts` lê (`NM_ELEITOR`, `DS_SITUACAO_FILIADO`, `DT_FILIACAO`,
`DT_DESFILIACAO`), então o parser derruba a fonte inteira. É mudança no pacote publicado
pelo TSE, não defeito de ficha, e atinge o acervo todo. Logo as 5 fichas com "tentativa
inconclusiva" em histórico partidário não são resíduo: são a ponta visível de uma fonte
que não funciona para ninguém. O achado é do relatório paralelo de execução da mesma
noite; conferido aqui no `coleta_log`.

### Índice de preenchimento

| Estatística | Valor |
|---|---|
| Mínimo | 55 |
| p25 | 81 |
| Mediana | 88 |
| p75 | 92 |
| Máximo | 100 |
| Média | 86,2 |

| Faixa | Fichas |
|---|---|
| < 70 | 12 |
| 70 a 89 | 108 |
| ≥ 90 | 89 |

**O índice não mede vazio.** `well-macedo` e `rico-pinheiro`, criadas em 28/08 sem
nenhuma linha de histórico, patrimônio, financiamento ou processo, marcam 83 e 67.
Elas pontuam alto porque a maior parte das 15 colunas sai como `n/a`: sem histórico
político registrado, a régua conclui que patrimônio, financiamento, votações,
projetos e cota "não se aplicam". É a limitação que o próprio
`docs/cobertura-de-dados.md` declara ("histórico incompleto gera falso não se
aplica"), e nas duas fichas ela está no seu caso extremo: a ficha mais vazia do
acervo aparece acima da mediana.

### A concentração que explica quase toda a lacuna de coleta

Cruzando `coleta_log` com `candidatos.created_at`, as lacunas não estão espalhadas.
Elas são, quase inteiramente, três ondas de criação de ficha.

Fichas **sem nenhuma tentativa registrada** para cada fonte, por onda:

| Onda (`created_at`) | Fichas | sanções | TCU | tse-historico | filiação | jarbas | wikidata | instagram |
|---|---|---|---|---|---|---|---|---|
| até 31/03 | 85 | 0 | 1 | 2 | 2 | 2 | 1 | 1 |
| 15/05 a 22/05 | 28 | 0 | 0 | 1 | 1 | 1 | 0 | 0 |
| 09/06 a 27/06 | 32 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 30/07 a 03/08 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 11/08 a 13/08 | 15 | 10 | 14 | 14 | 14 | 14 | 14 | 14 |
| 17/08 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| 28/08 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |

As 30 fichas de 17/08 e as 2 de 28/08 têm **zero** tentativa registrada em **todas**
as fontes. **42 fichas publicáveis foram ao ar sem nunca passar pelo pipeline de
coleta.** A causa mecânica está na Parte 3.

Consequência para a leitura das colunas: das 49 fichas sem log de `tse-historico`,
**47 estão fora da coorte que aparece em pesquisa eleitoral qualificada**; das 47 sem
log de TCU, 45; das 42 sem log de sanções, 42. Só duas fichas de alta visibilidade
estão atingidas, e as duas são presidenciáveis: `clariana-barao` e
`wilson-grassi-junior`.

---

## Parte 2: qualidade do que está preenchido

30 fichas amostradas por onda de criação (`created_at`) e por cargo, cada uma
checada contra a fonte primária em seis frentes: biografia, situação da
candidatura, trajetória/homônimo, patrimônio, processos e chapa/vice. A sétima
frente (links de fonte respondendo 200) foi coberta pelo link-check sobre o acervo
inteiro, e está no fim desta parte.

### A amostra

| Onda (`created_at`) | Fichas na onda | Amostradas | Slugs |
|---|---|---|---|
| até 31/03 | 85 | 9 | `acm-neto`, `alan-rick`, `alvaro-dias-rn`, `clecio-luis`, `flavio-bolsonaro`, `haddad-gov-sp`, `hertz-dias`, `jorginho-mello`, `natasha-slhessarenko` |
| 15/05 a 22/05 | 28 | 4 | `augusto-cury`, `cabo-daciolo`, `edmilson-costa`, `jose-roberto-arruda` |
| 09/06 a 27/06 | 32 | 4 | `izadora-dias`, `samara-mineiro`, `vivian-mendes`, `ze-batista` |
| 30/07 a 03/08 | 17 | 3 | `guilherme-fonseca`, `patrus-ananias`, `witer-naves` |
| 11/08 a 13/08 | 15 | 4 | `clariana-barao`, `leonardo-avalanche`, `policial-edjane`, `reginaldo-lima` |
| 17/08 | 30 | 4 | `delcidio-amaral`, `marcio-jambo`, `vera-lucia-ce`, `victor-assis` |
| 28/08 | 2 | 2 | `rico-pinheiro`, `well-macedo` |

Por cargo: 24 Governador, 5 Presidente, 1 Vice-Presidente. As quatro fichas com
defeito estrutural conhecido (`well-macedo`, `rico-pinheiro`, `leonardo-avalanche`,
`vera-lucia-ce`) entraram por inclusão forçada; o resto foi sorteado dentro de cada
onda alternando índice de preenchimento baixo e alto, de forma determinística.

O dossiê que cada agente recebeu está em `amostra-30-fichas-2026-09-03.json`, e o
resultado de cada checagem em `amostra-30-checagens-2026-09-03.json`, os dois em
`reports/2026-09-03-revisao-informacoes-fichas/`.

### 2.0 Como a amostra foi checada, e o que sobreviveu

Cada uma das 30 fichas foi auditada por uma agente contra a fonte primária, nas seis
frentes. Cada divergência levantada foi então entregue a uma segunda agente independente
com a instrução oposta: **derrubar a acusação**, e na dúvida genuína dar por refutada.
230 agentes, nenhum erro de execução.

| | |
|---|---|
| Fichas checadas | 30 de 30 |
| Divergências levantadas | 200 |
| **Confirmadas na verificação adversarial** | **137** |
| Refutadas | 63 (31,5%) |
| Checagens que a fonte não permitiu concluir | 0 |

| Severidade das confirmadas | |
|---|---|
| Crítica | 3 |
| Alta | 54 |
| Média | 42 |
| Baixa | 38 |

**Onde a refutação mais trabalhou é exatamente onde o erro custa mais caro.** Trajetória
teve 19 acusações derrubadas contra 17 confirmadas, e processos 15 contra 10. São as duas
frentes em que uma acusação falsa atinge pessoa real: despublicar mandato verdadeiro por
suspeita de homônimo, ou atribuir processo a quem não é parte. O passo adversarial não é
cerimônia; ele mudou o resultado nessas duas colunas.

| Tema | Confirmadas | Refutadas | Fichas atingidas |
|---|---|---|---|
| Situação da candidatura e selo | 55 | 7 | 29 |
| Biografia | 29 | 13 | 20 |
| Trajetória | 17 | 19 | 16 |
| Processos | 10 | 15 | 9 |
| Pontos de atenção | 7 | 2 | 7 |
| Patrimônio | 7 | 1 | 6 |
| Dados pessoais | 6 | 2 | 6 |
| Chapa e vice | 4 | 2 | 4 |
| Financiamento | 1 | 0 | 1 |
| Redes e links | 1 | 0 | 1 |

Por ficha, com o veredito de cada frente (`div` = divergência confirmada ou levantada na
frente, `ok` = passou):

| Ficha | Onda | a bio | b situação | c trajetória | d patrimônio | e processos | f chapa | Confirmadas | Severidade |
|---|---|---|---|---|---|---|---|---|---|
| `guilherme-fonseca` | julho-agosto | **div** | **div** | **div** | ok | ok | ok | 3 | 2A 1B |
| `patrus-ananias` | julho-agosto | **div** | ok | ok | ok | ok | ok | 2 | 1M 1B |
| `witer-naves` | julho-agosto | **div** | **div** | ok | ok | ok | ok | 2 | 2M |
| `izadora-dias` | junho | **div** | **div** | ok | **div** | ok | ok | 4 | 2A 1M 1B |
| `samara-mineiro` | junho | **div** | **div** | ok | ok | ok | ok | 5 | 2A 3B |
| `vivian-mendes` | junho | **div** | **div** | **div** | ok | **div** | ok | 5 | 1A 2M 2B |
| `ze-batista` | junho | **div** | **div** | **div** | **div** | ok | ok | 4 | 1A 2M 1B |
| `augusto-cury` | maio | **div** | **div** | ok | ok | ok | ok | 4 | 1A 1M 2B |
| `cabo-daciolo` | maio | **div** | **div** | ok | ok | ok | ok | 2 | 2A |
| `edmilson-costa` | maio | **div** | **div** | **div** | **div** | ok | ok | 3 | 1M 2B |
| `jose-roberto-arruda` | maio | **div** | **div** | **div** | ok | **div** | ok | 3 | 2A 1B |
| `clariana-barao` | onda-13-08 | ok | **div** | ok | ok | **div** | ok | 3 | 2A 1B |
| `leonardo-avalanche` | onda-13-08 | **div** | ok | **div** | **div** | **div** | **div** | 9 | 1A 6M 2B |
| `policial-edjane` | onda-13-08 | **div** | **div** | **div** | **div** | **div** | ok | 4 | 3A 1B |
| `reginaldo-lima` | onda-13-08 | **div** | **div** | **div** | **div** | ok | ok | 5 | 3A 2M |
| `delcidio-amaral` | onda-17-08 | **div** | **div** | **div** | **div** | **div** | ok | 7 | 2A 3M 2B |
| `marcio-jambo` | onda-17-08 | **div** | **div** | **div** | **div** | ok | ok | 4 | 1A 2M 1B |
| `vera-lucia-ce` | onda-17-08 | ok | **div** | **div** | **div** | **div** | ok | 5 | 2A 2M 1B |
| `victor-assis` | onda-17-08 | ok | **div** | **div** | **div** | **div** | ok | 3 | 1A 1M 1B |
| `rico-pinheiro` | onda-28-08 | **div** | **div** | **div** | **div** | ok | ok | 5 | 1A 1M 3B |
| `well-macedo` | onda-28-08 | ok | **div** | **div** | **div** | ok | ok | 3 | 2M 1B |
| `acm-neto` | seed-marco | **div** | **div** | **div** | ok | **div** | ok | 4 | 3A 1B |
| `alan-rick` | seed-marco | **div** | **div** | **div** | ok | **div** | ok | 5 | 2A 2M 1B |
| `alvaro-dias-rn` | seed-marco | **div** | **div** | **div** | **div** | **div** | ok | 9 | 3C 2A 2M 2B |
| `clecio-luis` | seed-marco | **div** | **div** | **div** | ok | **div** | ok | 3 | 1A 2M |
| `flavio-bolsonaro` | seed-marco | **div** | **div** | **div** | ok | **div** | ok | 7 | 3A 3M 1B |
| `haddad-gov-sp` | seed-marco | **div** | **div** | **div** | ok | **div** | ok | 6 | 4A 1M 1B |
| `hertz-dias` | seed-marco | **div** | **div** | ok | **div** | ok | ok | 8 | 4A 2M 2B |
| `jorginho-mello` | seed-marco | **div** | **div** | **div** | ok | ok | ok | 6 | 4A 1M 1B |
| `natasha-slhessarenko` | seed-marco | **div** | **div** | **div** | ok | ok | ok | 4 | 2A 2B |

Legenda de severidade: C crítica, A alta, M média, B baixa.

**Chapa e vice é a frente mais saudável do acervo: 29 das 30 fichas conferem campo a
campo com o DivulgaCandContas.** A única exceção é `leonardo-avalanche`, a ficha de
Vice-Presidente sem SQ e fora do roster, que por isso não tem chapa para conferir.

O detalhe de cada checagem, com as URLs consultadas por agente, está em
`reports/2026-09-03-revisao-informacoes-fichas/amostra-30-checagens-2026-09-03.json`.

### 2.1 Situação da candidatura: 140 a 141 fichas afirmam o que a fonte já desmentiu

> **O número tem fonte e tem data, e as duas mudam a resposta.** São três leituras,
> não uma:
>
> | Leitura | Fonte | Julgadas |
> |---|---|---|
> | 03/09 | `consulta_cand_complementar_2026.zip` (`DT_GERACAO` 03/09, `Last-Modified` 22:35:11 GMT): 134 + 2 + 3 + 1 | **140** |
> | 03/09 | DivulgaCandContas, 28 de 28 UFs: 135 + 2 + 3 + 1 | **141** |
> | 04/09 | mesmo pacote, republicado pelo TSE | **142** |
>
> A diferença entre 140 e 141 no mesmo dia é **uma ficha nomeada**,
> `gilberto-vasconcelos`, e está registrada logo abaixo. Uma versão anterior desta
> página usava 141 sem dizer de qual fonte ele vinha, colado embaixo da tabela do
> pacote, que dá 140. O erro não foi inventar o número: foi não rotular a fonte, e
> a ambiguidade se propagou para as checagens da amostra. O número **envelhece
> sozinho**: antes de decidir qualquer coisa com ele, rode
> `reports/2026-09-03-revisao-informacoes-fichas/reverificar.mts`.


Este é o achado de maior alcance da revisão, e ele não veio da amostra: veio da
conferência do acervo inteiro. Na amostra, ele aparece em **29 das 30 fichas**.

A migration `20260903100000_vocabulario_situacao_candidatura.sql`, escrita hoje mesmo,
fechou o vocabulário em três valores com este argumento, textual: o pacote
`consulta_cand` de 2026 "traz `#NE` em 20.456 de 20.456 linhas. Zero exceções [...] para
o pleito de 2026 existe UM fato oficial, e não três."

A medição estava certa e continua certa. **O que faltou foi o arquivo.** A situação de
julgamento não vive em `consulta_cand`: vive em `consulta_cand_complementar`, outro
pacote dos mesmos dados abertos do TSE, na coluna `DS_SITUACAO_JULGAMENTO`. O projeto
já baixa esse pacote, em `scripts/audit/gerar-identidade-etapa2.ts` e em
`scripts/lib/verificacao-campos-ledger-b2.ts`, para profissão e escolaridade. Ninguém
leu a coluna de julgamento dele.

Baixado hoje (`consulta_cand_complementar_2026.zip`, `Last-Modified: Thu, 03 Sep 2026
22:35:11 GMT`, `DT_GERACAO` 03/09/2026), cruzado por `SQ_CANDIDATO` com as 206 fichas
publicáveis que têm SQ:

| `DS_SITUACAO_JULGAMENTO` | Código | Fichas |
|---|---|---|
| DEFERIDO | 2 | **134** |
| AGUARDANDO JULGAMENTO | 8 | 66 |
| INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO | 4 | 3 |
| DEFERIDO EM PRAZO RECURSAL OU COM RECURSO | 16 | 2 |
| **INDEFERIDO** | 14 | **1** |

Conferência independente na segunda fonte oficial, o DivulgaCandContas (endpoint de
listagem por unidade da federação, 28 de 28 baixadas hoje): 135 Deferido, 65 Aguardando
julgamento, 3 Indeferido com recurso, 2 Deferido com recurso, 1 Indeferido. **As duas
fontes concordam em 205 das 206 fichas.** A única divergência é `gilberto-vasconcelos`,
"AGUARDANDO JULGAMENTO" nos dados abertos e "Deferido" no DivulgaCandContas, diferença
compatível com a defasagem de horas entre o pacote e a API ao vivo.

O site publica `aguardando julgamento` para 206 das 209 fichas. Logo **140 fichas pelo
pacote de dados abertos, e 141 pelo DivulgaCandContas, publicam hoje uma situação que a
fonte oficial já superou**, e quatro delas tiveram o registro indeferido:

| Ficha | UF | Situação oficial |
|---|---|---|
| `subtenente-luiz-carlos` | TO | INDEFERIDO |
| `carlos-jararaca` | RN | INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO |
| `geraldo-carvalho` | PI | INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO |
| `jose-estevao` | BA | INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO |

Conferência individual do caso mais grave no endpoint de candidato do
DivulgaCandContas: SQ `270002546368`, LUIZ CARLOS FERREIRA DA SILVA, urna SUBTENENTE
LUIZ CARLOS, Governador/TO, com `descricaoSituacao: "Indeferido"` e
`dataUltimaAtualizacao: "2026-09-03 18:55"`, ou seja, atualizado hoje.

A afirmação não está só no campo. Ela está no selo do topo da ficha e na última frase da
biografia de 83 fichas ("aguarda julgamento; registro pendente não equivale a
candidatura deferida"), então o mesmo dado vencido aparece três vezes na mesma página. A
amostra pegou os três lugares separadamente: 38 divergências de severidade alta em
situação e selo, mais 8 na frase final da biografia.

**Nada disso é falha do vocabulário fechado. É a prova de que ele funcionou.**
`scripts/lib/ingest-tse-situacao.ts` recusa persistir qualquer código diferente de `#NE`
e registra `situacao-fora-do-vocabulario:<CÓDIGO>`, então nenhum valor inventado entrou
no banco. O que falta é o passo que a própria `src/lib/situacao-candidatura.ts` já
previa por escrito: "`deferido` e `indeferido` entram no dia em que o TSE publicar
julgamento, numa PR deliberada." Esse dia chegou, e o caminho é mais barato do que
parecia: nenhuma dependência nova de API, só ler um segundo arquivo do pacote que o
projeto já baixa.

### 2.2 Homônimo: a ficha de Álvaro Costa Dias exibe a carreira de outra pessoa

Severidade **crítica**, e a única desta classe encontrada na amostra.

A ficha de `alvaro-dias-rn` (ÁLVARO COSTA DIAS, ex-prefeito de Natal, PL/RN) carrega
seis linhas de trajetória e dois anos de financiamento que pertencem a ÁLVARO
FERNANDES DIAS, ex-senador do Paraná.

Prova por exaustão dos pacotes `consulta_cand`, 28 arquivos de unidade da federação
por ano:

| Ano | ÁLVARO COSTA DIAS (RN, nasc. 04/09/1959) | ÁLVARO FERNANDES DIAS (PR, nasc. 07/12/1944) |
|---|---|---|
| 2002 | Deputado Federal, PMDB, RN | Governador, PDT, PR |
| 2006 | Deputado Estadual, PDT, RN | Senador, PSDB, PR |
| 2014 | Deputado Estadual, PMDB, RN | Senador, PSDB, PR |
| 2018 | **não consta em nenhuma UF** | Presidente, PODE, BR |
| 2022 | **não consta em nenhuma UF** | Senador, PODE, PR |

Em 2018 e 2022 existe **um único** "Álvaro … Dias" no país inteiro, e é o do Paraná.
Isso é exaustão do registro, não inferência.

O que está no ar hoje na ficha do candidato do Rio Grande do Norte:

| Linha publicada | A quem pertence |
|---|---|
| Senador, PSDB, **PR**, 1998 (eleito) | Álvaro Fernandes Dias |
| Governador, PDT, **PR**, 2002 (não eleito) | Álvaro Fernandes Dias |
| Senador, PSDB, **PR**, 2006 (eleito) | Álvaro Fernandes Dias |
| Senador, PSDB, **PR**, 2014 (eleito) | Álvaro Fernandes Dias |
| Presidente, PODE, 2018 (não eleito) | Álvaro Fernandes Dias |
| Senador, PODE, **PR**, 2022 (não eleito) | Álvaro Fernandes Dias |
| Financiamento 2018, R$ 5.439.178,66 | campanha presidencial de Álvaro Fernandes Dias |
| Financiamento 2022, R$ 5.082.816,36 | campanha ao Senado de Álvaro Fernandes Dias |

A assinatura é a mesma catalogada em `docs/homonimos-historico-2026-07-26.md`: colisão
lógica no mesmo ano. A ficha afirma que a pessoa foi, em 1998 e em 2014, Senador pelo
PSDB do Paraná **e** Deputado Estadual pelo PMDB do Rio Grande do Norte; e que em 2002
foi candidata a Governador pelo PDT do Paraná **e** eleita Deputada Federal pelo PMDB
do Rio Grande do Norte.

A biografia da própria ficha avisa: "Não confundir com o homônimo Alvaro Fernandes
Dias (PR), ex-senador paranaense", e a seção de trajetória logo abaixo exibe a
carreira dele.

**Este caso já era conhecido, e a correção ficou pela metade.** O comentário de
`shouldSkipWeakMatch` em `scripts/lib/tse-resolver.ts` cita nominalmente "o senador do
PR na ficha do ex-prefeito de Natal". A migration `20260730170000` pôs em quarentena
patrimônio e financiamento ancorados em SQ de outra pessoa, e o seed foi limpo. Duas
coisas escaparam:

1. `historico_politico` não foi tocada por aquela migration, embora seja a tabela que
   **já tem** despublicação lógica, o mecanismo usado em `20260726160000` para o caso
   `jeronimo`. As seis linhas seguem com `despublicado_em IS NULL`.
2. O financiamento de 2018 e 2022 **voltou** à tabela viva depois da quarentena,
   gravado pela execução `pf-ajustes-financiamento-20260810`. É regressão de uma
   correção, por um caminho de escrita diferente do que foi fechado.

### 2.3 O que mais a amostra confirmou, fora dos dois temas grandes

Dezesseis divergências de severidade alta ou crítica que não são situação da candidatura
nem o caso `alvaro-dias-rn`. Todas passaram pela verificação adversarial.

**Vice trocado na chapa e não trocado na biografia.** Duas fichas nomeiam na biografia
um vice que a fonte oficial já substituiu:

| Ficha | Vice na biografia | Vice ativo no TSE |
|---|---|---|
| `reginaldo-lima` (MA) | Bartolomeu Moreira | GATO FELIX (FELIX LIMA E SILVA), SQ 100002554354, `situacaoVice` 1, atualizado em 03/09/2026 |
| `policial-edjane` (SP) | Renata Bolsonaro | PROFESSORA NAYR DUARTE (NAIR ALVES DUARTE PAIS), SQ 250002554211, atualizada em 03/09/2026 |

O caso do Maranhão é o mais instrutivo: a migration `20260903140000` já corrigiu a
substituição em `chapas_2026`, hoje mesmo. O texto da biografia, que carrega o mesmo
fato em prosa, ficou para trás. A correção de dado estruturado e a correção de texto
livre não estão amarradas.

**Uma ausência oficial que afirma o contrário da fonte.** `hertz-dias` tem linha em
`patrimonio_ausencia_oficial` para 2026 declarando "zero bens, verificado em 16/08/2026".
O DivulgaCandContas traz um bem declarado: apartamento de 45 m², R$ 170.000,00,
`st_DIVULGA_BENS: true`. Essa é a pior classe de erro dessa tabela, porque
`patrimonio_ausencia_oficial` existe justamente para transformar silêncio em afirmação:
um registro errado ali não deixa lacuna, deixa uma prova falsa de que não há nada.

**Cargo que terminou e a ficha mantém como atual.** `haddad-gov-sp` exibe "Ministro da
Fazenda" no cabeçalho, "é ministro da Fazenda desde 2023" na biografia e
"Ministro da Fazenda, 2023 - atual" na carreira. Ele deixou o cargo em 19/03/2026,
sucedido por Dario Durigan.

**Profissão declarada que não é a do TSE.** Quatro fichas, todas conferidas contra o
`DS_OCUPACAO` do `consulta_cand_2026`:

| Ficha | Publicado | TSE |
|---|---|---|
| `jorginho-mello` | Senador | GOVERNADOR |
| `clecio-luis` | Servidor público estadual | GOVERNADOR |
| `cabo-daciolo` | Bombeiro militar | MILITAR REFORMADO |
| `leonardo-avalanche` | Empresário | SERVIDOR PÚBLICO ESTADUAL |

**Trajetória incompleta, não contaminada.** Duas fichas omitem candidaturas que o próprio
DivulgaCandContas lista para o mesmo SQ: `delcidio-amaral` tem uma linha só (2026) e o
TSE registra também 2024 Prefeito de Corumbá pelo PRD e 2022 Deputado Federal pelo PTB;
`policial-edjane` tem três e o TSE tem quatro, faltando 2024 Vereadora em Poá pelo PL.
Isso é o inverso do caso `alvaro-dias-rn`: lá sobra carreira de outra pessoa, aqui falta
carreira da própria.

**Dois campos de identidade divergentes do TSE**: `acm-neto` publica cor/raça PARDA e o
TSE diz BRANCA; `izadora-dias` publica PRETA e o TSE diz PARDA.

**Contagem de processos que conta a favor como contra.** O card de overview de
`alan-rick` mostra "7 processos, 3 criminal", e as três linhas criminais descrevem o
candidato como vítima ou polo ativo. O número no card não distingue quem é réu de quem é
autor, e a leitura de topo da ficha é a de sete processos contra a pessoa.

**Um status processual vencido.** `vera-lucia-ce` publica o processo
0044254-96.2012.8.06.0001 como "Remetido a outro foro"; a 5ª Vara Cível de Fortaleza
julgou improcedente em 11/02/2025, com resolução de mérito.

### 2.4 A varredura que o caso `alvaro-dias-rn` obrigou a fazer

O caso acima não podia ficar como anedota de amostra: se o financiamento de uma
ficha está ancorado no SQ de outra pessoa, a pergunta certa é quantas outras estão.

`financiamento` guarda o `sq_candidato` que ancorou cada linha, então dá para conferir
linha a linha contra o pacote oficial do ano. **A varredura só vale de 2010 em diante**:
até 2008 o `SQ_CANDIDATO` é sequencial por unidade da federação e colide entre estados,
limitação que a própria migration `20260730170000` registra. Ignorar isso produz uma
lista de 108 falsos positivos; respeitá-la produz a lista abaixo.

405 linhas vivas de financiamento em ficha publicável, anos 2010 a 2024:

| Classe | Linhas | Leitura |
|---|---|---|
| **B. Nome e nascimento diferentes** | **6** | O SQ pertence a outra pessoa. Erro publicado. |
| A2. Mesmo nome, nascimento com anos de diferença | 8 | Homônimo provável. Exige curadoria, não correção automática. |
| A1. Mesmo nome, nascimento com dias de diferença | 8 | Ruído de cadastro do próprio TSE entre pleitos. Não é achado. |
| Sem divergência | 383 | - |

**Classe B, as seis linhas publicadas com dinheiro de outra pessoa:**

| Ficha | Ano | Valor | Origem da escrita | O SQ pertence a |
|---|---|---|---|---|
| `alvaro-dias-rn` | 2018 | R$ 5.439.178,66 | `pf-ajustes-financiamento-20260810` | ALVARO FERNANDES DIAS (nasc. 07/12/1944), Presidente/BR |
| `alvaro-dias-rn` | 2022 | R$ 5.082.816,36 | `pf-ajustes-financiamento-20260810` | ALVARO FERNANDES DIAS, Senador/PR |
| `joao-campos` | 2022 | R$ 1.901.742,28 | `pf-ajustes-financiamento-20260810` | JOÃO CAMPOS DE ARAÚJO (nasc. 28/12/1962), Senador/GO |
| `dr-daniel` | 2022 | R$ 15.237,06 | `pf-ajustes-financiamento-20260810` | DANIEL SOUSA DE OLIVEIRA (nasc. 28/10/1996), Dep. Estadual/BA |
| `mauricio-coelho` | 2012 | R$ 7.838,83 | `TSE` | MAURICIO COELHO RIBEIRO DA SILVA (nasc. 05/10/1974), Vereador/MT |
| `mauricio-coelho` | 2020 | R$ 172,00 | `TSE` | MAURICIO COELHO RIBEIRO DA SILVA, Vereador/MT |

Quatro das seis vêm da mesma execução, `pf-ajustes-financiamento-20260810`. Três delas
(`alvaro-dias-rn` 2018 e 2022, `joao-campos` 2022) estão em `financiamento_quarentena`
com o **valor idêntico**, postas lá em 30/07/2026 às 19:11 com o motivo
"SQ_CANDIDATO do seed pertence a outra pessoa". Ou seja: a linha foi retirada por
estar errada e voltou onze dias depois, por outro caminho de escrita, com o mesmo
número.

Para `joao-campos` a prova fecha por exaustão: em 2022 existem três "João … Campos" no
país (RS, TO e GO), nenhum de Pernambuco. João Henrique de Andrade Lima Campos, então
prefeito do Recife, não foi candidato.

**Classe A2, para curadoria humana.** Mesmo nome, nascimento com anos de diferença,
o que o casamento por nome não distingue:

| Ficha | Nascimento na ficha (= TSE 2026) | Nascimento nos SQ históricos | Anos afetados |
|---|---|---|---|
| `dr-daniel` | 1979-02-16 | 1986-08-25 | 2012, 2016, 2018, 2020, 2024 |
| `gabriel-azevedo` | 1989-02-16 | 1986-03-12 | 2016, 2020, 2024 |

As duas fichas foram trianguladas em 26/07 e classificadas como "troca de partido
legítima, intocadas" (`docs/homonimos-historico-2026-07-26.md`). Aquela triagem olhou
sigla e progressão de cargo; não olhou data de nascimento. O sinal determinista que
separa os casos é justamente o que a migration `20260730170000` propôs por escrito:
"uma pessoa tem UMA data de nascimento. SQs do mesmo slug que discordam da data
denunciam pessoa errada sem falso positivo. Essa checagem entra no gate em
migration/commit próprio". Ela **nunca entrou no gate**. Esta varredura é essa
checagem, rodada uma vez à mão.

Contraprova do lado seguro: a `data_nascimento` das 206 fichas com SQ bate **exatamente**
com o `consulta_cand` de 2026 em 206 de 206. O cadastro do pleito corrente está certo;
o que diverge é a âncora dos pleitos passados.

### 2.5 Links de fonte (frente g)

`scripts/link-check-pontos-atencao.ts --dry-run --sem-estado`, sobre o acervo inteiro:
323 pontos de atenção, 257 URLs únicas.

| Estado da URL | Contagem |
|---|---|
| Viva | 191 |
| Morta | 36 |
| Indisponível | 20 |
| Sem caminho | 9 |
| Sem substância | 1 |

O que importa para esta revisão é o recorte do leitor, e ele está limpo:

| Recorte | Com fonte morta | Sem fonte utilizável |
|---|---|---|
| **Em ficha pública** | **0** | **0** |
| Fila de publicação (candidato fora do ar) | 0 | 32 |

As 66 claims marcadas `visivel = true` sem fonte com conteúdo pertencem a fichas **não
publicáveis**. Conferência de duas delas, incluindo a única de gravidade crítica:
"Operação policial com 56 mortes na Baixada Santista" está no slug `tarcisio`, e
"Governador do Ceará com investimento em educação" está em `ciro-gomes`. Os slugs
publicados são `tarcisio-gov-sp` e `ciro-gomes-gov-ce`. `visivel = true` no ponto de
atenção não significa que a claim aparece no site, distinção que o próprio script
documenta.

A execução usou `--sem-estado` de propósito: sem essa flag o link-check grava memória
em `link_check_url_observacao` mesmo em `--dry-run`, e esta revisão não escreve no
banco. O custo é que nenhuma morte pode ser confirmada em execução única (o script
exige duas), então as 36 URLs mortas ficam como suspeita, não veredito.

---

## Parte 3: consistência transversal

Cruzamentos entre `candidatos_publico`, `chapas_2026`, o roster
`data/candidate-roster-active-20260829.json`, o seed `data/candidatos.json` e o pacote
oficial `consulta_cand_2026` do TSE (cópia local em `.tse-audit-cache/2026/`, 20.863
candidaturas indexadas por `SQ_CANDIDATO`).

### 3.1 Roster e fichas

| Cruzamento | Resultado |
|---|---|
| Perfil `active` no roster sem ficha publicável | **0** |
| Ficha publicável ausente do roster | **1**: `leonardo-avalanche` (Vice-Presidente, sem UF, sem SQ) |
| `sq_candidato_2026` nulo em ficha publicável | **3**: `leonardo-avalanche`, `rico-pinheiro`, `well-macedo` |
| `sq_candidato_2026` divergente do roster | **0** |
| `sq_candidato_2026` que não existe no pacote oficial 2026 | **0** (206 de 206 conferidos) |
| `cpf` nulo em ficha publicável | **3**: `rico-pinheiro`, `vera-lucia-ce`, `well-macedo` |
| Ficha publicável de Governador sem chapa em `chapas_2026` | **0** |
| Partido divergente do pacote oficial | **0** |
| Cargo divergente do pacote oficial | **0** |

O roster de 29/08 traz o SQ das duas fichas cujo banco tem `sq_candidato_2026` nulo, e
o pacote oficial confirma os dois números:

| Ficha | SQ no roster e em `chapas_2026` | Conferência no `consulta_cand_2026` |
|---|---|---|
| `well-macedo` | `140002554108` | WELLINGTA JOSYANE SIQUEIRA MACEDO, urna WELL MACEDO, GOVERNADOR/PA, PSTU, nasc. 23/03/1980, bate com o banco |
| `rico-pinheiro` | `70002553982` | ALDERICO DA SILVA PINHEIRO FILHO, urna RICO PINHEIRO, GOVERNADOR/DF, PRTB, nasc. 16/02/1980, bate com o banco |

Há corroboração interna: a `foto_url` das duas fichas já é
`https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/20322002026/<SQ>/<UF>`,
com exatamente esses SQ. O site já renderiza a foto ancorada num SQ que a coluna
`sq_candidato_2026` diz não existir.

O CPF das três fichas está publicado pelo TSE no `consulta_cand_2026`, e
`scripts/backfill-cpf-tse.ts` resolve por SQ na rota 1 (a rota 2, nome mais nascimento,
não persiste sozinha, por decisão registrada no próprio arquivo).

**Atenção à âncora que o pipeline realmente lê.** A rota 1 casa contra o
`ids.tse_sq_candidato` do seed `data/candidatos.json`, não contra a coluna
`candidatos.sq_candidato_2026`. As duas coisas são âncoras distintas, e hoje elas
discordam: o commit `bcfbf4c` inscreveu `well-macedo` e `rico-pinheiro` no seed com o
SQ correto e isso bastou para o pipeline resolver o CPF das duas, enquanto a coluna do
banco **continua NULL**. A migration proposta `20260903200000` segue necessária e suas
pré-condições seguem valendo: o que ela fecha é a divergência entre a coluna, o seed, o
roster e `chapas_2026`.

### 3.2 A causa mecânica das 42 fichas sem coleta

**47 das 209 fichas publicáveis não estão em `data/candidatos.json`**, o seed. São
exatamente as ondas de 13/08, 17/08 e 28/08.

`src/lib/published-consistency.ts` já tem a checagem que pegaria isso, e ela é
classificada como anomalia **dura**:

```ts
if (seedSlugs) {
  const publishedNotInSeed = rows.filter((r) => !seedSlugs.has(r.slug)).map((r) => r.slug)
  if (publishedNotInSeed.length) hard.push(`publicados fora do seed: ${publishedNotInSeed.join(", ")}`)
}
```

O único consumidor em produção é o cron diário `/api/internal/published-consistency`,
que chama `analyzePublishedConsistency(data)` **sem o segundo argumento**. Com
`seedSlugs` indefinido, o bloco inteiro é pulado. A checagem existe, está correta, e
nunca rodou. Ela teria falhado na primeira ficha da onda de 13/08.

A consequência encadeia: fora do seed não há `ids.tse_sq_candidato`, então
`idsOficiaisNoSeed()` não resolve a âncora; sem âncora o `tse-resolver` não casa (e não
pode cair para o casamento por nome, que `shouldSkipWeakMatch` proíbe em qualquer ano);
sem CPF a varredura de sanções pula a ficha por guarda explícita. As 42 fichas sem
nenhum log são o resultado dessa cadeia, não 42 falhas independentes.

**Delimitação, corrigida em 04/09 por auditoria independente.** O carregador do pipeline
em lote é `loadCandidatosPublicos()` (`scripts/lib/helpers-db.ts`), que é a **interseção**
entre o seed e `candidatos_publico`. Dizer que a ficha fora do seed fica "invisível para
a coleta inteira" é forte demais: as 45 fichas fora do seed somam 892 recibos em
`coleta_log`, sendo **870 de `google-news`**, renovados em cinco execuções entre 18/08 e
03/09. A razão é que `google-news` tem dois escritores, e o do aplicativo monta a coorte
consultando `candidatos_publico` direto, em `defaultFetchCandidatoPage`
(`src/app/api/news/refresh/route.ts`); `src/lib/news/refresh.ts` só recebe a lista
pronta e a processa.

Isso afia a tese em vez de derrubá-la: a única fonte que não depende do seed é
exatamente a única que essas fichas receberam. A redação correta é que ficha fora do
seed não entra nas execuções do pipeline em lote, para toda fonte que use
`loadCandidatosPublicos()`.

### 3.3 Biografias: molde e duplicata

Não há duplicata literal. `well-macedo` e `rico-pinheiro`, o par citado como caso
conhecido, têm biografias **distintas** e específicas de cada pessoa (153 e 163
caracteres): mesma fôrma de frase, dados diferentes. O que existe é uma fôrma
compartilhada, e ela é grande.

| Achado | Fichas |
|---|---|
| Bios com o bloco "consta na base oficial de candidaturas do TSE e aguarda julgamento; registro pendente não equivale a candidatura deferida" | **83** |
| Destas, com menos de 180 caracteres de biografia própria fora do bloco | **23** |
| Pares com similaridade de trigramas ≥ 0,30 | 392 |
| Par mais similar | `luiz-franca` × `sandro-alex` (0,596) |
| Bios com menos de 220 caracteres no total | 16 |

Exemplo do que a fôrma produz (`luiz-franca`, 241 caracteres): a biografia inteira é
"Luiz França é advogado, ativista e filiado ao Partido Missão", seguida do bloco. Os
outros 180 caracteres são o mesmo texto que aparece em outras 82 fichas.

Isso não é dado inventado, e por isso não é erro factual: o bloco descreve um fato
verdadeiro sobre o registro. Mas ele infla a coluna Bio, que mede presença
(`biografia is not null`) e por isso marca 209 de 209 `ok`, e faz o leitor de 23 fichas
sair sem nenhuma informação biográfica além da profissão e do partido.

O bloco também carrega uma afirmação de situação que a Parte 2 põe em dúvida.

### 3.4 Nome de urna divergente da urna oficial

`nome_urna` é o nome que a ficha, os cards, o grid, o comparador e o quiz mostram.
Em **45 das 206 fichas com SQ**, ele difere do `NM_URNA_CANDIDATO` do pacote oficial.

| Classe | Fichas | O que é |
|---|---|---|
| Título omitido | 19 | A urna traz um qualificador que o site não mostra: `natasha-slhessarenko` aparece como "Natasha Slhessarenko", e na urna é "DOUTORA NATASHA"; `samara-mineiro` é "PROFESSORA SAMARA MINEIRO"; `wilson-grassi-junior` é "VETERINÁRIO WILSON GRASSI" |
| Nosso nome é maior | 16 | O site usa o nome civil e a urna usa o apelido: "Tarcísio de Freitas" contra "TARCÍSIO", "Romeu Zema" contra "ZEMA", "Ricardo Cappelli" contra "CAPPELLI" |
| Variante | 9 | Formas diferentes: "Cleitinho" contra "CLEITINHO AZEVEDO", "Alysson Bezerra" contra "ALLYSON", "RODRIGO BOLSONARO" contra "RODRIGO DE BOLSONARO" |

A UI nunca rotula esse campo como "nome na urna", então nenhuma ficha afirma
falsamente qual é o nome na urna. O custo é de reconhecimento e de busca: quem procura
pelo nome que vai ver na urna não acha 19 dessas fichas.

### 3.5 Duplicidade oficial em `chapas_2026`

13 das 220 linhas de `chapas_2026` estão marcadas `identidade_status =
duplicidade_oficial`, em 7 UFs (CE 3, PA 3, MT 2, SP 2, MS 1, RJ 1, SE 1). A conferência
no pacote oficial mostra que a duplicidade é do TSE, não nossa. O caso do Ceará:

- `60002553922`: VERA LUCIA DA SILVA, urna VERA LÚCIA, **GOVERNADOR**/CE, NOVO, nasc. 31/10/1967
- `60002540335`: VERA LUCIA DA SILVA, urna VERA LÚCIA, **VICE-GOVERNADOR**/CE, NOVO, nasc. 31/10/1967

Mesma pessoa (nome e nascimento idênticos), registrada nas duas posições no pacote
oficial. A ficha publicada aponta para o registro de Governador, que é o correto para
o cargo que ela declara. A quarentena está fazendo o que deve.

---

## Parte 4: plano de correção priorizado

Ordenado por impacto sobre o leitor: **erro factual publicado antes de lacuna, lacuna
em candidato competitivo antes de lacuna em nanico**. O sinal de competitividade usado
é rastreável e é do próprio projeto: aparecer em pesquisa eleitoral qualificada
(`scripts/data/pesquisas-governadores-2026.json` e
`scripts/data/pesquisas-presidencia-2026.json`), que cobre 109 das 209 fichas, em 16
unidades da federação mais a disputa presidencial. Nas 12 UFs sem pesquisa no acervo,
a ausência do sinal não significa baixa competitividade, e o critério cai para o cargo.

### P0. Erro factual publicado sobre pessoa nomeada

| # | O que está errado | Fichas | Fonte a consultar | O que resolve | Gate que impediria a volta |
|---|---|---|---|---|---|
| 1 | Trajetória de outra pessoa no ar: 6 linhas de `historico_politico` de ÁLVARO FERNANDES DIAS (PR) na ficha de ÁLVARO COSTA DIAS (RN) | `alvaro-dias-rn` | `consulta_cand` 2002/2006/2014/2018/2022, 28 UFs por ano | migration proposta `20260903220000_despublicar_alvaro_dias_rn_homonimo.sql` | Estender `audit:seed-sq-identity:gate` para conferir **data de nascimento**, não só nome, é o que a `20260730170000` prometeu e não entregou |
| 2 | Dinheiro de campanha de outra pessoa no ar: 6 linhas de `financiamento` (classe B da seção 2.3), R$ 12,4 mi somados | `alvaro-dias-rn`, `joao-campos`, `dr-daniel`, `mauricio-coelho` | `consulta_cand` do ano de cada linha (2010+) | Despublicação lógica; a view `financiamento_publico` já filtra `despublicado_em`. As duas de `alvaro-dias-rn` entram na migration acima; as outras quatro precisam de arquivo próprio | Gate novo: nenhuma linha viva de `financiamento` com `sq_candidato` cujo nome **e** nascimento divirjam da ficha (a varredura da seção 2.3, virada em script) |
| 3 | Regressão de correção: 3 pares (slug, ano) voltaram da quarentena de 30/07 com valor idêntico, por outro caminho de escrita | `alvaro-dias-rn` 2018/2022, `joao-campos` 2022 | `financiamento_quarentena` | Fechar `pf-ajustes-financiamento` para pares presentes na quarentena, ou exigir revisão nomeada | Gate: falhar quando um par (candidato, ano) existir simultaneamente em `financiamento_quarentena` e em `financiamento` com `despublicado_em IS NULL` |
| 4 | 4 fichas dizem "aguardando julgamento" com registro **indeferido** no TSE | `subtenente-luiz-carlos` (TO), `carlos-jararaca` (RN), `geraldo-carvalho` (PI), `jose-estevao` (BA) | `consulta_cand_complementar_2026`, coluna `DS_SITUACAO_JULGAMENTO` | Migration proposta `20260903210000` (vocabulário) mais `ingest-tse-situacao` lendo o pacote complementar | O gate é o próprio `ingest-tse-situacao`, que já bloqueia código fora do vocabulário; faltava só o arquivo que carrega o julgamento |
| 4b | Biografia nomeia vice que o TSE já substituiu | `reginaldo-lima` (MA), `policial-edjane` (SP) | DivulgaCandContas, campo `situacaoVice` | Curadoria do texto. O dado estruturado de `reginaldo-lima` já foi corrigido pela migration `20260903140000` de hoje; o texto não | Gate: falhar quando o nome do vice citado na biografia não constar como vice ativo em `chapas_2026` |
| 4c | `patrimonio_ausencia_oficial` afirma "zero bens" onde o TSE declara um bem | `hertz-dias` (2026) | DivulgaCandContas, `totalDeBens` e `st_DIVULGA_BENS` | Remover a linha de ausência e reingerir o patrimônio de 2026 | Gate: nenhuma linha de ausência oficial pode coexistir com `totalDeBens > 0` na mesma eleição |

**O que barateia o P0.4 e o P1.5:** o julgamento já está nos dados abertos, no pacote
`consulta_cand_complementar_2026` que o projeto **já baixa** em
`scripts/audit/gerar-identidade-etapa2.ts` e usa em
`scripts/lib/verificacao-campos-ledger-b2.ts` para profissão e escolaridade. Não é preciso
passar a depender do DivulgaCandContas: basta ler uma segunda coluna de um arquivo que já
está no caminho.

### O que as três migrations propostas fecham, e o que elas não fecham

Registrado aqui porque a leitura natural do parágrafo acima é que as migrações
resolvem o P0, e não resolvem. Das sete linhas do P0, as três migrações fecham
**duas e meia**:

| Item | Fechado pela migration? |
|---|---|
| P0.1 trajetória de outra pessoa | **Sim**, `20260903220000` |
| P0.2 dinheiro de outra pessoa | **Parcial.** As 2 linhas de `alvaro-dias-rn` entram na `20260903220000`. As outras 4, de `joao-campos`, `dr-daniel` e `mauricio-coelho`, não têm arquivo nenhum |
| P0.3 regressão da quarentena | **Não.** É gate, não migration. Nenhum arquivo escrito |
| P0.4 quatro fichas com registro indeferido | **Não, sozinha.** A `20260903210000` é o passo 1 de 3. Sem `ingest-tse-situacao` lendo o pacote complementar e sem rodar o ingest, nada muda no ar |
| P0.4b vice substituído citado na biografia | **Não.** Curadoria de texto |
| P0.4c ausência oficial contra `totalDeBens > 0` | **Não.** Nenhum arquivo escrito |
| P2.1 duas fichas sem âncora de SQ | **Sim**, `20260903200000`, mas o lote das 47 fichas no seed continua aberto |

O pareamento TypeScript da `20260903210000` foi feito junto e não é opcional:
`SITUACAO_CANDIDATURA_DOMINIO` ganhou os quatro estados,
`resolveCargoDisputadoProveniencia` ganhou o selo `registro_tse_indeferido`, e o
teste de domínio passou a resolver o CHECK **mais recente** por varredura em vez
de constante. A versão anterior do teste apontava para `20260903100100` e por
isso ficava verde comparando o TypeScript com o CHECK antigo, que é exatamente a
divergência silenciosa que ele existe para impedir.

Uma precedência também mudou, e ela é o que faz o P0.4 chegar ao leitor: um
julgamento publicado em `situacao_candidatura` agora vence um snapshot de
`chapas_2026` cujo `tse_situacao_codigo` seja `#NE`. Sem isso, as 4 fichas
indeferidas continuariam exibindo "Pedido de registro no TSE" mesmo depois de a
migration e o ingest rodarem, porque o ramo da chapa era conferido primeiro e
`#NE` está em 100% das linhas do snapshot.

### P1. Afirmação vencida em escala

| # | O que está errado | Fichas | O que resolve | Gate |
|---|---|---|---|---|
| 5 | 140 fichas pelo pacote (134 deferidas, 2 deferidas com recurso, 4 indeferidas) e 141 pelo DivulgaCandContas (135 deferidas) publicam `aguardando julgamento` para candidatura já julgada | 140 a 141 | Trilha de três passos: (a) vocabulário, na migration `20260903210000` e em `src/lib/situacao-candidatura.ts`, mesma PR; (b) `ingest-tse-situacao` passa a ler `consulta_cand_complementar_2026` (`CD_SITUACAO_JULGAMENTO`) além do `consulta_cand`, mantendo a regra de só persistir com `match_method === "sq-preloaded"`; (c) rodar o ingest | Monitor de frescor: falhar quando o `DS_SITUACAO_JULGAMENTO` do pacote divergir de `situacao_candidatura` em mais de N fichas. O pacote é baixável e diffável, então o monitor não depende de API ao vivo |
| 6 | A mesma afirmação vencida aparece na última frase da biografia de 83 fichas | 83 | Curadoria: o bloco precisa sair ou virar texto derivado do campo, não texto fixo | Gate de escrita: biografia não pode conter afirmação de situação de candidatura em texto livre |

### P2. Lacuna estrutural: as 42 fichas que nunca passaram pelo pipeline

Este é o item de maior volume e o de causa única. As 42 fichas das ondas de 13/08,
17/08 e 28/08 estão no ar sem nenhuma tentativa registrada em `coleta_log`.

**Lote automatizável.** A lista de slugs está em
`reports/2026-09-03-revisao-informacoes-fichas/consistencia-transversal-2026-09-03.json`.

```bash
PF_INGEST_SLUGS=<lista> npx tsx scripts/ingest-all.ts tse-historico filiacao tcu sancoes jarbas
```

**Correção de premissa.** Uma versão anterior desta página dizia que só `camara` e
`senado` aceitavam recorte por slug, e que as demais fontes rodavam sobre a coorte
inteira. Está errado. `PF_INGEST_SLUGS` é lida dentro de `loadCandidatos()`
(`scripts/lib/helpers.ts`), e **todos** os módulos de ingestão passam por ela, então a
variável escopa a coleta inteira de uma vez. A flag `--slugs` do CLI é outra coisa:
essa sim só chega a `camara` e `senado`. O `tse` tem ainda os recortes próprios
`PF_TSE_FINANCIAMENTO_SLUGS` e `PF_TSE_PATRIMONIO_SLUGS`.

O docstring da própria função descreve o uso desta noite: "serve para trabalhar um lote
sem tocar na ficha de quem está sendo curado em paralelo por outra sessão". Slug
inexistente aborta a execução, de propósito.

**Ordem sugerida**, porque a cadeia tem dependência real:

1. `sq_candidato_2026` das 2 fichas sem âncora (migration proposta `20260903200000`) e
   entrada das 47 fichas no seed `data/candidatos.json`, por PR;
2. `npx tsx scripts/backfill-cpf-tse.ts`, que resolve por SQ do seed. Executado para
   `well-macedo` e `rico-pinheiro` na noite de 03/09; falta `vera-lucia-ce`, cujo CPF
   está publicado no `consulta_cand_2026`;
3. `npx tsx scripts/ingest-all.ts tse-historico filiacao wikidata-politico`, fecha
   trajetória e histórico partidário, que é o que destrava a régua de patrimônio
   (sem histórico com proveniência `tse`, a coluna sai `n/a` em vez de lacuna);
4. `npx tsx scripts/ingest-all.ts tcu sancoes jarbas`, fecha as colunas de achado;
5. `npx tsx scripts/ingest-all.ts tse` com os recortes de patrimônio e financiamento;
6. rodar `npm run audit:cobertura` de novo e comparar com o snapshot de hoje.

**Gate que impediria a recorrência, e ele já existe.** `src/lib/published-consistency.ts`
tem a checagem dura `publicados fora do seed`, guardada por `if (seedSlugs)`. O único
consumidor em produção, o cron `/api/internal/published-consistency`, chama
`analyzePublishedConsistency(data)` sem o segundo argumento, então o bloco nunca roda.
Passar os slugs do seed é uma linha, e teria falhado na primeira ficha de 13/08.

Uma segunda checagem, essa nova: ficha publicável sem nenhuma linha em `coleta_log`
para as fontes obrigatórias do cargo. É o que transformaria "42 fichas vazias no ar"
em "42 fichas barradas na publicação".

### P3. Curadoria humana, não automatizável

| # | Item | Volume | Por que exige gente |
|---|---|---|---|
| 7 | Homônimo provável classe A2 (`dr-daniel`, `gabriel-azevedo`) | 8 linhas | Mesmo nome, nascimento com anos de diferença. Despublicar sem conferir esconde mandato verdadeiro, que é o erro oposto e igualmente grave |
| 8 | 23 biografias em que o texto próprio tem menos de 180 caracteres fora do bloco-molde | 23 | Biografia é texto na voz do projeto sobre pessoa real; não há fonte que preencha sozinha |
| 9 | 16 biografias com menos de 220 caracteres no total | 16 (10 delas em ficha que aparece em pesquisa) | Idem |
| 10 | Processos: 147 fichas com zero, das quais só 10 têm "verificado e vazio" e 74 estão como tentativa inconclusiva | 147 | `docs/criterio-processos-judiciais.md` já decidiu que não haverá ingest automático; a fila de busca ativa é a prioridade 1 a 4 daquele documento |
| 11 | 3 fichas com `situacao_candidatura = incerto` cujo SQ hoje resolve no pacote oficial | `isael-munduruku`, `laudicerio-aguiar`, `mauricio-coelho` | `incerto` é estado editorial ("as fontes divergem"); a divergência que o justificava pode ter caducado com o fechamento do prazo de registro. Decisão editorial, não automática |
| 12 | 19 fichas em que o nome exibido omite o título que consta na urna | 19 | Decidir primeiro o que a coluna `nome_urna` é: nome de urna ou nome de exibição. Hoje ela é usada como exibição e nomeada como urna |
| 13 | 11 fichas sem redes sociais, 8 delas nunca coletadas | 11 | `busca-redes-manual` já existe como fonte de curadoria em `coleta_log` |
| 14 | Cargo encerrado exibido como atual (`haddad-gov-sp`, "Ministro da Fazenda, 2023 - atual"; deixou o cargo em 19/03/2026) | 1 confirmado na amostra, universo não medido | O campo `cargo_atual` e a biografia não têm data de validade; fechar o período exige apuração caso a caso |
| 15 | Profissão declarada divergente do `DS_OCUPACAO` do TSE | 4 na amostra (`jorginho-mello`, `clecio-luis`, `cabo-daciolo`, `leonardo-avalanche`) | Parte é curadoria editorial deliberada ("bombeiro militar" em vez de "militar reformado"); decidir se o campo é o do TSE ou o do projeto antes de corrigir |
| 16 | Trajetória incompleta: candidaturas que o TSE lista para o mesmo SQ e a ficha não tem | 2 na amostra (`delcidio-amaral`, `policial-edjane`) | O inverso do homônimo. Reingestão resolve o volume, mas cada linha nova precisa da mesma prova de identidade |
| 17 | Contagem de processos no card de overview não separa réu de autor (`alan-rick`: 3 criminais em que ele é vítima ou polo ativo) | 1 na amostra | Decisão de produto: o número de topo afirma exposição judicial que a leitura das linhas desmente |
| 18 | Status processual vencido (`vera-lucia-ce`, processo julgado improcedente em 11/02/2025 publicado como "Remetido a outro foro") | 1 na amostra | Curadoria: processo publicado não tem monitor de andamento |

### O que esta revisão deixou fora, e por quê

- **Nenhuma escrita no banco.** As três migrations propostas estão em
  `supabase/migrations/` com bloco `@write`, **não aplicadas**, e cada uma diz no topo
  que exige aprovação explícita e dispatch manual do workflow.
- **Nenhuma correção de dado por conta própria.** Onde a fonte não tem o dado, esta
  revisão registra a ausência com fonte e data, em vez de preencher.
- **A varredura de `sq_candidato` divergente não cobre 2002 a 2008**, porque o
  `SQ_CANDIDATO` só é chave global do TSE de 2010 em diante. As 99 linhas vivas desses
  anos ficam sem esta conferência, e dizer o contrário seria inventar cobertura.
- **`patrimonio` não guarda `sq_candidato`**, então a mesma varredura não pôde ser
  feita para bens declarados. É lacuna de esquema, não de execução.

---

## Migrations propostas, não aplicadas

Três arquivos em `supabase/migrations/`, cada um com bloco `@write` e com a exigência de
aviso no topo dizendo que produção só as recebe pelo workflow de apply. Nenhum foi executado contra produção.

| Arquivo | O que faz | Estado |
|---|---|---|
| `20260903200000_backfill_sq_candidato_ondas_agosto.sql` | Preenche `sq_candidato_2026` de `well-macedo` e `rico-pinheiro` | Não aplicada |
| `20260903210000_vocabulario_situacao_julgamento_publicado.sql` | Alarga o CHECK de `situacao_candidatura` para os quatro estados de julgamento | Não aplicada. **Não aplicar sozinha**: `src/lib/situacao-candidatura.ts` é o outro lado do mesmo domínio e vai na mesma PR |
| `20260903220000_despublicar_alvaro_dias_rn_homonimo.sql` | Despublica as 6 linhas de trajetória e as 2 de financiamento do homônimo | Não aplicada |

As três passam nos gates do próprio repositório, e os três gates foram remedidos, não
estimados:

| Gate | Resultado |
|---|---|
| `npm run audit:cobertura:allowlist` | OK, todo `@write` coberto por allowlist |
| `bash scripts/audit/replay-migrations.sh --gate` | 344 aplicadas, 105 falhas reais, conservação 344 + 105 = 449, conjunto de falhas inalterado |
| `bash scripts/audit/replay-migrations.sh --schema-gate` | 94 aplicadas limpo, 0 falhas, hash `c44bc413…` |
| `tests/migrations-classificacao.test.ts` e vizinhos | 70 de 70 |

O replay reprovou duas vezes antes de passar, e as duas reprovações eram defeito real das
migrations propostas: faltava o guard de ausência (replay em banco vazio) nas duas de
dado, e o `COMMENT ON CONSTRAINT` da de schema ficava fora do guard, quebrando no caminho
de no-op.

Houve uma terceira reprovação, achada só em 04/09 por auditoria independente: o baseline
do hash de schema foi gravado às 21:42 e o texto do `COMMENT ON CONSTRAINT` foi editado
às 23:29, sem nova medição. Comentário de constraint entra no `pg_dump`, então o gate
passou a reprovar e este relatório afirmou por algumas horas que ele passava. O delta foi
inspecionado, não copiado: revertendo só a string do comentário, o hash volta a
`b8cc9a75…`, o que prova que nada estrutural mudou. O baseline agora carrega o hash
medido sobre o arquivo final, `c44bc413…`. Os arquivos de baseline que precisaram acompanhar a medição:
`scripts/audit/falhas-replay-linear.json` (341 para 344),
`scripts/audit/lib/migrations-classificacao.ts` (`schemaReplayTamanho` 93 para 94),
`scripts/audit/schema-replay-substituicoes.json` (hash canônico do `pg_dump`),
`scripts/audit/recortes.json` e duas allowlists novas.

**O que falta nas três, e o relatório paralelo tem razão em cobrar.** A convenção do
repositório para migration de dado em produção é um par de workflows,
`apply-<nome>-production.yml` e `rollback-<nome>-production.yml`, como existe para
`chapas-ma-vice`, `elizeu-patrimonio-sq` e as demais. As três propostas aqui não têm esse
par, e a de `alvaro-dias-rn` não tem receipt de pré-imagem em `coleta_log`. Antes de
qualquer aplicação, isso precisa ser escrito: sem o workflow de rollback, a correção não
tem caminho de volta operável.

Dois gates de conteúdo não puderam rodar aqui, e isso não é resultado verde:
`audit:marcadores-tse:gate` e `audit:encoding-publico:gate` exigem `SUPABASE_URL` mais a
service role key, que esta revisão não usou por ser somente leitura. Os dois falham
fechado por falta de credencial, como devem.
