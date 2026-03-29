# Pipeline Automatizado de Dados Publicos — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pipeline TypeScript que puxa dados oficiais de candidatos de 4 fontes (TSE, Camara, Senado, Transparencia) e mantem Supabase atualizado via GitHub Actions.

**Architecture:** Orquestrador (`ingest-all.ts`) chama modulos por fonte. Cada modulo le `data/candidatos.json` pra saber quem processar, busca dados via REST/CSV, e faz upsert no Supabase. GitHub Actions roda diario (REST) e semanal (CSV).

**Tech Stack:** TypeScript (tsx), @supabase/supabase-js, csv-parse, node-fetch (built-in Node 18+), Zod (validacao), GitHub Actions

---

## Task 1: Infraestrutura compartilhada — types e helpers

**Files:**
- Create: `scripts/lib/types.ts`
- Create: `scripts/lib/supabase.ts`
- Create: `scripts/lib/helpers.ts`
- Create: `scripts/lib/logger.ts`

**Step 1: Criar `scripts/lib/types.ts`**

Types do pipeline (nao confundir com `src/lib/types.ts` do frontend):

```typescript
export interface CandidatoConfig {
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: "Presidente" | "Governador"
  estado?: string
  ids: {
    camara: number | null
    senado: number | null
    tse_sq_candidato: Record<string, string> // { "2022": "id", "2018": "id" }
  }
}

export interface IngestResult {
  source: string
  candidato: string
  tables_updated: string[]
  rows_upserted: number
  errors: string[]
  duration_ms: number
}
```

**Step 2: Criar `scripts/lib/supabase.ts`**

```typescript
import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

export const supabase = createClient(url, key)
```

**Step 3: Criar `scripts/lib/helpers.ts`**

```typescript
import type { CandidatoConfig } from "./types"
import { readFileSync } from "fs"
import { resolve } from "path"

export function loadCandidatos(): CandidatoConfig[] {
  const path = resolve(process.cwd(), "data/candidatos.json")
  return JSON.parse(readFileSync(path, "utf-8"))
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function fetchJSON<T>(url: string, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
      return (await res.json()) as T
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(1000 * (i + 1))
    }
  }
  throw new Error("unreachable")
}
```

**Step 4: Criar `scripts/lib/logger.ts`**

```typescript
export function log(source: string, msg: string) {
  console.log(`[${source}] ${msg}`)
}

export function warn(source: string, msg: string) {
  console.warn(`[${source}] ⚠ ${msg}`)
}

export function error(source: string, msg: string) {
  console.error(`[${source}] ✗ ${msg}`)
}
```

**Step 5: Commit**

```bash
git add scripts/lib/
git commit -m "feat(pipeline): add shared infrastructure — types, supabase client, helpers, logger"
```

---

## Task 2: Arquivo de candidatos curado — `data/candidatos.json`

**Files:**
- Create: `data/candidatos.json`

**Step 1: Criar o JSON com os 10 pre-candidatos a presidente**

IDs da Camara e Senado precisam ser buscados nas APIs:
- Camara: `GET https://dadosabertos.camara.leg.br/api/v2/deputados?nome=NOME&ordem=ASC&ordenarPor=nome`
- Senado: `GET https://legis.senado.leg.br/dadosabertos/senador/lista/atual`

Buscar os IDs reais de cada candidato que ja foi deputado ou senador. Preencher null pra quem nunca exerceu aquele cargo.

Os IDs do TSE (`tse_sq_candidato`) vem dos CSVs de candidatos por ano.

```json
[
  {
    "slug": "lula",
    "nome_completo": "Luiz Inacio Lula da Silva",
    "nome_urna": "Lula",
    "cargo_disputado": "Presidente",
    "ids": {
      "camara": null,
      "senado": null,
      "tse_sq_candidato": { "2022": "280001607037", "2018": "280001605378", "2006": "..." }
    }
  }
]
```

**Step 2: Buscar IDs reais de cada candidato nas APIs da Camara e Senado**

Rodar queries pra cada candidato:
```bash
# Exemplo: buscar ID de Flavio Bolsonaro na Camara
curl -s "https://dadosabertos.camara.leg.br/api/v2/deputados?nome=Flavio+Bolsonaro" | jq '.dados[0].id'
```

**Step 3: Popular o JSON com todos os 10 candidatos e seus IDs corretos**

**Step 4: Commit**

```bash
git add data/candidatos.json
git commit -m "feat(pipeline): add curated candidates list with API IDs"
```

---

## Task 3: Modulo de ingestao da Camara

**Files:**
- Create: `scripts/lib/ingest-camara.ts`

**Step 1: Implementar o modulo**

O modulo deve, pra cada candidato com `ids.camara` preenchido:

