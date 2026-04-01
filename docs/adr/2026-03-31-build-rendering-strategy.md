# ADR 2026-03-31 - Mitigar timeout de build com paginas de dados

## Status

Proposto

## Contexto

O site usa `revalidate = 3600`, mas ainda prerendera rotas de dados no build:

- `src/app/page.tsx`
- `src/app/candidato/[slug]/page.tsx`
- `src/app/governadores/[uf]/page.tsx`

Hoje isso funciona com poucas paginas, mas o custo de build cresce junto com:

- total de candidatos ativos
- total de UFs com pagina publicada
- latencia das queries ao Supabase no momento do deploy

Durante este ciclo do pipeline, `npm run build` voltou a compilar, mas a etapa seguinte caiu em timeout de rede durante a geracao estatica. O risco nao e regressao do fix TSE; e divida estrutural da estrategia atual.

## Decisao necessaria

Escolher uma estrategia de renderizacao que preserve ISR sem depender de prerender de todas as paginas no build.

## Opcoes

### Opcao A - Manter modelo atual

Descricao:
- manter `generateStaticParams` em `candidato/[slug]` e `governadores/[uf]`
- continuar prerenderando tudo no deploy

Vantagens:
- zero mudanca de arquitetura
- menor esforco imediato

Desvantagens:
- timeout de build tende a piorar com o crescimento do site
- deploy continua acoplado a disponibilidade de rede e banco
- pipeline de dados exige rebuild completo para refletir melhora

Estimativa:
- 0,5 dia para pequenos hardenings

### Opcao B - ISR puro nas rotas de dados

Descricao:
- remover `generateStaticParams` de `candidato/[slug]` e `governadores/[uf]`
- manter `revalidate = 3600`
- deixar as paginas serem geradas sob demanda na primeira visita
- opcionalmente adicionar revalidation on-demand depois do pipeline

Vantagens:
- remove o gargalo principal de build
- preserva cache por pagina
- reduz custo de deploy conforme o numero de paginas cresce

Desvantagens:
- primeira visita por slug fica mais lenta
- exige revisar UX de 404 e warming de rotas criticas

Estimativa:
- 1 a 2 dias

### Opcao C - Rotas de dados dinamicas com cache explicito

Descricao:
- mover o carregamento critico para handlers/API com estrategia explicita de cache
- usar `no-store` no servidor de pagina e delegar cache a uma camada propria

Vantagens:
- maior controle sobre invalidação e observabilidade
- desacopla melhor deploy e dado

Desvantagens:
- maior complexidade
- mais superficie para regressao
- custo maior que o problema atual pede

Estimativa:
- 2 a 4 dias

## Recomendacao

Seguir com a Opcao B.

Ela resolve o timeout de build sem introduzir uma arquitetura nova inteira e combina melhor com o fluxo real do produto:

- dados mudam no pipeline, nao a cada request
- o numero de paginas tende a crescer
- o deploy nao deve depender de prerender completo para refletir dados novos

## Criterio de encerramento

Este ADR fecha quando houver um PR que:

1. remove `generateStaticParams` das rotas de dados afetadas ou justifica tecnicamente sua permanencia
2. preserva `revalidate = 3600` ou substitui por politica equivalente
3. documenta como o pipeline dispara revalidation ou como o warming sera feito
4. demonstra build sem timeout de rede no fluxo de deploy

## Dono

Thiago Salvador
