/**
 * Busca nominal de checagens nas agências, com recibo por candidato.
 *
 *   npm run coletar:checagens -- [--roster ARQUIVO] [--slugs a,b] [--out DIR]
 *     [--catalogo scripts/data/checagens-recibos.json] [--gravar-log]
 *   npm run coletar:checagens -- --de-recibos DIR/recibos.json [--catalogo ...] [--gravar-log]
 *   npm run coletar:checagens -- --retomar DIR/recibos.json --out DIR2  (refaz só os recibos com erro)
 *
 * Sem `--gravar-log` é dry-run: grava só os arquivos de saída. Com a flag, os
 * recibos vão para `public.coleta_log` (fonte `checagens-agencias`) com a
 * chave de serviço, em insert estrito que derruba o processo se falhar.
 * Nenhuma checagem é publicada aqui: leads seguem para revisão editorial.
 *
 * Sai 1 quando alguma candidatura termina em `erro`, depois de gravar tudo o
 * que foi possível: a rotina agendada precisa aparecer vermelha nesse caso.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"

import { carregarCandidatos } from "./falas-monitoramento"
import { EXECUCAO, montarLinhas } from "./lib/coleta-log"
import {
  coletarChecagens,
  consolidarCatalogoRecibos,
  entradaColetaDoRecibo,
  mesclarRecibos,
  resumirColeta,
  type CandidatoChecagem,
  type CatalogoRecibosChecagens,
  type ReciboChecagem,
} from "./lib/checagens-coleta"

const USER_AGENT = "Mozilla/5.0 (compatible; PuxaFichaChecagens/1.0; +https://puxaficha.com.br/metodologia)"

function opcoes(argv: string[]): { valores: Map<string, string>; flags: Set<string> } {
  const valores = new Map<string, string>()
  const flags = new Set<string>()
  for (let indice = 0; indice < argv.length; indice++) {
    const arg = argv[indice]
    if (!arg.startsWith("--")) throw new Error(`Argumento inválido: ${arg}`)
    if (arg === "--gravar-log" || arg === "--help") {
      flags.add(arg.slice(2))
      continue
    }
    const igual = arg.indexOf("=")
    if (igual > 0) valores.set(arg.slice(2, igual), arg.slice(igual + 1))
    else {
      const valor = argv[++indice]
      if (!valor || valor.startsWith("--")) throw new Error(`Valor ausente para ${arg}`)
      valores.set(arg.slice(2), valor)
    }
  }
  return { valores, flags }
}

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/xml;q=0.9" }, signal: AbortSignal.timeout(20_000) })
  return { status: response.status, body: await response.text() }
}

async function gravarColetaLog(recibos: readonly ReciboChecagem[]): Promise<number> {
  for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file)
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias com --gravar-log")
  const client = createClient(url, key, { auth: { persistSession: false } })
  const ids = new Map(recibos.map((recibo) => [recibo.candidate_slug, recibo.candidate_id]))
  const linhas = montarLinhas(recibos.map(entradaColetaDoRecibo), ids)
  for (let inicio = 0; inicio < linhas.length; inicio += 100) {
    const { error } = await client.from("coleta_log").insert(linhas.slice(inicio, inicio + 100))
    if (error) throw new Error(`coleta_log recusou o lote ${inicio / 100 + 1}: ${error.message}`)
  }
  return linhas.length
}

/**
 * Grava recibos de uma rodada já feita, sem buscar de novo. É o caminho do
 * dry-run revisado: o mesmo arquivo conferido é o que vai para o banco.
 */
function lerRecibos(arquivo: string): ReciboChecagem[] {
  const bruto = JSON.parse(readFileSync(arquivo, "utf8")) as { schema_version?: string; receipts?: ReciboChecagem[] }
  if (bruto.schema_version !== "checagens-recibos-v1" || !Array.isArray(bruto.receipts)) throw new Error("Arquivo de recibos inválido")
  if (bruto.receipts.some((recibo) => recibo.schema_version !== "checagens-recibos-v1" || !recibo.candidate_id || !recibo.candidate_slug || !recibo.searched_at)) {
    throw new Error("Recibo sem identidade ou data")
  }
  return bruto.receipts
}

async function registrarRecibosExistentes(arquivo: string, catalogoPath: string | undefined, gravarLog: boolean): Promise<number> {
  const recibos = lerRecibos(arquivo)
  if (catalogoPath) {
    const caminho = resolve(catalogoPath)
    const anterior = existsSync(caminho) ? JSON.parse(readFileSync(caminho, "utf8")) as CatalogoRecibosChecagens : null
    writeFileSync(caminho, JSON.stringify(consolidarCatalogoRecibos(anterior, recibos, new Date()), null, 2) + "\n")
  }
  const linhas = gravarLog ? await gravarColetaLog(recibos) : 0
  console.log(JSON.stringify({ ...resumirColeta(recibos), origem: arquivo, execucao: EXECUCAO, gravou_log: gravarLog, linhas_log: linhas }))
  return 0
}

