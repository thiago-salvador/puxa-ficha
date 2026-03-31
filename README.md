# Puxa Ficha

Plataforma de consulta publica sobre candidatos das eleicoes brasileiras de 2026. Ficha completa, comparador lado a lado e pontos de atencao.

**Deploy:** https://puxaficha.com.br

## Stack

- Next.js 15 (App Router, ISR)
- TypeScript
- Tailwind CSS 4
- shadcn/ui
- Supabase (PostgreSQL)

## Desenvolvimento

```bash
npm install
npm run dev     # localhost:3000
npm run build   # build de producao
npm run lint    # ESLint
```

## Pipeline de dados

Scripts de ingestao em `scripts/lib/` coletam dados de APIs publicas (TSE, Camara, Senado, Portal da Transparencia) e persistem no Supabase.

```bash
npx tsx scripts/ingest-all.ts camara senado   # REST APIs
npx tsx scripts/ingest-all.ts tse             # CSV do TSE
```

## Licenca

Dados publicos (Lei de Acesso a Informacao). Codigo sob avaliacao de licenca.
