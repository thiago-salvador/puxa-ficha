import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { AttributedFactChecks } from "../src/components/AttributedFactChecks"
import { getApprovedAttributedFactChecks } from "../src/lib/checagens-atribuidas"

const lula = { candidate_id: "d6740de5-c7d9-4978-ab49-b51a22481aa2", candidate_slug: "lula", office: "Presidente", uf: null }

describe("aba Checagens com muitos cards", () => {
  it("lista da mais recente para a mais antiga", () => {
    const checks = getApprovedAttributedFactChecks(lula)
    assert.ok(checks.length > 20)
    for (let i = 1; i < checks.length; i += 1) assert.ok(checks[i - 1]!.publishedAt >= checks[i]!.publishedAt)
  })

  it("mostra 20 cards, o total no filtro e o botão com o que falta", () => {
    const total = getApprovedAttributedFactChecks(lula).length
    const html = renderToStaticMarkup(
      <AttributedFactChecks candidateId={lula.candidate_id} candidateSlug={lula.candidate_slug} office={lula.office} uf={lula.uf} />,
    )
    const cards = html.match(/<article/g)?.length ?? 0
    assert.equal(cards, 20)
    assert.match(html, new RegExp(`Todos <span[^>]*>${total}</span>`))
    assert.match(html, /data-pf-checagens-mais/)
    assert.match(html, new RegExp(`\\(${total - 20} restantes\\)`))
  })
})
