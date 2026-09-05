#!/usr/bin/env node
// Driver do batch nacional restante dos programas de governo (governadores 2026).
// Fila por candidato (nunca por UF), concorrencia adaptativa com rampa 3->4
// (inicial 3, sobe para 4 apenas apos 3 conclusoes), retomada granular com
// estados atomicos e semaforo global de processos geradores.
// Este arquivo so orquestra processos do CLI canonico; nenhuma chamada de modelo aqui.
//
// Uso (node24 = binario Node 24 resolvido em node24.json):
//   node24 batch-driver.mjs plan --run-dir=<dir> --inventory=<json> --archive-dir=<dir> --work-dir=<dir>
//   node24 batch-driver.mjs run --run-dir=<dir> --inventory=<json> --archive-dir=<dir> --work-dir=<dir> \
//        --models-config=<json> [--max-minutos=<n>]
//   node24 batch-driver.mjs consolidar --run-dir=<dir> --inventory=<json> [--norte-ondas-dir=<dir>]
import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, statSync } from "node:fs"
import { appendFile, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
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

export const LIMITE_CONCORRENCIA = 4
export const LIMITE_SLOTS_GERADOR = 6
export const MAX_MULTIPASSAGEM_SIMULTANEOS = 2
export const MAX_TENTATIVAS_CANDIDATO = 2
export const PASSAGENS_CONCORRENCIA_INTERNA = 3
export const DISPAROS_RAMPA = { para4: 3, fimRampa: 6 }
export const THROUGHPUT_NORTE_CAND_H = 13.8
export const MS_MINUTO = 60_000
export const PLANNER_VERSION = "multipassagem-v3"
export const LEASE_TIMEOUT_MS = 120_000

const PADRAO_COTA = /quota|token.?plan|usage.?limit|billing|insufficient|rate.?limit|429|401|403|unauthor|forbidden|credit/iu
const PADRAO_SQ = /^\d{11,12}$/u
const estadoWriteQueues = new Map()
const telemetryWriteQueues = new Map()

function enfileirarEscrita(filas, chave, operacao) {
  const anterior = filas.get(chave) ?? Promise.resolve()
  const atual = anterior.catch(() => {}).then(operacao)
  filas.set(chave, atual)
  return atual.finally(() => {
    if (filas.get(chave) === atual) filas.delete(chave)
  })
}

export function calcularFingerprintFila(itens, plannerVersion = PLANNER_VERSION) {
  const normalizados = [...itens]
    .sort((a, b) => String(a.chave).localeCompare(String(b.chave), "pt-BR"))
    .map((item) => ({
      chave: item.chave,
      uf: item.uf,
      sqCandidato: item.sqCandidato,
      multipassagem: Boolean(item.multipassagem),
      passagensPlanejadas: Number(item.passagensPlanejadas),
      bytesTextoExtraidos: Number(item.bytesTextoExtraidos),
      bytesEntradaEstimados: Number(item.bytesEntradaEstimados),
    }))
  return createHash("sha256").update(JSON.stringify({ plannerVersion, itens: normalizados })).digest("hex")
}

export function validarFilaPlanejada(itens, planejados, manifesto) {
  if (!manifesto || manifesto.plannerVersion !== PLANNER_VERSION) {
    throw new Error(`fila stale: plannerVersion ${manifesto?.plannerVersion ?? "ausente"} != ${PLANNER_VERSION}`)
  }
  const fingerprint = calcularFingerprintFila(itens, PLANNER_VERSION)
  if (manifesto.fingerprint !== fingerprint) throw new Error("fila stale: fingerprint divergente")
  if (!planejados) return
  const esperados = new Map(planejados.map((item) => [item.chave, item]))
  if (esperados.size !== itens.length) throw new Error(`fila stale: total ${itens.length} != planner ${esperados.size}`)
  for (const item of itens) {
    const esperado = esperados.get(item.chave)
    if (!esperado) throw new Error(`fila stale: identidade ausente no planner ${item.chave}`)
    for (const campo of ["multipassagem", "passagensPlanejadas", "bytesTextoExtraidos", "bytesEntradaEstimados"]) {
      if (item[campo] !== esperado[campo]) throw new Error(`fila stale: ${item.chave}.${campo} divergente`)
    }
  }
}

function pidAtivoPadrao(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error?.code !== "ESRCH" }
}

