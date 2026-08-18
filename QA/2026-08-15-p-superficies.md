# P-SUPERFICIES, relatório de prova

Data: 2026-08-15
Branch: `fix/superficies-abas`
Base: `origin/main` em `d0456fb24429e94cec6d9ab0dcacac17c7a0b8b7`

## Resultado

- Votos lê `verificacao_campos.votacoes_chave` e diferencia `nao_aplicavel` de pendência.
- Trajetória lê `verificacao_campos.historico_politico` e diferencia `vazio_confirmado` de pendência.
- Dinheiro não publica `R$ 0` com doadores vazios quando a prestação declara zero receita.
- Doadores com marcador técnico do TSE são removidos na borda pública.
- Sobreposições continuam visíveis como trechos normais, sem selo de curadoria.
- `audit:superficie` cobre R5 na coorte e R6 a R7 no universo público.
- Writers que acrescentam ou copiam `pontos_atencao.fontes` tentam snapshot no Wayback e preservam o fluxo em falha ou timeout.

## Gates

| Gate | Resultado |
|---|---|
| `npm run lint` | PASS, exit 0 |
| `npx tsc --noEmit` | PASS, exit 0 |
| `npx tsc --project tsconfig.scripts.json` | PASS, exit 0 |
| `npm run check:dead-code` | PASS, exit 0 |
| `npm run settings:check` | PASS, 7/7 |
| `npm test` | PASS, 3172/3172, 0 fail |
| `npm run build` | PASS, compilação e 60 páginas geradas |

O build manteve o aviso já existente do Sentry sobre `onRouterTransitionStart`. Ele não interrompeu compilação, TypeScript ou geração de páginas.

## Preview local sem banco

O preview usou uma rota temporária com fixtures, aberta em navegador real e removida antes do commit. Screenshot local:

`/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha-wt-superficies-abas/output/playwright/p-superficies.png`

Descrição do DOM observado:

- Lula, Votos: `Não se aplica: mandato legislativo anterior ao catálogo de votações-chave`; `Regra verificada em 2026-08-15.`
- Clariana, Trajetória: `Sem candidatura anterior localizada na varredura TSE (2026-08-15); candidatura 2026 em confirmação de registro`.
- Leonardo, Dinheiro 2018: `Sem receitas declaradas na prestação de contas (TSE 2018)`; sem `R$ 0` e sem lista `Maiores doadores`.

O único erro de console foi a conexão opcional do React DevTools com `ws://localhost:8097`, recusada no ambiente local. Não houve erro de renderização da aplicação.

## Limites respeitados

- Nenhuma consulta ou escrita de banco.
- Nenhum push, PR, merge ou deploy.
- A rota de preview foi removida depois da captura.
