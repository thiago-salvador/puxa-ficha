#!/usr/bin/env node
// Driver do batch nacional restante dos programas de governo (governadores 2026).
// Fila por candidato (nunca por UF), concorrencia adaptativa com rampa 2->4->6,
// retomada granular com estados atomicos e semaforo global de processos geradores.
// Este arquivo so orquestra processos do CLI canonico; nenhuma chamada de modelo aqui.
//
// Uso (node24 = binario Node 24 resolvido em node24.json):
//   node24 batch-driver.mjs plan --run-dir=<dir> --inventory=<json> --archive-dir=<dir> --work-dir=<dir>
//   node24 batch-driver.mjs run --run-dir=<dir> --inventory=<json> --archive-dir=<dir> --work-dir=<dir> \
//        --models-config=<json> [--max-minutos=<n>]
//   node24 batch-driver.mjs consolidar --run-dir=<dir> --inventory=<json> [--norte-ondas-dir=<dir>]
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DIR_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const CLI = "scripts/programas-governo-governadores-2026.ts"

export const REGIOES = {
  norte: ["AC", "AP", "AM", "PA", "RO", "RR", "TO"],
  nordeste: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  "centro-oeste": ["DF", "GO", "MS", "MT"],
  sudeste: ["ES", "MG", "RJ", "SP"],
  sul: ["PR", "RS", "SC"],
}
export const UFS_NORTE = REGIOES.norte
export const UFS_RESTANTES = ["nordeste", "centro-oeste", "sudeste", "sul"].flatMap((regiao) => REGIOES[regiao])

export const LIMITE_CONCORRENCIA = 6
export const LIMITE_SLOTS_GERADOR = 6
export const MAX_MULTIPASSAGEM_SIMULTANEOS = 2
export const MAX_TENTATIVAS_CANDIDATO = 2
export const PASSAGENS_CONCORRENCIA_INTERNA = 3
export const DISPAROS_RAMPA = { para4: 4, para6: 10, fimRampa: 18 }
export const THROUGHPUT_NORTE_CAND_H = 13.8
export const MS_MINUTO = 60_000

const PADRAO_COTA = /quota|rate.?limit|429|401|403|unauthor|forbidden|credit|billing|usage.?limit|insufficient/iu
const PADRAO_SQ = /^\d{11,12}$/u

export function eErroCota(texto) {
  return PADRAO_COTA.test(String(texto ?? ""))
}

export function regiaoDaUf(uf) {
  const par = Object.entries(REGIOES).find(([, ufs]) => ufs.includes(uf))
  return par ? par[0] : null
}

export function slotsDeItem(item) {
  if (!item.multipassagem) return 1
  return Math.min(PASSAGENS_CONCORRENCIA_INTERNA, Math.max(1, item.passagensPlanejadas))
}

export function classificarRegistro(registro) {
  if (!registro || typeof registro !== "object") {
    return { estado: "retryable_error", motivo: "registro nao materializado" }
  }
  if (registro.estado === "perfil_local_ausente" || registro.estado === "sem_documento_oficial") {
    return { estado: "complete", motivo: registro.estado }
  }
  if (registro.estado === "falha_de_extracao") {
    return { estado: "blocked", motivo: `falha_de_extracao: ${registro.ingestao?.erro ?? "sem motivo"}` }
  }
  if (registro.estado !== "em_revisao") {
    return { estado: "retryable_error", motivo: `estado inesperado ${String(registro.estado)}` }
  }
  if (registro.julgamento && registro.ingestao?.eval?.completo === true) {
    return { estado: "complete", motivo: "em_revisao_eval_completo" }
  }
  if (registro.julgamento && registro.ingestao?.eval?.completo === false) {
    return { estado: "blocked", motivo: `vereditos nao-sim: ${registro.ingestao.eval.blockers}` }
  }
  return { estado: "retryable_error", motivo: registro.ingestao?.erro ?? "modelos encerrados sem julgamento materializado" }
}

function percentil(valores, p) {
  if (!valores.length) return 0
  const ordenados = [...valores].sort((a, b) => a - b)
  const indice = Math.min(ordenados.length - 1, Math.ceil(p * ordenados.length) - 1)
  return ordenados[Math.max(0, indice)]
}

function mediana(valores) {
  return percentil(valores, 0.5)
}

function memoriaEstavel() {
  const livreGB = os.freemem() / 2 ** 30
  const carga = os.loadavg()[0]
  return livreGB > 2 && carga < os.cpus().length * 2
}

let probeRecursos = memoriaEstavel

export function definirProbeRecursos(fn) {
  probeRecursos = fn
}

