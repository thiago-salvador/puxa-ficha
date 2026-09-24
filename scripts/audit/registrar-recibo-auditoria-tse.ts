/**
 * Grava em `coleta_log` o recibo da leitura oficial feita pela auditoria diária
 * (`npm run audit:data-freshness`). Lê só os artefatos que a auditoria já
 * escreveu em `reports/data-freshness/`; não baixa nada de novo.
 *
 * Sem `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` o recibo não é gravado e o
 * aviso vai para o log e para o resumo do run. Com as credenciais, a gravação é
 * estrita: se falhar, o processo sai com erro, para o recibo não sumir calado.
 *
 * Uso: node --import tsx scripts/audit/registrar-recibo-auditoria-tse.ts [--dir=reports/data-freshness]
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { registrarColetaOuFalhar } from "../lib/coleta-log"
import {
  reciboAuditoriaTse,
  temCredencialDeEscrita,
  type ArtefatosAuditoriaTse,
} from "../lib/data-freshness/tse-audit-receipt"

function lerJson(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null
}

export function lerArtefatosAuditoriaTse(dir: string): ArtefatosAuditoriaTse {
  const source = lerJson(resolve(dir, "source.json"))
  if (!source || typeof source !== "object") {
    throw new Error(`source.json ausente ou inválido em ${dir}`)
  }
  const universe = lerJson(resolve(dir, "universe.json")) as { official?: unknown } | null
  const diff = lerJson(resolve(dir, "diff.json")) as { status?: unknown } | null
  return {
    source: source as ArtefatosAuditoriaTse["source"],
    officialCount: Array.isArray(universe?.official) ? universe.official.length : null,
    diffStatus: typeof diff?.status === "string" ? diff.status : null,
  }
}

async function main(): Promise<void> {
  const dirArg = process.argv.slice(2).find((arg) => arg.startsWith("--dir="))
  const dir = resolve(dirArg ? dirArg.slice("--dir=".length) : "reports/data-freshness")
  const recibo = reciboAuditoriaTse(lerArtefatosAuditoriaTse(dir))
  if (!recibo) {
    console.log("TSE_AUDIT_RECEIPT_SKIPPED: rodada sem leitura ao vivo da fonte oficial")
    return
  }
  if (!temCredencialDeEscrita()) {
    const aviso =
      "Recibo da auditoria TSE não gravado: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ausentes neste job."
    console.log(`::warning::${aviso}`)
    const summary = resolve(dir, "summary.md")
    if (existsSync(summary)) appendFileSync(summary, `\n> ${aviso}\n`)
    return
  }
  await registrarColetaOuFalhar(recibo)
  console.log(`TSE_AUDIT_RECEIPT_RECORDED: ${recibo.resultado} volume=${recibo.volume ?? 0}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
