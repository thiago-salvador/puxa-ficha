// Cascata de publicação autônoma (ver LIMIARES-cascata.md).
//
//   node scripts/promessa-jev/cascata.mjs --conjunto ajuste --versao c1   # mede no ajuste
//   node scripts/promessa-jev/cascata.mjs --conjunto holdout --versao c1  # roda uma vez
//   node scripts/promessa-jev/cascata.mjs --universo --versao c1          # decide publicação
//
// Camadas: bloqueio de ato simbólico em código; Jev v1 (log de sombra); segunda
// request do Jev com Nouls decompostos; verificador de outra família, cego ao Jev.
// Só leitura e escrita de arquivos locais; nada vai ao banco daqui.
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { estadoDoPar } from "./estado.mjs"
import { MODELO_VERIFICADOR, verificarLote } from "./verificador.mjs"

const executar = promisify(execFile)
const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, "../..")
const PASTA_QA = join(RAIZ, "QA/evidencias/2026-09-22-jev-promessa-evidencia")
const PASTA_REPORTS = join(RAIZ, "reports/promessa-evidencia")
const JEV = join(process.env.HOME ?? "", ".claude/scripts/jev.py")
const sha = (texto) => createHash("sha256").update(texto).digest("hex")

/** Cortes por versão da cascata, congelados antes do holdout daquela versão. */
export const REGRAS_CASCATA = {
  c1: {
    perguntas: "perguntas-cascata-v1.json",
    objetoMin: 0.7,
    simbolicoMax: 0.3,
    explicacaoMax: 0.3,
    genericaMax: 0.5,
  },
}

const ATO_SIMBOLICO = /^\s*(denomina|d[aá] (o )?nome|institui (o|a) (dia|semana|data|m[eê]s)|declara (de )?utilidade|reconhece o munic[ií]pio|inscreve (o )?nome|confere|concede (o )?t[ií]tulo|homenage)/iu

export function bloqueadoPorCodigo(par) {
  return par.evidencia.tipo === "projeto_lei" && ATO_SIMBOLICO.test(String(par.evidencia.conteudo.ementa ?? ""))
}

/** Decisão final. Retorna o motivo da primeira camada que barrou, ou null se publica. */
export function decidirCascata(par, camadas, regra) {
  if (bloqueadoPorCodigo(par)) return "codigo_ato_simbolico"
  const v1 = camadas.jevV1
  if (!v1?.answers || v1.descartado || !["relacionada", "sustenta"].includes(v1.preRotulo)) return "jev_v1"
  const j = camadas.jevCascata?.answers
  if (!j) return "jev_cascata_sem_resposta"
  const noul = (id) => j[id]?.noul
  if (!(noul("objeto_concreto") >= regra.objetoMin)) return "jev_objeto_concreto"
  if (!(noul("ato_simbolico") <= regra.simbolicoMax)) return "jev_ato_simbolico"
  if (!(noul("precisa_explicacao") <= regra.explicacaoMax)) return "jev_precisa_explicacao"
  if (!(noul("frase_generica") <= regra.genericaMax)) return "jev_frase_generica"
  const verificador = camadas.verificador
  if (!verificador) return "verificador_sem_resposta"
  if (verificador.mesmo_assunto !== "sim") return "verificador_mesmo_assunto"
  if (verificador.ato_simbolico) return "verificador_ato_simbolico"
  return null
}

