import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  quizPerguntasOrdenadas,
  QUIZ_V1_QUESTION_COUNT,
  type RespostaLikert,
} from "../src/data/quiz/perguntas"
import {
  decodeQuizAnswersPayload,
  encodeQuizAnswersPayload,
  encodeQuizAnswersPayloadFirstN,
  encodeQuizRespostasPayload,
} from "../src/lib/quiz-encoding"

describe("quiz-encoding", () => {
  it("roundtrips all-neutral answers (v3)", () => {
    const m = new Map<string, { valor: RespostaLikert; importante: boolean }>()
    for (const p of quizPerguntasOrdenadas()) {
      m.set(p.id, { valor: "neutro", importante: false })
    }
    const enc = encodeQuizRespostasPayload(m, 3)
    const dec = decodeQuizAnswersPayload(enc, 3)
    assert.ok(dec)
    assert.equal(dec!.respostas.size, m.size)
    for (const p of quizPerguntasOrdenadas()) {
      assert.equal(dec!.respostas.get(p.id)?.valor, "neutro")
      assert.equal(dec!.respostas.get(p.id)?.importante, false)
    }
  })

  it("roundtrips importance flags (v3)", () => {
    const m = new Map<string, { valor: RespostaLikert; importante: boolean }>()
    const ordenadas = quizPerguntasOrdenadas()
    for (let i = 0; i < ordenadas.length; i += 1) {
      m.set(ordenadas[i]!.id, { valor: "neutro", importante: i % 2 === 0 })
    }
    const dec = decodeQuizAnswersPayload(encodeQuizRespostasPayload(m, 3), 3)
    assert.ok(dec)
    for (let i = 0; i < ordenadas.length; i += 1) {
      assert.equal(dec!.respostas.get(ordenadas[i]!.id)?.importante, i % 2 === 0)
    }
  })

  it("roundtrips mixed likert (v3)", () => {
    const m = new Map<string, { valor: RespostaLikert; importante: boolean }>()
    const ordenadas = quizPerguntasOrdenadas()
    const vals: RespostaLikert[] = [
      "concordo_total",
      "discordo_total",
      "neutro",
      "concordo_parcial",
      "discordo_parcial",
    ]
    for (let i = 0; i < ordenadas.length; i += 1) {
      m.set(ordenadas[i]!.id, { valor: vals[i % vals.length]!, importante: false })
    }
    const dec = decodeQuizAnswersPayload(encodeQuizRespostasPayload(m, 3), 3)
    assert.ok(dec)
    for (const p of ordenadas) {
      assert.equal(dec!.respostas.get(p.id)?.valor, m.get(p.id)?.valor)
    }
  })

  it("roundtrips legacy v2 payload (15x Likert, sem importancia)", () => {
    const m = new Map<string, { valor: RespostaLikert; importante: boolean }>()
    for (const p of quizPerguntasOrdenadas()) {
      m.set(p.id, { valor: "discordo_parcial", importante: false })
    }
    const enc = encodeQuizRespostasPayload(m, 2)
    const dec = decodeQuizAnswersPayload(enc, 2)
    assert.ok(dec)
    for (const p of quizPerguntasOrdenadas()) {
      assert.equal(dec!.respostas.get(p.id)?.valor, "discordo_parcial")
      assert.equal(dec!.respostas.get(p.id)?.importante, false)
    }
  })

  it("encodeQuizAnswersPayload uses current QUIZ_VERSION (v3 shape)", () => {
    const m = new Map<string, RespostaLikert>()
    for (const p of quizPerguntasOrdenadas()) {
      m.set(p.id, "neutro")
    }
    const enc = encodeQuizAnswersPayload(m)
    const dec3 = decodeQuizAnswersPayload(enc, 3)
    assert.ok(dec3)
    assert.equal(dec3!.respostas.size, quizPerguntasOrdenadas().length)
  })

  it("roundtrips v1 payload (10 perguntas)", () => {
    const m = new Map<string, RespostaLikert>()
    const first = quizPerguntasOrdenadas().slice(0, QUIZ_V1_QUESTION_COUNT)
    for (const p of first) {
      m.set(p.id, "concordo_total")
    }
    const enc = encodeQuizAnswersPayloadFirstN(m, QUIZ_V1_QUESTION_COUNT)
    const dec = decodeQuizAnswersPayload(enc, 1)
    assert.ok(dec)
    assert.equal(dec!.respostas.size, QUIZ_V1_QUESTION_COUNT)
    for (const p of first) {
      assert.equal(dec!.respostas.get(p.id)?.valor, "concordo_total")
      assert.equal(dec!.respostas.get(p.id)?.importante, false)
    }
  })
})
