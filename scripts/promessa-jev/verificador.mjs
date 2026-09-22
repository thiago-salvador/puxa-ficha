// Verificador independente da cascata: outra família de modelo (Codex CLI), sem
// ver as respostas do Jev, sem ferramentas, sem web. Julga lotes de pares e
// devolve, por par, se a evidência trata do mesmo assunto do tema e se é ato
// só simbólico. Usa o transporte já existente em
// scripts/data/programas-governo-governadores-2026/run-judge-codex.mjs.
import { spawn } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { POLITICAS } from "./estado.mjs"

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const RUNNER = join(RAIZ, "scripts/data/programas-governo-governadores-2026/run-judge-codex.mjs")
export const MODELO_VERIFICADOR = process.env.PF_PROMESSA_VERIFICADOR_MODEL ?? "gpt-5.6-luna"

export const INSTRUCOES_VERIFICADOR = [
  "Você verifica vínculos entre um tema do programa de governo de um candidato e um registro público do mesmo candidato (voto, proposição de lei, posição declarada ou fala).",
  "Para cada item de INPUT.itens responda, sem avaliar se o compromisso foi cumprido:",
  "- mesmo_assunto: \"sim\" se o registro trata do assunto que o título do tema nomeia; \"nao\" se trata de outro assunto ou só divide a área ampla com um título estreito, ou se a ligação exige explicação externa; \"incerto\" se o texto não permite decidir.",
  "- ato_simbolico: true se o registro é só nome de via ou obra, data ou semana comemorativa, título honorífico, declaração de utilidade pública ou homenagem.",
  "Regras:",
  ...POLITICAS.map((regra) => `- ${regra}`),
  "Devolva um item de resposta para cada par_id recebido, na mesma ordem.",
].join("\n")

export const SCHEMA_VERIFICADOR = {
  type: "object",
  additionalProperties: false,
  required: ["itens"],
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["par_id", "mesmo_assunto", "ato_simbolico"],
        properties: {
          par_id: { type: "string" },
          mesmo_assunto: { type: "string", enum: ["sim", "nao", "incerto"] },
          ato_simbolico: { type: "boolean" },
        },
      },
    },
  },
}

/** Entrada mínima do verificador: título, descrição e trecho do tema; conteúdo da evidência. */
export function entradaDoPar(par) {
  const conteudo = {}
  for (const [chave, valor] of Object.entries(par.evidencia.conteudo)) {
    if (valor === null || valor === "" || valor === false) continue
    conteudo[chave] = typeof valor === "string" ? valor.replace(/\s+/gu, " ").slice(0, 600) : valor
  }
  return {
    par_id: par.parId,
    tema: {
      titulo: par.compromisso.titulo,
      descricao: par.compromisso.descricao,
      trecho_do_programa: (par.compromisso.evidencias[0]?.trecho ?? "").replace(/\s+/gu, " ").slice(0, 400),
    },
    registro: { tipo: par.evidencia.tipo, data: par.evidencia.data, conteudo },
  }
}

export function validarRespostaVerificador(resposta, parIds) {
  const itens = resposta?.itens
  if (!Array.isArray(itens) || itens.length !== parIds.length) throw new Error("verificador devolveu quantidade de itens diferente do lote")
  const porId = new Map(itens.map((item) => [item.par_id, item]))
  return parIds.map((id) => {
    const item = porId.get(id)
    if (!item || !["sim", "nao", "incerto"].includes(item.mesmo_assunto) || typeof item.ato_simbolico !== "boolean") {
      throw new Error(`verificador sem resposta valida para ${id}`)
    }
    return { par_id: id, mesmo_assunto: item.mesmo_assunto, ato_simbolico: item.ato_simbolico }
  })
}

export function verificarLote(pares, { timeoutMs = 600_000 } = {}) {
  const envelope = { instructions: INSTRUCOES_VERIFICADOR, schema: SCHEMA_VERIFICADOR, input: { itens: pares.map(entradaDoPar) } }
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [RUNNER], {
      env: { ...process.env, PF_CODEX_MODEL: MODELO_VERIFICADOR, PF_CODEX_REASONING_EFFORT: "low", PF_CODEX_TIMEOUT_MS: String(timeoutMs) },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", rejectPromise)
    child.on("close", (code) => {
      if (code !== 0) return rejectPromise(new Error(`verificador saiu com ${code}: ${stderr.slice(-300)}`))
      try {
        resolvePromise(validarRespostaVerificador(JSON.parse(stdout), pares.map((p) => p.parId)))
      } catch (erro) {
        rejectPromise(erro)
      }
    })
    child.stdin.end(JSON.stringify(envelope))
  })
}
