// Prova de retomada: reconcilia a fila usando a mesma logica pura do driver.
// Valida o checkpoint atual, inclusive depois de execucoes parciais: complete
// nao reexecuta, fila fecha em 155, Norte 0, Qwen+GPT 2 intactos, sem aprovado,
// extracoes e passagens reutilizaveis e contagens iguais ao progress final.
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { classificarRegistro, fingerprintPipelineConfig, lerRegistro, reconciliarParaRetomada, validarCachesRetomada } from "./batch-driver.mjs"

const runDir = process.argv[2]
if (!runDir) {
  console.error("uso: node prova-retomada.test.mjs <runDir>")
  process.exit(2)
}
const workDir = path.resolve(runDir, "../..")
if (existsSync(path.join(runDir, "execution-lease.json"))) {
  console.error("FALHA: prova de retomada exige batch parado, mas existe lease ativa")
  process.exit(1)
}

// Detecta familia atual (Luna) para reconciliacao por familia
let familiaAtual = "openai"
let modeloAtual = null
let pipelineAtual = null
try {
  const cfgPath = process.argv[3] ?? [
    path.join(workDir, "models-config-restante-codex-luna.json"),
    path.join(workDir, "models-config-restante-luna.json"),
  ].find((caminho) => existsSync(caminho))
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(await readFile(cfgPath, "utf8"))
    const nome = cfg.generator?.name ?? ""
    familiaAtual = nome.toLowerCase().includes("luna") ? "openai" : nome.toLowerCase().includes("deepseek") ? "deepseek" : nome.toLowerCase().includes("glm") ? "glm" : "openai"
    modeloAtual = cfg.generator?.version ?? cfg.generator?.name ?? null
    pipelineAtual = fingerprintPipelineConfig(cfg)
  }
} catch {}

const filaRaw = (await readFile(path.join(runDir, "fila", "fila.ndjson"), "utf8")).trim()
const fila = filaRaw ? filaRaw.split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []

let totalAprovado = 0
let norteNaFila = 0
const estadosContados = { complete: 0, blocked: 0, pending: 0, retryable: 0, generator_pending: 0, other: 0 }
const bloqueadosLista = []
const agendaveisLista = []
const porChave = new Map()

for (const item of fila) {
  if (["AC","AP","AM","PA","RO","RR","TO"].includes(item.uf)) norteNaFila++

  const registro = await lerRegistro(runDir, item)
  if (registro && registro.estado === "aprovado") totalAprovado++

  let estadoAnterior = null
  try {
    const txt = await readFile(path.join(runDir, "candidatos", item.chaveCacheDir, "estado.json"), "utf8")
    estadoAnterior = JSON.parse(txt)
  } catch {}

  // Usa funcao pura do driver para reconciliacao
  const reconciliado = reconciliarParaRetomada({ registro, estadoAnterior, familiaAtual, modeloAtual, pipelineAtual })

  // Contagem a partir de dados, sem hardcode de strings (exceto chaves conhecidas para validacao)
  let estado = reconciliado.estado
  if (estado === "retryable_error") estado = "retryable"
  if (estado === "pending") {} // keep
  if (estadosContados[estado] !== undefined) estadosContados[estado]++
  else estadosContados.other++

  porChave.set(item.chave, { item, reconciliado, registro, estadoAnterior })

  if (estado === "blocked") bloqueadosLista.push({ chave: item.chave, motivo: reconciliado.motivo })
  if (estado === "pending" || estado === "retryable") agendaveisLista.push({ chave: item.chave, estado })

  // Validacoes por item
  if (reconciliado.estado === "complete") {
    if (!registro) {
      console.error(`FALHA: ${item.chave} complete sem registro`)
      process.exit(1)
    }
    const cls = classificarRegistro(registro)
    if (cls.estado !== "complete") {
      console.error(`FALHA: ${item.chave} complete mas registro classifica como ${cls.estado}`)
      process.exit(1)
    }
    if (registro.estado === "perfil_local_ausente" || registro.estado === "sem_documento_oficial" || registro.estado === "falha_de_extracao") {
      // ok sem modelo
    } else if (!registro.julgamento || registro.ingestao?.eval?.completo !== true) {
      console.error(`FALHA: ${item.chave} complete sem eval completo`)
      process.exit(1)
    }
  }
}

