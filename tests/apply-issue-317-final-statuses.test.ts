import test from "node:test"
import assert from "node:assert/strict"
import { SOURCE, TARGETS, validatePlan } from "../scripts/audit/apply-issue-317-final-statuses"

test("final TSE repair keeps an exact two-target whitelist and REST receipts", () => {
  assert.deepEqual(TARGETS.map((t) => t.slug), ["pazolini", "gelson-merisio", "victor-assis"])
  assert.equal(new Set(TARGETS.map((t) => t.id)).size, 3)
  for (const target of TARGETS) {
    const source = SOURCE[target.slug]
    assert.equal(source.sq, target.sq)
    assert.match(source.url, new RegExp(`/candidato/${target.sq}$`))
    assert.match(source.raw_sha256, /^[a-f0-9]{64}$/)
  }
})

test("plan validation rejects tampered identity, source and patch fields", () => {
  type Plan = Parameters<typeof validatePlan>[0]
  const base = { version: 1, project: "wskpzsobvqwhnbsdsmok", source: SOURCE, entries: TARGETS.map((t) => ({ slug: t.slug, id: t.id, source: SOURCE[t.slug], before: { id: t.id, slug: t.slug, sq_candidato_2026: t.sq, estado: t.uf, publicavel: true, status: "candidato" }, patch: { situacao_candidatura: "deferido" } })) } as unknown as Plan
  for (const mutate of [
    (p: Plan) => { p.entries[0].id = "tampered" },
    (p: Plan) => { Object.defineProperty(p.entries[0].source, "raw_sha256", { value: "0".repeat(64) }) },
    (p: Plan) => { p.entries[0].patch.publicavel = false },
  ]) assert.throws(() => { const copy = structuredClone(base); mutate(copy); validatePlan(copy) })
})
