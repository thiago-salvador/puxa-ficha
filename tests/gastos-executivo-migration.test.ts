import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const ROOT = process.cwd()
const MIGRATION = "20260816014600_gastos_executivo_schema.sql"
const migrationPath = join(ROOT, "supabase/migrations", MIGRATION)

function sql(): string {
  assert.ok(existsSync(migrationPath), `${MIGRATION} ainda não existe`)
  return readFileSync(migrationPath, "utf8")
}

test("migration cria a série mensal institucional com chave idempotente", () => {
  const source = sql()
  assert.match(source, /CREATE TABLE public\.gastos_executivo/i)
  for (const column of [
    "candidato_id",
    "orgao_codigo",
    "orgao_nome",
    "mes_extrato",
    "valor_total",
    "qtd_transacoes",
    "fonte",
    "coletado_em",
  ]) {
    assert.match(source, new RegExp(`\\b${column}\\b`, "i"), `coluna ${column} ausente`)
  }
  assert.match(
    source,
    /UNIQUE\s*\(\s*candidato_id\s*,\s*orgao_codigo\s*,\s*mes_extrato\s*\)/i,
  )
  assert.match(source, /EXTRACT\s*\(\s*DAY FROM mes_extrato\s*\)\s*=\s*1/i)
  assert.match(source, /valor_total\s*>=\s*0/i)
  assert.match(source, /qtd_transacoes\s*>=\s*0/i)
})

test("migration nasce com RLS pública limitada a candidato publicável", () => {
  const source = sql()
  assert.match(source, /ENABLE ROW LEVEL SECURITY/i)
  assert.match(source, /FORCE ROW LEVEL SECURITY/i)
  assert.match(source, /REVOKE ALL ON TABLE public\.gastos_executivo FROM PUBLIC/i)
  assert.match(source, /FOR SELECT[\s\S]*TO anon, authenticated[\s\S]*public\.is_public_candidate\(candidato_id\)/i)
  assert.match(source, /GRANT SELECT ON TABLE public\.gastos_executivo TO anon, authenticated/i)
})

test("migration é schema puro e está declarada na ordenação pública", () => {
  const source = sql()
  assert.doesNotMatch(source, /^\s*(?:INSERT|UPDATE|DELETE)\b/im)
  assert.equal(source.includes("@write"), false)

  const viewContract = readFileSync(
    join(ROOT, "tests/candidatos-publico-view-contrato.test.ts"),
    "utf8",
  )
  assert.ok(viewContract.includes(MIGRATION), "migration nova não entrou em POSTERIORES")
})