console.log(`total fila: ${fila.length}`)
console.log(`estados: ${JSON.stringify(estadosContados)}`)
console.log(`norte na fila (deve ser 0): ${norteNaFila}`)
console.log(`aprovados (deve ser 0): ${totalAprovado}`)
console.log(`bloqueados antes de spawn: ${bloqueadosLista.length} ${bloqueadosLista.map(b=>b.chave).slice(0,6).join(", ")}`)
console.log(`agendaveis (pending+retryable): ${agendaveisLista.length}`)

// Validacoes globais
if (fila.length !== 155) { console.error(`FALHA: total fila ${fila.length} != 155`); process.exit(1) }
if (norteNaFila !== 0) { console.error("FALHA: Norte presente na fila"); process.exit(1) }
if (totalAprovado !== 0) { console.error("FALHA: existe registro aprovado"); process.exit(1) }

const totalReconciliado = estadosContados.complete + estadosContados.blocked + estadosContados.pending + estadosContados.retryable
if (totalReconciliado !== fila.length || estadosContados.other !== 0) {
  console.error(`FALHA: checkpoint nao fecha a fila (${totalReconciliado}/${fila.length}, other=${estadosContados.other})`)
  process.exit(1)
}
if (estadosContados.generator_pending !== 0 && estadosContados.generator_pending !== undefined) {
  // apos normalizacao deve ser 0; se ainda houver, falhar
  if ((estadosContados.generator_pending ?? 0) !== 0) {
    console.error(`FALHA: generator_pending fantasma ${estadosContados.generator_pending} != 0`)
    process.exit(1)
  }
}

const progress = JSON.parse(await readFile(path.join(runDir, "progress.json"), "utf8"))
const esperadoPeloCheckpoint = {
  complete: progress.concluidos,
  blocked: progress.bloqueados,
  agendaveis: progress.pendentes,
}
for (const [campo, atual] of [["complete", estadosContados.complete], ["blocked", estadosContados.blocked], ["agendaveis", agendaveisLista.length]]) {
  if (atual !== esperadoPeloCheckpoint[campo]) {
    console.error(`FALHA: ${campo} ${atual} != ${esperadoPeloCheckpoint[campo]} registrado no progress`)
    process.exit(1)
  }
}
if (progress.totalEsperado !== fila.length || progress.emVoo !== 0) {
  console.error(`FALHA: progress final invalido total=${progress.totalEsperado} emVoo=${progress.emVoo}`)
  process.exit(1)
}

// Qwen+GPT 2 intactos
const chavesQwen = ["2026:GOVERNADOR:PR:160002549553", "2026:GOVERNADOR:BA:50002533190"]
for (const chave of chavesQwen) {
  const entry = porChave.get(chave)
  if (!entry || entry.reconciliado.estado !== "complete") {
    console.error(`FALHA: ${chave} deveria estar complete`)
    process.exit(1)
  }
  const gen = entry.registro?.ingestao?.modelos?.generator
  if (!gen || !String(gen.name).toLowerCase().includes("qwen")) {
    console.error(`FALHA: ${chave} generator nao e Qwen historico`)
    process.exit(1)
  }
  // Nunca deve estar em agendaveis
  if (agendaveisLista.some(a => a.chave === chave)) {
    console.error(`FALHA: Qwen ${chave} seria reexecutada`)
    process.exit(1)
  }
}
console.log(`qwen preservadas: ${chavesQwen.join(", ")}`)

// Extracoes e passagens reutilizaveis: verifica que cache-extracao e cache-passagens existem e nao foram apagados
const caches = await validarCachesRetomada(workDir, { minExtracao: 40, minPassagens: 5 })
console.log(`cache-extracao arquivos: ${caches.extracoes} (esperado >=40)`)
console.log(`cache-passagens candidatos: ${caches.passagens} (esperado >=5)`)

// Verifica que extracao e passagens dos dois normalizados ainda existem
for (const hash of ["96d8067fceb1b168", "4e611a07e735576c"]) {
  const dir = path.join(runDir, "candidatos", hash)
  if (!existsSync(path.join(dir, "fases"))) { console.error(`FALHA: fases ausentes ${hash}`); process.exit(1) }
  if (!existsSync(path.join(dir, "registros"))) { console.error(`FALHA: registros ausentes ${hash}`); process.exit(1) }
}

console.log(`RETOMADA_OK total=155 complete=${estadosContados.complete} blocked=${estadosContados.blocked} pending=${estadosContados.pending} retryable=${estadosContados.retryable} agendaveis=${agendaveisLista.length} norte=0 qwen=2 aprovado=0`)
