import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("PG17 CAS distinguishes SQL NULL from JSON null", () => {
  const sql = source("supabase/migrations/20260927095346_financiamento_publico_categorias_origem.sql")
  assert.equal((sql.match(/COALESCE\((?:maiores_doadores|categorias_origem)::text, 'sql-null:'\)/g) ?? []).length, 2)
})

test("FIN388 quarantine insert excludes generated hash columns", () => {
  const repair = source("scripts/fin388/04-aplicar-reparo.ts")
  assert.match(repair, /k !== "maiores_doadores_publicos" && k !== "maiores_doadores_hash" && k !== "categorias_origem_hash"/)
})

test("historical planners intersect expected assets with requested years", () => {
  for (const path of ["scripts/audit/plan-financiamento-historico-local.ts", "scripts/audit/plan-patrimonio-writers-local.ts"]) {
    assert.match(source(path), /requestedYears\.has\(Number\(year\)\)/, path)
  }
})

test("interrupted receipt persistence cannot mask a writer error", () => {
  for (const path of ["scripts/audit/apply-financiamento-historico-local.ts", "scripts/audit/apply-patrimonio-writers-local.ts"]) {
    const body = source(path)
    assert.match(body, /try\s*\{\s*persist\(resolve\(root,\s*`receipt-\$\{filePrefix\}-interrupted\.json`\)/, path)
    assert.match(body, /catch\s*\{\s*\/\*.*original.*\*\/\s*\}/i, path)
  }
})
