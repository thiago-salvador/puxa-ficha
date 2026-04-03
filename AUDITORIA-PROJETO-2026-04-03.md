# Auditoria total do projeto Puxa Ficha

**Data:** 2026-04-03  
**Escopo:** aplicacao Next.js (`src/`), camada de dados (`src/lib/api.ts`), Supabase (migrations), scripts de pipeline, configuracao, dependencias.  
**Verificacao automatizada:** `npm run lint` (OK), `npm run check:scripts` (OK), `npm run build` (OK), `npm audit` (0 vulnerabilidades reportadas).

Este documento lista achados por severidade provavel e tipo. Itens marcados como **confirmado em codigo** referenciam trechos ou arquivos verificados nesta sessao.

---

## 0. Protocolo de execucao desta remediacao

### 0.1 Regras de correcao

1. Cada item auditado deve ser primeiro revalidado contra o estado atual do codigo antes de qualquer patch.
2. Itens confirmados como desatualizados, falsos positivos ou ja resolvidos no worktree atual devem ser fechados explicitamente no log com a evidencia de verificacao.
3. Todo fix funcional deve ser o menor patch seguro capaz de eliminar a causa-raiz, nao apenas esconder o sintoma.
4. Mudancas em seguranca devem priorizar fail-closed, defesa em profundidade e compatibilidade com o fluxo publico atual.
5. Mudancas em performance so entram como remediacao quando reduzem trabalho real de rede, CPU, bundle ou render. "Micro-otimizacao" sem impacto medido nao fecha item sozinha.
6. Mudancas de acessibilidade e SEO so contam como concluidas quando a semantica ou metadata final fica presente no HTML/metadata gerado, nao apenas comentada no codigo.
7. Mudancas de pipeline e schema devem manter idempotencia, nao ampliar risco de duplicacao e deixar claro o caminho de aplicacao em producao.
8. Itens que dependem de ambiente externo devem receber artefato aplicavel no repo: migration, workflow, env example, query de verificacao ou runbook. Nao basta observacao solta.

### 0.2 Regras de teste

1. Todo bloco de fixes deve passar por validacao local proporcional ao risco:
   `npm run lint`
   `npm run check:scripts`
   `npm run build`
2. Sempre que houver alteracao de metadata, robots, sitemap, headers ou serializacao, validar tambem a saida gerada ou a funcao utilitaria correspondente.
3. Sempre que houver alteracao de data layer, validar o caminho `live`, `mock` e `degraded` quando aplicavel.
4. Sempre que houver alteracao em scripts de ingestao ou helpers compartilhados, validar TypeScript dos scripts e revisar callsites atingidos.
5. Sempre que houver alteracao de acessibilidade, validar semantica por leitura do DOM/JSX e, quando possivel, por teste automatizado simples.

### 0.3 Definition of Done por item

Um item so pode ser marcado como fechado quando cumprir todos os pontos abaixo:

- causa-raiz identificada;
- patch aplicado ou decisao arquitetural registrada;
- risco residual documentado, se houver;
- teste primario executado;
- teste cruzado aplicavel executado;
- evidencias registradas na secao de log.

### 0.4 Testes cruzados obrigatorios

Usarei a seguinte matriz de regressao para nao corrigir um ponto quebrando outro:

| Classe de mudanca | Teste cruzado obrigatorio |
|-------------------|---------------------------|
| Headers, robots, preview, metadata | verificar `build`, `robots.ts`, `sitemap.ts`, rotas dinamicas e metadata exports |
| `api.ts`, tipos, mock fallback | verificar listagens publicas, ficha publica, preview e comparador |
| Componentes de listagem/comparacao | verificar acessibilidade minima, props, filtros e render em mobile/desktop |
| Scripts/helpers compartilhados | verificar `check:scripts` e callsites de ingestao afetados |
| Schema/migrations/RLS | revisar `scripts/schema.sql`, migrations e compatibilidade com o modelo `publicavel` |
| Docs operacionais | alinhar `AGENTS.md`, `CLAUDE.md`, `.env.example` e workflow quando houver dependencia de uso |

### 0.5 Padrao de log operacional

Cada item fechado ou descartado deve registrar, no minimo:

- `ID`: numero do achado, por exemplo `1.3`
- `Status`: `pendente`, `em_execucao`, `fechado_com_patch`, `fechado_por_verificacao`, `fechado_por_decisao`, `bloqueio_externo`
- `Validacao`: como o item foi reconfirmado no codigo atual
- `Acao`: patch aplicado ou motivo do fechamento sem patch
- `Teste primario`: comando, leitura ou caso executado para validar o fix
- `Teste cruzado`: verificacao adicional para evitar regressao
- `Evidencia`: arquivo(s), migration(s), rota(s) ou comando(s) relevantes
- `Atualizado em`: timestamp local da ultima movimentacao

### 0.6 Convencoes de fechamento

- `Fechado com patch`: havia problema real e o repo recebeu alteracao corretiva.
- `Fechado por verificacao`: o item estava desatualizado ou ja estava resolvido no codigo atual.
- `Fechado por decisao`: o item foi reavaliado e mantido intencionalmente, com justificativa tecnica registrada.
- `Bloqueio externo`: depende de credencial, dashboard, grant efetivo ou configuracao fora do repo. Exige runbook ou artefato de aplicacao para ser considerado tratado.

### 0.7 Secao de log desta execucao

O log detalhado desta remediacao sera mantido na secao `17. Log de execucao`, ao final do documento, com uma entrada por item auditado tratado nesta rodada.

---

## 1. Seguranca e vazamento de dados

### 1.1 RLS em tabelas filhas vs. gate `publicavel` (alto, gap potencial confirmado em codigo)

A superficie publica foi endurecida em duas etapas: `20260401002545_harden_public_candidate_surface.sql` revoga `SELECT` direto em `candidatos` para `anon/authenticated`, e `20260401141000_add_publicavel_column_and_gate.sql` faz a view `candidatos_publico` filtrar `publicavel = true`. Porem, nas migrations analisadas, tabelas como `patrimonio`, `historico_politico`, `processos`, `financiamento`, etc. continuam com politicas do tipo `FOR SELECT USING (true)`.

**Risco:** o repositorio confirma o gap de policy, mas nao confirma sozinho os `GRANT SELECT` efetivos dessas tabelas filhas para `anon/authenticated` no ambiente. Se esses grants existirem (por padrao do projeto, permissao herdada ou ajuste manual), um cliente com `NEXT_PUBLIC_SUPABASE_ANON_KEY` pode consultar essas tabelas diretamente por `candidato_id`. UUIDs nao sao adivinhaveis, mas qualquer vazamento de ID (logs, integracoes, URL futura, erro) expoe dados de candidatos ainda nao publicos.

**Recomendacao:** politicas RLS que restrinjam `SELECT` a linhas cujo `candidato_id` exista em `candidatos` com `publicavel = true` (ou views seguras por tabela), e verificacao explicita dos grants efetivos no projeto Supabase. Alinhar com o modelo fail-closed descrito em `scripts/set-publicavel-from-audit.ts`.

### 1.2 Rota `/preview/candidato/[slug]` e service role (medio, confirmado)

`getCandidatoBySlugPreviewResource` usa `createServiceRoleSupabaseClient` e le a tabela `candidatos`, contornando o filtro da view publica.

**Pontos positivos:** pagina dinamica; `metadata.robots` noindex; autorizacao por `PF_PREVIEW_TOKEN` em producao; em ambientes nao-producao o token padrao `local-preview` e previsivel (aceitavel so para dev).

**Risco residual:** se `PF_PREVIEW_TOKEN` for fraco ou vazado em producao, toda a base de candidatos (incluindo nao publicos) fica legivel via essa rota. Garantir token forte e rotacao; considerar rate limit na edge / Vercel.

### 1.3 `JsonLd` e `dangerouslySetInnerHTML` (baixo a medio)

