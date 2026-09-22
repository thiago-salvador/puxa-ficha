// Avaliador do golden promessa x evidência (ver LIMIARES.md).
//
//   node scripts/promessa-jev/avaliar-golden.mjs --conjunto ajuste --versao v1
//   node scripts/promessa-jev/avaliar-golden.mjs --conjunto holdout --versao v1
//
// Chama o Jev uma vez por par e guarda a resposta crua em
// QA/evidencias/2026-09-22-jev-promessa-evidencia/rodadas/<versao>-<conjunto>.json.
// O holdout de uma versão roda uma vez só: se a rodada existe, só recalcula as
// métricas a partir dela. Nada aqui escreve no banco.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { estadoDoPar } from "./estado.mjs"

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, "../..")
const PASTA = join(RAIZ, "QA/evidencias/2026-09-22-jev-promessa-evidencia")
const JEV = join(process.env.HOME ?? "", ".claude/scripts/jev.py")
const CLASSES = ["sustenta", "contradiz", "relacionada", "nao_relacionada"]

/** Regras por versão, fixadas antes de rodar o holdout daquela versão. */
export const REGRAS = {
  v1: { perguntas: "perguntas-v1.json", descarteChoiceMin: 0.8, descarteNoulMax: 0.2 },
}

export function decidir(respostas, regra) {
  const probabilidades = respostas.relacao?.probabilities ?? {}
  const preRotulo = CLASSES.reduce((melhor, classe) =>
    (probabilidades[classe] ?? 0) > (probabilidades[melhor] ?? 0) ? classe : melhor, "nao_relacionada")
  const mesmo = respostas.mesmo_compromisso?.noul
  const descartado = preRotulo === "nao_relacionada"
    && (probabilidades.nao_relacionada ?? 0) >= regra.descarteChoiceMin
    && typeof mesmo === "number" && mesmo <= regra.descarteNoulMax
  return { preRotulo, descartado }
}

export function metricas(casos) {
  const matriz = Object.fromEntries(CLASSES.map((r) => [r, Object.fromEntries(CLASSES.map((p) => [p, 0]))]))
  for (const caso of casos) matriz[caso.rotulo][caso.preRotulo] += 1
  const porClasse = Object.fromEntries(CLASSES.map((classe) => {
    const total = casos.filter((c) => c.rotulo === classe).length
    const certos = casos.filter((c) => c.rotulo === classe && c.preRotulo === classe).length
    return [classe, { total, certos, concordancia: total ? Number((certos / total).toFixed(3)) : null }]
  }))
  const relacionado = (classe) => classe !== "nao_relacionada"
  const binariaCertos = casos.filter((c) => relacionado(c.rotulo) === relacionado(c.preRotulo)).length
  const descartados = casos.filter((c) => c.descartado)
  const naoRelacionadas = casos.filter((c) => c.rotulo === "nao_relacionada").length
  const descarteSemSustentaOuContradiz = descartados.filter((c) => c.rotulo === "sustenta" || c.rotulo === "contradiz").length === 0
  const descarteRelacionadaNoMaximo1 = descartados.filter((c) => c.rotulo === "relacionada").length <= 1
  const coberturaDescarteNaoRelacionada = naoRelacionadas ? Number((descartados.filter((c) => c.rotulo === "nao_relacionada").length / naoRelacionadas).toFixed(3)) : null
  const concordanciaBinaria = Number((binariaCertos / casos.length).toFixed(3))
  const criterio = {
    descarteSemSustentaOuContradiz,
    descarteRelacionadaNoMaximo1,
    coberturaDescarteNaoRelacionada,
    concordanciaBinaria,
    c1: descarteSemSustentaOuContradiz && descarteRelacionadaNoMaximo1,
    c2: (coberturaDescarteNaoRelacionada ?? 0) >= 0.4,
    c3: concordanciaBinaria >= 0.8,
  }
  return {
    pares: casos.length,
    descartados: descartados.length,
    descartadosPorRotulo: Object.fromEntries(CLASSES.map((r) => [r, descartados.filter((c) => c.rotulo === r).length])),
    porClasse,
    matriz,
    criterio,
  }
}

