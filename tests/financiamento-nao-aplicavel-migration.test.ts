import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const MIGRATION = readFileSync(new URL("../supabase/migrations/20260915090000_financiamento_nao_aplicavel.sql", import.meta.url), "utf8")
const ROLLBACK = readFileSync(new URL("../supabase/rollback/20260915090000_financiamento_nao_aplicavel.rollback.sql", import.meta.url), "utf8")
const READBACK = readFileSync(new URL("../supabase/readback/20260915090000_financiamento_nao_aplicavel.readback.sql", import.meta.url), "utf8")
const RUNNER = readFileSync(new URL("../scripts/apply-financiamento-nao-aplicavel.ts", import.meta.url), "utf8")

test("nao aplicável exige prova rastreável e permanece fora da view pública", () => {
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS fonte_sha256 text/)
  assert.match(MIGRATION, /'nao_aplicavel'/)
  assert.match(MIGRATION, /financiamento_verificacoes_nao_aplicavel_check/)
  assert.match(MIGRATION, /fonte_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/)
  assert.match(MIGRATION, /CREATE OR REPLACE VIEW public\.financiamento_verificacoes_publico/)
  assert.doesNotMatch(MIGRATION.match(/CREATE OR REPLACE VIEW[\s\S]+?;/)?.[0] ?? "", /fonte_sha256/)
})

test("aplicador tem controles contra truncamento, pacote incompleto e rerun sem elegíveis", () => {
  assert.match(RUNNER, /\.order\(column, \{ ascending: true \}\)/)
  assert.match(RUNNER, /if \(\(page\.data \?\? \[\]\)\.length === 0\)/)
  assert.match(RUNNER, /sha256File\(artifact\) !== source\.sha256/)
  assert.match(RUNNER, /source\.cpf_header_present/)
  assert.match(RUNNER, /source\.national_rows_scanned <= 0/)
  assert.match(RUNNER, /evidence\.anchor\.anchored_sqs/)
  assert.doesNotMatch(RUNNER, /if \(eligible\.length === 0\) throw/)
})

test("rollback e readback são fail-closed", () => {
  assert.match(ROLLBACK, /nao_aplicavel/) 
  assert.match(ROLLBACK, /RAISE EXCEPTION/)
  assert.match(READBACK, /FINANCIAMENTO_NAO_APLICAVEL_READBACK_OK/)
  assert.match(READBACK, /fonte_sha256/)
})
