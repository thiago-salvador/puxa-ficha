import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { planCoverageReceipts } from "../scripts/audit/apply-coverage-receipts"
import { adaptLatestReceipts, buildCoverageMatrix, type CoverageProfile } from "../scripts/audit/audit-cobertura-fichas"
import { publicFamilyPayloadSha256 } from "../scripts/audit/lib/coverage-source-proof"
import { assertOutsideRepository } from "../scripts/audit/lib/private-output"

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

describe("saída privada dos coletores", () => {
  it("recusa pasta dentro do repositório e aceita pasta fora dele", () => {
    const root = "/repo/puxa-ficha"
    assert.throws(() => assertOutsideRepository("/repo/puxa-ficha/reports/x", "destino", root), /fora do repositório/)
    assert.throws(() => assertOutsideRepository("/repo/puxa-ficha", "destino", root), /fora do repositório/)
    assert.equal(assertOutsideRepository("/privado/coleta", "destino", root), "/privado/coleta")
    assert.equal(assertOutsideRepository("/repo/puxa-ficha-evidencias", "destino", root), "/repo/puxa-ficha-evidencias")
  })
})

describe("prova de cobertura por ano sobrevive a recibo mais novo sem prova", () => {
  const cell = (subject: CoverageProfile, rows: Record<string, unknown>[]) =>
    buildCoverageMatrix([subject], [], adaptLatestReceipts(rows, [subject]).joins).cells.find((item) => item.familia === "patrimonio")!

  it("recibo 2026 da mesma fonte, sem prova, não apaga a prova que ainda confere", () => {
    const subject = profile()
    const proof = receipt(subject)
    const f2 = { fonte: "tse-patrimonio", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", resultado: "encontrado", volume: 3, executado_em: "2026-09-25T15:00:00Z", detalhe: JSON.stringify({ family: "patrimonio", ano: 2026 }) }
    const result = cell(subject, [proof, f2])
    assert.equal(result.estado, "publicado")
    assert.match(result.motivo, /anos 2022/)
  })

  it("controles negativos: erro posterior reabre, payload alterado invalida, sem prova não fecha", () => {
    const subject = profile()
    const later = { fonte: "tse-patrimonio", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", volume: 0, executado_em: "2026-09-25T15:00:00Z" }
    assert.equal(cell(subject, [receipt(subject), { ...later, resultado: "erro", detalhe: "falha" }]).estado, "erro")
    assert.equal(cell(profile({ patrimonio: [{ ano_eleicao: 2022, valor_total: 99 }] }), [receipt(subject)]).estado, "frescor_indefinido")
    assert.equal(cell(subject, [{ ...later, resultado: "encontrado", volume: 1, detalhe: "{}" }]).estado, "frescor_indefinido")
  })

  it("o plano grava anos_cobertos e recusa prova anual sem ano", () => {
    const subject = profile()
    const plan = planCoverageReceipts([receipt(subject)], [subject], ALLOW)
    assert.deepEqual(JSON.parse(plan.planned[0]!.detalhe!).anos_cobertos, [2022])
    const noYear = JSON.parse(receipt(subject).detalhe)
    noYear.coverage_proof.source_revisions = [{ url: URL_BENS, sha256: "d".repeat(64) }]
    const rejected = planCoverageReceipts([receipt(subject, { detalhe: JSON.stringify(noYear) })], [subject], ALLOW)
    assert.match(rejected.rejected[0]?.motivo ?? "", /anos/)
  })
})

describe("prova de cobertura concorda com o payload: vazio só sem linha, publicado só com linha", () => {
  const cell = (subject: CoverageProfile, rows: Record<string, unknown>[]) =>
    buildCoverageMatrix([subject], [], adaptLatestReceipts(rows, [subject]).joins).cells.find((item) => item.familia === "patrimonio")!

  it("prova de vazio com linha publicada vira erro na régua e é recusada no aplicador", () => {
    const subject = profile()
    const vazio = receipt(subject, { resultado: "vazio_confirmado", volume: 0 })
    assert.equal(cell(subject, [vazio]).estado, "erro")
    assert.match(planCoverageReceipts([vazio], [subject], ALLOW).rejected[0]?.motivo ?? "", /vazio contra 1 linha/)
  })

  it("prova de publicado sem linha no payload vira erro e é recusada; vazio sem linha fecha", () => {
    const empty = profile({ patrimonio_eleicoes: [], patrimonio: [] })
    // Prova coerente com o payload vazio (0 linhas públicas casadas).
    const detail = JSON.parse(receipt(empty).detalhe)
    Object.assign(detail.coverage_proof, { public_rows: 0, matched_rows: 0, source_rows: 0 })
    const zeroRows = { detalhe: JSON.stringify(detail) }
    const encontrado = receipt(empty, zeroRows)
    assert.equal(cell(empty, [encontrado]).estado, "erro")
    assert.match(planCoverageReceipts([encontrado], [empty], ALLOW).rejected[0]?.motivo ?? "", /encontrado sem linha/)
    const vazio = receipt(empty, { ...zeroRows, resultado: "vazio_confirmado", volume: 0 })
    assert.equal(cell(empty, [vazio]).estado, "vazio_confirmado")
  })

  it("detalhe que não é JSON de objeto é recusado pelo aplicador", () => {
    const subject = profile()
    for (const detalhe of ["patrimonio", "[1,2]", "null"]) {
      const plan = planCoverageReceipts([receipt(subject, { detalhe })], [subject], ALLOW)
      assert.equal(plan.planned.length, 0, detalhe)
    }
  })
})

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
