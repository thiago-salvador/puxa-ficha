import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

const migrationPath =
  "supabase/migrations/20260807054000_neutralizar_historico_judicial_sem_merito.sql"
const sql = readFileSync(migrationPath, "utf8")

describe("neutralização de histórico judicial sem mérito", () => {
  test("fecha o escopo nos dois registros públicos identificados", () => {
    assert.match(sql, /09d4c7d5-0ad0-4095-aace-1de0f389366b/)
    assert.match(sql, /b0c7e9ac-0e8a-4a4f-a91b-f43eaad66c42/)
    assert.match(sql, /@write tabela=pontos_atencao slug=lula/)
    assert.match(sql, /@write tabela=pontos_atencao slug=haddad-gov-sp/)
    assert.match(sql, /gravidade = 'baixa'/)
    assert.match(sql, /fora do contador de alertas graves/)
  })

  test("mantém os registros visíveis e exige exatamente as duas linhas", () => {
    assert.match(sql, /visivel = true/)
    assert.match(sql, /IF n <> 2 THEN/)
    assert.match(sql, /^BEGIN;/m)
    assert.match(sql, /^COMMIT;/m)
  })

  test("não altera a régua compartilhada nem casos ativos", () => {
    assert.doesNotMatch(sql, /UPDATE public\.processos/)
    assert.doesNotMatch(sql, /UPDATE public\.pontos_atencao[\s\S]+WHERE categoria/)
    assert.match(sql, /gravidade IS DISTINCT FROM 'baixa'/)
  })
})
