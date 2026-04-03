# Puxa Ficha 2026
## Arquitetura Técnica e Guia de Setup

---

## Stack

| Camada | Tecnologia | Custo |
|--------|-----------|-------|
| Frontend | Next.js 15 (App Router) | Grátis |
| Deploy | Vercel | Grátis (Hobby) / US$20/mês (Pro) |
| Banco de dados | Supabase (PostgreSQL) | Grátis (500MB, 50K MAU) |
| IA (análise/resumos) | Claude API (Sonnet 4.6) | ~US$3/M input, US$15/M output |
| IA (português) | Maritaca AI (Sabiá 4) | R$20 créditos grátis, depois pay-as-you-go |
| Cache | Upstash Redis (opcional) | Grátis (256MB) |
| Analytics | Vercel Analytics | Grátis (básico) |
| Domínio | Registro.br | ~R$40/ano |

**Custo total do MVP em dev:** R$ 0
**Custo em produção (10-50K usuários):** R$ 200-500/mês

---

## Estrutura do projeto

```
puxa-ficha/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── page.tsx                # Home: busca + lista de candidatos
│   │   ├── layout.tsx              # Layout global
│   │   ├── candidato/
│   │   │   └── [slug]/
│   │   │       └── page.tsx        # Ficha Corrida do candidato
│   │   ├── comparar/
│   │   │   └── page.tsx            # Comparador (selecionar 2-3)
│   │   ├── api/
│   │   │   ├── candidatos/
│   │   │   │   └── route.ts        # GET /api/candidatos
│   │   │   ├── candidato/
│   │   │   │   └── [slug]/
│   │   │   │       └── route.ts    # GET /api/candidato/:slug
│   │   │   └── comparar/
│   │   │       └── route.ts        # GET /api/comparar?ids=x,y,z
│   │   └── sobre/
│   │       └── page.tsx            # Sobre o projeto, metodologia
│   │
│   ├── components/
│   │   ├── FichaCorreda.tsx        # Perfil completo do candidato
│   │   ├── Comparador.tsx          # Side-by-side comparison
│   │   ├── PontosAtencao.tsx       # Cards de alertas
│   │   ├── HistoricoPartidos.tsx   # Timeline visual de partidos
│   │   ├── PatrimonioChart.tsx     # Evolução patrimonial
│   │   ├── VotacoesChave.tsx       # Grid de votações com posição
│   │   ├── FinanciamentoCard.tsx   # Quem financiou
│   │   ├── CandidatoCard.tsx       # Card resumo (pra listas)
│   │   ├── SearchBar.tsx           # Busca por nome
│   │   └── ui/                     # Componentes base (shadcn/ui)
│   │
│   ├── lib/
│   │   ├── supabase.ts             # Cliente Supabase
│   │   ├── types.ts                # TypeScript types
│   │   └── utils.ts                # Helpers
│   │
│   └── data/
│       └── votacoes-chave.ts       # Votações importantes (hardcoded inicialmente)
│
├── scripts/
│   ├── schema.sql                  # Schema do banco
│   ├── seed.sql                    # Dados iniciais
│   ├── ingest-tse.ts               # Script de ingestão TSE
│   ├── ingest-camara.ts            # Script de ingestão Câmara
│   └── ingest-senado.ts            # Script de ingestão Senado
│
├── docs/
│   ├── APIs-e-fontes.md            # Mapa de fontes de dados
│   └── metodologia.md              # Como funciona a análise
│
├── public/
│   └── fotos/                      # Fotos dos candidatos (fallback)
│
├── .env.local                      # Variáveis de ambiente
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Fluxo de dados

```
┌──────────────────────────────────────────────┐
│              FONTES DE DADOS                  │
├──────────┬──────────┬──────────┬─────────────┤
│  TSE API │ Câmara   │ Senado   │ Curadoria   │
│  (CSV)   │ API REST │ API REST │ (manual)    │
└────┬─────┴────┬─────┴────┬─────┴──────┬──────┘
     │          │          │            │
     ▼          ▼          ▼            ▼
