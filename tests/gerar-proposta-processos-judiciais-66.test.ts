import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { prepararPropostaJudicial66 } from "../scripts/gerar-proposta-processos-judiciais-66"

const diretorio = "QA/evidencias/2026-08-10-item2-judicial/proposta-66-25"
const auditoria = JSON.parse(
  readFileSync(
    "QA/evidencias/2026-08-10-item2-judicial/curadoria-66-25/auditoria-payload-66.json",
    "utf8",
  ),
)

describe("gerar proposta judicial 66/25", () => {
  it("reproduz migration, rollback, readback, manifesto e allowlist versionados", () => {
    const pacote = prepararPropostaJudicial66(auditoria)

    assert.equal(
      pacote.migration,
      readFileSync(`${diretorio}/20260810123000_processos_curadoria_djen_66.sql`, "utf8"),
    )
    assert.equal(
      pacote.rollback,
      readFileSync(
        `${diretorio}/20260810123000_processos_curadoria_djen_66.rollback.sql`,
        "utf8",
      ),
    )
    assert.equal(
      pacote.readback,
      readFileSync(
        `${diretorio}/20260810123000_processos_curadoria_djen_66.readback.sql`,
        "utf8",
      ),
    )
    assert.deepEqual(
      pacote.manifesto,
      JSON.parse(readFileSync(`${diretorio}/manifesto-processos-curadoria-66.json`, "utf8")),
    )
    assert.deepEqual(
      pacote.allowlist,
      JSON.parse(
        readFileSync(`${diretorio}/allowlist-processos-curadoria-66.proposta.json`, "utf8"),
      ),
    )
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
