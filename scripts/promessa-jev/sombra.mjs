// Jev em sombra sobre todos os pares do pré-filtro, com a versão de perguntas e a
// regra validadas no golden (ver LIMIARES.md). Só grava log local:
// reports/promessa-evidencia/sombra-<versao>.json (fora do git). Nada vai ao banco
// e nada é publicado; a saída alimenta a fila de revisão.
//
//   node scripts/promessa-jev/sombra.mjs --versao v1 [--concorrencia 6]
//
// Retomável: pares já respondidos com o mesmo state e as mesmas perguntas não
// são enviados de novo.
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { decidir, REGRAS } from "./avaliar-golden.mjs"
import { estadoDoPar } from "./estado.mjs"

const executar = promisify(execFile)
const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, "../..")
const PARES = join(RAIZ, "reports/promessa-evidencia/pares.json")
const JEV = join(process.env.HOME ?? "", ".claude/scripts/jev.py")
const sha = (texto) => createHash("sha256").update(texto).digest("hex")

function argumento(nome, padrao) {
  const indice = process.argv.indexOf(`--${nome}`)
  return indice >= 0 ? process.argv[indice + 1] : padrao
}

const versao = argumento("versao")
const regra = REGRAS[versao]
if (!regra) throw new Error("uso: --versao v1")
const concorrencia = Number(argumento("concorrencia", "6"))
const perguntasPath = join(AQUI, regra.perguntas)
const perguntasSha = sha(readFileSync(perguntasPath, "utf8"))
const destino = join(RAIZ, `reports/promessa-evidencia/sombra-${versao}.json`)
const { recibo, pares } = JSON.parse(readFileSync(PARES, "utf8"))
const anterior = existsSync(destino) ? JSON.parse(readFileSync(destino, "utf8")) : { registros: {} }
const registros = anterior.perguntas_sha256 === perguntasSha ? anterior.registros : {}
const temp = mkdtempSync(join(tmpdir(), "promessa-sombra-"))

let proximo = 0
let enviados = 0
let falhas = 0
async function trabalhador() {
  while (proximo < pares.length) {
    const par = pares[proximo++]
    const estado = JSON.stringify(estadoDoPar(par))
    const estadoSha = sha(estado)
    if (registros[par.parId]?.estado_sha256 === estadoSha && registros[par.parId].answers) continue
    const statePath = join(temp, `${par.parId}.json`)
    writeFileSync(statePath, estado)
    try {
      const { stdout } = await executar("python3", [JEV, "ask", "--state", statePath, "--questions", perguntasPath], { maxBuffer: 1 << 20 })
      const saida = JSON.parse(stdout)
      registros[par.parId] = {
        estado_sha256: estadoSha, model: saida.model, answers: saida.answers,
        input_tokens: saida.usage?.input_tokens ?? null, ...decidir(saida.answers, regra),
      }
      enviados += 1
    } catch (erro) {
      falhas += 1
      registros[par.parId] = { estado_sha256: estadoSha, erro: String(erro.message ?? erro).slice(0, 200) }
    }
  }
}
await Promise.all(Array.from({ length: concorrencia }, trabalhador))

const validos = Object.values(registros).filter((r) => r.answers)
const conta = (f) => validos.filter(f).length
const resumo = {
  versao, perguntas: regra.perguntas, perguntas_sha256: perguntasSha,
  pares_sha256: recibo.snapshot_sha256, rodado_em: new Date().toISOString(),
  pares: pares.length, respondidos: validos.length, enviados_nesta_execucao: enviados, falhas,
  tokens_entrada: validos.reduce((t, r) => t + (r.input_tokens ?? 0), 0),
  descartados: conta((r) => r.descartado),
  para_revisao: conta((r) => !r.descartado),
  pre_rotulo: Object.fromEntries(["sustenta", "contradiz", "relacionada", "nao_relacionada"].map((c) => [c, conta((r) => !r.descartado && r.preRotulo === c)])),
}
writeFileSync(destino, `${JSON.stringify({ ...resumo, registros }, null, 1)}\n`)
console.log(JSON.stringify(resumo, null, 1))
if (falhas > 0) process.exitCode = 1