export function escaladaPermitida(metricas) {
  if (!metricas) return false
  if (metricas.errosCota > 0) return false
  if (metricas.tentativas < 4) return false
  if (metricas.tentativas > 0 && metricas.errosTecnicos / metricas.tentativas > 0.05) return false
  if (metricas.latenciaP95Base > 0 && metricas.latenciaP95Ultimos > metricas.latenciaP95Base * 1.5) return false
  return probeRecursos()
}

export function concorrenciaAlvo({ disparos, concorrenciaAtual, metricas }) {
  const alvoRampa = disparos < DISPAROS_RAMPA.para4 ? 2 : disparos < DISPAROS_RAMPA.para6 ? 4 : 6
  if (disparos < DISPAROS_RAMPA.fimRampa) {
    if (alvoRampa > concorrenciaAtual && !escaladaPermitida(metricas)) return concorrenciaAtual
    return alvoRampa
  }
  if (!escaladaPermitida(metricas)) return Math.max(2, concorrenciaAtual - 2)
  if (concorrenciaAtual < 6) return Math.min(6, concorrenciaAtual + 2)
  return concorrenciaAtual
}

async function escreverAtomico(destino, conteudo) {
  const temporario = `${destino}.tmp-${process.pid}`
  await writeFile(temporario, conteudo)
  await rename(temporario, destino)
}

function argumento(nome) {
  const prefixo = `--${nome}=`
  const achado = process.argv.find((item) => item.startsWith(prefixo))
  return achado ? achado.slice(prefixo.length) : undefined
}

export function dirDoCandidato(runDir, item) {
  return path.join(runDir, "candidatos", item.chaveCacheDir)
}

export function caminhoRegistro(runDir, item) {
  const nome = `${item.slug ?? item.sqCandidato}.json`
  return path.join(dirDoCandidato(runDir, item), "registros", item.uf, nome)
}

export async function lerRegistro(runDir, item) {
  const caminho = caminhoRegistro(runDir, item)
  if (!existsSync(caminho)) return null
  try {
    return JSON.parse(await readFile(caminho, "utf8"))
  } catch {
    return null
  }
}

async function lerEstadoArquivo(runDir, item) {
  const caminho = path.join(dirDoCandidato(runDir, item), "estado.json")
  if (!existsSync(caminho)) return null
  try {
    return JSON.parse(await readFile(caminho, "utf8"))
  } catch {
    return null
  }
}

async function gravarEstado(runDir, item, campos) {
  const dir = dirDoCandidato(runDir, item)
  await mkdir(dir, { recursive: true })
  const registro = {
    chave: item.chave,
    uf: item.uf,
    sqCandidato: item.sqCandidato,
    estado: campos.estado,
    ...(campos.tentativas !== undefined ? { tentativas: campos.tentativas } : {}),
    ...(campos.motivo !== undefined ? { motivo: campos.motivo } : {}),
    ...(campos.duracaoMs !== undefined ? { duracaoMs: campos.duracaoMs } : {}),
    atualizadoEm: new Date().toISOString(),
  }
  await escreverAtomico(path.join(dir, "estado.json"), `${JSON.stringify(registro, null, 2)}\n`)
}

export async function resolverNode24(runDir) {
  const caminhoEstado = path.join(runDir, "node24.json")
  if (existsSync(caminhoEstado)) {
    try {
      const { bin } = JSON.parse(await readFile(caminhoEstado, "utf8"))
      if (bin && existsSync(bin) && (await versaoDe(bin)).startsWith("24.")) return bin
    } catch {
      // re-resolve abaixo
    }
  }
  const bin = await new Promise((resolver, rejeitar) => {
    const child = spawn("npx", ["-y", "-p", "node@24", "node", "-p", "process.execPath"], {
      stdio: ["ignore", "pipe", "ignore"],
      cwd: DIR_REPO,
    })
    let saida = ""
    child.stdout.on("data", (c) => { saida += c })
    child.on("close", (code) => {
      const linha = saida.trim().split("\n").pop() ?? ""
      if (code === 0 && linha.endsWith("node")) resolver(linha)
      else rejeitar(new Error(`npx node@24 falhou (exit ${code})`))
    })
    child.on("error", rejeitar)
  })
  const versao = await versaoDe(bin)
  if (!versao.startsWith("24.")) throw new Error(`Node 24 nao resolvido; obtido ${versao}`)
  await mkdir(runDir, { recursive: true })
  await escreverAtomico(caminhoEstado, `${JSON.stringify({ bin, versao, resolvidoEm: new Date().toISOString() }, null, 2)}\n`)
  return bin
}

