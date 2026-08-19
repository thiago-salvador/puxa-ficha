import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260819140100_urls_consulta_djen.sql"),
  "utf8",
)

describe("backfill de URL do DJEN", () => {
  it("reescreve comunicaapi para o portal /consulta e não publica a API", () => {
    assert.match(sql, /@write tabela=processos ref=urls_consulta_djen_20260819 campos=url_fonte/)
    assert.match(sql, /url_fonte LIKE 'https:\/\/comunicaapi\.pje\.jus\.br\/%'/)
    assert.match(sql, /https:\/\/comunica\.pje\.jus\.br\/consulta\?numeroProcesso=/)
    assert.match(sql, /'urls_consulta_djen_20260819'::text IS NOT NULL/)
    assert.match(sql, /numeroProcesso=\\d\{20\}/)
    assert.doesNotMatch(sql, /\bslug\b/)
  })
})
