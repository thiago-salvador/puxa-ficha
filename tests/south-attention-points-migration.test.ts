import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

const migrationPath =
  "supabase/migrations/20260712210000_south_attention_points_tony_jorginho.sql"
const sql = readFileSync(migrationPath, "utf8")

describe("South approved attention points migration", () => {
  test("pins Tony Garcia and the exact historical conviction", () => {
    assert.match(sql, /f1cc2ea2-6559-46fa-9812-021abe76f306/)
    assert.match(sql, /Condenado por gestão fraudulenta no Consórcio Garibaldi/)
    assert.match(sql, /pena foi reduzida para seis anos de prestação de serviços comunitários/)
    assert.match(sql, /noticias\.stf\.jus\.br\/postsnoticias\/primeira-turma-do-stf-arquiva-habeas-corpus/)
    assert.match(sql, /www\.trf4\.jus\.br\/trf4\/controlador\.php/)
    assert.match(sql, /'2007-12-18'/)
  })

  test("pins Jorginho Mello and the confirmed TRE-SC sanction", () => {
    assert.match(sql, /d62ecbf0-98ab-41f9-8684-f3c7bd46251a/)
    assert.match(sql, /TRE-SC manteve multa por impulsionamento de propaganda negativa/)
    assert.match(sql, /multa de R\$ 7,5 mil/)
    assert.match(sql, /recurso do candidato foi conhecido e teve provimento negado/)
    assert.match(sql, /tre-sc\.jus\.br\/comunicacao\/noticias\/2022\/Setembro/)
    assert.match(sql, /'2022-09-14'/)
  })

  test("publishes only verified human curation", () => {
    assert.match(sql, /'media',[\s\S]*true,[\s\S]*'curadoria',[\s\S]*true/)
    assert.match(sql, /'baixa',[\s\S]*true,[\s\S]*'curadoria',[\s\S]*true/)
    assert.doesNotMatch(sql, /'ia'/)
    assert.doesNotMatch(sql, /'automatico'/)
  })

  test("is transactional, idempotent, and asserts both semantic rows", () => {
    assert.match(sql, /^BEGIN;/m)
    assert.equal((sql.match(/WHERE NOT EXISTS/g) ?? []).length, 2)
    assert.match(sql, /IF n_tony <> 1 THEN/)
    assert.match(sql, /IF n_jorginho <> 1 THEN/)
    assert.match(sql, /^COMMIT;/m)
  })
})