function versaoDe(bin) {
  return new Promise((resolver, rejeitar) => {
    const child = spawn(bin, ["-p", "process.versions.node"], { stdio: ["ignore", "pipe", "ignore"] })
    let saida = ""
    child.stdout.on("data", (c) => { saida += c })
    child.on("close", (code) => (code === 0 ? resolver(saida.trim()) : rejeitar(new Error(`node -p falhou (${code})`))))
    child.on("error", rejeitar)
  })
}

// ---------------------------------------------------------------- plan ----

export async function planoDoBatch({ runDir, inventoryPath, workDir, archiveDir }) {
  const node24 = await resolverNode24(runDir)
  const saidaBruta = await new Promise((resolver, rejeitar) => {
    const args = [
      "--conditions", "react-server", "--import", "tsx", CLI,
      `--ufs=${UFS_RESTANTES.join(",")}`,
      `--inventory=${inventoryPath}`,
      `--archive-dir=${archiveDir ?? ""}`,
      `--output-dir=${path.join(runDir, "plan")}`,
      "--plan-only",
    ]
    const child = spawn(node24, args, { cwd: DIR_REPO, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (c) => { stdout += c })
    child.stderr.on("data", (c) => { stderr += c })
    child.on("close", (code) => (code === 0 ? resolver(stdout) : rejeitar(new Error(`plan-only falhou (exit ${code}): ${stderr.slice(-800)}`))))
  })
  const itens = saidaBruta.trim().split("\n").filter((linha) => linha.startsWith("{")).map((linha) => {
    const item = JSON.parse(linha)
    const regiao = regiaoDaUf(item.uf)
    if (!regiao || regiao === "norte") throw new Error(`fila: UF fora do escopo restante ${item.uf}`)
    if (!PADRAO_SQ.test(item.sqCandidato)) throw new Error(`fila: SQ invalido ${item.sqCandidato}`)
    if (typeof item.custoEstimado !== "number") throw new Error(`fila: custo ausente ${item.chave}`)
    return { ...item, regiao }
  })
  await validarFilaContraInventario(itens, inventoryPath)
  itens.sort((a, b) => b.custoEstimado - a.custoEstimado || a.chave.localeCompare(b.chave, "pt-BR"))
  const dirFila = path.join(runDir, "fila")
  await mkdir(dirFila, { recursive: true })
  await escreverAtomico(
    path.join(dirFila, "fila.ndjson"),
    `${itens.map((item) => JSON.stringify(item)).join("\n")}\n`,
  )
  await escreverAtomico(path.join(dirFila, "plano-resumo.json"), `${JSON.stringify({
    total: itens.length,
    porRegiao: contarPor(itens, "regiao"),
    porUf: contarPor(itens, "uf"),
    usaModelos: itens.filter((item) => item.usaModelos).length,
    semModelos: itens.filter((item) => !item.usaModelos).length,
    multipassagem: itens.filter((item) => item.multipassagem).length,
    passagensTotal: itens.reduce((soma, item) => soma + item.passagensPlanejadas, 0),
    paginas: itens.reduce((soma, item) => soma + item.totalPaginas, 0),
    bytesTexto: itens.reduce((soma, item) => soma + item.bytesTextoExtraidos, 0),
    ordenacao: "custoEstimado desc",
    criadoEm: new Date().toISOString(),
  }, null, 2)}\n`)
  void workDir
  return itens
}

export async function validarFilaContraInventario(itens, inventoryPath) {
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"))
  if (inventory?.escopo?.ano !== 2026 || inventory?.escopo?.cargo !== "GOVERNADOR") {
    throw new Error("inventario fora do escopo 2026:GOVERNADOR")
  }
  const esperadoPorUf = new Map()
  for (const candidatura of inventory.candidaturas) {
    if (UFS_NORTE.includes(candidatura.uf)) continue
    esperadoPorUf.set(candidatura.uf, (esperadoPorUf.get(candidatura.uf) ?? 0) + 1)
  }
  const obtidoPorUf = contarPor(itens, "uf")
  const falhas = []
  for (const [uf, contagem] of esperadoPorUf) {
    if (obtidoPorUf[uf] !== contagem) falhas.push(`${uf}: fila=${obtidoPorUf[uf] ?? 0}; inventario=${contagem}`)
  }
  for (const uf of Object.keys(obtidoPorUf)) {
    if (!esperadoPorUf.has(uf)) falhas.push(`${uf}: UF inesperada na fila`)
  }
  const chaves = new Set(itens.map((item) => item.chave))
  if (chaves.size !== itens.length) falhas.push("chave duplicada na fila")
  if (itens.some((item) => UFS_NORTE.includes(item.uf))) falhas.push("candidatura Norte presente na fila")
  const totalEsperado = [...esperadoPorUf.values()].reduce((a, b) => a + b, 0)
  if (itens.length !== totalEsperado) falhas.push(`total fila=${itens.length}; inventario restante=${totalEsperado}`)
  if (falhas.length) throw new Error(`fila divergente do inventario:\n${falhas.join("\n")}`)
}

function contarPor(itens, campo) {
  const contagem = {}
  for (const item of itens) contagem[item[campo]] = (contagem[item[campo]] ?? 0) + 1
  return contagem
}

// ----------------------------------------------------------------- run ----

const FASES_ORDENADAS = ["extracao.concluida", "gerador.iniciado", "gerador.concluido", "julgamento.iniciado"]

function estadoObservadoDeFases(runDir, item) {
  const dirFases = path.join(dirDoCandidato(runDir, item), "fases")
  let maisRecente = null
  for (const fase of FASES_ORDENADAS) {
    if (existsSync(path.join(dirFases, `${item.uf}-${item.sqCandidato}.${fase}.json`))) maisRecente = fase
  }
  if (maisRecente === "gerador.iniciado") return "generator_pending"
  if (maisRecente === "gerador.concluido") return "generator_complete"
  if (maisRecente === "julgamento.iniciado") return "judge_pending"
  return "extracting"
}

function metricasParaRampa(contexto) {
  const ultimas = contexto.latencias.slice(-8)
  const base = contexto.latenciasBase.slice(0, 4)
  return {
    tentativas: contexto.metricas.tentativas,
    errosTecnicos: contexto.metricas.errosTecnicos,
    errosCota: contexto.metricas.errosCota,
    latenciaP95Ultimos: percentil(ultimas, 0.95),
    latenciaP95Base: percentil(base, 0.95),
  }
}

function proximoAgendavel(contexto) {
  const emVoo = [...contexto.emVoo.values()]
  const slotsEmUso = emVoo.reduce((soma, unidade) => soma + unidade.slots, 0)
  const multipassagemEmVoo = emVoo.filter((unidade) => unidade.multipassagem).length
  for (const unidade of contexto.ordem) {
    if (unidade.estado !== "pending" && unidade.estado !== "retryable_error") continue
    if (contexto.emVoo.size >= contexto.concorrencia) break
    const slots = slotsDeItem(unidade.item)
    if (slotsEmUso + slots > LIMITE_SLOTS_GERADOR) continue
    if (unidade.item.multipassagem && multipassagemEmVoo >= MAX_MULTIPASSAGEM_SIMULTANEOS) continue
    return unidade
  }
  return null
}

export async function executarBatch(params) {
  const { runDir, inventoryPath, workDir, archiveDir, modelsConfig, maxMinutos = 480, pollMs = 2_000, spawnFn = spawn, node24Resolver = resolverNode24, qwenExtraArgs = "", codexExtraArgs = "", filaPath } = params
  const filaCaminho = filaPath ?? path.join(runDir, "fila", "fila.ndjson")
  if (!existsSync(filaCaminho)) throw new Error("fila ausente: rode o modo plan primeiro")
  const itens = (await readFile(filaCaminho, "utf8")).trim().split("\n").filter(Boolean).map((linha) => JSON.parse(linha))
  const node24 = await node24Resolver(runDir)
  await mkdir(path.join(runDir, "logs"), { recursive: true })
  const inicio = Date.now()
  const limiteWall = maxMinutos * MS_MINUTO

  const contexto = {
    runDir,
    workDir,
    archiveDir,
    modelsConfig,
    node24,
    spawnFn,
    qwenExtraArgs,
    codexExtraArgs,
    itens,
    ordem: [],
    emVoo: new Map(),
    concorrencia: 2,
    disparos: 0,
    latencias: [],
    latenciasBase: [],
    parada: null,
    errosCotaConsecutivos: 0,
    metricas: {
      concluidos: 0,
      bloqueados: 0,
      tentativas: 0,
      errosTecnicos: 0,
      errosCota: 0,
      cacheHits: 0,
      chamadas: { generator: 0, judge: 0 },
    },
  }

  // retomada: reconcilia cada item com registro/estado persistidos
  for (const item of itens) {
    const unidade = { item, estado: "pending", tentativas: 1, slots: slotsDeItem(item), multipassagem: item.multipassagem, estadoObservado: null }
    const registro = await lerRegistro(runDir, item)
    const estadoAnterior = await lerEstadoArquivo(runDir, item)
    if (registro) {
      const classificacao = classificarRegistro(registro)
      if (classificacao.estado === "retryable_error" && (estadoAnterior?.tentativas ?? 1) >= MAX_TENTATIVAS_CANDIDATO) {
        unidade.estado = "blocked"
        await gravarEstado(runDir, item, { estado: "blocked", motivo: `falha tecnica apos ${estadoAnterior.tentativas} tentativas: ${classificacao.motivo}`, tentativas: estadoAnterior.tentativas })
      } else {
        unidade.estado = classificacao.estado
        unidade.tentativas = estadoAnterior?.tentativas ?? 1
        await gravarEstado(runDir, item, { estado: classificacao.estado, motivo: classificacao.motivo, tentativas: unidade.tentativas })
      }
    } else if (estadoAnterior?.estado === "blocked" || estadoAnterior?.estado === "complete") {
      unidade.estado = estadoAnterior.estado
      unidade.tentativas = estadoAnterior?.tentativas ?? 1
    } else {
      unidade.tentativas = estadoAnterior?.tentativas ?? 1
      if (unidade.tentativas >= MAX_TENTATIVAS_CANDIDATO) {
        unidade.estado = "blocked"
        await gravarEstado(runDir, item, { estado: "blocked", motivo: "falha tecnica antes do registro; limite de tentativas atingido na retomada", tentativas: unidade.tentativas })
      } else {
        unidade.estado = "pending"
        await gravarEstado(runDir, item, { estado: "pending", tentativas: unidade.tentativas })
      }
    }
    if (unidade.estado === "complete") contexto.metricas.concluidos += 1
    if (unidade.estado === "blocked") contexto.metricas.bloqueados += 1
    contexto.ordem.push(unidade)
  }
  const totalEsperado = itens.length

  while (!contexto.parada) {
    const alvo = concorrenciaAlvo({
      disparos: contexto.disparos,
      concorrenciaAtual: contexto.concorrencia,
      metricas: metricasParaRampa(contexto),
    })
    contexto.concorrencia = alvo
    for (;;) {
      if (contexto.parada || contexto.errosCotaConsecutivos >= 2) break
      const unidade = proximoAgendavel(contexto)
      if (!unidade) break
      await disparar(contexto, unidade, inventoryPath)
    }
    if (contexto.parada) break
    if (contexto.errosCotaConsecutivos >= 2) {
      await parar(contexto, "duas falhas consecutivas de cota/autenticacao")
      break
    }
    if (contexto.emVoo.size === 0) break
    await new Promise((resolver) => setTimeout(resolver, pollMs))
    for (const unidade of contexto.emVoo.values()) {
      const observado = estadoObservadoDeFases(runDir, unidade.item)
      if (observado !== unidade.estadoObservado) {
        unidade.estadoObservado = observado
        await gravarEstado(runDir, unidade.item, { estado: observado, tentativas: unidade.tentativas })
      }
    }
    await atualizarProgress(contexto, totalEsperado, inicio)
    await checarParadasDuras(contexto, totalEsperado, inicio, limiteWall)
  }

  await Promise.all([...contexto.emVoo.values()].map((unidade) => unidade.conclusao))
  await atualizarProgress(contexto, totalEsperado, inicio)
  return {
    parada: contexto.parada,
    total: totalEsperado,
    concluidos: contexto.metricas.concluidos,
    bloqueados: contexto.metricas.bloqueados,
    tentativas: contexto.metricas.tentativas,
    errosTecnicos: contexto.metricas.errosTecnicos,
    errosCota: contexto.metricas.errosCota,
    concorrenciaFinal: contexto.concorrencia,
  }
}

async function disparar(contexto, unidade, inventoryPath) {
  const { runDir, node24, workDir } = contexto
  const item = unidade.item
  const candDir = dirDoCandidato(runDir, item)
  await mkdir(path.join(candDir, "registros"), { recursive: true })
  // fases sao efemeras por tentativa: limpa marcadores obsoletos antes do spawn
  await rm(path.join(candDir, "fases"), { recursive: true, force: true })
  await mkdir(path.join(candDir, "fases"), { recursive: true })
  unidade.estado = "inflight"
  unidade.estadoObservado = "extracting"
  await gravarEstado(runDir, item, { estado: "extracting", tentativas: unidade.tentativas })
  const args = [
    "--conditions", "react-server", "--import", "tsx", CLI,
    `--ufs=${item.uf}`,
    `--sq-candidato=${item.sqCandidato}`,
    `--inventory=${inventoryPath}`,
    `--archive-dir=${contexto.archiveDir}`,
    `--output-dir=${path.join(candDir, "registros")}`,
    `--models-config=${contexto.modelsConfig}`,
    `--cache-dir=${path.join(workDir, "cache-passagens")}`,
    `--extract-cache-dir=${path.join(workDir, "cache-extracao")}`,
    `--fase-dir=${path.join(candDir, "fases")}`,
  ]
  const inicioProcesso = Date.now()
  const conclusao = new Promise((resolver) => {
    let stderr = ""
    try {
      const child = contexto.spawnFn(node24, args, {
        cwd: DIR_REPO,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...(contexto.qwenExtraArgs ? { PF_QWEN_EXTRA_ARGS: contexto.qwenExtraArgs } : {}),
          ...(contexto.codexExtraArgs ? { PF_CODEX_EXTRA_ARGS: contexto.codexExtraArgs } : {}),
        },
      })
      child.stderr?.on("data", (c) => { stderr += c })
      child.on("close", (code) => resolver({ code: code ?? -1, stderr, inicioProcesso }))
      child.on("error", (erro) => resolver({ code: -1, stderr: `${stderr}\n${erro.message}`, inicioProcesso }))
    } catch (erro) {
      resolver({ code: -1, stderr: `${stderr}\n${erro.message}`, inicioProcesso })
    }
  }).then((resultado) => finalizar(contexto, unidade, resultado))
  unidade.conclusao = conclusao
  contexto.emVoo.set(item.chave, unidade)
  contexto.disparos += 1
  contexto.metricas.tentativas += 1
}

