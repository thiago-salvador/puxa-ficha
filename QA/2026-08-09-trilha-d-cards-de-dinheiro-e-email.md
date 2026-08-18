# Trilha D: cards de dinheiro e template de email

Branch `trilha-d`, worktree `../puxa-ficha-trilha-d`, base `base-lancamento`.
Escopo do prompt: itens 11+17L (layout do card de patrimônio) e item 18 (layout
do email de digest). Frontend puro. **Nenhum email foi enviado**, para ninguém.

## Item 11 + 17L: o card de patrimônio saía do padrão

### O que estava errado, medido

Hertz e Samara caem no mesmo caso: exatamente **um** registro de patrimônio
publicado (`hertz-dias` 2018, `samara-martins` 2022). Duas causas distintas, uma
por superfície.

**Visão geral.** A grade era `grid-cols-1 gap-6 md:grid-cols-2` sem
`items-start`, então cada card era esticado até a altura do vizinho. Medido no
DOM em 1280px, antes:

| Ficha | Altura do card | Altura do conteúdo | Vazio |
|---|---|---|---|
| Hertz | 356px | 60px | **297px** |
| Samara | 378px | 60px | **319px** |
| (referência) Financiamento | 356px | 274px | 82px |

Os 82px do card de financiamento são padding mais cabeçalho, o piso normal.
O card de patrimônio carregava ~230px de vazio além disso, porque o card de
financiamento ao lado tem rótulo do pleito, nota de fonte, cifra, rosca e lista
de doadores.

**Aba Dinheiro.** Com um registro só, `PatrimonioChart` desenhava **uma barra
com `flex-1`**, ou seja, um retângulo preto de largura inteira e 120px de
altura. Uma barra sozinha não compara nada; é um bloco chapado. E a cifra
aparecia só como subtítulo de 13px dentro do accordion, enquanto o card de
financiamento logo abaixo mostrava a dele em 24/28px. Essa é a "tipografia
própria" da nota.

### O que mudou

1. `ProfileOverview`: `items-start` na grade. Nenhum card curto vira caixa
   vazia, hoje ou depois, para qualquer teaser.
2. `PatrimonioTeaser`, ramo de registro único: mesma ordem de leitura do card de
   financiamento (contexto do pleito, escopo, cifra). Antes abria pela cifra e
   jogava o contexto para baixo dela. Texto publicado é o mesmo, só reordenado:
   "Declarado em 2018" e "Registro único disponível." deixam de ser uma frase só.
3. `MoneyTabSection`: o gráfico só é desenhado com **duas ou mais** declarações.
4. `ExpandableCard`: prop nova `valor`, opcional, que põe a cifra à direita em
   24/28px. Aplicada a patrimônio e a cota parlamentar, os dois únicos
   consumidores do componente. As três famílias de card de dinheiro passam a
   usar a mesma escala tipográfica.
5. `PatrimonioValorCard`, novo: declaração publicada **sem** detalhamento de
   bens não tem accordion para abrir. Antes o valor dela só aparecia no gráfico;
   sem o gráfico, sumiria. Este card fecha o buraco.

### Correção da ordenação, feita depois da revisão

A primeira versão do item 5 escolhia o componente em **duas passadas** sobre a
lista: um `filter().map()` para as declarações sem bens e outro para as com
bens. Isso agrupa por formato de card e destrói a ordem cronológica global: numa
série como a do Alckmin (2022, 2018, 2014 e 2010 com detalhamento, 2006 sem), a
declaração de 2006 subiria para o topo, acima da de 2022.

Agora é **um `sort` e um `map` só**, com a escolha do componente por item, dentro
do `map`. A ordem é do ano, para a lista inteira; o formato do card é uma
decisão local de cada linha.

Duas notas honestas sobre essa correção:

- **Nenhuma ficha publicada expunha o defeito visualmente.** Varri a base atrás
  de uma série em que a declaração sem bens não fosse a mais recente: entre as
  fichas realmente servidas pelo site, `roberio-paulino` tem a sem-bens em 2024
  (a mais recente) e `jose-roberto-arruda` tem as duas sem-bens já no topo, de
  modo que a ordem saía certa por acidente nos dois. Os casos que quebrariam de
  verdade (`geraldo-alckmin`, `gilberto-kassab`, `izalci-lucas`) respondem 404
  na superfície pública. Ou seja: era defeito de contrato do componente, latente
  nos dados de hoje, e o que o prende é o teste unitário, não a captura de tela.
