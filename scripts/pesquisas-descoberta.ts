import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { listarAlvosMonitoramento } from "./lib/pesquisas-monitoramento"
import { executarDescobertaIntegrada } from "./lib/pesquisas-monitoramento-descoberta"

async function main() {
  const args = process.argv.slice(2)
  const options = new Map<string, string>()
  const validateTargets = args.includes("--validate-targets")
  const values = args.filter((arg) => arg !== "--validate-targets")
  for (let index = 0; index < values.length; index += 2) {
    if (!["--out", "--source", "--registry-from", "--registry-to"].includes(values[index]) || !values[index + 1] || values[index + 1].startsWith("--")) throw new Error("opção de descoberta inválida")
    options.set(values[index], values[index + 1])
  }
  const output = resolve(options.get("--out") ?? "reports/pesquisas-descoberta")
  const sourceId = options.get("--source") ?? "all"
  const targets = listarAlvosMonitoramento()
  const today = new Date().toISOString().slice(0, 10)
  const dateTo = options.get("--registry-to") ?? today
  const dateFrom = options.get("--registry-from") ?? "2026-01-01"
  const payload = await executarDescobertaIntegrada({ targets, sourceId, validateTargets, dateFrom, dateTo })
  const { observations, coverage, intake } = payload
  mkdirSync(output, { recursive: true })
  if (intake) writeFileSync(resolve(output, "discovered-targets.json"), `${JSON.stringify(intake, null, 2)}\n`)
  writeFileSync(resolve(output, "discovery.json"), `${JSON.stringify(payload, null, 2)}\n`)
  writeFileSync(resolve(output, "registry-inventory.json"), `${JSON.stringify(payload.inventory, null, 2)}\n`)
  const summary = ["# Descoberta de pesquisas", "", `Estado: ${payload.status}. Fila: ${payload.queue_status}. Cobertura inventariada: ${coverage.length} geografias. Período de registro: ${dateFrom} a ${dateTo}.`, "", ...observations.map((observation) => `- ${observation.id}: ${observation.status}; ${observation.links.length} links candidatos.`), "", "A lista ainda não comprova atualização dos dados nem ausência de pesquisas.", ""].join("\n")
  writeFileSync(resolve(output, "summary.md"), summary)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `status=${payload.status}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  console.log(summary)
  // Partial coverage is an actionable diagnostic, never a healthy freshness run.
  process.exitCode = 1
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