async function finalizar(contexto, unidade, { code, stderr, inicioProcesso }) {
  const { runDir, item } = { runDir: contexto.runDir, item: unidade.item }
  const duracao = Date.now() - inicioProcesso
  const registro = await lerRegistro(runDir, item)
  const classificacao = classificarRegistro(registro)
  const textoErro = `${stderr}\n${registro?.ingestao?.erro ?? ""}`
  const cota = eErroCota(textoErro)
  contexto.emVoo.delete(item.chave)
  if (classificacao.estado === "complete") {
    unidade.estado = "complete"
    contexto.metricas.concluidos += 1
    contexto.errosCotaConsecutivos = 0
    contexto.latencias.push(duracao)
    if (contexto.latenciasBase.length < 4) contexto.latenciasBase.push(duracao)
    await contabilizarSucesso(contexto, item, registro)
    await gravarEstado(runDir, item, { estado: "complete", motivo: classificacao.motivo, tentativas: unidade.tentativas, duracaoMs: duracao })
  } else if (classificacao.estado === "blocked" && !cota) {
    unidade.estado = "blocked"
    contexto.metricas.bloqueados += 1
    contexto.errosCotaConsecutivos = 0
    await gravarEstado(runDir, item, { estado: "blocked", motivo: classificacao.motivo, tentativas: unidade.tentativas, duracaoMs: duracao })
  } else {
    const motivo = classificacao.motivo || (code === 0 ? "exit 0 sem registro" : `exit ${code}`)
    if (cota) {
      contexto.metricas.errosCota += 1
      contexto.errosCotaConsecutivos += 1
    } else {
      contexto.metricas.errosTecnicos += 1
      contexto.errosCotaConsecutivos = 0
    }
    if (unidade.tentativas < MAX_TENTATIVAS_CANDIDATO) {
      unidade.estado = "retryable_error"
      unidade.tentativas += 1
      await gravarEstado(runDir, item, { estado: "retryable_error", motivo, tentativas: unidade.tentativas, duracaoMs: duracao })
    } else {
      unidade.estado = "blocked"
      contexto.metricas.bloqueados += 1
      await gravarEstado(runDir, item, { estado: "blocked", motivo: `falha tecnica apos ${unidade.tentativas} tentativas: ${motivo}`, tentativas: unidade.tentativas, duracaoMs: duracao })
    }
  }
  if (contexto.errosCotaConsecutivos >= 2 && !contexto.parada) {
    await parar(contexto, "duas falhas consecutivas de cota/autenticacao")
  }
}

