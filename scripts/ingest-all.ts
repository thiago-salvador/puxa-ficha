import { ingestCamara } from "./lib/ingest-camara"
import { ingestSenado } from "./lib/ingest-senado"
import { ingestTSE } from "./lib/ingest-tse"
import { ingestTransparencia } from "./lib/ingest-transparencia"
import { enrichWikipedia } from "./lib/enrich-wikipedia"
import { log, error } from "./lib/logger"
import type { IngestResult } from "./lib/types"

const VALID_SOURCES = ["camara", "senado", "tse", "transparencia", "wikipedia"] as const

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"))
const sources = args.length > 0 ? args : [...VALID_SOURCES]

for (const s of sources) {
  if (!VALID_SOURCES.includes(s as (typeof VALID_SOURCES)[number])) {
    console.error(`Fonte desconhecida: ${s}. Validas: ${VALID_SOURCES.join(", ")}`)
    process.exit(1)
  }
}

async function main() {
  log("pipeline", `Iniciando ingestao: ${sources.join(", ")}`)
  const start = Date.now()
  const allResults: IngestResult[] = []

  if (sources.includes("camara")) {
    log("pipeline", "--- Camara dos Deputados ---")
    try {
      allResults.push(...(await ingestCamara()))
    } catch (err) {
      error("pipeline", `Camara falhou: ${err}`)
    }
  }

  if (sources.includes("senado")) {
    log("pipeline", "--- Senado Federal ---")
    try {
      allResults.push(...(await ingestSenado()))
    } catch (err) {
      error("pipeline", `Senado falhou: ${err}`)
    }
  }

  if (sources.includes("tse")) {
    log("pipeline", "--- TSE (CSV) ---")
    try {
      allResults.push(...(await ingestTSE()))
    } catch (err) {
      error("pipeline", `TSE falhou: ${err}`)
    }
  }

  if (sources.includes("transparencia")) {
    log("pipeline", "--- Portal da Transparencia ---")
    try {
      allResults.push(...(await ingestTransparencia()))
    } catch (err) {
      error("pipeline", `Transparencia falhou: ${err}`)
    }
  }

  if (sources.includes("wikipedia")) {
    log("pipeline", "--- Wikipedia / Wikidata ---")
    try {
      allResults.push(...(await enrichWikipedia()))
    } catch (err) {
      error("pipeline", `Wikipedia falhou: ${err}`)
    }
  }

  const totalRows = allResults.reduce((s, r) => s + r.rows_upserted, 0)
  const totalErrors = allResults.reduce((s, r) => s + r.errors.length, 0)
  const duration = ((Date.now() - start) / 1000).toFixed(1)

  log("pipeline", ``)
  log("pipeline", `=== Resumo ===`)
  log("pipeline", `Tempo: ${duration}s`)
  log("pipeline", `Rows upserted: ${totalRows}`)
  log("pipeline", `Errors: ${totalErrors}`)

  if (totalErrors > 0) {
    log("pipeline", ``)
    log("pipeline", `Erros por candidato:`)
    for (const r of allResults.filter((r) => r.errors.length > 0)) {
      error("pipeline", `  ${r.source}/${r.candidato}: ${r.errors.join("; ")}`)
    }
    process.exit(1)
  }
}

main()
