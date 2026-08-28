import { spawn } from "node:child_process"
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import {
  construirPromptFinal,
  medirPromptFinalBytes,
  PROGRAMA_GOVERNO_PROMPT_LIMITE_BYTES,
} from "./programas-governo-prompt.mjs"

function lerStdin() {
  return new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.on("data", (chunk) => chunks.push(chunk))
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    process.stdin.on("error", reject)
  })
}

function extrairJson(texto) {
  const cortado = String(texto ?? "").trim()
  try { return JSON.parse(cortado) } catch {}
  const inicio = cortado.indexOf("{")
  if (inicio === -1) throw new Error("resposta sem objeto JSON")
  let profundidade = 0
  let dentroDeString = false
  let escape = false
  for (let i = inicio; i < cortado.length; i += 1) {
    const caractere = cortado[i]
    if (escape) { escape = false; continue }
    if (caractere === "\\") { escape = true; continue }
    if (caractere === '"') { dentroDeString = !dentroDeString; continue }
    if (dentroDeString) continue
    if (caractere === "{") profundidade += 1
    if (caractere === "}") {
      profundidade -= 1
      if (profundidade === 0) return JSON.parse(cortado.slice(inicio, i + 1))
    }
  }
  throw new Error("resposta sem JSON balanceado")
}

function sinalizarGrupo(child, signal) {
  if (!child?.pid) return
  if (process.platform !== "win32") {
    try { process.kill(-child.pid, signal); return } catch {}
  }
  try { child.kill(signal) } catch {}
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function encerrarGrupo(child, closed, graceMs) {
  sinalizarGrupo(child, "SIGTERM")
  await esperar(graceMs)
  sinalizarGrupo(child, "SIGKILL")
  await Promise.race([closed, esperar(graceMs)])
}

async function executarOpenCodeRunnerInterno({ modelo, api, maxTokens, prefixoTemporario, promptCurto }) {
  const bruto = await lerStdin()
  const inicioEnvelope = bruto.indexOf("{")
  const envelope = JSON.parse(bruto.slice(inicioEnvelope === -1 ? 0 : inicioEnvelope))
  if (!envelope || typeof envelope.instructions !== "string" || !envelope.schema || !envelope.input) {
    throw new Error("envelope invalido")
  }
  const promptFinal = construirPromptFinal(envelope.instructions, envelope.schema, envelope.input)
  const promptBytes = medirPromptFinalBytes(envelope.instructions, envelope.schema, envelope.input)
  if (promptBytes >= PROGRAMA_GOVERNO_PROMPT_LIMITE_BYTES) {
    throw new Error(`prompt final ${promptBytes} bytes excede limite seguro ${PROGRAMA_GOVERNO_PROMPT_LIMITE_BYTES}; deve ser particionado via multipassagem`)
  }

  const dirTmp = mkdtempSync(join(tmpdir(), prefixoTemporario))
  const arquivoTmp = join(dirTmp, "prompt.txt")
  writeFileSync(arquivoTmp, promptFinal, "utf8")
  const opencodeGo = process.env.PF_OPENCODE_GO ?? "/Users/thiagosalvador/.codex/skills/opencode/scripts/opencode-go.mjs"
  const timeoutMs = Number(process.env.PF_OPENCODE_TIMEOUT_MS ?? 900_000)
  const paddingMs = Number(process.env.PF_OPENCODE_TIMEOUT_PADDING_MS ?? 5_000)
  const graceMs = Number(process.env.PF_OPENCODE_GRACE_MS ?? 2_000)
  let child
  let childClosed = false
  let shutdownStarted = false
  const signalHandlers = new Map()
  try {
    const args = [
      opencodeGo,
      "consulta",
      "--model", modelo,
      ...(api ? ["--api", api] : []),
      "--prompt", promptCurto,
      "--arquivo", arquivoTmp,
      ...(maxTokens ? ["--max-tokens", String(maxTokens)] : []),
      "--timeout", String(timeoutMs),
      "--json",
    ]
    child = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk.toString() })
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    const closed = new Promise((resolve) => {
      child.once("close", (code, signal) => {
        childClosed = true
        resolve({ code: code ?? -1, signal, stdout, stderr })
      })
    })
    const processError = new Promise((_, reject) => {
      child.once("error", (error) => reject(new Error(`opencode-go erro de processo: ${error.message}`)))
    })
    const timeout = new Promise((_, reject) => {
      const timer = setTimeout(async () => {
        shutdownStarted = true
        await encerrarGrupo(child, closed, graceMs)
        reject(new Error(`opencode-go timeout apos ${timeoutMs}ms`))
      }, timeoutMs + paddingMs)
      closed.finally(() => clearTimeout(timer)).catch(() => {})
    })
    const interrompido = new Promise((_, reject) => {
      for (const signal of ["SIGTERM", "SIGINT"]) {
        const handler = async () => {
          shutdownStarted = true
          await encerrarGrupo(child, closed, graceMs)
          reject(new Error(`runner interrompido por ${signal}`))
        }
        signalHandlers.set(signal, handler)
        process.once(signal, handler)
      }
    })
    const resultado = await Promise.race([closed, processError, timeout, interrompido])
    if (resultado.code !== 0) {
      throw new Error(`opencode-go saiu com ${resultado.code}: ${resultado.stderr.slice(-1200)} | ${resultado.stdout.slice(-800)}`)
    }
    let wrapper
    try { wrapper = JSON.parse(resultado.stdout) } catch { wrapper = null }
    const textoModelo = typeof wrapper?.texto === "string" ? wrapper.texto : resultado.stdout
    const payload = extrairJson(textoModelo)
    if (wrapper?.uso && typeof wrapper.uso === "object") {
      process.stderr.write(`PF_OPENCODE_USAGE=${JSON.stringify(wrapper.uso)}\n`)
    }
    process.stdout.write(JSON.stringify(payload))
    return { uso: wrapper?.uso ?? null, promptVersion: envelope.promptVersion ?? null }
  } finally {
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler)
    if (child && !childClosed && !shutdownStarted) {
      const closed = new Promise((resolve) => child.once("close", resolve))
      await encerrarGrupo(child, closed, graceMs).catch(() => {})
    }
    rmSync(dirTmp, { recursive: true, force: true })
  }
}

