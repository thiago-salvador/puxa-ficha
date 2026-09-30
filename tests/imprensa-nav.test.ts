import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildImprensaNav,
  formatImprensaStamp,
  IMPRENSA_NAV,
  IMPRENSA_STATE_CHOOSER_ID,
  imprensaHref,
  imprensaUfPath,
  MESA_COM,
  MESA_ORDEM,
  MESA_PARAM,
  normalizeRecorteUf,
} from "../src/lib/imprensa-nav"

describe("imprensaHref", () => {
  it("leva cargo e UF para a Mesa com os nomes de parâmetro que ela já lê", () => {
    assert.equal(imprensaHref("/imprensa/mesa", { uf: "ba", cargo: "Governador" }), "/imprensa/mesa?cargo=Governador&uf=BA")
    assert.equal(MESA_PARAM.cargo, "cargo")
    assert.equal(MESA_PARAM.uf, "uf")
  })

  it("acrescenta ordem e filtro só na Mesa", () => {
    assert.equal(imprensaHref("/imprensa/mesa", { uf: "BA" }, { ordem: MESA_ORDEM.variacao }), "/imprensa/mesa?uf=BA&ordem=variacao")
    assert.equal(imprensaHref("/imprensa/mesa", {}, { com: MESA_COM.processo }), "/imprensa/mesa?com=processo")
    assert.equal(imprensaHref("/imprensa/atualizacoes", { uf: "BA" }, { ordem: MESA_ORDEM.gasto }), "/imprensa/atualizacoes?uf=BA")
  })

  it("descarta UF inválida e cargo vazio", () => {
    assert.equal(imprensaHref("/imprensa/mesa", { uf: "XX", cargo: "  " }), "/imprensa/mesa")
    assert.equal(normalizeRecorteUf(" sp "), "SP")
    assert.equal(normalizeRecorteUf("zz"), null)
  })

  it("não leva recorte para páginas que não filtram", () => {
    for (const path of ["/imprensa", "/imprensa/presidencia", "/imprensa/frescor", "/imprensa/kit"] as const) {
      assert.equal(imprensaHref(path, { uf: "BA", cargo: "Senador" }), path)
    }
  })

  it("usa a UF em minúsculas na rota do pacote", () => {
    assert.equal(imprensaUfPath("BA"), "/imprensa/uf/ba")
  })
})

describe("buildImprensaNav", () => {
  it("mantém a ordem e os rótulos da barra", () => {
    assert.deepEqual(IMPRENSA_NAV.map((item) => item.label), ["Sala", "Seu estado", "Presidência", "Mesa", "O que mudou", "Como coletamos", "Kit"])
  })

  it("sem UF, Seu estado leva à escolha de estado na Sala", () => {
    const estado = buildImprensaNav().find((item) => item.id === "estado")
    assert.deepEqual(estado, { id: "estado", label: "Seu estado", description: IMPRENSA_NAV[1].description, href: `/imprensa#${IMPRENSA_STATE_CHOOSER_ID}` })
  })

  it("com UF, o recorte segue para o pacote, a Mesa e O que mudou", () => {
    const nav = Object.fromEntries(buildImprensaNav({ uf: "ba", cargo: "Senador" }).map((item) => [item.id, item]))
    assert.equal(nav.estado.label, "Seu estado · BA")
    assert.equal(nav.estado.href, "/imprensa/uf/ba")
    assert.equal(nav.mesa.href, "/imprensa/mesa?cargo=Senador&uf=BA")
    assert.equal(nav.atualizacoes.href, "/imprensa/atualizacoes?cargo=Senador&uf=BA")
    assert.equal(nav.sala.href, "/imprensa")
    assert.equal(nav.presidencia.href, "/imprensa/presidencia")
  })
})

describe("formatImprensaStamp", () => {
  it("mostra dia, mês e hora no horário de Brasília", () => {
    assert.equal(formatImprensaStamp("2026-09-28T17:02:00.000Z"), "Dados de 28/09, 14:02")
    assert.equal(formatImprensaStamp("2026-09-29T02:30:00.000Z"), "Dados de 28/09, 23:30")
  })

  it("devolve null para data ausente ou inválida", () => {
    assert.equal(formatImprensaStamp(null), null)
    assert.equal(formatImprensaStamp("não é data"), null)
  })
})
