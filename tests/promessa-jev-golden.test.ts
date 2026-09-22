import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { decidir, metricas, REGRAS } from "../scripts/promessa-jev/avaliar-golden.mjs"
import { estadoDoPar } from "../scripts/promessa-jev/estado.mjs"

const PASTA = "QA/evidencias/2026-09-22-jev-promessa-evidencia"
const golden = JSON.parse(readFileSync(`${PASTA}/golden-pares.json`, "utf8"))
const rotulos = JSON.parse(readFileSync(`${PASTA}/golden-rotulos.json`, "utf8")).rotulos
const perguntas = JSON.parse(readFileSync("scripts/promessa-jev/perguntas-v1.json", "utf8"))

const resposta = (probabilidades: Record<string, number>, mesmo: number) => ({
  relacao: { type: "choice", probabilities: probabilidades },
  mesmo_compromisso: { type: "noul", noul: mesmo },
})

test("golden tem 60 pares de ajuste e 30 de holdout, com ids disjuntos e todos rotulados", () => {
  const ajuste = golden.itens.filter((i: { conjunto: string }) => i.conjunto === "ajuste")
  const holdout = golden.itens.filter((i: { conjunto: string }) => i.conjunto === "holdout")
  assert.equal(ajuste.length, 60)
  assert.equal(holdout.length, 30)
  for (const [lista, grupo, total] of [[ajuste, "presidencial", 30], [ajuste, "governador_congresso", 30], [holdout, "presidencial", 15], [holdout, "governador_congresso", 15]] as const) {
    assert.equal(lista.filter((i: { grupo: string }) => i.grupo === grupo).length, total, `${grupo}`)
  }
  const idsAjuste = new Set(ajuste.map((i: { par: { parId: string } }) => i.par.parId))
  assert.ok(holdout.every((i: { par: { parId: string } }) => !idsAjuste.has(i.par.parId)))
  for (const item of golden.itens) {
    assert.ok(["sustenta", "contradiz", "relacionada", "nao_relacionada"].includes(rotulos[item.par.parId]?.rotulo), item.par.parId)
  }
  assert.ok(golden.itens.every((i: { grupo: string; par: { mandatoFederal: boolean; cargo: string } }) =>
    i.grupo === "presidencial" ? i.par.cargo === "PRESIDENTE" : i.par.mandatoFederal))
})

test("descarte exige nao_relacionada >= 0,80 e mesmo_compromisso <= 0,20", () => {
  const regra = REGRAS.v1
  assert.deepEqual(decidir(resposta({ nao_relacionada: 0.9, relacionada: 0.1 }, 0.1), regra), { preRotulo: "nao_relacionada", descartado: true })
  assert.equal(decidir(resposta({ nao_relacionada: 0.79, relacionada: 0.21 }, 0.1), regra).descartado, false)
  assert.equal(decidir(resposta({ nao_relacionada: 0.95 }, 0.21), regra).descartado, false)
  assert.deepEqual(decidir(resposta({ contradiz: 0.6, nao_relacionada: 0.4 }, 0.05), regra), { preRotulo: "contradiz", descartado: false })
  assert.equal(decidir({ relacao: { type: "choice", probabilities: { nao_relacionada: 0.99 } } }, regra).descartado, false, "sem Noul nao descarta")
})

test("metricas aplicam o criterio escrito antes da rodada", () => {
  const caso = (rotulo: string, preRotulo: string, descartado = false) => ({ rotulo, preRotulo, descartado })
  const falhaC1 = metricas([caso("sustenta", "nao_relacionada", true), caso("nao_relacionada", "nao_relacionada", true)])
  assert.equal(falhaC1.criterio.c1, false)
  const ok = metricas([
    caso("nao_relacionada", "nao_relacionada", true), caso("nao_relacionada", "nao_relacionada", true),
    caso("nao_relacionada", "relacionada"), caso("relacionada", "relacionada"), caso("sustenta", "sustenta"),
  ])
  assert.deepEqual([ok.criterio.c1, ok.criterio.c2, ok.criterio.c3], [true, true, true])
  assert.equal(ok.criterio.coberturaDescarteNaoRelacionada, 0.667)
})

test("resultado registrado do holdout v1 atinge o criterio e toda divergencia esta classificada", () => {
  for (const conjunto of ["ajuste", "holdout"]) {
    const resultado = JSON.parse(readFileSync(`${PASTA}/resultado-v1-${conjunto}.json`, "utf8"))
    assert.equal(resultado.falhasDeServico, 0)
    assert.deepEqual([resultado.criterio.c1, resultado.criterio.c2, resultado.criterio.c3], [true, true, true], conjunto)
    assert.equal(resultado.descartadosPorRotulo.sustenta + resultado.descartadosPorRotulo.contradiz, 0)
    for (const divergencia of resultado.divergencias) {
      assert.match(divergencia.classificacao ?? "", /^(ruido de rotulo|erro do Jev|state insuficiente|erro de codigo|falha de servico):/u)
    }
  }
})

test("resultado registrado reproduz as metricas a partir das respostas cruas", () => {
  const rodada = JSON.parse(readFileSync(`${PASTA}/rodadas/v1-holdout.json`, "utf8"))
  const registrado = JSON.parse(readFileSync(`${PASTA}/resultado-v1-holdout.json`, "utf8"))
  const casos = golden.itens.filter((i: { conjunto: string }) => i.conjunto === "holdout").map((i: { par: { parId: string } }) => ({
    rotulo: rotulos[i.par.parId].rotulo,
    ...decidir(rodada.respostas[i.par.parId].answers, REGRAS.v1),
  }))
  assert.deepEqual(metricas(casos).criterio, registrado.criterio)
})

test("state leva so trecho decisivo e nenhuma pergunta pede texto gerado", () => {
  const estado = estadoDoPar(golden.itens[0].par)
  assert.ok(estado.compromisso.trechos_do_programa.length <= 2)
  assert.ok(estado.compromisso.trechos_do_programa.every((t: { trecho: string }) => t.trecho.length <= 401))
  assert.ok(Object.values(estado.evidencia.conteudo).every((v) => typeof v !== "string" || v.length <= 601))
  assert.deepEqual(Object.keys(perguntas).sort(), ["assunto_do_titulo", "direcao_oposta", "mesmo_compromisso", "relacao"])
  assert.deepEqual(Object.keys(perguntas.relacao.criteria).sort(), ["contradiz", "nao_relacionada", "relacionada", "sustenta"])
  assert.ok(Object.values(perguntas).every((q) => ["choice", "noul"].includes((q as { type: string }).type)))
})
