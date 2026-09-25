import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { planCoverageReceipts } from "../scripts/audit/apply-coverage-receipts"
import type { CoverageProfile } from "../scripts/audit/audit-cobertura-fichas"
import { publicFamilyPayloadSha256 } from "../scripts/audit/lib/coverage-source-proof"

const URL_BENS = "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip"

function profile(overrides: Partial<CoverageProfile> = {}): CoverageProfile {
  return {
    id: "candidate-1", slug: "ana-exemplo", cargo_disputado: "Governador", estado: "SP", cargo_atual: null, ids: {},
    patrimonio_eleicoes: [{ ano: 2022, estado: "publicado" }], patrimonio: [{ ano_eleicao: 2022, valor_total: 10 }],
    ...overrides,
  }
}

function receipt(subject: CoverageProfile, overrides: Record<string, unknown> = {}) {
  const proof = {
    family: "patrimonio", method: "official-source-to-public-readback",
    source_revisions: [{ year: 2022, url: URL_BENS, sha256: "d".repeat(64) }],
    public_payload_sha256: publicFamilyPayloadSha256(subject, "patrimonio"),
    source_rows: 1, public_rows: 1, matched_rows: 1, unmatched_rows: 0, scope_complete: true,
    identity: { slug: "ana-exemplo", candidate_id: "candidate-1", source_id: "250000000001" },
  }
  return {
    fonte: "tse-patrimonio", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1",
    resultado: "encontrado", volume: 1, url: URL_BENS, executado_em: "2026-09-25T14:25:00Z",
    detalhe: JSON.stringify({ contract_version: 1, family: "patrimonio", coverage_proof: proof }),
    ...overrides,
  }
}

const ALLOW = new Set(["tse-patrimonio"])

describe("apply-coverage-receipts: plano só com recibos que fecham célula", () => {
  it("aceita prova que confere com o payload público do momento", () => {
    const subject = profile()
    const plan = planCoverageReceipts([receipt(subject)], [subject], ALLOW)
    assert.equal(plan.rejected.length, 0)
    assert.deepEqual(plan.planned.map((item) => [item.alvo, item.familia, item.estado_projetado]), [["ana-exemplo", "patrimonio", "publicado"]])
  })

  it("controles negativos: payload mudou, id diferente, fonte fora da lista, indeterminado e duplicata", () => {
    const subject = profile()
    const changed = profile({ patrimonio: [{ ano_eleicao: 2022, valor_total: 11 }] })
    assert.match(planCoverageReceipts([receipt(subject)], [changed], ALLOW).rejected[0]?.motivo ?? "", /não fecha patrimonio/)
    assert.match(planCoverageReceipts([receipt(subject, { candidato_id: "outro" })], [subject], ALLOW).rejected[0]?.motivo ?? "", /candidato_id/)
    assert.match(planCoverageReceipts([receipt(subject)], [subject], new Set(["tse-financiamento"])).rejected[0]?.motivo ?? "", /fonte fora/)
    assert.match(planCoverageReceipts([receipt(subject, { resultado: "indeterminado", volume: 0 })], [subject], ALLOW).rejected[0]?.motivo ?? "", /não fecha célula/)
    const twice = planCoverageReceipts([receipt(subject), receipt(subject)], [subject], ALLOW)
    assert.equal(twice.planned.length, 1)
    assert.match(twice.rejected[0]?.motivo ?? "", /duplicado/)
    assert.match(planCoverageReceipts([receipt(subject, { alvo: "outra" })], [subject], ALLOW).rejected[0]?.motivo ?? "", /fora da coorte/)
  })
})