`src/components/JsonLd.tsx` injeta `JSON.stringify(data)` em `<script type="application/ld+json">`. Se algum campo string no JSON-LD contiver sequencias que quebrem o parser HTML (por exemplo `</script>`), ha risco de quebra de contexto ou XSS em cenarios de dados maliciosos no banco.

**Recomendacao:** serializar com escape de `<` para `\u003c` (e similares) ou usar biblioteca dedicada a JSON-LD seguro.

### 1.4 Chaves e segredos (bom estado geral)

- `SUPABASE_SERVICE_ROLE_KEY` aparece apenas em scripts e `createServiceRoleSupabaseClient` no servidor; nao ha `NEXT_PUBLIC_` para service role nos trechos verificados.
- `.env.example` documenta variaveis sem valores reais.

### 1.5 `robots.txt` e rotas sensiveis

`src/app/robots.ts` bloqueia `/styleguide`, `/internaltest`, `/api/`. **Sugestao:** incluir explicitamente `/preview` em `disallow` (defesa em profundidade; a pagina de preview ja usa `noindex`).

---

## 2. Bugs e riscos funcionais

### 2.1 `generateStaticParams` + `dynamicParams = false` (comportamento documentado)

Em `src/app/candidato/[slug]/page.tsx`, novos slugs publicos exigem novo deploy (ou revalidacao/on-demand) para gerar a rota estatica. Isso esta alinhado ao `CLAUDE.md`; nao e bug, mas e ponto operacional facil de esquecer.

### 2.2 Sitemap e `lastModified`

`src/app/sitemap.ts` usa `new Date(c.ultima_atualizacao)` sem validar se a string e parseavel. Valor invalido gera `Invalid Date` na saida do sitemap.

**Recomendacao:** validar ou usar fallback (`new Date()` ou omitir `lastModified`).

### 2.3 Ordem de imports em `candidato/[slug]/page.tsx` (estilo / manutencao)

Ha uma declaracao `const getFicha = cache(...)` intercalada entre blocos `import`. Funciona, mas foge do padrao usual e pode confundir ferramentas ou leitores.

---

## 3. Duplicacao e codigo morto / obsoleto

### 3.1 Funcao `sleep` duplicada

`src/lib/supabase.ts` e `src/lib/api.ts` definem cada um uma funcao `sleep` identica. **Recomendacao:** extrair para um util compartilhado (por exemplo `src/lib/async-utils.ts`).

### 3.2 Validacao de URL em noticias vs. `safeHref`

`NewsSection` usa `getSafeNewsUrl` (apenas `https:`). Outros componentes usam `safeHref` (`http:` e `https:`). Intencionalmente mais estrito para midia; documentar para evitar refactors que reintroduzam `javascript:`.

### 3.3 Documentacao desatualizada em `/internaltest`

A pagina ainda menciona que as fichas usam `<img>` e que o comparador usa `scrollIntoView` suave sem respeitar `prefers-reduced-motion`. **Fato:** as fichas publica e preview ja usam `CandidatePhoto` com `next/image`, e `ComparadorPanel.tsx` ja usa `usePrefersReducedMotion` para escolher `behavior: "auto" | "smooth"`. Vale atualizar o texto da demo ou remover os trechos obsoletos.

### 3.4 Artefatos grandes no Git

Varios JSON de auditoria/relatorio em `scripts/` (por exemplo `audit-factual-*.json`, `release-verify-*.json`) incham o historico. `.vercelignore` ja exclui `scripts/audit-factual-runs`; considerar `.gitignore` para saidas regeneraveis ou anexa-las como CI artifacts em vez de commit permanente.

### 3.5 `canonical-person-map`

`scripts/lib/canonical-person-map.ts` reexporta `../../src/lib/canonical-person-map` (fonte unica). **Nao** e duplicacao problematica.

---

## 4. Boas praticas e qualidade

### 4.1 Pontos fortes observados

- Camada de dados centralizada em `api.ts` com `DataResource`, fallback mock so fora de producao, retry em chamadas Supabase.
- `safeHref` para links externos em perfil e redes; `CandidatePhoto` valida URL.
- Navbar com GSAP condicionado a `prefers-reduced-motion`.
- Build e lint limpos na verificacao desta auditoria.
- Producao bloqueada sem Supabase real (`USE_MOCK` + `VERCEL_ENV === "production"`).

### 4.2 Testes automatizados

Nao ha suite de testes (Jest/Vitest/Playwright) referenciada em `package.json` para a app. Scripts de auditoria cobrem dados, nao regressao de UI. **Oportunidade:** testes e2e minimos para rotas criticas (`/`, ficha, comparador) e snapshots de componentes de alto risco.

### 4.3 Middleware Next.js

Nao existe `middleware.ts`. Para reforcar headers de seguranca (CSP, HSTS via plataforma), rate limiting de `/preview`, ou redirecionamentos globais, seria o lugar natural.

### 4.4 Imagens remotas

`next.config.ts` mantem lista extensa de `remotePatterns`. **Trade-off:** manutencao quando novas fontes de foto aparecem; alternativa seria armazenar fotos no Storage Supabase apos ingestao para reduzir superficie de dominios.

---

## 5. Performance e otimizacao

- **ISR:** `revalidate = 3600` em fichas e listagens alinhado ao modelo de dados pouco volatil.
- **Bundle:** primeira carga compartilhada ~140 kB JS (relatorio de build); aceitavel; monitorar se GSAP crescer no bundle principal (hoje carregamento sob demanda no menu).
- **Virtualizacao:** `CandidatoGrid` menciona virtualizacao condicional; manter lista grande sob observacao.

---

## 6. Dependencias

- `npm audit`: 0 vulnerabilidades (snapshot desta execucao).
- Manter Next/eslint-config-next alinhados (hoje 15.5.14).

---

## 7. Resumo executivo

| Area              | Status resumido |
|-------------------|-----------------|
| Build / lint / tsc | OK              |
| Segredos no front  | OK              |
| Gate `publicavel` na API app | OK (via views) |
| Gate `publicavel` no RLS das tabelas filhas | **Gap potencial; checar grants efetivos** |
| Preview + service role | Protegido por token; reforcar token e robots |
| XSS / injecao JSON-LD | Risco baixo com dados curados; endurecer serializacao |
| Duplicacao leve    | `sleep`, docs internaltest |
| Testes de produto  | Ausentes na app |

---

## 8. Proximos passos sugeridos (prioridade)

1. Endurecer RLS (ou views) em tabelas ligadas a `candidato_id` para respeitar `publicavel` / lista publica, e validar grants efetivos para `anon/authenticated` no projeto Supabase.  
2. Adicionar `/preview` ao `disallow` em `robots.ts`.  
3. Endurecer serializacao do `JsonLd`.  
4. Validar datas no `sitemap.ts`.  
5. Extrair `sleep` compartilhado; alinhar texto de `/internaltest` com o comparador atual.  
6. Politica de repositorio para JSONs gerados por scripts (gitignore ou CI artifacts).

---

*Auditoria inicial gerada por revisao estatica do codigo mais comandos de verificacao locais.*

---

# Auditoria Complementar (Opus 4.6, deep scan, rev.2 corrigida)

**Data:** 2026-04-03
**Metodo:** 4 agentes paralelos cobrindo seguranca, dead code, performance/best practices e pipeline de dados.
**Revisao:** 8 falsos positivos removidos apos verificacao manual contra o codebase real. Itens marcados ~~riscados~~ na v1 foram eliminados.

