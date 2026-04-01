import { readFileSync } from "fs"
import { resolve } from "path"

const args = process.argv.slice(2)
const reportPath =
  args.find((_, i) => args[i - 1] === "--report") ??
  resolve(process.cwd(), "scripts/audit-factual-report.json")
const maxBlocked = Number(args.find((_, i) => args[i - 1] === "--max-blocked") ?? "0")
const minAssertions = Number(args.find((_, i) => args[i - 1] === "--min-assertions") ?? "0")

interface GateReport {
  resumo: {
    nao_podem_publicar: number
    com_assertions: number
  }
}

const report = JSON.parse(readFileSync(reportPath, "utf-8")) as GateReport

if (report.resumo.nao_podem_publicar > maxBlocked) {
  console.error(
    `Gate factual falhou: ${report.resumo.nao_podem_publicar} bloqueados (max ${maxBlocked})`
  )
  process.exit(1)
}

if (report.resumo.com_assertions < minAssertions) {
  console.error(
    `Gate factual falhou: ${report.resumo.com_assertions} assertions (min ${minAssertions})`
  )
  process.exit(1)
}

console.log(
  `Gate factual OK: ${report.resumo.nao_podem_publicar} bloqueados, ${report.resumo.com_assertions} assertions`
)
