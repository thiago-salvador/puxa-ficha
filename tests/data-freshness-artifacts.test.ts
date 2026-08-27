import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { loadFreshnessRegistry } from "../scripts/lib/data-freshness/registry"
import { officialRecordsFromVersionedSnapshot } from "../scripts/lib/data-freshness/tse-source"

test("auditoria sempre gera source, universe, diff e summary coerentes", () => {
  const work = mkdtempSync(join(tmpdir(), "data-freshness-artifacts-"))
  try {
    const now = "2026-08-27T12:00:00.000Z"
    const records = officialRecordsFromVersionedSnapshot("data/chapas-2026-tse-20260815.json")
      .map((record) => ({ ...record, perfil_slug: record.perfil_slug ?? `fixture-${record.sq_candidato}` }))
    const collectionEvidence = loadFreshnessRegistry().flatMap((source) =>
      source.collection_source_ids.map((sourceId) => ({ source_id: sourceId, checked_at: now })),
    )
    const published = join(work, "published.json")
    const out = join(work, "out")
    writeFileSync(published, JSON.stringify({ records, collection_evidence: collectionEvidence }))
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/audit/audit-data-freshness.ts",
        `--published=${published}`,
        "--official-snapshot=data/chapas-2026-tse-20260815.json",
        `--out=${out}`,
        `--now=${now}`,
      ],
      { stdio: "pipe" },
    )
    for (const filename of ["source.json", "universe.json", "diff.json", "summary.md"]) {
      assert.ok(readFileSync(join(out, filename), "utf8").length > 0, `${filename} vazio`)
    }
    const universe = JSON.parse(readFileSync(join(out, "universe.json"), "utf8"))
    const diff = JSON.parse(readFileSync(join(out, "diff.json"), "utf8"))
    const summary = readFileSync(join(out, "summary.md"), "utf8")
    assert.equal(diff.status, "ok")
    assert.equal(diff.candidacies.official_count, universe.official.length)
    assert.equal(diff.candidacies.published_count, universe.published.length)
    assert.match(summary, new RegExp(`Candidaturas oficiais: ${universe.official.length}`))
    assert.match(summary, /Estado: \*\*ok\*\*/)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})

test("falha das duas superfícies oficiais ainda preserva os quatro artefatos", () => {
  const work = mkdtempSync(join(tmpdir(), "data-freshness-source-error-"))
  try {
    const published = join(work, "published.json")
    const fetchPatch = join(work, "fail-fetch.mjs")
    const out = join(work, "out")
    writeFileSync(published, JSON.stringify({ records: [], collection_evidence: [] }))
    writeFileSync(fetchPatch, "globalThis.fetch = async () => new Response('blocked', { status: 403 })\n")
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        fetchPatch,
        "--import",
        "tsx",
        "scripts/audit/audit-data-freshness.ts",
        `--published=${published}`,
        `--out=${out}`,
        "--now=2026-08-27T12:00:00.000Z",
      ],
      { encoding: "utf8" },
    )
    assert.equal(result.status, 2)
    for (const filename of ["source.json", "universe.json", "diff.json", "summary.md"]) {
      assert.ok(readFileSync(join(out, filename), "utf8").length > 0, `${filename} vazio`)
    }
    const diff = JSON.parse(readFileSync(join(out, "diff.json"), "utf8"))
    assert.equal(diff.status, "source_error")
    assert.equal(diff.candidacies, null)
    assert.doesNotMatch(result.stderr, /sem_mudanca/i)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})
