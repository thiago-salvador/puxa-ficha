import { writeFileSync } from "fs"
import { resolve } from "path"
import { loadCandidatos } from "./lib/helpers"
import { log } from "./lib/logger"
import { supabase } from "./lib/supabase"

const REPORT_PATH = resolve(process.cwd(), "scripts/completude-report.json")

type CountTable =
  | "patrimonio"
  | "financiamento"
  | "votos_candidato"
  | "gastos_parlamentares"
  | "historico_politico"
  | "processos"
  | "projetos_lei"

interface CandidateRow {
  id: string
  slug: string
  cargo_atual: string | null
  cpf: string | null
}

function buildCountMap(rows: { candidato_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.candidato_id, (counts.get(row.candidato_id) ?? 0) + 1)
  }
  return counts
}

async function fetchTableCounts(
  table: CountTable,
  candidateIds: string[]
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from(table)
    .select("candidato_id")
    .in("candidato_id", candidateIds)

  if (error) {
    throw new Error(`Falha ao auditar ${table}: ${error.message}`)
  }

  return buildCountMap((data ?? []) as { candidato_id: string }[])
}

async function main() {
  const candidatos = loadCandidatos()
  const slugs = candidatos.map((candidato) => candidato.slug)

  const { data, error } = await supabase
    .from("candidatos")
    .select("id, slug, cargo_atual, cpf")
    .in("slug", slugs)

  if (error) {
    throw new Error(`Falha ao carregar candidatos do Supabase: ${error.message}`)
  }

  const dbRows = (data ?? []) as CandidateRow[]
  const dbBySlug = new Map(dbRows.map((row) => [row.slug, row]))
  const candidateIds = dbRows.map((row) => row.id)

  const [
    patrimonioCounts,
    financiamentoCounts,
    votosCounts,
    gastosCounts,
    historicoCounts,
    processosCounts,
    projetosCounts,
  ] = await Promise.all([
    fetchTableCounts("patrimonio", candidateIds),
    fetchTableCounts("financiamento", candidateIds),
    fetchTableCounts("votos_candidato", candidateIds),
    fetchTableCounts("gastos_parlamentares", candidateIds),
    fetchTableCounts("historico_politico", candidateIds),
    fetchTableCounts("processos", candidateIds),
    fetchTableCounts("projetos_lei", candidateIds),
  ])

  const detalhes = candidatos.map((candidato) => {
    const dbRow = dbBySlug.get(candidato.slug)
    const candidatoId = dbRow?.id || null

    return {
      slug: candidato.slug,
      id: candidatoId,
      cargo_atual: dbRow?.cargo_atual ?? null,
      cpf: dbRow?.cpf ?? null,
      ids_camara: candidato.ids.camara,
      ids_senado: candidato.ids.senado,
      tse_sq_candidato: candidato.ids.tse_sq_candidato,
      counts: {
        patrimonio: candidatoId ? patrimonioCounts.get(candidatoId) ?? 0 : 0,
        financiamento: candidatoId ? financiamentoCounts.get(candidatoId) ?? 0 : 0,
        votos: candidatoId ? votosCounts.get(candidatoId) ?? 0 : 0,
        gastos: candidatoId ? gastosCounts.get(candidatoId) ?? 0 : 0,
        historico: candidatoId ? historicoCounts.get(candidatoId) ?? 0 : 0,
        processos: candidatoId ? processosCounts.get(candidatoId) ?? 0 : 0,
        projetos: candidatoId ? projetosCounts.get(candidatoId) ?? 0 : 0,
      },
    }
  })

  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      total_json: candidatos.length,
      total_db: dbRows.length,
      com_patrimonio: detalhes.filter((item) => item.counts.patrimonio > 0).length,
      com_financiamento: detalhes.filter((item) => item.counts.financiamento > 0).length,
      com_votos: detalhes.filter((item) => item.counts.votos > 0).length,
      com_gastos: detalhes.filter((item) => item.counts.gastos > 0).length,
      com_historico: detalhes.filter((item) => item.counts.historico > 0).length,
      com_processos: detalhes.filter((item) => item.counts.processos > 0).length,
      com_projetos: detalhes.filter((item) => item.counts.projetos > 0).length,
      com_cargo_atual: detalhes.filter((item) => !!item.cargo_atual).length,
      com_cpf: detalhes.filter((item) => !!item.cpf).length,
    },
    missing_in_db: candidatos
      .filter((candidato) => !dbBySlug.has(candidato.slug))
      .map((candidato) => candidato.slug),
    camara_sem_cargo_atual: detalhes
      .filter((item) => item.ids_camara && !item.cargo_atual)
      .map((item) => item.slug),
    detalhes,
  }

  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)

  log("audit", `Relatorio salvo em ${REPORT_PATH}`)
  log(
    "audit",
    `Resumo: patrimonio=${report.summary.com_patrimonio}, financiamento=${report.summary.com_financiamento}, cargo_atual=${report.summary.com_cargo_atual}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
