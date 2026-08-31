import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  collectTseDependentMonitors,
  tseDependentMonitorsMarkdown,
  type TseDependentMonitorConfig,
} from "../lib/data-freshness/tse-dependent-monitors"

function flag(argv: string[], name: string): string | null {
  const prefix = `--${name}=`
  return argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const configPath = resolve(flag(argv, "config") ?? "scripts/data/tse-dependent-monitors.json")
  const out = resolve(flag(argv, "out") ?? "reports/data-freshness/tse-dependent-monitors")
  const config = JSON.parse(readFileSync(configPath, "utf8")) as TseDependentMonitorConfig
  const report = await collectTseDependentMonitors(config, out)
  writeFileSync(resolve(out, "monitor.json"), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(resolve(out, "summary.md"), tseDependentMonitorsMarkdown(report))
  if (report.status === "source_error") {
    console.error(`TSE_DEPENDENT_MONITORS_SOURCE_ERROR: ${report.errors.map((error) => error.error).join(" | ")}`)
    process.exitCode = 2
  } else if (report.status === "review_required") {
    console.error(`TSE_DEPENDENT_MONITORS_REVIEW_REQUIRED: ${report.alerts.map((alert) => alert.message).join(" | ")}`)
    process.exitCode = 1
  } else {
    console.log("TSE_DEPENDENT_MONITORS_OK")
  }
}

void main().catch((error: unknown) => {
  console.error(`TSE_DEPENDENT_MONITORS_SOURCE_ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 2
})
