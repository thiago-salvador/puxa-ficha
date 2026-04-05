# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Plataforma de consulta publica sobre candidatos das eleicoes brasileiras de 2026. Dois modos: Ficha Corrida (perfil completo) e Comparador (lado a lado). Tom editorial critico, perspectiva de classe, linguagem acessivel. Marca pessoal do Thiago Salvador.

Dominio: puxaficha.com.br (registrado)
Deploy: https://puxa-ficha.vercel.app
Repo: https://github.com/thiago-salvador/puxa-ficha

## Session Workflow

Regras estaveis ficam neste arquivo. Fluxo operacional de sessao, matriz de validacao por tipo de mudanca e fechamento ficam em `docs/dev-playbook.md`.

Antes de editar:

1. ler este arquivo e `docs/dev-playbook.md`
2. fazer uma passada em `git status --short`
3. classificar a mudanca: UI publica, data layer, schema/Supabase, auditoria/pipeline ou deploy

## Prioridade de entrega

Priorizar **resultado solido e confiavel** (correcao, seguranca, manutencao, acessibilidade, evidencia de verificacao) em detrimento de tempo de implementacao ou esforco, salvo quando o usuario fixar escopo ou prazo explicitamente. Atalhos que fragilizem producao ou auditoria exigem alinhamento explicito antes de serem escolhidos.

## Gemma

Para trabalho limitado, mecanico e de baixo risco, preferir Gemma conforme a regra global. Quando a tarefa for roteada para Gemma, a regra neste repo e:

1. subir/verificar com `/Users/thiagosalvador/Documents/Apps/Tools/gemma-ensure.sh`
2. esperar o retorno do Gemma antes de desistir ou cair para o modelo principal
3. so abandonar o fluxo se houver falha clara, timeout repetido ou output inutilizavel
4. validar manualmente a resposta antes de aplicar

Em tarefas complexas e caras em contexto, usar o fluxo:

1. Codex faz o enquadramento e o plano
2. Gemma executa a parte mecanica ou investigativa delimitada
3. Codex revisa e decide a acao final

## Commands

```bash
npm run dev          # Dev server com Turbopack (localhost:3000)
npm run build        # Build de producao (usa Turbopack)
npm run start        # Serve build de producao
npm run lint         # ESLint

# Pipeline de dados (requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
npx tsx scripts/ingest-all.ts                    # Todas as fontes
npx tsx scripts/ingest-all.ts camara senado      # So REST APIs (rapido)
npx tsx scripts/ingest-all.ts tse                # So CSV do TSE (lento, baixa ZIPs)
npx tsx scripts/ingest-all.ts transparencia      # Portal da Transparencia (requer API key)
```

## Stack

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Framework | Next.js (App Router) | 15.5.14 |
| Linguagem | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Componentes | shadcn/ui (base-ui) | latest |
| Database | Supabase (PostgreSQL) | - |
| Animation | GSAP | 3.x |
| Icons | lucide-react | 1.x |
| Deploy | Vercel | - |
| Package Manager | npm | - |

## Arquitetura

```
APIs publicas (TSE, Camara, Senado)
        |
        v
Scripts de ingestao (TypeScript, CLI)
        |
        v
Supabase (PostgreSQL, 14 tabelas)
        |
        v
src/lib/api.ts (data layer, mock fallback, degraded handling)
        |
        v
Server Components (ISR, revalidate 1h)
        |
        v
UI components (src/components/)
```

### Data layer (`src/lib/api.ts`)

Camada central de acesso a dados. Funciona em dois modos:

- **Supabase real**: quando `SUPABASE_URL` esta configurado e nao contem "placeholder" (ou, em modo legado, `NEXT_PUBLIC_SUPABASE_URL`)
- **Mock fallback**: quando Supabase nao esta configurado, usa `src/data/mock.ts` com dados estaticos

Todas as pages usam `api.ts`, nunca acessam Supabase diretamente. Funcoes principais: `getCandidatos()`, `getCandidatoBySlug(slug)`, `getCandidatosComResumo()`, `getCandidatosComparaveis()`.

As pages podem usar tambem as variantes `*Resource()` quando precisam distinguir entre dado live, mock ou degradado. Essas funcoes retornam `DataResource<T>` com:

- `data`
- `sourceStatus: "live" | "mock" | "degraded"`
- `sourceMessage` opcional

Isso permite renderizar avisos de origem dos dados e evitar `404` falso quando a fonte falha temporariamente.

### Metadata e hardening (`src/lib/metadata.ts`, `src/lib/json-ld.ts`)

Helpers centrais para metadata e serializacao segura:

- `buildTwitterMetadata()` padroniza card/site/creator
- `parseMetadataDate()` valida datas antes de expor `lastModified`
- `safeJsonLdStringify()` escapa caracteres que poderiam quebrar o contexto do `<script>`

### Front architecture (`src/components/`)

A pagina `/candidato/[slug]` e organizada por tabs. O container principal esta em `src/components/CandidatoProfile.tsx` e as secoes mais pesadas foram fatiadas em `src/components/CandidatoProfileSections.tsx`:

