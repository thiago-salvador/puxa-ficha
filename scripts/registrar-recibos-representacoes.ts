/**
 * Grava em `coleta_log` um recibo por candidato público da busca de
 * representações ao Conselho de Ética (Câmara e Senado), a partir das filas
 * locais dos coletores. Não publica representação nenhuma.
 *
 * Padrão dry-run. `--apply` grava, um recibo por vez, pelo caminho estrito;
 * antes, salva ao lado da fila da Câmara o backup das linhas existentes da
 * fonte, e depois confere em `coleta_log_ultima`.
 *
 *   npx tsx scripts/registrar-recibos-representacoes.ts \
 *     --fila-camara=<fila.json> --fila-senado=<fila-pce.json> [--apply]
 */
import { readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

import { registrarColetaOuFalhar } from "./lib/coleta-log"
import { FONTE_REPRESENTACOES, montarRecibosRepresentacoes, type CandidatoPublicoRecibo } from "./lib/representacoes-etica-recibos"
import type { Fila } from "./lib/representacoes-etica-coleta"
import type { FilaPceSenado } from "./lib/representacoes-etica-senado"
import { supabase } from "./lib/supabase"

const IDADE_MAXIMA_FILA_MS = 36 * 3_600_000

function argumento(nome: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3)
}

export function exigirFilaRecente(geradoEm: string, rotulo: string, agora = Date.now()): void {
  const t = Date.parse(geradoEm)
  if (!Number.isFinite(t) || t > agora || agora - t > IDADE_MAXIMA_FILA_MS) {
    throw new Error(`${rotulo}: fila precisa ter sido gerada nas ultimas 36 h`)
  }
}

async function publicos(): Promise<CandidatoPublicoRecibo[]> {
  const { data, error } = await supabase.from("candidatos_publico").select("slug,nome_completo").order("slug").limit(2000)
  if (error) throw new Error(`candidatos_publico: ${error.message}`)
  const linhas = (data ?? []) as CandidatoPublicoRecibo[]
  if (linhas.length === 0 || linhas.length >= 2000) throw new Error("candidatos_publico vazio ou truncado")
  return linhas
}

async function main(): Promise<void> {
  const filaCamara = argumento("fila-camara")
  const filaSenado = argumento("fila-senado")
  if (!filaCamara || !filaSenado) throw new Error("uso: --fila-camara=<json> --fila-senado=<json> [--apply]")
  const camara = JSON.parse(readFileSync(filaCamara, "utf8")) as Fila
  const senado = JSON.parse(readFileSync(filaSenado, "utf8")) as FilaPceSenado
  exigirFilaRecente(camara.gerado_em, "Câmara")
  exigirFilaRecente(senado.gerado_em, "Senado")
  const entradas = montarRecibosRepresentacoes({ publicos: await publicos(), camara, senado })
  const contagem = entradas.reduce<Record<string, number>>((acc, e) => { acc[e.resultado] = (acc[e.resultado] ?? 0) + 1; return acc }, {})
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ modo: "dry-run", fonte: FONTE_REPRESENTACOES, recibos: entradas.length, contagem }))
    return
  }
  const { data: existentes, error } = await supabase.from("coleta_log").select("*").eq("fonte", FONTE_REPRESENTACOES).limit(10_000)
  if (error) throw new Error(`backup: ${error.message}`)
  const backup = `${filaCamara}.backup-${FONTE_REPRESENTACOES}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  writeFileSync(backup, `${JSON.stringify({ linhas: existentes ?? [] }, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  for (const entrada of entradas) await registrarColetaOuFalhar(entrada)
  const { data: ultima, error: erroReadback } = await supabase.from("coleta_log_ultima")
    .select("alvo,resultado,detalhe").eq("fonte", FONTE_REPRESENTACOES).eq("escopo", "candidato").limit(10_000)
  if (erroReadback) throw new Error(`readback: ${erroReadback.message}`)
  const porAlvo = new Map((ultima ?? []).map((l) => [String(l.alvo), l]))
  const divergentes = entradas.filter((e) => porAlvo.get(e.alvo)?.resultado !== e.resultado || porAlvo.get(e.alvo)?.detalhe !== e.detalhe)
  console.log(JSON.stringify({ modo: "apply", backup, inseridos: entradas.length, contagem, readback_divergentes: divergentes.length }))
  if (divergentes.length > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : String(erro))
    process.exitCode = 1
  })
}
