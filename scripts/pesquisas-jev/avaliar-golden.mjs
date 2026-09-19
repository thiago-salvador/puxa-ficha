import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"

const dados = JSON.parse(readFileSync("/tmp/pf-394/golden.json", "utf8"))
const split = process.argv[2]
const alvoSplit = dados.filter((d) => d.split === split)
const dir = mkdtempSync(join(tmpdir(), "jev394av-"))
const res = []
for (const [i, d] of alvoSplit.entries()) {
  const state = {
    par: { nome: d.nome, partido: d.partido, percentual: d.percentual, frase: d.frase, paragrafo: d.paragrafo },
    contexto: {
      materia: { titulo: d.titulo, instituto: "Datafolha", veiculo: "Folha de S.Paulo" },
      alvo: { cargo: d.cargo, uf: d.uf },
      politicas: [
        "Enumeracao com verbo eliptico atribui o valor ao nome imediatamente anterior a ele.",
        "Percentual de pesquisa anterior citado para comparacao nao e o resultado atual.",
        "Uma materia pode tratar de mais de uma disputa (governo, Senado, Presidencia) no mesmo texto.",
      ],
    },
  }
  const sp = join(dir, `s${i}.json`)
  writeFileSync(sp, JSON.stringify(state))
  const j = JSON.parse(execFileSync("python3", [process.env.HOME + "/.claude/scripts/jev.py", "ask", "--state", sp, "--questions", "jev-394/perguntas.json"], { encoding: "utf8" }))
  const a = j.answers ?? {}
  res.push({ id: d.id, atr_p: a.atribuicao?.noul ?? null, atr_y: d.rotulo.atribuicao, alv_p: a.disputa_alvo?.noul ?? null, alv_y: d.rotulo.disputa_alvo, rev: a.revisao_humana?.noul ?? null })
}
writeFileSync(`/tmp/pf-394/res-${split}.json`, JSON.stringify(res, null, 1))

const decidido = res.filter((r) => r.atr_p >= 0.8 || r.atr_p <= 0.2)
const acertos = decidido.filter((r) => (r.atr_p >= 0.8 ? 1 : 0) === r.atr_y).length
const fpAlvo = res.filter((r) => r.alv_y === 0 && r.alv_p > 0.2)
const fnAlvo = res.filter((r) => r.alv_y === 1 && r.alv_p <= 0.2)
console.log(JSON.stringify({
  split, n: res.length,
  atribuicao_decididos: decidido.length, atribuicao_cinza: res.length - decidido.length,
  atribuicao_acuracia_na_faixa: decidido.length ? Number((acertos / decidido.length).toFixed(3)) : null,
  disputa_alvo_falsos_positivos: fpAlvo.length, disputa_alvo_falsos_negativos: fnAlvo.length,
}))
for (const r of res.filter((x) => (x.atr_p >= 0.8 ? 1 : x.atr_p <= 0.2 ? 0 : -1) !== x.atr_y && (x.atr_p >= 0.8 || x.atr_p <= 0.2))) console.log("  ERRO atr:", r.id, r.atr_p, "rotulo", r.atr_y)
for (const r of fpAlvo) console.log("  FP alvo:", r.id, r.alv_p)