1. **Perfil:** `GET /deputados/{id}` → atualizar `candidatos` (foto, formacao, nascimento)
2. **Gastos CEAP:** `GET /deputados/{id}/despesas?ano=2023&itens=100` (paginar) → agregar por ano → upsert `gastos_parlamentares`
3. **Votacoes:** `GET /deputados/{id}/votacoes` → cruzar com `votacoes_chave` existentes → upsert `votos_candidato`
4. **Projetos de lei:** `GET /proposicoes?idDeputadoAutor={id}` → upsert `projetos_lei`

Pontos criticos:
- Paginacao: API retorna max 100 itens por pagina. Seguir `links.next`.
- Rate limit: `await sleep(300)` entre requests
- Resolver candidato_id: buscar UUID do Supabase pelo slug, nao usar slug direto
- Gastos: somar por ano e categoria, guardar top 10 gastos no `gastos_destaque`
- Anos de despesas: 2023, 2024, 2025, 2026

```typescript
import { supabase } from "./supabase"
import { loadCandidatos, fetchJSON, sleep } from "./helpers"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"

const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2"

export async function ingestCamara(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    if (!cand.ids.camara) continue
    const start = Date.now()
    const result: IngestResult = {
      source: "camara",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    // Resolve candidato UUID from Supabase
    const { data: dbCand } = await supabase
      .from("candidatos")
      .select("id")
      .eq("slug", cand.slug)
      .single()

    if (!dbCand) {
      result.errors.push("Candidato not found in DB")
      results.push(result)
      continue
    }

    const candidatoId = dbCand.id
    const idCamara = cand.ids.camara

    try {
      // 1. Profile
      await ingestPerfil(idCamara, candidatoId, cand.slug)
      result.tables_updated.push("candidatos")
      result.rows_upserted++

      // 2. Expenses (CEAP)
      const gastoRows = await ingestGastos(idCamara, candidatoId)
      result.tables_updated.push("gastos_parlamentares")
      result.rows_upserted += gastoRows

      // 3. Votes
      const votoRows = await ingestVotos(idCamara, candidatoId)
      result.tables_updated.push("votos_candidato")
      result.rows_upserted += votoRows

      // 4. Bills
      const projetoRows = await ingestProjetos(idCamara, candidatoId)
      result.tables_updated.push("projetos_lei")
      result.rows_upserted += projetoRows
    } catch (err) {
      result.errors.push(String(err))
    }

    result.duration_ms = Date.now() - start
    log("camara", `${cand.slug}: ${result.rows_upserted} rows, ${result.errors.length} errors`)
    results.push(result)
  }

  return results
}
```

Implementar cada subfuncao (ingestPerfil, ingestGastos, ingestVotos, ingestProjetos) com paginacao e upsert.

**Step 2: Testar com 1 candidato**

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/lib/ingest-camara.ts
```

**Step 3: Commit**

```bash
git add scripts/lib/ingest-camara.ts
git commit -m "feat(pipeline): add Camara ingestion module — profile, expenses, votes, bills"
```

---

## Task 4: Modulo de ingestao do Senado

**Files:**
- Create: `scripts/lib/ingest-senado.ts`

**Step 1: Implementar o modulo**

Para cada candidato com `ids.senado` preenchido:

1. **Perfil:** `GET /senador/{codigo}` → atualizar `candidatos`
2. **Mandatos:** `GET /senador/{codigo}/mandatos` → upsert `historico_politico`
3. **Votacoes:** `GET /senador/{codigo}/votacoes` → cruzar com `votacoes_chave` → upsert `votos_candidato`
4. **Autorias:** `GET /senador/{codigo}/autorias` → upsert `projetos_lei`

Base URL: `https://legis.senado.leg.br/dadosabertos/`

Pontos criticos:
- API do Senado retorna XML por default. Usar header `Accept: application/json`
- Formato de resposta diferente da Camara (nested objects: `DetalheParlamentar.Parlamentar`)
- Rate limit: `await sleep(500)` entre requests

**Step 2: Testar com 1 senador**

**Step 3: Commit**

```bash
git add scripts/lib/ingest-senado.ts
git commit -m "feat(pipeline): add Senado ingestion module — profile, mandates, votes, bills"
```

---

## Task 5: Modulo de ingestao do TSE (CSV)

**Files:**
- Create: `scripts/lib/ingest-tse.ts`
- Modify: `package.json` (add csv-parse dependency)

**Step 1: Instalar csv-parse**

```bash
npm install csv-parse
```

**Step 2: Implementar o modulo**

O TSE disponibiliza dados em CSVs compactados em ZIP. O fluxo:

1. Baixar ZIP de `https://dadosabertos.tse.jus.br/dataset/candidatos-{ano}`
2. Descompactar pra `data/tse/`
3. Parsear CSVs (Latin1, separador `;`)
4. Filtrar pelos candidatos em `candidatos.json` (match por nome normalizado)
5. Upsert: `patrimonio`, `financiamento`, `processos`