async function rodarCamadas(pares, registrosV1, regra, cache) {
  const perguntasPath = join(AQUI, regra.perguntas)
  const perguntasSha = sha(readFileSync(perguntasPath, "utf8"))
  const temp = mkdtempSync(join(tmpdir(), "promessa-cascata-"))
  const pendentesJev = pares.filter((p) => !bloqueadoPorCodigo(p) && ["relacionada", "sustenta"].includes(registrosV1[p.parId]?.preRotulo) && !registrosV1[p.parId]?.descartado)
  let proximo = 0
  const trabalhador = async () => {
    while (proximo < pendentesJev.length) {
      const par = pendentesJev[proximo++]
      const estado = JSON.stringify(estadoDoPar(par))
      const chave = `${par.parId}|${sha(estado)}|${perguntasSha}`
      if (cache.jevCascata[par.parId]?.chave === chave) continue
      const statePath = join(temp, `${par.parId}.json`)
      writeFileSync(statePath, estado)
      try {
        const { stdout } = await executar("python3", [JEV, "ask", "--state", statePath, "--questions", perguntasPath], { maxBuffer: 1 << 20 })
        const saida = JSON.parse(stdout)
        cache.jevCascata[par.parId] = { chave, model: saida.model, answers: saida.answers }
      } catch (erro) {
        cache.jevCascata[par.parId] = { chave, erro: String(erro.message ?? erro).slice(0, 200) }
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, trabalhador))

  // Verificador só onde o Jev já deixou passar: economiza chamada e mantém a regra "os dois concordam".
  const paraVerificar = pendentesJev.filter((par) => decidirCascata(par, { jevV1: registrosV1[par.parId], jevCascata: cache.jevCascata[par.parId], verificador: { mesmo_assunto: "sim", ato_simbolico: false } }, regra) === null
    && !cache.verificador[par.parId])
  const lotes = []
  for (let i = 0; i < paraVerificar.length; i += 10) lotes.push(paraVerificar.slice(i, i + 10))
  let proximoLote = 0
  const trabalhadorLote = async () => {
    while (proximoLote < lotes.length) {
      const lote = lotes[proximoLote++]
      try {
        for (const resposta of await verificarLote(lote)) cache.verificador[resposta.par_id] = { ...resposta, modelo: MODELO_VERIFICADOR }
      } catch (erro) {
        cache.falhasVerificador.push(String(erro.message ?? erro).slice(0, 200))
      }
    }
  }
  await Promise.all(Array.from({ length: 3 }, trabalhadorLote))
}

function decisoes(pares, registrosV1, regra, cache) {
  return pares.map((par) => ({
    par,
    barrado: decidirCascata(par, { jevV1: registrosV1[par.parId], jevCascata: cache.jevCascata[par.parId], verificador: cache.verificador[par.parId] }, regra),
  }))
}

function argumento(nome) {
  const indice = process.argv.indexOf(`--${nome}`)
  return indice >= 0 ? process.argv[indice + 1] : undefined
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const versao = argumento("versao")
  const regra = REGRAS_CASCATA[versao]
  if (!regra) throw new Error("uso: --versao c1 (--conjunto ajuste|holdout | --universo)")
  const { registros: registrosV1 } = JSON.parse(readFileSync(join(PASTA_REPORTS, "sombra-v1.json"), "utf8"))

  if (process.argv.includes("--universo")) {
    const { pares, recibo } = JSON.parse(readFileSync(join(PASTA_REPORTS, "pares.json"), "utf8"))
    const destino = join(PASTA_REPORTS, `cascata-${versao}.json`)
    const cache = existsSync(destino) ? JSON.parse(readFileSync(destino, "utf8")).cache : { jevCascata: {}, verificador: {}, falhasVerificador: [] }
    cache.falhasVerificador = []
    await rodarCamadas(pares, registrosV1, regra, cache)
    const lista = decisoes(pares, registrosV1, regra, cache)
    const barradoPor = {}
    for (const { barrado } of lista) if (barrado) barradoPor[barrado] = (barradoPor[barrado] ?? 0) + 1
    const publicar = lista.filter((d) => d.barrado === null).map((d) => d.par.parId)
    const resumo = { versao, snapshot_sha256: recibo.snapshot_sha256, rodado_em: new Date().toISOString(), pares: pares.length, publicar: publicar.length, barradoPor, falhasVerificador: cache.falhasVerificador.length, verificador: MODELO_VERIFICADOR }
    writeFileSync(destino, `${JSON.stringify({ ...resumo, publicar, cache }, null, 1)}\n`)
    console.log(JSON.stringify(resumo, null, 1))
    if (cache.falhasVerificador.length > 0) process.exitCode = 1
  } else {
    const conjunto = argumento("conjunto")
    if (!["ajuste", "holdout"].includes(conjunto)) throw new Error("uso: --conjunto ajuste|holdout")
    const itens = JSON.parse(readFileSync(join(PASTA_QA, "cascata-pares.json"), "utf8")).itens.filter((i) => i.conjunto === conjunto)
    const rotulos = JSON.parse(readFileSync(join(PASTA_QA, "cascata-rotulos.json"), "utf8")).rotulos
    const rodadaPath = join(PASTA_QA, "rodadas", `cascata-${versao}-${conjunto}.json`)
    mkdirSync(dirname(rodadaPath), { recursive: true })
    const existente = existsSync(rodadaPath) ? JSON.parse(readFileSync(rodadaPath, "utf8")) : null
    if (conjunto === "holdout" && existente) console.error("holdout desta versao ja rodou: so recalculando")
    const cache = existente?.cache ?? { jevCascata: {}, verificador: {}, falhasVerificador: [] }
    const v1 = Object.fromEntries(itens.map((i) => [i.par.parId, registrosV1[i.par.parId]]))
    if (!existente) {
      await rodarCamadas(itens.map((i) => i.par), v1, regra, cache)
      writeFileSync(rodadaPath, `${JSON.stringify({ versao, conjunto, rodado_em: new Date().toISOString(), jevV1: v1, cache }, null, 1)}\n`)
    }
    const lista = decisoes(itens.map((i) => i.par), existente?.jevV1 ?? v1, regra, cache)
    const relacionado = (r) => r !== "nao_relacionada"
    const publicados = lista.filter((d) => d.barrado === null)
    const resultado = {
      versao, conjunto, verificador: MODELO_VERIFICADOR, falhasVerificador: cache.falhasVerificador.length,
      pares: lista.length,
      relacionadosNoConjunto: lista.filter((d) => relacionado(rotulos[d.par.parId].rotulo)).length,
      publicados: publicados.length,
      publicadosNaoRelacionados: publicados.filter((d) => !relacionado(rotulos[d.par.parId].rotulo)).map((d) => ({ parId: d.par.parId, nota: rotulos[d.par.parId].nota })),
      relacionadosBarrados: lista.filter((d) => d.barrado && relacionado(rotulos[d.par.parId].rotulo)).map((d) => ({ parId: d.par.parId, barrado: d.barrado })),
    }
    resultado.cobertura = Number((publicados.filter((d) => relacionado(rotulos[d.par.parId].rotulo)).length / resultado.relacionadosNoConjunto).toFixed(3))
    resultado.criterio = { c1: resultado.publicadosNaoRelacionados.length === 0, c2: resultado.cobertura >= 0.25 }
    writeFileSync(join(PASTA_QA, `resultado-cascata-${versao}-${conjunto}.json`), `${JSON.stringify(resultado, null, 2)}\n`)
    console.log(JSON.stringify(resultado, null, 1))
  }
}
