// Composicao ponta a ponta: do HTML ao cenario de primeiro turno.
// Mede o que interessa de fato, que nao e o acerto por par, e sim se o conjunto
// reconstroi o cenario certo. Os gates duros continuam em codigo.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { paresCandidatos } from "./extrair-candidatos.mjs"

const AQUI = dirname(fileURLToPath(import.meta.url))
const JEV = join(process.env.HOME ?? "", ".claude/scripts/jev.py")
const PERGUNTAS = join(AQUI, "perguntas-extracao-v4.json")
const ACEITA = 0.8, DESCARTA = 0.2, MED_MIN = 0.6
const validScore = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
const scoreAtLeast = (value, threshold) => validScore(value) && value >= threshold
const scoreAtMost = (value, threshold) => validScore(value) && value <= threshold
const POLITICAS = [
  "Enumeracao com verbo eliptico atribui o valor ao nome imediatamente anterior a ele.",
  "Percentual de pesquisa anterior citado para comparacao nao e o resultado atual.",
  "Uma materia pode tratar de mais de uma disputa (governo, Senado, Presidencia) no mesmo texto.",
]

function criarEstado(par, alvo, titulo, instituto) {
  return {
    par: {
      nome: par.nome,
      partido: par.partido,
      percentual: par.percentual,
      frase: par.frase,
      paragrafo: par.paragrafo,
      secao: par.secao?.trecho ?? "nenhuma mencao de disputa antes deste trecho",
    },
    contexto: { materia: { titulo, instituto }, alvo, politicas: POLITICAS },
  }
}

function criarAskerJev() {
  const dir = mkdtempSync(join(tmpdir(), "jevcomp-"))
  return (state, index) => {
    const sp = join(dir, `s${index}.json`)
    writeFileSync(sp, JSON.stringify(state))
    return JSON.parse(execFileSync("python3", [JEV, "ask", "--state", sp, "--questions", PERGUNTAS], { encoding: "utf8" })).answers ?? {}
  }
}

export function comporCenario(html, alvo, instituto, options = {}) {
  const titulo = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 130)
  const pares = paresCandidatos(html).filter((p) => p.nome)
  const ask = options.ask ?? criarAskerJev()
  const cache = new Map()
  const julgados = []
  for (const [i, par] of pares.entries()) {
    const state = criarEstado(par, alvo, titulo, instituto)
    const key = JSON.stringify(state)
    if (!cache.has(key)) cache.set(key, ask(state, i))
    const a = cache.get(key)
    julgados.push({ ...par, atr: a.atribuicao?.noul ?? null, atu: a.atualidade?.noul ?? null, alv: a.disputa_alvo?.noul ?? null, med: a.medida?.choice, medConf: a.medida?.confidence ?? null, rec: a.recorte?.choice, recConf: a.recorte?.confidence ?? null, rev: a.revisao_humana?.noul ?? null })
  }
  // Gate de confiança: dimensões cinza ou revisão humana bloqueiam o cenário.
  const aceitos = julgados.filter((j) => scoreAtLeast(j.atr, ACEITA) && scoreAtLeast(j.atu, ACEITA) && scoreAtLeast(j.alv, ACEITA) && j.med === "intencao_voto_primeiro_turno" && scoreAtLeast(j.medConf, MED_MIN) && j.rec === "geral" && scoreAtLeast(j.recConf, MED_MIN) && scoreAtMost(j.rev, DESCARTA))
  const porNome = new Map()
  for (const j of aceitos) {
    const chave = j.nome
    if (!porNome.has(chave)) porNome.set(chave, new Set())
    porNome.get(chave).add(j.percentual)
  }
  const cenario = [], conflitos = []
  for (const [nome, valores] of porNome) {
    if (valores.size === 1) cenario.push({ nome, percentual: [...valores][0] })
    else conflitos.push({ nome, valores: [...valores] })
  }
  cenario.sort((a, b) => b.percentual - a.percentual)
  const soma = cenario.reduce((t, c) => t + c.percentual, 0)
  return { pares: pares.length, julgados: julgados.length, aceitos: aceitos.length, cenario, conflitos, soma, revisao: julgados.filter((j) => j.rev >= 0.6).length }
}

const EXECUTADO_DIRETO = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (EXECUTADO_DIRETO && process.argv[2]) {
  const [fixture, cargo, uf, instituto] = process.argv.slice(2)
  if (!instituto?.trim()) {
    console.error("instituto obrigatório na CLI; não há default seguro")
    process.exitCode = 1
  } else {
    const r = comporCenario(readFileSync(fixture, "utf8"), { cargo, uf }, instituto)
    console.log(JSON.stringify({ pares: r.pares, aceitos: r.aceitos, soma: r.soma, conflitos: r.conflitos.length, revisao: r.revisao }))
    for (const c of r.cenario) console.log(`   ${String(c.percentual).padStart(3)}%  ${c.nome}`)
    for (const c of r.conflitos) console.log(`   CONFLITO ${c.nome}: ${c.valores.join(", ")}`)
  }
}