> **Nota sobre falsos positivos da v1:** Os agentes rodaram sobre um worktree limpo (branch nova) e nao leram todos os arquivos do repo principal. Isso produziu achados incorretos sobre `next/image` (ja usado via `CandidatePhoto.tsx` e `CandidatoCard.tsx`), `JsonLd` (ja injetado em 7 paginas), `/explorar` no sitemap (ja presente), skip navigation (ja em `layout.tsx:59-64`), `NewsSection` XSS (`getSafeNewsUrl` ja aplicado), schema drift (migrations posteriores ja cobrem as tabelas/colunas citadas), `publicavel` (ja em migration `20260401141000`), e mock em producao (`api.ts:50` ja faz throw). Esta revisao mantem apenas achados verificados.

---

## 9. Seguranca (complementar a secao 1)

### 9.1 `.env` nao esta no `.gitignore` (ALTO)
- **Arquivo:** `.gitignore:33`
- **Detalhe:** Apenas `.env.local` e `.env.*.local` sao excluidos. Um arquivo `.env` simples (sem o sufixo `.local`) poderia ser commitado acidentalmente no repo publico com credenciais reais.
- **Fix:** Adicionar `.env` ao `.gitignore`.

### 9.2 Zero security headers (MEDIO)
- **Arquivos:** `next.config.ts`, nenhum `middleware.ts` existe
- **Ausentes:** Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Strict-Transport-Security, Permissions-Policy
- **Risco:** O site pode ser embutido em iframe por qualquer dominio. Sem CSP, qualquer XSS futuro nao teria defesa em profundidade.
- **Fix:** Criar `middleware.ts` com headers ou adicionar via `next.config.ts` > `headers()`.

### 9.3 `foto_url` sem validacao de protocolo em `<img src>` no slider (BAIXO)
- **Arquivo:** `CandidatoSlider.tsx`
- **Detalhe:** `CandidatoGrid` e `ComparadorPanel` ja usam `CandidatePhoto`, que passa por validacao. O ponto remanescente e o `CandidatoSlider`, que ainda usa `<img src={foto_url}>` diretamente. Embora `<img src="javascript:...">` nao execute em browsers modernos, URIs `data:` ou tracking pixels poderiam ser injetados se o banco for comprometido. Risco baixo dado que os dados vem de pipeline controlado.

### 9.4 `remotePatterns` aceita qualquer projeto Supabase (BAIXO)
- **Arquivo:** `next.config.ts:8`
- **Detalhe:** `hostname: "*.supabase.co"` permite otimizacao de imagem de qualquer projeto Supabase. Deveria ser restrito ao hostname especifico.

### 9.5 Sem rate limiting nas queries Supabase via anon key (BAIXO)
- **Detalhe:** A anon key publica (`NEXT_PUBLIC_`) permite queries diretas ao Supabase REST API sem limite app-side. Protecao depende dos rate limits nativos do Supabase.

### 9.6 Header `X-Powered-By: Next.js` exposto (INFO)
- **Arquivo:** `next.config.ts`
- **Fix:** Adicionar `poweredByHeader: false`.

---

## 10. Dead Code, Duplicacoes e Codigo Obsoleto (complementar a secao 3)

### 10.1 `mock.ts` importado incondicionalmente no bundle (ALTO)
- **Arquivo:** `src/lib/api.ts:3-16`
- **Detalhe:** `src/data/mock.ts` (~1465 linhas) e importado no topo de `api.ts` independentemente de `USE_MOCK` ser true ou false. Em producao com Supabase configurado, o arquivo inteiro entra no server bundle sem necessidade. O throw em `api.ts:50` impede que mock seja *servido*, mas nao impede que seja *bundled*.
- **Fix:** Usar `import()` dinamico condicional.

### 10.2 4 funcoes de API exportadas mas nunca chamadas (MEDIO)
- **Arquivo:** `src/lib/api.ts`
- **Funcoes sem nenhum import externo:**
  - `getNoticiasCandidato()`
  - `getSancoesAdministrativas()`
  - `getCandidatosPorEstado()`
  - `getIndicadoresEstaduais()`
- **Fix:** Remover ou marcar como TODO para features futuras.

### 10.3 6 tipos sem import externo direto em `types.ts` (BAIXO)
- **Arquivo:** `src/lib/types.ts`
- **Tipos:** `BemDeclarado`, `Doador`, `FonteReferencia`, `GastoCategoria`, `GastoDestaque`, `VotacaoChave`
- **Detalhe:** Esses tipos nao aparecem importados diretamente em outros arquivos, mas sao usados como tipos aninhados dentro de interfaces exportadas do proprio modulo. Entao nao configuram dead code claro; no maximo, sao candidatos a simplificacao futura se o time quiser reduzir a superficie publica de tipos.

### 10.4 CLAUDE.md com 7+ referencias obsoletas (MEDIO)
- **Arquivo:** `CLAUDE.md`
- **Stale:**
  - `recharts 3.x` na stack table: nao esta no `package.json` nem tem imports
  - `motion 12.x`: nao instalado, zero imports
  - `Zod 4.x`: nao instalado, zero imports
  - `getPartidoColors(sigla)`: funcao nao existe no codebase
  - `ProfileHero`, `BentoGrid`, `PatrimonioChart`, `FinanciamentoDonut`, `ProcessosSummary`, `VotingGrid`, `PoliticalTimeline`: componentes removidos no frontend wipe
  - `src/components/profile/`: diretorio nao existe
  - `AlertsSection`, `SocialLinksGrid`: nao existem
- **Impacto:** Claude e outros agentes usam CLAUDE.md como fonte de verdade. Referencias erradas geram falsos positivos em auditorias (como esta v1 demonstrou).

### 10.5 `AGENTS.md` com referencias stale (BAIXO)
- **Arquivo:** `AGENTS.md` (raiz)
- **Detalhe:** Referencia componentes e dependencias removidos.

### 10.6 Funcoes de scripts nunca chamadas (BAIXO)
- **Arquivo:** `scripts/lib/helpers.ts`
- **`slugify()`** (linha 24): exportada, zero importacoes
- **`fetchAllPages()`** (linha 66): exportada, zero importacoes

### 10.7 Normalizacao duplicada em 4 locais (BAIXO)
- `scripts/lib/helpers.ts:16` (`normalizeForMatch`)
- `scripts/audit-factual-diff.ts:44` (`normalizeScope`)
- `scripts/audit-factual.ts:67` (inline)
- `scripts/lib/party-canonical.ts:32` (`normalizePartyValue`)
- Todos fazem `.normalize("NFD").replace(...)` com variantes minimas.

### 10.8 `resolveCandidatoId` copiada em 10+ scripts (BAIXO)
- **Detalhe:** Mesma funcao de 3 linhas consultando Supabase, definida independentemente em cada script de ingest. Poderia ser centralizada em `helpers.ts`.

### 10.9 Utilidades de arquivo duplicadas em 3 scripts (BAIXO)
- **Funcoes:** `downloadFile`, `extractZip`, `cleanupDir`, `cleanupFile`, `findCSVs`
- **Arquivos:** `ingest-tse.ts`, `ingest-tse-situacao.ts`, `ingest-filiacao.ts`

### 10.10 IBGE codes duplicados em 4 scripts (BAIXO)
- **Mapas:** `IBGE_PARA_UF` / `CODIGO_IBGE`
- **Arquivos:** `ingest-siconfi.ts`, `ingest-ibge.ts`, `ingest-ideb.ts`, `ingest-ipea.ts`

### 10.11 Componentes UI so usados pelo styleguide (INFO)
- `alert.tsx`, `badge.tsx`, `button.tsx`, `input.tsx`, `separator.tsx`, `tabs.tsx`
- Importados apenas por `/app/styleguide/page.tsx` (bloqueado no robots.txt, nao linkado).

### 10.12 `situacao_candidatura` no CANDIDATO_COLUMNS mas fora do tipo (INFO)
- **Arquivo:** `src/lib/api.ts:23` seleciona o campo, mas `Candidato` em `types.ts` nao o define. TypeScript ignora silenciosamente.

---

## 11. Performance e Otimizacao (complementar a secao 5)

