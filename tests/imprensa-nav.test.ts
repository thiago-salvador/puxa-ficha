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
  parseImprensaTurno,
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

  it("leva turno=2 só na Mesa e ignora o turno nas outras páginas", () => {
    assert.equal(imprensaHref("/imprensa/mesa", { turno: 2 }), "/imprensa/mesa?turno=2")
    assert.equal(imprensaHref("/imprensa/mesa", { uf: "ba", cargo: "Governador", turno: 2 }), "/imprensa/mesa?cargo=Governador&uf=BA&turno=2")
    assert.equal(imprensaHref("/imprensa/mesa", { uf: "BA", turno: null }), "/imprensa/mesa?uf=BA")
    assert.equal(imprensaHref("/imprensa/atualizacoes", { uf: "BA", turno: 2 }), "/imprensa/atualizacoes?uf=BA")
    assert.equal(imprensaHref("/imprensa/1o-turno", { uf: "BA", turno: 2 }), "/imprensa/1o-turno")
    assert.equal(MESA_PARAM.turno, "turno")
  })

  it("usa a UF em minúsculas na rota do pacote", () => {
    assert.equal(imprensaUfPath("BA"), "/imprensa/uf/ba")
  })
})

describe("parseImprensaTurno", () => {
  it("devolve 2 só para o valor \"2\", aceitando lista e espaços", () => {
    assert.equal(parseImprensaTurno("2"), 2)
    assert.equal(parseImprensaTurno(" 2 "), 2)
    assert.equal(parseImprensaTurno(["2", "1"]), 2)
  })

  it("devolve null para qualquer outro valor ou ausência", () => {
    for (const value of ["1", "", "02", "dois", "2x", undefined, null, [], ["1", "2"]] as const) {
      assert.equal(parseImprensaTurno(value as string | string[] | null | undefined), null, JSON.stringify(value))
    }
  })
})

describe("buildImprensaNav", () => {
  it("mantém a ordem e os rótulos da barra, com o 1º turno como arquivo no fim", () => {
    assert.deepEqual(IMPRENSA_NAV.map((item) => item.label), ["Sala", "Seu estado", "Presidência", "Mesa", "O que mudou", "Como coletamos", "Kit", "1º turno"])
    assert.equal(IMPRENSA_NAV.length, 8)
    assert.deepEqual(IMPRENSA_NAV.at(-1)?.id, "arquivo")
  })

  it("a barra abre a Mesa no 2º turno e o 1º turno aponta para o arquivo", () => {
    const nav = Object.fromEntries(buildImprensaNav().map((item) => [item.id, item]))
    assert.equal(nav.mesa.href, "/imprensa/mesa?turno=2")
    assert.equal(nav.arquivo.href, "/imprensa/1o-turno")
    assert.equal(nav.arquivo.label, "1º turno")
  })

  it("a descrição das páginas de recorte cita o 2º turno", () => {
    for (const id of ["sala", "presidencia", "mesa"]) {
      assert.match(IMPRENSA_NAV.find((item) => item.id === id)?.description ?? "", /2º turno/, id)
    }
  })

  it("turno null explícito mantém a Mesa com todos os candidatos", () => {
    const mesa = buildImprensaNav({ uf: "BA", turno: null }).find((item) => item.id === "mesa")
    assert.equal(mesa?.href, "/imprensa/mesa?uf=BA")
  })

  it("sem UF, Seu estado leva à escolha de estado na Sala", () => {
    const estado = buildImprensaNav().find((item) => item.id === "estado")
    assert.deepEqual(estado, { id: "estado", label: "Seu estado", description: IMPRENSA_NAV[1].description, href: `/imprensa#${IMPRENSA_STATE_CHOOSER_ID}` })
  })

  it("com UF, o recorte segue para o pacote, a Mesa e O que mudou", () => {
    const nav = Object.fromEntries(buildImprensaNav({ uf: "ba", cargo: "Senador" }).map((item) => [item.id, item]))
    assert.equal(nav.estado.label, "Seu estado · BA")
    assert.equal(nav.estado.href, "/imprensa/uf/ba")
    assert.equal(nav.mesa.href, "/imprensa/mesa?cargo=Senador&uf=BA&turno=2")
    assert.equal(nav.atualizacoes.href, "/imprensa/atualizacoes?cargo=Senador&uf=BA")
    assert.equal(nav.sala.href, "/imprensa")
    assert.equal(nav.presidencia.href, "/imprensa/presidencia")
    assert.equal(nav.arquivo.href, "/imprensa/1o-turno")
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
