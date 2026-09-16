import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SenadoRunningMates } from "../src/components/SenadoRunningMates"

const candidate = { slug: "titular-sp", nome_urna: "Titular SP" }

const mates = [
  {
    ordem: 2 as const,
    nome_urna: "Suplente Dois",
    situacao: "APTO",
    fonte_url: "https://www.tse.jus.br/",
    sq_candidato: "mate-2",
  },
  {
    ordem: 1 as const,
    nome_urna: "Suplente Um",
    situacao: null,
    fonte_url: "https://www.tse.jus.br/",
    sq_candidato: "mate-1",
  },
]

test("renderiza as duas posições de suplência em ordem", () => {
  const html = renderToStaticMarkup(
    <SenadoRunningMates candidates={[candidate]} data={{ [candidate.slug]: mates }} singleCandidate />,
  )

  assert.match(html, /Suplente Um/)
  assert.match(html, /Suplente Dois/)
  assert.ok(html.indexOf("Suplente Um") < html.indexOf("Suplente Dois"))
  assert.match(html, /Suplente 1/)
  assert.match(html, /Suplente 2/)
})

test("expõe indisponibilidade sem inventar nomes", () => {
  const html = renderToStaticMarkup(
    <SenadoRunningMates candidates={[candidate]} data={{}} unavailable />,
  )

  assert.match(html, /Não foi possível consultar os suplentes nesta tentativa/)
  assert.doesNotMatch(html, /Suplente Um|Suplente Dois/)
})

test("expõe ausência oficial de posição elegível com fonte e data", () => {
  const html = renderToStaticMarkup(
    <SenadoRunningMates
      candidates={[candidate]}
      data={{}}
      absence={{ [candidate.slug]: { fonte_url: "https://www.tse.jus.br/", fonte_data: "15/09/2026" } }}
      singleCandidate
    />,
  )

  assert.match(html, /Os registros de suplência encontrados no arquivo consultado estão indeferidos/)
  assert.match(html, /arquivo do TSE de 15\/09\/2026/)
  assert.match(html, /Fonte:/)
  assert.doesNotMatch(html, /Não foi possível consultar os suplentes nesta tentativa/)
})