### 11.1 Over-fetching em `governadores/[uf]/page.tsx` (ALTO)
- **Arquivo:** `governadores/[uf]/page.tsx:58`
- **Detalhe:** Busca TODOS os governadores de todos os 27 estados via `getCandidatosComResumo("Governador")`, depois filtra um unico estado em JS. Deveria passar filtro `estado` para o DB.

### 11.2 `CandidatoProfile.tsx` e um monolito de 716 linhas (MEDIO)
- **Arquivo:** `src/components/CandidatoProfile.tsx`
- **Problemas:**
  - Componente Client inteiro: todo conteudo estatico vira JS no bundle
  - 7 tabs renderizadas condicionalmente com `{activeTab === "x" && (...)}`: cria/destroi DOM a cada troca em vez de hide/show
  - Sem `React.memo` em subcomponentes internos

### 11.3 Zero uso de `React.memo` no projeto (MEDIO)
- **Componentes que se beneficiariam:**
  - `CandidatoCard` (renderizado em listas de 10-144 items)
  - `CompRow` em `ComparadorPanel.tsx`
  - `StatCard` em `CandidatoProfile.tsx`

### 11.4 `getCandidatosComResumo` faz queries pesadas (MEDIO)
- **Arquivo:** `src/lib/api.ts`
- **Detalhe:** Busca todos os candidatos, depois 3 queries `.in()` com 144 UUIDs cada. A query de patrimonio retorna TODAS as rows (nao apenas a mais recente) e filtra em JS.

### 11.5 Missing `error.tsx` em 4 rotas (MEDIO)
- Rotas sem error boundary proprio: `/comparar`, `/governadores`, `/governadores/[uf]`, `/explorar`
- Falhas server-side caem no error boundary raiz sem UX especifica.

### 11.6 Missing `loading.tsx` em 4 rotas (BAIXO)
- Rotas sem loading state: `/governadores`, `/governadores/[uf]`, `/explorar`, `/sobre`

### 11.7 Missing `optimizePackageImports` para lucide-react (BAIXO)
- **Arquivo:** `next.config.ts`
- **Fix:** Adicionar `experimental: { optimizePackageImports: ['lucide-react'] }`

---

## 12. SEO e Metadata (complementar)

### 12.1 Missing Twitter card metadata (MEDIO)
- **Detalhe:** Nenhum `twitter:card`, `twitter:site`, `twitter:creator` nas metadata exports. Twitter/X nao vai renderizar rich cards.

### 12.2 Missing canonical URLs (MEDIO)
- **Detalhe:** `generateMetadata` no candidato define `openGraph.url` mas nao `alternates.canonical`. Pode causar problemas de conteudo duplicado.

### 12.3 Missing `viewport` export com `theme-color` no layout (BAIXO)
- **Arquivo:** `src/app/layout.tsx`
- **Detalhe:** Next.js 14+ usa export separado para viewport. Nao ha `theme-color` definido (afeta cor do chrome do browser mobile).

---

## 13. Acessibilidade (complementar)

### 13.1 `ComparadorPanel` cards sem estado ARIA de toggle (MEDIO)
- **Arquivo:** `src/components/ComparadorPanel.tsx:87-127`
- **Detalhe:** Os botoes mobile ja tem nome acessivel pelo texto visivel, entao o problema nao e falta de `aria-label`. O gap real e que eles nao expõem o estado selecionado como toggle, por exemplo com `aria-pressed={isSelected}`. Sem isso, leitores de tela nao recebem a semantica de "selecionado / nao selecionado".

### 13.2 Focus indicators muito sutis (BAIXO)
- **Arquivo:** `CandidatoGrid.tsx:75`
- **Detalhe:** Search input usa `focus:ring-foreground/20` (20% opacidade). Pode nao atender WCAG 2.4.7 focus visible.

### 13.3 Overlay do Navbar unfocusable (BAIXO)
- **Arquivo:** `Navbar.tsx:184`
- **Detalhe:** Overlay tem `role="button"` e `tabIndex={-1}`. Nao e focavel por teclado. Usuarios precisam usar Escape (que funciona).

---

## 14. Pipeline de Dados (complementar a secao existente, achados novos)

### 14.1 Instagram App ID hardcoded (ALTO)
- **Arquivo:** `scripts/lib/enrich-instagram.ts:6`
- **Detalhe:** `const IG_APP_ID = "936619743392459"` hardcoded. Pode ser revogado pela Meta a qualquer momento. Deveria ser env var.

### 14.2 `fetchAllPages` engole erros silenciosamente (MEDIO)
- **Arquivo:** `scripts/lib/helpers.ts:79`
- **Detalhe:** `catch {}` no loop de paginacao retorna resultados parciais sem indicacao de truncamento. Erro de rede na pagina 2 de 10 retorna so pagina 1 como se fosse completo.

### 14.3 Senado ingest sem timeout por candidato (MEDIO)
- **Arquivo:** `scripts/ingest-senado.ts`
- **Detalhe:** Camara tem `Promise.race` com timeout de 2 min. Senado nao tem. API pendurada bloqueia pipeline inteiro.

### 14.4 `projetos_lei` sem UNIQUE constraint (MEDIO)
- **Detalhe:** Scripts fazem select-then-insert manual. Se o select falhar (rede), duplicatas sao criadas. Schema nao tem UNIQUE em `(candidato_id, proposicao_id_api)`.

### 14.5 `mudancas_partido` sem UNIQUE constraint (MEDIO)
- **Detalhe:** Nenhuma constraint no schema. Idempotencia depende 100% do codigo aplicacao.

### 14.6 `parseBRL` retorna 0 silenciosamente para valores invalidos (MEDIO)
- **Arquivo:** `scripts/ingest-tse.ts:30`
- **Detalhe:** CSV corrompido insere patrimonio zero para candidato sem warning.

### 14.7 Wikipedia titles: 140+ entries hardcoded no source (MEDIO)
- **Arquivo:** `scripts/lib/enrich-wikipedia.ts:8-171`
- **Detalhe:** Adicionar candidato novo requer editar codigo fonte. Deveria ser campo em `candidatos.json`.

### 14.8 GitHub Actions: schedule conditionals frageis (MEDIO)
- **Arquivo:** `.github/workflows/ingest.yml`
- **Detalhe:** `github.event.schedule` string matching para decidir qual job roda. Job REST roda em todos os schedules exceto domingo, incluindo o schedule de Google News ao meio-dia. Pode causar double-run.

### 14.9 Residual de 9 ausencias validadas sem `tse_sq_candidato` (MEDIO)
- **Arquivo:** `data/candidatos.json`
- **Ausencias validadas nas janelas 2018/2020/2022/2024:** `renan-santos`, `rui-costa-pimenta`, `gilberto-kassab`, `paulo-hartung`, `orleans-brandao`, `andre-kamai`, `simao-jatene`, `ricardo-cappelli`, `natasha-slhessarenko`
- A ingestao ja nao depende mais de preencher `tse_sq_candidato` para esses 9 casos, porque a ausencia de candidatura nas bases oficiais foi validada. No caso de `renan-santos`, a identidade civil foi desambiguada como `Renan Antonio Ferreira dos Santos` via cadastro partidario do TSE, e o nome exato nao apareceu nos arquivos `consulta_cand` de 2018/2020/2022/2024.
- **Atualizacao 2026-04-03:** a rodada final desta auditoria primeiro reduziu o residual para 9 slugs sem `tse_sq_candidato`; depois, a curadoria externa consolidada em `search.md` validou 8 ausencias reais e, por fim, a desambiguacao do nome civil de `renan-santos` permitiu validar tambem esse non-match nos arquivos oficiais do TSE. Ver log em `17` e status consolidado em `18.2`.

### 14.10 Camara pagination delay muito curto (BAIXO)
- **Arquivo:** `scripts/ingest-camara.ts`
- **Detalhe:** 300ms entre paginas. Docs da Camara sugerem 1 req/s. Pode gerar 429s em endpoints com muitas paginas.

