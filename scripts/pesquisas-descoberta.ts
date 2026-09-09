import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { listarAlvosMonitoramento } from "./lib/pesquisas-monitoramento"
import { construirCoberturaDescoberta, descobrirPublicacoesPesquisas } from "./lib/pesquisas-monitoramento-descoberta"
import { validarEntradasDescobertas } from "./lib/pesquisas-monitoramento-entrada"

async function main() {
  const args = process.argv.slice(2)
  const options = new Map<string, string>()
  const validateTargets = args.includes("--validate-targets")
  const values = args.filter((arg) => arg !== "--validate-targets")
  for (let index = 0; index < values.length; index += 2) {
    if (!["--out", "--source"].includes(values[index]) || !values[index + 1] || values[index + 1].startsWith("--")) throw new Error("opção de descoberta inválida")
    options.set(values[index], values[index + 1])
  }
  const output = resolve(options.get("--out") ?? "reports/pesquisas-descoberta")
  const sourceId = options.get("--source") ?? "all"
  const targets = listarAlvosMonitoramento()
  const observations = await descobrirPublicacoesPesquisas({ knownUrls: new Set(targets.map((target) => target.url)), sourceId })
  const coverage = construirCoberturaDescoberta({ observations, targets })
  const pending = observations.flatMap((observation) => observation.links).filter((link) => link.state === "pending_validation")
  const intake = validateTargets ? await validarEntradasDescobertas({ observations, knownTargets: targets, sourceId }) : null
  const payload = {
    schema_version: "1.0.0", generated_at: new Date().toISOString(), source_filter: sourceId,
    publication_authorized: false,
    status: observations.some((observation) => observation.status !== "observed") || intake?.entries.some((entry) => entry.status === "blocked") ? "source_failure" : pending.length ? intake ? "targets_ready_for_collection" : "new_urls_pending_validation" : "no_new_urls_in_consulted_listings",
    observations, coverage,
    limitations: ["Listagens públicas consultadas não são inventário exaustivo de pesquisas.", "Indício geográfico no título exige validação no registro e na publicação.", "Nenhum percentual é extraído da manchete; links novos ainda exigem coleta integral.", "Ausência de link não comprova ausência de pesquisa."],
  }
  mkdirSync(output, { recursive: true })
  if (intake) writeFileSync(resolve(output, "discovered-targets.json"), `${JSON.stringify(intake, null, 2)}\n`)
  writeFileSync(resolve(output, "discovery.json"), `${JSON.stringify(payload, null, 2)}\n`)
  const summary = ["# Descoberta de pesquisas", "", `Estado: ${payload.status}. Novas URLs para validar: ${pending.length}. Cobertura inventariada: ${coverage.length} geografias.`, "", ...observations.map((observation) => `- ${observation.id}: ${observation.status}; ${observation.links.length} links candidatos.`), "", "A lista ainda não comprova atualização dos dados nem ausência de pesquisas.", ""].join("\n")
  writeFileSync(resolve(output, "summary.md"), summary)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `status=${payload.status}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  console.log(summary)
  if (payload.status === "source_failure") process.exitCode = 1
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
