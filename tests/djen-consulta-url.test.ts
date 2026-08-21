import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  urlConsultaDjenDeFonte,
  urlConsultaDjenPorCnj,
  urlFonteEPortalJudiciario,
  urlPublicaDoProcesso,
} from "../src/lib/djen-consulta-url"

const CNJ = "1039971-32.2024.8.26.0002"
const DIGITOS = "10399713220248260002"
const PORTAL = `https://comunica.pje.jus.br/consulta?numeroProcesso=${DIGITOS}`

describe("urlConsultaDjenPorCnj", () => {
  it("monta o portal humano a partir da máscara CNJ", () => {
    assert.equal(urlConsultaDjenPorCnj(CNJ), PORTAL)
  })

  it("recusa CNJ que não tem 20 dígitos", () => {
    assert.throws(() => urlConsultaDjenPorCnj("123"), /CNJ invalido/)
  })
})

describe("urlConsultaDjenDeFonte", () => {
  it("aceita a API como prova e devolve o portal", () => {
    assert.equal(
      urlConsultaDjenDeFonte(
        `https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=${DIGITOS}&pagina=1`,
        CNJ,
      ),
      PORTAL,
    )
  })

  it("aceita o próprio portal", () => {
    assert.equal(urlConsultaDjenDeFonte(PORTAL, CNJ), PORTAL)
  })

  it("recusa API que não prova o CNJ", () => {
    assert.throws(
      () =>
        urlConsultaDjenDeFonte(
          "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=70000471020218220007",
          CNJ,
        ),
      /nao prova o proprio CNJ/,
    )
  })
})

describe("urlFonteEPortalJudiciario", () => {
  it("reconhece jus.br e recusa imprensa", () => {
    assert.equal(urlFonteEPortalJudiciario(PORTAL), true)
    assert.equal(
      urlFonteEPortalJudiciario(
        "https://g1.globo.com/sp/sao-paulo/eleicoes/2026/noticia/2026/08/04/mp-de-sp-confirma-que-renan-santos-foi-absolvido-em-processo-por-acusacao-de-estupro.ghtml",
      ),
      false,
    )
  })
})

const G1 =
  "https://g1.globo.com/sp/sao-paulo/eleicoes/2026/noticia/2026/08/04/mp-de-sp-confirma-que-renan-santos-foi-absolvido-em-processo-por-acusacao-de-estupro.ghtml"

describe("urlPublicaDoProcesso", () => {
  it("converte a API JSON no portal humano", () => {
    assert.equal(
      urlPublicaDoProcesso({
        numero_processo: CNJ,
        url_fonte: `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${DIGITOS}`,
      }),
      PORTAL,
    )
  })

  it("monta o portal só com o CNJ", () => {
    assert.equal(
      urlPublicaDoProcesso({ numero_processo: CNJ, url_fonte: null }),
      PORTAL,
    )
  })

  it("recusa planilha e JSON quando não há CNJ", () => {
    assert.equal(
      urlPublicaDoProcesso({
        numero_processo: null,
        url_fonte: "https://docs.google.com/spreadsheets/d/abc/edit",
      }),
      null,
    )
    assert.equal(
      urlPublicaDoProcesso({
        numero_processo: null,
        url_fonte: "https://example.com/processos.json",
      }),
      null,
    )
  })

  it("planilha com CNJ vira portal, não a planilha", () => {
    assert.equal(
      urlPublicaDoProcesso({
        numero_processo: CNJ,
        url_fonte: "https://docs.google.com/spreadsheets/d/abc/edit",
      }),
      PORTAL,
    )
  })

  it("imprensa sem CNJ segue o artigo", () => {
    assert.equal(
      urlPublicaDoProcesso({ numero_processo: null, url_fonte: G1 }),
      G1,
    )
  })

  it("CNJ + imprensa prefere o portal do processo", () => {
    assert.equal(
      urlPublicaDoProcesso({ numero_processo: CNJ, url_fonte: G1 }),
      PORTAL,
    )
  })
})
