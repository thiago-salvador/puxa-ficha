import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  aggregateSourceEvidence,
  evaluateSourceFreshness,
  evaluateSourceFreshnessStrict,
  loadFreshnessRegistry,
  selectLatestSourceEvidence,
} from "../scripts/lib/data-freshness/registry"

function destaquesEvidence(checkedAt: string) {
  return {
    source_id: "destaques-votacoes",
    checked_at: checkedAt,
    provenance_contract_version: 1,
    provenance_complete: true,
    evidence_sha256: "a".repeat(64),
    raw_payload_count: 93,
    pair_count: 154,
    double_read_execution_ids: ["destaques-votacoes:run-a", "destaques-votacoes:run-b"],
  }
}

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

test("família usa a evidência mais recente e registra aliases ausentes como dívida", () => {
  const source = loadFreshnessRegistry().find((item) => item.source_id === "camara")
  assert.ok(source)
  const newest = aggregateSourceEvidence(source, [
    { source_id: "camara", checked_at: "2026-08-27T11:00:00.000Z" },
    { source_id: "camara-proposicoes", checked_at: "2026-08-20T11:00:00.000Z" },
    { source_id: "destaques-votacoes", checked_at: "2026-08-25T11:00:00.000Z" },
  ])
  assert.equal(newest.checked_at, "2026-08-27T11:00:00.000Z")
  const missing = aggregateSourceEvidence(source, [
    { source_id: "camara", checked_at: "2026-08-27T11:00:00.000Z" },
  ])
  assert.equal(missing.checked_at, "2026-08-27T11:00:00.000Z")
  assert.equal(missing.debt_count, 2)
  assert.deepEqual(missing.missing_source_ids, ["camara-proposicoes", "destaques-votacoes"])
})

test("modo strict avalia cada membro, expõe a data mais antiga e não mascara membro vencido", () => {
  const source = loadFreshnessRegistry().find((item) => item.source_id === "camara")
  assert.ok(source)
  const now = new Date("2026-08-27T12:00:00.000Z")
  const result = evaluateSourceFreshnessStrict(source, [
    { source_id: "camara", checked_at: "2026-08-27T11:00:00.000Z" },
    { source_id: "camara-proposicoes", checked_at: "2026-08-17T11:00:00.000Z" },
    destaquesEvidence("2026-08-27T10:00:00.000Z"),
  ], now)

  assert.equal(result.status, "stale")
  assert.equal(result.checked_at, "2026-08-27T11:00:00.000Z")
  assert.equal(result.oldest_checked_at, "2026-08-17T11:00:00.000Z")
  assert.equal(result.age_hours, 241)
  assert.deepEqual(result.stale_source_ids, ["camara-proposicoes"])
  assert.equal(result.negative_claims_allowed, false)
})

test("modo operacional preserva o agregado mais recente, enquanto strict evita fresh com membro vencido", () => {
  const source = loadFreshnessRegistry().find((item) => item.source_id === "camara")
  assert.ok(source)
  const evidence = aggregateSourceEvidence(source, [
    { source_id: "camara", checked_at: "2026-08-27T11:00:00.000Z" },
    { source_id: "camara-proposicoes", checked_at: "2026-08-17T11:00:00.000Z" },
    destaquesEvidence("2026-08-27T10:00:00.000Z"),
  ])
  const now = new Date("2026-08-27T12:00:00.000Z")
  assert.equal(evaluateSourceFreshness(source, evidence, now).status, "fresh")
  assert.equal(evaluateSourceFreshness(source, evidence, now, { strict: true }).status, "stale")
})

test("strict reprova membro requerido sem data ou com data inválida", () => {
  const source = loadFreshnessRegistry().find((item) => item.source_id === "camara")
  assert.ok(source)
  const now = new Date("2026-08-27T12:00:00.000Z")
  const result = evaluateSourceFreshnessStrict(source, [
    { source_id: "camara", checked_at: now.toISOString() },
    { source_id: "camara-proposicoes", checked_at: null },
    { source_id: "destaques-votacoes", checked_at: "não-é-data" },
  ], now)

  assert.equal(result.status, "stale")
  assert.deepEqual(result.stale_source_ids, ["camara-proposicoes", "destaques-votacoes"])
  assert.equal(result.negative_claims_allowed, false)
})

