import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { loadCandidatos, normalizeForMatch } from "./lib/helpers"
import { log } from "./lib/logger"
import { supabase } from "./lib/supabase"

const REPORT_PATH = resolve(process.cwd(), "scripts/completude-report.json")
const OUTPUT_PATH = resolve(process.cwd(), "scripts/pipeline-followup-triage.json")

interface ReportDetail {
  slug: string
  cpf: string | null
  cargo_atual: string | null
  tse_sq_candidato: Record<string, string>
  counts: {
    patrimonio: number
    financiamento: number
  }
}

interface CandidateDBRow {
  id: string
  slug: string
  cpf: string | null
  cargo_atual: string | null
}

interface PatrimonioRow {
  candidato_id: string
  ano_eleicao: number
  created_at: string
  valor_total: number | null
}

interface FinanciamentoRow {
  candidato_id: string
  ano_eleicao: number
  created_at: string
  total_arrecadado: number | null
}

function loadReport(): ReportDetail[] {
  const raw = JSON.parse(readFileSync(REPORT_PATH, "utf-8")) as {
    detalhes: ReportDetail[]
  }

  return raw.detalhes
}

function getCanonicalSlug(slugs: string[]): string {
  return [...slugs].sort((a, b) => {
    const aPenalty = a.includes("-gov-") ? 1 : 0
    const bPenalty = b.includes("-gov-") ? 1 : 0

    if (aPenalty !== bPenalty) {
      return aPenalty - bPenalty
    }

    if (a.length !== b.length) {
      return a.length - b.length
    }

    return a.localeCompare(b)
  })[0]
}

