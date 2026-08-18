import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

const migrationPath =
  "supabase/migrations/20260712201000_cabo_daciolo_attention_point_ap927.sql"
const sql = readFileSync(migrationPath, "utf8")

describe("Cabo Daciolo AP 927 attention point migration", () => {
  test("pins the canonical candidate and exact procedural outcome", () => {
    assert.match(sql, /b1104f0b-80fb-4082-8356-dfb374e20028/)
    assert.match(sql, /Ação Penal 927/)
    assert.match(sql, /extinguiu a punibilidade/)
    assert.match(sql, /não foi condenação nem absolvição de mérito/)
  })

  test("uses the primary STF source and preserves the reference date", () => {
    assert.match(sql, /noticias\.stf\.jus\.br\/postsnoticias\/1a-turma-extingue-punibilidade/)
    assert.match(sql, /2017-12-12/)
    assert.match(sql, /'processo_grave'/)
    assert.match(sql, /'baixa'/)
  })

  test("publishes only verified human curation", () => {
    assert.match(sql, /'baixa',[\s\S]*true,[\s\S]*'curadoria',[\s\S]*true/)
    assert.doesNotMatch(sql, /'ia'/)
    assert.doesNotMatch(sql, /'automatico'/)
  })

  test("is transactional, idempotent, and asserts semantic uniqueness", () => {
    assert.match(sql, /^BEGIN;/m)
    assert.match(sql, /WHERE NOT EXISTS[\s\S]+candidato_id[\s\S]+categoria[\s\S]+titulo/)
    assert.match(sql, /IF n <> 1 THEN/)
    assert.match(sql, /^COMMIT;/m)
  })
})
