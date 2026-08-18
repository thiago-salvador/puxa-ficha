import assert from "node:assert/strict"
import test from "node:test"

import { selectCurrentFactualFixes } from "../scripts/lib/current-factual-fixes-selection"

const FIXTURES = [
  { slug: "joao-rodrigues", seq: 1 },
  { slug: "aldo-rebelo", seq: 1 },
  { slug: "aldo-rebelo", seq: 2 },
] as const

test("selectCurrentFactualFixes mantém todos os fixes quando não há --slug", () => {
  const selected = selectCurrentFactualFixes(FIXTURES, null)
  assert.deepEqual(selected, [...FIXTURES])
})

test("selectCurrentFactualFixes restringe a execução ao slug informado", () => {
  const selected = selectCurrentFactualFixes(FIXTURES, "aldo-rebelo")
  assert.deepEqual(selected, [
    { slug: "aldo-rebelo", seq: 1 },
    { slug: "aldo-rebelo", seq: 2 },
  ])
})

test("selectCurrentFactualFixes retorna vazio para slug inexistente", () => {
  const selected = selectCurrentFactualFixes(FIXTURES, "nao-existe")
  assert.deepEqual(selected, [])
})
