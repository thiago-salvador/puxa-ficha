import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260915210000_financiamento_verificacoes_contexto.sql"),
  "utf8",
)

test("verificações de financiamento usam chave de contexto e expõem cargo", () => {
  assert.match(sql, /UNIQUE NULLS NOT DISTINCT \(candidato_id, ano_eleicao, sq_candidato, uf_candidatura\)/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS cargo_candidatura text/)
  assert.match(sql, /sq_candidato IS NOT DISTINCT FROM NEW\.sq_candidato/)
  assert.match(sql, /uf_candidatura IS NOT DISTINCT FROM NEW\.uf_candidatura/)
  assert.match(sql, /DROP VIEW IF EXISTS public\.financiamento_verificacoes_publico/)
})
