import { ingestCamara } from "./lib/ingest-camara"
import { ingestSenado } from "./lib/ingest-senado"
import { ingestTSE } from "./lib/ingest-tse"
import { ingestTransparencia } from "./lib/ingest-transparencia"
import { enrichWikipedia } from "./lib/enrich-wikipedia"
import { ingestTCU } from "./lib/ingest-tcu"
import { ingestTransparenciaSanctions } from "./lib/ingest-transparencia-sanctions"
import { ingestTSESituacao } from "./lib/ingest-tse-situacao"
import { ingestFiliacao } from "./lib/ingest-filiacao"
import { ingestCeapsSenado } from "./lib/ingest-ceaps-senado"
import { ingestWikidata } from "./lib/ingest-wikidata"
import { enrichInstagram } from "./lib/enrich-instagram"
import { ingestGoogleNews } from "./lib/ingest-google-news"
import { enrichWikiHistorico } from "./lib/enrich-wiki-historico"
import { ingestWikidataPolitico } from "./lib/ingest-wikidata-politico"
import { ingestJarbas } from "./lib/ingest-jarbas"
import { ingestSiconfi } from "./lib/ingest-siconfi"
import { ingestCapag } from "./lib/ingest-capag"
import { ingestAtlasViolencia } from "./lib/ingest-atlas-violencia"
import { ingestIbge } from "./lib/ingest-ibge"
import { ingestIdeb } from "./lib/ingest-ideb"
import { ingestIpea } from "./lib/ingest-ipea"
import { log, error } from "./lib/logger"
import type { IngestResult } from "./lib/types"

const VALID_SOURCES = [
  // Ordem correta: tse-situacao primeiro (CPF), depois APIs federais, depois enriquecimento
  "tse-situacao", "camara", "senado", "tse", "transparencia",
  "tcu", "sancoes", "filiacao", "ceaps-senado", "jarbas",
  "wikipedia", "wiki-historico", "wikidata", "wikidata-politico", "instagram",
  "siconfi", "capag", "atlas-violencia", "ibge", "ideb", "ipea",
  "google-news",
] as const

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

  // 1. TSE Situacao PRIMEIRO: extrai CPF, dados demograficos do CSV
  // Sem CPF no banco, tcu e sancoes pulam o candidato
  if (sources.includes("tse-situacao")) {
    log("pipeline", "--- TSE Situacao da Candidatura + CPF ---")
    try {
      allResults.push(...(await ingestTSESituacao()))
    } catch (err) {
      error("pipeline", `TSE Situacao falhou: ${err}`)
    }
  }

  // 2. APIs federais (precisam de IDs em candidatos.json)
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

  // 3. TSE CSV bulk (patrimonio, financiamento)
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

  // 4. Enriquecimento: Wikipedia bio + redes + historico
  if (sources.includes("wikipedia")) {
    log("pipeline", "--- Wikipedia (bio, foto, redes) ---")
    try {
      allResults.push(...(await enrichWikipedia()))
    } catch (err) {
      error("pipeline", `Wikipedia falhou: ${err}`)
    }
  }

  if (sources.includes("wiki-historico")) {
    log("pipeline", "--- Wikipedia Historico (categorias) ---")
    try {
      await enrichWikiHistorico()
    } catch (err) {
      error("pipeline", `Wiki Historico falhou: ${err}`)
    }
  }

  // 5. Compliance e fiscalizacao
  if (sources.includes("tcu")) {
    log("pipeline", "--- TCU (Inabilitados + CADIRREG) ---")
    try {
      allResults.push(...(await ingestTCU()))
    } catch (err) {
      error("pipeline", `TCU falhou: ${err}`)
    }
  }

  if (sources.includes("sancoes")) {
    log("pipeline", "--- Portal da Transparencia (CEIS/CNEP/CEAF/CEPIM) ---")
    try {
      allResults.push(...(await ingestTransparenciaSanctions()))
    } catch (err) {
      error("pipeline", `Sancoes falhou: ${err}`)
    }
  }

  if (sources.includes("filiacao")) {
    log("pipeline", "--- TSE Filiacao Partidaria ---")
    try {
      allResults.push(...(await ingestFiliacao()))
    } catch (err) {
      error("pipeline", `Filiacao falhou: ${err}`)
    }
  }

  if (sources.includes("ceaps-senado")) {
    log("pipeline", "--- CEAPS Senado ---")
    try {
      allResults.push(...(await ingestCeapsSenado()))
    } catch (err) {
      error("pipeline", `CEAPS Senado falhou: ${err}`)
    }
  }

  if (sources.includes("wikidata")) {
    log("pipeline", "--- Wikidata ---")
    try {
      allResults.push(...(await ingestWikidata()))
    } catch (err) {
      error("pipeline", `Wikidata falhou: ${err}`)
    }
  }

  if (sources.includes("wikidata-politico")) {
    log("pipeline", "--- Wikidata Politico (partidos + cargos) ---")
    try {
      allResults.push(...(await ingestWikidataPolitico()))
    } catch (err) {
      error("pipeline", `Wikidata Politico falhou: ${err}`)
    }
  }

  if (sources.includes("instagram")) {
    log("pipeline", "--- Instagram (seguidores) ---")
    try {
      allResults.push(...(await enrichInstagram()))
    } catch (err) {
      error("pipeline", `Instagram falhou: ${err}`)
    }
  }

  if (sources.includes("jarbas")) {
    log("pipeline", "--- Jarbas / Serenata de Amor ---")
    try {
      allResults.push(...(await ingestJarbas()))
    } catch (err) {
      error("pipeline", `Jarbas falhou: ${err}`)
    }
  }

  if (sources.includes("siconfi")) {
    log("pipeline", "--- SICONFI (gestao fiscal) ---")
    try {
      allResults.push(...(await ingestSiconfi()))
    } catch (err) {
      error("pipeline", `SICONFI falhou: ${err}`)
    }
  }

  if (sources.includes("capag")) {
    log("pipeline", "--- CAPAG (rating fiscal) ---")
    try {
      allResults.push(...(await ingestCapag()))
    } catch (err) {
      error("pipeline", `CAPAG falhou: ${err}`)
    }
  }

  if (sources.includes("atlas-violencia")) {
    log("pipeline", "--- Atlas da Violencia (IPEA) ---")
    try {
      allResults.push(...(await ingestAtlasViolencia()))
    } catch (err) {
      error("pipeline", `Atlas Violencia falhou: ${err}`)
    }
  }

  if (sources.includes("ibge")) {
    log("pipeline", "--- IBGE SIDRA ---")
    try {
      allResults.push(...(await ingestIbge()))
    } catch (err) {
      error("pipeline", `IBGE falhou: ${err}`)
    }
  }

  if (sources.includes("ideb")) {
    log("pipeline", "--- INEP/IDEB ---")
    try {
      allResults.push(...(await ingestIdeb()))
    } catch (err) {
      error("pipeline", `IDEB falhou: ${err}`)
    }
  }

  if (sources.includes("ipea")) {
    log("pipeline", "--- IPEA Data ---")
    try {
      allResults.push(...(await ingestIpea()))
    } catch (err) {
      error("pipeline", `IPEA falhou: ${err}`)
    }
  }

  if (sources.includes("google-news")) {
    log("pipeline", "--- Google News RSS ---")
    try {
      allResults.push(...(await ingestGoogleNews()))
    } catch (err) {
      error("pipeline", `Google News falhou: ${err}`)
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
