/** Exporta IDs endereçáveis da Câmara para a prova parlamentar local. Só lê. */
import { renameSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { supabase } from "../lib/supabase"
import { assertOutsideRepository } from "./lib/private-output"

export async function idsVotacoesChaveCamara(): Promise<string[]> {
  const { data, error } = await supabase.from("votacoes_chave")
    .select("casa, fonte, votacao_id_api")
  if (error) throw new Error(`votacoes_chave: ${error.message}`)
  return [...new Set((data ?? [])
    .filter((row) => row.fonte === "camara" && (row.casa === "Câmara" || row.casa === "Camara"))
    .map((row) => String(row.votacao_id_api ?? "").trim())
    .filter((id) => /^\d+-\d+$/.test(id)))].sort()
}

async function main(): Promise<void> {
  const arg = process.argv.find((value) => value.startsWith("--out="))
  if (!arg) throw new Error("uso: --out=<arquivo privado>")
  const target = assertOutsideRepository(arg.slice("--out=".length), "--out")
  const ids = await idsVotacoesChaveCamara()
  if (ids.length === 0) throw new Error("nenhum ID de votação-chave endereçável da Câmara")
  const temporary = `${target}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(ids) + "\n", { mode: 0o600, flag: "wx" })
  renameSync(temporary, target)
  console.log(JSON.stringify({ votacoes_chave_camara: ids.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