- **MoneyTabSection**: patrimonio, financiamento e gastos parlamentares
- **TrajectoryTabSection**: historico politico e mudancas de partido
- **LegislationTabSection**: projetos de lei e links de inteiro teor

Outros blocos principais do front:

- `Navbar.tsx`: menu mobile com GSAP, foco controlado, `aria-expanded`, `aria-controls` e respeito a `prefers-reduced-motion`
- `ComparadorPanel.tsx`: selecao e comparacao lado a lado com controles semanticos
- `CandidatoGrid.tsx`: busca, filtro por partido, quick search e virtualizacao condicional
- `CandidatoCard.tsx`: card editorial com imagem otimizada via `next/image`

### Font loading e metadata

O site carrega apenas duas fontes globais via `next/font/google` em `src/app/layout.tsx`:

- `Inter`
- `Anton`

Nao ha outras families remotas compondo a interface principal.

As paginas principais usam metadata route para OG image (`opengraph-image.tsx`) e JSON-LD server-side para melhorar compartilhamento e busca organica.

### ISR pattern

Todas as paginas com dados usam `export const revalidate = 3600` (ISR 1h). A Home e o Comparador tambem seguem esse padrao. O `generateStaticParams` na ficha gera rotas estaticas pra todos os candidatos ativos.

## Pipeline de dados

Automatizado via GitHub Actions (cron diario REST, semanal CSV) ou manual via CLI.

### Como funciona
1. Le `data/candidatos.json` (lista curada com IDs das APIs)
2. Pra cada candidato, busca dados nas 4 fontes
3. Faz upsert no Supabase (idempotente, pode rodar multiplas vezes)

### Como adicionar um candidato
Editar `data/candidatos.json`, adicionar entrada com slug e IDs:
- `ids.camara`: buscar em `https://dadosabertos.camara.leg.br/api/v2/deputados?nome=NOME`
- `ids.senado`: buscar em `https://legis.senado.leg.br/dadosabertos/senador/lista/atual`
- `ids.tse_sq_candidato`: extrair dos CSVs do TSE por ano

### Fontes e tabelas
| Fonte | Tabelas populadas | Metodo | Frequencia |
|-------|-------------------|--------|------------|
| Camara | candidatos, gastos_parlamentares, votos_candidato, projetos_lei | REST | Diario |
| Senado | candidatos, historico_politico, votos_candidato, projetos_lei | REST | Diario |
| TSE | patrimonio, financiamento | CSV bulk | Semanal |
| Transparencia | dados complementares | REST | Semanal |

### Hierarquia de fotos (foto_url)

Nenhum candidato pode ficar sem foto. Prioridade de fontes (quem sobrescreve quem):

1. **Wikipedia** (enrich-wikipedia.ts) — sempre sobrescreve. Fonte preferida.
2. **Fallback local** (`public/candidates/{slug}.jpg`, via FALLBACK_DATA) — so se Wikipedia nao tiver foto.
3. **Camara/Senado API** (ingest-camara.ts, ingest-senado.ts) — so se `foto_url` estiver vazio no banco.
4. **Wikidata** (ingest-wikidata.ts) — so se `foto_url` estiver vazio no banco.
5. **Placeholder gerado** (UI Avatars com iniciais) — ultima instancia, gerado automaticamente no enrich-wikipedia.

Regra: scripts da Camara/Senado NUNCA sobrescrevem foto existente. So o enrich-wikipedia tem permissao de sobrescrever.

