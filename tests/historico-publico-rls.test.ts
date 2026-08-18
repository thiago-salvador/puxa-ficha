import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const VERSION = "20260813040200"
const migration = readFileSync(
  `supabase/migrations/${VERSION}_harden_historico_politico_publico_rls.sql`,
  "utf8",
)
const rollback = readFileSync(
  `supabase/rollback/${VERSION}_harden_historico_politico_publico_rls.rollback.sql`,
  "utf8",
)
const readback = readFileSync(
  `supabase/readback/${VERSION}_harden_historico_politico_publico_rls.readback.sql`,
  "utf8",
)

test("historico em quarentena nao e legivel por anon ou authenticated", () => {
  assert.match(migration, /DROP POLICY IF EXISTS "Leitura pública" ON public\.historico_politico/)
  assert.match(
    migration,
    /USING\s*\(\s*public\.is_public_candidate\(candidato_id\)\s*AND\s*despublicado_em IS NULL\s*\)/i,
  )
})

test("rollback restaura a policy anterior sem apagar dados", () => {
  assert.match(
    rollback,
    /USING\s*\(\s*public\.is_public_candidate\(candidato_id\)\s*\)/i,
  )
  assert.doesNotMatch(rollback, /DELETE\s+FROM|DROP\s+TABLE/i)
})

test("readback prova policy unica e nenhum historico despublicado legivel", () => {
  assert.match(readback, /despublicado_em IS NOT NULL/i)
  assert.match(readback, /SET LOCAL ROLE anon/i)
  assert.match(readback, /SET LOCAL ROLE authenticated/i)
  assert.match(readback, /SET LOCAL ROLE service_role/i)
  assert.match(readback, /anon_visible <> 0 OR authenticated_visible <> 0/i)
  assert.match(readback, /service_role_visible <> quarantined_rows/i)
  assert.doesNotMatch(readback, /CREATE\s+TEMP/i)
})