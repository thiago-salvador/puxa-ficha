import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatePhotoCredit } from "@/components/CandidatePhotoCredit"

describe("CandidatePhotoCredit", () => {
  it("renderiza autor, Commons e licença comprovados", () => {
    const html = renderToStaticMarkup(
      <CandidatePhotoCredit
        credit={{
          origem: "wikimedia_commons",
          autor: "Autora Exemplo",
          licenca: "CC BY-SA 4.0",
          licenca_url: "https://creativecommons.org/licenses/by-sa/4.0/",
          fonte_url: "https://commons.wikimedia.org/wiki/File:Exemplo.jpg",
        }}
      />,
    )

    assert.match(html, /Foto: Autora Exemplo/)
    assert.match(html, /Wikimedia Commons/)
    assert.match(html, /CC BY-SA 4\.0/)
    assert.match(html, /creativecommons\.org\/licenses\/by-sa\/4\.0/)
  })

  it("renderiza o rótulo público para foto direta do TSE", () => {
    const html = renderToStaticMarkup(<CandidatePhotoCredit credit={{ origem: "tse" }} />)
    assert.match(html, /Foto: Divulgação\/TSE\./)
  })

  it("não renderiza placeholder quando o crédito é nulo", () => {
    assert.equal(renderToStaticMarkup(<CandidatePhotoCredit credit={null} />), "")
  })
})
