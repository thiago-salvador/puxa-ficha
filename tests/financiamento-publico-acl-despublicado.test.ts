import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const ROOT = process.cwd()
const VERSION = "20260812123000"

function ler(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
}

test("financiamento_publico preserva security_invoker e libera somente o filtro de quarentena", () => {
  const migration = ler(`supabase/migrations/${VERSION}_financiamento_publico_acl_despublicado.sql`)
  const readback = ler(`supabase/readback/${VERSION}_financiamento_publico_acl_despublicado.readback.sql`)
  const rollback = ler(`supabase/rollback/${VERSION}_financiamento_publico_acl_despublicado.rollback.sql`)

  assert.match(migration, /GRANT SELECT \(despublicado_em\) ON public\.financiamento TO anon, authenticated/i)
  assert.doesNotMatch(migration, /GRANT SELECT ON (TABLE )?public\.financiamento TO anon/i)
  assert.match(migration, /security_invoker/i)
  assert.match(migration, /has_column_privilege\('anon'.*despublicado_em.*SELECT/i)
  assert.match(migration, /has_table_privilege\('anon'.*financiamento.*SELECT/i)
  assert.match(migration, /20260811102000/)
  assert.match(migration, /20260811102100/)

  assert.match(readback, new RegExp(`version\\s*=\\s*'${VERSION}'`, "i"))
  assert.match(readback, /SET ROLE anon/i)
  assert.match(readback, /FROM public\.financiamento_publico/i)
  assert.match(readback, /information_schema\.column_privileges[\s\S]*column_name IN \('cpf_hash', 'cnpj_doador'\)/i)
  assert.doesNotMatch(readback, /has_column_privilege\([^)]*cpf_hash/i)
  assert.match(readback, /RESET ROLE/i)
  assert.match(readback, /RAISE EXCEPTION/i)

  assert.match(rollback, /REVOKE SELECT \(despublicado_em\) ON public\.financiamento FROM anon, authenticated/i)
  assert.match(rollback, new RegExp(`DELETE FROM supabase_migrations\\.schema_migrations[\\s\\S]*${VERSION}`, "i"))
  assert.match(rollback, /RAISE EXCEPTION/i)
})

test("prova PG17 cobre sucesso publico, segredo negado, drift e rollback", () => {
  const harness = ler("scripts/audit/provar-migration-financiamento-publico-acl-despublicado.sh")
  const aggregate = ler("scripts/audit/provar-release-pf-ajustes-pg17.sh")

  assert.match(harness, /SET ROLE anon/i)
  assert.match(harness, /financiamento_publico/i)
  assert.match(harness, /cpf_hash/i)
  assert.match(harness, /setup_db "\$db" nao nao/i)
  assert.match(harness, /local sensiveis="\$3"/i)
  assert.match(harness, /despublicado_em/i)
  assert.match(harness, /rollback/i)
  assert.match(harness, /adversarial/i)
  assert.match(aggregate, /provar-migration-financiamento-publico-acl-despublicado\.sh/)
})
