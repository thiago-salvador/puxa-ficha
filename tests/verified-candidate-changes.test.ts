import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { observeVerifiedCandidateChange, type VerifiedChangeObservation, type VerifiedChangeRpc } from "../scripts/lib/verified-candidate-changes"

const observation: VerifiedChangeObservation = {
  candidateId: "00000000-0000-4000-8000-000000000001", field: "patrimonio", year: 2022,
  value: "125.5", sq: "123456", uf: "SP", identityVerified: true,
  sourceUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip",
}

test("verified observation confirms persistence and sends scoped official provenance", async () => {
  const order: string[] = []
  const rpc: VerifiedChangeRpc = async (name, args) => {
    order.push("rpc")
    assert.equal(name, "observe_verified_candidate_change")
    assert.deepEqual(args, {
      p_candidate_id: observation.candidateId, p_field: "patrimonio", p_year: 2022,
      p_value: "125.50", p_source_url: observation.sourceUrl, p_source_identity: "2022:123456:SP",
    })
    return { data: "baseline", error: null }
  }
  assert.equal(await observeVerifiedCandidateChange(observation, {
    confirmPersisted: async () => { order.push("readback"); return true }, rpc,
  }), "baseline")
  assert.deepEqual(order, ["readback", "rpc"])
})

test("dry runs, weak identities, unavailable values and untrusted provenance never observe", async () => {
  for (const patch of [
    { dryRun: true }, { identityVerified: false }, { value: "NaN" }, { value: "-1" },
    { value: "" }, { sq: "" }, { uf: "XX" }, { year: 2023 },
    { sourceUrl: "https://example.com/" }, { field: "partido" as VerifiedChangeObservation["field"] },
  ]) {
    assert.equal(await observeVerifiedCandidateChange({ ...observation, ...patch }, {
      confirmPersisted: async () => { assert.fail("unexpected readback") },
      rpc: async () => { assert.fail("unexpected RPC") },
    }), "skipped")
  }
})

test("failed writes/readbacks never advance history; RPC failures surface", async () => {
  await assert.rejects(observeVerifiedCandidateChange(observation, {
    confirmPersisted: async () => false, rpc: async () => { assert.fail("unexpected RPC") },
  }), /could not be confirmed/)
  await assert.rejects(observeVerifiedCandidateChange(observation, {
    confirmPersisted: async () => { throw new Error("write/read failed") }, rpc: async () => { assert.fail("unexpected RPC") },
  }), /write\/read failed/)
  await assert.rejects(observeVerifiedCandidateChange(observation, {
    confirmPersisted: async () => true, rpc: async () => ({ data: null, error: { message: "database failed" } }),
  }), /database failed/)
})

test("known status and confirmed zero can be baseline or unchanged; unknown status cannot", async () => {
  const status: VerifiedChangeObservation = { ...observation, field: "situacao", value: "deferido",
    sourceUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2022.zip" }
  for (const item of [status, { ...observation, value: "0" }]) {
    assert.equal(await observeVerifiedCandidateChange(item, {
      confirmPersisted: async () => true, rpc: async () => ({ data: "unchanged", error: null }),
    }), "unchanged")
  }
  assert.equal(await observeVerifiedCandidateChange({ ...status, value: "#NE" }, {
    confirmPersisted: async () => true, rpc: async () => { assert.fail("unexpected RPC") },
  }), "skipped")
})

test("observation-only mismatch skips RPC without advancing the baseline", async () => {
  assert.equal(await observeVerifiedCandidateChange({ ...observation, observationOnly: true }, {
    confirmPersisted: async () => false, rpc: async () => { assert.fail("unexpected RPC") },
  }), "skipped")
})

test("observation-only collectors branch before all fact writes and skip unrelated writers", () => {
  const wealth = readFileSync(new URL("../scripts/lib/ingest-tse.ts", import.meta.url), "utf8")
  const status = readFileSync(new URL("../scripts/lib/ingest-tse-situacao.ts", import.meta.url), "utf8")
  assert.match(wealth, /if \(options\.observationOnly\) \{\s+await observeWealth\(\)\s+continue/)
  assert.ok(wealth.indexOf("await observeWealth()") < wealth.indexOf('const { data: existing, error: existingError }'))
  assert.match(wealth, /if \(options\.observationOnly\) return results\s+const absenceCandidates/)
  assert.match(wealth, /if \(!options\.observationOnly && !options\.skipFinanciamento\) await planFinanciamentoCandidatesYearError/)
  assert.match(wealth, /if \(options\.observationOnly \|\| options\.skipFinanciamento\) continue/)
  const branch = status.indexOf("if (options.observationOnly) {")
  assert.ok(branch > 0 && branch < status.indexOf(".update(updatePayload)"))
  assert.match(status.slice(branch), /^if \(options\.observationOnly\) \{[\s\S]*?continue\s+\}/)
  assert.match(status, /if \(options\.dryRun \|\| options\.observationOnly\) \{[\s\S]*?\} else \{\s+await registrarColeta/)
})