┌──────────────────────────────────────────────┐
│         SCRIPTS DE INGESTÃO                   │
│   (TypeScript, executados via CLI/cron)       │
│                                               │
│  1. Baixa dados brutos                        │
│  2. Normaliza pro schema                      │
│  3. Identifica mudanças                       │
│  4. Gera "pontos de atenção" automáticos      │
│  5. Upsert no Supabase                        │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│            SUPABASE (PostgreSQL)               │
│                                               │
│  candidatos | historico | patrimonio           │
│  financiamento | votacoes | processos          │
│  pontos_atencao | gastos_parlamentares         │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│          NEXT.JS API ROUTES                    │
│                                               │
│  /api/candidatos      → Lista filtrada         │
│  /api/candidato/:slug → Ficha completa         │
│  /api/comparar?ids=   → Dados pra comparação   │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│              FRONTEND (React)                  │
│                                               │
│  Home → Busca + Grid de candidatos             │
│  /candidato/lula → Ficha Corrida               │
│  /comparar → Comparador side-by-side           │
└──────────────────────────────────────────────┘
```

---

## Variáveis de ambiente (.env.local)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# IA (opcional pro MVP, necessário pro chat futuro)
ANTHROPIC_API_KEY=sk-ant-...
MARITACA_API_KEY=...

# Portal da Transparência (opcional)
TRANSPARENCIA_API_KEY=...
```

---

## Setup com Claude Code

### Passo 1: Criar projeto Next.js
```bash
npx create-next-app@latest puxa-ficha --typescript --tailwind --eslint --app --src-dir
cd puxa-ficha
```

### Passo 2: Instalar dependências
```bash
npm install @supabase/supabase-js
npm install recharts            # gráficos (patrimônio, financiamento)
npm install lucide-react         # ícones
npm install date-fns             # formatação de datas
npm install clsx tailwind-merge  # utilitários CSS
```

### Passo 3: Configurar Supabase
1. Criar projeto em https://supabase.com/dashboard
2. Copiar URL e keys pro .env.local
3. Executar schema.sql no SQL Editor do Supabase
4. Executar seed.sql

### Passo 4: Rodar scripts de ingestão
```bash
npx tsx scripts/ingest-camara.ts    # puxa dados de deputados
npx tsx scripts/ingest-senado.ts    # puxa dados de senadores
npx tsx scripts/ingest-tse.ts       # puxa dados históricos do TSE
```

### Passo 5: Deploy
```bash
vercel
```

---

## Prioridades de desenvolvimento

### Sprint 1 (semana 1-2): Fundação
- [ ] Setup do projeto Next.js + Supabase
- [ ] Executar schema.sql
- [ ] Seed com 10 pré-candidatos a presidente
- [ ] Página de lista de candidatos
- [ ] Ficha Corrida básica (dados do seed)

### Sprint 2 (semana 3-4): Dados reais
- [ ] Script de ingestão da API da Câmara
- [ ] Script de ingestão da API do Senado
- [ ] Puxar dados de eleições anteriores do TSE (patrimônio, financiamento)
- [ ] Popular votações-chave com dados reais

### Sprint 3 (semana 5-6): Comparador + UI
- [ ] Comparador funcional
- [ ] Curadoria dos pontos de atenção (5-10 por candidato)
- [ ] Design final (responsivo, mobile-first)
- [ ] Página "Sobre" com metodologia

### Sprint 4 (semana 7-8): Polish + Launch
- [ ] Beta com 50-100 pessoas
- [ ] SEO (meta tags, OG images)
- [ ] Performance (ISR/SSG pra páginas de candidatos)
- [ ] Landing page + lista de espera
- [ ] Press kit
- [ ] Lançamento

---

## Decisões técnicas

### Por que SSG/ISR e não SSR?
Dados de candidatos mudam com pouca frequência (máximo 1x por dia durante campanha). Usar Incremental Static Regeneration (ISR) com revalidação a cada 1h dá performance excelente e custo zero de servidor.

```typescript
// Em candidato/[slug]/page.tsx
export const revalidate = 3600; // revalida a cada 1 hora
```

### Por que Supabase e não só um JSON estático?
- Pra 50 candidatos, um JSON estático funcionaria
- Mas quando expandir pra deputados (513+) e governadores (27 estados), precisa de queries
- Supabase dá full-text search, filtros e joins de graça
- Também prepara o terreno pro chat com IA (fase 2)

### Por que NÃO usar IA no MVP pra gerar análises?
- Risco de alucinação em dados sobre políticos = risco reputacional altíssimo
- Pra fase 1, toda análise editorial (pontos de atenção) é CURADORIA HUMANA
- IA entra na fase 2 pro chat, mas com RAG contra os dados verificados do banco
