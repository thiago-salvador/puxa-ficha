/**
 * `ingest-tse` grava patrimônio e verificações de financiamento pela chave de
 * contexto TSE. Antes das migrations 20260915210000/20260915220000 o banco
 * respondia 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
 * specification") ou coluna inexistente, sem dizer o que falta. O ingest agora
 * falha cedo com a migration pendente nomeada.
 */

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  assertTseContextSchemaReady,
  pendingContextMigrationError,
} from "../scripts/lib/tse-context-schema"

type ProbeResult = { error: { code?: string; message: string } | null }

function fakeClient(responses: Record<string, ProbeResult>) {
  const calls: Array<{ table: string; columns: string }> = []
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          calls.push({ table, columns })
          return {
            limit: async () => responses[table] ?? { error: null },
          }
        },
      }
    },
  }
  return { client, calls }
}

test("42P10 no upsert de verificação vira migration 20260915210000 pendente", () => {
  const error = pendingContextMigrationError(
    { code: "42P10", message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" },
    "financiamento_verificacoes",
  )
  assert.ok(error instanceof Error)
  assert.match(error.message, /migration 20260915210000 pendente/)
  assert.match(error.message, /financiamento_verificacoes/)
  assert.match(error.message, /42P10/)
})

test("coluna ausente em patrimônio vira migration 20260915220000 pendente", () => {
  for (const code of ["42703", "PGRST204"]) {
    const error = pendingContextMigrationError({ code, message: "column ano_arquivo does not exist" }, "patrimonio")
    assert.match(error?.message ?? "", /migration 20260915220000 pendente/)
  }
})

test("erro de outra natureza não é reescrito", () => {
  assert.equal(pendingContextMigrationError({ code: "42501", message: "permission denied" }, "patrimonio"), null)
  assert.equal(pendingContextMigrationError(null, "patrimonio"), null)
})

test("preflight falha cedo e nomeia a migration pendente", async () => {
  const { client, calls } = fakeClient({
    financiamento_verificacoes: {
      error: { code: "42703", message: "column financiamento_verificacoes.cargo_candidatura does not exist" },
    },
  })
  await assert.rejects(
    () => assertTseContextSchemaReady(client, { patrimonio: true, financiamento: true }),
    /migration 20260915210000 pendente/,
  )
  assert.deepEqual(calls.map((call) => call.table), ["patrimonio", "patrimonio_ausencia_oficial", "financiamento_verificacoes"])
  assert.match(calls[0].columns, /ano_arquivo/)
  assert.match(calls[2].columns, /cargo_candidatura/)
})

test("preflight passa com schema migrado e só sonda o que vai gravar", async () => {
  const { client, calls } = fakeClient({})
  await assertTseContextSchemaReady(client, { patrimonio: false, financiamento: true })
  assert.deepEqual(calls.map((call) => call.table), ["financiamento_verificacoes"])
})

test("preflight não mascara falha operacional", async () => {
  const { client } = fakeClient({ patrimonio: { error: { code: "57014", message: "statement timeout" } } })
  await assert.rejects(
    () => assertTseContextSchemaReady(client, { patrimonio: true, financiamento: false }),
    (error: unknown) => (error as { code?: string }).code === "57014",
  )
})

test("ingest-tse usa o preflight e traduz o erro dos upserts por contexto", () => {
  const source = readFileSync("scripts/lib/ingest-tse.ts", "utf8")
  assert.match(source, /await assertTseContextSchemaReady\(supabase,/)
  const upserts = source.match(/\.upsert\(row, \{ onConflict: "candidato_id,ano_eleicao,sq_candidato,uf_candidatura" \}\)\s*\n\s*if \(verificationError\) throw [^\n]+/g) ?? []
  assert.equal(upserts.length, 3)
  for (const upsert of upserts) {
    assert.match(upsert, /pendingContextMigrationError\(verificationError, "financiamento_verificacoes"\) \?\? verificationError/)
  }
})
