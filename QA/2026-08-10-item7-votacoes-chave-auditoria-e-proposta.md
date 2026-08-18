# Item 7: votações-chave. Auditoria do que está publicado, e proposta de ampliação

Trilha C, branch `trilha-c`. Levantamento e proposta. **Nada foi escrito no
banco, nenhuma votação foi adicionada, nenhum voto foi corrigido, nenhuma linha
foi despublicada.** O corte editorial é decisão do Thiago.

Esta é a v2, refeita depois do bloqueio de 10/08. A v1 subestimava o problema e
o motivo era um defeito meu de método, descrito na seção "O que a v1 errou".

## O que mudou entre a v1 e esta versão

| | v1 | v2 |
|---|---|---|
| Classificação procedimental | duas listas de regex, uma por script, cobrindo só urgência, destaque, adiamento, retirada, encerramento, prejudicado, pela ordem | **uma** régua em `scripts/lib/votacao-classificacao.ts`, cobrindo também requerimento genérico, preferência, recurso, redação final, prorrogação e a forma flexionada "destacado" |
| Valores possíveis | binário: procedimental ou não | **três**: `procedimental`, `merito`, `nao_classificada` |
| Agrupamento por matéria | depois do corte de participação, sobre uma amostra de 90 | **antes** do corte, sobre o universo elegível inteiro |
| Linhas erradas encontradas | 3, com 53 pares candidato-voto | **6, com 100 pares** |
| "Matérias distintas" reportadas | 41 e 33 | 115 e 216 |
| Procedimentais na proposta | 12 | 0, com teste de regressão nas 12 |

### O que a v1 errou

Três erros, e o primeiro causa os outros dois.

1. **Régua duplicada.** A auditoria e a proposta tinham cada uma sua lista de
   regex. A auditoria reprovava "requerimento de urgência" e a proposta deixava
   passar "Aprovado o Requerimento", que é a mesma coisa. Resultado: 12 votações
   procedimentais entraram na proposta como se fossem matéria de mérito, ou
   seja, a proposta repetia na ampliação o defeito que a auditoria apontava no
   PL das Fake News.
2. **"Não procedimental" tratado como "mérito".** Não são a mesma coisa.
   "Mantido o texto" pode ser a votação mais importante da matéria (é o caso da
   PEC 45/2019, a reforma tributária) ou um detalhe, e a descrição sozinha não
   permite afirmar. Chamar isso de mérito é afirmar o que não foi medido.
3. **Agrupamento depois da amostra.** Enriquecer as 90 mais votadas e só então
   agrupar faz uma matéria cuja votação mais participada esteja na posição 200
   nunca aparecer. O "41 matérias" da v1 era o número de matérias dentro de uma
   amostra, apresentado como número do universo. No universo são 115.

## Antes da ampliação: o que está publicado hoje está errado

O item 7 estava na triagem como Nível 3, "conteúdo raso, não bloqueia". A
auditoria diz outra coisa, e mais forte do que a v1 dizia.

**As 6 linhas da Câmara que têm voto estão todas defeituosas. São 100 pares
candidato-voto publicados.**

| Linha | Data publicada | Votação que o matching casou | Classificação | Pares |
|---|---|---|---|---|
| PL das Fake News | 10/04/2024 | 25/04/2023 | **procedimental**, urgência | 13 |
| Reforma Trabalhista | 11/07/2017 | 26/04/2017 | **procedimental**, redação final | 20 |
| Marco Temporal Indígena | 30/05/2023 | 30/05/2023 | **procedimental**, redação final | 12 |
| Auxílio Brasil (MP 1.061/2021) | 25/11/2021 | 25/11/2021 | **procedimental**, redação final | 8 |
| Teto de Gastos (EC 95) | 13/12/2016 | 25/10/2016 | não classificada, **data diverge** | 20 |
| Reforma da Previdência | 10/07/2019 | 07/08/2019 | não classificada, **data diverge** | 27 |

