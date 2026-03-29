# CLAUDE.md — Puxa Ficha

Plataforma de consulta publica sobre candidatos das eleicoes brasileiras de 2026. Dois modos: Ficha Corrida (perfil completo) e Comparador (lado a lado). Tom editorial critico, perspectiva de classe, linguagem acessivel. Marca pessoal do Thiago Salvador.

Dominio: puxaficha.com.br (registrado)
Lancamento ideal: maio-julho 2026 (antes das convencoes partidarias)

## Commands

```bash
npm run dev          # Dev server com Turbopack (localhost:3000)
npm run build        # Build de producao
npm run start        # Serve build de producao
npm run lint         # ESLint

# Pipeline de dados (requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
npx tsx scripts/ingest-all.ts                    # Todas as fontes
npx tsx scripts/ingest-all.ts camara senado      # So REST APIs (rapido)
npx tsx scripts/ingest-all.ts tse                # So CSV do TSE (lento, baixa ZIPs)
npx tsx scripts/ingest-all.ts transparencia      # Portal da Transparencia (requer API key)
```

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

### Fontes → Tabelas
| Fonte | Tabelas populadas | Metodo | Frequencia |
|-------|-------------------|--------|------------|
| Camara | candidatos, gastos_parlamentares, votos_candidato, projetos_lei | REST | Diario |
| Senado | candidatos, historico_politico, votos_candidato, projetos_lei | REST | Diario |
| TSE | patrimonio, financiamento | CSV bulk | Semanal |
| Transparencia | dados complementares | REST | Semanal |

### GitHub Actions
Secrets necessarios: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRANSPARENCIA_API_KEY` (opcional)

## Stack

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Framework | Next.js (App Router) | 15.5.14 |
| Linguagem | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Componentes | shadcn/ui | latest |
| Database | Supabase (PostgreSQL) | — |
| Charts | recharts | 3.x |
| Icons | lucide-react | 1.x |
| Validation | Zod | 4.x |
| Deploy | Vercel | — |
| Package Manager | npm | — |

## Arquitetura

```
APIs publicas (TSE, Camara, Senado)
        |
        v
Scripts de ingestao (TypeScript, CLI)
        |
        v
Supabase (PostgreSQL, 11 tabelas)
        |
        v
Next.js API Routes / Server Components
        |
        v
