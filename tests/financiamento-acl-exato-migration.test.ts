import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const FORWARD = new URL(
  "../supabase/migrations/20260810120500_financiamento_verificacoes_acl_exato.sql",
  import.meta.url,
)
const READBACK = new URL(
  "../supabase/readback/20260810120500_financiamento_verificacoes_acl_exato.readback.sql",
  import.meta.url,
)
const ROLLBACK = new URL(
  "../supabase/rollback/20260810120500_financiamento_verificacoes_acl_exato.rollback.sql",
  import.meta.url,
)

test("remediacao ACL preserva a migration aplicada e falha fechada por ordem", () => {
  const sql = readFileSync(FORWARD, "utf8")
  assert.match(sql, /version = '20260810120000'/)
  assert.match(sql, /version = '20260810120500'/)
  assert.match(sql, /version = '20260810121000'/)
  assert.match(sql, /to_regclass\('supabase_migrations\.schema_migrations'\) IS NULL/)
  assert.match(sql, /v_schema_replay AND v_acl_exato_invalidos <> 0/)
  assert.match(sql, /abs\(count\(\*\) - 18\)/)
  assert.match(sql, /abs\(count\(\*\) - 5\)/)
  assert.match(sql, /v_acl_excedente_invalidos <> 0 AND v_acl_exato_invalidos <> 0/)
  assert.match(sql, /v_rows <> 0/)
  assert.match(sql, /REVOKE ALL PRIVILEGES[\s\S]*service_role/)
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE/)
  assert.doesNotMatch(sql, /\bBEGIN\s*;/)
  assert.doesNotMatch(sql, /\bCOMMIT\s*;/)
})

test("readback exige ledger e o conjunto exato de cinco privilegios", () => {
  const sql = readFileSync(READBACK, "utf8")
  assert.match(sql, /version = '20260810120000'/)
  assert.match(sql, /version = '20260810120500'/)
  assert.match(sql, /abs\(count\(\*\) - 5\)/)
  assert.match(sql, /aclexplode\(a\.attacl\)/)
  assert.match(sql, /RAISE EXCEPTION/)
})

test("rollback recusa carga posterior e restaura somente o pre-estado medido", () => {
  const sql = readFileSync(ROLLBACK, "utf8")
  assert.match(sql, /version = '20260810121000'/)
  assert.match(sql, /v_rows <> 0/)
  assert.match(sql, /abs\(count\(\*\) - 5\)/)
  assert.match(sql, /abs\(count\(\*\) - 18\)/)
  assert.match(sql, /GRANT ALL PRIVILEGES ON public\.financiamento_verificacoes/)
  assert.match(sql, /DELETE FROM supabase_migrations\.schema_migrations/)
  assert.doesNotMatch(sql, /\bBEGIN\s*;/)
  assert.doesNotMatch(sql, /\bCOMMIT\s*;/)
})