async function main() {
  const candidatos = loadCandidatos()
  const reportDetails = loadReport()
  const reportBySlug = new Map(reportDetails.map((detail) => [detail.slug, detail]))
  const missingSQ = candidatos.filter((candidato) => {
    const sqYears = Object.keys(candidato.ids.tse_sq_candidato ?? {})
    return sqYears.length === 0
  })

  const missingSlugs = missingSQ.map((candidato) => candidato.slug)
  const nameGroups = new Map<string, typeof candidatos>()

  for (const candidato of candidatos) {
    const key = normalizeForMatch(candidato.nome_completo)
    const group = nameGroups.get(key) ?? []
    group.push(candidato)
    nameGroups.set(key, group)
  }

  const { data: dbRows, error: dbError } = await supabase
    .from("candidatos")
    .select("id, slug, cpf, cargo_atual")
    .in("slug", missingSlugs)

  if (dbError) {
    throw new Error(`Falha ao carregar candidatos do Supabase: ${dbError.message}`)
  }

  const candidatesInDB = (dbRows ?? []) as CandidateDBRow[]
  const dbBySlug = new Map(candidatesInDB.map((row) => [row.slug, row]))
  const candidateIds = candidatesInDB.map((row) => row.id)

  const [{ data: patrimonioRows, error: patrimonioError }, { data: financiamentoRows, error: financiamentoError }] = await Promise.all([
    supabase
      .from("patrimonio")
      .select("candidato_id, ano_eleicao, created_at, valor_total")
      .in("candidato_id", candidateIds),
    supabase
      .from("financiamento")
      .select("candidato_id, ano_eleicao, created_at, total_arrecadado")
      .in("candidato_id", candidateIds),
  ])

  if (patrimonioError) {
    throw new Error(`Falha ao carregar patrimonio: ${patrimonioError.message}`)
  }

  if (financiamentoError) {
    throw new Error(`Falha ao carregar financiamento: ${financiamentoError.message}`)
  }

  const patrimonioByCandidate = new Map<string, PatrimonioRow[]>()
  for (const row of (patrimonioRows ?? []) as PatrimonioRow[]) {
    const entries = patrimonioByCandidate.get(row.candidato_id) ?? []
    entries.push(row)
    patrimonioByCandidate.set(row.candidato_id, entries)
  }

  const financiamentoByCandidate = new Map<string, FinanciamentoRow[]>()
  for (const row of (financiamentoRows ?? []) as FinanciamentoRow[]) {
    const entries = financiamentoByCandidate.get(row.candidato_id) ?? []
    entries.push(row)
    financiamentoByCandidate.set(row.candidato_id, entries)
  }

  const entries = missingSQ.map((candidato) => {
    const report = reportBySlug.get(candidato.slug)
    const dbRow = dbBySlug.get(candidato.slug)
    const sameName = nameGroups.get(normalizeForMatch(candidato.nome_completo)) ?? []
    const relatedWithSQ = sameName.filter((item) => item.slug !== candidato.slug && Object.keys(item.ids.tse_sq_candidato ?? {}).length > 0)
    const patrimonios = dbRow ? patrimonioByCandidate.get(dbRow.id) ?? [] : []
    const financiamentos = dbRow ? financiamentoByCandidate.get(dbRow.id) ?? [] : []
    const hasMoney = (report?.counts.patrimonio ?? 0) > 0 || (report?.counts.financiamento ?? 0) > 0
    const canonicalSlug = relatedWithSQ.length > 0
      ? getCanonicalSlug([candidato.slug, ...relatedWithSQ.map((item) => item.slug)])
      : null

    if (relatedWithSQ.length > 0) {
      return {
        slug: candidato.slug,
        classification: "duplicata",
        priority: "media",
        rationale: "Mesmo nome ja possui slug correlato com SQ_CANDIDATO persistido.",
        evidence: {
          cargo_disputado: candidato.cargo_disputado,
          related_slugs_with_sq: relatedWithSQ.map((item) => ({
            slug: item.slug,
            cargo_disputado: item.cargo_disputado,
            sq_years: Object.keys(item.ids.tse_sq_candidato ?? {}).sort(),
          })),
        },
        modeling_decision: {
          canonical_slug: canonicalSlug,
          primary_action: "consolidar-historico-tse-no-slug-canonico",
          secondary_action: "deprecar-ou-redirecionar-slug-duplicado-apos-migracao",
        },
      }
    }

    if (hasMoney) {
      const classification = dbRow?.cpf
        ? "tem-dinheiro-sem-sq-validado"
        : "tem-dinheiro-sem-sq-sob-revisao"

      const rationale = dbRow?.cpf
        ? "Ja ha registros TSE no banco e o candidato possui CPF publico no cadastro, entao o caso nao e perfil vazio."
        : "Ha registros TSE no banco, mas falta SQ_CANDIDATO e tambem falta CPF no cadastro; o match continua sem amarra forte."

      return {
        slug: candidato.slug,
        classification,
        priority: dbRow?.cpf ? "baixa" : "alta",
        rationale,
        evidence: {
          cargo_disputado: candidato.cargo_disputado,
          has_cpf: Boolean(dbRow?.cpf),
          patrimonio_years: patrimonios
            .map((row) => row.ano_eleicao)
            .sort((a, b) => a - b),
          financiamento_years: financiamentos
            .map((row) => row.ano_eleicao)
            .sort((a, b) => a - b),
          created_at: {
            patrimonio: patrimonios
              .map((row) => row.created_at)
              .sort(),
            financiamento: financiamentos
              .map((row) => row.created_at)
              .sort(),
          },
        },
        recommended_action: dbRow?.cpf
          ? "manter-fora-do-p0-e-revisar-so-se-o-fix-de-cpf-nao-explicar-o-sq"
          : "promover-para-revisao-junto-com-os-casos-sem-amarracao-forte",
      }
    }

    return {
      slug: candidato.slug,
      classification: "vazio-real",
      priority: candidato.cargo_disputado === "Presidente" ? "alta" : "media",
      rationale: "Nao ha SQ_CANDIDATO persistido e nao ha patrimonio nem financiamento no banco.",
      evidence: {
        cargo_disputado: candidato.cargo_disputado,
        estado: candidato.estado ?? null,
      },
      recommended_action: candidato.cargo_disputado === "Presidente"
        ? "depurar-primeiro-na-fase-2"
        : "depurar-apos-os-presidenciaveis",
    }
  })

  const output = {
    generated_at: new Date().toISOString(),
    summary: {
      total_missing_sq: entries.length,
      duplicata: entries.filter((entry) => entry.classification === "duplicata").length,
      tem_dinheiro_sem_sq_validado: entries.filter((entry) => entry.classification === "tem-dinheiro-sem-sq-validado").length,
      tem_dinheiro_sem_sq_sob_revisao: entries.filter((entry) => entry.classification === "tem-dinheiro-sem-sq-sob-revisao").length,
      vazio_real: entries.filter((entry) => entry.classification === "vazio-real").length,
    },
    entries: entries.sort((a, b) => a.slug.localeCompare(b.slug)),
  }

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`)
  log("audit-sq-followup", `Triagem salva em ${OUTPUT_PATH}`)
  log(
    "audit-sq-followup",
    `Resumo: duplicata=${output.summary.duplicata}, validado=${output.summary.tem_dinheiro_sem_sq_validado}, sob_revisao=${output.summary.tem_dinheiro_sem_sq_sob_revisao}, vazio_real=${output.summary.vazio_real}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
