# Honestidade da superfície pública: duas afirmações falsas corrigidas

Data: 2026-08-10. Branch `rc-honestidade-superficie`, nascida de `rc-lancamento` em `14d3cf6`.
Nada foi escrito no banco, nem aplicado, nem publicado. Só código, teste e leitura.

O princípio que rege o trabalho: ausência de coleta, erro de fonte ou identidade insuficiente
nunca podem virar zero, ficha limpa ou afirmação de que nada existe. A interface só pode afirmar
ausência quando a ausência foi verificada em fonte oficial, e nesse caso precisa mostrar a
ausência com **fonte e data**. Duas auditorias independentes acharam a superfície violando isso
em dois pontos, e os dois eram no caminho compartilhado das 194 fichas.

---

## Defeito 1: financiamento afirmava ausência sem ter verificado

### O que a superfície afirmava

Duas coisas, e as duas falsas.

**(a) A frase.** `getFinanciamentoEmptyState()` publicava, sempre que a ficha não tinha nenhuma
linha de financiamento e tinha alguma de patrimônio:

> Sem dados de financiamento. Não há registros de financiamento de campanha para este candidato no TSE.

Isso é uma afirmação sobre o acervo do TSE, feita sem nenhuma consulta ao TSE. Ela aparecia em
**18 das 194 fichas**.

**(b) O silêncio por pleito.** A aba Dinheiro renderizava um cartão por linha de financiamento e
calava sobre todo pleito disputado sem linha. Numa ficha com seis candidaturas e uma linha, o
leitor via um número e não tinha como saber se as outras cinco não existem, não foram coletadas
ou nunca foram procuradas. Era exatamente o defeito que a correção R2 já tinha fechado do lado do
patrimônio, com `buildPatrimonioEleicoes`.

### A prova de que era falso

Da auditoria de financiamento de 10/08, conferida contra os pacotes oficiais do TSE:

| caso | o que o TSE publica | o que a ficha mostrava |
|---|---|---|
| `flavio-bolsonaro`, 2002, Dep. Estadual | R$ 5.988,00 no `ReceitaCandidato.csv` de 2002 | nada; 2002 não era mencionado |
| `cabo-daciolo`, 2006, Dep. Estadual | R$ 1.259,44, 2 lançamentos, recursos próprios | nada |
| `cabo-daciolo`, 2008, Vereador | R$ 720,00, 3 lançamentos | nada |

O universo, medido contra a mesma âncora de candidatura que a ficha já usa para patrimônio:
718 candidaturas disputadas, 423 com financiamento publicado, **295 sem**, das quais 153 são
`nao_coletado` (o TSE publica e nós não coletamos) e 140 de ausência oficial, sendo 57 anteriores
a 2002, que é onde a série digital do TSE começa.

O readback mediu o mesmo 295 no DOM, o que fecha a auditoria com a superfície.

### O que passa a afirmar

Financiamento ganhou estado por pleito, no molde do que patrimônio já tem
(`src/lib/financiamento-eleicoes.ts`), com quatro estados e uma regra de proveniência:

| estado | quando | o que a ficha diz | fonte e data |
|---|---|---|---|
| `publicado` | há linha nesta ficha | o cartão de sempre, com valor e composição | não |
| `fora_da_serie_oficial` | pleito anterior a 2002 | "O TSE só publica prestação de contas eleitorais a partir de 2002, então não existe registro oficial de financiamento para a eleição de {ano}." | **sim**: link do portal de dados abertos do TSE e "Verificado em 10/08/2026" |
| `pleito_futuro` | pleito posterior a 2024 | "A eleição de {ano} ainda não foi realizada e a prestação de contas ainda não é devida." | não |
| `nao_coletado` | o resto | "A coleta de financiamento da eleição de {ano} ainda não foi realizada. A ausência de valores aqui não significa que não houve arrecadação nem que o TSE não tenha o registro." | não |

`fora_da_serie_oficial` é o **único** estado que afirma ausência, e é o único que carrega fonte e
data. Os outros três dizem o que não se sabe, e nenhum insinua que não houve arrecadação.

A frase antiga saiu. O estado vazio de financiamento só sobra quando não existe **nenhum** pleito
a descrever, e nessa hipótese ele fala só do que esta ficha tem:

> Sem financiamento de campanha nesta ficha. A trajetória pública desta ficha não registra
> candidatura com prestação de contas devida ao TSE. Isto não é uma consulta à base do TSE:
> nenhuma ausência foi verificada na fonte oficial.

### A âncora ficou única

"Pleito disputado" agora mora em `src/lib/pleitos-disputados.ts` e é a mesma para patrimônio e
financiamento. Duas cópias da regra dariam duas respostas para a mesma pergunta em duas abas da
mesma ficha, e a auditoria de financiamento mediu justamente contra a âncora de patrimônio.

---

## Defeito 2: judicial afirmava que a busca não foi feita, quando foi

### O que a superfície afirmava

