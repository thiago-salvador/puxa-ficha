import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const ROOT = process.cwd()
const MIGRATION = "20260816014600_gastos_executivo_schema.sql"
const MIGRATION_UG = "20260820010000_gastos_executivo_ug.sql"
const migrationPath = join(ROOT, "supabase/migrations", MIGRATION)
const migrationUgPath = join(ROOT, "supabase/migrations", MIGRATION_UG)

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

test("migration é schema puro e ordena após candidatos e seu gate público", () => {
  const source = sql()
  assert.doesNotMatch(source, /^\s*(?:INSERT|UPDATE|DELETE)\b/im)
  assert.equal(source.includes("@write"), false)

  for (const dependency of ["20260329000000_initial_schema.sql", "20260403113000_harden_child_rls_and_uniques.sql"]) {
    assert.ok(existsSync(join(ROOT, "supabase/migrations", dependency)), dependency)
    assert.ok(dependency.slice(0, 14) < MIGRATION.slice(0, 14), `${dependency} deve preceder a tabela de gastos`)
  }
})

function sqlUg(): string {
  assert.ok(existsSync(migrationUgPath), `${MIGRATION_UG} ainda não existe`)
  return readFileSync(migrationUgPath, "utf8")
}

test("migration de UG troca o grão para candidato, órgão, unidade gestora e mês", () => {
  const source = sqlUg()
  assert.match(source, /ALTER TABLE public\.gastos_executivo/i)
  for (const column of [
    "ug_codigo",
    "ug_nome",
    "qtd_portador_sigiloso",
    "qtd_portador_nominado",
    "qtd_portador_ausente",
    "qtd_estabelecimento_sigiloso",
    "qtd_estabelecimento_nominado",
    "qtd_estabelecimento_ausente",
  ]) {
    assert.match(source, new RegExp(`\\b${column}\\b`, "i"), `coluna ${column} ausente`)
  }
  assert.match(
    source,
    /DROP CONSTRAINT IF EXISTS gastos_executivo_candidato_orgao_mes_unique/i,
  )
  assert.match(
    source,
    /UNIQUE\s*\(\s*candidato_id\s*,\s*orgao_codigo\s*,\s*ug_codigo\s*,\s*mes_extrato\s*\)/i,
  )
  assert.match(source, /órgão|orgao público|não.*pessoa|nao.*pessoa/i)
  assert.match(source, /portal estadual|governador/i)
  assert.doesNotMatch(source, /^\s*(?:INSERT|UPDATE|DELETE)\b/im)
  assert.equal(source.includes("@write"), false)

  assert.ok(existsSync(migrationPath), "schema inicial de gastos ausente")
  assert.ok(MIGRATION.slice(0, 14) < MIGRATION_UG.slice(0, 14), "UG deve ordenar após a criação da tabela que altera")

  const rollback = readFileSync(
    join(ROOT, "supabase/rollback", "20260820010000_gastos_executivo_ug.rollback.sql"),
    "utf8",
  )
  assert.match(rollback, /DROP CONSTRAINT IF EXISTS gastos_executivo_candidato_orgao_ug_mes_unique/i)
  assert.match(rollback, /gastos_executivo_candidato_orgao_mes_unique/i)
})