CSVs relevantes dentro do ZIP:
- `consulta_cand_{ano}_BRASIL.csv` — dados dos candidatos
- `bem_candidato_{ano}_BRASIL.csv` — bens declarados (patrimonio)
- `receitas_candidatos_{ano}_BRASIL.csv` — financiamento recebido
- `despesas_candidatos_{ano}_BRASIL.csv` — gastos de campanha

Pontos criticos:
- Encoding: Latin1 (ISO-8859-1), nao UTF-8
- Separador: `;` (nao `,`)
- Match de candidatos: nome no CSV e UPPERCASE sem acentos ("LUIZ INACIO LULA DA SILVA"). Normalizar pra comparar.
- Anos a processar: 2018, 2022 (2026 so disponivel apos agosto)
- Arquivos grandes: usar streaming (createReadStream + csv-parse pipeline)

```typescript
import { createReadStream } from "fs"
import { parse } from "csv-parse"
import { pipeline } from "stream/promises"
import { supabase } from "./supabase"
import { loadCandidatos } from "./helpers"
import { log } from "./logger"

export async function ingestTSE(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  const results: IngestResult[] = []
  const anos = [2018, 2022]

  for (const ano of anos) {
    // 1. Download ZIP if not cached
    await downloadTSEData(ano)

    // 2. Parse candidatos CSV
    await parseAndUpsertPatrimonio(ano, candidatos)
    await parseAndUpsertFinanciamento(ano, candidatos)
  }

  return results
}
```

Cada funcao de parse:
- Abre o CSV com `createReadStream` + `parse({ delimiter: ";", encoding: "latin1", columns: true })`
- Filtra rows que matcham os candidatos do JSON (por nome normalizado)
- Transforma pro schema do Supabase
- Faz upsert em batches de 50

**Step 3: Testar com dados de 2022**

Baixar manualmente o CSV de teste primeiro:
```bash
mkdir -p data/tse
# Download manual: https://dadosabertos.tse.jus.br/dataset/candidatos-2022
```

**Step 4: Commit**

```bash
git add scripts/lib/ingest-tse.ts package.json package-lock.json
git commit -m "feat(pipeline): add TSE CSV ingestion — patrimonio, financiamento from 2018/2022"
```

---

## Task 6: Modulo de ingestao do Portal da Transparencia

**Files:**
- Create: `scripts/lib/ingest-transparencia.ts`

**Step 1: Implementar o modulo**

API base: `https://api.portaldatransparencia.gov.br/api-de-dados/`
Requer header: `chave-api-dados: {TRANSPARENCIA_API_KEY}`

Endpoints uteis:
- `/viagens` — viagens a servico (por CPF ou nome)
- `/servidores` — servidores federais (pra verificar se candidato e servidor)

O modulo e complementar (dados extras), nao critico pro MVP. Implementar como opcional (pula se API key nao estiver definida).

**Step 2: Commit**

```bash
git add scripts/lib/ingest-transparencia.ts
git commit -m "feat(pipeline): add Portal da Transparencia ingestion (optional)"
```

---

## Task 7: Orquestrador — `ingest-all.ts`

**Files:**
- Create: `scripts/ingest-all.ts` (substituir o arquivo stub existente? Nao, o stub original fica em Templates/)
- Note: o `scripts/ingest-all.ts` e NOVO (os stubs antigos `ingest-camara.ts` e `ingest-tse.ts` na raiz de scripts/ serao substituidos)

**Step 1: Implementar o orquestrador**

```typescript
import { ingestCamara } from "./lib/ingest-camara"
import { ingestSenado } from "./lib/ingest-senado"
import { ingestTSE } from "./lib/ingest-tse"
import { ingestTransparencia } from "./lib/ingest-transparencia"
import { log } from "./lib/logger"
import type { IngestResult } from "./lib/types"

const args = process.argv.slice(2)
const sources = args.length > 0 ? args : ["camara", "senado", "tse", "transparencia"]

async function main() {
  log("pipeline", `Starting ingestion: ${sources.join(", ")}`)
  const allResults: IngestResult[] = []

  if (sources.includes("camara")) {
    log("pipeline", "--- Camara ---")
    allResults.push(...(await ingestCamara()))
  }

  if (sources.includes("senado")) {
    log("pipeline", "--- Senado ---")
    allResults.push(...(await ingestSenado()))
  }

  if (sources.includes("tse")) {
    log("pipeline", "--- TSE ---")
    allResults.push(...(await ingestTSE()))
  }

  if (sources.includes("transparencia")) {
    log("pipeline", "--- Transparencia ---")
    allResults.push(...(await ingestTransparencia()))
  }

  // Summary
  const totalRows = allResults.reduce((s, r) => s + r.rows_upserted, 0)
  const totalErrors = allResults.reduce((s, r) => s + r.errors.length, 0)
  log("pipeline", `Done: ${totalRows} rows upserted, ${totalErrors} errors`)

  if (totalErrors > 0) {
    for (const r of allResults.filter((r) => r.errors.length > 0)) {
      log("pipeline", `  ${r.source}/${r.candidato}: ${r.errors.join("; ")}`)
    }
    process.exit(1)
  }
}

main()
```