### 14.11 Sem `Retry-After` header parsing em 429s (BAIXO)
- **Arquivo:** `scripts/lib/helpers.ts`
- **Detalhe:** `fetchJSON` espera max 5s fixos em 429, ignora `Retry-After` header.

### 14.12 Sem notificacao de falha nos workflows (BAIXO)
- **Detalhe:** Nenhum Slack/email alert quando pipeline falha. So visivel checando GitHub Actions UI.

### 14.13 Sem cache de downloads TSE entre runs (INFO)
- **Detalhe:** Cada run semanal baixa ZIPs do TSE do zero. GitHub Actions cache economizaria bandwidth/tempo.

---

## 15. Resumo Executivo Consolidado

| Area | Severidade | Achados |
|------|-----------|---------|
| `.env` nao no gitignore | ALTO | Credenciais podem vazar no repo publico |
| Mock data no bundle | ALTO | ~1465 linhas importadas incondicionalmente em api.ts |
| Over-fetching governadores | ALTO | Busca 27 estados pra filtrar 1 em JS |
| Instagram App ID hardcoded | ALTO | Pode ser revogado, deveria ser env var |
| Security headers ausentes | MEDIO | CSP, X-Frame-Options, HSTS, etc. |
| Twitter cards ausentes | MEDIO | Sem rich preview no X/Twitter |
| Canonical URLs ausentes | MEDIO | Risco de conteudo duplicado |
| CandidatoProfile monolito | MEDIO | 716 linhas Client Component |
| CLAUDE.md stale | MEDIO | 7+ referencias a codigo/deps removidos |
| 4 funcoes API nunca usadas | MEDIO | Dead code em api.ts |
| fetchAllPages engole erros | MEDIO | Dados truncados sem warning |
| projetos_lei sem UNIQUE | MEDIO | Duplicatas possiveis |
| Senado sem timeout | MEDIO | Pipeline pode pendurar |
| ComparadorPanel sem estado ARIA de toggle | MEDIO | Acessibilidade de screen readers |

---

## 16. Proximos Passos (prioridade revisada, consolida secao 8 original)

### Tier 1: Alto (fazer esta semana)
1. Adicionar `.env` ao `.gitignore`
2. Dynamic import de `mock.ts` (ou remover se nao mais necessario)
3. Filtrar governadores por estado no DB em vez de JS
4. Instagram App ID para env var
5. Endurecer RLS em tabelas filhas (da auditoria original, secao 1.1)

### Tier 2: Medio (fazer este mes)
6. Security headers via middleware.ts ou next.config.ts headers()
7. Twitter card metadata
8. Canonical URLs
9. UNIQUE constraints em `projetos_lei` e `mudancas_partido`
10. Timeout no ingest Senado
11. Fix `fetchAllPages` error handling silencioso
12. Error/loading.tsx para rotas faltantes
13. Atualizar CLAUDE.md (remover recharts, motion, zod, componentes removidos)
14. `aria-pressed` ou semantica equivalente nos toggle buttons do ComparadorPanel

### Tier 3: Baixo (backlog)
15. `poweredByHeader: false`
16. `optimizePackageImports: ['lucide-react']`
17. `React.memo` em componentes de lista
18. Centralizar `resolveCandidatoId`, utilidades de arquivo, IBGE maps nos scripts
19. Limpar funcoes/tipos nunca usados em api.ts e types.ts
20. Viewport export e theme-color
21. `Retry-After` header parsing
22. Cache de downloads TSE no CI
23. Notificacao de falha nos workflows
24. Wikipedia titles para config externo em vez de hardcoded

---

*Auditoria complementar gerada por Claude Opus 4.6 via 4 agentes paralelos, revisada manualmente com 8 falsos positivos removidos. Nao substitui pentest, revisao de grants/politicas Supabase em producao nem monitoramento em runtime.*

---

## 17. Log de execucao

