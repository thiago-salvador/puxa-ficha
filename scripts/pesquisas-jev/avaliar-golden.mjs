// Avaliador do golden, autocontido: le e escreve dentro do repositorio.
// Mede as TRES decisoes, nao so a atribuicao. A versao anterior deste arquivo
// pontuava atribuicao e disputa_alvo e deixava `medida` sem medicao, justamente
// a classificacao cujo risco (ler rejeicao como intencao de voto) motiva a
// proposta; o "100%" relatado no PR #398 nao cobria a decisao completa.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, "../..")
const GOLDEN = join(RAIZ, "QA/evidencias/2026-09-19-jev-extracao-pesquisas/golden-81.json")
const PERGUNTAS = join(AQUI, "perguntas-extracao-v2.json")
const JEV = join(process.env.HOME ?? "", ".claude/scripts/jev.py")

const POLITICAS = [
  "Enumeracao com verbo eliptico atribui o valor ao nome imediatamente anterior a ele.",
  "Percentual de pesquisa anterior citado para comparacao nao e o resultado atual.",
  "Uma materia pode tratar de mais de uma disputa (governo, Senado, Presidencia) no mesmo texto.",
]

const split = process.argv[2] ?? "holdout"
const dados = JSON.parse(readFileSync(GOLDEN, "utf8")).filter((d) => d.split === split)
const dir = mkdtempSync(join(tmpdir(), "jev394-"))
const res = []

for (const [i, d] of dados.entries()) {
  const state = {
    par: { nome: d.nome, partido: d.partido, percentual: d.percentual, frase: d.frase, paragrafo: d.paragrafo },
    contexto: { materia: { titulo: d.titulo, instituto: "Datafolha", veiculo: "Folha de S.Paulo" }, alvo: { cargo: d.cargo, uf: d.uf }, politicas: POLITICAS },
  }
  const sp = join(dir, `s${i}.json`)
  writeFileSync(sp, JSON.stringify(state))
  const a = JSON.parse(execFileSync("python3", [JEV, "ask", "--state", sp, "--questions", PERGUNTAS], { encoding: "utf8" })).answers ?? {}
  res.push({
    id: d.id,
    atr_p: a.atribuicao?.noul ?? null, atr_y: d.rotulo.atribuicao,
    alv_p: a.disputa_alvo?.noul ?? null, alv_y: d.rotulo.disputa_alvo,
    med_p: a.medida?.choice ?? null, med_conf: a.medida?.confidence ?? null, med_y: d.rotulo.medida,
    rev: a.revisao_humana?.noul ?? null,
  })
}

// Limiares de LIMIARES.md, fixados antes de rodar.
const ACEITA = 0.8, DESCARTA = 0.2, MED_MIN = 0.6
const decid = res.filter((r) => r.atr_p >= ACEITA || r.atr_p <= DESCARTA)
const atrOk = decid.filter((r) => (r.atr_p >= ACEITA ? 1 : 0) === r.atr_y).length
const medDecid = res.filter((r) => (r.med_conf ?? 0) >= MED_MIN)
const medOk = medDecid.filter((r) => r.med_p === r.med_y).length
const medOkTodos = res.filter((r) => r.med_p === r.med_y).length
// O erro que importa: ler outra medida como intencao de voto e publicar.
const contaminacao = res.filter((r) => r.med_y !== "intencao_voto_primeiro_turno" && r.med_p === "intencao_voto_primeiro_turno")
const fpAlvo = res.filter((r) => r.alv_y === 0 && r.alv_p > DESCARTA)
const fnAlvo = res.filter((r) => r.alv_y === 1 && r.alv_p <= DESCARTA)

const resumo = {
  split, n: res.length,
  atribuicao: { decididos: decid.length, cinza: res.length - decid.length, acuracia_na_faixa: decid.length ? Number((atrOk / decid.length).toFixed(3)) : null },
  medida: { acuracia_total: Number((medOkTodos / res.length).toFixed(3)), decididos_conf_min: medDecid.length, acuracia_decididos: medDecid.length ? Number((medOk / medDecid.length).toFixed(3)) : null, contaminacao_como_intencao: contaminacao.length },
  disputa_alvo: { falsos_positivos: fpAlvo.length, falsos_negativos: fnAlvo.length },
}
writeFileSync(join(RAIZ, `QA/evidencias/2026-09-19-jev-extracao-pesquisas/resultado-${split}.json`), JSON.stringify({ resumo, casos: res }, null, 1))
console.log(JSON.stringify(resumo))
for (const r of contaminacao) console.log(`  CONTAMINACAO ${r.id}: rotulo=${r.med_y} previsto=intencao conf=${r.med_conf}`)
for (const r of decid.filter((x) => (x.atr_p >= ACEITA ? 1 : 0) !== x.atr_y)) console.log(`  ERRO atr ${r.id}: p=${r.atr_p} rotulo=${r.atr_y}`)
for (const r of fpAlvo) console.log(`  FP alvo ${r.id}: p=${r.alv_p}`)
