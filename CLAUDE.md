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
npx tsx scripts/ingest-camara.ts   # Ingestao API Camara (WIP)
npx tsx scripts/ingest-tse.ts      # Ingestao dados TSE (WIP)
```

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
│   ├── schema.sql                   # Schema Supabase (11 tabelas, 2 views)
│   ├── seed.sql                     # Seed com 10 pre-candidatos
│   ├── ingest-camara.ts             # Ingestao API Camara (WIP)
│   └── ingest-tse.ts                # Ingestao dados TSE (WIP)
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

### Sprint 2: Dados reais
- [ ] Corrigir e completar ingest-camara.ts
- [ ] Criar ingest-senado.ts
- [ ] Corrigir e completar ingest-tse.ts
- [ ] Popular votacoes-chave com dados reais
- [ ] Popular dados financeiros e patrimoniais

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

## Known Issues (Templates)

Os scripts de ingestao em `scripts/` sao rascunhos do Claude.ai com bugs conhecidos. NAO rodar sem corrigir:

**ingest-camara.ts:**
- `DEPUTADOS_ALVO` esta vazio (script nao faz nada)
- `candidato_id` usa slug em vez de UUID (vai falhar no INSERT)
- Votacoes sao buscadas mas nunca salvas no banco
- Usa `any` extensivamente

**ingest-tse.ts:**
- TODO o codigo de processamento CSV esta comentado
- `baixarCSV()` e um stub (nao baixa nada)
- `candidato_id` usa slug em vez de UUID
- `NOME_PARA_SLUG` hardcoded, nao escalavel

**seed.sql:**
- Apenas 10 candidatos a presidente (sem governadores)
- Sem pontos_atencao, historico, dados financeiros ou votacoes

## Anti-Patterns

- **NAO usar SSR.** Dados mudam pouco. ISR com revalidate 1h.
- **NAO expor SUPABASE_SERVICE_ROLE_KEY** em Client Components. Usar apenas em Server Components e scripts.
- **NAO usar IA pra gerar analises editoriais** no MVP (fase 1). Risco reputacional de alucinacao sobre politicos. Curadoria humana.
- **NAO rodar scripts de ingestao** sem corrigir os bugs documentados acima.
- **NAO deletar Templates/.** Referencia dos arquivos originais.
- **NAO commitar .env.local.** Usar .env.example como template.

## Code Style

- Funcoes, nao classes
- Early returns, nao nesting profundo
- TypeScript strict mode
- PascalCase para componentes, camelCase para funcoes/variaveis
- Conteudo em portugues (pt-BR), identificadores em ingles
- Sem em dashes ou en dashes em strings
