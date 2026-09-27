import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { montarDiff, validarPlano } from "../scripts/audit/processos-url-fonte"

const ID = "9b4b48fa-3b1b-48fb-a195-b6e4139c7a9d"
const STF = "https://portal.stf.jus.br/processos/listarProcessos.asp?classe=HC&numeroProcesso=201965"
const NOTICIA = "https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=477496&ori=1"

describe("processos-url-fonte", () => {
  it("valida o plano", () => {
    assert.throws(() => validarPlano([]), /vazio/)
    assert.throws(() => validarPlano([{ id: "x", url_fonte_antes: null, url_fonte_depois: STF, motivo: "m" }]), /id inválido/)
    assert.throws(() => validarPlano([{ id: ID, url_fonte_antes: null, url_fonte_depois: "http://x.br/a", motivo: "m" }]), /https/)
    assert.throws(() => validarPlano([{ id: ID, url_fonte_antes: null, url_fonte_depois: STF, motivo: " " }]), /motivo/)
    const item = { id: ID, url_fonte_antes: NOTICIA, url_fonte_depois: STF, motivo: "m" }
    assert.throws(() => validarPlano([item, item]), /duplicado/)
  })

  it("mostra o nível antes e depois e bloqueia valor atual divergente", () => {
    const plano = validarPlano([{ id: ID, url_fonte_antes: NOTICIA, url_fonte_depois: STF, motivo: "m" }])
    const [ok] = montarDiff(plano, [{ id: ID, numero_processo: "HC 201965", url_fonte: NOTICIA }])
    assert.equal(ok.aplicavel, true)
    assert.equal(ok.antes.nivel, "em_confirmacao")
    assert.equal(ok.depois.nivel, "oficial")
    const [divergente] = montarDiff(plano, [{ id: ID, numero_processo: "HC 201965", url_fonte: "https://outra.com.br/x" }])
    assert.equal(divergente.aplicavel, false)
    const [ausente] = montarDiff(plano, [])
    assert.equal(ausente.motivo_bloqueio, "linha não encontrada")
  })
})