- O alvo de scroll da timeline (`data-pf-timeline-ref`) passou a viver só no
  wrapper do `map`. Antes ele existia no wrapper **e** dentro do
  `PatrimonioValorCard`, o que daria dois elementos disputando o mesmo id de
  destino. Há teste para isso.

### Depois, medido no mesmo DOM

| Ficha | Altura do card | Altura do conteúdo | Vazio |
|---|---|---|---|
| Hertz | 131px | 73px | 58px |
| Samara | 131px | 73px | 58px |

58px é o piso de padding mais cabeçalho deste card. O vazio anômalo acabou.

### Evidência visual

Em `QA/evidencias/2026-08-09-trilha-d-cards-e-email/`, capturas do Playwright
contra o servidor local com dados reais de produção:

- `ficha-antes-{hertz,samara}-visao-geral-desktop.png`: o vazio dentro do card.
- `ficha-antes-{hertz,samara}-patrimonio-desktop.png`: o bloco preto de largura
  inteira, e a cifra escondida como subtítulo de 13px.
- `ficha-depois-{hertz,samara}-visao-geral-{desktop,mobile}.png`
- `ficha-depois-{hertz,samara}-patrimonio-{desktop,mobile}.png`
- `ficha-depois-omar-serie-longa-*`: caso de controle com 5 declarações e 8 anos
  de cota parlamentar, provando que o gráfico de evolução continua desenhado e
  que a cifra grande não estoura em 390px.
- `ficha-depois-roberio-formatos-mistos-*`: caso de controle da ordenação, com
  os dois formatos de card na mesma lista (2024 sem detalhamento, 2020 a 2012
  com), rendendo 2024, 2020, 2018, 2016, 2014, 2012 em ordem estrita de ano.

O "antes" foi capturado revertendo os três componentes com `git checkout`, com o
mesmo servidor e os mesmos dados do "depois", e restaurando em seguida: as duas
colunas da comparação são a mesma cena.

Reproduzir, com o servidor local de pé:

```bash
TAG=depois node .claude/shot-ficha-evidencia.mjs
```

## Item 18: template do email de digest

O digest era `<div>` com `<p>` e `<ul>` sem cartão, sem cabeçalho de documento e
sem tratamento de modo escuro. Agora os três emails de alertas (digest,
verificação e link de gestão) dividem uma casca só:

- documento HTML completo, com `<head>`, `color-scheme` e `supported-color-schemes`;
- marca do site: assinatura "PUXA FICHA" em caixa alta espaçada e a hachura do
  `SlashDivider` traduzida para uma régua de barras, que é o que sobrevive em
  cliente de email (gradiente CSS não sobrevive);
