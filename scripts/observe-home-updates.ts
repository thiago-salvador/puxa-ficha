import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ingestTSE } from "./lib/ingest-tse"
import { ingestTSESituacao, PLEITO_CORRENTE } from "./lib/ingest-tse-situacao"

/** Only the history RPC may write. Candidate facts remain under existing ingest approval. */
async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== "--apply" && arg !== "--dry-run") ||
      (args.includes("--apply") && args.includes("--dry-run"))) {
    throw new Error("Usage: observe-home-updates.ts [--dry-run | --apply]")
  }
  const dryRun = !args.includes("--apply")
  const counts = { baseline: 0, unchanged: 0, changed: 0, skipped: 0 }
  const onObservation = (outcome: keyof typeof counts) => { counts[outcome]++ }
  const auditDir = mkdtempSync(join(tmpdir(), "home-observations-"))
  try {
    const wealth = await ingestTSE([PLEITO_CORRENTE], {
      observationOnly: true, skipFinanciamento: true, dryRun, onObservation,
    })
    const status = await ingestTSESituacao({
      observationOnly: true, dryRun, onObservation, auditPath: join(auditDir, "audit.json"),
    })
    const errors = [...wealth, ...status].flatMap((result) => result.errors)
    console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "observe-only", ...counts, errors: errors.length }))
    if (errors.length) throw new Error(`Observation failed: ${errors.length} error(s); ${errors.slice(0, 3).join("; ")}`)
    if (!dryRun && counts.baseline + counts.unchanged + counts.changed === 0) {
      throw new Error("Observation failed: no official value could be confirmed against a public profile")
    }
  } finally {
    rmSync(auditDir, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
