import assert from "node:assert/strict"
import test from "node:test"

import { namesLookCompatible } from "../scripts/lib/name-match"

test("namesLookCompatible centraliza a heurística conservadora dos ingests", () => {
  assert.equal(namesLookCompatible(["André Figueiredo"], ["ANDRE FIGUEIREDO PATRICIO"]), true)
  assert.equal(namesLookCompatible(["Maria Silva Souza"], ["Maria de Silva Souza"]), true)
  assert.equal(namesLookCompatible(["Ana Paula"], ["Carlos Alberto"]), false)
  assert.equal(namesLookCompatible([], ["Nome remoto"]), true)
})
