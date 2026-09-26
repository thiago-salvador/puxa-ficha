import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { auditarRodadaFalas, type ArquivoRecibosRodada } from "./lib/falas-rodada"
import { consolidarRecibosFalas, type CatalogoRecibosFalas } from "./lib/falas-recibos-publicos"
import type { CandidatoFalas } from "./lib/falas-monitoramento"
import type { CatalogoFalas } from "../src/lib/falas-candidatos"

const FLAGS = new Set(["--require-found-quote"])

function options(argv: string[]): Map<string, string> {
  const result = new Map<string, string>()
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (FLAGS.has(arg)) { result.set(arg.slice(2), "true"); continue }
    if (!arg.startsWith("--")) throw new Error(`Argumento inválido: ${arg}`)
    const equal = arg.indexOf("=")
    if (equal > 0) result.set(arg.slice(2, equal), arg.slice(equal + 1))
    else {
      const value = argv[++index]
      if (!value || value.startsWith("--")) throw new Error(`Valor ausente para ${arg}`)
      result.set(arg.slice(2), value)
    }
  }
  return result
}

function required(values: Map<string, string>, key: string): string {
  const value = values.get(key)
  if (!value) throw new Error(`Informe --${key}`)
  return value
}

function json(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as unknown
}

export function executarAuditoriaRodada(argv = process.argv.slice(2)): number {
  if (argv.length === 1 && argv[0] === "--help") {
    console.log("Uso: audit:falas:rodada --roster ARQUIVO --receipts ARQUIVO --round-start ISO [--now ISO] [--catalog ARQUIVO] [--require-found-quote] [--export-site scripts/data/falas-recibos.json]")
    return 0
  }
  const args = options(argv)
  const roster = json(required(args, "roster")) as CandidatoFalas[]
  const receipts = json(required(args, "receipts")) as ArquivoRecibosRodada | readonly unknown[]
  const catalogPath = args.get("catalog")
  const audit = auditarRodadaFalas({ roster, receipts, roundStart: required(args, "round-start"), now: args.get("now") ?? new Date().toISOString(), catalog: catalogPath ? json(catalogPath) as CatalogoFalas : undefined })
  console.log(JSON.stringify({ schema_version: audit.schema_version, round_start: audit.round_start, now: audit.now, total: audit.total,
    searched: audit.searched, no_results: audit.no_results, blocked: audit.blocked, planned: audit.planned, not_searched: audit.not_searched,
    covered: audit.covered, covered_but_unsearched: audit.covered_but_unsearched, invalid_receipts: audit.invalid_receipts,
    complete: audit.complete, missing_names: audit.missing_names, quote_window_from: audit.quote_window_from,
    found: audit.found, found_without_quote: audit.found_without_quote, found_without_quote_names: audit.found_without_quote_names }))
  const exportPath = args.get("export-site")
  if (exportPath) {
    if (!catalogPath) throw new Error("--export-site exige --catalog: o recibo público diz se há aspa publicada")
    const target = resolve(exportPath)
    const previous = existsSync(target) ? json(target) as CatalogoRecibosFalas : null
    writeFileSync(target, JSON.stringify(consolidarRecibosFalas(previous, audit, new Date()), null, 2) + "\n")
  }
  // `found` promete aspa explícita na fonte. Sem aspa publicada na janela, o
  // rótulo precisa de destino (aspa importada ou recusa registrada).
  if (args.get("require-found-quote") === "true" && audit.found_without_quote > 0) return 1
  return audit.complete ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = executarAuditoriaRodada() } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 2 }
}