### GitHub Actions
Secrets necessarios: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRANSPARENCIA_API_KEY` (opcional)

TSE ingest extrai apenas arquivos `*_BR*`/`*_BRASIL*` dos ZIPs (candidatos nacionais) e limpa CSVs/ZIPs apos cada etapa pra evitar acumulo de GBs.

## Database (Supabase)

14 tabelas + 2 views. Schema completo: `scripts/schema.sql`

| Tabela | O que guarda |
|--------|-------------|
| candidatos | Perfil basico, partido, cargo, status, biografia |
| historico_politico | Cargos anteriores, periodos |
| mudancas_partido | Timeline de trocas de partido |
| patrimonio | Bens declarados por eleicao |
| financiamento | Doacoes e fontes de financiamento |
| votacoes_chave | Votacoes importantes (Reforma Trabalhista, PEC do Teto, etc.) |
| votos_candidato | Voto de cada candidato em cada votacao |
| projetos_lei | Projetos de lei de autoria |
| processos | Processos judiciais (criminal, improbidade, eleitoral) |
| pontos_atencao | Alertas editoriais curados (contradicoes, suspeitas) |
| gastos_parlamentares | Gastos CEAP (Camara), 2019-2025 |
| sancoes_administrativas | Sancoes do CEIS/CNEP/TCU |
| indicadores_estaduais | IDH, seguranca, saude, educacao por UF |
| noticias_candidato | Noticias recentes via Google News RSS |

Views: `v_ficha_candidato` (ficha completa), `v_comparador` (dados pra comparacao)

Candidatos com `status: 'removido'` sao filtrados em todas as queries.

## Environment Variables

| Variavel | Required | Scope |
|----------|----------|-------|
| `SUPABASE_URL` | Sim | Server only |
| `SUPABASE_ANON_KEY` | Sim | Server only |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim (scripts) | Server only |
| `NEXT_PUBLIC_SUPABASE_URL` | Legado | Browser + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legado | Browser + Server |
| `PF_PREVIEW_TOKEN` | Sim (preview em producao) | Server only |
| `INSTAGRAM_APP_ID` | Nao | Server only |
| `NEXT_PUBLIC_X_HANDLE` | Nao | Browser + Server |
| `TRANSPARENCIA_API_KEY` | Nao | Server only |
| `ANTHROPIC_API_KEY` | Nao (fase 2) | Server only |

## Known Issues

- TSE CSV download pode ser lento (~100MB por ano, pico ~1.5GB durante run, 0 apos cleanup)
- votacoes_chave precisa de curadoria manual antes dos votos serem cruzados
- Gastos parlamentares so funcionam a partir de 2019 (API retorna 504 em anos anteriores)
- Ex-deputados sem dados na API da Camara (votos, gastos) por mandatos antigos
- pontos_atencao todos com `verificado: false` (aguardando revisao humana)

## Anti-Patterns

- **NAO usar SSR.** Dados mudam pouco. ISR com revalidate 1h.
- **NAO expor SUPABASE_SERVICE_ROLE_KEY** em Client Components. Usar apenas em Server Components e scripts.
- **NAO gerar pontos_atencao com `gerado_por: "curadoria"` se foi gerado por IA.** Usar `gerado_por: "ia"` e `verificado: false`. Curadoria e revisao humana.
- **NAO hardcodar nomes de partidos em textos de pontos_atencao.** Sempre buscar do campo `partido_sigla` da tabela `candidatos` para evitar inconsistencia.
- **NAO rodar pipeline APOS deploy sem forcar redeploy.** ISR gera paginas na hora do deploy. Se dados mudam depois, forcar empty commit ou usar revalidation API.
- **NAO tornar publico `pontos_atencao` com `gerado_por: "ia"` enquanto `verificado = false`.** Rascunho automatizado pode existir no banco ou preview interno, mas nao na superficie publica.
- **NAO publicar saida editorial gerada por IA como se fosse curadoria humana ou revisao final.** Se houver uso de IA em `pontos_atencao`, manter `gerado_por: "ia"`, fontes verificaveis, badge visivel na UI e trilha clara de revisao humana.
- **NAO usar IA para ranking, recomendacao de voto ou decisao editorial automatica.** A responsabilidade editorial final e humana.
- **NAO deletar Templates/.** Referencia dos arquivos originais.
- **NAO commitar .env.local.** Usar .env.example como template.
- **NAO editar `data/candidatos.json` sem verificar IDs nas APIs.** IDs errados = dados de outro politico.
- **NAO sobrescrever foto_url com fontes de menor prioridade.** Camara/Senado/Wikidata so setam se vazio. So Wikipedia pode sobrescrever. Ver "Hierarquia de fotos".

## React DevTools (agent-react-devtools)

Instalado como dev dependency. Conecta automaticamente ao daemon quando o dev server estiver rodando (`src/components/DevToolsInit.tsx` injeta o conector no `layout.tsx` apenas em `NODE_ENV=development`).

### Setup (uma vez por sessao)

```bash
# Terminal 1: dev server
npm run dev

# Terminal 2: daemon do devtools
agent-react-devtools start

# Verificar conexao (aguardar ~5s apos npm run dev)
agent-react-devtools status
```

### Comandos disponiveis

```bash
agent-react-devtools get tree                  # Component tree completo
agent-react-devtools get component @c1         # Inspecionar componente por ref
agent-react-devtools find CandidatoProfile     # Buscar componente por nome
agent-react-devtools errors                    # Componentes com warning/error
agent-react-devtools profile start             # Iniciar profiling de re-renders
agent-react-devtools profile stop              # Parar e ver resultados
agent-react-devtools profile slow              # Mostrar so componentes lentos
```

### Quando usar

- **Re-renders inesperados**: `profile start` > interagir > `profile slow`. Identifica qual componente esta re-renderizando mais que o necessario.
- **Props erradas em runtime**: `find <NomeComponente>` > `get component @ref` para ver props e state reais, nao o que o codigo sugere.
- **Bugs de estado**: inspecionar o state real de `CandidatoProfile`, `ComparadorPanel`, `CandidatoGrid` apos interacao.
- **Errors silenciosos**: `errors` revela components com warnings que nao aparecem no console do Next.js.
- **Debug de hydration**: ver quais componentes foram hidratados e com quais props no client.

### Nao usar para

- Scripts de ingestao (sao Node.js, nao React)
- Debugging de queries Supabase (usar logs do servidor ou Supabase dashboard)
- Build de producao (nao conecta, `NODE_ENV=production`)

## Code Style

- Funcoes, nao classes
- Early returns, nao nesting profundo
- TypeScript strict mode
- PascalCase para componentes, camelCase para funcoes/variaveis
- Conteudo em portugues (pt-BR), identificadores em ingles
- Sem em dashes ou en dashes em strings