Usage:
```bash
# Tudo
npx tsx scripts/ingest-all.ts

# So Camara e Senado (rapido, REST)
npx tsx scripts/ingest-all.ts camara senado

# So TSE (lento, CSV download)
npx tsx scripts/ingest-all.ts tse
```

**Step 2: Remover stubs antigos**

Deletar `scripts/ingest-camara.ts` e `scripts/ingest-tse.ts` (os stubs quebrados). Os novos modulos vivem em `scripts/lib/`.

**Step 3: Commit**

```bash
git add scripts/ingest-all.ts scripts/lib/
git rm scripts/ingest-camara.ts scripts/ingest-tse.ts
git commit -m "feat(pipeline): add orchestrator, remove broken stubs"
```

---

## Task 8: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ingest.yml`

**Step 1: Criar o workflow**

```yaml
name: Ingestao de dados

on:
  schedule:
    # Diario 8h UTC (5h BRT) — REST APIs (Camara, Senado)
    - cron: "0 8 * * *"
  workflow_dispatch:
    inputs:
      sources:
        description: "Sources to ingest (comma-separated: camara,senado,tse,transparencia)"
        required: false
        default: "camara,senado"

jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - run: npm ci

      - name: Run ingestion
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TRANSPARENCIA_API_KEY: ${{ secrets.TRANSPARENCIA_API_KEY }}
        run: |
          SOURCES="${{ github.event.inputs.sources || 'camara,senado' }}"
          npx tsx scripts/ingest-all.ts ${SOURCES//,/ }

  # Semanal: TSE CSV (domingo 6h UTC)
  ingest-tse:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    if: github.event.schedule == '0 6 * * 0' || github.event_name == 'workflow_dispatch'

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - run: npm ci

      - name: Run TSE ingestion
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npx tsx scripts/ingest-all.ts tse
```

**Step 2: Adicionar segundo schedule pro TSE semanal**

Atualizar o `on.schedule` pra incluir ambos crons:
```yaml
on:
  schedule:
    - cron: "0 8 * * 1-6"  # Seg-Sab 8h UTC — REST
    - cron: "0 6 * * 0"     # Domingo 6h UTC — TSE CSV
```

**Step 3: Commit**

```bash
git add .github/workflows/ingest.yml
git commit -m "ci: add GitHub Actions workflow for automated data ingestion"
```

---

## Task 9: Atualizar CLAUDE.md e docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/arquitetura.md`

**Step 1: Atualizar CLAUDE.md**

Adicionar secao sobre o pipeline:
- Novos commands (`npx tsx scripts/ingest-all.ts [sources]`)
- Estrutura `scripts/lib/`
- Como adicionar um candidato (editar `data/candidatos.json`)
- GitHub Actions secrets necessarios

**Step 2: Commit**

```bash
git add CLAUDE.md docs/arquitetura.md
git commit -m "docs: update CLAUDE.md and architecture with pipeline documentation"
```

---

## Task 10: Teste end-to-end (requer Supabase)

**Prerequisito:** Supabase project criado, schema.sql executado, seed.sql executado

**Step 1: Configurar .env.local com credenciais reais do Supabase**

**Step 2: Rodar pipeline completo**

```bash
npx tsx scripts/ingest-all.ts camara senado
```

**Step 3: Verificar dados no Supabase dashboard**

- `gastos_parlamentares`: deve ter registros pra deputados
- `projetos_lei`: deve ter projetos pra deputados e senadores
- `votos_candidato`: deve ter votos (se votacoes_chave estiver populada)
- `historico_politico`: deve ter mandatos pra senadores

**Step 4: Commit final**

```bash
git add .
git commit -m "feat(pipeline): complete automated data ingestion pipeline"
git push
```

---

## Dependencias entre tasks

- Tasks 1-2: independentes, podem rodar em paralelo
- Tasks 3-6: dependem de Task 1 (shared infra) e Task 2 (candidatos.json). Tasks 3, 4, 5, 6 sao independentes entre si.
- Task 7: depende de Tasks 3-6 (importa os modulos)
- Task 8: depende de Task 7 (roda o orquestrador)
- Task 9: depende de Task 7
- Task 10: depende de tudo + Supabase configurado
