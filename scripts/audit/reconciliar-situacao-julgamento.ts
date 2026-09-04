/** Reconciliador somente leitura. Compartilha coorte, fontes e plano com o ingest 2026. */
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { ativarDryRun } from "../lib/dry-run"
import { carregarSnapshotJulgamento, escreverPrivado, relatorioJulgamento } from "../lib/tse-julgamento-2026"

export async function reconciliarSituacaoJulgamento(destinoJson?: string, snapshotDir?: string): Promise<void> {
  ativarDryRun()
  const dir = snapshotDir ?? process.argv.find((a) => a.startsWith("--snapshot-dir="))?.slice(15) ?? mkdtempSync(resolve(tmpdir(), "pf-julgamento-"))
  const snapshot = await carregarSnapshotJulgamento(dir)
  const report = relatorioJulgamento(snapshot)
  const destino = destinoJson ?? process.argv.find((a) => a.startsWith("--json="))?.slice(7) ?? resolve(dir, "reconciliacao.json")
  escreverPrivado(destino, report)
  console.log(JSON.stringify({ snapshot_dir: dir, snapshot_sha256: report.snapshot_sha256, ...report.summary, relatorio: destino }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  reconciliarSituacaoJulgamento().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 2 })
}
