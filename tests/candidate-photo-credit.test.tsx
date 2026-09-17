import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatePhotoCredit } from "@/components/CandidatePhotoCredit"
import { normalizeFotoCredito } from "@/lib/foto-credito"

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

  it("renderiza crédito de fonte primária com origem fora dos rótulos legados", () => {
    const html = renderToStaticMarkup(
      <CandidatePhotoCredit
        credit={{
          origem: "fonte primária de campanha",
          descricao: "Opinião Socialista/PSTU; matéria de 28/07/2026",
          fonte_url: "https://opiniaosocialista.com.br/content/images/2026/07/Dra-Eliana.webp",
        }}
        variant="footer"
      />,
    )

    assert.match(html, /data-pf-photo-credit="source"/)
    assert.match(html, /Opinião Socialista\/PSTU; matéria de 28\/07\/2026/)
    assert.match(html, /href="https:\/\/opiniaosocialista\.com\.br\/content\/images\/2026\/07\/Dra-Eliana\.webp"/)
    assert.match(html, />Fonte da foto<\/a>/)
  })

  it("não renderiza placeholder quando o crédito é nulo", () => {
    assert.equal(renderToStaticMarkup(<CandidatePhotoCredit credit={null} />), "")
  })

  // Formatos reais de `candidatos.foto_credito` (jsonb) em produção: string
  // escalar em fichas TSE (godeiro-linharess, samara-martins) derrubava a
  // renderização com "Cannot read properties of undefined (reading 'trim')".
  it("renderiza crédito gravado como string escalar (ficha nova TSE, godeiro-linharess)", () => {
    const raw = "Foto oficial de candidatura, TSE DivulgaCandContas"
    for (const variant of ["caption", "footer"] as const) {
      const html = renderToStaticMarkup(<CandidatePhotoCredit credit={raw} variant={variant} />)
      assert.match(html, /data-pf-photo-credit="source"/)
      assert.match(html, />Foto oficial de candidatura, TSE DivulgaCandContas\. </)
      assert.doesNotMatch(html, /Foto: Foto/)
    }
  })

  it("renderiza crédito string escalar de ficha antiga (samara-martins)", () => {
    const html = renderToStaticMarkup(
      <CandidatePhotoCredit credit={"Foto oficial de campanha, TSE DivulgaCandContas"} variant="footer" />,
    )
    assert.match(html, /Foto oficial de campanha, TSE DivulgaCandContas\./)
    assert.doesNotMatch(html, /Fonte da foto/)
  })

  it("não quebra com objeto sem origem, string vazia ou tipo inesperado", () => {
    assert.equal(renderToStaticMarkup(<CandidatePhotoCredit credit={"   "} />), "")
    assert.equal(renderToStaticMarkup(<CandidatePhotoCredit credit={{} as never} />), "")
    assert.equal(renderToStaticMarkup(<CandidatePhotoCredit credit={42 as never} />), "")
    const html = renderToStaticMarkup(
      <CandidatePhotoCredit credit={{ descricao: "Assessoria de imprensa" } as never} variant="footer" />,
    )
    assert.match(html, /Foto: Assessoria de imprensa\./)
  })
})

describe("normalizeFotoCredito", () => {
  it("converte string escalar em crédito estruturado", () => {
    assert.deepEqual(normalizeFotoCredito("Foto oficial de candidatura, TSE DivulgaCandContas"), {
      origem: "texto",
      descricao: "Foto oficial de candidatura, TSE DivulgaCandContas",
    })
  })

  it("preserva objeto Commons e descarta campos não textuais", () => {
    assert.deepEqual(
      normalizeFotoCredito({
        autor: "LFLN",
        origem: "wikimedia_commons",
        licenca: "CC BY-SA 4.0",
        fonte_url: "https://commons.wikimedia.org/wiki/File:Exemplo.jpg",
        licenca_url: 7,
      }),
      {
        origem: "wikimedia_commons",
        autor: "LFLN",
        licenca: "CC BY-SA 4.0",
        fonte_url: "https://commons.wikimedia.org/wiki/File:Exemplo.jpg",
      },
    )
  })

  it("retorna null para vazio, array e objeto sem origem nem descrição", () => {
    assert.equal(normalizeFotoCredito(null), null)
    assert.equal(normalizeFotoCredito(""), null)
    assert.equal(normalizeFotoCredito([]), null)
    assert.equal(normalizeFotoCredito({ autor: "X" }), null)
  })
})
