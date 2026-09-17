import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  hashJson,
  normalizeOfficialVote,
  QUIZ_RECONCILIATION_EVENTS,
} from "../scripts/reconcile-quiz-votes"

const source = readFileSync(new URL("../scripts/reconcile-quiz-votes.ts", import.meta.url), "utf8")

test("reconciliação fica limitada aos cinco eventos Câmara exatos", () => {
  assert.deepEqual(QUIZ_RECONCILIATION_EVENTS.map((event) => event.questionId), ["q01", "q02", "q03", "q04", "q06"])
  assert.deepEqual(QUIZ_RECONCILIATION_EVENTS.map((event) => event.votacaoIdApi), [
    "2122076-348",
    "2088351-324",
    "2192459-786",
    "2270789-73",
    "2265124-70",
  ])
  assert.equal(QUIZ_RECONCILIATION_EVENTS.find((event) => event.questionId === "q04")?.proposicaoId, "2270789")
})

test("normaliza somente votos nominais publicáveis e preserva hash determinístico", () => {
  assert.equal(normalizeOfficialVote("Sim"), "sim")
  assert.equal(normalizeOfficialVote("Não"), "não")
  assert.equal(normalizeOfficialVote("presente"), null)
  assert.equal(hashJson({ b: 2, a: 1 }), hashJson({ a: 1, b: 2 }))
  assert.notEqual(hashJson({ rows: [{ id: 1 }, { id: 2 }] }), hashJson({ rows: [{ id: 1 }] }))
})

test("modo padrão não chama aplicação e protege divergências existentes", () => {
  assert.match(source, /const args = parseArgs\(\)/)
  assert.match(source, /process\.argv\.includes\("--apply"\)/)
  assert.match(source, /const missing = expected\.filter\(/)
  assert.match(source, /conflicts_preserved/)
  assert.match(source, /before\.proposicao_id !== event\.proposicaoId/)
  assert.match(source, /Voto existente divergente nunca e alterado/)
})