async function contabilizarSucesso(contexto, item, registro) {
  const fasesDir = path.join(dirDoCandidato(contexto.runDir, item), "fases")
  try {
    const extracao = JSON.parse(await readFile(path.join(fasesDir, `${item.uf}-${item.sqCandidato}.extracao.concluida.json`), "utf8"))
    contexto.metricas.cacheHits += extracao.cacheHits ?? 0
  } catch {
    // fase ausente (candidatura sem documentos): sem hit de cache
  }
  const metricas = registro?.ingestao?.modelos?.geracaoMultipassagem
  if (metricas) {
    contexto.metricas.cacheHits += metricas.passagensCacheadas ?? 0
    contexto.metricas.chamadas.generator += (metricas.chamadasGeracao ?? 0) + (metricas.chamadasSintese ?? 0)
  } else if (registro?.ingestao?.modelos?.generator) {
    contexto.metricas.chamadas.generator += registro.ingestao.modelos.generator.attempts ?? 1
  }
  if (registro?.julgamento) contexto.metricas.chamadas.judge += 1
}

async function atualizarProgress(contexto, totalEsperado, inicio) {
  const emVoo = [...contexto.emVoo.values()]
  const concluidos = contexto.metricas.concluidos
  const bloqueados = contexto.metricas.bloqueados
  let generatorAtivo = 0
  let judgeAtivo = 0
  for (const unidade of emVoo) {
    if (unidade.estadoObservado === "extracting" || unidade.estadoObservado === "generator_pending") generatorAtivo += 1
    if (unidade.estadoObservado === "generator_complete" || unidade.estadoObservado === "judge_pending") judgeAtivo += 1
  }
  const decorridoMs = Date.now() - inicio
  const horas = decorridoMs / 3_600_000
  const porHora = horas > 0.05 ? concluidos / horas : 0
  const pendentes = totalEsperado - concluidos - bloqueados - emVoo.length
  const medianaRecente = mediana(contexto.latencias.slice(-10))
  const etaMs = porHora > 0 ? (pendentes / porHora) * 3_600_000 : null
  const progresso = {
    totalEsperado,
    concluidos,
    bloqueados,
    pendentes,
    emVoo: emVoo.length,
    generatorAtivo,
    judgeAtivo,
    concorrenciaAtual: contexto.concorrencia,
    concorrenciaEscolhida: contexto.concorrencia,
    disparos: contexto.disparos,
    taxaErroTecnico: contexto.metricas.tentativas > 0 ? Number((contexto.metricas.errosTecnicos / contexto.metricas.tentativas).toFixed(4)) : 0,
    errosCota: contexto.metricas.errosCota,
    cacheHits: contexto.metricas.cacheHits,
    chamadasPorModelo: contexto.metricas.chamadas,
    tempoDecorridoMs: decorridoMs,
    medianaCandidatoMs: medianaRecente || null,
    throughputPorHora: Number(porHora.toFixed(2)),
    etaMs: etaMs === null ? null : Math.round(etaMs),
    parada: contexto.parada,
    atualizadoEm: new Date().toISOString(),
  }
  await escreverAtomico(path.join(contexto.runDir, "progress.json"), `${JSON.stringify(progresso, null, 2)}\n`)
}

