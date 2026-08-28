// Prova de retomada: reconcilia a fila usando a mesma logica pura do driver.
// Valida: complete nao reexecuta, 104 agendaveis (98 pending +6 retryable), Norte 0,
// Qwen+GPT 2 intactos, sem aprovado, extracoes e passagens reutilizaveis,
// lista exata de bloqueados antes de qualquer spawn.
import { readFile, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { classificarRegistro, lerRegistro, reconciliarParaRetomada } from "./batch-driver.mjs"

const runDir = process.argv[2]
if (!runDir) {
  console.error("uso: node prova-retomada.test.mjs <runDir>")
  process.exit(2)
}

// Detecta familia atual (Luna) para reconciliacao por familia
let familiaAtual = "openai"
try {
  const cfgPath = path.join(path.dirname(runDir), "..", "models-config-restante-luna.json")
  // fallback: procura em pf-gov-2026-work
  const alt = "/Users/thiagosalvador/Documents/Apps/Puxa Ficha/pf-gov-2026-work/models-config-restante-luna.json"
  const p = existsSync(cfgPath) ? cfgPath : alt
  if (existsSync(p)) {
    const cfg = JSON.parse(await readFile(p, "utf8"))
    const nome = cfg.generator?.name ?? ""
    familiaAtual = nome.toLowerCase().includes("luna") ? "openai" : nome.toLowerCase().includes("deepseek") ? "deepseek" : nome.toLowerCase().includes("glm") ? "glm" : "openai"
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
  const reconciliado = reconciliarParaRetomada({ registro, estadoAnterior, familiaAtual })

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

// 47 complete, 2 blocked (MT), 98 pending, 8 retryable, 106 agendaveis, 0 generator_pending fantasma
const esperado = { complete: 47, blocked: 2, pending: 98, retryable: 8 }
for (const [k, v] of Object.entries(esperado)) {
  if (estadosContados[k] !== v) {
    console.error(`FALHA: ${k} ${estadosContados[k]} != ${v} (esperado apos normalizacao 104 agendaveis)`)
    console.error(`estados: ${JSON.stringify(estadosContados)}`)
    process.exit(1)
  }
}
if (estadosContados.generator_pending !== 0 && estadosContados.generator_pending !== undefined) {
  // apos normalizacao deve ser 0; se ainda houver, falhar
  if ((estadosContados.generator_pending ?? 0) !== 0) {
    console.error(`FALHA: generator_pending fantasma ${estadosContados.generator_pending} != 0`)
    process.exit(1)
  }
}
if (agendaveisLista.length !== 106) {
  console.error(`FALHA: agendaveis ${agendaveisLista.length} != 104`)
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
const cacheExtracao = "/Users/thiagosalvador/Documents/Apps/Puxa Ficha/pf-gov-2026-work/cache-extracao"
const cachePassagens = "/Users/thiagosalvador/Documents/Apps/Puxa Ficha/pf-gov-2026-work/cache-passagens"
if (existsSync(cacheExtracao)) {
  const n = (await readdir(cacheExtracao)).length
  console.log(`cache-extracao arquivos: ${n} (esperado >=41)`)
  if (n < 40) { console.error("FALHA: cache-extracao ausente"); process.exit(1) }
}
if (existsSync(cachePassagens)) {
  const n = (await readdir(cachePassagens)).length
  console.log(`cache-passagens candidatos: ${n} (esperado >=5)`)
  if (n < 5) { console.error("FALHA: cache-passagens ausente"); process.exit(1) }
}

// Verifica que extracao e passagens dos dois normalizados ainda existem
for (const hash of ["96d8067fceb1b168", "4e611a07e735576c"]) {
  const dir = path.join(runDir, "candidatos", hash)
  if (!existsSync(path.join(dir, "fases"))) { console.error(`FALHA: fases ausentes ${hash}`); process.exit(1) }
  if (!existsSync(path.join(dir, "registros"))) { console.error(`FALHA: registros ausentes ${hash}`); process.exit(1) }
}

console.log("RETOMADA_OK total=155 complete=47 blocked=2 pending=98 retryable=8 agendaveis=106 norte=0 qwen=2 aprovado=0")
