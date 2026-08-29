import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test, { describe } from "node:test"

const ROOT = join(import.meta.dirname, "..")
const DDL = readFileSync(
  join(ROOT, "supabase", "migrations", "20260829100000_projetos_lei_chave_por_fonte.sql"),
  "utf8",
)
const BACKFILL = readFileSync(
  join(ROOT, "supabase", "migrations-pendentes", "20260829100100_backfill_projetos_lei_camara_ronaldo_caiado.sql"),
  "utf8",
)
const ROLLBACK = readFileSync(
  join(ROOT, "supabase", "rollback", "20260829100100_backfill_projetos_lei_camara_ronaldo_caiado.rollback.sql"),
  "utf8",
)

describe("identidade de proposição por fonte, issue #138", () => {
  test("o contrato de ingestão usa a chave composta nos dois órgãos", () => {
    for (const file of ["scripts/lib/ingest-camara.ts", "scripts/lib/ingest-senado.ts"]) {
      const source = readFileSync(join(ROOT, file), "utf8")
      assert.match(source, /onConflict:\s*["']candidato_id,fonte,proposicao_id_api["']/)
      assert.doesNotMatch(source, /onConflict:\s*["']candidato_id,proposicao_id_api["']/)
    }
  })

  test("a DDL troca a identidade sem apagar dados e reprova colisões antes da troca", () => {
    assert.match(DDL, /GROUP BY candidato_id, fonte, proposicao_id_api/i)
    assert.match(DDL, /HAVING count\(\*\) > 1/i)
    assert.match(DDL, /DROP CONSTRAINT IF EXISTS uq_projetos_lei_candidato_proposicao/i)
    assert.match(DDL, /CREATE UNIQUE INDEX IF NOT EXISTS uq_projetos_lei_candidato_fonte_proposicao/i)
    assert.doesNotMatch(DDL, /^\s*(INSERT|UPDATE|DELETE)\b/im)
  })

  test("o backfill é exatamente o caso cross-source, idempotente e sem update", () => {
    for (const id of ["123202", "123149", "123094", "121483"]) {
      assert.equal((BACKFILL.match(new RegExp(`ref=${id}`, "g")) ?? []).length, 1)
      assert.match(BACKFILL, new RegExp(`'Camara', '${id}'`))
      assert.match(BACKFILL, new RegExp(`fonte = 'Camara'.*proposicao_id_api = '${id}'`, "s"))
    }
    assert.match(BACKFILL, /ON CONFLICT \(candidato_id, fonte, proposicao_id_api\) DO NOTHING/gi)
    assert.doesNotMatch(BACKFILL, /ON CONFLICT[\s\S]*DO UPDATE/i)
    assert.match(BACKFILL, /esperado baseline de 1845 Camara/i)
    assert.match(BACKFILL, /camara_total <> 1849/i)
    assert.match(BACKFILL, /senado_total <> 4/i)
  })

  test("rollback exige payload marcado, protege Senado e só restaura a chave antiga sem colisões", () => {
    assert.match(ROLLBACK, /metadata->>'backfill_issue' = '138'/i)
    assert.match(ROLLBACK, /fonte = 'Camara'/i)
    assert.match(ROLLBACK, /fonte = 'Senado'/i)
    assert.match(ROLLBACK, /GROUP BY candidato_id, proposicao_id_api/i)
    assert.match(ROLLBACK, /DROP INDEX IF EXISTS public\.uq_projetos_lei_candidato_fonte_proposicao/i)
    assert.match(ROLLBACK, /ADD CONSTRAINT uq_projetos_lei_candidato_proposicao/i)
  })
})
