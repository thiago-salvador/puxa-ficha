import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { applyHistoricalActions, dryRunHistoricalActions, selectHistoricalActionBatch, writePrivateArtifact } from "../scripts/apply-historico-tse-plan"

const fields = ["cargo", "cargo_canonico", "tipo_evento", "periodo_inicio", "periodo_fim", "partido", "estado", "eleito_por", "observacoes"]
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}
function digest(rows: Record<string, unknown>[]) {
  const display = rows.map((row) => Object.fromEntries(fields.map((key) => [key, row[key] ?? null]))).sort((a, b) => stable(a).localeCompare(stable(b)))
  return createHash("sha256").update(stable(display)).digest("hex")
}

test("executor CAS-updates in batches, audits, and preserves non-TSE history", async () => {
  const tse = { id: "old", candidato_id: "candidate", cargo: "Deputado Federal", cargo_canonico: "Deputado Federal", tipo_evento: "candidatura", periodo_inicio: 2018, periodo_fim: 2018, partido: "ABC", estado: "SP", eleito_por: false, observacoes: "old", proveniencia: "tse" }
  const manual = { id: "manual", candidato_id: "candidate", cargo: "Prefeito", tipo_evento: "mandato", proveniencia: "manual" }
  let rows: Array<Record<string, unknown>> = [tse, manual]
  const audits: string[] = []
  const action = { tipo: "substituir_historico" as const, slug: "candidate", candidato_id: "00000000-0000-4000-8000-000000000001", antes_publico: [tse], antes_sha256: digest([tse]), classification: "a", source_complete: true, source_revisions: [{ year: 2018, sha256: "a".repeat(64) }], depois: [{ cargo: "Deputado Federal", cargo_canonico: "Deputado Federal", tipo_evento: "candidatura", periodo_inicio: 2018, periodo_fim: 2018, partido: "XYZ", estado: "SP", eleito_por: true, observacoes: "TSE", proveniencia: "tse" }] }
  const result = await applyHistoricalActions([action], {
    read: async () => rows,
    delete: async (oldRows, _candidateId, slug) => { audits.push(slug); const ids = oldRows.map((row) => String(row.id)); rows = rows.filter((row) => !ids.includes(String(row.id))); return ids },
    insert: async (incoming, slug) => { audits.push(slug); const added = incoming.map((row, index) => ({ ...row, id: `new-${index}` })); rows.push(...added); return added.map((row) => String(row.id)) },
  }, 1)
  assert.equal(result.applied, 1)
  assert.deepEqual(audits, ["candidate", "candidate"])
  assert.deepEqual(rows.filter((row) => row.proveniencia === "manual"), [manual])
})

test("executor rejects changed preimage and non-safe actions without writing", async () => {
  let writes = 0
  const action = { tipo: "substituir_historico" as const, slug: "candidate", candidato_id: "00000000-0000-4000-8000-000000000002", antes_publico: [], antes_sha256: "0".repeat(64), classification: "a", source_complete: true, source_revisions: [{ year: 2022, sha256: "a".repeat(64) }], depois: [{ cargo: "Deputado Federal", cargo_canonico: "Deputado Federal", tipo_evento: "candidatura", periodo_inicio: 2022, periodo_fim: 2022, partido: "XYZ", estado: "SP", eleito_por: true, observacoes: "TSE", proveniencia: "tse" }] }
  const port = { read: async () => [{ id: "new", tipo_evento: "candidatura", proveniencia: "tse" }], delete: async () => { writes++; return [] }, insert: async () => { writes++; return [] } }
  const result = await applyHistoricalActions([action, { ...action, slug: "review", classification: "b" }], port)
  assert.equal(result.applied, 0)
  assert.equal(writes, 0)
  assert.deepEqual(result.conflicts.map((item) => item.reason), ["preimagem_divergente", "ação_fora_da_classe_a"])
})

