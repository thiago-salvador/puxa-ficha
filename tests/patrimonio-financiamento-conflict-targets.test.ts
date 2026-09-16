/**
 * Depois de 20260915210000 e 20260915220000, patrimônio, ausência oficial e
 * verificação de financiamento são únicos por contexto TSE. Todo gerador de SQL
 * que ainda mira `ON CONFLICT (candidato_id, ano_eleicao)` nessas tabelas falha
 * com 42P10 no banco migrado. `financiamento` mantém a chave antiga.
 */

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()

const EXPECTED_KEYS: Record<string, { key: string[]; migration: string; evidence: RegExp }> = {
  patrimonio: {
    key: ["candidato_id", "ano_eleicao", "sq_candidato"],
    migration: "20260915220000_patrimonio_contexto_eleitoral.sql",
    evidence: /uq_patrimonio_contexto_eleitoral\s+ON public\.patrimonio \(candidato_id, ano_eleicao, sq_candidato\)\s+NULLS NOT DISTINCT/,
  },
  patrimonio_ausencia_oficial: {
    key: ["candidato_id", "ano_eleicao", "sq_candidato"],
    migration: "20260915220000_patrimonio_contexto_eleitoral.sql",
    evidence: /patrimonio_ausencia_oficial_contexto_unique\s+UNIQUE NULLS NOT DISTINCT \(candidato_id, ano_eleicao, sq_candidato\)/,
  },
  financiamento_verificacoes: {
    key: ["candidato_id", "ano_eleicao", "sq_candidato", "uf_candidatura"],
    migration: "20260915210000_financiamento_verificacoes_contexto.sql",
    evidence: /financiamento_verificacoes_contexto_unique\s+UNIQUE NULLS NOT DISTINCT \(candidato_id, ano_eleicao, sq_candidato, uf_candidatura\)/,
  },
  financiamento: {
    key: ["candidato_id", "ano_eleicao"],
    migration: "20260710222500_sc_state_completion.sql",
    evidence: /uq_financiamento_candidato_ano_eleicao\s+ON public\.financiamento \(candidato_id, ano_eleicao\)/,
  },
}

const GENERATORS = [
  "scripts/lib/patrimonio-nacional-2026.ts",
  "scripts/gerar-backfill-patrimonio-onda-g-ac-2026.ts",
  "scripts/gerar-backfill-patrimonio-presidenciaveis-2026.ts",
  "scripts/audit/gerar-sql-financiamento-universo.ts",
  "scripts/generate-a2-money-migration.mjs",
]

interface Upsert {
  file: string
  table: string
  columns: string[]
  target: string[] | null
}

function upsertsIn(file: string): Upsert[] {
  const source = readFileSync(join(root, file), "utf8")
  const found: Upsert[] = []
  const pattern = /INSERT INTO public\.(\w+)(?:\s+AS\s+\w+)?\s*\(([^)]*)\)([\s\S]*?);/g
  for (const match of source.matchAll(pattern)) {
    const [, table, columns, rest] = match
    if (!(table in EXPECTED_KEYS)) continue
    const conflict = /ON CONFLICT(?:\s*\(([^)]*)\))?/.exec(rest)
    if (!conflict) continue
    found.push({
      file,
      table,
      columns: columns.split(",").map((column) => column.trim()).filter(Boolean),
      target: conflict[1]?.split(",").map((column) => column.trim()) ?? null,
    })
  }
  return found
}

test("as chaves esperadas são as das migrations do release", () => {
  for (const { migration, evidence } of Object.values(EXPECTED_KEYS)) {
    assert.match(readFileSync(join(root, "supabase/migrations", migration), "utf8"), evidence)
  }
})

test("geradores de SQL miram a chave única vigente e preenchem as colunas dela", () => {
  const upserts = GENERATORS.flatMap(upsertsIn)
  assert.ok(upserts.length >= 8, `varredura encontrou poucos upserts: ${upserts.length}`)
  const problems: string[] = []
  for (const upsert of upserts) {
    const expected = EXPECTED_KEYS[upsert.table].key
    if (upsert.target && upsert.target.join(",") !== expected.join(",")) {
      problems.push(`${upsert.file} ${upsert.table}: ON CONFLICT (${upsert.target.join(", ")}) != (${expected.join(", ")})`)
    }
    const missing = expected.filter((column) => !upsert.columns.includes(column))
    if (missing.length > 0) {
      problems.push(`${upsert.file} ${upsert.table}: INSERT sem ${missing.join(", ")}`)
    }
  }
  assert.deepEqual(problems, [])
})

test("upsert de patrimônio por contexto recusa legado sem SQ em vez de duplicar", () => {
  for (const file of GENERATORS) {
    const source = readFileSync(join(root, file), "utf8")
    if (!/INSERT INTO public\.patrimonio\b(?!_)/.test(source)) continue
    assert.ok(
      /sq_candidato IS NULL[\s\S]{0,400}RAISE EXCEPTION[^;]*legado sem SQ/.test(source),
      `${file}: falta guarda de linha legada sem SQ antes do upsert por contexto`,
    )
  }
})