Quatro casadas com votação procedimental, quatro com data divergente (a Fake
News e a Trabalhista aparecem nas duas contas).

### O caso mais claro, conferido ponta a ponta

A proposição 2256735 (PL das Fake News) tem **uma única** votação de Plenário na
Câmara Dados Abertos: `2310837-8`, de **25/04/2023**, descrita oficialmente como
`"Aprovado o Requerimento de Urgência (Art. 154 do RICD). Sim: 238; não: 192;
total: 430"`. Votar a favor de acelerar a tramitação não é votar a favor do
conteúdo, e o mérito nunca foi a Plenário.

Não é inferência. Os votos gravados batem byte a byte com os da votação
procedimental:

| Candidato | API, votação `2310837-8` | `votos_candidato` |
|---|---|---|
| Erika Hilton | Sim | `sim` |
| Nikolas Ferreira | Não | `não` |
| Helder Salomão | Sim | `sim` |

### A causa estrutural

`ingestVotos` em `scripts/lib/ingest-camara.ts` casa por **proposição**, não por
votação:

- a primeira tentativa lê `/deputados/{id}/votacoes` e aceita qualquer votação
  daquela proposição, inclusive de comissão;
- a segunda lê `/proposicoes/{id}/votacoes`, filtra Plenário e olha **só as 3
  primeiras** (`plenVotacoes.slice(0, 3)`).

Duas consequências. Dois candidatos na mesma linha podem ter votos de votações
diferentes, apresentados lado a lado como se fossem o mesmo ato. E em 5 linhas
há votação de Plenário fora do alcance das 3 primeiras, 30 delas só no Teto.

Enquanto a chave for a proposição, a ficha não sabe dizer o que a pessoa votou.

## Por que as fichas têm tão pouca votação

**Causa 1, dataset pequeno.** 24 linhas para cobrir de 2012 a 2024.

**Causa 2, as linhas que existem não casam.** 8 das 24 estão com zero voto:
2 com proposição sem votação na API (Eletrobras, Arcabouço), 1 sem votação de
Plenário (Orçamento Secreto), 1 sem `proposicao_id` (Reforma Tributária Câmara),
1 cuja votação nominal não está em Dados Abertos (Impeachment, 17/04/2016), e 3
do Senado fora desta auditoria.

Efeito agregado nas 280 fichas:

| Votações-chave na ficha | Fichas |
|---|---|
| 0 | **219** |
| 1 | 13 |
| 2 | 21 |
| 3 a 7 | 27 |

O `cabo-daciolo` do print tem 2, e é o comportamento típico, não a exceção.

## O universo, as matérias e a shortlist

Três camadas distintas, e a v1 as misturava. Reprodutível:

```bash
npx tsx scripts/audit/levantar-votacoes-nominais-camara.ts --desde=2015-02-01 --ate=2019-01-31 --json=/tmp/u55.json
npx tsx scripts/audit/montar-proposta-votacoes.ts --entrada=/tmp/u55.json --shortlist=20 --saida=/tmp/p55.json
```

### Camada 1: universo

| | 55ª legislatura (2015-2019) | 57ª legislatura (2023-2026) |
|---|---|---|
| Votações nominais de Plenário | 723 | 1006 |
| Lacunas de cobertura | 0 | 0 |
| `procedimental` | 451 | 585 |
| `merito` | 35 | 96 |
| `nao_classificada` | 237 | 325 |
| Elegíveis (não procedimentais) | 272 | 421 |

Na 55ª e na 57ª legislaturas, 62% e 58% das votações nominais analisadas foram
classificadas como procedimentais. Isso demonstra que casar apenas por
proposição é ambíguo e exige identificar a votação nominal exata. Esses
percentuais, isoladamente, não medem a taxa de erro do matcher atual.

### Camada 2: matérias distintas

