import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import {
  compareDestaquesRuns,
  validateDestaquesRunManifest,
  type DestaquesRunManifest,
} from "../lib/destaques-votacoes-provenance"

function arg(name: string): string | null {
  return process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
}

function readRun(path: string): DestaquesRunManifest {
  const manifestPath = resolve(path)
  const root = dirname(manifestPath)
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as DestaquesRunManifest
  return validateDestaquesRunManifest(manifest, (relativePath) => readFileSync(join(root, relativePath)))
}

function main(): void {
  const runAPath = arg("run-a")
  const runBPath = arg("run-b")
  const out = arg("out")
  const strictSurface = process.argv.includes("--strict-surface")
  if (!runAPath || !runBPath) {
    throw new Error("uso: verify-destaques-votacoes-provenance.ts --run-a=manifest.json --run-b=manifest.json [--out=receipt.json] [--strict-surface]")
  }
  const runA = readRun(runAPath)
  const runB = readRun(runBPath)
  const receipt = compareDestaquesRuns(runA, runB)
  if (strictSurface && receipt.summary.pares_sem_achado !== 0) {
    const affected = runB.pairs
      .filter((pair) => pair.resultado === "sem_achado_no_escopo")
      .map((pair) => pair.pair_key)
      .join(",")
    throw new Error(`strict-surface: ${receipt.summary.pares_sem_achado} par(es) não confirmado(s): ${affected}`)
  }
  if (out) writeFileSync(resolve(out), `${JSON.stringify(receipt, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
