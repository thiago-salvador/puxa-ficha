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
const GOLDEN = join(RAIZ, "QA/evidencias/2026-09-19-jev-extracao-pesquisas", process.env.PF_GOLDEN ?? "golden-81.json")
const PERGUNTAS = join(AQUI, process.env.PF_PERGUNTAS ?? "perguntas-extracao-v2.json")
const JEV = join(process.env.HOME ?? "", ".claude/scripts/jev.py")

const POLITICAS = [
  "Enumeracao com verbo eliptico atribui o valor ao nome imediatamente anterior a ele.",
  "Percentual de pesquisa anterior citado para comparacao nao e o resultado atual.",
  "Uma materia pode tratar de mais de uma disputa (governo, Senado, Presidencia) no mesmo texto.",
]

// Limiares de LIMIARES.md, fixados antes de rodar.
const ACEITA = 0.8, DESCARTA = 0.2, MED_MIN = 0.6
const scoreDisponivel = (value) => typeof value === "number" && Number.isFinite(value)
const scoreDecidido = (value) => scoreDisponivel(value) && (value >= ACEITA || value <= DESCARTA)

export function contextoMateria(d) {
  const materia = { titulo: d.titulo }
  for (const key of ["instituto", "veiculo"]) {
    if (typeof d[key] === "string" && d[key].trim()) materia[key] = d[key].trim()
  }
  return materia
}

export function estadoGolden(d) {
  return {
    par: { nome: d.nome, partido: d.partido, percentual: d.percentual, frase: d.frase, paragrafo: d.paragrafo },
    contexto: { materia: contextoMateria(d), alvo: { cargo: d.cargo, uf: d.uf }, politicas: POLITICAS },
  }
}

export function avaliarResultados(res, split = "holdout") {
  const decid = res.filter((r) => r.atr_y !== undefined && r.atr_y !== null && scoreDecidido(r.atr_p))
  const atrOk = decid.filter((r) => (r.atr_p >= ACEITA ? 1 : 0) === r.atr_y).length
  const comMed = res.filter((r) => r.med_y)
  const medDecid = comMed.filter((r) => (r.med_conf ?? 0) >= MED_MIN)
  const medOk = medDecid.filter((r) => r.med_p === r.med_y).length
  const medOkTodos = comMed.filter((r) => r.med_p === r.med_y).length
  // O erro que importa: ler outra medida como intencao de voto e publicar.
  const contaminacao = comMed.filter((r) => r.med_y !== "intencao_voto_primeiro_turno" && r.med_p === "intencao_voto_primeiro_turno")
  const fpAlvo = res.filter((r) => r.alv_y === 0 && scoreDisponivel(r.alv_p) && r.alv_p > DESCARTA)
  const fnAlvo = res.filter((r) => r.alv_y === 1 && scoreDisponivel(r.alv_p) && r.alv_p <= DESCARTA)

  const resumo = {
    split, n: res.length,
    atribuicao: { decididos: decid.length, cinza: res.length - decid.length, acuracia_na_faixa: decid.length ? Number((atrOk / decid.length).toFixed(3)) : null },
    medida: { acuracia_total: comMed.length ? Number((medOkTodos / comMed.length).toFixed(3)) : null, decididos_conf_min: medDecid.length, acuracia_decididos: medDecid.length ? Number((medOk / medDecid.length).toFixed(3)) : null, contaminacao_como_intencao: contaminacao.length },
    disputa_alvo: { falsos_positivos: fpAlvo.length, falsos_negativos: fnAlvo.length },
    atualidade: (() => {
      const com = res.filter((r) => r.atu_y !== null && r.atu_y !== undefined && scoreDisponivel(r.atu_p))
      if (!com.length) return { casos: 0, nota: "sem caso rotulado neste conjunto" }
      const dec = com.filter((r) => scoreDecidido(r.atu_p))
      const ok = dec.filter((r) => (r.atu_p >= ACEITA ? 1 : 0) === r.atu_y).length
      const neg = com.filter((r) => r.atu_y === 0)
      const negPegos = neg.filter((r) => r.atu_p <= DESCARTA).length
      return { casos: com.length, negativos: neg.length, decididos: dec.length, acuracia_na_faixa: dec.length ? Number((ok / dec.length).toFixed(3)) : null, negativos_detectados: negPegos }
    })(),
  }
  return { resumo, contaminacao, atrErros: decid.filter((x) => (x.atr_p >= ACEITA ? 1 : 0) !== x.atr_y), fpAlvo }
}

function executar() {
  const split = process.argv[2] ?? "holdout"
  const dados = JSON.parse(readFileSync(GOLDEN, "utf8")).filter((d) => d.split === split)
  const dir = mkdtempSync(join(tmpdir(), "jev394-"))
  const res = []

  for (const [i, d] of dados.entries()) {
    const sp = join(dir, `s${i}.json`)
    writeFileSync(sp, JSON.stringify(estadoGolden(d)))
    const a = JSON.parse(execFileSync("python3", [JEV, "ask", "--state", sp, "--questions", PERGUNTAS], { encoding: "utf8" })).answers ?? {}
    res.push({
      id: d.id,
      atr_p: a.atribuicao?.noul ?? null, atr_y: d.rotulo.atribuicao,
      alv_p: a.disputa_alvo?.noul ?? null, alv_y: d.rotulo.disputa_alvo,
      med_p: a.medida?.choice ?? null, med_conf: a.medida?.confidence ?? null, med_y: d.rotulo.medida,
      atu_p: a.atualidade?.noul ?? null, atu_y: d.rotulo.atualidade ?? null,
      rev: a.revisao_humana?.noul ?? null,
    })
  }

  const { resumo, contaminacao, atrErros, fpAlvo } = avaliarResultados(res, split)
  writeFileSync(join(RAIZ, `QA/evidencias/2026-09-19-jev-extracao-pesquisas/resultado-${split}.json`), JSON.stringify({ resumo, casos: res }, null, 1))
  console.log(JSON.stringify(resumo))
  for (const r of contaminacao) console.log(`  CONTAMINACAO ${r.id}: rotulo=${r.med_y} previsto=intencao conf=${r.med_conf}`)
  for (const r of atrErros) console.log(`  ERRO atr ${r.id}: p=${r.atr_p} rotulo=${r.atr_y}`)
  for (const r of fpAlvo) console.log(`  FP alvo ${r.id}: p=${r.alv_p}`)
}

const EXECUTADO_DIRETO = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (EXECUTADO_DIRETO) executar()
