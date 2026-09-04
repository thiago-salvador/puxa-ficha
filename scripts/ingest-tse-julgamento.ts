/** Modo explícito 2026: dry-run por padrão; não substitui o ingest histórico de CPF. */
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { ativarDryRun } from "./lib/dry-run"
import { aplicarJulgamento, carregarSnapshotJulgamento, escreverPrivado, relatorioJulgamento } from "./lib/tse-julgamento-2026"

export async function ingestTSEJulgamento(args = process.argv.slice(2)): Promise<void> {
  const unknown = args.filter((a) => a !== "--apply" && a !== "--dry-run" && !a.startsWith("--snapshot-dir=") && !a.startsWith("--expect-snapshot="))
  if (unknown.length) throw new Error(`Argumentos desconhecidos: ${unknown.join(", ")}`)
  const apply = args.includes("--apply")
  if (apply && args.includes("--dry-run")) throw new Error("--apply e --dry-run sao mutuamente exclusivos")
  if (!apply) ativarDryRun()
  const selectedDir = args.find((a) => a.startsWith("--snapshot-dir="))?.slice(15)
  const expected = args.find((a) => a.startsWith("--expect-snapshot="))?.slice(18)
  if (apply && (!selectedDir || !expected || !existsSync(resolve(selectedDir, "snapshot.json")))) throw new Error("Apply exige snapshot existente e --expect-snapshot=<sha256> revisado")
  const dir = selectedDir ?? mkdtempSync(resolve(tmpdir(), "pf-julgamento-"))
  const snapshot = await carregarSnapshotJulgamento(dir)
  const report = relatorioJulgamento(snapshot)
  const path = resolve(dir, apply ? `recibo-${Date.now()}.json` : "dry-run.json")
  if (apply) await aplicarJulgamento(snapshot, expected!, path)
  else escreverPrivado(path, { ...report, dry_run: true, persisted: 0 })
  console.log(JSON.stringify({ dry_run: !apply, snapshot_dir: dir, snapshot_sha256: report.snapshot_sha256, ...report.summary, relatorio: path }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  ingestTSEJulgamento().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 2 })
}
