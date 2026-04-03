import { readFileSync } from "fs"
import { resolve } from "path"

const REPORT_PATH = resolve(
  process.cwd(),
  process.env.COMPLETUDE_REPORT_PATH ?? "scripts/completude-report.json"
)

type SummaryKey =
  | "com_patrimonio"
  | "com_financiamento"
  | "com_votos"
  | "com_gastos"
  | "com_historico"
  | "com_processos"
  | "com_projetos"
  | "com_cargo_atual"
  | "com_cpf"

interface Report {
  generated_at: string
  summary: Record<SummaryKey | "total_json" | "total_db", number>
  missing_in_db?: string[]
}

const DEFAULT_MINIMUMS: Record<SummaryKey, number> = {
  // Piso operacional observado em 2026-04-01. Isso nao promete 100% de cobertura;
  // so impede regressao silenciosa abaixo do baseline ja conquistado.
  com_patrimonio: 123,
  com_financiamento: 117,
  com_votos: 51,
  com_gastos: 19,
  com_historico: 95,
  com_processos: 19,
  com_projetos: 8,
  com_cargo_atual: 67,
  com_cpf: 118,
}

function readReport(): Report {
  return JSON.parse(readFileSync(REPORT_PATH, "utf-8")) as Report
}

function readMinimum(key: SummaryKey): number {
  const envName = `COMPLETUDE_MIN_${key.toUpperCase()}`
  const raw = process.env[envName]
  if (!raw) return DEFAULT_MINIMUMS[key]

  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(`Valor invalido em ${envName}: ${raw}`)
  }

  return value
}

function main() {
  const report = readReport()
  const failures: string[] = []

  if (report.summary.total_db < report.summary.total_json) {
    failures.push(
      `total_db abaixo de total_json (${report.summary.total_db}/${report.summary.total_json})`
    )
  }

  const missing = report.missing_in_db ?? []
  if (missing.length > 0) {
    failures.push(`missing_in_db contem ${missing.length} slug(s): ${missing.join(", ")}`)
  }

  for (const key of Object.keys(DEFAULT_MINIMUMS) as SummaryKey[]) {
    const actual = report.summary[key]
    const minimum = readMinimum(key)

    if (actual < minimum) {
      failures.push(`${key} abaixo do piso (${actual} < ${minimum})`)
    }
  }

  console.log(`Completude report: ${REPORT_PATH}`)
  console.log(`Gerado em: ${report.generated_at}`)
  console.log(
    `Resumo: patrimonio=${report.summary.com_patrimonio}, financiamento=${report.summary.com_financiamento}, votos=${report.summary.com_votos}, gastos=${report.summary.com_gastos}, historico=${report.summary.com_historico}, processos=${report.summary.com_processos}, projetos=${report.summary.com_projetos}, cargo_atual=${report.summary.com_cargo_atual}, cpf=${report.summary.com_cpf}`
  )

  if (failures.length > 0) {
    console.error("\nGate de completude falhou:")
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exit(1)
  }

  console.log("\nGate de completude OK")
}

main()
