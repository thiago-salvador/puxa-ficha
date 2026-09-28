/** Combina apenas ações classe (a) para a projeção de ficha, sem acesso ao banco. */
import { createHash } from "node:crypto"
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { assertOutsideRepository } from "./lib/private-output"

type Cell = { slug: string; family: string; category: string }
type Action = { tipo: string; slug: string; ano_eleicao?: number; source_complete?: boolean }
type Family = "financiamento" | "patrimonio" | "historico_politico"

const ACTION_FAMILY: Record<string, Family> = {
  atualizar_financiamento: "financiamento", inserir_financiamento: "financiamento", substituir_financiamento: "financiamento", apagar_verificacao: "financiamento",
  substituir_patrimonio: "patrimonio", substituir_historico: "historico_politico",
}

export function combineSafeDisplayPlans(classification: { cells: Cell[] }, plans: Array<{ family: Family; acoes: Action[]; sha256: string }>) {
  const risk = new Set(classification.cells.filter((cell) => cell.category === "identity_review").map((cell) => cell.slug))
  const safe = new Set(classification.cells.filter((cell) => cell.category === "stale_not_projected").map((cell) => `${cell.slug}|${cell.family}`))
  const actions: Action[] = []
  const seen = new Set<string>()
  for (const plan of plans) for (const action of plan.acoes) {
    const needsCompleteSource = ["substituir_financiamento", "substituir_patrimonio", "substituir_historico"].includes(action.tipo)
    if (ACTION_FAMILY[action.tipo] !== plan.family || risk.has(action.slug) || !safe.has(`${action.slug}|${plan.family}`) ||
      (needsCompleteSource && action.source_complete !== true)) {
      throw new Error(`ação fora da classe (a): ${action.tipo}|${action.slug}`)
    }
    const key = `${action.tipo}|${action.slug}|${action.ano_eleicao ?? ""}`
    if (seen.has(key)) throw new Error(`ação duplicada: ${key}`)
    seen.add(key)
    actions.push(action)
  }
  const summary: Partial<Record<Family, number>> = {}
  for (const plan of plans) summary[plan.family] = (summary[plan.family] ?? 0) + plan.acoes.length
  return { schema_version: 1, mode: "dry-run", acoes: actions, inputs: plans.map(({ family, sha256 }) => ({ family, sha256 })), summary }
}

export function finance2026ActionsFromCombined(actions: readonly Action[]): Action[] {
  return actions.filter((action) => ACTION_FAMILY[action.tipo] === "financiamento" &&
    ["atualizar_financiamento", "inserir_financiamento", "apagar_verificacao"].includes(action.tipo))
}

function arg(name: string): string {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3)
  if (!value) throw new Error(`--${name}=... obrigatório`)
  return resolve(value)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const classification = JSON.parse(readFileSync(arg("classification"), "utf8")) as { cells: Cell[] }
  const extract2026 = process.argv.includes("--extract-financiamento-2026-from-combined")
  const inputs = (["financiamento", "patrimonio", "historico_politico"] as const).map((family) => ({ family, path: arg(family) }))
  const historicalFinance = process.argv.find((item) => item.startsWith("--financiamento_historico="))?.slice("--financiamento_historico=".length)
  if (historicalFinance) inputs.push({ family: "financiamento", path: resolve(historicalFinance) })
  const plans = inputs.map(({ family, path }, index) => {
    const data = readFileSync(path)
    const parsed = JSON.parse(data.toString("utf8")) as { acoes?: Action[] }
    if (!Array.isArray(parsed.acoes)) throw new Error(`plano sem acoes[]: ${family}`)
    return { family, acoes: extract2026 && index === 0 ? finance2026ActionsFromCombined(parsed.acoes) : parsed.acoes,
      sha256: createHash("sha256").update(data).digest("hex") }
  })
  const result = combineSafeDisplayPlans(classification, plans)
  const output = assertOutsideRepository(arg("out"), "--out")
  const temporary = `${output}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  renameSync(temporary, output)
  console.log(JSON.stringify({ actions: result.acoes.length, by_family: result.summary }))
}
