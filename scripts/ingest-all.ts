import { ingestCamara } from "./lib/ingest-camara"
import { ingestSenado } from "./lib/ingest-senado"
import { ingestTSE, parseTseYearsEnv } from "./lib/ingest-tse"
import { ingestTransparencia } from "./lib/ingest-transparencia"
import { enrichWikipedia } from "./lib/enrich-wikipedia"
import { ingestTCU } from "./lib/ingest-tcu"
import { ingestTransparenciaSanctions } from "./lib/ingest-transparencia-sanctions"
import { ingestTSESituacao } from "./lib/ingest-tse-situacao"
import { ingestFiliacao } from "./lib/ingest-filiacao"
import { ingestTSEHistorico } from "./lib/ingest-tse-historico"
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
import { log, error, warn } from "./lib/logger"
import { registrarColeta, registrarColetaDeResultados } from "./lib/coleta-log"
import { parseIngestCliOptions } from "./lib/pipeline-cli-options"
import type { IngestResult } from "./lib/types"

const VALID_SOURCES = [
  // Ordem correta: tse-situacao primeiro (CPF), depois APIs federais, depois enriquecimento
  "tse-situacao", "camara", "senado", "tse", "transparencia",
  "tcu", "sancoes", "tse-historico", "filiacao", "ceaps-senado", "jarbas",
  "wikipedia", "wiki-historico", "wikidata", "wikidata-politico", "instagram",
  "siconfi", "capag", "atlas-violencia", "ibge", "ideb", "ipea",
  "google-news",
] as const

type IngestSource = (typeof VALID_SOURCES)[number]

type IngestTask = {
  source: IngestSource
  heading: string
  failureLabel: string
  /**
   * Nome da fonte em `coleta_log`, usado só quando a tarefa inteira estoura e
   * não sobra nenhum IngestResult para traduzir. Fora desse caso o nome vem do
   * campo `source` de cada resultado, que é a fonte da verdade. Existe porque
   * `VALID_SOURCES` é vocabulário de CLI (`sancoes`) e não bate com o que os
   * ingests declaram (`transparencia-sanctions`).
   */
  fonteColeta?: string
  before?: () => void
  run: () => Promise<IngestResult[] | void>
}

const cli = parseIngestCliOptions(process.argv.slice(2))
const sources = parseSources(cli.sourceArgs)
const tseYears = parseTseYearsEnv(process.env.PF_TSE_ANOS)

function parseSources(input: string[]): IngestSource[] {
  const selected = input.length > 0 ? input : [...VALID_SOURCES]
  for (const s of selected) {
    if (!VALID_SOURCES.includes(s as IngestSource)) {
      console.error(`Fonte desconhecida: ${s}. Validas: ${VALID_SOURCES.join(", ")}`)
      process.exit(1)
    }
  }

  return selected as IngestSource[]
}

