import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const FORWARD = new URL(
  "../supabase/migrations/20260810120600_financiamento_funcoes_acl_exato.sql",
  import.meta.url,
)
const READBACK = new URL(
  "../supabase/readback/20260810120600_financiamento_funcoes_acl_exato.readback.sql",
  import.meta.url,
)
const ROLLBACK = new URL(
  "../supabase/rollback/20260810120600_financiamento_funcoes_acl_exato.rollback.sql",
  import.meta.url,
)

test("remediacao das funcoes exige a ordem e o ACL automatico completo", () => {
  const sql = readFileSync(FORWARD, "utf8")
  for (const version of ["20260810120000", "20260810120500", "20260810120600", "20260810121000"]) {
    assert.match(sql, new RegExp(`version = '${version}'`))
  }
  assert.match(sql, /v_schema_replay AND v_acl_exato_invalidos <> 0/)
  assert.match(sql, /NOT v_schema_replay AND v_acl_automatico_invalidos <> 0/)
  assert.match(sql, /abs\(count\(\*\) - 5\)/)
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION[\s\S]*anon, authenticated, service_role/)
  assert.doesNotMatch(sql, /\bBEGIN\s*;/)
  assert.doesNotMatch(sql, /\bCOMMIT\s*;/)
})

test("readback exige ledger e somente PUBLIC mais owner nas duas funcoes", () => {
  const sql = readFileSync(READBACK, "utf8")
  assert.match(sql, /version = '20260810120600'/)
  assert.match(sql, /grantee NOT IN \(0::oid, proowner\)/)
  assert.match(sql, /abs\(count\(\*\) - 2\)/)
  assert.match(sql, /RAISE EXCEPTION/)
})

test("rollback recusa carga posterior e restaura exatamente os grants automaticos", () => {
  const sql = readFileSync(ROLLBACK, "utf8")
  assert.match(sql, /version = '20260810121000'/)
  assert.match(sql, /v_rows <> 0/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]*anon, authenticated, service_role/)
  assert.match(sql, /DELETE FROM supabase_migrations\.schema_migrations/)
  assert.doesNotMatch(sql, /\bBEGIN\s*;/)
  assert.doesNotMatch(sql, /\bCOMMIT\s*;/)
})
