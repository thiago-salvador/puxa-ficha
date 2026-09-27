import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { planejarReconciliacaoProjetosCamara, type LinhaProjetoLegadaCamara } from "../scripts/lib/ingest-camara"

const base: LinhaProjetoLegadaCamara = {
  id: "legacy-1", candidato_id: "candidate-1", tipo: "PRL", numero: "1", ano: null,
  ementa: "Parecer do Relator, Dep. Cabo Daciolo pela aprovação.", fonte: "Câmara", proposicao_id_api: null,
}

describe("reconciliação de projetos legados da Câmara", () => {
  it("associa ano ausente/zero por ementa normalizada única junto com tipo e número", () => {
    const result = planejarReconciliacaoProjetosCamara({
      legacyRows: [base],
      officialRows: [
        { id: 2092162, siglaTipo: "PRL", numero: "1", ano: 0, ementa: "PARECER DO RELATOR, Dep. Cabo Daciolo pela aprovação." },
        { id: 2092163, siglaTipo: "PRL", numero: "1", ano: 0, ementa: "Outro parecer" },
        { id: 2092164, siglaTipo: "PRL", numero: "1", ano: 0, ementa: "Terceiro parecer" },
      ],
      sourceComplete: true,
      otherHouseExcluded: true,
    })
    assert.equal(result.matched.length, 1)
    assert.equal(result.matched[0]?.official.id, 2092162)
    assert.deepEqual(result.absent, [])
    assert.deepEqual(result.review, [])
  })

  it("mantém ambiguidade e cardinalidade incompleta em revisão", () => {
    const result = planejarReconciliacaoProjetosCamara({
      legacyRows: [base],
      officialRows: [
        { id: 1, siglaTipo: "PRL", numero: "1", ano: 0, ementa: base.ementa },
        { id: 2, siglaTipo: "PRL", numero: "1", ano: 0, ementa: base.ementa },
      ],
      sourceComplete: false,
      otherHouseExcluded: false,
    })
    assert.deepEqual(result.matched, [])
    assert.deepEqual(result.absent, [])
    assert.deepEqual(result.review.map((row) => row.id), ["legacy-1"])
  })

  it("exige fonte positiva da Câmara antes de despublicar ausência em lista completa", () => {
    const absent = planejarReconciliacaoProjetosCamara({ legacyRows: [base], officialRows: [], sourceComplete: true, otherHouseExcluded: true })
    assert.deepEqual(absent.absent.map((row) => row.id), ["legacy-1"])
    const withoutProvenance = planejarReconciliacaoProjetosCamara({ legacyRows: [{ ...base, fonte: null }], officialRows: [], sourceComplete: true, otherHouseExcluded: true })
    assert.deepEqual(withoutProvenance.absent, [])
    assert.deepEqual(withoutProvenance.review.map((row) => row.id), ["legacy-1"])
  })

  it("usa ID oficial exato quando legado já tem proposicao_id_api sem fonte", () => {
    const withId = { ...base, proposicao_id_api: "2092162", fonte: null }
    const result = planejarReconciliacaoProjetosCamara({
      legacyRows: [withId], officialRows: [{ id: 2092162, siglaTipo: "PL", numero: "2", ano: 2020 }],
      sourceComplete: false, otherHouseExcluded: false,
    })
    assert.equal(result.matched.length, 1)
    assert.deepEqual(result.absent, [])
    assert.deepEqual(result.review, [])
  })
})
