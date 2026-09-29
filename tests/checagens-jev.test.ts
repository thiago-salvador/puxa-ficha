import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CORTE_IDENTIDADE_CHECAGENS,
  decidirPublicacaoChecagem,
} from "../scripts/checagens-jev/decisao"

describe("gate Jev de identidade em sombra para checagens", () => {
  it("publica somente quando a regra de identidade confirma e Noul passa do corte medido", () => {
    assert.equal(CORTE_IDENTIDADE_CHECAGENS, 0.5)
    assert.equal(decidirPublicacaoChecagem({ nomeConfirmadoPelaRegra: true, noulIdentidade: 0.66 }), "publicar")
  })

  it("não deixa o Jev aprovar quando a regra de identidade não confirma", () => {
    assert.equal(decidirPublicacaoChecagem({ nomeConfirmadoPelaRegra: false, noulIdentidade: 0.99 }), "descartar")
  })

  it("manda toda a faixa 0,35–0,65 para a Mesa", () => {
    for (const noulIdentidade of [0.35, 0.5, 0.65]) {
      assert.equal(decidirPublicacaoChecagem({ nomeConfirmadoPelaRegra: true, noulIdentidade }), "mesa")
    }
  })

  it("manda score ausente ou inválido para a Mesa", () => {
    for (const noulIdentidade of [null, undefined, Number.NaN, -0.1, 1.1]) {
      assert.equal(decidirPublicacaoChecagem({ nomeConfirmadoPelaRegra: true, noulIdentidade }), "mesa")
    }
  })

  it("bloqueia exclusão determinística da regra 3 mesmo com Noul alto", () => {
    assert.equal(decidirPublicacaoChecagem({
      nomeConfirmadoPelaRegra: true,
      noulIdentidade: 0.99,
      regra3: "excluido",
    }), "bloqueado_regra3")
  })

  it("envia a regra 3 não resolvida para a Mesa", () => {
    assert.equal(decidirPublicacaoChecagem({
      nomeConfirmadoPelaRegra: true,
      noulIdentidade: 0.99,
      regra3: "revisao",
    }), "mesa")
  })
})