- um cartão por ficha, com rótulo de partido e cargo acima do nome;
- resumo do volume antes da lista ("4 atualizações em 3 fichas que você
  acompanha"), que também vira a prévia da caixa de entrada;
- layout em tabela com largura máxima de 600px e media query de 620px para
  telas estreitas.

### Estrutura semântica, restaurada depois da revisão

A primeira versão trocou `<h2>` por `<p>` e a `<ul>` por linhas de tabela. Isso
resolvia o visual e piorava o documento: o defeito do item 18 era **ausência de
hierarquia**, não a lista em si, e trocar heading por parágrafo grande tira a
estrutura de que dependem leitor de tela e modo de leitura de cliente de email.

Restaurado:

- `<h1>` para o título do email, um por documento;
- `<h2>` para o nome de cada ficha, aninhado sob o `<h1>`;
- `<ul>` com um `<li>` por mudança, que é o que elas são: itens irmãos.

A tabela continua existindo, mas só como container de layout, que é o que o
Outlook entende. O conteúdo dentro dela é semântico. O estilo inline nos
headings existe porque a margem padrão de heading varia entre clientes, não para
substituir a semântica.

### CTA com o padding no `<td>`

O botão é uma tabela de uma célula, e o `padding:14px 26px` está **na célula**,
não no `<a>`. O Outlook do Windows renderiza via Word: padding em elemento
inline é ignorado, e mesmo com `display:block` no anchor não é o anchor que
forma a caixa clicável. Quem abre a área é o `<td>`; o anchor só preenche.

O contrato está preso em teste, que casa a célula e o anchor no HTML gerado e
verifica três coisas: o `padding` está no estilo do `<td>`, **não** está no
estilo do `<a>`, e o `<a>` não carrega `display:block` fingindo de caixa.

### Modo escuro, e o limite desta verificação

A referência da nota é o Gmail escuro, que **ignora** `prefers-color-scheme` e
inverte a mensagem por conta própria. Então o desenho é claro por padrão, com
cor de fundo **e** cor de texto declaradas em todo bloco (superfície sem cor
declarada é exatamente o que a inversão automática costuma quebrar), mais um
bloco `prefers-color-scheme: dark` para os clientes que respeitam o esquema.

**O que foi verificado é simulação local em Chromium, não cliente de email
real.** Nenhuma mensagem foi aberta em Gmail, Outlook, Apple Mail ou qualquer
outro cliente, porque isso exigiria envio, que o escopo proíbe. Os três cenários
abaixo são aproximações do comportamento documentado desses clientes, e a
inversão forçada em particular é um filtro CSS aplicado por mim, não o algoritmo
do Gmail:

| Cenário | Como foi simulado | Arquivos |
|---|---|---|
| Claro | Playwright `colorScheme: "light"` | `email-*--light-{desktop,mobile}.png` |
| Escuro | Playwright `colorScheme: "dark"` | `email-*--dark-{desktop,mobile}.png` |
| Inversão forçada | `filter: invert(1) hue-rotate(180deg)` injetado na página | `email-*--inversao-forcada.png` |

Fica em aberto, para quem tiver autorização de envio: um disparo de teste para
uma caixa própria em Gmail escuro e em Outlook do Windows. Até lá, o
comportamento nesses dois clientes é inferência bem fundamentada, não medição.

O HTML renderizado está no mesmo diretório e é inspecionável:
`email-digest-multiplas-fichas.html`, `email-digest-ficha-unica.html`,
`email-verificacao.html`, `email-gestao-de-alertas.html`.

A amostra usa nomes, partidos, cargos e manchetes reais lidos de
`candidate_changes` em 09/08/2026, porque a forma real do payload importa para o
layout: `titulo` é manchete longa e `descricao` é o nome do veículo.

### Limite de reprodução

Estas imagens são evidência arquivada da sessão original. Os scripts locais
usados para renderizá-las ficavam em `.claude/`, diretório ignorado pelo git, e
não foram versionados. Portanto, a reprodução não funciona em um checkout novo.
O item 18 foi adiado e não integra o RC dos 17 itens; quando for retomado, deve
ganhar scripts seguros e versionados antes de a evidência ser considerada
reproduzível.

## Provas rodadas, e o ambiente em que rodaram

### Ambiente

Tudo local, no Mac do dono, sem CI:

| Item | Valor |
|---|---|
| Sistema | macOS 27.0, arm64 |
| Node | v24.15.0 |
| Playwright | 1.62.1, Chromium headless |
| Servidor | `next dev --turbopack` na porta 3040, do próprio worktree |
| Dados | Supabase de produção, em leitura, via `.env.local` |
| Carga da máquina | load average entre 60 e 540 durante as execuções |

Essa última linha não é decoração. A máquina está com a contenção descrita no
log do dia (containers Postgres órfãos de outra sessão, `docker ps` sem
responder dentro de 5 minutos), e isso contamina a suíte.

### Suíte

Rodei `npm test` duas vezes, e as duas tiveram falha:

| Rodada | Total | Pass | Fail | Load |
|---|---|---|---|---|
| 1 | 2546 | 2545 | 1 | 78 a 161 |
| 2 | 2546 | 2543 | 3 | 540 |

As falhas foram, nas duas rodadas, em três arquivos que **este branch não
toca** (conferido com `git diff base-lancamento` vazio para os três), e todas
são asserção de relógio de parede ou timeout de subprocesso:

- `tests/backfill-historico-integration.test.ts` (timeout de 20s matando o
  subprocesso; caiu o caso `dry-run` na rodada 1 e o caso `apply` na rodada 2,
  que é a assinatura de contenção, não de defeito)
- `tests/legislacao-paginacao-paralela.test.ts`
- `tests/supabase-fetch-signal.test.ts`

Reexecutados isoladamente: `backfill-historico-integration` passou 3 de 3; o par
`legislacao-paginacao-paralela` mais `supabase-fetch-signal` falhou 1 vez e
passou na seguinte, ainda sob load 188.

**Conclusão que interessa: a suíte local nesta máquina, neste estado, não vale
como gate.** A CI do PR é que vale. O que dá para afirmar do lado desta trilha é
que os 20 testes novos e os 13 testes existentes das superfícies tocadas
passaram em todas as execuções, isoladas e dentro da suíte completa.

### Demais gates

| Prova | Resultado |
|---|---|
| `tests/cards-dinheiro-layout.test.tsx` (novo) | 8 pass |
| `tests/alerts-email-template.test.ts` (novo) | 12 pass |
| `tests/patrimonio-eleicoes-ui.test.tsx` (existente, arquivo intocado) | 13 pass |
| `tests/alerts.test.ts` e `tests/alerts-contract.test.ts` | 32 pass |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run lint:spell` | exit 0 |
| `npm run check:dead-code` | exit 0, `--max-issues 0` |
| `npm run settings:check` | 0 fail |
| `npm run audit:cobertura:allowlist` | exit 0 |
| `npm run build` | exit 0 |
| Verificação visual (gate duro) | capturas acima, desktop e mobile, antes e depois |

Nenhuma migration, nenhuma escrita em banco, nenhuma allowlist tocada: a trilha
é frontend puro e não gera dívida para o gate.

## Achado fora do escopo, para a Raiz decidir

**Duas superfícies da mesma página discordam sobre o mesmo ano de patrimônio.**

A causa não é ficha "sem o campo bruto" de forma genérica. É um mismatch de
contrato entre o DTO e a recomposição no cliente:

- `src/lib/public-profile-dto.ts` **calcula** `patrimonio_eleicoes` no servidor,
  usando `patrimonio_ausencias_oficiais` como insumo, e devolve o resultado
  pronto. O campo bruto **não** vai junto no payload.
- `src/components/ProfileOverview.tsx` lê o campo do DTO, `patrimonio_eleicoes`,
  que é o contrato certo.
- `src/components/CandidatoProfile.tsx:265` ignora esse campo pronto e **recompõe**
  a mesma série chamando `buildPatrimonioEleicoes` de novo, a partir de
  `ficha.patrimonio_ausencias_oficiais ?? []`. No cliente esse insumo não existe,
  o `?? []` engole a ausência em silêncio, e toda eleição sem publicação cai no
  ramo `nao_coletado`. É essa série recomposta que a aba Dinheiro recebe.

Resultado medido na mesma página, com o DTO ao lado:

| Ficha | DTO (`patrimonio_eleicoes`) | Visão Geral | Aba Dinheiro |
|---|---|---|---|
| `henrique-areas` | 2020, 2018, 2016 = `vazio_confirmado` | igual ao DTO | os três = `nao_coletado` |
| `luan-monteiro` | 2024, 2022, 2020 = `vazio_confirmado` | igual ao DTO | os três = `nao_coletado` |
| `hertz-dias` | 2022 e 2020 = `vazio_confirmado`, com fonte oficial e `verificado_em` de 07/08/2026 | (não renderiza a lista neste ramo) | 2022 e 2020 = `nao_coletado` |

Ou seja, o leitor que abre a Visão Geral lê "sem bens declarados ao TSE, pacote
oficial conferido"; o mesmo leitor, um clique adiante, lê "a coleta ainda não foi
realizada". A aba Dinheiro publica a versão mais fraca de um estado que o projeto
já verificou.

Não é layout, é contrato de dados entre o DTO e o componente, então ficou fora
desta trilha por propriedade de arquivo. A correção provável é uma linha: fazer
`CandidatoProfile` consumir `ficha.patrimonio_eleicoes` quando ele existe, em vez
de recompor, exatamente como o `ProfileOverview` já faz.

Como conferir:

```bash
node .claude/probe-estados.mjs   # imprime DTO, Visão Geral e aba Dinheiro lado a lado
```

## O que NÃO foi feito

Sem push, sem merge, sem deploy. Nenhum email enviado, nenhum destinatário
configurado, nenhuma chamada ao Resend, nenhuma verificação em cliente de email
real. `src/app/api/alerts/send-digest/route.ts` não foi tocado: a trilha mexeu só
no template, em `src/lib/alerts-shared.ts`.