export async function adquirirLeaseExecucao(runDir, options = {}) {
  const executionId = options.executionId ?? randomUUID()
  const pid = options.pid ?? process.pid
  const hostname = options.hostname ?? os.hostname()
  const now = options.now ?? (() => Date.now())
  const timeoutMs = options.timeoutMs ?? LEASE_TIMEOUT_MS
  const pidAtivo = options.pidAtivo ?? pidAtivoPadrao
  const heartbeatMs = options.heartbeatMs ?? Math.max(1_000, Math.floor(timeoutMs / 3))
  const caminho = path.join(runDir, "execution-lease.json")
  const travaAquisicao = path.join(runDir, "execution-lease.acquire")
  await mkdir(runDir, { recursive: true })
  const tentarCriar = async () => {
    const instante = new Date(now()).toISOString()
    const lease = { executionId, pid, hostname, startedAt: instante, heartbeat: instante }
    await writeFile(caminho, `${JSON.stringify(lease, null, 2)}\n`, { flag: "wx" })
    return lease
  }
  let lease
  try {
    await writeFile(travaAquisicao, `${JSON.stringify({ executionId, pid, hostname })}\n`, { flag: "wx" })
  } catch (error) {
    if (error?.code === "EEXIST") {
      let travaAnterior
      try { travaAnterior = JSON.parse(await readFile(travaAquisicao, "utf8")) } catch {}
      const idadeMs = (() => {
        try { return now() - statSync(travaAquisicao).mtimeMs } catch { return 0 }
      })()
      const legivel = travaAnterior && typeof travaAnterior === "object"
      const pidAtivoLocal = legivel && travaAnterior.hostname === hostname && pidAtivo(Number(travaAnterior.pid))
      const lockValidoRemoto = legivel && travaAnterior.hostname !== hostname
      if (idadeMs <= timeoutMs || pidAtivoLocal || lockValidoRemoto) {
        throw new Error(`lease ativa: aquisicao concorrente em ${travaAquisicao}`)
      }
      await rm(travaAquisicao, { force: true })
      try {
        await writeFile(travaAquisicao, `${JSON.stringify({ executionId, pid, hostname })}\n`, { flag: "wx" })
      } catch {
        throw new Error(`lease ativa: corrida ao recuperar trava de aquisicao stale em ${travaAquisicao}`)
      }
    } else throw error
  }
  try {
    try {
      lease = await tentarCriar()
    } catch (error) {
      if (error?.code !== "EEXIST") throw error
      let anterior
      try { anterior = JSON.parse(await readFile(caminho, "utf8")) } catch { throw new Error("lease ativa ou corrompida") }
      const referencia = Date.parse(anterior.heartbeat ?? anterior.startedAt ?? "")
      const expirou = Number.isFinite(referencia) && now() - referencia > timeoutMs
      const pidAusente = anterior.hostname === hostname && !pidAtivo(Number(anterior.pid))
      if (!expirou || !pidAusente) throw new Error(`lease ativa: executionId=${anterior.executionId ?? "desconhecida"}`)
      await rm(caminho, { force: true })
      try { lease = await tentarCriar() } catch { throw new Error("lease ativa: corrida ao recuperar lease stale") }
    }
  } finally {
    await rm(travaAquisicao, { force: true })
  }
  let ativo = true
  let heartbeatPendente = Promise.resolve()
  const timer = setInterval(() => {
    heartbeatPendente = heartbeatPendente.then(async () => {
      if (!ativo) return
      const atualizado = { ...lease, heartbeat: new Date(now()).toISOString() }
      await escreverAtomico(caminho, `${JSON.stringify(atualizado, null, 2)}\n`)
      lease = atualizado
    }).catch(() => {})
  }, heartbeatMs)
  timer.unref?.()
  return {
    caminho,
    executionId,
    pararHeartbeat: async () => {
      ativo = false
      clearInterval(timer)
      await heartbeatPendente
    },
  }
}

export async function liberarLeaseExecucao(lease) {
  await lease?.pararHeartbeat?.()
  if (!lease?.caminho) return
  try {
    const atual = JSON.parse(await readFile(lease.caminho, "utf8"))
    if (atual.executionId === lease.executionId) await rm(lease.caminho, { force: true })
  } catch {}
}

async function marcarProgressFinal(runDir, executionId) {
  const progressPath = path.join(runDir, "progress.json")
  try {
    const progress = JSON.parse(await readFile(progressPath, "utf8"))
    if (progress.executionId !== executionId) return
    const finishedAt = new Date().toISOString()
    await escreverAtomico(progressPath, `${JSON.stringify({
      ...progress,
      finishedAt,
      pid: process.pid,
      lease: "released",
      atualizadoEm: finishedAt,
    }, null, 2)}\n`)
  } catch {
    // Falha antes da primeira escrita de progress nao cria um snapshot enganoso.
  }
}

export function criarContadoresExecucao(historicos = {}) {
  return {
    concluidosHistoricos: historicos.concluidos ?? 0,
    bloqueadosHistoricos: historicos.bloqueados ?? 0,
    concluidosAtuais: 0,
    bloqueadosAtuais: 0,
    conclusoesAtuais: 0,
  }
}

export function criarControleQuota() {
  return { estado: "normal", falhasQuota: 0 }
}

export function prepararProvaQuota(controle, emVoo) {
  if (controle.estado === "draining_after_quota" && emVoo === 0) return { ...controle, estado: "single_probe" }
  return controle
}

export function registrarResultadoQuota(controle, resultado) {
  if (resultado.tipo === "quota") {
    const falhasQuota = controle.falhasQuota + 1
    return { estado: controle.estado === "single_probe" || falhasQuota >= 2 ? "stopped_by_quota" : "draining_after_quota", falhasQuota }
  }
  if (resultado.tipo === "sucesso" && controle.estado === "single_probe") return criarControleQuota()
  if (resultado.tipo === "erro_tecnico" && controle.estado === "single_probe") return { ...controle, estado: "draining_after_quota" }
  return controle
}

export function concorrenciaPermitidaPorQuota(controle, emVoo, concorrencia) {
  if (controle.estado === "normal") return concorrencia
  if (controle.estado === "single_probe") return emVoo === 0 ? 1 : 0
  return 0
}

export function eErroCota(texto) {
  return PADRAO_COTA.test(String(texto ?? ""))
}

export function familiaDoModelo(nome) {
  const raw = String(nome ?? "").trim().toLocaleLowerCase("pt-BR")
  if (raw.includes("gpt-5.6-luna")) return "openai"
  const tokens = raw.split(/[\s/:@-]+/u).filter(Boolean)
  if (tokens.some((t) => /^(?:openai|gpt|codex|o[1-9])(?:\d.*)?$/u.test(t))) {
    if (raw.includes("muse")) return tokens[0]
    return "openai"
  }
  if (tokens.some((t) => /^(?:deepseek)$/u.test(t))) return "deepseek"
  if (tokens.some((t) => /^(?:glm|z\.?ai|zhipu)$/u.test(t))) return "glm"
  return tokens[0] ?? "unknown"
}

export function regiaoDaUf(uf) {
  const par = Object.entries(REGIOES).find(([, ufs]) => ufs.includes(uf))
  return par ? par[0] : null
}

export function fingerprintPipelineConfig(config) {
  const papel = (nome) => {
    const modelo = config?.[nome] ?? {}
    return {
      name: modelo.name ?? null,
      version: modelo.version ?? null,
      command: modelo.command ?? null,
      args: Array.isArray(modelo.args) ? modelo.args : [],
    }
  }
  return createHash("sha256")
    .update(JSON.stringify({ revision: config?.revision ?? null, generator: papel("generator"), judge: papel("judge") }))
    .digest("hex")
    .slice(0, 16)
}

export function slotsDeItem(item) {
  if (!item.multipassagem) return 1
  const planejadas = Number(item.passagensPlanejadas)
  const normalizadas = Number.isFinite(planejadas) ? Math.floor(planejadas) : 1
  return Math.min(PASSAGENS_CONCORRENCIA_INTERNA, Math.max(1, normalizadas))
}

