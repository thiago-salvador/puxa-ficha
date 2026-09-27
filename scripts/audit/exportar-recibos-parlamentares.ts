/** Snapshot privado, somente leitura, dos últimos recibos parlamentares. */
import { renameSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { supabase } from "../lib/supabase"
import { assertOutsideRepository } from "./lib/private-output"

const FONTES = [
  "camara-proposicoes", "camara-votacoes", "camara-gastos",
  "senado-proposicoes", "senado-votacoes", "ceaps-senado",
]

export async function lerRecibosParlamentares(): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("coleta_log_ultima")
      .select("fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,url,detalhe,execucao")
      .in("fonte", FONTES).eq("escopo", "candidato")
      .order("alvo").order("fonte").range(offset, offset + 999)
    if (error) throw new Error(`coleta_log_ultima: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) return rows
  }
}

async function main(): Promise<void> {
  const arg = process.argv.find((value) => value.startsWith("--out="))
  if (!arg) throw new Error("uso: --out=<arquivo privado>")
  const target = assertOutsideRepository(arg.slice("--out=".length), "--out")
  const rows = await lerRecibosParlamentares()
  const temporary = `${target}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify({ rows }) + "\n", { mode: 0o600, flag: "wx" })
  renameSync(temporary, target)
  console.log(JSON.stringify({ recibos_parlamentares: rows.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
