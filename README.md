# Puxa Ficha

[![CI](https://github.com/thiago-salvador/puxa-ficha/actions/workflows/ci.yml/badge.svg)](https://github.com/thiago-salvador/puxa-ficha/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-24.x-339933.svg)](.nvmrc)

Plataforma cívica de consulta pública sobre candidatos das eleições brasileiras
de 2026. Ficha pública, comparador lado a lado e pontos de atenção com fontes
visíveis. Os dados vêm de bases oficiais (TSE, Câmara dos Deputados, Senado
Federal, Portal da Transparência) sob a Lei de Acesso à Informação.

A cobertura atual é dos cargos majoritários do Executivo: Presidência da
República e governos estaduais, incluindo os vices das chapas.

**Site:** https://puxaficha.com.br

## Como conferir um número do site

Este repositório é público por um motivo específico: qualquer pessoa deve poder
pegar uma afirmação do site e rastrear até a fonte oficial, sem precisar
acreditar em nós. Esta seção mostra como, com casos reais.

O caminho é o script que coletou (quando está neste repositório) e a URL oficial
que ele leu.

### Patrimônio declarado

O valor vem do DivulgaCand, o sistema de divulgação de candidaturas do TSE.

- Coleta: [`scripts/gerar-backfill-patrimonio-tse-2026.ts`](scripts/gerar-backfill-patrimonio-tse-2026.ts),
  que lê o pacote oficial **`bem_candidato_2026`** do portal de dados abertos do
  TSE. Nenhum valor é digitado à mão.
- Conferência por candidato, sem depender de nós: a API pública do DivulgaCand em
  `divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/{UF}/20322002026/candidato/{SQ}`
  devolve os bens e o `totalDeBens` daquela pessoa. O `SQ` está na ficha.
- A soma dos bens tem que fechar com o total que o TSE devolve. Se não fecha, o
  dado não sobe.

Em 18/08/2026 essa conferência encontrou 46 fichas publicando o **dobro** do
patrimônio declarado, por erro de leitura nosso, e as corrigiu. O histórico do
conserto está no log de commits, de propósito: um projeto de transparência que
apaga o rastro dos próprios consertos pede uma confiança que não oferece.

> **Lacuna conhecida, 18/08/2026.** Nem todo script de coleta e auditoria que
> gerou o dado publicado está neste repositório; parte vive no repositório de
> trabalho. Enquanto isso não fecha, a API oficial acima é o caminho de
> conferência que não depende de nós.

### Espectro do partido no quiz

Cada eixo em [`src/data/quiz/espectro-partidario.ts`](src/data/quiz/espectro-partidario.ts)
declara sua própria procedência. Quando o `tipo` é `programa`,
`carta_de_principios` ou `manifesto`, o registro traz **trecho literal, URL e
data**: abra a URL e procure o trecho.

Quando o `tipo` é `curadoria`, não existe documento ainda. É julgamento editorial
e está rotulado como tal, para que ninguém o confunda com fonte.

Duas coisas que este arquivo deliberadamente **não** faz: usar o estatuto
registrado no TSE, que é carta de organização interna e não diz o que o partido
defende; e citar a home do site do partido, que muda sem aviso.

Posição de partido nunca é escrita como declaração do candidato. Ela não entra em
`posicoes_declaradas`.

### Votações nominais

Vêm das APIs abertas da Câmara e do Senado, com o identificador da proposição
preservado, para que o link leve à votação nominal original.

### Doadores

O CPF do doador **nunca** é gravado em texto claro, nem neste repositório nem no
banco. Vira `SHA-256(sal + ":" + cpf)`. O que fica visível é o padrão agregado
por setor, não a pessoa física.

### Achou um erro?

Abre uma issue com o link da ficha e a fonte que contradiz. Erro de dado é o tipo
de contribuição mais útil que este projeto pode receber. Para falha de segurança,
use o canal privado em [SECURITY.md](SECURITY.md), não uma issue pública.

## Stack

- **Next.js 16** (App Router, renderização sob demanda)
- **TypeScript**
- **Tailwind CSS 4** + shadcn/ui

## Pré-requisitos

- Node.js **24.x** (ver `.nvmrc`)

## Setup

```bash
npm ci
```

Os gates de um PR não pedem banco, conta de nuvem nem arquivo `.env`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Scripts

```bash
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # testes unitários (node --test)
npm run build          # build
npm run test:visual    # testes visuais (Playwright: rode `npx playwright install` antes)
npm run validate:seed  # valida a integridade do seed de candidatos
```

> Os gates obrigatórios de um PR (`lint`, `typecheck`, `test`, `build`) não
> dependem do Playwright. Os testes visuais são opcionais e exigem
> `npx playwright install` para baixar os browsers.

## Estrutura

```
src/            aplicação Next.js (rotas, componentes, libs)
scripts/        pipeline de ingestão e utilitários de dados
  lib/          biblioteca compartilhada do pipeline
supabase/
  migrations/   schema + seeds (SQL sequencial)
data/           seeds de produto (candidatos.json e afins)
tests/          testes unitários, de contrato e visuais
public/         estáticos (fotos de candidatos, ícones)
```

## Privacidade

O CPF nunca é exposto no cliente; é usado apenas como chave de cruzamento no
servidor, durante a ingestão. Veja [SECURITY.md](SECURITY.md). Se identificar
qualquer dado pessoal chegando ao browser, reporte pelo canal privado.

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md) e o
[Código de Conduta](CODE_OF_CONDUCT.md). Toda contribuição roda pelo CI
(lint, typecheck, testes e build), que funciona em PRs de fork sem segredos.

## Licença

Código sob [Apache License 2.0](LICENSE): você pode usar, modificar, redistribuir
e hospedar livremente, inclusive comercialmente, preservando o aviso de copyright
e o [NOTICE](NOTICE). A licença inclui concessão explícita de patente.

Os dados são públicos (Lei de Acesso à Informação) e não estão cobertos pela
licença do código. O [NOTICE](NOTICE) detalha isso e traz as ressalvas de
dependências de terceiros, em especial o GSAP, que tem licença própria e não
acompanha a permissão comercial da Apache 2.0.