async function checarParadasDuras(contexto, totalEsperado, inicio, limiteWall) {
  if (contexto.parada) return
  const decorrido = Date.now() - inicio
  const concluidos = contexto.metricas.concluidos
  if (contexto.errosCotaConsecutivos >= 2) {
    await parar(contexto, "duas falhas consecutivas de cota/autenticacao")
    return
  }
  if (contexto.metricas.tentativas >= 10 && contexto.metricas.errosTecnicos / contexto.metricas.tentativas > 0.05) {
    await parar(contexto, `taxa de erro tecnico ${(100 * contexto.metricas.errosTecnicos / contexto.metricas.tentativas).toFixed(1)}% > 5%`)
    return
  }
  if (decorrido > 90 * MS_MINUTO && concluidos / decorridoHoras(inicio) <= THROUGHPUT_NORTE_CAND_H) {
    await parar(contexto, `90min sem ganho mensuravel sobre throughput norte (${(concluidos / decorridoHoras(inicio)).toFixed(1)}/h <= ${THROUGHPUT_NORTE_CAND_H}/h)`)
    return
  }
  if (decorrido > 120 * MS_MINUTO) {
    const pendentes = totalEsperado - concluidos - contexto.metricas.bloqueados
    const fracaoConcluida = concluidos / totalEsperado
    const medianaRecente = mediana(contexto.latencias.slice(-10))
    const etaHoras = medianaRecente > 0 && contexto.concorrencia > 0
      ? (pendentes * medianaRecente) / contexto.concorrencia / 3_600_000
      : Number.POSITIVE_INFINITY
    if (fracaoConcluida < 0.25 && etaHoras > 8) {
      await parar(contexto, `2h: ${Math.round(100 * fracaoConcluida)}% concluido e ETA ${etaHoras.toFixed(1)}h > 8h`)
      return
    }
  }
  if (decorrido > limiteWall) await parar(contexto, "wall_time_8h")
}