function etapaDoPrompt(promptVersion, papel) {
  const value = String(promptVersion ?? "")
  if (value.includes("fatos-passagem")) return "passagem"
  if (value.includes("sintese-fatos")) return "sintese"
  if (papel === "judge") return "judge"
  return "geracao"
}

function registrarTelemetria(config, inicio, resultado, erro) {
  const destino = process.env.PF_MODEL_TELEMETRY_PATH
  if (!destino) return
  const fim = Date.now()
  const row = {
    executionId: process.env.PF_EXECUTION_ID ?? null,
    candidato: process.env.PF_CANDIDATO_CHAVE ?? null,
    sqCandidato: process.env.PF_CANDIDATO_SQ ?? null,
    uf: process.env.PF_CANDIDATO_UF ?? null,
    regiao: process.env.PF_CANDIDATO_REGIAO ?? null,
    papel: config.papel,
    modelo: config.modelo,
    familia: config.familia,
    etapa: etapaDoPrompt(resultado?.promptVersion, config.papel),
    passagem: null,
    inicio: new Date(inicio).toISOString(),
    fim: new Date(fim).toISOString(),
    duracaoMs: fim - inicio,
    exitCode: erro ? 1 : 0,
    erro: erro ? (erro instanceof Error ? erro.message : String(erro)) : null,
    retry: false,
    cacheHit: false,
    uso: resultado?.uso ?? null,
  }
  try {
    mkdirSync(dirname(destino), { recursive: true })
    appendFileSync(destino, `${JSON.stringify(row)}\n`, "utf8")
  } catch {}
}

export async function executarOpenCodeRunner(config) {
  const inicio = Date.now()
  let resultado
  try {
    resultado = await executarOpenCodeRunnerInterno(config)
    return resultado
  } catch (error) {
    registrarTelemetria(config, inicio, resultado, error)
    throw error
  } finally {
    if (resultado) registrarTelemetria(config, inicio, resultado, null)
  }
}
