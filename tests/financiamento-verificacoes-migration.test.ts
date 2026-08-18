import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const MIGRATION = new URL(
  "../supabase/migrations/20260810120000_financiamento_verificacoes_por_pleito.sql",
  import.meta.url,
)
const ROLLBACK = new URL(
  "../supabase/rollback/20260810120000_financiamento_verificacoes_por_pleito.rollback.sql",
  import.meta.url,
)

test("financiamento persiste desfecho por candidatura sem confundir erro com ausência", () => {
  const sql = readFileSync(MIGRATION, "utf8")
  assert.match(sql, /CREATE TABLE public\.financiamento_verificacoes/)
  assert.match(sql, /UNIQUE \(candidato_id, ano_eleicao\)/)
  assert.match(sql, /'ausencia_oficial', 'nao_coletado', 'erro'/)
  assert.match(sql, /resultado <> 'ausencia_oficial'/)
  assert.match(sql, /sq_candidato IS NOT NULL/)
  assert.match(sql, /uf_candidatura IS NOT NULL/)
  assert.match(sql, /fonte_url IS NOT NULL/)
  assert.match(sql, /verificado_em IS NOT NULL/)
  assert.match(sql, /CREATE OR REPLACE VIEW public\.financiamento_verificacoes_publico/)
  assert.match(sql, /financiamento_publicado_recusa_verificacao_trigger/)
  assert.match(sql, /financiamento_verificacao_recusa_publicado_trigger/)
  assert.match(sql, /ja possui verificacao sem dado publicado/)
  assert.match(sql, /ja possui dado publicado/)
  assert.equal((sql.match(/pg_advisory_xact_lock/g) ?? []).length, 2)
  assert.match(sql, /GRANT SELECT ON public\.financiamento_verificacoes_publico TO service_role/)
  assert.doesNotMatch(sql, /TO anon, authenticated/)
  assert.doesNotMatch(sql, /\bBEGIN\s*;/)
  assert.doesNotMatch(sql, /\bCOMMIT\s*;/)
})

test("rollback é fail-closed e remove somente objetos ainda vazios", () => {
  const sql = readFileSync(ROLLBACK, "utf8")
  assert.match(sql, /IF v_rows <> 0 THEN/)
  assert.match(sql, /RAISE EXCEPTION/)
  assert.match(sql, /DROP VIEW public\.financiamento_verificacoes_publico/)
  assert.match(sql, /DROP TABLE public\.financiamento_verificacoes/)
  assert.match(sql, /DROP TRIGGER financiamento_verificacao_recusa_publicado_trigger/)
  assert.match(sql, /DROP TRIGGER financiamento_publicado_recusa_verificacao_trigger/)
  assert.match(sql, /DROP FUNCTION public\.financiamento_verificacao_recusa_publicado/)
  assert.match(sql, /DROP CONSTRAINT IF EXISTS financiamento_uf_candidatura_check/)
  assert.match(sql, /DROP COLUMN IF EXISTS uf_candidatura/)
  assert.match(sql, /DROP COLUMN IF EXISTS sq_candidato/)
  assert.doesNotMatch(sql, /\bBEGIN\s*;/)
  assert.doesNotMatch(sql, /\bCOMMIT\s*;/)
})
