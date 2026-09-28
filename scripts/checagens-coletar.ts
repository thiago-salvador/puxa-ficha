/**
 * Busca nominal de checagens nas agências, com recibo por candidato.
 *
 *   npm run coletar:checagens -- [--roster ARQUIVO] [--slugs a,b] [--out DIR]
 *     [--catalogo scripts/data/checagens-recibos.json] [--gravar-log]
 *   npm run coletar:checagens -- --de-recibos DIR/recibos.json [--roster R] [--catalogo ...] [--salvar-recibos S] [--gravar-log]
 *     (reaplica a regra de homônimo com o cadastro da rodada: DIR/roster.json ou --roster)
 *     [--decisoes D.json]  (aplica decisões da Mesa e da validação aos leads em revisão, depois do homônimo)
 *   npm run coletar:checagens -- --retomar DIR/recibos.json --out DIR2  (refaz recibos com erro ou com agência sem resposta)
 *
 * Sem `--gravar-log` é dry-run: grava só os arquivos de saída. Com a flag, os
 * recibos vão para `public.coleta_log` (fonte `checagens-agencias`) com a
 * chave de serviço, em insert estrito que derruba o processo se falhar.
 * Nenhuma checagem é publicada aqui: leads seguem para revisão editorial.
 *
 * Sai 1 quando alguma candidatura termina em `erro`, depois de gravar tudo o
 * que foi possível: a rotina agendada precisa aparecer vermelha nesse caso.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"

import { carregarCandidatos, carregarCoorteAtualizacaoPublica } from "./falas-monitoramento"
import { filtrarCoorteAtualizacao } from "./lib/coorte-atualizacao"
import { EXECUCAO, montarLinhas } from "./lib/coleta-log"
import {
  coletarChecagens,
  candidaturasParaRetomada,
  consolidarCatalogoRecibos,
  entradaColetaDoRecibo,
  POLITICA_CHECAGENS,
  BloqueioDeTaxa,
  aplicarDecisoesMesa,
  aplicarRegraHomonimo,
  gruposDeHomonimos,
  validarDecisoesChecagens,
  mesclarRecibos,
  resumirColeta,
  type CandidatoChecagem,
  type CatalogoRecibosChecagens,
  type ReciboChecagem,
} from "./lib/checagens-coleta"

// Os arquivos de UOL e AFP respondem ao identificador real do cliente Node.
const USER_AGENT = "node"

function gravarJsonAtomico(caminho: string, valor: unknown): void {
  const temporario = `${caminho}.${process.pid}.tmp`
  writeFileSync(temporario, JSON.stringify(valor, null, 2) + "\n")
  renameSync(temporario, caminho)
}

function opcoes(argv: string[]): { valores: Map<string, string>; flags: Set<string> } {
  const valores = new Map<string, string>()
  const flags = new Set<string>()
  for (let indice = 0; indice < argv.length; indice++) {
    const arg = argv[indice]
    if (!arg.startsWith("--")) throw new Error(`Argumento inválido: ${arg}`)
    if (arg === "--gravar-log" || arg === "--help" || arg === "--sem-google" || arg === "--parar-no-bloqueio") {
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

async function fetchText(url: string): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  // Identifica o runtime de forma fiel; alguns arquivos bloqueiam user-agents de crawler.
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9", "accept-language": "pt-BR,pt;q=0.9" },
    signal: AbortSignal.timeout(30_000),
  })
  return { status: response.status, body: await response.text(), headers: Object.fromEntries(response.headers) }
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
  if (bruto.receipts.some((recibo) => recibo.policy !== POLITICA_CHECAGENS)) {
    throw new Error(`Política de recibos incompatível; esperado ${POLITICA_CHECAGENS}. Gere uma nova coleta antes de usar --de-recibos ou --retomar`)
  }
  return bruto.receipts
}

/**
 * Reaplica a regra de homônimo com o cadastro completo da própria rodada
 * (roster.json ao lado do arquivo, ou `--roster`). A regra recalcula a partir
 * dos leads crus guardados no recibo, então reimportar não perde lead. Sem
 * cadastro não há como saber quem divide o nome, e a importação é recusada.
 */
function reaplicarHomonimos(recibos: ReciboChecagem[], rosterPath: string): ReciboChecagem[] {
  if (!existsSync(rosterPath)) throw new Error(`Cadastro da rodada ausente (${rosterPath}); informe --roster`)
  const roster = JSON.parse(readFileSync(rosterPath, "utf8")) as CandidatoChecagem[]
  const grupos = gruposDeHomonimos(roster)
  const porChave = new Map(roster.map((candidato) => [`${candidato.id}\u0000${candidato.slug}`, candidato]))
  return recibos.map((recibo) => {
    const chave = `${recibo.candidate_id}\u0000${recibo.candidate_slug}`
    const candidato = porChave.get(chave)
    if (!candidato) throw new Error(`Recibo fora do cadastro da rodada: ${recibo.candidate_slug}`)
    return aplicarRegraHomonimo(recibo, candidato, grupos.get(chave))
  })
}