O card de processos no overview escrevia a legenda **"não verificado"** para toda ficha sem
contagem apurada, incluindo as que têm desfecho de busca registrado em `coleta_log_ultima` para a
fonte `processos-curadoria`. Isso valia para **169 das 194 fichas**, e o comparador repetia a
mesma afirmação em duas superfícies ("processos não verificados").

Para as 7 fichas que a curadoria do DJEN de 10/08/2026 fechou como indeterminado, a afirmação era
comprovadamente falsa: `cabo-daciolo`, `edmilson-costa`, `samara-martins`, `jayme-campos`,
`joao-campos`, `marcelo-maranata` e `raquel-lyra`. Nelas a busca foi feita e foi exaustiva (nome
completo, nome de urna, CPF adjacente, cargo adjacente, co-parte institucional). O que falta é
segundo identificador no ato judicial, e em dois casos há CPF divergente provando homônimo.

Havia ainda um buraco a montante: `sem_achado_no_escopo` é desfecho válido do vocabulário de
`coleta_log`, e `src/lib/api.ts` o descartava antes de chegar à superfície. Curadoria registrada
com escopo limitado virava `null`, e `null` a ficha lê como "nunca houve tentativa". Hoje não há
linha com esse desfecho, então o efeito era latente, mas o caminho existia.

### O que passa a afirmar

A régua nova é simples: **só a ficha sem linha nenhuma pode dizer que não houve tentativa.**
Desfecho registrado nunca lê como trabalho não feito.

Estado vazio da aba Justiça, para `indeterminado`:

> **Busca feita, identidade não confirmada.** A busca judicial foi executada em {data} e nenhum
> registro pôde ser atribuído a esta pessoa: os documentos oficiais localizados não trazem um
> segundo identificador (CPF, cargo ou parte vinculada no mesmo processo) que feche a identidade.
> Como nomes se repetem, atribuir sem prova produziria acusação falsa. Nada foi atribuído, e isso
> não significa ficha limpa.

Legenda do card de overview, por desfecho:

| desfecho registrado | legenda |
|---|---|
| `indeterminado` | identidade não confirmada |
| `encontrado` | em revisão editorial |
| `sem_achado_no_escopo` | escopo limitado |
| `erro` | busca não concluída |
| `nao_aplicavel` | não se aplica |
| `vazio_confirmado` | escopo verificado (com contagem 0) |
| sem linha nenhuma | não verificado |

O comparador não recebe o desfecho, só a contagem, então ele passa a afirmar apenas o que é
verdade nos dois casos: "sem contagem de processos verificada".

### O que foi respeitado do contrato do curador

- **CPF é prova interna e não vai à superfície**, nem completo nem mascarado. Há teste que varre o
  texto de todos os estados de processos procurando padrão de CPF e sequência mascarada.
- **`descartado` não menciona que o processo existiu.** Nenhum estado novo introduz menção a
  homônimo descartado, porque mencionar planta a suspeita que a apuração desfez.
- **`vazio_confirmado` continua exigindo escopo nomeado** e segue com a copy antiga, que já diz
  que o resultado vale só para o escopo verificado e não equivale a certidão.

---

## Contagens, antes e depois, nas 194 fichas

Medidas pelo readback `scripts/audit/readback-honestidade-superficie.ts`, que renderiza os
componentes reais sobre o payload que o browser recebe (`toPublicCandidatoProfileDto`) e confere o
DOM, ficha a ficha. Evidência bruta em `QA/evidencias/2026-08-10-honestidade-superficie-{antes,depois}.json`.

| medida | antes | depois |
|---|---:|---:|
| fichas que afirmam ausência de financiamento sem verificar | **18** | **0** |
| fichas escondendo pleito disputado na aba Dinheiro | **109** | **0** |
| pleitos disputados omitidos | **295** | **0** |
| pleitos sem dado com estado explícito no DOM | 0 | **295** |
| ausências AFIRMADAS na aba Dinheiro | 0 | 57 |
| ausências afirmadas exibindo fonte E data | 0 | **57 de 57** |
| fichas com busca judicial registrada lendo "não verificado" | **169** | **0** |
| fichas com busca judicial registrada e sem processo publicável | 185 | 185 |

As 57 ausências afirmadas são exatamente os 57 pleitos anteriores a 2002 que a auditoria contou
como ausência oficial por início de série. Nenhuma outra ausência é afirmada na superfície.

Casos nomeados, conferidos no DOM depois da correção:

- `flavio-bolsonaro`: 2002 aparece como `nao_coletado`, e os cinco anos publicados continuam publicados.
- `cabo-daciolo`: 2006 e 2008 aparecem como `nao_coletado`; overview lê "identidade não confirmada".
- `rui-costa-pimenta`: 2002 `nao_coletado`; 2000, 1998 e 1996 `fora_da_serie_oficial` com fonte e data.
- `samara-martins`: 2022 aparece; overview lê "identidade não confirmada".

## Verificação

- `npm test`: exit **0**, 2819 testes, 0 falhas. Nenhum teste sensível a tempo falhou, então não
  houve flake a distinguir de regressão nesta rodada.