test("historical replacement requires a complete source and positive TSE rows", async () => {
  const empty = { tipo: "substituir_historico" as const, slug: "candidate", candidato_id: "00000000-0000-4000-8000-000000000004", antes_publico: [], antes_sha256: digest([]), classification: "a", source_complete: true, source_revisions: [{ year: 2022, sha256: "a".repeat(64) }], depois: [] }
  const port = { read: async () => [], delete: async () => [], insert: async () => [] }
  await assert.rejects(() => applyHistoricalActions([empty], port), /candidaturas oficiais positivas/)
  await assert.rejects(() => applyHistoricalActions([{ ...empty, source_complete: false, depois: [{ proveniencia: "tse", tipo_evento: "candidatura" }] }], port), /fonte oficial completa/)
})

test("executor reports 10-action batches and private backup/receipt artifacts are mode 0600", async () => {
  let audited = 0
  const actions = Array.from({ length: 11 }, (_, index) => ({ tipo: "substituir_historico" as const, slug: `candidate-${index}`, candidato_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, antes_publico: [], antes_sha256: digest([]), classification: "a", source_complete: true, source_revisions: [{ year: 2022, sha256: "a".repeat(64) }], depois: [{ cargo: "Deputado Federal", cargo_canonico: "Deputado Federal", tipo_evento: "candidatura", periodo_inicio: 2022, periodo_fim: 2022, partido: "XYZ", estado: "SP", eleito_por: true, observacoes: "TSE", proveniencia: "tse" }] }))
  const rowsByCandidate = new Map<string, Array<Record<string, unknown>>>()
  const result = await applyHistoricalActions(actions, {
    read: async (id) => rowsByCandidate.get(id) ?? [],
    delete: async (oldRows, id, slug) => { audited++; assert.match(slug, /^candidate-/); const ids = oldRows.map((row) => String(row.id)); rowsByCandidate.set(id, (rowsByCandidate.get(id) ?? []).filter((row) => !ids.includes(String(row.id)))); return ids },
    insert: async (incoming, slug) => { audited++; assert.match(slug, /^candidate-/); const id = actions.find((row) => row.slug === slug)?.candidato_id ?? ""; const added = incoming.map((row, index) => ({ ...row, id: `${slug}-${index}` })); rowsByCandidate.set(id, [...(rowsByCandidate.get(id) ?? []), ...added]); return added.map((row) => String(row.id)) },
  })
  assert.equal(result.applied, 11)
  assert.equal(result.batches, 2)
  assert.equal(audited, 11)

  const directory = mkdtempSync(join(tmpdir(), "historico-tse-plan-"))
  try {
    const backup = join(directory, "backup.json")
    writePrivateArtifact(backup, { rows: [] })
    assert.equal(statSync(backup).mode & 0o777, 0o600)
    assert.deepEqual(JSON.parse(readFileSync(backup, "utf8")), { rows: [] })
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test("full historical plans dry-run and apply deterministic bounded slices through the last batch", async () => {
  const actions = Array.from({ length: 145 }, (_, index) => ({ tipo: "substituir_historico" as const, slug: `candidate-${index}`, candidato_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, antes_publico: [], antes_sha256: digest([]), classification: "a", source_complete: true, source_revisions: [{ year: 2022, sha256: "a".repeat(64) }], depois: [{ cargo: "Deputado Federal", cargo_canonico: "Deputado Federal", tipo_evento: "candidatura", periodo_inicio: 2022, periodo_fim: 2022, partido: "XYZ", estado: "SP", eleito_por: true, observacoes: "TSE", proveniencia: "tse" }] }))
  assert.deepEqual(dryRunHistoricalActions(actions), { mode: "dry-run", actions: 145, actions_per_apply: 50, apply_runs: 3 })
  assert.deepEqual(selectHistoricalActionBatch(actions, 0).map((row) => row.slug), actions.slice(0, 50).map((row) => row.slug))
  assert.deepEqual(selectHistoricalActionBatch(actions, 2).map((row) => row.slug), actions.slice(100).map((row) => row.slug))
  assert.throws(() => selectHistoricalActionBatch(actions, 3), /fora do plano/)
  const rows = new Map<string, Array<Record<string, unknown>>>()
  const final = await applyHistoricalActions(actions, {
    read: async (id) => rows.get(id) ?? [],
    delete: async () => [],
    insert: async (incoming, slug) => {
      const id = actions.find((action) => action.slug === slug)!.candidato_id
      const inserted = incoming.map((row, index) => ({ ...row, id: `${slug}-${index}` }))
      rows.set(id, inserted)
      return inserted.map((row) => String(row.id))
    },
  }, 10, 2)
  assert.equal(final.applied, 45)
  assert.equal(final.batches, 5)
})

test("failed replacement restores its read preimage through an audited compensation", async () => {
  const old = { id: "old", candidato_id: "candidate", cargo: "Deputado Federal", cargo_canonico: "Deputado Federal", tipo_evento: "candidatura", periodo_inicio: 2018, periodo_fim: 2018, partido: "ABC", estado: "SP", eleito_por: "NÃO ELEITO", observacoes: "old", proveniencia: "tse" }
  let rows: Array<Record<string, unknown>> = [old]
  let insertCalls = 0
  const audits: string[] = []
  const action = { tipo: "substituir_historico" as const, slug: "candidate", candidato_id: "00000000-0000-4000-8000-000000000003", antes_publico: [old], antes_sha256: digest([old]), classification: "a", source_complete: true, source_revisions: [{ year: 2018, sha256: "a".repeat(64) }], depois: [{ ...old, candidato_id: undefined, periodo_inicio: 2018, periodo_fim: 2018, observacoes: "new" }] }
  await assert.rejects(() => applyHistoricalActions([action], {
    read: async () => rows,
    delete: async (oldRows, _candidateId, slug) => { audits.push(slug); const ids = oldRows.map((row) => String(row.id)); rows = rows.filter((row) => !ids.includes(String(row.id))); return ids },
    insert: async (incoming, slug) => {
      audits.push(slug)
      insertCalls++
      if (insertCalls === 1) throw new Error("synthetic insert failure")
      const restored = incoming.map((row) => ({ ...row, id: "restored" })); rows.push(...restored); return ["restored"]
    },
  }), /synthetic insert failure/)
  assert.deepEqual(audits, ["candidate", "candidate", "candidate:restaura"])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.periodo_inicio, 2018)
})

test("only reviewed package years are replaced; an earlier TSE candidacy survives", async () => {
  const id = "00000000-0000-4000-8000-000000000005"
  const older = { id: "older", candidato_id: id, proveniencia: "tse", tipo_evento: "candidatura", periodo_inicio: 2006, cargo: "Deputado Federal" }
  const covered = { id: "covered", candidato_id: id, proveniencia: "tse", tipo_evento: "candidatura", periodo_inicio: 2022, cargo: "Deputado Federal" }
  const desired = { ...covered, id: undefined, cargo: "Senador" }
  let rows: Record<string, unknown>[] = [older, covered]
  const action = { tipo: "substituir_historico" as const, slug: "candidate", candidato_id: id, antes_publico: [covered], antes_sha256: digest([covered]), classification: "a", source_complete: true, source_revisions: [{ year: 2022, sha256: "a".repeat(64) }], depois: [desired] }
  const result = await applyHistoricalActions([action], {
    read: async () => rows,
    delete: async (selected) => { const ids = selected.map((row) => String(row.id)); rows = rows.filter((row) => !ids.includes(String(row.id))); return ids },
    insert: async (incoming) => { rows.push(...incoming.map((row) => ({ ...row, id: "replacement" }))); return ["replacement"] },
  })
  assert.equal(result.applied, 1)
  assert.deepEqual(rows.find((row) => row.id === "older"), older)
})

test("historical writer rejects a destructive covered-year reduction", async () => {
  const first = { id: "a", proveniencia: "tse", tipo_evento: "candidatura", periodo_inicio: 2022 }
  const second = { ...first, id: "b" }
  const action = { tipo: "substituir_historico" as const, slug: "candidate", candidato_id: "00000000-0000-4000-8000-000000000006", antes_publico: [first, second], antes_sha256: digest([first, second]), classification: "a", source_complete: true, source_revisions: [{ year: 2022, sha256: "a".repeat(64) }], depois: [{ proveniencia: "tse", tipo_evento: "candidatura", periodo_inicio: 2022 }] }
  await assert.rejects(() => applyHistoricalActions([action], { read: async () => [], delete: async () => [], insert: async () => [] }), /limite de redução/)
})