| | 55ª | 57ª |
|---|---|---|
| Matérias distintas no universo elegível | **115** | **216** |
| Com pelo menos uma rodada de mérito confirmado | 25 | 79 |
| Só com rodadas não classificadas, precisam de leitura humana | 90 | 137 |
| Renumeradas na fonte | 1 | 0 |

### Camada 3: shortlist

Critério: matéria com pelo menos uma rodada de **mérito confirmado**,
representada por essa rodada, ordenada por participação. As 20 primeiras de cada
legislatura estão em
`QA/evidencias/2026-08-10-item7-votacoes/proposta-55-legislatura.json` e
`proposta-57-legislatura.json`, com id de votação, ementa oficial, placar, a
regra que confirmou o mérito e as demais rodadas da matéria.

**55ª legislatura, as 10 primeiras:**

| Data | Proposição | Placar | Confirmado por | Matéria |
|---|---|---|---|---|
| 02/08/2017 | SIP 1/2017 | 263 x 227 | parecer de mérito | Denúncia do MPF contra Michel Temer |
| 30/06/2015 | PEC 171/1993 | 303 x 184 | substitutivo | Redução da maioridade penal |
| 26/05/2015 | PEC 182/2007 | 210 x 267 | substitutivo | Reforma política e financiamento |
| 30/06/2015 | PLP 37/2015 | 461 x 7 | emendas do Senado | Renegociação da dívida dos estados |
| 26/08/2015 | PEC 471/2005 | 333 x 133 | turno de PEC | Serventias extrajudiciais |
| 24/02/2015 | PLP 177/2012 | 442 x 22 | substitutivo | Transparência das finanças públicas |
| 12/09/2016 | REP 1/2015 | 450 x 10 | parecer de mérito | Cassação de Eduardo Cunha |
| 03/02/2015 | PEC 197/2012 | 388 x 66 | turno de PEC | ICMS, art. 155 |
| 10/03/2015 | PEC 590/2006 | 452 x 2 | turno de PEC | Comissões, art. 58 |
| 29/11/2016 | PL 3855/2019 | 450 x 1 | substitutivo | Medidas contra a corrupção |

**57ª legislatura, as 10 primeiras:**

| Data | Proposição | Placar | Confirmado por | Matéria |
|---|---|---|---|---|
| 27/05/2026 | PEC 221/2019 | 472 x 22 | turno de PEC | Redução da jornada de trabalho |
| 16/09/2025 | PEC 3/2021 | 353 x 134 | turno de PEC | Foro e prerrogativas parlamentares |
| 25/06/2025 | PDL 214/2025 | 383 x 98 | substitutivo | Sustação de decreto do Executivo |
| 08/04/2026 | PEC 383/2017 | 464 x 16 | turno de PEC | Recursos mínimos garantidos |
| 28/05/2026 | PEC 5/2023 | 385 x 93 | turno de PEC | Imunidade tributária |
| 06/05/2025 | PLP 177/2023 | 270 x 207 | substitutivo | Número de deputados por estado |
| 07/07/2026 | PLP 41/2026 | 470 x 1 | substitutivo | Enfrentamento da violência contra a mulher |
| 17/12/2024 | PLP 210/2024 | 318 x 149 | substitutivo | Contenção de despesas |
| 07/10/2025 | PEC 14/2021 | 446 x 20 | turno de PEC | Sistema Nacional de Saúde |
| 18/12/2024 | PL 327/2021 | 448 x 14 | emendas do Senado | Política Nacional da Transição Energética |

### O que ficou fora da shortlist e por quê

90 matérias na 55ª e 137 na 57ª têm só rodadas `nao_classificada`. Entre elas
está a **PEC 241/2016 (Teto de Gastos)**, cuja votação de 10/10/2016 é descrita
apenas como "Mantido o texto". É provavelmente a votação mais importante da
legislatura, e mesmo assim não entra na shortlist automática: entra por decisão
sua, depois de alguém ler. É essa a diferença entre "não classificada como
procedimental" e "mérito confirmado".