function argumento(nome) {
  const indice = process.argv.indexOf(`--${nome}`)
  return indice >= 0 ? process.argv[indice + 1] : undefined
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const conjunto = argumento("conjunto")
  const versao = argumento("versao")
  const regra = REGRAS[versao]
  if (!["ajuste", "holdout"].includes(conjunto) || !regra) throw new Error("uso: --conjunto ajuste|holdout --versao v1")
  const itens = JSON.parse(readFileSync(join(PASTA, "golden-pares.json"), "utf8")).itens.filter((i) => i.conjunto === conjunto)
  const rotulos = JSON.parse(readFileSync(join(PASTA, "golden-rotulos.json"), "utf8")).rotulos
  const perguntas = join(AQUI, regra.perguntas)
  const rodadaPath = join(PASTA, "rodadas", `${versao}-${conjunto}.json`)
  mkdirSync(dirname(rodadaPath), { recursive: true })
  let rodada = existsSync(rodadaPath) ? JSON.parse(readFileSync(rodadaPath, "utf8")) : null
  if (!rodada) {
    const temp = mkdtempSync(join(tmpdir(), "promessa-jev-"))
    const respostas = {}
    let falhas = 0
    for (const item of itens) {
      const statePath = join(temp, `${item.par.parId}.json`)
      writeFileSync(statePath, JSON.stringify(estadoDoPar(item.par)))
      try {
        const saida = JSON.parse(execFileSync("python3", [JEV, "ask", "--state", statePath, "--questions", perguntas], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))
        respostas[item.par.parId] = { answers: saida.answers, model: saida.model, ms: saida._ms }
      } catch (erro) {
        falhas += 1
        respostas[item.par.parId] = { erro: String(erro.message ?? erro).slice(0, 200) }
      }
    }
    rodada = { versao, conjunto, perguntas: regra.perguntas, rodado_em: new Date().toISOString(), falhas, respostas }
    writeFileSync(rodadaPath, `${JSON.stringify(rodada, null, 1)}\n`)
  }
  const casos = itens.map((item) => {
    const resposta = rodada.respostas[item.par.parId]
    const rotulo = rotulos[item.par.parId].rotulo
    if (!resposta?.answers) return { parId: item.par.parId, grupo: item.grupo, tipo: item.par.evidencia.tipo, rotulo, preRotulo: "nao_relacionada", descartado: false, falha: true }
    const { preRotulo, descartado } = decidir(resposta.answers, regra)
    return {
      parId: item.par.parId, grupo: item.grupo, tipo: item.par.evidencia.tipo, rotulo, preRotulo, descartado,
      probabilidades: resposta.answers.relacao?.probabilities,
      nouls: Object.fromEntries(Object.entries(resposta.answers).filter(([, v]) => v.type === "noul").map(([k, v]) => [k, v.noul])),
    }
  })
  const resultado = { versao, conjunto, modelo: Object.values(rodada.respostas).find((r) => r.model)?.model, falhasDeServico: rodada.falhas, ...metricas(casos) }
  resultado.divergencias = casos.filter((c) => c.rotulo !== c.preRotulo || c.falha).map((c) => ({
    parId: c.parId, grupo: c.grupo, tipo: c.tipo, rotulo: c.rotulo, preRotulo: c.preRotulo, descartado: c.descartado,
    probabilidades: c.probabilidades, nouls: c.nouls, classificacao: null,
  }))
  writeFileSync(join(PASTA, `resultado-${versao}-${conjunto}.json`), `${JSON.stringify(resultado, null, 2)}\n`)
  const { divergencias, ...resumo } = resultado
  console.log(JSON.stringify({ ...resumo, divergencias: divergencias.length }, null, 1))
}
