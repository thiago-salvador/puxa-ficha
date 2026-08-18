import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

const migrationPath =
  "supabase/migrations/20260712221000_southeast_attention_points_kalil_witzel.sql"
const sql = readFileSync(migrationPath, "utf8")

describe("Southeast approved attention points migration", () => {
  test("pins Alexandre Kalil and the exact TSE accounts decision", () => {
    assert.match(sql, /18d872c1-3e51-4856-9a93-2ca53b35d78f/)
    assert.match(sql, /Contas da campanha de 2016 desaprovadas pelo TSE/)
    assert.match(sql, /recursos de origem não identificada/)
    assert.match(sql, /tse\.jus\.br\/comunicacao\/noticias\/2022\/Fevereiro/)
    assert.match(sql, /'justica_eleitoral'/)
    assert.match(sql, /'2022-02-03'/)
  })

  test("pins Wilson Witzel and separates impeachment from current eligibility", () => {
    assert.match(sql, /85551bd4-860e-4abd-b9ed-463c1691e929/)
    assert.match(sql, /Mandato cassado por impeachment em 2021/)
    assert.match(sql, /crime de responsabilidade/)
    assert.match(sql, /não afirma impedimento eleitoral atual/)
    assert.match(sql, /tse\.jus\.br\/comunicacao\/noticias\/2022\/Setembro/)
    assert.match(sql, /stj\.jus\.br\/sites\/portalp\/Paginas\/Comunicacao\/Noticias\/30032022/)
    assert.match(sql, /'processo_grave'/)
    assert.match(sql, /'2021-04-30'/)
  })

  test("publishes only verified human curation", () => {
    assert.match(sql, /'media',[\s\S]*true,[\s\S]*'curadoria',[\s\S]*true/)
    assert.match(sql, /'alta',[\s\S]*true,[\s\S]*'curadoria',[\s\S]*true/)
    assert.doesNotMatch(sql, /'ia'/)
    assert.doesNotMatch(sql, /'automatico'/)
  })

  test("is transactional, idempotent, and asserts both semantic rows", () => {
    assert.match(sql, /^BEGIN;/m)
    assert.equal((sql.match(/WHERE NOT EXISTS/g) ?? []).length, 2)
    assert.match(sql, /IF n_kalil <> 1 THEN/)
    assert.match(sql, /IF n_witzel <> 1 THEN/)
    assert.match(sql, /^COMMIT;/m)
  })
})