A lista dessas matérias está nos mesmos JSONs, em `precisamLeitura`.

### O caso PL 3855/2019, resolvido

A matéria de 29/11/2016 aparecia com proposição de ano posterior à votação.
Conferido na fonte: a proposição de id `2080604` está hoje na Câmara como
**PL 3855/2019**, com a ementa "Estabelece medidas contra a corrupção e demais
crimes contra o patrimônio público". São as 10 Medidas contra a Corrupção,
originalmente PL 4850/2016, **renumeradas pela própria Câmara**. Não é erro de
coleta e a matéria é legítima; o rótulo é que confunde. O pipeline agora marca
`renumeradaNaFonte` sempre que o ano da proposição é posterior ao da votação, e
essa é a única ocorrência nas duas legislaturas.

## Proposta

### A. Correção do que está publicado, antes de ampliar

Recomendação única, para você aprovar ou recusar: **despublicar as 6 linhas da
Câmara com voto** até que cada uma seja recasada por id de votação. Isso remove
100 pares candidato-voto das fichas. Manter deixa 100 afirmações erradas no ar,
sendo 53 delas sobre o que a pessoa votou e não só sobre quando.

Não executo sem você nomear o ato.

### B. Mudança de contrato do dataset

Acrescentar a `votacoes_chave` a coluna `votacao_id_api` (o id da votação, tipo
`2310837-8`) e passar o matching a casar por ela, recusando votação classificada
como `procedimental`. Efeitos: some a ambiguidade de qual votação casou, some o
`slice(0, 3)`, a ficha ganha link direto para `/votacoes/{id}/votos`, e votação
sem id deixa de aparecer em vez de aparecer vazia.

Migration com gate (`@write`, allowlist, proposta de recorte). Preparo quando
você aprovar o desenho.

### C. Ampliação

Regra de corte que proponho, e que você aprova ou troca: entra matéria com
rodada de mérito confirmado, representada por essa rodada. As matérias do balde
`precisamLeitura` entram uma a uma, por decisão sua, não por régua automática.

## O que preciso de você

1. Despublicar ou não as 6 linhas (seção A).
2. Aprovar ou trocar o desenho de casar por `votacao_id_api` (seção B).
3. Marcar quais matérias entram, das shortlists e do balde de leitura humana.

Com as três respondidas eu preparo migration com gate, allowlist e proposta de
recorte, mais o ajuste do matching, e devolvo readback antes e depois.

## Provas desta rodada

| Prova | Resultado |
|---|---|
| `tests/votacao-classificacao.test.ts` (novo, 20 casos, 12 deles as linhas reais que passaram na v1) | 20 pass, 0 fail |
| Suíte completa | 2567 pass, 0 fail |
| `npm run check:dead-code` | exit 0, `--max-issues 0` |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run settings:check` | 7 pass, 0 fail |
| `npm run build` | **exit 0**, em 39 min de relógio |
| Auditoria com retry, duas execuções | mesmo resultado nas duas |

**Sobre o tempo do build.** Os 39 minutos são contenção da máquina, não do
pacote: a compilação em si levou 15,1 min e o `runAfterProductionCompile` 44s,
com o restante no passo de TypeScript. Durante a execução o load average estava
em 253, com um `next build` concorrente da Trilha B e um `next-server` de outra
sessão de pé havia 1h16. O mesmo build no mesmo worktree, com a máquina
descarregada, havia terminado antes em poucos minutos. O resultado é conclusivo
(`exit 0`, todas as rotas emitidas); o que não é comparável entre execuções é o
relógio.

A auditoria ganhou retry porque sem ele duas linhas apareciam como `erro` numa
execução e com data real na outra. Diagnóstico que muda entre execuções não
serve de prova, e foi assim que a Reforma da Previdência quase ficou de fora da
lista de linhas defeituosas.