- `npm run check:dead-code` (knip, `--max-issues 0`): exit **0**.
- `npm run build`: exit **0**.
- Readback sobre as 194 fichas: exit **0** (ele sai 1 se qualquer contagem acima for diferente de zero).
- **Verificação visual real**, em navegador de verdade contra o build de produção
  (`next start -p 3210`, Chromium via Playwright): a lista "Pleitos sem financiamento publicado"
  de `rui-costa-pimenta` renderiza os quatro anos, com "Verificado em 10/08/2026" e o link
  "Fonte oficial" nos três anteriores a 2002; o card de processos do `cabo-daciolo` renderiza
  "— / PROCESSOS / identidade não confirmada"; a aba Justiça dele abre com o título
  "Busca feita, identidade não confirmada". A frase proibida não aparece em nenhuma das telas.

Os testes novos foram rodados também contra o código velho (`git stash push -- src/`): **9 falhas**,
o que prova que eles medem a correção e não o vazio.

## Arquivos

Novos:
- `src/lib/pleitos-disputados.ts`: âncora única de "pleito disputado".
- `src/lib/financiamento-eleicoes.ts`: estados de financiamento por pleito, com proveniência.
- `tests/financiamento-eleicoes.test.ts`, `tests/honestidade-superficie.test.tsx`.
- `scripts/audit/readback-honestidade-superficie.ts`.

Alterados:
- `src/components/EmptyState.tsx`: copy de financiamento e de processos.
- `src/components/CandidatoProfileSections.tsx`: lista de pleitos sem financiamento publicado.
- `src/lib/processos-display.ts`: legenda por desfecho registrado.
- `src/lib/ui-labels.ts`: rótulos do estado de financiamento.
- `src/components/ComparadorPanel.tsx`: uma string.
- `src/lib/api.ts`: `sem_achado_no_escopo` deixa de ser descartado.
- `src/lib/public-profile-dto.ts`: `buildPatrimonioEleicoes` passa a chamar a âncora compartilhada.
- `tests/dinheiro-empty-states-ui.test.ts`, `tests/processos-display.test.ts`: copy antiga.

### Aviso de merge para a Raiz

Outra sessão estava editando `src/lib/public-profile-dto.ts` e `src/components/CandidatoProfile.tsx`
para o caso do Daciolo enquanto esta rodava.

- `src/components/CandidatoProfile.tsx`: **não foi tocado** aqui.
- `src/lib/public-profile-dto.ts`: tocado com o mínimo, em dois pontos. O laço de 15 linhas dentro
  de `buildPatrimonioEleicoes` que derivava anos de pleito virou uma chamada a
  `anosDePleitoDisputado(historico, PATRIMONIO_ANO_INICIAL_APLICAVEL)`, e quatro imports que só
  serviam àquele laço saíram. A lógica é idêntica linha a linha, movida para
  `src/lib/pleitos-disputados.ts`. Se a outra sessão mexeu no mesmo laço, o merge tem de preservar
  a mudança dela **dentro da função nova**, não desfazer a extração.

## O que continua dependendo de ato externo

Nada disto foi feito aqui, e nada disto é código:

1. **Coleta de financiamento de 2002 a 2008.** 93 candidaturas em fichas públicas, todas já
   provadas como existentes no pacote oficial do TSE, e todas fora do alcance do ingest atual
   porque `DEFAULT_ANOS_DINHEIRO` começa em 2010. Exige ingest novo. Enquanto não rodar, esses
   pleitos continuam aparecendo como `nao_coletado`, que é verdade.
2. **Escrita dos 66 processos das 25 fichas confirmadas** pela curadoria do DJEN. O contrato de
   exibição está pronto para os quatro desfechos; o dado não entrou no banco.
3. **Gravar o desfecho da curadoria de 10/08 em `coleta_log`.** As 7 indeterminadas hoje leem o
   estado certo por causa da linha de 06/08 que já existe. A data que a ficha mostra é a de 06/08,
   não a de 10/08, e só uma escrita corrige isso.
4. **Ausência oficial de financiamento com prova por candidatura.** Hoje a superfície só afirma
   ausência onde a prova é uma propriedade da fonte (a série começar em 2002). Os 53 casos de
   `no-receita-at-source` de `data/sq-exceptions.json` e os 30 verificados na auditoria continuam
   exibidos como `nao_coletado`, que erra para o lado seguro. Promovê-los a ausência verificada
   exige uma tabela irmã de `patrimonio_ausencia_oficial` e escrita.
5. **A migration retida `20260807050000`** (detalhamento de origem de 255 linhas) segue retida.
   Decisão de dono.
6. **`FINANCIAMENTO_ULTIMO_PLEITO_COM_PRESTACAO_DEVIDA = 2024`** precisa virar 2026 depois que a
   prestação do pleito de 2026 for publicada. É constante de propósito, para o estado da ficha não
   depender do relógio de quem renderiza.
