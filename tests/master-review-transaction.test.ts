import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { transactionBody } from "../scripts/audit/lib/master-review-transaction"
import { renderRemediationTransaction } from "../scripts/audit/apply-master-review-remediation"

test("driver conserva guardas do predecessor antes de chamar o compositor ou psql", () => {
  const previous = readFileSync("scripts/audit/apply-textos-julgamento-production.sh", "utf8")
  const driver = readFileSync("scripts/audit/apply-master-review-remediation-production.sh", "utf8")
  const start = previous.indexOf("set -euo pipefail")
  const end = previous.indexOf("\nversion=20260905150000")
  assert.ok(start >= 0 && end > start)
  const guard = previous.slice(start, end)
  assert.ok(driver.includes(guard), "guardas de main, SHA, projeto e libpq/TLS devem ser mantidas")
  assert.ok(driver.indexOf(guard) < driver.indexOf("node --import tsx scripts/audit/apply-master-review-remediation.ts"))
  assert.ok(driver.includes('mode="${1:-dry-run}"'))
})

test("extrai somente os wrappers externos e preserva BEGIN de PL/pgSQL", () => {
  const body = "DO $$ BEGIN PERFORM 'COMMIT;'; END $$;"
  assert.equal(transactionBody(`-- preamble\nBEGIN;\n${body}\nCOMMIT;`).trim(), body)
  assert.equal(transactionBody("BEGIN READ ONLY; SELECT 1; ROLLBACK;").trim(), "SELECT 1;")
})

test("compositor carrega os três artefatos e mantém dry-run sem COMMIT externo", () => {
  const sql = renderRemediationTransaction("dry-run", "a".repeat(40))
  assert.ok(sql.startsWith("BEGIN;"))
  assert.ok(sql.endsWith("ROLLBACK;\n"))
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /SET LOCAL standard_conforming_strings = on;/)
  assert.match(sql, /ledger or digest drift/)
  for (const version of ["20260905220000", "20260905220100", "20260905220200"]) assert.ok(sql.includes(version))
  assert.throws(() => renderRemediationTransaction("apply", "wrong"), /SHA/)
})

test("rejeita fronteiras de transação extras ou SQL fora do wrapper", () => {
  for (const source of ["BEGIN; SELECT 1; COMMIT; SELECT 2;", "BEGIN; COMMIT; BEGIN; SELECT 1; COMMIT;", "SELECT 1; BEGIN; SELECT 2; COMMIT;", "BEGIN; SAVEPOINT x; SELECT 1; COMMIT;", "BEGIN; SELECT 1;", "BEGIN; SELECT 'unterminated; COMMIT;"]) {
    assert.throws(() => transactionBody(source), /transaction/)
  }
})

test("ABORT não pode escapar da transação composta", () => {
  assert.throws(() => transactionBody("BEGIN; SELECT 1; ABORT; SELECT 2; COMMIT;"), /transaction/)
})

test("metacomandos psql são rejeitados fora de strings e blocos SQL", () => {
  assert.throws(() => transactionBody("BEGIN; SELECT 1; \\gexec\nSELECT 2; COMMIT;"), /transaction/)
  assert.ok(transactionBody("BEGIN; SELECT '\\gexec'; COMMIT;").includes("\\gexec"))
})

test("backslash comum não oculta ABORT e escape explícito E preserva o literal", () => {
  assert.throws(() => transactionBody(String.raw`BEGIN; SELECT '\'; ABORT; -- '
SELECT 2; COMMIT;`), /transaction/)
  assert.throws(() => transactionBody(String.raw`BEGIN; SELECT '\'; ABORT; SELECT '\'; COMMIT;`), /transaction/)
  assert.throws(() => transactionBody(String.raw`BEGIN; SELECT "\"; ABORT; SELECT "\"; COMMIT;`), /transaction/)
  const escaped = String.raw`SELECT E'\'; ABORT; SELECT \';';`
  assert.equal(transactionBody(`BEGIN; ${escaped} COMMIT;`).trim(), escaped)
})