export function classificarRegistro(registro) {
  if (!registro || typeof registro !== "object") {
    return { estado: "retryable_error", motivo: "registro nao materializado" }
  }
  const sqCandidato = String(registro.fonte?.sqCandidato ?? "")
  const identidadeEsperada = `2026:GOVERNADOR:${registro.fonte?.uf ?? ""}:${sqCandidato}`
  if (
    registro.version !== 1
    || registro.fonte?.ano !== 2026
    || registro.fonte?.cargo !== "GOVERNADOR"
    || !regiaoDaUf(registro.fonte?.uf)
    || !PADRAO_SQ.test(sqCandidato)
    || registro.ingestao?.identityKey !== identidadeEsperada
  ) {
    return { estado: "retryable_error", motivo: "registro fora do contrato ou identidade divergente" }
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

// Funcao pura de reconciliacao compartilhada com a prova.
// Recebe item, registro materializado e estado anterior (se houver) e devolve
// o estado reconciliado para a proxima execucao, com contagem por familia.
// Generator_pending sem lease vivo vira retryable (recuperavel).
export function reconciliarParaRetomada({ registro, item = null, estadoAnterior, familiaAtual, modeloAtual = null, pipelineAtual = null }) {
  const familiaAnterior = estadoAnterior?.familiaDaUltimaTentativa ?? estadoAnterior?.familia ?? null
  const modeloAnterior = estadoAnterior?.modeloDaUltimaTentativa ?? null
  const pipelineAnterior = estadoAnterior?.pipelineDaUltimaTentativa ?? (estadoAnterior?.executionId ? "legacy-sem-fingerprint" : null)
  const tentativaBase = estadoAnterior?.tentativas ?? 1
  // Mudanca comprovada de familia ou pipeline reseta somente tentativas tecnicas.
  const pipelineMudou = Boolean(pipelineAnterior && pipelineAtual && pipelineAnterior !== pipelineAtual)
  const familiaMudou = Boolean(familiaAnterior && familiaAtual && familiaAnterior !== familiaAtual)
  const tentativasEfetivas = familiaMudou || pipelineMudou ? 1 : tentativaBase
  const camposFamilia = {
    familia: familiaAnterior,
    familiaDaUltimaTentativa: familiaAnterior,
    modeloDaUltimaTentativa: modeloAnterior,
    familiaPlanejada: familiaAtual ?? estadoAnterior?.familiaPlanejada ?? null,
    modeloPlanejado: modeloAtual ?? estadoAnterior?.modeloPlanejado ?? null,
    pipelineDaUltimaTentativa: pipelineAnterior,
    pipelinePlanejada: pipelineAtual ?? estadoAnterior?.pipelinePlanejada ?? null,
  }

  // Um bloqueio gravado por finalizar() significa que a segunda tentativa ja
  // terminou. Registro parcial nao pode reabrir esse estado na retomada.
  if (estadoAnterior?.estado === "blocked") {
    const bloqueioTecnico = /^falha tecnica apos \d+ tentativas:/iu.test(estadoAnterior.motivo ?? "")
    if (pipelineMudou && bloqueioTecnico) {
      return { estado: "retryable_error", motivo: `nova pipeline: ${estadoAnterior.motivo}`, tentativas: 1, reiniciarRegistro: true, ...camposFamilia }
    }
    return { estado: "blocked", motivo: estadoAnterior.motivo ?? "blocked", tentativas: tentativaBase, ...camposFamilia }
  }

  if (registro) {
    const classificacao = classificarRegistro(registro)
    const identidadeEsperada = item?.chave ?? null
    if (identidadeEsperada && registro.ingestao?.identityKey !== identidadeEsperada) {
      return { estado: "retryable_error", motivo: "registro pertence a outra candidatura", tentativas: tentativasEfetivas, ...camposFamilia }
    }
    // aprovado nunca deve existir; se existir, bloqueia para auditoria
    if (registro.estado === "aprovado") {
      return { estado: "blocked", motivo: "registro aprovado inesperado", tentativas: tentativasEfetivas, ...camposFamilia }
    }
    if (classificacao.estado === "complete") {
      return { estado: "complete", motivo: classificacao.motivo, tentativas: tentativasEfetivas, ...camposFamilia }
    }
    if (classificacao.estado === "blocked") {
      return { estado: "blocked", motivo: classificacao.motivo, tentativas: tentativasEfetivas, ...camposFamilia }
    }
    // retryable_error
    if (tentativasEfetivas > MAX_TENTATIVAS_CANDIDATO) {
      return { estado: "blocked", motivo: `falha tecnica apos ${tentativasEfetivas} tentativas: ${classificacao.motivo}`, tentativas: tentativasEfetivas, ...camposFamilia }
    }
    return { estado: "retryable_error", motivo: classificacao.motivo, tentativas: tentativasEfetivas, reiniciarRegistro: pipelineMudou, ...camposFamilia }
  }

  // Sem registro: usa estado anterior se terminal
  if (estadoAnterior?.estado === "complete" || estadoAnterior?.estado === "blocked") {
    // Se estado anterior era complete, verifica se registro existe e e valido; se nao, mantem complete mas prova deve falhar se registro ausente
    return { estado: estadoAnterior.estado, motivo: estadoAnterior.motivo ?? estadoAnterior.estado, tentativas: tentativasEfetivas, ...camposFamilia }
  }

  // generator_pending sem processo/lease vivo -> recuperavel como retryable
  if (estadoAnterior?.estado === "generator_pending") {
    if (tentativasEfetivas > MAX_TENTATIVAS_CANDIDATO) {
      return { estado: "blocked", motivo: "generator_pending sem lease e limite de tentativas atingido", tentativas: tentativasEfetivas, ...camposFamilia }
    }
    return { estado: "retryable_error", motivo: "generator_pending recuperavel", tentativas: tentativasEfetivas, ...camposFamilia }
  }

  if (estadoAnterior?.estado === "retryable_error") {
    if (tentativasEfetivas > MAX_TENTATIVAS_CANDIDATO) {
      return { estado: "blocked", motivo: `falha tecnica apos ${tentativasEfetivas} tentativas: ${estadoAnterior.motivo ?? ""}`, tentativas: tentativasEfetivas, ...camposFamilia }
    }
    return { estado: "retryable_error", motivo: estadoAnterior.motivo ?? "retryable", tentativas: tentativasEfetivas, ...camposFamilia }
  }

  // pending ou sem estado
  if (tentativasEfetivas >= MAX_TENTATIVAS_CANDIDATO) {
    return { estado: "blocked", motivo: "falha tecnica antes do registro; limite de tentativas atingido na retomada", tentativas: tentativasEfetivas, ...camposFamilia }
  }
  return { estado: "pending", motivo: "sem registro", tentativas: tentativasEfetivas, ...camposFamilia }
}

export function escaladaPermitida(metricas) {
  if (!metricas) return false
  if (metricas.errosCota > 0) return false
  if ((metricas.conclusoes ?? 0) < 3) return false
  if (metricas.tentativas > 0 && metricas.errosTecnicos / metricas.tentativas > 0.05) return false
  if (metricas.latenciaP95Base > 0 && metricas.latenciaP95Ultimos > metricas.latenciaP95Base * 1.5) return false
  return probeRecursos()
}

export function concorrenciaAlvo({ conclusoes, concorrenciaAtual, metricas }) {
  const alvoRampa = (conclusoes ?? 0) < 3 ? 3 : 4
  // Rampa por conclusoes, nao por disparos; apos 3 conclusoes pode subir para 4 se estavel
  if ((conclusoes ?? 0) < 6) {
    if (alvoRampa > concorrenciaAtual && !escaladaPermitida(metricas)) return concorrenciaAtual
    return alvoRampa
  }
  if (!escaladaPermitida(metricas)) return Math.max(3, concorrenciaAtual - 1)
  if (concorrenciaAtual < 4) return 4
  return concorrenciaAtual
}

/**
 * Allowlist do ambiente que chega aos filhos. Duas regras, e as duas importam:
 * segredo do host nunca passa, e controle documentado nunca e descartado.
 *
 * A lista so vale se o ambiente REAL for passado para ca. Ate 2026-08-30 a
 * chamada montava a mao um objeto de quatro chaves (PATH, HOME, TMPDIR, USER),
 * entao a allowlist filtrava um conjunto que nunca continha PF_*: as variaveis
 * documentadas em Settings/AUTOMATIONS_AND_ENVIRONMENTS.md, como
 * PF_CLAUDE_MAX_BUDGET_USD e PF_CLAUDE_JUDGE_MODEL, viravam letra morta. Quem
 * exportasse o orcamento do judge rodava com o default de US$ 5 sem aviso.
 *
 * Os nomes daqui sao os que algum processo filho de fato le. Conferir com:
 *   grep -rhoE 'process\.env\.PF_[A-Z_0-9]+' scripts/programas-governo-stage.ts \
 *     scripts/data/programas-governo-governadores-2026/*.mjs scripts/lib/programas-governo*
 */
export function construirAmbienteBatch(ambiente, extras = {}) {
  const chavesPermitidas = new Set([
    "PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "TZ", "TERM", "SHELL", "USER", "LOGNAME",
    "CODEX_HOME", "CLAUDE_CONFIG_DIR",
    "PF_QWEN_CLI", "PF_QWEN_TIMEOUT_MS", "PF_QWEN_MODEL", "PF_QWEN_EXTRA_ARGS", "PF_CODEX_CLI", "PF_CODEX_TIMEOUT_MS",
    "PF_CODEX_REASONING_EFFORT", "PF_CODEX_MODEL", "PF_JUDGE_MODEL",
    "PF_CLAUDE_CLI", "PF_CLAUDE_TIMEOUT_MS", "PF_CLAUDE_JUDGE_MODEL", "PF_CLAUDE_MAX_BUDGET_USD",
    "PF_OPENCODE_GO", "PF_OPENCODE_TIMEOUT_MS", "PF_OPENCODE_TIMEOUT_PADDING_MS", "PF_OPENCODE_GRACE_MS",
  ])
  return {
    ...Object.fromEntries(Object.entries(ambiente).filter(([chave, valor]) => chavesPermitidas.has(chave) && valor !== undefined)),
    ...extras,
  }
}

async function escreverAtomico(destino, conteudo) {
  const temporario = `${destino}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

export async function gravarEstado(runDir, item, campos) {
  const dir = dirDoCandidato(runDir, item)
  await mkdir(dir, { recursive: true })
  const destino = path.join(dir, "estado.json")
  await enfileirarEscrita(estadoWriteQueues, destino, async () => {
    let anterior = {}
    try { anterior = JSON.parse(await readFile(destino, "utf8")) } catch {}
    const definidos = Object.fromEntries(Object.entries(campos).filter(([, value]) => value !== undefined))
    const registro = {
      chave: item.chave,
      uf: item.uf,
      sqCandidato: item.sqCandidato,
      ...anterior,
      ...definidos,
      atualizadoEm: new Date().toISOString(),
    }
    await escreverAtomico(destino, `${JSON.stringify(registro, null, 2)}\n`)
  })
}

export async function registrarTelemetriaTentativa(runDir, tentativa) {
  const logsDir = path.join(runDir, "logs")
  const destino = path.join(logsDir, "tentativas.ndjson")
  await mkdir(logsDir, { recursive: true })
  await enfileirarEscrita(telemetryWriteQueues, destino, async () => {
    await appendFile(destino, `${JSON.stringify(tentativa)}\n`, "utf8")
  })
}

export async function validarCachesRetomada(workDir, { minExtracao = 1, minPassagens = 1 } = {}) {
  const cacheExtracao = path.join(workDir, "cache-extracao")
  const cachePassagens = path.join(workDir, "cache-passagens")
  if (!existsSync(cacheExtracao)) throw new Error(`cache-extracao ausente: ${cacheExtracao}`)
  if (!existsSync(cachePassagens)) throw new Error(`cache-passagens ausente: ${cachePassagens}`)
  const extracoes = await readdir(cacheExtracao)
  const passagens = await readdir(cachePassagens)
  if (extracoes.length < minExtracao) throw new Error(`cache-extracao insuficiente: ${extracoes.length} < ${minExtracao}`)
  if (passagens.length < minPassagens) throw new Error(`cache-passagens insuficiente: ${passagens.length} < ${minPassagens}`)
  return { extracoes: extracoes.length, passagens: passagens.length }
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
    return { ...item, regiao, plannerVersion: PLANNER_VERSION }
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
  await escreverAtomico(path.join(dirFila, "manifesto.json"), `${JSON.stringify({
    plannerVersion: PLANNER_VERSION,
    fingerprint: calcularFingerprintFila(itens, PLANNER_VERSION),
    total: itens.length,
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
  const identidadesEsperadas = new Set(inventory.candidaturas
    .filter((candidatura) => !UFS_NORTE.includes(candidatura.uf))
    .map((candidatura) => candidatura.chave ?? `2026:GOVERNADOR:${candidatura.uf}:${candidatura.sqCandidato}`))
  for (const chave of identidadesEsperadas) if (!chaves.has(chave)) falhas.push(`identidade ausente na fila: ${chave}`)
  for (const chave of chaves) if (!identidadesEsperadas.has(chave)) falhas.push(`identidade inesperada na fila: ${chave}`)
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
    conclusoes: contexto.metricas.concluidos + contexto.metricas.bloqueados,
    errosTecnicos: contexto.metricas.errosTecnicos,
    errosCota: contexto.metricas.errosCota,
    latenciaP95Ultimos: percentil(ultimas, 0.95),
    latenciaP95Base: percentil(base, 0.95),
  }
}

function proximoAgendavel(contexto) {
  const emVoo = [...contexto.emVoo.values()]
  const limiteQuota = concorrenciaPermitidaPorQuota(contexto.quota, emVoo.length, contexto.concorrencia)
  if (emVoo.length >= limiteQuota) return null
  const slotsEmUso = emVoo.reduce((soma, unidade) => soma + unidade.slots, 0)
  const multipassagemEmVoo = emVoo.filter((unidade) => unidade.multipassagem).length
  for (const unidade of contexto.ordem) {
    if (unidade.estado !== "pending" && unidade.estado !== "retryable_error") continue
    if (contexto.emVoo.size >= limiteQuota) break
    const slots = slotsDeItem(unidade.item)
    if (slotsEmUso + slots > LIMITE_SLOTS_GERADOR) continue
    if (unidade.item.multipassagem && multipassagemEmVoo >= MAX_MULTIPASSAGEM_SIMULTANEOS) continue
    return unidade
  }
  return null
}

export async function executarBatch(params) {
  const filaCaminho = params.filaPath ?? path.join(params.runDir, "fila", "fila.ndjson")
  if (!existsSync(filaCaminho)) throw new Error("fila ausente: rode o modo plan primeiro")
  const itens = (await readFile(filaCaminho, "utf8")).trim().split("\n").filter(Boolean).map((linha) => JSON.parse(linha))
  if (params.validarFilaFn) {
    await params.validarFilaFn(itens)
  } else {
    await validarFilaContraInventario(itens, params.inventoryPath)
    let manifesto = null
    try { manifesto = JSON.parse(await readFile(path.join(path.dirname(filaCaminho), "manifesto.json"), "utf8")) } catch {}
    const planejados = params.planejarItensFn ? await params.planejarItensFn() : null
    validarFilaPlanejada(itens, planejados, manifesto)
  }
  const executionId = randomUUID()
  const lease = await adquirirLeaseExecucao(params.runDir, {
    executionId,
    ...(params.leaseOptions ?? {}),
  })
  try {
    return await executarBatchSobLease({ ...params, filaPath: filaCaminho, itens, executionId })
  } finally {
    await liberarLeaseExecucao(lease)
    await marcarProgressFinal(params.runDir, executionId)
  }
}

export async function arquivarRegistrosParciais(runDir, item, pipelineAnterior = "pipeline-anterior") {
  const candidatoDir = dirDoCandidato(runDir, item)
  const origem = path.join(candidatoDir, "registros")
  if (!existsSync(origem)) return null
  const raizArquivo = path.join(candidatoDir, "registros-anteriores")
  await mkdir(raizArquivo, { recursive: true })
  const identificador = String(pipelineAnterior ?? "pipeline-anterior").replace(/[^a-z0-9_-]+/giu, "-").slice(0, 40)
  const destino = path.join(raizArquivo, `${new Date().toISOString().replace(/[:.]/gu, "-")}-${identificador}-${randomUUID().slice(0, 8)}`)
  await rename(origem, destino)
  await mkdir(origem, { recursive: true })
  return destino
}

async function executarBatchSobLease(params) {
  const { runDir, inventoryPath, workDir, archiveDir, modelsConfig, maxMinutos = 480, maxTokensBatch = null, pollMs = 2_000, spawnFn = spawn, node24Resolver = resolverNode24, qwenExtraArgs = "", codexExtraArgs = "", itens } = params
  if (maxTokensBatch !== null && !(Number.isFinite(maxTokensBatch) && maxTokensBatch > 0)) {
    throw new Error("maxTokensBatch deve ser um numero positivo")
  }
  const node24 = await node24Resolver(runDir)
  await mkdir(path.join(runDir, "logs"), { recursive: true })
  const executionId = params.executionId
  const startedAt = new Date().toISOString()
  let metricsOffset = 0
  try {
    const metricsPath = path.join(runDir, "logs", "metricas-opencode.ndjson")
    if (existsSync(metricsPath)) metricsOffset = statSync(metricsPath).size
  } catch {}
  let familiaAtual = null
  let modeloAtual = null
  let pipelineAtual = null
  if (modelsConfig) {
    try {
      if (!existsSync(modelsConfig)) throw new Error("arquivo ausente")
      const cfg = JSON.parse(await readFile(modelsConfig, "utf8"))
      if (!cfg?.generator?.name || !(cfg.generator?.version ?? cfg.generator?.name)) {
        throw new Error("generator.name/version ausente")
      }
      familiaAtual = familiaDoModelo(cfg.generator?.name ?? "")
      modeloAtual = cfg.generator?.version ?? cfg.generator?.name ?? null
      pipelineAtual = fingerprintPipelineConfig(cfg)
      if (!familiaAtual || !modeloAtual || !pipelineAtual) throw new Error("identidade do pipeline incompleta")
    } catch (error) {
      throw new Error(`models-config invalido em ${modelsConfig}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
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
    conclusoes: new Set(),
    concorrencia: 3,
    disparos: 0,
    latencias: [],
    latenciasBase: [],
    parada: null,
    quota: criarControleQuota(),
    historicos: criarContadoresExecucao(),
    maxTokensBatch,
    metricas: {
      concluidos: 0,
      bloqueados: 0,
      tentativas: 0,
      errosTecnicos: 0,
      errosCota: 0,
      cacheHits: 0,
      chamadas: { generator: 0, judge: 0 },
      // Custo agregado do batch, somado do `uso` que cada runner devolve
      // (tokens do Codex, custo em USD do Claude). O teto por invocacao do
      // judge Claude continua valendo; este e o teto do batch inteiro.
      tokens: 0,
      custoUsd: 0,
    },
  }

  // retomada: reconcilia cada item com registro/estado persistidos via funcao pura
  const historicos = { concluidos: 0, bloqueados: 0 }
  for (const item of itens) {
    let registro = await lerRegistro(runDir, item)
    const estadoAnterior = await lerEstadoArquivo(runDir, item)
    const reconciliado = reconciliarParaRetomada({ registro, item, estadoAnterior, familiaAtual, modeloAtual, pipelineAtual })
    if (reconciliado.reiniciarRegistro) {
      await arquivarRegistrosParciais(runDir, item, reconciliado.pipelineDaUltimaTentativa)
      registro = null
    }
    const unidade = {
      item,
      estado: reconciliado.estado,
      tentativas: reconciliado.tentativas,
      familiaDaUltimaTentativa: reconciliado.familiaDaUltimaTentativa,
      modeloDaUltimaTentativa: reconciliado.modeloDaUltimaTentativa,
      familiaPlanejada: reconciliado.familiaPlanejada,
      modeloPlanejado: reconciliado.modeloPlanejado,
      pipelineDaUltimaTentativa: reconciliado.pipelineDaUltimaTentativa,
      pipelinePlanejada: reconciliado.pipelinePlanejada,
      slots: slotsDeItem(item),
      multipassagem: item.multipassagem,
      estadoObservado: null,
      inicioIso: null,
    }
    // Persiste reconciliacao apenas se mudou ou se estado anterior era generator_pending fantasma
    const precisaGravar = !estadoAnterior
      || estadoAnterior.estado !== reconciliado.estado
      || estadoAnterior.tentativas !== reconciliado.tentativas
      || estadoAnterior.familiaPlanejada !== reconciliado.familiaPlanejada
      || estadoAnterior.pipelinePlanejada !== reconciliado.pipelinePlanejada
    if (precisaGravar) {
      await gravarEstado(runDir, item, {
        estado: reconciliado.estado,
        motivo: reconciliado.motivo,
        tentativas: reconciliado.tentativas,
        familiaDaUltimaTentativa: reconciliado.familiaDaUltimaTentativa,
        modeloDaUltimaTentativa: reconciliado.modeloDaUltimaTentativa,
        familiaPlanejada: reconciliado.familiaPlanejada,
        modeloPlanejado: reconciliado.modeloPlanejado,
        pipelineDaUltimaTentativa: reconciliado.pipelineDaUltimaTentativa,
        pipelinePlanejada: reconciliado.pipelinePlanejada,
      })
    }
    // Validacao: complete deve ter registro valido; aprovado nunca
    if (reconciliado.estado === "complete") {
      if (!registro || registro.estado === "aprovado") {
        throw new Error(`reconciliacao: ${item.chave} complete sem registro valido`)
      }
      // Garante que Norte nunca foi reprocessado e que aprovados nao existem
      if (registro.estado === "aprovado") throw new Error(`registro aprovado inesperado ${item.chave}`)
    }
    if (unidade.estado === "complete") historicos.concluidos += 1
    if (unidade.estado === "blocked") historicos.bloqueados += 1
    contexto.ordem.push(unidade)
  }
  const totalEsperado = itens.length

  // Inicializa contexto com executionId para separar historico vs esta execucao
  contexto.executionId = executionId
  contexto.startedAt = startedAt
  contexto.metricsOffset = metricsOffset
  contexto.familiaAtual = familiaAtual
  contexto.modeloAtual = modeloAtual
  contexto.pipelineAtual = pipelineAtual
  contexto.historicos = criarContadoresExecucao(historicos)

  while (!contexto.parada) {
    contexto.quota = prepararProvaQuota(contexto.quota, contexto.emVoo.size)
    if (contexto.quota.estado === "stopped_by_quota") {
      await parar(contexto, "stopped_by_quota")
      break
    }
    const alvo = concorrenciaAlvo({
      conclusoes: contexto.metricas.concluidos + contexto.metricas.bloqueados,
      concorrenciaAtual: contexto.concorrencia,
      metricas: metricasParaRampa(contexto),
    })
    contexto.concorrencia = alvo
    for (;;) {
      if (contexto.parada || contexto.quota.estado === "stopped_by_quota") break
      const unidade = proximoAgendavel(contexto)
      if (!unidade) break
      await disparar(contexto, unidade, inventoryPath)
    }
    if (contexto.parada) break
    if (contexto.quota.estado === "stopped_by_quota") {
      await parar(contexto, "stopped_by_quota")
      break
    }
    if (contexto.emVoo.size === 0) break
    await new Promise((resolver) => setTimeout(resolver, pollMs))
    for (const unidade of contexto.emVoo.values()) {
      const observado = estadoObservadoDeFases(runDir, unidade.item)
      if (observado !== unidade.estadoObservado) {
        unidade.estadoObservado = observado
        await gravarEstado(runDir, unidade.item, {
          estado: observado,
          fase: observado,
          tentativa: unidade.tentativas,
          tentativas: unidade.tentativas,
          executionId: contexto.executionId,
        })
      }
    }
    await atualizarProgress(contexto, totalEsperado, inicio)
    await checarParadasDuras(contexto, totalEsperado, inicio, limiteWall)
  }

  await Promise.all([...contexto.conclusoes])
  await atualizarProgress(contexto, totalEsperado, inicio)
  return {
    parada: contexto.parada,
    total: totalEsperado,
    concluidos: contexto.historicos.concluidosHistoricos + contexto.metricas.concluidos,
    bloqueados: contexto.historicos.bloqueadosHistoricos + contexto.metricas.bloqueados,
    concluidosAtuais: contexto.metricas.concluidos,
    bloqueadosAtuais: contexto.metricas.bloqueados,
    tentativas: contexto.metricas.tentativas,
    errosTecnicos: contexto.metricas.errosTecnicos,
    errosCota: contexto.metricas.errosCota,
    concorrenciaFinal: contexto.concorrencia,
    quota: contexto.quota.estado,
    tokens: contexto.metricas.tokens,
    custoUsd: Number(contexto.metricas.custoUsd.toFixed(4)),
    maxTokensBatch: contexto.maxTokensBatch,
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
  unidade.inicioIso = new Date().toISOString()
  await gravarEstado(runDir, item, {
    estado: "extracting",
    fase: "extracao.iniciada",
    tentativa: unidade.tentativas,
    tentativas: unidade.tentativas,
    executionId: contexto.executionId,
    familiaDaUltimaTentativa: contexto.familiaAtual,
    modeloDaUltimaTentativa: contexto.modeloAtual,
    familiaPlanejada: contexto.familiaAtual,
    modeloPlanejado: contexto.modeloAtual,
    pipelineDaUltimaTentativa: contexto.pipelineAtual,
    pipelinePlanejada: contexto.pipelineAtual,
  })
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
        // `process.env` inteiro, e nao um objeto montado a mao: e a allowlist
        // acima que decide o que passa. Montar o objeto aqui fazia a allowlist
        // filtrar um conjunto que nunca tinha PF_*, e as variaveis documentadas
        // nao chegavam ao filho.
        //
        // O acesso e dinamico de proposito e por isso este arquivo esta em
        // `allowedDynamicPrefixes` de scripts/check-env-contract.mjs, junto de
        // scripts/merge-queue/adapters.mjs, que faz o mesmo pelo mesmo motivo:
        // a funcao existe para FILTRAR o ambiente do host, entao ela tem que
        // receber o ambiente do host. A enumeracao que o contrato quer esta na
        // allowlist acima, e ha teste que reprova quando ela sai de sincronia
        // com o que os filhos leem.
        env: construirAmbienteBatch(process.env, {
          ...(contexto.qwenExtraArgs ? { PF_QWEN_EXTRA_ARGS: contexto.qwenExtraArgs } : {}),
          ...(contexto.codexExtraArgs ? { PF_CODEX_EXTRA_ARGS: contexto.codexExtraArgs } : {}),
          PF_EXECUTION_ID: contexto.executionId,
          PF_CANDIDATO_CHAVE: item.chave,
          PF_CANDIDATO_SQ: item.sqCandidato,
          PF_CANDIDATO_UF: item.uf,
          PF_CANDIDATO_REGIAO: item.regiao,
          PF_MODEL_TELEMETRY_PATH: path.join(contexto.runDir, "logs", "tentativas.ndjson"),
        }),
      })
      child.stderr?.on("data", (c) => { stderr += c })
      child.on("close", (code) => resolver({ code: code ?? -1, stderr, inicioProcesso }))
      child.on("error", (erro) => resolver({ code: -1, stderr: `${stderr}\n${erro.message}`, inicioProcesso }))
    } catch (erro) {
      resolver({ code: -1, stderr: `${stderr}\n${erro.message}`, inicioProcesso })
    }
  })
    .then((resultado) => finalizar(contexto, unidade, resultado))
    .finally(() => {
      // A unidade só deixa de estar em voo depois que toda a finalização,
      // inclusive estado e telemetria, terminou. Remover antes permitia que
      // executarBatch retornasse enquanto ainda havia escrita no runDir.
      contexto.emVoo.delete(item.chave)
    })
  unidade.conclusao = conclusao
  contexto.conclusoes.add(conclusao)
  contexto.emVoo.set(item.chave, unidade)
  contexto.disparos += 1
  contexto.metricas.tentativas += 1
}

async function finalizar(contexto, unidade, { code, stderr, inicioProcesso }) {
  const { runDir, item } = { runDir: contexto.runDir, item: unidade.item }
  const duracao = Date.now() - inicioProcesso
  const registro = await lerRegistro(runDir, item)
  const classificacao = classificarRegistro(registro)
  contabilizarUso(contexto, registro)
  const textoErro = `${stderr}\n${registro?.ingestao?.erro ?? ""}`
  const cota = eErroCota(textoErro)
  if (classificacao.estado === "complete") {
    unidade.estado = "complete"
    contexto.metricas.concluidos += 1
    contexto.quota = registrarResultadoQuota(contexto.quota, { tipo: "sucesso" })
    contexto.latencias.push(duracao)
    if (contexto.latenciasBase.length < 4) contexto.latenciasBase.push(duracao)
    await contabilizarSucesso(contexto, item, registro)
    await gravarEstado(runDir, item, { estado: "complete", fase: "concluida", motivo: classificacao.motivo, tentativas: unidade.tentativas, duracaoMs: duracao })
  } else if (classificacao.estado === "blocked" && !cota) {
    unidade.estado = "blocked"
    contexto.metricas.bloqueados += 1
    contexto.quota = registrarResultadoQuota(contexto.quota, { tipo: "sucesso" })
    await gravarEstado(runDir, item, { estado: "blocked", fase: "concluida", motivo: classificacao.motivo, tentativas: unidade.tentativas, duracaoMs: duracao })
  } else {
    const motivo = classificacao.motivo || (code === 0 ? "exit 0 sem registro" : `exit ${code}`)
    if (cota) {
      contexto.metricas.errosCota += 1
      contexto.quota = registrarResultadoQuota(contexto.quota, { tipo: "quota" })
    } else {
      contexto.metricas.errosTecnicos += 1
      contexto.quota = registrarResultadoQuota(contexto.quota, { tipo: "erro_tecnico" })
    }
    if (unidade.tentativas < MAX_TENTATIVAS_CANDIDATO) {
      unidade.estado = "retryable_error"
      unidade.tentativas += 1
      await gravarEstado(runDir, item, { estado: "retryable_error", fase: "falha", motivo, tentativas: unidade.tentativas, duracaoMs: duracao })
    } else {
      unidade.estado = "blocked"
      contexto.metricas.bloqueados += 1
      await gravarEstado(runDir, item, { estado: "blocked", fase: "falha", motivo: `falha tecnica apos ${unidade.tentativas} tentativas: ${motivo}`, tentativas: unidade.tentativas, duracaoMs: duracao })
    }
  }
  await registrarTelemetriaTentativa(runDir, {
    executionId: contexto.executionId,
    candidato: item.chave,
    sqCandidato: item.sqCandidato,
    uf: item.uf,
    regiao: item.regiao,
    papel: "pipeline",
    modelo: contexto.modeloAtual,
    familia: contexto.familiaAtual,
    etapa: unidade.estadoObservado,
    passagem: null,
    inicio: unidade.inicioIso,
    fim: new Date().toISOString(),
    duracaoMs: duracao,
    exitCode: code,
    erro: code === 0 && classificacao.estado === "complete" ? null : textoErro.trim() || classificacao.motivo,
    retry: unidade.estado === "retryable_error",
    cacheHit: false,
    uso: {
      generator: registro?.ingestao?.modelos?.generator?.uso ?? null,
      judge: registro?.ingestao?.modelos?.judge?.uso ?? null,
    },
  })
  if (contexto.quota.estado === "stopped_by_quota" && !contexto.parada) {
    await parar(contexto, "stopped_by_quota")
  }
  if (contexto.maxTokensBatch !== null && contexto.metricas.tokens > contexto.maxTokensBatch && !contexto.parada) {
    await parar(contexto, "stopped_by_budget")
  }
}

/** Soma todo campo numerico cujo nome contem "tokens" no `uso` de um runner. */
export function somarTokensUso(uso) {
  if (!uso || typeof uso !== "object") return 0
  let total = 0
  for (const [chave, valor] of Object.entries(uso)) {
    if (typeof valor === "number" && Number.isFinite(valor) && /tokens/iu.test(chave)) total += valor
    else if (valor && typeof valor === "object") total += somarTokensUso(valor)
  }
  return total
}

/** Custo em USD declarado pelo runner (Claude CLI devolve `total_cost_usd`). */
export function custoUsdUso(uso) {
  if (!uso || typeof uso !== "object") return 0
  let total = 0
  for (const [chave, valor] of Object.entries(uso)) {
    if (typeof valor === "number" && Number.isFinite(valor) && /cost.*usd|usd/iu.test(chave)) total += valor
    else if (valor && typeof valor === "object") total += custoUsdUso(valor)
  }
  return total
}

function contabilizarUso(contexto, registro) {
  const modelos = registro?.ingestao?.modelos
  if (!modelos) return
  for (const papel of ["generator", "judge"]) {
    const uso = modelos[papel]?.uso
    contexto.metricas.tokens += somarTokensUso(uso)
    contexto.metricas.custoUsd += custoUsdUso(uso)
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
  const concluidosAtuais = contexto.metricas.concluidos
  const bloqueadosAtuais = contexto.metricas.bloqueados
  const concluidosHistoricos = contexto.historicos.concluidosHistoricos
  const bloqueadosHistoricos = contexto.historicos.bloqueadosHistoricos
  const concluidos = concluidosHistoricos + concluidosAtuais
  const bloqueados = bloqueadosHistoricos + bloqueadosAtuais
  let generatorAtivo = 0
  let judgeAtivo = 0
  for (const unidade of emVoo) {
    if (unidade.estadoObservado === "extracting" || unidade.estadoObservado === "generator_pending") generatorAtivo += 1
    if (unidade.estadoObservado === "generator_complete" || unidade.estadoObservado === "judge_pending") judgeAtivo += 1
  }
  const decorridoMs = Date.now() - inicio
  const horas = decorridoMs / 3_600_000
  const conclusoesAtuais = concluidosAtuais + bloqueadosAtuais
  const porHora = horas > 0.05 ? conclusoesAtuais / horas : 0
  const pendentes = totalEsperado - concluidos - bloqueados - emVoo.length
  const medianaRecente = mediana(contexto.latencias.slice(-10))
  const etaMs = porHora > 0 ? (pendentes / porHora) * 3_600_000 : null
  const progresso = {
    executionId: contexto.executionId ?? null,
    startedAt: contexto.startedAt ?? null,
    familiaAtual: contexto.familiaAtual ?? null,
    metricsOffset: contexto.metricsOffset ?? 0,
    totalEsperado,
    concluidos,
    bloqueados,
    concluidosHistoricos,
    bloqueadosHistoricos,
    concluidosAtuais,
    bloqueadosAtuais,
    conclusoesAtuais,
    pendentes,
    emVoo: emVoo.length,
    generatorAtivo,
    judgeAtivo,
    concorrenciaAtual: contexto.concorrencia,
    concorrenciaEscolhida: contexto.concorrencia,
    disparos: contexto.disparos,
    taxaErroTecnico: contexto.metricas.tentativas > 0 ? Number((contexto.metricas.errosTecnicos / contexto.metricas.tentativas).toFixed(4)) : 0,
    errosCota: contexto.metricas.errosCota,
    estadoQuota: contexto.quota.estado,
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
  if (contexto.quota.estado === "stopped_by_quota") {
    await parar(contexto, "stopped_by_quota")
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
    if (registro.estado === "aprovado") throw new Error(`registro aprovado proibido: ${item.chave}`)
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
        const origem = path.join(origemUf, arquivo)
        const registro = JSON.parse(await readFile(origem, "utf8"))
        const sqCandidato = String(registro.fonte?.sqCandidato ?? "")
        const identidadeEsperada = `2026:GOVERNADOR:${uf}:${sqCandidato}`
        if (
          registro.fonte?.ano !== 2026
          || registro.fonte?.cargo !== "GOVERNADOR"
          || registro.fonte?.uf !== uf
          || !PADRAO_SQ.test(sqCandidato)
        ) {
          throw new Error(`registro Norte fora do escopo em ${uf}/${arquivo}`)
        }
        if (registro.ingestao?.identityKey !== identidadeEsperada) {
          throw new Error(`mistura de identityKey Norte: ${registro.ingestao?.identityKey} != ${identidadeEsperada}`)
        }
        if (registro.estado === "aprovado") throw new Error(`registro Norte aprovado proibido: ${identidadeEsperada}`)
        await copyFile(origem, path.join(destinoNorte, uf, arquivo))
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
      maxTokensBatch: argumento("max-tokens-batch") !== undefined ? Number(argumento("max-tokens-batch")) : null,
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