function decorridoHoras(inicio) {
  return (Date.now() - inicio) / 3_600_000
}

async function parar(contexto, motivo) {
  if (contexto.parada) return
  contexto.parada = motivo
  const pendentes = contexto.ordem
    .filter((unidade) => unidade.estado === "pending" || unidade.estado === "retryable_error")
    .map((unidade) => unidade.item.chave)
  await escreverAtomico(path.join(contexto.runDir, "parada.json"), `${JSON.stringify({
    motivo,
    em: new Date().toISOString(),
    emVoo: [...contexto.emVoo.keys()],
    pendentes,
    concorrencia: contexto.concorrencia,
  }, null, 2)}\n`)
}

// --------------------------------------------------------- consolidar ----

export async function consolidarBatch({ runDir, norteOndasDir }) {
  const filaPath = path.join(runDir, "fila", "fila.ndjson")
  const itens = (await readFile(filaPath, "utf8")).trim().split("\n").filter(Boolean).map((linha) => JSON.parse(linha))
  const ondasDir = path.join(runDir, "ondas")
  const copiados = []
  for (const item of itens) {
    const registro = await lerRegistro(runDir, item)
    if (!registro) continue
    const identidade = `${registro.fonte?.uf}:${registro.fonte?.sqCandidato}`
    const esperada = `${item.uf}:${item.sqCandidato}`
    if (identidade !== esperada) throw new Error(`mistura de candidato: ${identidade} != ${esperada}`)
    if (registro.ingestao?.identityKey !== item.chave) throw new Error(`mistura de identityKey: ${registro.ingestao?.identityKey} != ${item.chave}`)
    if (regiaoDaUf(item.uf) !== item.regiao || item.regiao === "norte") throw new Error(`regiao divergente para ${item.chave}: ${item.regiao}`)
    const destinoUf = path.join(ondasDir, item.regiao, item.uf)
    await mkdir(destinoUf, { recursive: true })
    await copyFile(caminhoRegistro(runDir, item), path.join(destinoUf, `${item.slug ?? item.sqCandidato}.json`))
    copiados.push(`${item.regiao}/${item.uf}/${item.slug ?? item.sqCandidato}`)
  }
  if (norteOndasDir && existsSync(norteOndasDir)) {
    const destinoNorte = path.join(ondasDir, "norte")
    for (const uf of UFS_NORTE) {
      const origemUf = path.join(norteOndasDir, uf)
      if (!existsSync(origemUf)) continue
      await mkdir(path.join(destinoNorte, uf), { recursive: true })
      for (const arquivo of await readdir(origemUf)) {
        if (!arquivo.endsWith(".json")) continue
        await copyFile(path.join(origemUf, arquivo), path.join(destinoNorte, uf, arquivo))
      }
    }
  }
  return { copiados, ondasDir }
}

