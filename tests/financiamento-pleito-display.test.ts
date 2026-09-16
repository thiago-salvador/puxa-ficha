import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { financiamentoPleitoNotaRodape, financiamentoPleitoSubtitulo } from "../src/lib/financiamento-pleito-display"

describe("financiamento-pleito-display", () => {
  it("subtitle identifies the source and election without internal terminology", () => {
    assert.match(financiamentoPleitoSubtitulo(), /TSE/)
    assert.match(financiamentoPleitoSubtitulo(), /candidatura e eleição/)
    assert.doesNotMatch(financiamentoPleitoSubtitulo(), /coorte/)
  })

  it("footnote stays compact", () => {
    assert.ok(financiamentoPleitoNotaRodape().length < 120)
  })
})
