import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import {
  DESTAQUES_UNIVERSE_ATUAL,
  compareDestaquesRuns,
  validateDestaquesRunManifest,
  type DestaquesRunManifest,
  type DestaquesUniverse,
} from "../lib/destaques-votacoes-provenance"

function arg(name: string): string | null {
  return process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
}

function readRun(path: string, universe: DestaquesUniverse): DestaquesRunManifest {
  const manifestPath = resolve(path)
  const root = dirname(manifestPath)
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as DestaquesRunManifest
  return validateDestaquesRunManifest(manifest, (relativePath) => readFileSync(join(root, relativePath)), universe)
}

/**
 * Por padrão o gate exige o universo vigente. `--expected-pairs=N` existe só
 * para reprovar evidência histórica coletada antes de uma reconciliação que
 * mudou a cardinalidade (ex.: golden de 2026-08-30, 154 pares).
 */
function resolveUniverse(): DestaquesUniverse {
  const raw = arg("expected-pairs")
  if (raw === null) return DESTAQUES_UNIVERSE_ATUAL
  const pairs = Number(raw)
  if (!Number.isInteger(pairs) || pairs <= 0) throw new Error(`--expected-pairs inválido: ${raw}`)
  return { ...DESTAQUES_UNIVERSE_ATUAL, pairs }
}

function main(): void {
  const runAPath = arg("run-a")
  const runBPath = arg("run-b")
  const out = arg("out")
  const strictSurface = process.argv.includes("--strict-surface")
  if (!runAPath || !runBPath) {
    throw new Error("uso: verify-destaques-votacoes-provenance.ts --run-a=manifest.json --run-b=manifest.json [--out=receipt.json] [--strict-surface] [--expected-pairs=N]")
  }
  const universe = resolveUniverse()
  const runA = readRun(runAPath, universe)
  const runB = readRun(runBPath, universe)
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
