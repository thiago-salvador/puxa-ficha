import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { financiamentoPleitoNotaRodape, financiamentoPleitoSubtitulo } from "../src/lib/financiamento-pleito-display"

describe("financiamento-pleito-display", () => {
  it("subtitle clarifies TSE vs coorte atual", () => {
    assert.match(financiamentoPleitoSubtitulo(), /TSE/)
    assert.match(financiamentoPleitoSubtitulo(), /coorte atual/)
  })

  it("footnote stays compact", () => {
    assert.ok(financiamentoPleitoNotaRodape().length < 120)
  })
})
