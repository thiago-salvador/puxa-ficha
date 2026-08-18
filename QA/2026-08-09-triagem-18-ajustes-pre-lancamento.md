# Triagem dos 18 ajustes da nota "PF Ajustes" (pré-lançamento)

Fonte: nota Apple Notes "PF Ajustes" (09/08/2026, 20:25), 18 itens com print.
Numeração segue a ordem da nota. Objetivo: lançar amanhã (10/08).

## Leitura transversal: os 18 itens são 7 problemas

| Grupo | Itens da nota | Raiz |
|---|---|---|
| A. Classificação de status eleitoral errada | 5, 10, 12, 13, 15 | Pipeline da timeline traduz mal o raw do TSE (eleito por QP vira "Não Eleito", ELEITO vira "Não Eleito", candidatura indeferida vira candidatura real, presidência de partido entra como cargo eleitoral, ano ímpar vira eleição) |
| B. Coleta de bens/dinheiro incompleta | 1, 6, 9, 16, 17 (dados) | Backfill de patrimônio/receita não cobre todas as eleições disputadas |
| C. Buscas judiciais e sanções sem resultado | 2, 3 | Coletas que terminaram "inconclusivo"/"não verificado" foram aceitas como estado final |
| D. Destaques e votações rasos | 4, 7, 14 | Busca de destaques e votações-chave para pouco cedo demais |
| E. Curadoria de autoria legislativa | 8 | REQs idênticos repetidos, nada promovido ao box destacado |
| F. Layout de cards de dinheiro/patrimônio | 11, 17 (layout) | Card "Patrimônio declarado" fora do padrão, com área vazia |
| G. Layout do email de alertas | 18 | Digest funcional mas cru |

## Ordenação por gravidade

### Nível 1 — Dado falso publicado. Bloqueia o lançamento.

| # | Item | O que o print mostra | Esforço |
|---|---|---|---|
| 12 | **Lula: candidatura 2018 que não existiu.** "ERRO GRAVE" na nota. | Timeline exibe "2018 - Não Eleito, Candidatura: Presidente, PT". O registro de 2018 foi **indeferido** (Ficha Limpa); indeferido não é "concorreu e perdeu". O print do Rui (item 16) mostra o mesmo padrão: PCO 2006 com registro "Indeferido" exibido como "Não Eleito". Precisa de um terceiro estado (indeferida/cancelada) ou exclusão, mais auditoria em toda a base, como a nota pede. | M |
| 5 | **Daciolo: eleito por QP exibido como "Não Eleito".** | O próprio raw diz "ELEITO POR QP (TSE 2014)" e o mandato 2015-2019 está logo acima. Bug de mapeamento do campo de totalização. | P/M |
| 10 | **Flávio: "2018 - Não Eleito" com raw "ELEITO (TSE 2018)"** + mandatos sobrepostos (Dep. Estadual 2016-2019 vs Senador 2019). | Mesma família do item 5, mais regra de precedência entre fontes para datas. A nota aponta mistura de fontes na lista. | M |
| 15 | **Zema: "eleição de 2023" em Eleições sem dado publicado.** | Não existe eleição em ano ímpar. O gerador de "eleições sem dado" está inventando ano. Validar calendário eleitoral (anos pares, e o tipo certo por ano) e limpar os registros gerados. | P |
| 13 | **Renan: "Presidente Nacional do Partido Missão" na timeline eleitoral.** | Cargo interno de partido não é eleição. Filtro de exclusão + limpeza dos existentes. | P/M |

Por que nível 1: são afirmações factuais erradas sobre figuras públicas, no produto cujo argumento de venda é exatidão. O item 12 sozinho justificaria segurar o lançamento.

### Nível 2 — Dado ausente em massa. Core do produto capenga.

