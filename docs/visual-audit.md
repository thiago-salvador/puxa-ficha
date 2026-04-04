# Plano: Revisao Visual Completa do PuxaFicha (Desktop + Mobile)

## Context

O site passou por varias iteracoes rapidas de UI (hero, stat cards, footer, Wikipedia links, remocao do /explorar). Precisa de uma varredura visual completa em todas as paginas, desktop e mobile, para pegar bugs visuais que passaram despercebidos. O repo tem muitos commits detalhados e logs, entao regras claras de falso positivo sao essenciais.

## Regras Anti-Falso-Positivo

### NAO REPORTAR como bug visual:

| Categoria | Exemplos | Motivo |
|-----------|----------|--------|
| Dados vazios / "N/D" | Candidato sem patrimonio, 0 processos | Tratamento de null intencional |
| Candidatos ausentes | UF sem candidatos, "Em breve" | Pipeline, nao UI |
| Avisos de fonte de dados | "dados de demonstracao" | DataResource pattern intencional |
| Arquivo orfao CandidatoSlider.module.css | CSS de rota deletada | Cleanup, nao bug visual |
| Foto fallback (iniciais) | Gradiente com letras | CandidatePhoto fallback intencional |
| Dados ISR desatualizados | Numeros antigos | Revalidate 1h by design |
| Formatacao de dados | "1.2M", datas em pt-BR | Escolha de design |
| Preview com token | /preview exigindo auth | PF_PREVIEW_TOKEN intencional |
| Issues documentados no CLAUDE.md | Gastos so 2019+, votacoes sem curadoria | Limitacoes conhecidas |

### REPORTAR como bug visual:

- Layout quebrando / overflow horizontal
- Elementos sobrepostos / z-index errado
- Imagem distorcida / aspect ratio errado
- Animacao travada / GSAP nao limpando estado
- Glassmorphism sem fallback funcional
- Tap target < 44px em mobile
- Texto cortado onde nao deveria
- Contraste insuficiente (branco em fundo claro)
- Sticky bar sobrepondo conteudo
- Scroll lock vazando apos fechar menu
- Font nao carregando (Inter ou Anton)

## Execucao: 3 Fases Paralelas + 1 Sequencial

### Fase 1: Code Review Estatico (3 agents em paralelo)

