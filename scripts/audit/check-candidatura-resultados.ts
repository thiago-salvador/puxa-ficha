/**
 * Gate de resultados de candidatura.
 *
 * Sem flags, valida o snapshot offline usado no CI. Com --db, faz somente
 * SELECT em historico_politico e falha se uma candidatura anterior ao ciclo
 * corrente não trouxer veredito final nas observações.
 */
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { createClient } from "@supabase/supabase-js"

import {
  linhasSemResultadoFinal,
  parseCiclo,
  type HistoricoCandidaturaGateRow,
} from "./lib/candidatura-resultado-gate"

const RAIZ = resolve(import.meta.dirname, "..", "..")

function flag(argv: string[], nome: string): string | null {
  const prefixo = `--${nome}=`
  const inline = argv.find((item) => item.startsWith(prefixo))
  if (inline) return inline.slice(prefixo.length)
  const indice = argv.indexOf(`--${nome}`)
  return indice >= 0 ? argv[indice + 1] ?? "" : null
}

function carregarEnv() {
  const caminho = join(RAIZ, ".env.local")
  if (!existsSync(caminho)) return
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const m = /^([A-Z_0-9]+)=(.*)$/.exec(linha.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

async function lerBanco(cicloCorrente: number): Promise<HistoricoCandidaturaGateRow[]> {
  carregarEnv()
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("--db exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local")
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const rows: HistoricoCandidaturaGateRow[] = []
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase
      .from("historico_politico")
      .select("id,tipo_evento,periodo_inicio,observacoes")
      .eq("tipo_evento", "candidatura")
      .lt("periodo_inicio", cicloCorrente)
      .order("id")
      .range(inicio, inicio + 999)
    if (error) throw error
    const pagina = (data ?? []) as HistoricoCandidaturaGateRow[]
    rows.push(...pagina)
    if (pagina.length < 1000) break
  }
  return rows
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const cicloCorrente = parseCiclo(flag(argv, "ciclo"))
  const db = flag(argv, "db") !== null
  const snapshot = flag(argv, "snapshot") || join(
    RAIZ,
    "scripts",
    "audit",
    "snapshots",
    "historico-candidaturas-resultado-gate.json",
  )
  const rows = db
    ? await lerBanco(cicloCorrente)
    : (JSON.parse(readFileSync(snapshot, "utf8")) as { linhas: HistoricoCandidaturaGateRow[] }).linhas
  const falhas = linhasSemResultadoFinal(rows, cicloCorrente)
  console.log(JSON.stringify({ modo: db ? "db_read_only" : "snapshot_offline", cicloCorrente, linhas: rows.length, falhas: falhas.length }))
  for (const row of falhas) {
    console.error(`FAIL ${row.id ?? "sem-id"}: candidatura ${row.periodo_inicio} sem resultado final`)
  }
  if (falhas.length) process.exitCode = 1
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
