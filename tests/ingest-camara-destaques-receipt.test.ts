import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { reciboDestaquesVotacoesCamara } from "../scripts/lib/ingest-camara"

const rev = { url: "https://dadosabertos.camara.leg.br/api/v2/votacoes/1/votos", sha256: "a".repeat(64) }

describe("recibo de destaques de votação da Câmara", () => {
  it("declara erro e preserva prova parcial quando uma resposta falhou", () => {
    const receipt = reciboDestaquesVotacoesCamara("slug", 123, {
      persistidos: 2, planejados: 0, erros: ["endpoint indisponível"], avisos: [], completo: false,
      votacoesConferidas: 3, sourceRows: 12, sourceRevisions: [rev],
    })
    assert.equal(receipt.fonte, "destaques-votacoes")
    assert.equal(receipt.resultado, "erro")
    assert.equal(receipt.volume, 0)
    const detail = JSON.parse(receipt.detalhe!)
    assert.equal(detail.identity.source_id, "123")
    assert.deepEqual(detail.source_revisions, [rev])
  })

  it("só confirma vazio quando todo o escopo de votações foi conferido", () => {
    const receipt = reciboDestaquesVotacoesCamara("slug", 123, {
      persistidos: 0, planejados: 0, erros: [], avisos: [], completo: true,
      votacoesConferidas: 3, sourceRows: 12, sourceRevisions: [rev],
    })
    assert.equal(receipt.resultado, "vazio_confirmado")
    assert.equal(receipt.volume, 0)
  })

  it("registra votos planejados em dry-run como fonte encontrada, sem dizer que foram publicados", () => {
    const receipt = reciboDestaquesVotacoesCamara("slug", 123, {
      persistidos: 0, planejados: 2, erros: [], avisos: [], completo: true,
      votacoesConferidas: 3, sourceRows: 12, sourceRevisions: [rev],
    })
    assert.equal(receipt.resultado, "encontrado")
    assert.equal(receipt.volume, 2)
    const detail = JSON.parse(receipt.detalhe!)
    assert.equal(detail.votos_publicados, 0)
    assert.equal(detail.votos_planejados, 2)
  })
})
