import assert from "node:assert"
import { test, describe } from "node:test"
import { QUIZ_PERGUNTAS } from "@/data/quiz/perguntas"

// Domínios oficiais aceitos como fonte do bloco "O que é" / "Como é hoje".
const FONTES_OFICIAIS = [
  "www.planalto.gov.br",
  "www.gov.br",
  "noticias.stf.jus.br",
  "www.camara.leg.br",
  "fjp.mg.gov.br",
  "www.investidorpetrobras.com.br",
]

describe("quiz: explicação factual por pergunta", () => {
  test("toda pergunta tem explicação com texto e fonte oficial em https", () => {
    for (const pergunta of QUIZ_PERGUNTAS) {
      const bloco = pergunta.o_que_e
      assert.ok(bloco, `${pergunta.id} sem o_que_e`)
      assert.ok(bloco.texto.length >= 120, `${pergunta.id}: texto curto demais`)
      assert.ok(bloco.fonte.titulo.trim(), `${pergunta.id}: fonte sem título`)
      const url = new URL(bloco.fonte.url)
      assert.strictEqual(url.protocol, "https:", `${pergunta.id}: fonte sem https`)
      assert.ok(FONTES_OFICIAIS.includes(url.hostname), `${pergunta.id}: domínio fora da lista (${url.hostname})`)
    }
  })

  test("perguntas que citam lei usam 'O que é'; as de opinião, 'Como é hoje'", () => {
    for (const pergunta of QUIZ_PERGUNTAS) {
      const citaLei = /\b(Lei|EC|Lei Complementar|RP9|reforma federal)\b/.test(pergunta.texto)
      const esperado = citaLei ? "O que é" : "Como é hoje"
      assert.strictEqual(pergunta.o_que_e?.rotulo, esperado, pergunta.id)
    }
  })

  test("o texto não usa travessão", () => {
    for (const pergunta of QUIZ_PERGUNTAS) {
      assert.ok(!/[–—]/.test(pergunta.o_que_e?.texto ?? ""), pergunta.id)
    }
  })

  test("q05 não data a criação do RP9 em 2021", () => {
    const q05 = QUIZ_PERGUNTAS.find((p) => p.id === "q05")
    assert.ok(q05)
    assert.ok(!/adotado em 2021/.test(q05.texto))
  })
})
