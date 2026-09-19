// Composicao ponta a ponta: do HTML ao cenario de primeiro turno.
// Mede o que interessa de fato, que nao e o acerto por par, e sim se o conjunto
// reconstroi o cenario certo. Os gates duros continuam em codigo.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { paresCandidatos } from "./extrair-candidatos.mjs"

const AQUI = dirname(fileURLToPath(import.meta.url))
const JEV = join(process.env.HOME ?? "", ".claude/scripts/jev.py")
const PERGUNTAS = join(AQUI, "perguntas-extracao-v3.json")
const ACEITA = 0.8, DESCARTA = 0.2, MED_MIN = 0.6
const POLITICAS = [
  "Enumeracao com verbo eliptico atribui o valor ao nome imediatamente anterior a ele.",
  "Percentual de pesquisa anterior citado para comparacao nao e o resultado atual.",
  "Uma materia pode tratar de mais de uma disputa (governo, Senado, Presidencia) no mesmo texto.",
]

export function comporCenario(html, alvo, instituto) {
  const titulo = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 130)
  const pares = paresCandidatos(html).filter((p) => p.nome)
  const dir = mkdtempSync(join(tmpdir(), "jevcomp-"))
  const julgados = []
  for (const [i, par] of pares.entries()) {
    const sp = join(dir, `s${i}.json`)
    writeFileSync(sp, JSON.stringify({ par: { nome: par.nome, partido: par.partido, percentual: par.percentual, frase: par.frase, paragrafo: par.paragrafo }, contexto: { materia: { titulo, instituto }, alvo, politicas: POLITICAS } }))
    const a = JSON.parse(execFileSync("python3", [JEV, "ask", "--state", sp, "--questions", PERGUNTAS], { encoding: "utf8" })).answers ?? {}
    julgados.push({ ...par, atr: a.atribuicao?.noul ?? 0, atu: a.atualidade?.noul ?? 0, alv: a.disputa_alvo?.noul ?? 0, med: a.medida?.choice, medConf: a.medida?.confidence ?? 0, rev: a.revisao_humana?.noul ?? 0 })
  }
  // Gate de confianca, escrito antes: so entra o que for decidido nas quatro dimensoes.
  const aceitos = julgados.filter((j) => j.atr >= ACEITA && j.atu >= ACEITA && j.alv > DESCARTA && j.med === "intencao_voto_primeiro_turno" && j.medConf >= MED_MIN)
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

if (process.argv[2]) {
  const [fixture, cargo, uf, instituto] = process.argv.slice(2)
  const r = comporCenario(readFileSync(fixture, "utf8"), { cargo, uf }, instituto ?? "Datafolha")
  console.log(JSON.stringify({ pares: r.pares, aceitos: r.aceitos, soma: r.soma, conflitos: r.conflitos.length, revisao: r.revisao }))
  for (const c of r.cenario) console.log(`   ${String(c.percentual).padStart(3)}%  ${c.nome}`)
  for (const c of r.conflitos) console.log(`   CONFLITO ${c.nome}: ${c.valores.join(", ")}`)
}
