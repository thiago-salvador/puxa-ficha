import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  aggregateSourceEvidence,
  evaluateSourceFreshness,
  loadFreshnessRegistry,
} from "../scripts/lib/data-freshness/registry"

function methodologyIds(): string[] {
  const source = readFileSync("src/data/methodology-sources.ts", "utf8")
  return [...source.matchAll(/^\s+id:\s*"([^"]+)"/gm)].map((match) => match[1]).sort()
}

function collectionIds(): string[] {
  const source = readFileSync("scripts/lib/coleta-log.ts", "utf8")
  const block = source.match(/Object\.freeze\(\{([\s\S]*?)\n\}\)/)?.[1] ?? ""
  const ids = [...block.matchAll(/^\s+(?:"([^"]+)"|([a-z][a-z0-9_-]*)):\s*"/gm)].map(
    (match) => match[1] ?? match[2],
  )
  if (/\[FONTE_CAMARA_PROPOSICOES\]:/.test(block)) ids.push("camara-proposicoes")
  return ids.sort()
}

test("registro cobre todas as fontes públicas e de coleta sem duplicidade", () => {
  const registry = loadFreshnessRegistry()
  assert.equal(new Set(registry.map((source) => source.source_id)).size, registry.length)
  assert.deepEqual(
    [...new Set(registry.flatMap((source) => source.methodology_source_ids))].sort(),
    methodologyIds(),
  )
  assert.deepEqual(
    [...new Set(registry.flatMap((source) => source.collection_source_ids))].sort(),
    collectionIds(),
  )
  for (const source of registry) {
    assert.match(source.authority_url, /^https:\/\//)
    assert.ok(source.evidence_ref)
    assert.equal(source.negative_claims_allowed_when_stale, false)
  }
})

test("SLA distingue fresh, stale, source_error e review_required", () => {
  const source = loadFreshnessRegistry().find((item) => item.source_id === "tse-current")
  assert.ok(source)
  const now = new Date("2026-08-27T12:00:00.000Z")
  assert.equal(evaluateSourceFreshness(source, { source_id: source.source_id, checked_at: "2026-08-27T11:00:00.000Z" }, now).status, "fresh")
  const stale = evaluateSourceFreshness(source, { source_id: source.source_id, checked_at: "2026-08-20T11:00:00.000Z" }, now)
  assert.equal(stale.status, "stale")
  assert.equal(stale.negative_claims_allowed, false)
  assert.equal(evaluateSourceFreshness(source, { source_id: source.source_id, checked_at: null, source_error: "403" }, now).status, "source_error")
  assert.equal(evaluateSourceFreshness(source, { source_id: source.source_id, checked_at: now.toISOString(), review_required: true }, now).status, "review_required")
})

test("uma coleta nova não mascara alias vencido ou ausente da mesma família", () => {
  const source = loadFreshnessRegistry().find((item) => item.source_id === "camara")
  assert.ok(source)
  const oldest = aggregateSourceEvidence(source, [
    { source_id: "camara", checked_at: "2026-08-27T11:00:00.000Z" },
    { source_id: "camara-proposicoes", checked_at: "2026-08-20T11:00:00.000Z" },
    { source_id: "destaques-votacoes", checked_at: "2026-08-25T11:00:00.000Z" },
  ])
  assert.equal(oldest.checked_at, "2026-08-20T11:00:00.000Z")
  const missing = aggregateSourceEvidence(source, [
    { source_id: "camara", checked_at: "2026-08-27T11:00:00.000Z" },
  ])
  assert.equal(missing.checked_at, null)
})
