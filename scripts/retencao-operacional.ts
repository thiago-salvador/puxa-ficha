/**
 * Retenção das tabelas operacionais com janela explicitamente documentada.
 *
 * O padrão é dry-run. `--apply` é a única forma de remover linhas e passa pela
 * trilha de escrita auditada. Este primeiro recorte cobre somente short-links
 * cujo `expires_at` já venceu, que é a única janela objetiva do achado original.
 * Outras tabelas exigem uma janela aprovada antes de entrarem neste script.
 *
 * Uso:
 *   npx tsx scripts/retencao-operacional.ts
 *   npx tsx scripts/retencao-operacional.ts --apply
 */

import { pathToFileURL } from "node:url"

import { escreverAuditado } from "./lib/escrita-auditada"
import { supabase } from "./lib/supabase"

export interface RetencaoOperacionalDeps {
  apply: boolean
  now: Date
  contarShortLinksExpirados: (limiteIso: string) => Promise<number>
  apagarShortLinksExpirados: (limiteIso: string) => Promise<number>
}

export interface RetencaoOperacionalResult {
  mode: "dry-run" | "apply"
  cutoff: string
  tables: Array<{
    table: "quiz_result_short_links"
    policy: "expires_at < now"
    eligible: number
    deleted: number
  }>
}

export function parseRetencaoArgs(argv: string[]): { apply: boolean } {
  const desconhecidos = argv.filter((arg) => arg !== "--apply" && arg !== "--dry-run")
  if (desconhecidos.length > 0) {
    throw new Error(`argumento(s) desconhecido(s): ${desconhecidos.join(", ")}`)
  }
  if (argv.includes("--apply") && argv.includes("--dry-run")) {
    throw new Error("use --apply ou --dry-run, nunca os dois")
  }
  return { apply: argv.includes("--apply") }
}

export async function runRetencaoOperacional({
  apply,
  now,
  contarShortLinksExpirados,
  apagarShortLinksExpirados,
}: RetencaoOperacionalDeps): Promise<RetencaoOperacionalResult> {
  const cutoff = now.toISOString()
  const eligible = await contarShortLinksExpirados(cutoff)
  const deleted = apply && eligible > 0 ? await apagarShortLinksExpirados(cutoff) : 0

  return {
    mode: apply ? "apply" : "dry-run",
    cutoff,
    tables: [
      {
        table: "quiz_result_short_links",
        policy: "expires_at < now",
        eligible,
        deleted,
      },
    ],
  }
}

async function contarShortLinksExpirados(limiteIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("quiz_result_short_links")
    .select("token", { count: "exact", head: true })
    .lt("expires_at", limiteIso)

  if (error) throw new Error(error.message)
  if (count === null) throw new Error("Supabase não devolveu a contagem exata dos short-links expirados")
  return count
}

async function apagarShortLinksExpirados(limiteIso: string): Promise<number> {
  const linhas = await escreverAuditado(
    {
      script: "retencao-operacional",
      tabela: "quiz_result_short_links",
      motivo: "remove short-links de quiz depois do vencimento registrado em expires_at",
      recorte: `expires_at anterior a ${limiteIso}`,
    },
    () =>
      supabase
        .from("quiz_result_short_links")
        .delete()
        .lt("expires_at", limiteIso)
        .select("token"),
  )
  return linhas.length
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { apply } = parseRetencaoArgs(argv)
  const result = await runRetencaoOperacional({
    apply,
    now: new Date(),
    contarShortLinksExpirados,
    apagarShortLinksExpirados,
  })
  console.log(JSON.stringify(result, null, 2))
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