const INGEST_TASKS: IngestTask[] = [
  {
    source: "tse-situacao",
    heading: "--- TSE Situacao da Candidatura + CPF ---",
    failureLabel: "TSE Situacao",
    run: ingestTSESituacao,
  },
  {
    source: "camara",
    heading: "--- Camara dos Deputados ---",
    failureLabel: "Camara",
    before: () => {
      if (!cli.skipCamaraValidated) return
      log(
        "pipeline",
        "Flag --skip-camara-validated: modo incremental (pula candidato so se votos+projetos+gastos recentes ok; senao so etapas faltantes)"
      )
    },
    run: () => ingestCamara({
      skipValidated: cli.skipCamaraValidated,
      targetSlugs: cli.targetSlugs,
      forceFrozen: cli.forceFrozen,
      candidateTimeoutMs: cli.camaraCandidateTimeoutMs,
    }),
  },
  {
    source: "senado",
    heading: "--- Senado Federal ---",
    failureLabel: "Senado",
    run: () => ingestSenado({
      targetSlugs: cli.targetSlugs,
      forceFrozen: cli.forceFrozen,
      candidateTimeoutMs: cli.senadoCandidateTimeoutMs,
    }),
  },
  {
    source: "tse",
    heading: `--- TSE (CSV: ${tseYears.join(", ")}) ---`,
    failureLabel: "TSE",
    run: () => ingestTSE(tseYears),
  },
  {
    source: "transparencia",
    heading: "--- Portal da Transparencia ---",
    failureLabel: "Transparencia",
    run: ingestTransparencia,
  },
  {
    source: "wikipedia",
    heading: "--- Wikipedia (bio, foto, redes) ---",
    failureLabel: "Wikipedia",
    run: enrichWikipedia,
  },
  {
    source: "wiki-historico",
    heading: "--- Wikipedia Historico (categorias) ---",
    failureLabel: "Wiki Historico",
    run: enrichWikiHistorico,
  },
  { source: "tcu", heading: "--- TCU (Inabilitados + CADIRREG) ---", failureLabel: "TCU", run: ingestTCU },
  {
    source: "sancoes",
    fonteColeta: "transparencia-sanctions",
    heading: "--- Portal da Transparencia (CEIS/CNEP/CEAF) ---",
    failureLabel: "Sancoes",
    run: ingestTransparenciaSanctions,
  },
  {
    source: "tse-historico",
    heading: "--- TSE Historico de Candidaturas ---",
    failureLabel: "TSE Historico",
    run: ingestTSEHistorico,
  },
  {
    source: "filiacao",
    heading: "--- TSE Filiacao Partidaria ---",
    failureLabel: "Filiacao",
    run: ingestFiliacao,
  },
  {
    source: "ceaps-senado",
    heading: "--- CEAPS Senado ---",
    failureLabel: "CEAPS Senado",
    run: ingestCeapsSenado,
  },
  { source: "wikidata", heading: "--- Wikidata ---", failureLabel: "Wikidata", run: ingestWikidata },
  {
    source: "wikidata-politico",
    heading: "--- Wikidata Politico (partidos + cargos) ---",
    failureLabel: "Wikidata Politico",
    run: ingestWikidataPolitico,
  },
  {
    source: "instagram",
    heading: "--- Instagram (seguidores) ---",
    failureLabel: "Instagram",
    run: enrichInstagram,
  },
  {
    source: "jarbas",
    heading: "--- Jarbas / Serenata de Amor ---",
    failureLabel: "Jarbas",
    run: ingestJarbas,
  },
  { source: "siconfi", heading: "--- SICONFI (gestao fiscal) ---", failureLabel: "SICONFI", run: ingestSiconfi },
  { source: "capag", heading: "--- CAPAG (rating fiscal) ---", failureLabel: "CAPAG", run: ingestCapag },
  {
    source: "atlas-violencia",
    fonteColeta: "atlas_violencia",
    heading: "--- Atlas da Violencia (IPEA) ---",
    failureLabel: "Atlas Violencia",
    run: ingestAtlasViolencia,
  },
  {
    source: "ibge",
    fonteColeta: "ibge_sidra",
    heading: "--- IBGE SIDRA ---",
    failureLabel: "IBGE",
    run: ingestIbge,
  },
  {
    source: "ideb",
    fonteColeta: "inep_ideb",
    heading: "--- INEP/IDEB ---",
    failureLabel: "IDEB",
    run: ingestIdeb,
  },
  {
    source: "ipea",
    fonteColeta: "ipeadata",
    heading: "--- IPEA Data ---",
    failureLabel: "IPEA",
    run: ingestIpea,
  },
  {
    source: "google-news",
    heading: "--- Google News RSS ---",
    failureLabel: "Google News",
    run: ingestGoogleNews,
  },
]