test("strict bloqueia família scheduled quando falta um membro requerido", () => {
  const source = loadFreshnessRegistry().find((item) => item.source_id === "camara")
  assert.ok(source)
  const now = new Date("2026-08-27T12:00:00.000Z")
  const result = evaluateSourceFreshnessStrict(source, [
    { source_id: "camara", checked_at: now.toISOString() },
    destaquesEvidence(now.toISOString()),
  ], now)

  assert.equal(result.status, "stale")
  assert.deepEqual(result.stale_source_ids, ["camara-proposicoes"])
  assert.equal(result.negative_claims_allowed, false)
})

test("strict rejeita destaques-votacoes sem proveniência completa e dupla leitura", () => {
  const source = loadFreshnessRegistry().find((item) => item.source_id === "camara")
  assert.ok(source)
  const now = new Date("2026-08-27T12:00:00.000Z")
  const result = evaluateSourceFreshnessStrict(source, [
    { source_id: "camara", checked_at: now.toISOString() },
    { source_id: "camara-proposicoes", checked_at: now.toISOString() },
    { source_id: "destaques-votacoes", checked_at: now.toISOString() },
  ], now)

  assert.equal(result.status, "stale")
  assert.deepEqual(result.stale_source_ids, ["destaques-votacoes"])
  assert.equal(result.negative_claims_allowed, false)
})

test("strict preserva technical_debt para membro manual vencido sem alterar o operacional fresh", () => {
  const source = loadFreshnessRegistry().find((item) => item.source_id === "knowledge-enrichment")
  assert.ok(source)
  const evidence = aggregateSourceEvidence(source, source.collection_source_ids.map((sourceId) => ({
    source_id: sourceId,
    checked_at: sourceId === "wikipedia" ? "2020-01-01T00:00:00.000Z" : "2026-08-27T11:00:00.000Z",
  })))
  const now = new Date("2026-08-27T12:00:00.000Z")

  assert.equal(evaluateSourceFreshness(source, evidence, now).status, "fresh")
  const strict = evaluateSourceFreshness(source, evidence, now, { mode: "strict" })
  assert.equal(strict.status, "technical_debt")
  assert.deepEqual(strict.stale_source_ids, ["wikipedia"])
})

test("indeterminado e erro manual viram dívida; erro agendado continua bloqueando", () => {
  const registry = loadFreshnessRegistry()
  const scheduled = registry.find((item) => item.source_id === "camara")
  const manual = registry.find((item) => item.source_id === "filiacao")
  assert.ok(scheduled)
  assert.ok(manual)
  const now = new Date("2026-08-27T12:00:00.000Z")

  assert.equal(evaluateSourceFreshness(scheduled, {
    source_id: scheduled.source_id,
    checked_at: now.toISOString(),
    debt_count: 3,
  }, now).status, "technical_debt")
  assert.equal(evaluateSourceFreshness(manual, {
    source_id: manual.source_id,
    checked_at: null,
  }, now).status, "technical_debt")
  assert.equal(evaluateSourceFreshness(manual, {
    source_id: manual.source_id,
    checked_at: now.toISOString(),
    source_error: "layout sem dados individuais",
    error_count: 1,
  }, now).status, "technical_debt")
  assert.equal(evaluateSourceFreshness(scheduled, {
    source_id: scheduled.source_id,
    checked_at: now.toISOString(),
    source_error: "HTTP 500",
    error_count: 1,
  }, now).status, "source_error")
})

test("seleção executável substitui erro antigo e preserva erro atual", () => {
  const oldError = {
    source_id: "camara",
    checked_at: "2026-08-27T10:00:00.000Z",
    source_error: "HTTP 500",
    error_count: 1,
    execution_id: "legacy:old",
  }
  const recentSuccess = {
    source_id: "camara",
    checked_at: "2026-08-27T11:00:00.000Z",
    error_count: 0,
    execution_id: "gh:success",
  }
  assert.deepEqual(selectLatestSourceEvidence([oldError, recentSuccess]), [recentSuccess])

  const currentError = {
    ...oldError,
    checked_at: "2026-08-27T12:00:00.000Z",
    execution_id: "gh:failure",
  }
  assert.deepEqual(selectLatestSourceEvidence([recentSuccess, currentError]), [currentError])
})