export async function executarColetaChecagens(argv = process.argv.slice(2)): Promise<number> {
  const { valores, flags } = opcoes(argv)
  if (flags.has("help")) {
    console.log("Uso: coletar:checagens [--roster ARQUIVO] [--slugs a,b] [--out DIR] [--catalogo ARQUIVO] [--concorrencia N] [--pausa-ms N] [--espera-bloqueio-ms N] [--retomar recibos.json] [--gravar-log]")
    return 0
  }
  const inicio = new Date()
  const deRecibos = valores.get("de-recibos")
  if (deRecibos) return registrarRecibosExistentes(resolve(deRecibos), valores.get("catalogo"), flags.has("gravar-log"))
  const rosterPath = valores.get("roster")
  let roster = (rosterPath
    ? JSON.parse(readFileSync(resolve(rosterPath), "utf8"))
    : await carregarCandidatos()) as CandidatoChecagem[]
  const retomar = valores.get("retomar")
  const anteriores = retomar ? lerRecibos(resolve(retomar)) : []
  if (retomar) {
    const comErro = new Set(anteriores.filter((recibo) => recibo.result === "erro").map((recibo) => recibo.candidate_slug))
    roster = roster.filter((candidato) => comErro.has(candidato.slug))
  }
  const slugs = valores.get("slugs")?.split(",").map((slug) => slug.trim()).filter(Boolean)
  if (slugs?.length) {
    const faltando = slugs.filter((slug) => !roster.some((candidato) => candidato.slug === slug))
    if (faltando.length) throw new Error(`Slugs fora do cadastro vivo: ${faltando.join(", ")}`)
    roster = roster.filter((candidato) => slugs.includes(candidato.slug))
  }
  const out = resolve(valores.get("out") ?? `reports/checagens-coleta/${inicio.toISOString().slice(0, 10)}`)
  mkdirSync(out, { recursive: true })
  writeFileSync(resolve(out, "roster.json"), JSON.stringify(roster, null, 2) + "\n")

  let concluidos = 0
  const parciais: ReciboChecagem[] = []
  const parcialPath = resolve(out, "recibos.parcial.json")
  const coletados = await coletarChecagens({
    roster,
    fetchText,
    concorrencia: Number(valores.get("concorrencia") ?? 1),
    pausaMs: Number(valores.get("pausa-ms") ?? 1_000),
    esperaBloqueioMs: Number(valores.get("espera-bloqueio-ms") ?? 30_000),
    onRecibo: (recibo) => {
      concluidos++
      // Checkpoint: uma interrupção não apaga as buscas já feitas.
      parciais.push(recibo)
      writeFileSync(parcialPath, JSON.stringify({ schema_version: "checagens-recibos-v1", execucao: EXECUCAO, receipts: retomar ? mesclarRecibos(anteriores, parciais) : parciais }) + "\n")
      if (concluidos % 20 === 0 || recibo.result === "erro") console.error(`[checagens] ${concluidos}/${roster.length} ${recibo.candidate_slug}: ${recibo.result}`)
    },
  })
  const recibos = retomar ? mesclarRecibos(anteriores, coletados) : coletados
  const resumo = { ...resumirColeta(recibos), inicio: inicio.toISOString(), fim: new Date().toISOString(), execucao: EXECUCAO, gravou_log: false, linhas_log: 0 }
  writeFileSync(resolve(out, "recibos.json"), JSON.stringify({ schema_version: "checagens-recibos-v1", execucao: EXECUCAO, receipts: recibos }, null, 2) + "\n")

  const catalogoPath = valores.get("catalogo")
  if (catalogoPath) {
    const caminho = resolve(catalogoPath)
    const anterior = existsSync(caminho) ? JSON.parse(readFileSync(caminho, "utf8")) as CatalogoRecibosChecagens : null
    writeFileSync(caminho, JSON.stringify(consolidarCatalogoRecibos(anterior, recibos, new Date()), null, 2) + "\n")
  }
  if (flags.has("gravar-log")) {
    resumo.linhas_log = await gravarColetaLog(recibos)
    resumo.gravou_log = true
  }
  writeFileSync(resolve(out, "resumo.json"), JSON.stringify(resumo, null, 2) + "\n")
  console.log(JSON.stringify(resumo))
  return resumo.erro > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  executarColetaChecagens().then((code) => { process.exitCode = code }, (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 2
  })
}
