import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { sanitizeQuizResultQueryString } from "../src/lib/quiz-short-link-sanitize"

describe("quiz-short-link-sanitize", () => {
  it("accepts minimal r+v", () => {
    assert.equal(sanitizeQuizResultQueryString("r=abc&v=1"), "r=abc&v=1")
  })

  it("strips unknown keys", () => {
    assert.equal(sanitizeQuizResultQueryString("r=x&v=2&foo=bar"), "r=x&v=2")
  })

  it("normalizes uf and validates cargo", () => {
    assert.equal(
      sanitizeQuizResultQueryString("r=a&v=3&cargo=Governador&uf=sp"),
      "r=a&v=3&cargo=Governador&uf=SP"
    )
    assert.equal(sanitizeQuizResultQueryString("r=a&v=3&cargo=Senador"), null)
  })

  it("rejects bad v or missing r", () => {
    assert.equal(sanitizeQuizResultQueryString("r=a&v=9"), null)
    assert.equal(sanitizeQuizResultQueryString("v=1"), null)
  })

  it("rejects oversized r", () => {
    const r = "x".repeat(6000)
    assert.equal(sanitizeQuizResultQueryString(`r=${r}&v=1`), null)
  })
})
