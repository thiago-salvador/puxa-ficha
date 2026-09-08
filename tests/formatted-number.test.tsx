import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { FormattedNumber } from "@/components/FormattedNumber"
import { GlossaryTerm } from "@/components/GlossaryTerm"
import { STATE_INDICATOR_CONFIG } from "@/lib/state-indicator-metadata"

test("compact currency retains cents in the accessible full amount", () => {
  const html = renderToStaticMarkup(<FormattedNumber value={1_234_567.89} />)
  assert.match(html, /aria-hidden="true">R\$ 1,2 mi/)
  assert.match(html, /class="sr-only">1\.234\.567,89 reais/)
})

test("percentage uses percent units, without multiplying the source", () => {
  const html = renderToStaticMarkup(<FormattedNumber value={4.7} kind="percent" />)
  assert.match(html, /4,7%/)
  assert.match(html, /4,7 por cento/)
})

test("state GDP converts source thousands to reais using shared compact format", () => {
  assert.equal(STATE_INDICATOR_CONFIG.pib_total.format(1_234_567), "R$ 1,2 bi")
})

test("acronym expansion is available as text, not only a title", () => {
  const html = renderToStaticMarkup(<GlossaryTerm term="CEAP" />)
  assert.match(html, /class="sr-only"> \(Cota para o Exercício da Atividade Parlamentar/)
})
