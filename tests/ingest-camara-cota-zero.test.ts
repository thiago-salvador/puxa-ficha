import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { reciboCotaZeroCamara } from "../scripts/lib/ingest-camara"

describe("ingest-camara: recibo de cota parlamentar zerada", () => {
  const anos = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]

  it("grava vazio_confirmado com anos e legislaturas quando todos os anos voltam vazios", () => {
    const recibo = reciboCotaZeroCamara(204377, "deputada-exemplo", anos, anos)
    assert.equal(recibo?.fonte, "camara-gastos")
    assert.equal(recibo?.escopo, "candidato")
    assert.equal(recibo?.resultado, "vazio_confirmado")
    assert.equal(recibo?.volume, 0)
    const detalhe = JSON.parse(recibo!.detalhe!)
    assert.equal(detalhe.kind, "cota-parlamentar-zero")
    assert.deepEqual(detalhe.anos, anos)
    assert.equal(detalhe.id_legislatura_por_ano["2022"], 56)
    assert.equal(detalhe.id_legislatura_por_ano["2023"], 57)
  })

  it("não grava nada se algum ano teve lançamento ou nada foi consultado", () => {
    assert.equal(reciboCotaZeroCamara(204377, "deputada-exemplo", anos, anos.filter((ano) => ano !== 2021)), null)
    assert.equal(reciboCotaZeroCamara(204377, "deputada-exemplo", [], []), null)
  })
})