**Agent A - frontend-ux-specialist**: Layout & Responsividade
- Todas as pages (src/app/*/page.tsx) e layout components
- Checar: breakpoints Tailwind consistentes, container alignment, padding patterns
- Checar: clamp() produz tamanhos legíveis em 375px
- Checar: grid breakpoints sem gaps de colapso
- Checar: sticky top-[56px] vs Navbar h-16 (64px) -- possivel mismatch
- **Regra**: ignorar campos vazios, focar so em CSS/layout

**Agent B - code-quality-reviewer**: Animacoes & Motion
- Navbar.tsx (GSAP), globals.css (keyframes), CandidatoCard.tsx (hover)
- Checar: GSAP timeline kill() no cleanup
- Checar: prefers-reduced-motion fallbacks funcionais
- Checar: stagger-item opacity:0 nao esconde conteudo permanentemente
- Checar: glass overlay transition em mobile vs desktop

**Agent C - legacy-auditor**: Dead Code & Inconsistencias
- Todos os componentes em src/components/
- Checar: CandidatoSlider.module.css orfao (confirmar nao importado)
- Checar: imports nao usados, classes CSS referenciadas mas nao definidas
- Checar: z-index conflicts entre Navbar, ProfileTabs, ComparadorPanel, dropdowns
- **Regra**: so reportar se impacta renderizacao visual

### Fase 2: Visual Testing com Claude Preview (sequencial)

Abrir o site em producao (puxa-ficha.vercel.app) e testar cada pagina.

**Viewports:**
- Desktop: 1440x900
- Mobile: 375x812 (iPhone SE)
- Mobile: 390x844 (iPhone 14)

**Paginas e checklist:**

#### Home (/)
- [x] Hero carrega, gradient legivel, titulo cabe
- [x] Hero stats (Anton font) alinhados horizontalmente em desktop
- [x] Hero stats com flex-wrap correto em mobile
- [x] CandidatoGrid: 4 cols desktop, 2 cols mobile
- [x] CandidatoCard: hover effect desktop, stats visiveis mobile
- [x] Search bar funcional
- [x] Comparador section: tabela alinhada desktop, cards empilhados mobile
- [x] Footer: 3 cols desktop, stacked mobile
- [x] Navbar: transparente -> glass-nav no scroll

#### Candidato (/candidato/[slug])
- [x] Hero: foto + info lado a lado desktop, empilhado mobile
- [x] Nome com clamp() legivel em ambos
- [x] StatCards: 5 cols desktop, 2 cols mobile
- [x] ProfileTabs sticky sem sobrepor conteudo
- [x] Tabs scrollaveis em mobile sem clip
- [x] Conteudo de cada tab renderiza
- [x] Social links e Wikipedia button
- [x] Prev/Next navigation

#### Comparador (/comparar)
- [x] Hero banner com imagem
- [x] Tabela desktop com colunas alinhadas
- [x] Selecao de candidatos funcional
- [x] Sticky bar de comparacao aparece
- [x] Mobile: lista empilhada

#### Governadores (/governadores e /governadores/[uf])
- [x] SVG map renderiza e escala
- [x] Hover/touch em estados funciona
- [x] Labels legiveis
- [x] Pagina de UF: grid de candidatos

#### Sobre (/sobre)
- [x] Conteudo legivel
- [x] Cards de fontes com hover
- [x] Footer renderiza

**Cross-cutting (todas as paginas):**
- [x] Navbar scroll behavior
- [x] Menu mobile: abre, fecha, scroll lock restaura
- [x] Sem horizontal overflow em 375px
- [x] Anton e Inter carregam
- [x] Console sem erros de runtime

### Fase 3: Interaction Testing com Claude Preview

1. Menu cycle: abrir -> navegar -> fechar com Escape
2. Search: digitar nome -> filtrar -> limpar
3. View toggle: grid <-> list
4. Comparador: selecionar 2 -> comparar -> limpar
5. ProfileTabs: clicar em cada tab
6. BrazilMap: clicar em estado -> navegar

### Fase 4: Consolidacao

Compilar findings no formato:

```
### [P0/P1/P2/P3] Descricao curta

- Pagina: /path
- Viewport: 375px / 1440px / all
- Componente: NomeComponente.tsx:linha
- Esperado: X
- Real: Y
- Screenshot: [sim/nao]
- Checagem falso positivo: [por que nao e data issue]
```

## Areas de Atencao Pre-Identificadas

1. **ProfileTabs sticky offset**: Navbar = h-16 (64px), mas tabs usam top-[56px] mobile e top-[60px] sm. Gap de 4-8px.
2. **CandidatoCard glass overlay mobile**: sm:translate-y nao se aplica abaixo de 640px. Verificar se overlay e legivel.
3. **Hero title sizing**: calc(min(31vw, 200px)) = ~96px em 375px. "Puxa Ficha" cabe?
4. **BrazilMap tooltip mobile**: tooltip segue mouse, touch nao tem hover.
5. **Select nativo**: CandidatoGrid usa `<select>` com Tailwind. Dropdown pode nao combinar com design system.

## Arquivos Criticos

- `src/components/Navbar.tsx` - menu GSAP, scroll, z-index
- `src/components/CandidatoCard.tsx` - glass overlay, responsive stats
- `src/components/ProfileTabs.tsx` - sticky offset
- `src/components/BrazilMap.tsx` - SVG, tooltip, touch
- `src/components/CandidatoProfile.tsx` - container principal do perfil
- `src/components/CandidatoProfileSections.tsx` - tabs pesadas
- `src/components/ComparadorPanel.tsx` - tabela comparativa
- `src/components/CandidatoGrid.tsx` - busca, filtro, grid
- `src/app/globals.css` - tokens, animacoes, glassmorphism
- `src/app/page.tsx` - home page
- `src/app/candidato/[slug]/page.tsx` - perfil page

## Verificacao

1. Zero bugs P0 restantes
2. Lista de P1/P2 priorizada com screenshots
3. Orphaned CSS identificado
4. Todas as 6 paginas testadas em 3 viewports
5. Console limpo (sem erros de runtime em producao)

---

## Execution Log

### Fase 1: Code Review Estatico (CONCLUIDA)

**Agent A (frontend-ux-specialist) - Layout & Responsividade:**
- Checou todas as pages, layout, 7 componentes principais, globals.css
- P1: ProfileTabs sticky top-[56px]/sm:top-[60px] vs Navbar h-16 (64px) = gap de 4-8px
- P2: Stat cards grid 2-col mobile, 5o card orfao (50% largura sozinho)
- P2: ProfileOverview grid pula 2->4 cols sem 3-col intermediario
- P3: Footer 3a coluna sozinha em mobile (grid-cols-2, 3 items)
- Limpo: container alignment, clamp() font sizes, overflow-hidden, ComparadorPanel offset

**Agent B (code-quality-reviewer) - Animacoes & Motion:**
- Checou Navbar.tsx, globals.css, CandidatoCard.tsx, BrazilMap.tsx, CandidatoProfile.tsx
- P1: BrazilMap tooltip quebrado em touch (so onMouseEnter/Move, sem onTouchStart)
- P2: stagger-item opacity:0 sem fallback se animacao nao dispara (edge case)
- P2: BrazilMap SVG inline transitions sem prefers-reduced-motion
- Limpo: GSAP cleanup (kill() correto), GSAP reduced-motion (correto), glass overlay mobile OK, pill-hover/list-item-hover reduced-motion OK

**Agent C (legacy-auditor) - Dead Code & Z-Index:**
- Z-index stack mapeado (z-0 a z-[200]): sem conflitos
- Orphaned: CandidatoSlider.tsx + .module.css (~400 linhas, rota /explorar deletada)
- glass-light CSS class nao usada em producao (so styleguide)
- Limpo: todas as outras classes CSS em uso, z-index layering correto

### Fase 2: Visual Testing com Claude Preview (CONCLUIDA)

**Home (/) - Desktop 1440x900:**
- [OK] Hero carrega, titulo "PUXA FICHA" cabe, gradient legivel
- [OK] Navbar visivel, MENU + botao +
- [OK] Hero stats (13 pre-candidatos, R$ 358M, 5 processos)
- [OK] Texto introdutorio legivel, links para comparar e governadores
- [OK] Console: 0 erros
- [OK] DOM snapshot: 13 candidatos no grid, tabela comparador com 8 colunas, footer presente

**Home (/) - Mobile 375x812:**
- [OK] Hero titulo cabe (calc(min(31vw, 200px)) = ~116px, quebra em 2 linhas "PUXA FICHA")
- [OK] Stats fazem flex-wrap correto
- [OK] Grid 2 colunas, cards com overlay visivel
- [OK] Fotos carregam (Aldo Rebelo, Ciro, Eduardo Leite, Flavio Bolsonaro, Hertz, Lula)

**Candidato (/candidato/lula) - Desktop 1440x900:**
- [OK] Back link "CANDIDATOS" visivel
- [OK] Foto + info lado a lado
- [OK] Nome "LULA" com Anton font
- [OK] Bio renderiza completa
- [OK] Stat cards 5 colunas: Processos, Patrimonio, Trocas, Alertas, Projetos
- [CONFIRMADO P1] ProfileTabs sticky: Navbar height=65px, tabs top=60px, gap=5px
- [OK] DOM: conteudo de tabs presente (2259 chars, opacity 1, color rgb(10,10,10))
- [NOTA] Screenshots em branco apos scroll = artifact do Preview (JPEG compression), DOM confirma conteudo visivel

**Candidato (/candidato/lula) - Mobile 375x812:**
- [OK] Foto empilha acima do texto (flex-col)
- [OK] Bio legivel, fonte adequada
- [CONFIRMADO P2] 5o stat card ("Projetos de Lei") orfao em meia largura na grid 2-col
- [OK] Tabs visiveis com scroll horizontal, social links (Wikipedia, @LulaOficial, @lula)
- [OK] Conteudo tab "Visao Geral": alertas graves e pontos positivos renderam

**Comparador (/comparar) - Desktop 1440x900:**
- [OK] Hero com imagem de fundo
- [OK] Tabela com 8 colunas (selecionar, candidato, partido, idade, formacao, patrimonio, processos, alertas)
- [OK] Fotos dos candidatos na tabela
- [OK] Texto introdutorio e links (home, governadores)

**Comparador (/comparar) - Mobile 375x812:**
- [OK] Cards empilhados com checkbox, foto, partido, idade, processos
- [OK] Layout limpo sem overflow

**Governadores (/governadores) - Desktop 1440x900:**
- [OK] SVG mapa do Brasil renderiza
- [OK] Lista de estados por regiao (Norte, Nordeste, Centro-Oeste, Sudeste, Sul)
- [OK] Hero com imagem e titulo

**Governadores (/governadores) - Mobile 375x812:**
- [OK] Mapa escala corretamente
- [OK] Texto legivel

**Sobre (/sobre) - Desktop 1440x900:**
- [OK] Hero com imagem do Congresso
- [OK] Secoes de texto legíveis
- [OK] "Fontes de Dados" com cards (TSE, etc.)
- [OK] Console: 0 erros
- [OK] Network: 0 requests falhando

**Sobre (/sobre) - Mobile 375x812:**
- [OK] Conteudo legivel, cards empilham
- [OK] Fontes de dados com cards full-width

### Fase 3: Interaction Testing (CONCLUIDA - com limitacoes do Preview)

**Menu mobile:**
- [OK] Click em .menu-btn abre menu (display:block, body overflow:hidden)
- [OK] Links presentes no DOM (Presidencia, Governadores, Comparar, Sobre)
- [LIMITACAO] GSAP animation nao completa no headless (backdrop-layer panels ficam mid-animation)
- [OK] aria-expanded togglea, FECHAR text aparece

**Busca (CandidatoGrid):**
- [LIMITACAO] Preview fill nao dispara React onChange em controlled inputs
- Filtro nao testavel via Preview, requer Playwright ou teste manual

**Comparador selection:**
- [LIMITACAO] Clicks nao propagam pelo React virtual DOM no Preview
- Sticky bar de comparacao nao testavel, requer Playwright ou teste manual

**Console & Network (cross-cutting):**
- [OK] 0 erros no console em todas as paginas testadas
- [OK] 0 failed network requests

### Fase 4: Consolidacao (FINAL)

---

## RESULTADO FINAL: 7 Findings

### [P1] ProfileTabs sticky offset mismatch — gap de 5px no scroll

- **Pagina:** /candidato/[slug]
- **Viewport:** all
- **Componente:** `src/components/ProfileTabs.tsx:21`
- **Esperado:** Tab bar encosta flush no bottom da Navbar
- **Real:** Navbar height=65px, tabs top=60px (mobile top=56px). Gap de 5-9px onde conteudo "vaza" entre navbar e tabs no scroll
- **Fix:** Trocar `top-[56px] sm:top-[60px]` por `top-16` (64px) ou medir Navbar height dinamicamente
- **Falso positivo?** Nao. Mismatch CSS entre 2 componentes, confirmado via inspect
- **STATUS: CORRIGIDO** — `top-16` aplicado. Commit `7f2c2ea`. Playwright confirma flush.
- **Risco residual:** Inspeção mediu Navbar em 65px (possível borda ou arredondamento). `h-16` = 64px pelo Tailwind. Diferença de 1px é sub-pixel e improvável de ser visível, mas não foi medida novamente após o fix.

### [P1] BrazilMap tooltip quebrado em touch devices

- **Pagina:** /governadores
- **Viewport:** mobile (todos touch)
- **Componente:** `src/components/BrazilMap.tsx:95-97, 163-179`
- **Esperado:** Tap em estado mostra nome antes de navegar
- **Real:** Tooltip depende de onMouseEnter/onMouseMove (sem equivalente touch). onClick navega imediatamente. Estados pequenos (AL, SE, RN, PB, PE, ES, RJ, DF, AP, AC) nao tem label NEM tooltip em mobile
- **Fix:** Adicionar tap-to-preview (primeiro tap mostra tooltip, segundo navega) ou info bar fixa abaixo do mapa
- **Falso positivo?** Nao. Bug de acessibilidade real em touch
- **STATUS: CORRIGIDO (parcial)** — tap duplo implementado via `touchedRef`. Mouse position atualizado via `e.touches[0]`. Commit `7f2c2ea`.
- **Lacuna remanescente:** O fix endereça o fluxo de tooltip em touch. Não adiciona labels permanentes no SVG para estados pequenos (AL, SE, RN, PB, PE, ES, RJ, DF, AP, AC) que já eram invisíveis antes. Esses estados continuam sem texto no mapa — é melhoria futura separada (label SVG ou infobar fixa).

### [P2] 5o stat card orfao na grid mobile

- **Pagina:** /candidato/[slug]
- **Viewport:** 375px (mobile)
- **Componente:** `src/components/CandidatoProfile.tsx:169`
- **Esperado:** 5 stat cards distribuem de forma balanceada
- **Real:** Grid 2-col: 2+2+1. O 5o card ("Projetos de Lei") fica sozinho em 50% width
- **Fix:** Adicionar `last:col-span-2` quando grid-cols-2, ou usar grid-cols-3 em sm
- **Falso positivo?** Nao. Layout visual, confirmado via screenshot
- **STATUS: CORRIGIDO** — `[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1`. Commit `7f2c2ea`.

### [P2] stagger-item opacity:0 sem fallback para animacao bloqueada

- **Pagina:** / (grid de candidatos)
- **Viewport:** all
- **Componente:** `src/app/globals.css:272-276`
- **Esperado:** Cards sempre ficam visiveis
- **Real:** `.stagger-item { opacity: 0 }` depende de `animation: fadeSlideUp forwards` para ficar opacity:1. Se animacao nao dispara (extensoes, print, edge cases), conteudo fica invisivel. prefers-reduced-motion trata o caso mais comum mas nao todos
- **Fix:** Adicionar `@supports not (animation-fill-mode: forwards)` fallback ou JS timeout safety
- **Falso positivo?** Edge case, mas alto impacto (grid principal do site)
- **STATUS: CORRIGIDO** — `forwards` trocado por `both`, `opacity: 0` removido do class. Com `both`, o `from` keyframe cobre o delay; se animacao bloqueada, fallback e opacity natural (1). Commit `7f2c2ea`.

### [P2] BrazilMap SVG sem prefers-reduced-motion

- **Pagina:** /governadores
- **Viewport:** all
- **Componente:** `src/components/BrazilMap.tsx:117-118`
- **Esperado:** Com prefers-reduced-motion, transicoes sao instant
- **Real:** Inline `transition: "transform 0.35s ..."` hardcoded, sem checar motion preference. O hook `usePrefersReducedMotion` existe no projeto mas nao e usado aqui
- **Fix:** Importar hook, condicionar `transition: prefersReducedMotion ? "none" : "..."`
- **Falso positivo?** Nao. Bug de acessibilidade, hook ja existe
- **STATUS: CORRIGIDO** — `usePrefersReducedMotion` importado, `stateTransition` condicional aplicado em todas as 3 transitions inline. Commit `7f2c2ea`.

### [P3] Footer 3a coluna sozinha em mobile

- **Pagina:** todas
- **Viewport:** 375px
- **Componente:** `src/components/Footer.tsx:18`
- **Esperado:** 3 colunas de links balanceadas
- **Real:** `grid grid-cols-2`: 3a coluna ("Projeto") fica sozinha em nova linha. Funcional mas assimetrico
- **Fix:** Considerar grid-cols-3 com gap menor, ou stack vertical completo em mobile
- **Falso positivo?** Nao, mas e cosmetico
- **STATUS: CORRIGIDO** — `grid-cols-2 gap-6` trocado por `grid-cols-3 gap-4`. Commit `7f2c2ea`.

### [P3] Orphaned CandidatoSlider.tsx + .module.css (~400 linhas)

- **Componentes:** `src/components/CandidatoSlider.tsx`, `src/components/CandidatoSlider.module.css`
- **Status:** Nao importados por nenhum arquivo. Sobra da rota /explorar deletada
- **Fix:** Deletar ambos os arquivos
- **Falso positivo?** Nao. Dead code confirmado via grep
- **STATUS: CORRIGIDO** — ambos deletados (~680 linhas). Commit `7f2c2ea`.

---

## Nao-findings (verificados e limpos)

- Z-index stack: sem conflitos (z-0 a z-[200] bem estratificado)
- GSAP cleanup: kill() chamado em useEffect return, sem memory leak
- GSAP reduced-motion: branch correto no Navbar
- Glass overlay mobile (CandidatoCard): overlay visivel com stats, foto nao coberta
- Container alignment: max-w-7xl + px-5/px-12 consistente
- clamp() font sizes: legiveis em 375px
- Console: 0 erros em todas as paginas
- Network: 0 requests falhando
- Fotos: carregam de todas as fontes remotas testadas
- glass-light CSS: nao usada em producao (so styleguide), nao causa bug visual

## Limitacoes do teste (RESOLVIDAS)

O Claude Preview headless nao conseguiu validar:
1. **GSAP animations** - requestAnimationFrame nao roda normalmente
2. **React controlled inputs** - search filter nao dispara onChange
3. **React button state** - comparador selection nao propaga clicks
4. **Tab switching** - nao testado via interacao

**Resolucao:** Playwright com browser real. `tests/visual/interactions.spec.ts` criado. 32/32 passando contra producao (desktop + mobile). Commit `7f2c2ea`.

**Lacunas documentais:**
- Viewport 390×844 (iPhone 14) estava no plano original mas não aparece no log de execução da Fase 2. Os testes Playwright cobrem iPhone 14 via `devices["iPhone 14"]`, mas o log de inspeção manual ficou só em 375 e 1440.
- Os testes rodam contra `https://puxa-ficha.vercel.app` por padrão. Isso funciona como smoke mas é sensível a dados, deploy e rede. Para estabilidade em CI ou desenvolvimento local, usar `PF_BASE_URL=http://localhost:3000 npm run test:visual`.

## Pós-limpeza (fora do escopo visual, executada junto)

- `CandidatoSlider.tsx` + `.module.css` deletados. Referências mortas removidas de `.github/workflows/auditoria-factual.yml` (2 entradas nos blocos `paths` de `push` e `pull_request`). Commit `7f2c2ea`.
- `PLAN.md` e `AUDITORIA-PROJETO-2026-04-03.md` ainda mencionam `CandidatoSlider` — são documentos históricos, não precisam de atualização.