Frontend (ISR, revalidate 1h)
```

## Estrutura do projeto

```
puxa-ficha/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Home
│   │   ├── layout.tsx               # Root layout (pt-BR)
│   │   ├── candidato/[slug]/page.tsx # Ficha Corrida (ISR 1h)
│   │   ├── comparar/page.tsx        # Comparador
│   │   └── sobre/page.tsx           # Sobre/Metodologia
│   ├── components/ui/               # shadcn/ui components
│   ├── lib/
│   │   ├── supabase.ts              # Supabase clients (browser + server)
│   │   ├── types.ts                 # TypeScript types (espelha schema)
│   │   └── utils.ts                 # cn(), formatBRL(), formatDate()
├── scripts/
│   ├── ingest-all.ts                # Orquestrador do pipeline
│   ├── schema.sql                   # Schema Supabase (11 tabelas, 2 views)
│   ├── seed.sql                     # Seed com 10 pre-candidatos
│   └── lib/
│       ├── types.ts                 # Types do pipeline (CandidatoConfig, IngestResult)
│       ├── supabase.ts              # Client service-role pra scripts
│       ├── helpers.ts               # loadCandidatos, fetchJSON, fetchAllPages
│       ├── logger.ts                # Log com timestamp
│       ├── ingest-camara.ts         # Camara REST: perfil, gastos, votos, projetos
│       ├── ingest-senado.ts         # Senado REST: perfil, mandatos, votos, autorias
│       ├── ingest-tse.ts            # TSE CSV: patrimonio, financiamento
│       └── ingest-transparencia.ts  # Portal da Transparencia (opcional)
├── data/
│   ├── candidatos.json              # Lista curada de candidatos com IDs das APIs
│   └── tse/                         # CSVs baixados (gitignored)
├── docs/
│   ├── arquitetura.md               # Blueprint tecnico
│   └── APIs-e-fontes.md             # Mapa de APIs publicas
├── data/tse/                        # CSVs baixados (gitignored)
├── public/fotos/                    # Fotos candidatos (fallback)
├── Templates/                       # Arquivos originais do Claude.ai (referencia, gitignored)
└── .env.example                     # Template de env vars
```

## Database (Supabase)

11 tabelas + 2 views:

| Tabela | O que guarda |
|--------|-------------|
| candidatos | Perfil basico, partido, cargo, status |
| historico_politico | Cargos anteriores, periodos |
| mudancas_partido | Timeline de trocas de partido |
| patrimonio | Bens declarados por eleicao |
| financiamento | Doacoes e fontes de financiamento |
| votacoes_chave | Votacoes importantes (Reforma Trabalhista, PEC do Teto, etc.) |
| votos_candidato | Voto de cada candidato em cada votacao |
| projetos_lei | Projetos de lei de autoria |
| processos | Processos judiciais (criminal, improbidade, eleitoral) |
| pontos_atencao | Alertas editoriais curados (contradicoes, suspeitas) |
| gastos_parlamentares | Gastos CEAP (Camara) |

Views: `v_ficha_candidato` (ficha completa), `v_comparador` (dados pra comparacao)

Schema completo: `scripts/schema.sql`

## Environment Variables

| Variavel | Required | Scope |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | Browser + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Browser + Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim (scripts) | Server only |
| `TRANSPARENCIA_API_KEY` | Nao | Server only |
| `ANTHROPIC_API_KEY` | Nao (fase 2) | Server only |

## Sprint Plan

### Sprint 0 (concluido): Setup
- [x] Scaffold Next.js 15 + Tailwind + shadcn/ui
- [x] Schema SQL + seed + types
- [x] Git + GitHub repo
- [x] CLAUDE.md

### Sprint 1: Fundacao
- [ ] Criar projeto Supabase + rodar schema.sql + seed.sql
- [ ] Componente CandidatoCard (card resumo)
- [ ] Pagina Home com lista de candidatos
- [ ] Ficha Corrida basica (dados do seed)

### Sprint 0.5 (concluido): Pipeline de dados
- [x] Infraestrutura compartilhada (types, helpers, supabase, logger)
- [x] Lista curada de candidatos com IDs reais (candidatos.json)
- [x] Modulo Camara (perfil, gastos, votos, projetos)
- [x] Modulo Senado (perfil, mandatos, votos, autorias)
- [x] Modulo TSE (patrimonio, financiamento via CSV)
- [x] Modulo Transparencia (opcional)
- [x] Orquestrador (ingest-all.ts)
- [x] GitHub Actions (cron diario + semanal)

### Sprint 2: Dados reais
- [ ] Criar projeto Supabase + rodar schema + seed
- [ ] Rodar pipeline completo pela primeira vez
- [ ] Popular votacoes-chave (curadoria editorial)
- [ ] Validar dados de patrimonio e financiamento

### Sprint 3: Comparador + UI
- [ ] Comparador funcional (2-3 candidatos)
- [ ] Curadoria pontos de atencao (5-10/candidato)
- [ ] Design responsivo mobile-first
- [ ] Pagina Sobre com metodologia

### Sprint 4: Polish + Launch
- [ ] Beta com 50-100 testadores
- [ ] SEO (meta tags, OG images dinamicas)
- [ ] Performance (ISR/SSG)
- [ ] Press kit + parceiros institucionais
- [ ] Deploy Vercel + dominio puxaficha.com.br
- [ ] Lancamento sincronizado com artigo CartaCapital

## Known Issues

**seed.sql:**
- Apenas 10 candidatos a presidente (sem governadores)
- Sem pontos_atencao, historico, dados financeiros ou votacoes

**Pipeline (requer Supabase configurado):**
- Primeira execucao precisa de seed.sql rodado antes (candidatos devem existir no banco)
- TSE CSV download pode ser lento (~100MB por ano)
- votacoes_chave precisa de curadoria manual antes dos votos serem cruzados

## Anti-Patterns

- **NAO usar SSR.** Dados mudam pouco. ISR com revalidate 1h.
- **NAO expor SUPABASE_SERVICE_ROLE_KEY** em Client Components. Usar apenas em Server Components e scripts.
- **NAO usar IA pra gerar analises editoriais** no MVP (fase 1). Risco reputacional de alucinacao sobre politicos. Curadoria humana.
- **NAO deletar Templates/.** Referencia dos arquivos originais.
- **NAO commitar .env.local.** Usar .env.example como template.
- **NAO editar `data/candidatos.json` sem verificar IDs nas APIs.** IDs errados = dados de outro politico.

## Code Style

- Funcoes, nao classes
- Early returns, nao nesting profundo
- TypeScript strict mode
- PascalCase para componentes, camelCase para funcoes/variaveis
- Conteudo em portugues (pt-BR), identificadores em ingles
- Sem em dashes ou en dashes em strings
