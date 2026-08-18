import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_ALERTS_FROM_EMAIL,
  isValidConfiguredFromEmail,
  resolveConfiguredFromEmail,
} from "../src/lib/email-from"

describe("email-from", () => {
  it("uses the default alerts sender when env values are absent", () => {
    assert.equal(resolveConfiguredFromEmail(undefined, undefined), DEFAULT_ALERTS_FROM_EMAIL)
  })

  it("strips a single outer quote pair copied from env UIs", () => {
    assert.equal(
      resolveConfiguredFromEmail('"Puxa Ficha <alertas@puxaficha.com.br>"', undefined),
      "Puxa Ficha <alertas@puxaficha.com.br>",
    )
  })

  it("accepts valid sender formats and rejects malformed ones", () => {
    assert.equal(isValidConfiguredFromEmail("Puxa Ficha <alertas@puxaficha.com.br>"), true)
    assert.equal(isValidConfiguredFromEmail("alertas@puxaficha.com.br"), true)
    assert.equal(isValidConfiguredFromEmail('"Puxa Ficha <alertas@puxaficha.com.br>"'), false)
    assert.equal(isValidConfiguredFromEmail("Puxa Ficha alertas@puxaficha.com.br"), false)
  })
})
