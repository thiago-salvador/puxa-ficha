import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { executarMonitoramentoComFixtures } from "../scripts/lib/pesquisas-monitoramento"

const catalogs = [
  "scripts/data/pesquisas-presidencia-2026.json",
  "scripts/data/pesquisas-governadores-2026.json",
  "scripts/data/pesquisas-eleitorais-fontes.json",
  "scripts/data/pesquisas-governadores-fontes.json",
]

function sha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

test("dry-run produz apenas artefatos de revisao", () => {
  const before = new Map(catalogs.map((path) => [path, sha(path)]))
  const output = mkdtempSync(join(tmpdir(), "pf-monitor-"))
  try {
    executarMonitoramentoComFixtures({
      goldenPath: "tests/fixtures/pesquisas-monitoramento-golden.jsonl",
      fixturesDir: "tests/fixtures/pesquisas-monitoramento",
      outputDir: output,
    })
    assert.deepEqual(readdirSync(output).sort(), ["diff.json", "proposal.json", "summary.md"])
    assert.deepEqual(new Map(catalogs.map((path) => [path, sha(path)])), before)
    const proposal = JSON.parse(readFileSync(join(output, "proposal.json"), "utf8")) as {
      dry_run: boolean
      human_review_required: boolean
    }
    assert.equal(proposal.dry_run, true)
    assert.equal(proposal.human_review_required, true)
    console.log("MONITORAMENTO_ISOLAMENTO_PASS")
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
})