**Rodada de reconciliacao do worktree:** 2026-04-03 02:33:21 -03  
**Validacao executada nesta rodada:** `npm run lint` (OK), `npm run check:scripts` (OK), `npm test` (OK, 6 testes), `npm run build` (OK; houve `ConnectTimeoutError` em fetches externos durante a prerenderizacao, mas o build concluiu pelo caminho degradado), `npm audit --audit-level=low` (0 vulnerabilidades). [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

- **ID:** `1.1 / 14.4 / 14.5` | **Status:** `fechado_com_patch` | **Validacao:** migration e schema agora aplicam `is_public_candidate(candidato_id)` nas tabelas filhas e constraints `UNIQUE` em `projetos_lei` e `mudancas_partido` | **Acao:** fechamento do gap de RLS, deduplicacao previa e garantia de idempotencia no schema | **Teste primario:** revisao de `supabase/migrations/20260403113000_harden_child_rls_and_uniques.sql` e `scripts/schema.sql` + `npm run check:scripts` | **Teste cruzado:** `npm run build` | **Evidencia:** `supabase/migrations/20260403113000_harden_child_rls_and_uniques.sql`, `scripts/schema.sql` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `1.3` | **Status:** `fechado_com_patch` | **Validacao:** `JsonLd` deixou de serializar direto com `JSON.stringify` e passou a usar helper de escape | **Acao:** endurecimento da serializacao com escape de `<`, `>`, `&`, `U+2028` e `U+2029` | **Teste primario:** `npm test` com `tests/json-ld.test.ts` | **Teste cruzado:** `npm run build` | **Evidencia:** `src/components/JsonLd.tsx`, `src/lib/json-ld.ts`, `tests/json-ld.test.ts` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `1.5` | **Status:** `fechado_com_patch` | **Validacao:** `robots.ts` agora inclui `/preview` em `disallow` | **Acao:** defesa em profundidade para rotas internas de preview | **Teste primario:** leitura de `src/app/robots.ts` | **Teste cruzado:** `npm run build` gerando `robots.txt` | **Evidencia:** `src/app/robots.ts` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `2.2 / 12.1 / 12.2 / 12.3` | **Status:** `fechado_com_patch` | **Validacao:** metadata passou a usar helpers centralizados para `twitter`, `canonical`, `themeColor` e parse seguro de datas do sitemap | **Acao:** criados `src/lib/metadata.ts`, `viewport` no layout, `alternates.canonical` nas rotas e fallback seguro para `lastModified` | **Teste primario:** `npm test` com `tests/metadata.test.ts` | **Teste cruzado:** `npm run build` | **Evidencia:** `src/lib/metadata.ts`, `src/app/layout.tsx`, `src/app/sitemap.ts`, `src/app/candidato/[slug]/page.tsx`, `src/app/comparar/page.tsx`, `src/app/explorar/page.tsx`, `src/app/governadores/page.tsx`, `src/app/governadores/[uf]/page.tsx`, `src/app/sobre/page.tsx`, `tests/metadata.test.ts` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `3.1` | **Status:** `fechado_com_patch` | **Validacao:** `sleep` foi extraido para util compartilhado no app | **Acao:** remocao da duplicacao entre `api.ts` e `supabase.ts` | **Teste primario:** `npm run lint` | **Teste cruzado:** `npm run build` | **Evidencia:** `src/lib/async-utils.ts`, `src/lib/api.ts`, `src/lib/supabase.ts` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `3.3` | **Status:** `fechado_com_patch` | **Validacao:** a demo interna agora descreve o uso atual de `CandidatePhoto`, `safeHref` e o comparador com semantica atualizada | **Acao:** sincronizacao da documentacao de `/internaltest` com o front real | **Teste primario:** leitura de `src/app/internaltest/page.tsx` | **Teste cruzado:** `npm run build` | **Evidencia:** `src/app/internaltest/page.tsx` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `3.4 / 9.1` | **Status:** `fechado_com_patch` | **Validacao:** `.env` e artefatos gerados de auditoria/verificacao agora estao ignorados pelo Git e por deploys Vercel | **Acao:** hardening de segredos locais e limpeza da superficie de artefatos regeneraveis | **Teste primario:** leitura de `.gitignore` e `.vercelignore` | **Teste cruzado:** `git status --short` confirma `AUDITORIA-PROJETO-2026-04-03.md` como arquivo de trabalho separado e artefatos novos ignorados | **Evidencia:** `.gitignore`, `.vercelignore` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `4.2` | **Status:** `fechado_com_patch` | **Validacao:** o repo agora expoe `npm test` com testes direcionados para utilitarios de seguranca/metadata | **Acao:** adicao de suite minima para `safeJsonLdStringify`, `parseMetadataDate`, `buildAbsoluteUrl` e `safeHref` | **Teste primario:** `npm test` | **Teste cruzado:** `npm run build` | **Evidencia:** `package.json`, `tests/json-ld.test.ts`, `tests/metadata.test.ts`, `tests/utils.test.ts` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `9.2 / 9.4 / 9.6 / 11.7` | **Status:** `fechado_com_patch` | **Validacao:** `next.config.ts` agora define CSP e demais security headers, desliga `X-Powered-By`, ativa `optimizePackageImports` para `lucide-react` e restringe Supabase ao hostname configurado | **Acao:** hardening de headers e fechamento da permissao generica `*.supabase.co` | **Teste primario:** leitura de `next.config.ts` | **Teste cruzado:** `npm run build` | **Evidencia:** `next.config.ts` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `9.3` | **Status:** `fechado_com_patch` | **Validacao:** `CandidatoSlider` passou a validar `foto_url` com `safeHref` e a cair em placeholder com iniciais quando a URL falha | **Acao:** reducao da superficie de `src` arbitrario em imagens do slider | **Teste primario:** leitura de `src/components/CandidatoSlider.tsx` | **Teste cruzado:** `npm test` com `safeHref` + `npm run build` | **Evidencia:** `src/components/CandidatoSlider.tsx`, `tests/utils.test.ts` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `10.1` | **Status:** `fechado_com_patch` | **Validacao:** `src/data/mock.ts` deixou de ser importado no topo de `api.ts` e passou a ser carregado via `import()` condicional | **Acao:** remocao do bundle desnecessario de mock em deploys live | **Teste primario:** leitura de `src/lib/api.ts` | **Teste cruzado:** `npm run build` | **Evidencia:** `src/lib/api.ts` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `10.2 / 10.6 / 10.8 / 10.12` | **Status:** `fechado_com_patch` | **Validacao:** funcoes API nao usadas deixaram de ser exportadas, `slugify`/`fetchAllPages` sumiram do helper, `resolveCandidatoId` virou helper central e `situacao_candidatura` entrou no tipo `Candidato` | **Acao:** reducao de codigo morto e alinhamento entre query e tipagem | **Teste primario:** `rg` em `src/lib/api.ts` e `scripts/lib/helpers.ts` + `npm run check:scripts` | **Teste cruzado:** `npm run build` | **Evidencia:** `src/lib/api.ts`, `src/lib/types.ts`, `scripts/lib/helpers.ts`, `scripts/lib/enrich-instagram.ts`, `scripts/lib/ingest-camara.ts`, `scripts/lib/ingest-senado.ts`, `scripts/lib/ingest-tse.ts`, `scripts/lib/ingest-tse-situacao.ts`, `scripts/lib/ingest-wikidata.ts`, `scripts/lib/ingest-google-news.ts`, `scripts/lib/ingest-jarbas.ts`, `scripts/lib/ingest-ceaps-senado.ts`, `scripts/lib/ingest-filiacao.ts` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `10.4 / 10.5` | **Status:** `fechado_com_patch` | **Validacao:** `CLAUDE.md` e `AGENTS.md` foram revisitados e as referencias obsoletas apontadas na auditoria deixaram de aparecer | **Acao:** alinhamento da documentacao operacional com a arquitetura atual, env vars e helpers novos | **Teste primario:** leitura de `CLAUDE.md` e `AGENTS.md` | **Teste cruzado:** `rg` sem matches para os componentes/deps stale listados na auditoria | **Evidencia:** `CLAUDE.md`, `AGENTS.md` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `11.1` | **Status:** `fechado_com_patch` | **Validacao:** a rota estadual de governadores agora chama `getCandidatosComResumoResource("Governador", uf)` e `getCandidatosComparaveisResource("Governador", uf)` em vez de buscar todos os estados | **Acao:** remocao do over-fetching para filtragem local em JS | **Teste primario:** leitura de `src/app/governadores/[uf]/page.tsx` e `src/lib/api.ts` | **Teste cruzado:** `npm run build` com 27 rotas estaticas geradas | **Evidencia:** `src/app/governadores/[uf]/page.tsx`, `src/lib/api.ts` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `11.5 / 11.6` | **Status:** `fechado_com_patch` | **Validacao:** as rotas faltantes agora possuem `error.tsx` e/ou `loading.tsx` dedicados, reutilizando estados compartilhados | **Acao:** adicao de boundaries e skeletons de rota para `/comparar`, `/explorar`, `/governadores`, `/governadores/[uf]` e `/sobre` | **Teste primario:** inventario de arquivos em `src/app` | **Teste cruzado:** `npm run build` | **Evidencia:** `src/app/comparar/error.tsx`, `src/app/comparar/loading.tsx`, `src/app/explorar/error.tsx`, `src/app/explorar/loading.tsx`, `src/app/governadores/error.tsx`, `src/app/governadores/loading.tsx`, `src/app/governadores/[uf]/error.tsx`, `src/app/governadores/[uf]/loading.tsx`, `src/app/sobre/loading.tsx`, `src/components/RouteErrorState.tsx`, `src/components/RouteLoadingState.tsx` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `13.1` | **Status:** `fechado_com_patch` | **Validacao:** os controles de selecao do `ComparadorPanel` agora expõem `aria-pressed` nos modos mobile e desktop | **Acao:** semantica de toggle adicionada para leitores de tela | **Teste primario:** leitura de `src/components/ComparadorPanel.tsx` | **Teste cruzado:** `npm run build` | **Evidencia:** `src/components/ComparadorPanel.tsx` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `14.1` | **Status:** `fechado_com_patch` | **Validacao:** o App ID do Instagram saiu do hardcode e passou a depender de `INSTAGRAM_APP_ID` documentado no repo | **Acao:** externalizacao da configuracao e fallback com warning explicito quando ausente | **Teste primario:** leitura de `scripts/lib/enrich-instagram.ts` e `.env.example` | **Teste cruzado:** `npm run check:scripts` | **Evidencia:** `scripts/lib/enrich-instagram.ts`, `.env.example`, `CLAUDE.md`, `AGENTS.md` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `14.2 / 14.3 / 14.6 / 14.11` | **Status:** `fechado_com_patch` | **Validacao:** `fetchAllPages` foi removida, `ingest-senado` ganhou timeout por candidato, `parseBRL` passou a logar valor invalido e `fetchJSON` agora respeita `Retry-After` | **Acao:** endurecimento do pipeline contra truncamento silencioso, travamento e parse monetario opaco | **Teste primario:** leitura de `scripts/lib/helpers.ts`, `scripts/lib/ingest-senado.ts` e `scripts/lib/ingest-tse.ts` + `npm run check:scripts` | **Teste cruzado:** `npm run build` | **Evidencia:** `scripts/lib/helpers.ts`, `scripts/lib/ingest-senado.ts`, `scripts/lib/ingest-tse.ts` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `14.7 / 14.8` | **Status:** `fechado_com_patch` | **Validacao:** os titulos de Wikipedia migraram para `data/candidatos.json` e o workflow de ingest passou a separar melhor os schedules por job | **Acao:** retirada de acoplamento em codigo fonte para Wikipedia e reducao da condicao fragil no GitHub Actions | **Teste primario:** leitura de `data/candidatos.json`, `scripts/lib/enrich-wikipedia.ts` e `.github/workflows/ingest.yml` | **Teste cruzado:** `npm run check:scripts` | **Evidencia:** `data/candidatos.json`, `scripts/lib/enrich-wikipedia.ts`, `.github/workflows/ingest.yml` | **Atualizado em:** `2026-04-03 02:33:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

**Atualizacao complementar:** `2026-04-03 03:24:53 -03` | **Validacao complementar:** `npm run lint` (OK), `npm run check:scripts` (OK), `npm test` (OK), `npm run build` (OK; com `ConnectTimeoutError` externos durante prerender, sem regressao funcional), `npm audit --audit-level=low` (0 vulnerabilidades). [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `14.9` | **Status:** `pendente` | **Validacao:** curadoria refeita contra CSVs oficiais do TSE e API aberta do Senado; `renan-santos` foi revertido para vazio por falta de amarra forte e os demais preenchimentos foram limitados a matches por nome/UF/cargo ou recorrencia consistente | **Acao:** adicionados `tse_sq_candidato` para `tarcisio-gov-sp`, `mateus-simoes`, `gabriel-azevedo`, `pazolini`, `ciro-gomes-gov-ce`, `alysson-bezerra`, `mailza-assis`, `adriana-accorsi`, `jose-eliton`, `joao-henrique-catan`, alem de `senado=5557` para `mailza-assis`; residual caiu para 9 slugs ainda sem `tse_sq_candidato` | **Teste primario:** leitura dirigida de `data/candidatos.json` + consultas oficiais TSE/Senado | **Teste cruzado:** `npm run build` | **Evidencia:** `data/candidatos.json`, `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2018.zip`, `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip`, `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip`, `https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/56` | **Atualizado em:** `2026-04-03 03:24:53 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `14.12 / 14.13` | **Status:** `fechado_com_patch` | **Validacao:** workflow semanal do TSE ganhou cache persistente e o repo passou a incluir workflow dedicado para email de falha em `main` quando secrets SMTP estiverem configurados | **Acao:** `ingest.yml` agora usa `actions/cache@v4` em `data/tse` com `PF_KEEP_TSE_DOWNLOADS=1`, e `scripts/lib/ingest-tse.ts` preserva os ZIPs baixados; criado `notify-workflow-failure.yml` com envio para `contato.thiagosalvador@gmail.com` | **Teste primario:** leitura dos workflows e `npm run check:scripts` | **Teste cruzado:** `npm run build` | **Evidencia:** `.github/workflows/ingest.yml`, `.github/workflows/notify-workflow-failure.yml`, `scripts/lib/ingest-tse.ts` | **Atualizado em:** `2026-04-03 03:24:53 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

**Atualizacao complementar:** `2026-04-03 09:31:05 -03` | **Validacao complementar:** `npm run check:scripts` (OK), `npm run lint` (OK), `npm test` (OK), `npm run build` (OK; sem `Dynamic server usage` e sem chuva de `fetch failed` na rodada final). [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `9.5` | **Status:** `bloqueio_externo` | **Validacao:** o app deixou de depender do caminho publico `NEXT_PUBLIC_*` como fonte primaria do Supabase, as libs de dados passaram a ser `server-only` e as leituras publicas ganharam cache persistente e limitador de concorrencia; o bloqueio remanescente e a configuracao de rate limit na plataforma, nao no repo | **Acao:** `src/lib/supabase.ts` agora prefere `SUPABASE_URL` + `SUPABASE_ANON_KEY`, `src/lib/api.ts` foi cacheado com `unstable_cache`, `generateMetadata` da ficha passou a usar leitura leve e o build deixou de degradar as rotas estaticas para modo dinamico | **Teste primario:** `npm run build` com tabela final de rotas estaticas/SSG restaurada | **Teste cruzado:** `npm run check:scripts`, `npm run lint`, `npm test` | **Evidencia:** `src/lib/supabase.ts`, `src/lib/api.ts`, `src/app/candidato/[slug]/page.tsx`, `next.config.ts`, `.env.example`, `AGENTS.md`, `CLAUDE.md` | **Atualizado em:** `2026-04-03 09:31:05 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

**Atualizacao complementar:** `2026-04-03 09:38:32 -03` | **Validacao complementar:** provisionamento confirmado via Vercel CLI (`vercel env add`, `vercel env ls`) para `SUPABASE_URL` e `SUPABASE_ANON_KEY`; `PF_PREVIEW_TOKEN` ja estava presente em `Development`, `Preview` e `Production`. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `1.2 / 9.5` | **Status:** `bloqueio_externo` | **Validacao:** a Vercel agora contem `SUPABASE_URL` e `SUPABASE_ANON_KEY` em `Production`, `Development` e no `Preview` da branch `codex/total-audit-reliability-20260402`; o token de preview ja existia nas tres superficies. O bloqueio remanescente saiu de provisionamento e ficou restrito a redeploy, politica de rotacao do token e rate limiting na plataforma | **Acao:** novas variaveis server-side provisionadas via CLI, `NEXT_PUBLIC_*` mantidas por compatibilidade ate a rodada de corte e arquivos temporarios locais removidos apos o cadastro | **Teste primario:** `vercel env ls` | **Teste cruzado:** `vercel whoami`, leitura de `.vercel/project.json` | **Evidencia:** `.vercel/project.json`, saida confirmada de `vercel env ls` em `2026-04-03 09:38:32 -03` | **Atualizado em:** `2026-04-03 09:38:32 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

**Atualizacao complementar:** `2026-04-03 09:44:21 -03` | **Validacao complementar:** redeploy de `Production` concluido pela Vercel CLI com build remoto bem-sucedido, tabela final de rotas estaticas/SSG preservada e alias do dominio aplicado novamente ao deployment novo. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `1.2 / 9.5 / release-verify` | **Status:** `validado_em_producao` | **Validacao:** deployment `dpl_7tpNRKMFRsNZNX5pgzJc6rahkL2E` finalizou com `readyState=READY`, publicou `https://puxa-ficha-qgxz6c18j-thiagosalvador.vercel.app` e realiasou `https://puxaficha.com.br`; o build remoto manteve `/`, `/explorar`, `/comparar` e `/sitemap.xml` como estaticas com `revalidate 1h`, `/candidato/[slug]` e `/governadores/[uf]` como SSG e `/preview/candidato/[slug]` como dinamica | **Acao:** redeploy de producao via `vercel deploy --prod --yes` apos provisionar `SUPABASE_URL` e `SUPABASE_ANON_KEY` | **Teste primario:** saida final do deploy remoto | **Teste cruzado:** tabela de rotas impressa no build remoto | **Evidencia:** `https://vercel.com/thiagosalvador/puxa-ficha/7tpNRKMFRsNZNX5pgzJc6rahkL2E`, `https://puxa-ficha-qgxz6c18j-thiagosalvador.vercel.app`, `https://puxaficha.com.br` | **Atualizado em:** `2026-04-03 09:44:21 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

**Atualizacao complementar:** `2026-04-03 09:51:35 -03` | **Validacao complementar:** consolidacao manual do retorno do Perplexity em `search.md`, sem novos `SQ_CANDIDATO` elegiveis para escrita. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `14.9` | **Status:** `pendente` | **Validacao:** `search.md` confirmou que `rui-costa-pimenta`, `gilberto-kassab`, `paulo-hartung`, `orleans-brandao`, `andre-kamai`, `simao-jatene`, `ricardo-cappelli` e `natasha-slhessarenko` nao apresentam candidatura correspondente nas bases oficiais do TSE para 2018, 2020, 2022 e 2024; `renan-santos` permaneceu temporariamente ambiguo por colisao de nome de urna com pessoas diferentes em UFs/cargos distintos | **Acao:** nenhum `tse_sq_candidato` novo foi gravado em `data/candidatos.json`, porque os campos vazios desses 8 casos agora estao justificados por ausencia real nas janelas consultadas; o residual manual caiu provisoriamente para 1 slug inconclusivo | **Teste primario:** leitura de `search.md` | **Teste cruzado:** conferência dirigida de `data/candidatos.json` nos 9 slugs residuais | **Evidencia:** `search.md`, `data/candidatos.json` | **Atualizado em:** `2026-04-03 09:51:35 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

**Atualizacao complementar:** `2026-04-03 10:08:17 -03` | **Validacao complementar:** desambiguacao de `renan-santos` com nome civil completo informado pelo usuario e confirmado no cadastro partidario do TSE; checagem direta dos ZIPs `consulta_cand` 2018/2020/2022/2024 nao encontrou `RENAN ANTONIO FERREIRA DOS SANTOS`, apenas homonimos distintos. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `14.9` | **Status:** `pendente` | **Validacao:** `renan-santos` deixou de ser caso ambiguo para efeito de `tse_sq_candidato`, porque o nome civil exato `Renan Antonio Ferreira dos Santos` nao aparece nas bases oficiais de candidaturas do TSE em 2018, 2020, 2022 e 2024; os matches por `RENAN SANTOS` encontrados nesses arquivos pertencem a outras pessoas | **Acao:** `data/candidatos.json`, `scripts/lib/factual-assertions.ts` e `scripts/apply-current-factual-fixes.ts` foram alinhados para o nome civil completo; `tse_sq_candidato` permaneceu vazio por ausencia validada de candidatura anterior | **Teste primario:** leitura dos ZIPs `consulta_cand` 2018/2020/2022/2024 com busca pelo nome civil completo | **Teste cruzado:** `search.md`, `data/candidatos.json` | **Evidencia:** `https://www.tse.jus.br/partidos/partidos-registrados-no-tse/partido-missao`, `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2018.zip`, `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2020.zip`, `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip`, `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip` | **Atualizado em:** `2026-04-03 10:08:17 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

**Atualizacao complementar:** `2026-04-03 11:14:40 -03` | **Validacao complementar:** `npm run check:scripts` (OK), `npm run lint` (OK), `npm test` (OK), `npm run build` (OK), `gh secret list` com `SMTP_*` presentes, `vercel env ls` sem `NEXT_PUBLIC_SUPABASE_*` em `Production` nem no preview legado, leitura da configuracao ativa do Firewall por API e redeploy final de producao concluido com sucesso. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `1.2 / 14.12 / 14.13 / release-verify` | **Status:** `validado_em_producao` | **Validacao:** o workflow de email de falha agora esta operacional porque os cinco secrets SMTP foram provisionados no GitHub; a configuracao ativa do Firewall na Vercel confirmou a regra `rate-limit-preview` para `production` em `/preview/` com `window=60`, `limit=10` e chave `ip`; as envs legadas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` foram removidas de `Production` e do preview legado sem regressao de build/deploy | **Acao:** cadastro de `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_FROM` e `SMTP_PASSWORD` via `gh secret set`; limpeza das envs legadas via `vercel env rm`; leitura da config ativa via `vercel api /v1/security/firewall/config/active`; novo redeploy de `Production` via `vercel deploy --prod --yes` | **Teste primario:** `gh secret list`, `vercel env ls`, leitura da resposta da Firewall API e saida do deployment `dpl_GEq5fdGt8t9Zi5cN9hoH2pdBWSwq` | **Teste cruzado:** `npm run build` local e tabela final de rotas no build remoto | **Evidencia:** `.github/workflows/notify-workflow-failure.yml`, `.vercel/project.json`, `https://vercel.com/thiagosalvador/puxa-ficha/GEq5fdGt8t9Zi5cN9hoH2pdBWSwq`, `https://puxa-ficha-3knofs3p3-thiagosalvador.vercel.app`, `https://puxaficha.com.br` | **Atualizado em:** `2026-04-03 11:14:40 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `9.5` | **Status:** `fechado_com_patch` | **Validacao:** apos a remocao das envs `NEXT_PUBLIC_SUPABASE_*` da Vercel e o redeploy final de producao, o app deixou de expor ao browser qualquer caminho normal de acesso direto ao Supabase com `anon key`; o consumo de dados publicos permaneceu somente server-side e a borda de preview seguiu protegida por rate limit ativo na plataforma | **Acao:** consolidacao do caminho server-only com `SUPABASE_URL` + `SUPABASE_ANON_KEY`, limpeza das envs publicas legadas e validacao final em producao | **Teste primario:** `vercel env ls` + `npm run build` | **Teste cruzado:** build remoto do deployment `dpl_GEq5fdGt8t9Zi5cN9hoH2pdBWSwq` | **Evidencia:** `src/lib/supabase.ts`, `.vercel/project.json`, saida do `vercel env ls`, deployment `dpl_GEq5fdGt8t9Zi5cN9hoH2pdBWSwq` | **Atualizado em:** `2026-04-03 11:14:40 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- **ID:** `14.9` | **Status:** `fechado_por_verificacao` | **Validacao:** os 9 slugs sem `tse_sq_candidato` permaneceram vazios por ausencia validada de candidatura anterior nas janelas oficiais consultadas; nao restou caso ambiguo real depois da desambiguacao de `renan-santos` | **Acao:** mantido o campo vazio por decisao documental consistente, sem inventar `SQ_CANDIDATO` quando nao houve candidatura correspondente | **Teste primario:** leitura consolidada de `data/candidatos.json`, `search.md` e verificacoes TSE dirigidas | **Teste cruzado:** `npm run build` | **Evidencia:** `data/candidatos.json`, `search.md`, ZIPs oficiais `consulta_cand` do TSE 2018/2020/2022/2024 | **Atualizado em:** `2026-04-03 11:14:40 -03` [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## 18. Status consolidado apos remediacao

As secoes 15 e 16 registram a fotografia pre-remediacao. O status valido depois dos patches hoje e o desta secao.

### 18.1 Fechados

- `fechado_com_patch`: `1.1`, `1.3`, `1.5`, `2.2`, `3.1`, `3.3`, `3.4`, `4.2`, `9.1`, `9.2`, `9.3`, `9.4`, `9.6`, `10.1`, `10.2`, `10.4`, `10.5`, `10.6`, `10.8`, `10.12`, `11.1`, `11.5`, `11.6`, `11.7`, `12.1`, `12.2`, `12.3`, `13.1`, `14.1`, `14.2`, `14.3`, `14.4`, `14.5`, `14.6`, `14.7`, `14.8`, `14.11`, `14.12`, `14.13`
- `fechado_por_decisao`: `2.1` permanece escolha operacional valida do projeto; novos slugs ainda exigem deploy ou revalidacao explicita, conforme o modelo de ISR adotado

### 18.2 Pendencias reais apos reconciliacao

- `10.7 / 10.9 / 10.10 / 11.2 / 11.3` | **Status:** `pendente` | Ainda existe backlog legitimo de deduplicacao de helpers/scripts e refactor de performance do front; nao sao blockers para o hardening atual

### 18.3 Nota operacional

O build local agora passa de ponta a ponta com SSG/ISR restaurado para as rotas publicas, sem os erros anteriores de `Dynamic server usage` e sem a chuva de `fetch failed` na rodada final apos cache persistente + limitador de concorrencia no client do app. O workflow de alerta por email ja esta provisionado no GitHub, o preview em producao esta protegido por `PF_PREVIEW_TOKEN` e por rate limit ativo na Vercel, e a aplicacao foi reimplantada sem as envs legadas `NEXT_PUBLIC_SUPABASE_*`. O backlog que sobra e de manutencao/refactor, nao de bloqueio de publicacao.
