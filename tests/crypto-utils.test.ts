import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { sha256Hex } from "@/lib/crypto-utils"

describe("sha256Hex", () => {
  it("produz hex 64 caracteres", () => {
    const h = sha256Hex("test")
    assert.equal(h.length, 64)
    assert.match(h, /^[0-9a-f]+$/)
  })
})
