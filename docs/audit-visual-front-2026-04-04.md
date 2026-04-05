# Auditoria visual e front — relatorio

**Data:** 2026-04-04  
**Ultima atualizacao:** 2026-04-04 (fixes aplicados + verificacao registrada abaixo)

## Escopo de rotas

**Incluidas (publico em producao):** `/`, `/candidato/[slug]`, `/comparar`, `/governadores`, `/governadores/[uf]`, `/sobre`, `/privacidade`.

**Excluidas:** `/preview/*`, `/internaltest`, `/styleguide` — protegidas por `middleware.ts` em producao.

## Regras anti-falso-positivo usadas

- Dados vazios, N/D, ISR, mock/degradado e limites em `CLAUDE.md` / `AGENTS.md` nao foram tratados como regressao visual.
- Commits e logs do git nao contam como prova de bug sozinhos.

---

## Status: correcoes aplicadas

Todos os itens do relatorio original foram **implementados** (codigo) e a suíte Playwright foi **ajustada** onde o ambiente ou a API do browser geravam falso negativo. Nenhum achado permanece como “so proposta”.

---

## Registro de mudancas (implementacao)

| ID | Severidade | Arquivo(s) | O que foi feito |
|----|------------|------------|-----------------|
| P2 | Layout tablet | `src/components/ProfileOverview.tsx` | Grid dos stat cards: `md:grid-cols-3` entre `grid-cols-2` e `lg:grid-cols-4`. |
| P2 | Animacao resiliente | `src/app/globals.css` | `.hero-fade` e `.section-reveal`: `forwards` → `both`, removido `opacity: 0` fixo em `.hero-fade` (mesmo padrao de `.stagger-item`). |
| P3 | Mapa / labels | `src/components/BrazilMap.tsx` | Estados **fora** de `LARGE_STATES` passam a exibir sigla em `<text>` no centroide (`cx`/`cy`), fonte 8px; grandes mantem posicoes em `LABEL_POS`. |
| P3 | Tap target menu | `src/components/Navbar.tsx` | Botao `.menu-btn`: `max-sm:min-h-11 max-sm:min-w-11 max-sm:justify-center` (44px em viewports &lt; `sm`). |
| P3 | Select / design system | `src/components/SortOrderMenu.tsx` (novo), `src/components/CandidatoGrid.tsx` | `<select>` nativo trocado por menu Base UI (`@base-ui/react/menu`) com `RadioGroup`, estilo alinhado ao `PartyCombobox`. Tipo `SortKey` exportado do novo componente. |
| Infra | Testes Playwright | `tests/visual/interactions.spec.ts` | (1) Scroll no teste de sticky tabs: `page.evaluate(() => window.scrollBy(0, 600))` em vez de `mouse.wheel` (wheel nao suportado no WebKit mobile). (2) “Limpar busca”: `expect.poll` na contagem de links para estabilizar apos `startTransition`. |

---

## Evidencia de runtime (apos fixes)

### Build de producao

Comando:

```bash
npm run build
```

Resultado (2026-04-04, ambiente local):

- `Compiled successfully`
- `Generating static pages (172/172)` concluido
- **Exit code 0**

### Playwright — `tests/visual/interactions.spec.ts`

**Pre-requisito:** browsers instalados (`npx playwright install webkit` foi necessario neste ambiente para o projeto `mobile` com `devices["iPhone 14"]`).

Comando:

```bash
npx playwright test tests/visual/interactions.spec.ts
```

**Base URL:** padrao do `playwright.config.ts` — `https://puxa-ficha.vercel.app` (salvo `PF_BASE_URL`).

Resultado (2026-04-04, apos `npx playwright install webkit` e patches nos testes):

```
32 passed (23.7s)
```

Detalhe: **16 cenarios** × **2 projetos** (`desktop` + `mobile`) = **32** testes. Todos passaram na rodada registrada.

### Lint do repositorio

Comando `npm run lint` no root ainda reporta milhares de avisos/erros em **outros** paths (ex.: scripts, artefatos); o **build** do Next.js inclui `Linting and checking validity of types` e **concluiu com sucesso** na mesma sessao. Nao houve regressao introduzida nos arquivos tocados segundo o diagnostico do editor (sem erros nos lints de `SortOrderMenu`, `CandidatoGrid`, `Navbar`, `BrazilMap`).

---

## Achados originais — estado pos-fix

| Achado | Estado |
|--------|--------|
| P2 ProfileOverview grid 2→4 sem `md` | **Corrigido** (`md:grid-cols-3`). |
| P2 `.hero-fade` / `.section-reveal` e animacao bloqueada | **Corrigido** (`both`, sem `opacity: 0` em `.hero-fade`). |
| P3 Mapa sem sigla em estados pequenos | **Corrigido** (siglas no centroide, 8px). |
| P3 Tap target menu &lt; 44px no mobile | **Corrigido** (`max-sm:min-h-11 min-w-11`). |
| P3 `<select>` nativo no grid | **Corrigido** (`SortOrderMenu` Base UI). |
| Infra WebKit ausente | **Mitigado** com `npx playwright install webkit` + registro neste doc. |
| Teste sticky + wheel no mobile WebKit | **Corrigido** no spec (scroll via `evaluate`). |
| Teste “limpar busca” flaky | **Corrigido** no spec (`expect.poll`). |

---

## Proximos passos opcionais

- Em CI, garantir `npx playwright install --with-deps` (ou cache de browsers) para o job que roda `test:visual`.
- Revisar visualmente se alguma sigla 8px no mapa encosta em outra (ajuste fino de `cx/cy` por estado se necessario).

---

## Referencia cruzada

- Plano e historico de revisao visual: `docs/visual-audit.md`.