/** Chaves (id + slug) em grupo de homônimos no cadastro completo. */
function chavesHomonimos(roster: readonly CandidatoChecagem[]): Set<string> {
  return new Set(gruposDeHomonimos(roster).keys())
}

async function registrarRecibosExistentes(arquivo: string, catalogoPath: string | undefined, gravarLog: boolean, rosterPath: string | undefined, salvarPath: string | undefined, decisoesPath?: string): Promise<number> {
  const cadastro = rosterPath ?? resolve(dirname(arquivo), "roster.json")
  const comHomonimo = reaplicarHomonimos(lerRecibos(arquivo), cadastro)
  // Decisões depois do homônimo: a regra de homônimo recalcula a partir dos leads crus.
  const decididos = decisoesPath ? aplicarDecisoesMesa(comHomonimo, validarDecisoesChecagens(JSON.parse(readFileSync(decisoesPath, "utf8")))) : null
  const recibos = decididos?.recibos ?? comHomonimo
  const homonimos = chavesHomonimos(JSON.parse(readFileSync(cadastro, "utf8")) as CandidatoChecagem[])
  // Guarda exatamente o que foi importado, com a regra aplicada: é a proveniência do catálogo.
  if (salvarPath) writeFileSync(salvarPath, JSON.stringify({ schema_version: "checagens-recibos-v1", origem: arquivo, execucao: EXECUCAO, receipts: recibos }, null, 2) + "\n")
  if (catalogoPath) {
    const caminho = resolve(catalogoPath)
    const anterior = existsSync(caminho) ? JSON.parse(readFileSync(caminho, "utf8")) as CatalogoRecibosChecagens : null
    writeFileSync(caminho, JSON.stringify(consolidarCatalogoRecibos(anterior, recibos, new Date(), homonimos), null, 2) + "\n")
  }
  const linhas = gravarLog ? await gravarColetaLog(recibos) : 0
  console.log(JSON.stringify({ ...resumirColeta(recibos), origem: arquivo, execucao: EXECUCAO, gravou_log: gravarLog, linhas_log: linhas,
    ...(decididos ? { decisoes_aplicadas: decididos.aplicadas, decisoes_sem_lead: decididos.sem_lead, mesa_restante: recibos.reduce((total, recibo) => total + (recibo.mesa?.length ?? 0), 0) } : {}) }))
  return 0
}