| # | Item | O que fazer | Esforço |
|---|---|---|---|
| 3 | **Sanções (CEIS, CNEP, CEAF) nunca verificadas** em fichas publicadas. | Rodar a coleta que falhou/não rodou. É a mais barata das re-coletas e a ausência aparece com aviso constrangedor na ficha. | P/M |
| 2 | **Busca judicial "inconclusiva" aceita como final.** | Re-executar com retry/fontes adicionais até resultado conclusivo (presença ou ausência com confiança). Se a fonte não permitir conclusão, o estado precisa de curadoria manual, não de um card genérico. | M/G |
| 6+9+16 | **Bens e dinheiro não coletados** (Daciolo 2018/2008/2006; Flávio eleições disputadas; Rui candidaturas sem aba de dinheiro). | Um único backfill varrendo todas as candidaturas de todas as fichas, não caso a caso. Já existem `gerar-backfill-patrimonio-tse*.ts` como base. | M (wall-clock G) |
| 1 | **Refazer busca de patrimônio agora + agendar re-run dia 16/08.** | O re-run de agora entra no backfill acima; o agendamento é um scheduled job/cron novo. | P (agendamento) |
| 17d | **Samara: dados de patrimônio faltando.** | Caso de teste do backfill acima. | — |

### Nível 3 — Conteúdo raso. Não bloqueia, mas empobrece.

| # | Item | O que fazer | Esforço |
|---|---|---|---|
| 4+14 | **Destaques vazios (0) ou únicos (1).** "Apresentar alguma coisa pelo menos." | Expandir a busca nas fontes. Conteúdo só entra com evidência; quando as fontes verificadas não trouxerem fato publicável, exibir vazio honesto com proveniência, nunca inventar ou reclassificar um destaque para preencher espaço. Depende das coletas do nível 2 terem rodado. | M |
| 7 | **Votações-chave: só 2 para um mandato de 4 anos.** | Ampliar o conjunto de votações importantes cobertas (dataset editorial + matching). É o item de conteúdo mais caro. | M/G |
| 8 | **Autoria legislativa: 4 REQs idênticos listados, nada no box destacado.** | Dedupe de proposições de mesma ementa + promover o PL ao layout destacado. | P/M |

### Nível 4 — Layout. Paralelizável, zero dependência.

| # | Item | O que fazer | Esforço |
|---|---|---|---|
| 11+17L | **Card "Patrimônio declarado" fora do padrão** (Hertz, Samara): tipografia própria, área vazia enorme. | Alinhar ao padrão dos demais cards de dinheiro. | P |
| 18 | **Layout do email de digest.** | Template HTML de email decente (o atual é texto empilhado). Não bloqueia lançamento: o digest já entrega o conteúdo. | P/M |

## Plano de execução: 4 trilhas paralelas

```
Trilha A (crítica, sequencial): 12 → 5 → 10 → 13 → 15
  Código de classificação + migration de correção de dados (gate @write/allowlist/recortes)
  Mesmo módulo da timeline: não paralelizar entre si.

Trilha B (background, disparar JÁ): 3 → 2 → backfill 6/9/16/17 → agendar dia 16 (item 1)
  Re-coletas são wall-clock longas: começam agora e rodam enquanto a Trilha A avança.
  Independentes da Trilha A (tocam outras abas).

Trilha C (após B entregar dados): 4+14 → 7 → 8
  Destaques dependem de judicial/sanções/notícias coletados.
  O item 8 (dedupe autoria) não depende de nada: pode entrar em qualquer folga.

Trilha D (paralela a tudo): 11+17L → 18
  Frontend puro.
```

Fechamento (sequencial, depois de A e B): re-materializar as fichas, verificar
as 8 fichas citadas na nota (Daciolo, Flávio, Hertz, Lula, Renan, Zema, Rui,
Samara) contra cada print, rodar suite + gates (`check:dead-code`,
`audit:cobertura:allowlist`).

## Dependências e avisos

- **Trilha A antes da re-materialização**: qualquer re-render de ficha feito
  antes do fix de classificação re-publica o dado errado.
- **Migrations de correção pagam o overhead do gate** (anotação `@write`,
  allowlist, entrada em `recortes.json`, rollback). Está no esforço estimado,
  mas é por isso que itens "pequenos" da Trilha A não são triviais.
- **R-59**: aplicar migrations em produção e disparar re-coletas que escrevem no
  banco de produção precisam de autorização nomeada. Este documento é o plano;
  nada foi executado.
- **Corte honesto para amanhã**: níveis 1 e 2 são o lançamento. Nível 3 dá para
  lançar com o estado mínimo do item 4 resolvido e ampliar depois. Nível 4
  (email) pode sair depois do lançamento sem custo.
