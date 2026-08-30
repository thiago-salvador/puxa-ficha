import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const ROOT = process.cwd()
const VERSION = "20260830143500"
const migration = readFileSync(join(ROOT, `supabase/migrations/${VERSION}_jhc_voto_artigo_17.sql`), "utf8")
const rollback = readFileSync(join(ROOT, `supabase/rollback/${VERSION}_jhc_voto_artigo_17.rollback.sql`), "utf8")
const forward = readFileSync(join(ROOT, `supabase/readback/${VERSION}_jhc_voto_artigo_17.readback.sql`), "utf8")
const backward = readFileSync(join(ROOT, `supabase/readback/${VERSION}_jhc_voto_artigo_17.rollback.readback.sql`), "utf8")

test("migration de JHC limita a escrita ao par auditado e preserva as demais linhas", () => {
  assert.match(migration, /candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid/)
  assert.match(migration, /votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid/)
  assert.match(migration, /AND voto = 'ausente'/)
  assert.match(migration, /SET voto = 'artigo_17'/)
  assert.match(migration, /jhc_artigo_17_snapshot/)
  assert.match(migration, /other_digest IS DISTINCT FROM before_digest/)
  assert.match(migration, /created_at divergente/)
  assert.equal((migration.match(/UPDATE public\.votos_candidato/g) ?? []).length, 1)
})

test("forward, rollback, ledger e receipts formam um par fechado", () => {
  assert.match(rollback, /SET voto = 'ausente'/)
  assert.equal((rollback.match(/UPDATE public\.votos_candidato/g) ?? []).length, 1)
  assert.match(forward, /version = '20260830143500'/)
  assert.match(forward, /execucao = 'migration:20260830143500'/)
  assert.match(backward, /execucao = 'rollback:20260830143500'/)
  assert.match(backward, /ledger_count <> 0/)
  assert.doesNotMatch(rollback, /DELETE FROM public\.coleta_log/)
})
