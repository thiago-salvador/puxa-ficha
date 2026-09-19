// Rastreia, por pagina, cada resultado ESPERADO ate o ponto em que ele se perde.
// Existe porque "4 de 15 aceitos" nao localiza gargalo nenhum: os outros 11
// podem ser pares errados corretamente rejeitados, abstencoes, ou rejeicoes
// indevidas. Sem atribuir a perda, nao da para dizer se o proximo conserto e no
// extrator, no julgamento ou na composicao.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { paresCandidatos } from "./extrair-candidatos.mjs"

const require = createRequire(import.meta.url)
require("tsx/cjs")
const { stripAccents } = require("../../src/lib/strip-accents.ts")

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, "../..")
const EVID = join(RAIZ, "QA/evidencias/2026-09-19-jev-extracao-pesquisas")
const JEV = join(process.env.HOME ?? "", ".claude/scripts/jev.py")
const PERGUNTAS = join(AQUI, process.env.PF_PERGUNTAS ?? "perguntas-extracao-v4.json")
const ACEITA = 0.8, DESCARTA = 0.2, MED_MIN = 0.6
const POLITICAS = [
  "Enumeracao com verbo eliptico atribui o valor ao nome imediatamente anterior a ele.",
  "Percentual de pesquisa anterior citado para comparacao nao e o resultado atual.",
  "Uma materia pode tratar de mais de uma disputa (governo, Senado, Presidencia) no mesmo texto.",
]
const normal = (s) => stripAccents(s).toLowerCase().replace(/[^a-z ]/g, "").trim()
const mesmaPessoa = (a, b) => { const x = normal(a), y = normal(b); return x === y || x.endsWith(" " + y) || y.endsWith(" " + x) || x.split(" ").at(-1) === y.split(" ").at(-1) }

const cenarios = JSON.parse(readFileSync(join(EVID, "cenarios-esperados.json"), "utf8"))
const relatorio = []
for (const [chave, cfg] of Object.entries(cenarios)) {
  if (chave.startsWith("_")) continue
  const html = readFileSync(cfg.fixture, "utf8")
  const titulo = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 130)
  const pares = paresCandidatos(html).filter((p) => p.nome)
  const dir = mkdtempSync(join(tmpdir(), "jevrast-"))
  const julg = []
  for (const [i, par] of pares.entries()) {
    const sp = join(dir, `s${i}.json`)
    writeFileSync(sp, JSON.stringify({ par: { nome: par.nome, partido: par.partido, percentual: par.percentual, frase: par.frase, paragrafo: par.paragrafo, secao: par.secao?.trecho ?? "nenhuma mencao de disputa antes deste trecho" }, contexto: { materia: { titulo, instituto: cfg.instituto }, alvo: { cargo: cfg.cargo, uf: cfg.uf }, politicas: POLITICAS } }))
    const a = JSON.parse(execFileSync("python3", [JEV, "ask", "--state", sp, "--questions", PERGUNTAS], { encoding: "utf8" })).answers ?? {}
    julg.push({ ...par, atr: a.atribuicao?.noul ?? 0, atu: a.atualidade?.noul ?? 0, alv: a.disputa_alvo?.noul ?? 0, med: a.medida?.choice, medConf: a.medida?.confidence ?? 0, rec: a.recorte?.choice, recConf: a.recorte?.confidence ?? 0 })
  }
  const aceito = (j) => j.atr >= ACEITA && j.atu >= ACEITA && j.alv > DESCARTA && j.med === "intencao_voto_primeiro_turno" && j.medConf >= MED_MIN && j.rec === "geral" && j.recConf >= MED_MIN
  const aceitos = julg.filter(aceito)

  // Cada resultado esperado, rastreado ate onde some.
  const trilha = cfg.esperado.map((e) => {
    const cands = julg.filter((j) => mesmaPessoa(j.nome, e.nome) && j.percentual === e.percentual)
    if (!cands.length) return { ...e, ponto_de_perda: "extrator: par nunca proposto" }
    const ok = cands.filter(aceito)
    if (ok.length) {
      const outros = aceitos.filter((j) => mesmaPessoa(j.nome, e.nome) && j.percentual !== e.percentual)
      return { ...e, ponto_de_perda: outros.length ? `composicao: conflito com ${outros.map((o) => o.percentual + "%").join(", ")}` : "recuperado" }
    }
    const j = cands[0]
    if (j.atr < ACEITA) return { ...e, ponto_de_perda: `julgamento: atribuicao ${j.atr}` }
    if (j.atu < ACEITA) return { ...e, ponto_de_perda: `julgamento: atualidade ${j.atu}` }
    if (j.alv <= DESCARTA) return { ...e, ponto_de_perda: `julgamento: disputa_alvo ${j.alv}` }
    if (j.med !== "intencao_voto_primeiro_turno") return { ...e, ponto_de_perda: `julgamento: medida=${j.med} (${j.medConf})` }
    if (j.medConf < MED_MIN) return { ...e, ponto_de_perda: `julgamento: medida com confianca ${j.medConf}` }
    if (j.rec !== "geral") return { ...e, ponto_de_perda: `julgamento: recorte=${j.rec} (${j.recConf})` }
    return { ...e, ponto_de_perda: `julgamento: recorte com confianca ${j.recConf}` }
  })

  // Falso positivo: entrou no cenario e nao estava no esperado.
  const espurios = aceitos.filter((a) => !cfg.esperado.some((e) => mesmaPessoa(a.nome, e.nome) && a.percentual === e.percentual))
    .map((a) => ({ nome: a.nome, percentual: a.percentual, frase: a.frase.slice(0, 120) }))

  const rec = trilha.filter((t) => t.ponto_de_perda === "recuperado").length
  relatorio.push({ pagina: chave, esperados: cfg.esperado.length, recuperados: rec, pares_propostos: pares.length, aceitos: aceitos.length, espurios: espurios.length, trilha, espurios_detalhe: espurios })
  console.log(`\n######## ${chave}`)
  console.log(`esperados ${cfg.esperado.length} | recuperados ${rec} | pares propostos ${pares.length} | aceitos ${aceitos.length} | espurios ${espurios.length}`)
  for (const t of trilha) console.log(`  ${t.ponto_de_perda === "recuperado" ? "OK  " : "PERDA"} ${String(t.percentual).padStart(3)}% ${t.nome.padEnd(22)} ${t.ponto_de_perda}`)
  for (const e of espurios) console.log(`  ESPURIO ${String(e.percentual).padStart(3)}% ${e.nome.padEnd(22)} :: ${e.frase.slice(0, 80)}`)
}
writeFileSync(join(EVID, process.env.PF_SAIDA ?? "rastreio-perdas.json"), JSON.stringify(relatorio, null, 1))
