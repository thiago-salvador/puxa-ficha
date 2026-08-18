import test, { describe } from "node:test"
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
import { avaliarCardNoHtml } from "../scripts/readback-fichas-camara"

/**
 * Regressão comportamental do veredito do card (rodada 5 da vistoria dos PRs
 * #141/#142). As rodadas anteriores caíram sempre no mesmo modo de falha: o
 * gate media um proxy (includes no HTML inteiro, janela de 600 caracteres) em
 * vez do pertencimento estrutural. Estes testes rodam os mocks que a vistoria
 * usou para furar cada versão anterior.
 */

function cardHtml(atributo: string, rotuloVisivel: string, rodape: string): string {
  return `
    <main>
      <div ${atributo} class="card">
        <span data-pf-overview-legislacao="25">25</span>
        <span class="label">${rotuloVisivel}</span>
      </div>
      <footer>${rodape}</footer>
    </main>`
}

describe("avaliarCardNoHtml (rodada 5)", () => {
  test("card correto aprova", () => {
    const html = cardHtml(
      'data-pf-overview-legislacao-card="2089::Proposições de autoria"',
      "Proposições de autoria",
      ""
    )
    const v = avaliarCardNoHtml(html, 2089, "Proposições de autoria")
    assert.equal(v.ok, true, v.detalhe)
  })

  /**
   * O mock exato da rodada 5: número certo, rótulo ERRADO dentro do card, e o
   * rótulo certo aparecendo só no rodapé. A janela de 600 caracteres aprovava
   * isto (o rótulo errado não casava a alternância e o regex avançava até o
   * rodapé); a âncora serializada reprova.
   */
  test("rótulo errado no card não é salvo pelo rodapé", () => {
    const html = cardHtml(
      'data-pf-overview-legislacao-card="25::Rótulo errado"',
      "Rótulo errado",
      "Proposições de autoria"
    )
    const v = avaliarCardNoHtml(html, 25, "Proposições de autoria")
    assert.equal(v.ok, false)
    assert.match(v.detalhe, /Rótulo errado/)
  })

  test("número errado no card reprova mesmo com rótulo certo", () => {
    const html = cardHtml(
      'data-pf-overview-legislacao-card="25::Proposições de autoria"',
      "Proposições de autoria",
      ""
    )
    const v = avaliarCardNoHtml(html, 2089, "Proposições de autoria")
    assert.equal(v.ok, false)
    assert.match(v.detalhe, /card exibe 25, API diz 2089/)
  })

  test("card ausente reprova, nunca aprova por omissão", () => {
    const v = avaliarCardNoHtml("<main>Proposições de autoria</main>", 10, "Proposições de autoria")
    assert.equal(v.ok, false)
    assert.match(v.detalhe, /sem o card ancorado/)
  })

  test("âncora malformada reprova", () => {
    const html = cardHtml('data-pf-overview-legislacao-card="2089"', "x", "")
    const v = avaliarCardNoHtml(html, 2089, "Projetos de lei")
    assert.equal(v.ok, false)
    assert.match(v.detalhe, /malformada/)
  })

  test("o componente carimba o par serializado no elemento raiz do card", () => {
    const profile = readFileSync("src/components/CandidatoProfile.tsx", "utf-8")
    assert.match(
      profile,
      /"data-pf-overview-legislacao-card": `\$\{projetosLeiTotal\}::\$\{rotuloCardLegislacao\}`/,
      "número e rótulo saem do MESMO render, serializados juntos"
    )
    assert.match(profile, /rootDataAttrs/, "o StatCard aceita atributos no elemento raiz")
  })
})
