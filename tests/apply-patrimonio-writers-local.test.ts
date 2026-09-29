import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"
import { dryRunPatrimonioWriters, selectPatrimonioActionBatch } from "../scripts/audit/apply-patrimonio-writers-local"

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}

const action = {
  tipo: "substituir_patrimonio" as const,
  match_mode: "insert" as const,
  slug: "candidato-exemplo",
  candidato_id: "00000000-0000-4000-8000-000000000001",
  ano_eleicao: 2022,
  antes_publico: [],
  antes_sha256: "a".repeat(64),
  depois: { ano_eleicao: 2022, cargo_candidatura: "Deputado Estadual", tipo_eleicao: "ORDINÁRIA", valor_total: 12, bens: [] },
  serie: { ano: 2022, estado: "publicado" },
  fonte_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip",
  pacote_sha256: "b".repeat(64),
  pacote_bytes: 10,
  sq_candidato: "123456789012",
  uf_candidatura: "SP",
  source_complete: true,
}

test("validates pinned private plan in dry-run without credentials or writes", () => {
  const plan = { acoes: [action] }
  const sha = createHash("sha256").update(stable(plan)).digest("hex")
  assert.deepEqual(dryRunPatrimonioWriters(plan, sha), {
    dry_run: true, plan_sha256: sha, batches: 1, actions: 1, production_writes: 0,
  })
  assert.throws(() => dryRunPatrimonioWriters(plan, "0".repeat(64)), /hash esperado diverge/)
})

test("rejects non TSE source and incomplete pre-image proofs", () => {
  const invalid = { acoes: [{ ...action, fonte_url: "https://example.com/data.zip" }] }
  const sha = createHash("sha256").update(stable(invalid)).digest("hex")
  assert.throws(() => dryRunPatrimonioWriters(invalid, sha), /proveniência/)
})

test("rejects unique-year replacement without a stable row identity", () => {
  const invalid = { acoes: [{ ...action, match_mode: "unique_year_public" as const }] }
  const sha = createHash("sha256").update(stable(invalid)).digest("hex")
  assert.throws(() => dryRunPatrimonioWriters(invalid, sha), /regra de correspondência\/pre-image inválida/)
})

test("requires complete source proof and selects bounded deterministic apply slices", () => {
  const incomplete = { acoes: [{ ...action, source_complete: false }] }
  const sha = createHash("sha256").update(stable(incomplete)).digest("hex")
  assert.throws(() => dryRunPatrimonioWriters(incomplete, sha), /contexto completo/)
  const actions = Array.from({ length: 111 }, (_, index) => ({ ...action, slug: `candidate-${index}`, ano_eleicao: 1800 + index }))
  assert.deepEqual(selectPatrimonioActionBatch(actions, 0), actions.slice(0, 50))
  assert.deepEqual(selectPatrimonioActionBatch(actions, 2), actions.slice(100))
  assert.throws(() => selectPatrimonioActionBatch(actions, 3), /fora do plano/)
})

test("patrimony CAS uses a database hash rather than serializing bens in the request URL", () => {
  const writer = readFileSync(new URL("../scripts/audit/apply-patrimonio-writers-local.ts", import.meta.url), "utf8")
  const migration = readFileSync(new URL("../supabase/migrations/20260927095347_patrimonio_cas_hash.sql", import.meta.url), "utf8")
  assert.match(writer, /guarded\.eq\("bens_hash", before\.bens_hash\)/)
  assert.doesNotMatch(writer, /guarded\.eq\("bens",/)
  assert.match(migration, /GENERATED ALWAYS AS \(md5/)
})