// ----------------------------------------------------------------- cli ----

async function main() {
  const comando = process.argv[2]
  const runDir = argumento("run-dir")
  const inventoryPath = argumento("inventory")
  const workDir = argumento("work-dir")
  if (!runDir || !inventoryPath) {
    console.error("use plan|run|consolidar --run-dir=<dir> --inventory=<json> [--archive-dir=<dir>] [--work-dir=<dir>] [--models-config=<json>]")
    process.exitCode = 1
    return
  }
  if (Number(process.versions.node.split(".")[0]) !== 24) {
    throw new Error(`Node 24 obrigatorio; atual ${process.versions.node}`)
  }
  await mkdir(runDir, { recursive: true })
  if (comando === "plan") {
    const itens = await planoDoBatch({ runDir, inventoryPath, workDir: workDir ?? path.dirname(runDir), archiveDir: argumento("archive-dir") })
    console.log(`BATCH_PLAN_OK total=${itens.length}`)
    return
  }
  if (comando === "run") {
    const resultado = await executarBatch({
      runDir,
      inventoryPath,
      workDir: workDir ?? path.dirname(runDir),
      archiveDir: argumento("archive-dir"),
      modelsConfig: argumento("models-config"),
      maxMinutos: Number(argumento("max-minutos") ?? 480),
      qwenExtraArgs: argumento("qwen-extra-args") ?? "",
      codexExtraArgs: argumento("codex-extra-args") ?? "",
      filaPath: argumento("fila"),
    })
    console.log(`BATCH_RUN_FIM ${JSON.stringify(resultado)}`)
    return
  }
  if (comando === "consolidar") {
    const resultado = await consolidarBatch({ runDir, norteOndasDir: argumento("norte-ondas-dir") })
    console.log(`BATCH_CONSOLIDAR_OK copiados=${resultado.copiados.length} ondas=${resultado.ondasDir}`)
    return
  }
  throw new Error(`comando desconhecido: ${comando ?? "(ausente)"}`)
}

const eModuloPrincipal = process.argv[1]
  && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href

if (eModuloPrincipal) {
  void main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : String(erro))
    process.exitCode = 1
  })
}
