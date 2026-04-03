import test from "node:test"
import assert from "node:assert/strict"
import { safeHref } from "../src/lib/utils"

test("safeHref accepts http and https URLs", () => {
  assert.equal(safeHref("https://puxaficha.com.br"), "https://puxaficha.com.br")
  assert.equal(safeHref("http://example.com"), "http://example.com")
})

test("safeHref rejects unsafe protocols", () => {
  assert.equal(safeHref("javascript:alert(1)"), null)
  assert.equal(safeHref("data:text/html;base64,AAAA"), null)
})
