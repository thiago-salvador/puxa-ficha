import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  nivelFonteProcesso,
  PROCESSOS_FORA_POR_PAPEL_DE_AUTORIDADE,
  processosForaPorPapelDeAutoridadeDaFicha,
} from "../src/lib/djen-consulta-url"
import { contarProcessosOmitidos, filtrarProcessosJudiciaisContaveis } from "../src/lib/processos-justica-candidato"

const CNJ = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/

describe("processos fora por papel de autoridade", () => {
  it("cada linha traz CNJ válido e ficha", () => {
    assert.equal(PROCESSOS_FORA_POR_PAPEL_DE_AUTORIDADE.size, 9)
    for (const [id, linha] of PROCESSOS_FORA_POR_PAPEL_DE_AUTORIDADE) {
      assert.match(id, /^[0-9a-f-]{36}$/)
      assert.match(linha.cnj, CNJ, id)
      assert.ok(linha.slug.length > 0, id)
    }
  })

  it("sai da lista mesmo com fonte judicial oficial", () => {
    const [id, linha] = [...PROCESSOS_FORA_POR_PAPEL_DE_AUTORIDADE][0]!
    const digitos = linha.cnj.replace(/\D/g, "")
    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${digitos}`
    assert.equal(nivelFonteProcesso({ id, numero_processo: linha.cnj, url_fonte: url }), null)
    assert.equal(nivelFonteProcesso({ id: "00000000-0000-0000-0000-000000000000", numero_processo: linha.cnj, url_fonte: url }), "oficial")
  })

  it("não conta como omitida por falta de fonte", () => {
    const [id, linha] = [...PROCESSOS_FORA_POR_PAPEL_DE_AUTORIDADE][0]!
    const digitos = linha.cnj.replace(/\D/g, "")
    const brutos = [
      { id, numero_processo: linha.cnj, url_fonte: `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${digitos}` },
      { id: "11111111-1111-1111-1111-111111111111", numero_processo: "0000001-00.2020.8.26.0001", url_fonte: null },
    ]
    const contaveis = filtrarProcessosJudiciaisContaveis(brutos).length
    assert.equal(contaveis, 0)
    assert.equal(contarProcessosOmitidos(brutos, contaveis), 1)
  })

  it("desconto por ficha no comparador", () => {
    assert.equal(processosForaPorPapelDeAutoridadeDaFicha("acm-neto"), 1)
    assert.equal(processosForaPorPapelDeAutoridadeDaFicha("jeronimo"), 1)
    assert.equal(processosForaPorPapelDeAutoridadeDaFicha("hana-ghassan"), 0)
    assert.equal(processosForaPorPapelDeAutoridadeDaFicha("ficha-sem-linha"), 0)
  })
})