/**
 * O registro em `coleta_log` acontece AQUI, e não dentro de cada ingest, de
 * propósito.
 *
 * Todo caminho real de execução passa por este arquivo: os três comandos do
 * .github/workflows/ingest.yml são `npx tsx scripts/ingest-all.ts <fonte>`. Um
 * único ponto cobre os 20+ ingests e cobre também o que for adicionado depois,
 * enquanto espalhar a chamada pelos ingests exigiria acertar cada `return
 * results` (a Câmara, o CAPAG, a filiação e o TSE têm mais de um) e deixaria
 * fonte nova sem rastro por esquecimento, que é o modo de falha exato que o
 * `coleta_log` existe para tornar visível.
 *
 * O que um ingest precisa fazer por conta própria é só o que este ponto não
 * consegue saber: declarar `coleta_resultado` quando sabe distinguir "a fonte
 * respondeu vazio" de "a consulta falhou", e registrar tentativa quando volta
 * antes de montar resultado nenhum (o caso da credencial ausente em
 * ingest-transparencia-sanctions e ingest-transparencia).
 */
async function runIngestTask(task: IngestTask, allResults: IngestResult[]): Promise<boolean> {
  log("pipeline", task.heading)

  try {
    task.before?.()
    const results = await task.run()
    if (results) {
      allResults.push(...results)
      await registrarColetaDeResultados(results)
    }
    return true
  } catch (err) {
    error("pipeline", `${task.failureLabel} falhou: ${err}`)

    // A tarefa morreu antes de devolver resultado, então não há por candidato o
    // que registrar. Uma linha de escopo global deixa o rastro de que a fonte
    // foi tentada e quebrou nesta execução, que é o que separa "a fonte falhou"
    // de "ninguém foi lá".
    await registrarColeta({
      fonte: task.fonteColeta ?? task.source,
      alvo: task.fonteColeta ?? task.source,
      escopo: "global",
      resultado: "erro",
      detalhe: `${task.failureLabel} falhou: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500),
    })
    return false
  }
}

function shouldShowHistoricoReminder(selectedSources: Set<IngestSource>): boolean {
  return selectedSources.has("tse-historico") || selectedSources.has("wikidata-politico")
}

async function main() {
  log("pipeline", `Iniciando ingestao: ${sources.join(", ")}`)
  const start = Date.now()
  const allResults: IngestResult[] = []
  const selectedSources = new Set(sources)
  let taskFailures = 0

  for (const task of INGEST_TASKS) {
    if (selectedSources.has(task.source)) {
      const ok = await runIngestTask(task, allResults)
      if (!ok) taskFailures++
    }
  }

  const totalRows = allResults.reduce((s, r) => s + r.rows_upserted, 0)
  const totalErrors = allResults.reduce((s, r) => s + r.errors.length, 0)
  const totalWarnings = allResults.reduce((s, r) => s + (r.warnings?.length ?? 0), 0)
  const duration = ((Date.now() - start) / 1000).toFixed(1)

  log("pipeline", ``)
  log("pipeline", `=== Resumo ===`)
  log("pipeline", `Tempo: ${duration}s`)
  log("pipeline", `Rows upserted: ${totalRows}`)
  log("pipeline", `Errors: ${totalErrors}`)
  log("pipeline", `Warnings: ${totalWarnings}`)

  if (totalWarnings > 0) {
    log("pipeline", `Avisos não fatais por candidato:`)
    for (const r of allResults.filter((r) => (r.warnings?.length ?? 0) > 0)) {
      warn("pipeline", `  ${r.source}/${r.candidato}: ${r.warnings!.join("; ")}`)
    }
  }

  if (totalErrors > 0 || taskFailures > 0) {
    log("pipeline", ``)
    log("pipeline", `Erros por candidato:`)
    for (const r of allResults.filter((r) => r.errors.length > 0)) {
      error("pipeline", `  ${r.source}/${r.candidato}: ${r.errors.join("; ")}`)
    }
    if (taskFailures > 0) error("pipeline", `  ${taskFailures} fonte(s) falharam antes de devolver resultados`)
    process.exit(1)
  }

  if (shouldShowHistoricoReminder(selectedSources)) {
    log(
      "pipeline",
      "Histórico: após alterar TSE/Wikidata, rode `node --import tsx --test tests/release-verify-historico.test.ts` e a suíte CI para validar duplicatas/observações."
    )
  }
}

main()
