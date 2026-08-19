# Lista de candidatos (comparador): copy, colunas e evolução patrimonial

Data: 2026-08-19. Superfície: lista do `ComparadorPanel` (home, `/comparar`, hubs de UF). Sem commit.

## O que mudou

1. **Processos:** a lista compacta mostra `0 processos` quando não há contagem verificada, no lugar de "sem contagem de processos verificada". A ficha e a tabela de comparação (depois de selecionar 2+) continuam com `processosOverviewDisplay` ("—" + legenda).
2. **Votações e gastos:** saíram da lista (cards mobile e colunas desktop). Continuam na comparação lado a lado.
3. **Headers desktop:** `pr-4`, `whitespace-nowrap` e `scope="col"` nas colunas. Depois de tirar duas colunas, Idade e Formação deixam de colar.
4. **Evolução patrimonial:** percentual 2026 vs. último ano anterior registrado, abaixo do valor em Patrimônio (desktop) e na terceira linha do card (mobile).

## Cálculo da evolução

Campos: `patrimonio.ano_eleicao` + `patrimonio.valor_total` (linhas não despublicadas), agregados em `getCandidatosComparaveisResource`.

```
((valor_2026 - valor_ultimo_ano_anterior) / valor_ultimo_ano_anterior) * 100
```

Último ano anterior = maior `ano_eleicao` estritamente menor que 2026.

**N/A quando:**
- só existe 2026
- 2026 não existe
- o ano anterior tem valor 0 (divisão por zero; não inventamos 0%)

Declaração vazia em 2026 (`valor_total = 0`) com ano anterior > 0 é -100%, porque ausência de bens declarados ao TSE é dado completo.

Formato: `+12%` / `-8%` / `N/A`, com agrupamento pt-BR no inteiro (`+4.277%`).

## Testes

- `tests/evolucao-patrimonial.test.ts` PASS
- `tests/processos-display.test.ts` PASS
- `tests/comparador-metrics.test.ts` PASS
- `tests/honestidade-superficie.test.tsx` PASS
- `npx tsc --noEmit` PASS

## Screenshots

- `entregas/LISTA-UI-20260819/comparar-360.png`
- `entregas/LISTA-UI-20260819/comparar-1440.png`
- `entregas/LISTA-UI-20260819/comparar-1440-table.png`
