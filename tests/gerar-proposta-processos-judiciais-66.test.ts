import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { prepararPropostaJudicial66 } from "../scripts/gerar-proposta-processos-judiciais-66"

const auditoria = JSON.parse(
  readFileSync(
    "QA/evidencias/2026-08-10-item2-judicial/curadoria-66-25/auditoria-payload-66.json",
    "utf8",
  ),
)

describe("gerar proposta judicial 66/25", () => {
  it("publica 66 CNJs no portal humano, sem JSON da API como url_fonte", () => {
    const pacote = prepararPropostaJudicial66(auditoria)

    assert.equal((pacote.migration.match(/-- @write tabela=processos/g) ?? []).length, 66)
    assert.match(pacote.migration, /https:\/\/comunica\.pje\.jus\.br\/consulta\?numeroProcesso=/)
    assert.doesNotMatch(pacote.migration, /https:\/\/comunicaapi\.pje\.jus\.br/)
    assert.match(pacote.readback, /AS invalid_source_urls/)
    assert.match(pacote.readback, /comunica\[\.\]pje\[\.\]jus\[\.\]br\/consulta/)
    assert.equal(pacote.manifesto.processos, 66)
    assert.equal(pacote.manifesto.fichas, 25)
    for (const linha of pacote.manifesto.linhas as Array<{ url_fonte: string }>) {
      assert.match(linha.url_fonte, /^https:\/\/comunica\.pje\.jus\.br\/consulta\?numeroProcesso=\d{20}$/)
    }
  })

  it("recusa erro, campo oficial ausente ou autoaprovação editorial", () => {
    const comErro = structuredClone(auditoria)
    comErro.totais.consultas_com_erro = 1
    assert.throws(() => prepararPropostaJudicial66(comErro), /erro de consulta/)

    const semOrgao = structuredClone(auditoria)
    semOrgao.processos[0].orgaos = []
    assert.throws(() => prepararPropostaJudicial66(semOrgao), /evidencia oficial incompleta/)

    const autoaprovado = structuredClone(auditoria)
    autoaprovado.processos[0].publicacao_pronta = true
    assert.throws(() => prepararPropostaJudicial66(autoaprovado), /autoaprovar/)
  })
})
