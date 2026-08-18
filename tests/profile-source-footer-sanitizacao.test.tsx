import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { ProfileSourceFooter } from "@/components/ProfileSourceFooter"
import type { FichaCandidato } from "@/lib/types"

/**
 * O rodapé de fontes é SERVER-RENDERIZADO a partir da `FichaCandidato` crua, e
 * não do DTO público: a limpeza do DTO não passava por aqui. O HTML servido de
 * `/candidato/amelio-cayres` trazia o identificador interno do TSE quatro vezes,
 * no texto visível e no atributo `data-pf-profile-sources`.
 *
 * As fontes abaixo são as REAIS do banco, copiadas sem edição.
 */

const FONTE_REAL_AMELIO = "TSE DivulgaCandContas 2022 id 270001654140"
const FONTE_URL_REAL =
  "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/TO/2040602022/candidato/270001654140"

function render(fontes: string[]): string {
  return renderToStaticMarkup(
    <ProfileSourceFooter
      ficha={
        {
          fonte_dados: fontes,
          ultima_atualizacao: "2026-08-05T00:00:00.000Z",
        } as Pick<FichaCandidato, "fonte_dados" | "ultima_atualizacao">
      }
    />,
  )
}

describe("ProfileSourceFooter: o HTML servido não pode carregar identificador interno", () => {
  it("Amélio Cayres: o id some do texto e do atributo", () => {
    const html = render([FONTE_REAL_AMELIO])
    assert.doesNotMatch(html, /270001654140/, "o número não pode aparecer no HTML servido")
    assert.doesNotMatch(html, /SQ_CANDIDATO/i)
    assert.match(html, /identificador oficial do TSE/, "vira o rótulo público")
    // O atributo é a superfície que passou despercebida na primeira varredura.
    const atributo = /data-pf-profile-sources="([^"]*)"/.exec(html)?.[1] ?? ""
    assert.doesNotMatch(atributo, /270001654140/, "nem no data-attribute")
  })

  it("ids equivalentes de outras fichas também somem", () => {
    for (const fonte of [
      "TSE DivulgaCandContas 2018 id 280000625869",
      "consulta_cand 2022, SQ_CANDIDATO 130001701690",
      "DivulgaCandContas identificador 210001620463",
    ]) {
      const html = render([fonte])
      assert.doesNotMatch(html.replace(/https?:\/\/[^\s"]+/g, ""), /\d{10,}/, fonte)
      assert.doesNotMatch(html, /SQ_CANDIDATO/i, fonte)
    }
  })

  it("URL de fonte continua inteira no atributo público", () => {
    const html = render([FONTE_URL_REAL])
    const atributo = /data-pf-profile-sources="([^"]*)"/.exec(html)?.[1]
    assert.equal(atributo, FONTE_URL_REAL, "a URL deve permanecer exata, sem prefixo ou sufixo")
    assert.doesNotMatch(html, /\[documento mascarado\]/)
  })

  it("fonte vazia depois da limpeza não deixa vírgula solta", () => {
    const html = render(["SQ_CANDIDATO 270001654140", "Câmara Municipal de Manaus"])
    assert.match(html, /Fontes: /)
    assert.doesNotMatch(html, /,\s*,/)
  })

  it("sem fonte nenhuma, o rodapé continua dizendo TSE", () => {
    assert.match(render([]), /Fontes: TSE\./)
  })
})
