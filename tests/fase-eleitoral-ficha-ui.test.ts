import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const view = readFileSync("src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx", "utf8")
const selo = readFileSync("src/components/FaseEleitoralSelo.tsx", "utf8")

test("a ficha coloca o selo de resultado no hero e preserva a nota neutra", () => {
  const heroStart = view.indexOf("data-pf-hero")
  const heroEnd = view.indexOf("</section>", heroStart)
  assert.ok(heroStart >= 0 && heroEnd > heroStart)
  const hero = view.slice(heroStart, heroEnd)
  assert.match(view, /import \{ FaseEleitoralSelo \} from "@\/components\/FaseEleitoralSelo"/)
  assert.match(hero, /<FaseEleitoralSelo candidato=\{ficha\} className="mt-1\.5" \/>/)
  assert.match(hero, /notaAtualizacao/)
})

test("o selo usa apenas o rótulo público e o link oficial do TSE", () => {
  assert.match(selo, /rotuloFaseEleitoral\(candidato\)/)
  assert.match(selo, /href=\{FONTE_RESULTADO_TSE_URL\}/)
  assert.match(selo, /\{FONTE_RESULTADO_TSE_ROTULO\}/)
  assert.doesNotMatch(selo, /atualizacao_encerrada_em|\d+%/)
})
