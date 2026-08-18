import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, test } from "node:test"

const MIGRATION = "supabase/migrations/20260712003000_public_security_invoker_compatibility.sql"

describe("public security invoker compatibility", () => {
  test("grants only public candidate columns and keeps CPF private", async () => {
    const sql = await readFile(MIGRATION, "utf8")
    assert.match(sql, /GRANT SELECT \([\s\S]*slug[\s\S]*publicavel[\s\S]*\) ON TABLE public\.candidatos/i)
    assert.match(sql, /has_column_privilege\('anon', 'public\.candidatos', 'cpf', 'SELECT'\)/i)
    assert.doesNotMatch(sql, /GRANT SELECT ON TABLE public\.candidatos TO anon/i)
  })

  test("materializes sanitized donors without granting the raw JSON column", async () => {
    const sql = await readFile(MIGRATION, "utf8")
    assert.match(sql, /ADD COLUMN IF NOT EXISTS maiores_doadores_publicos jsonb/i)
    assert.match(sql, /CREATE TRIGGER sync_financiamento_doadores_publicos/i)
    assert.match(sql, /f\.maiores_doadores_publicos AS maiores_doadores/i)
    assert.match(sql, /has_column_privilege\('anon', 'public\.financiamento', 'maiores_doadores', 'SELECT'\)/i)
    assert.doesNotMatch(sql, /GRANT SELECT ON TABLE public\.financiamento TO anon/i)
  })

  test("revokes inherited PUBLIC DML and asserts the patrimonio postcondition", async () => {
    const sql = await readFile(MIGRATION, "utf8")
    assert.match(sql, /FROM PUBLIC, anon, authenticated/i)
    assert.match(sql, /has_table_privilege\('anon', 'public\.patrimonio', 'UPDATE'\)/i)
  })
})
