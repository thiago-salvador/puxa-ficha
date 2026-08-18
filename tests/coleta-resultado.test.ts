import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  finalizarColeta,
  registrarErroColeta,
} from "../scripts/lib/coleta-resultado"
import type { IngestResult } from "../scripts/lib/types"

function resultado(over: Partial<IngestResult> = {}): IngestResult {
  return {
    source: "wikipedia",
    candidato: "candidato-teste",
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    duration_ms: 1,
    ...over,
  }
}

describe("finalizarColeta", () => {
  it("declara encontrado quando a fonte trouxe dado novo", () => {
    const r = resultado({ rows_upserted: 1 })
    finalizarColeta(r, { aplicavel: true, volumeFonte: 1, detalhe: "verbete encontrado" })

    assert.equal(r.coleta_resultado, "encontrado")
    assert.equal(r.coleta_volume, 1)
  })

  it("continua encontrado quando o dado remoto ja estava presente", () => {
    const r = resultado({ rows_upserted: 0 })
    finalizarColeta(r, { aplicavel: true, volumeFonte: 1, detalhe: "entidade encontrada" })

    assert.equal(r.coleta_resultado, "encontrado")
    assert.equal(r.coleta_volume, 1)
  })

  it("so declara vazio_confirmado depois de resposta valida sem resultado", () => {
    const r = resultado()
    finalizarColeta(r, { aplicavel: true, volumeFonte: 0, detalhe: "bindings vazio" })

    assert.equal(r.coleta_resultado, "vazio_confirmado")
    assert.equal(r.coleta_volume, undefined)
  })

  it("classifica identificador ausente sem inventar consulta", () => {
    const r = resultado()
    finalizarColeta(r, {
      aplicavel: false,
      volumeFonte: 0,
      detalhe: "sem wikipedia_title: nenhuma consulta remota foi executada",
    })

    assert.equal(r.coleta_resultado, "nao_aplicavel")
    assert.match(r.coleta_detalhe ?? "", /nenhuma consulta/)
  })

  it("fallback local nao transforma fonte nao consultada em encontrado", () => {
    const r = resultado({ rows_upserted: 1, tables_updated: ["candidatos"] })
    finalizarColeta(r, {
      aplicavel: false,
      volumeFonte: 0,
      detalhe: "fallback local aplicado; Wikipedia nao consultada",
    })

    assert.equal(r.coleta_resultado, "nao_aplicavel")
    assert.equal(r.rows_upserted, 1, "a escrita local continua registrada separadamente")
  })

  for (const falha of [
    "HTTP 503",
    "Timeout (20000ms)",
    "Unexpected token no JSON",
    "falha ao atualizar candidatos",
  ]) {
    it(`classifica ${falha} como erro, nunca vazio_confirmado`, () => {
      const r = resultado()
      registrarErroColeta(r, new Error(falha))

      assert.equal(r.coleta_resultado, "erro")
      assert.notEqual(r.coleta_resultado, "vazio_confirmado")
      assert.deepEqual(r.errors, [falha])
      assert.equal(r.coleta_detalhe, falha)
    })
  }

  it("erro preexistente sempre ganha de vazio ou nao aplicavel", () => {
    for (const aplicavel of [true, false]) {
      const r = resultado({ errors: ["banco indisponivel"] })
      finalizarColeta(r, { aplicavel, volumeFonte: 0, detalhe: "sem dados" })
      assert.equal(r.coleta_resultado, "erro")
    }
  })
})
