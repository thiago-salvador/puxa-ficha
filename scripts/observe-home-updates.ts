import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { registrarColetaOuFalhar } from "./lib/coleta-log"
import { ingestTSE } from "./lib/ingest-tse"
import { ingestTSESituacao, PLEITO_CORRENTE } from "./lib/ingest-tse-situacao"
import { reciboObservacaoTse } from "./lib/tse-observacao-recibo"

/**
 * Only the history RPC writes candidate history; candidate facts remain under
 * existing ingest approval. The run also leaves one global collection receipt
 * under its own source (`tse-observacao`), so the public freshness page can
 * show that the official packages were read without claiming a profile update.
 */
async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== "--apply" && arg !== "--dry-run") ||
      (args.includes("--apply") && args.includes("--dry-run"))) {
    throw new Error("Usage: observe-home-updates.ts [--dry-run | --apply]")
  }
  const dryRun = !args.includes("--apply")
  const counts = { baseline: 0, unchanged: 0, changed: 0, skipped: 0 }
  const onObservation = (outcome: keyof typeof counts) => { counts[outcome]++ }
  const errors: string[] = []
  let failure: string | null = null
  const auditDir = mkdtempSync(join(tmpdir(), "home-observations-"))
  try {
    const wealth = await ingestTSE([PLEITO_CORRENTE], {
      observationOnly: true, skipFinanciamento: true, dryRun, onObservation,
    })
    const status = await ingestTSESituacao({
      observationOnly: true, dryRun, onObservation, auditPath: join(auditDir, "audit.json"),
    })
    errors.push(...[...wealth, ...status].flatMap((result) => result.errors))
    console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "observe-only", ...counts, errors: errors.length }))
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    rmSync(auditDir, { recursive: true, force: true })
  }

  // The receipt is written before any failure is raised: a failed round must
  // leave `erro`, not silence. A receipt that cannot be written fails the job.
  if (!dryRun) {
    try {
      await registrarColetaOuFalhar(reciboObservacaoTse({ ano: PLEITO_CORRENTE, ...counts, errors, falha: failure }))
    } catch (error) {
      const receiptError = error instanceof Error ? error.message : String(error)
      throw new Error(`Collection receipt not recorded: ${receiptError}${failure !== null ? `; observation: ${failure}` : ""}`)
    }
  }
  if (failure !== null) throw new Error(failure)
  if (errors.length) throw new Error(`Observation failed: ${errors.length} error(s); ${errors.slice(0, 3).join("; ")}`)
  if (!dryRun && counts.baseline + counts.unchanged + counts.changed === 0) {
    throw new Error("Observation failed: no official value could be confirmed against a public profile")
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