export async function executarColetaChecagens(argv = process.argv.slice(2)): Promise<number> {
  const { valores, flags } = opcoes(argv)
  if (flags.has("help")) {
    console.log("Uso: coletar:checagens [--roster ARQUIVO] [--slugs a,b] [--out DIR] [--catalogo ARQUIVO] [--concorrencia N] [--pausa-ms N] [--intervalo-host-ms N] [--espera-bloqueio-ms N] [--retomar recibos.json] [--de-recibos recibos.json [--decisoes D.json]] [--sem-google] [--parar-no-bloqueio] [--gravar-log]")
    return 0
  }
  const inicio = new Date()
  const deRecibos = valores.get("de-recibos")
  if (deRecibos) {
    const rosterDaRodada = valores.get("roster")
    const salvar = valores.get("salvar-recibos")
    const decisoes = valores.get("decisoes")
    return registrarRecibosExistentes(resolve(deRecibos), valores.get("catalogo"), flags.has("gravar-log"), rosterDaRodada ? resolve(rosterDaRodada) : undefined, salvar ? resolve(salvar) : undefined, decisoes ? resolve(decisoes) : undefined)
  }
  const retomar = valores.get("retomar")
  // Política e cadastro da rodada anterior são validados antes de qualquer
  // leitura do Supabase; recibo incompatível não depende da rede para falhar.
  const rosterAnterior = valores.get("roster-anterior")
  const anteriores = retomar
    ? reaplicarHomonimos(lerRecibos(resolve(retomar)), rosterAnterior ? resolve(rosterAnterior) : resolve(dirname(resolve(retomar)), "roster.json"))
    : []
  const rosterPath = valores.get("roster")
  // Cadastro completo: fonte dos grupos de homônimos e do roster.json da rodada.
  const rosterCompleto = (rosterPath
    ? JSON.parse(readFileSync(resolve(rosterPath), "utf8"))
    : await carregarCandidatos()) as CandidatoChecagem[]
  // coorte-atualizacao: aplica (alvos da coleta; o cadastro completo segue para os homônimos)
  let roster = filtrarCoorteAtualizacao(rosterCompleto, await carregarCoorteAtualizacaoPublica(), "checagens")
  if (retomar) {
    roster = candidaturasParaRetomada(roster, anteriores)
  }
  const slugs = valores.get("slugs")?.split(",").map((slug) => slug.trim()).filter(Boolean)
  if (slugs?.length) {
    const faltando = slugs.filter((slug) => !roster.some((candidato) => candidato.slug === slug))
    if (faltando.length) throw new Error(`Slugs fora do cadastro vivo: ${faltando.join(", ")}`)
    roster = roster.filter((candidato) => slugs.includes(candidato.slug))
  }
  const out = resolve(valores.get("out") ?? `reports/checagens-coleta/${inicio.toISOString().slice(0, 10)}`)
  mkdirSync(out, { recursive: true })
  writeFileSync(resolve(out, "roster.json"), JSON.stringify(rosterCompleto, null, 2) + "\n")
  writeFileSync(resolve(out, "alvos.json"), JSON.stringify(roster.map((candidato) => candidato.slug), null, 2) + "\n")

  let concluidos = 0
  const parciais: ReciboChecagem[] = []
  const parcialPath = resolve(out, "recibos.parcial.json")
  const catalogoPath = valores.get("catalogo")
  const homonimos = chavesHomonimos(rosterCompleto)
  let parouPorBloqueio: string | null = null
  const coletados = await coletarChecagens({
    roster,
    rosterCompleto,
    fetchText,
    concorrencia: Number(valores.get("concorrencia") ?? 1),
    pausaMs: Number(valores.get("pausa-ms") ?? 1_000),
    // Um pedido a cada 2 s por host, somando buscas por candidatura e leitura dos arquivos de seção.
    intervaloHostMs: Number(valores.get("intervalo-host-ms") ?? 2_000),
    esperaBloqueioMs: Number(valores.get("espera-bloqueio-ms") ?? 30_000),
    semGoogle: flags.has("sem-google"),
    pararNoBloqueio: flags.has("parar-no-bloqueio"),
    onRecibo: (recibo) => {
      concluidos++
      // Checkpoint: uma interrupção não apaga as buscas já feitas.
      parciais.push(recibo)
      writeFileSync(parcialPath, JSON.stringify({ schema_version: "checagens-recibos-v1", execucao: EXECUCAO, receipts: retomar ? mesclarRecibos(anteriores, parciais) : parciais }) + "\n")
      if (catalogoPath) {
        const caminho = resolve(catalogoPath)
        const anterior = existsSync(caminho) ? JSON.parse(readFileSync(caminho, "utf8")) as CatalogoRecibosChecagens : null
        const acumulados = retomar ? mesclarRecibos(anteriores, parciais) : parciais
        gravarJsonAtomico(caminho, consolidarCatalogoRecibos(anterior, acumulados, new Date(), homonimos))
      }
      if (concluidos % 20 === 0 || recibo.result === "erro") console.error(`[checagens] ${concluidos}/${roster.length} ${recibo.candidate_slug}: ${recibo.result}`)
    },
  }).catch((error: unknown) => {
    if (!(error instanceof BloqueioDeTaxa)) throw error
    // Para no primeiro bloqueio: o que já foi concluído é o checkpoint.
    parouPorBloqueio = error.message
    return [...parciais]
  })
  const recibos = retomar ? mesclarRecibos(anteriores, coletados) : coletados
  const resumo = { ...resumirColeta(recibos), inicio: inicio.toISOString(), fim: new Date().toISOString(), execucao: EXECUCAO, gravou_log: false, linhas_log: 0,
    refeitos: coletados.length, pendentes_de_busca: roster.length - coletados.length, parou_por_bloqueio: parouPorBloqueio }
  writeFileSync(resolve(out, "recibos.json"), JSON.stringify({ schema_version: "checagens-recibos-v1", execucao: EXECUCAO, receipts: recibos }, null, 2) + "\n")
  writeFileSync(resolve(out, "mesa-revisao.json"), JSON.stringify({
    schema_version: "checagens-mesa-v1", execucao: EXECUCAO,
    leads: recibos.flatMap((recibo) => (recibo.mesa ?? []).map((lead) => ({
      candidate_id: recibo.candidate_id, candidate_slug: recibo.candidate_slug, ...lead,
    }))),
  }, null, 2) + "\n")

  if (catalogoPath) {
    const caminho = resolve(catalogoPath)
    const anterior = existsSync(caminho) ? JSON.parse(readFileSync(caminho, "utf8")) as CatalogoRecibosChecagens : null
    gravarJsonAtomico(caminho, consolidarCatalogoRecibos(anterior, recibos, new Date(), homonimos))
  }
  const resumoPath = resolve(out, "resumo.json")
  // O resumo sai antes de qualquer falha de gravação: a rodada interrompida também precisa de rastro.
  writeFileSync(resumoPath, JSON.stringify(resumo, null, 2) + "\n")
  if (flags.has("gravar-log") && parouPorBloqueio) throw new Error("Rodada interrompida por limite de taxa: nada gravado no coleta_log")
  if (flags.has("gravar-log")) {
    resumo.linhas_log = await gravarColetaLog(recibos)
    resumo.gravou_log = true
    writeFileSync(resumoPath, JSON.stringify(resumo, null, 2) + "\n")
  }
  console.log(JSON.stringify(resumo))
  // Vermelho quando alguma candidatura ficou sem busca completa, mesmo com lead achado.
  if (parouPorBloqueio) return 3
  return resumo.erro > 0 || resumo.encontrado_parcial > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  executarColetaChecagens().then((code) => { process.exitCode = code }, (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 2
  })
}
