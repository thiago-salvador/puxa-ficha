import assert from "node:assert/strict"
import test from "node:test"
import { planCoverageReceipts } from "../scripts/audit/apply-coverage-receipts"
import { adaptLatestReceipts, buildCoverageMatrix, type CoverageProfile } from "../scripts/audit/audit-cobertura-fichas"
import { publicFamilyHouseRows, publicHouseSubsetSha256, publicFamilyPayloadSha256, validCoverageSourceProof } from "../scripts/audit/lib/coverage-source-proof"

const camaraUrl = "https://dadosabertos.camara.leg.br/api/v2/deputados/123/proposicoes"
const camaraRoster = "https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=57"
const senateUrl = "https://legis.senado.leg.br/dadosabertos/senador/456/materias.json"
const senateRoster = "https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/57.json"
const sha = (char: string) => char.repeat(64)

function profile(rows: Array<{ id: number; casa: "camara" | "senado" }>, totals = { camara: 24, senado: 6 }): CoverageProfile {
  return {
    id: "candidate-1", slug: "ana-exemplo", cargo_disputado: "Deputado Federal", cargo_atual: "Deputado Federal",
    ids: { camara: 123, senado: 456 },
    projetos_lei: rows,
    projetos_lei_total: totals.camara + totals.senado,
    projetos_lei_camara_total: totals.camara,
    projetos_lei_senado_total: totals.senado,
  }
}

function receipt(subject: CoverageProfile, house: "camara" | "senado", options: { sourceRows?: number; hashOverride?: string } = {}) {
  const byHouse = publicFamilyHouseRows(subject, "projetos_lei")!
  const publicRows = byHouse[house]!
  const sourceRows = options.sourceRows ?? Number(subject[`projetos_lei_${house}_total`])
  const dataUrl = house === "camara" ? camaraUrl : senateUrl
  const rosterUrl = house === "camara" ? camaraRoster : senateRoster
  const id = house === "camara" ? "123" : "456"
  const proof = {
    family: "projetos_lei",
    method: "official-source-to-public-readback",
    source_revisions: [{ url: dataUrl, sha256: house === "camara" ? sha("a") : sha("b") }, { url: rosterUrl, sha256: house === "camara" ? sha("c") : sha("d") }],
    public_payload_sha256: publicFamilyPayloadSha256(subject, "projetos_lei"),
    source_rows: sourceRows,
    public_rows: publicRows.length,
    matched_rows: publicRows.length,
    unmatched_rows: 0,
    scope_complete: true,
    identity: { slug: subject.slug, candidate_id: subject.id, source_id: id, house, roster_url: rosterUrl, roster_sha256: house === "camara" ? sha("c") : sha("d") },
    house_partition: {
      casa: house,
      public_rows: publicRows.length,
      public_subset_sha256: options.hashOverride ?? publicHouseSubsetSha256(publicRows),
      public_total_rows: Number(subject[`projetos_lei_${house}_total`]),
      source_rows: sourceRows,
      matched_rows: publicRows.length,
      unmatched_rows: 0,
    },
  }
  return {
    fonte: house === "camara" ? "camara-proposicoes" : "senado-proposicoes",
    escopo: "candidato", alvo: subject.slug, candidato_id: subject.id,
    resultado: publicRows.length ? "encontrado" : "vazio_confirmado", volume: publicRows.length,
    url: dataUrl, executado_em: new Date(Date.now() - 1000).toISOString(),
    detalhe: JSON.stringify({ family: "projetos_lei", coverage_proof: proof }),
  }
}

const ALLOW = new Set(["camara-proposicoes", "senado-proposicoes"])

test("same-batch house receipts close a paired project partition and plan both source rows", () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: i + 1, casa: "camara" as const })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: i + 101, casa: "senado" as const })),
  ]
  const subject = profile(rows)
  const incoming = [receipt(subject, "camara"), receipt(subject, "senado")]
  assert.equal(incoming.every((row) => validCoverageSourceProof(subject, "projetos_lei", { ...row, ...JSON.parse(String(row.detalhe)) })), true)
  const planned = planCoverageReceipts(incoming, [subject], ALLOW)
  assert.equal(planned.rejected.length, 0)
  assert.deepEqual(planned.planned.map((row) => row.fonte).sort(), ["camara-proposicoes", "senado-proposicoes"])
  const matrix = buildCoverageMatrix([subject], [], adaptLatestReceipts(incoming, [subject]).joins)
  assert.equal(matrix.cells.find((cell) => cell.familia === "projetos_lei")?.estado, "publicado")
})

test("a lone house receipt cannot close the family even when its own partition is valid", () => {
  const subject = profile([{ id: 1, casa: "camara" }], { camara: 1, senado: 0 })
  const lone = receipt(subject, "camara")
  const plan = planCoverageReceipts([lone], [subject], ALLOW)
  assert.equal(plan.planned.length, 0)
  assert.match(plan.rejected[0]?.motivo ?? "", /casa senado/)
  const matrix = buildCoverageMatrix([subject], [], adaptLatestReceipts([lone], [subject]).joins)
  assert.equal(matrix.cells.find((cell) => cell.familia === "projetos_lei")?.estado, "indeterminado")
})

test("house subset hash, source count, and total project count must all reconcile", () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: i + 1, casa: "camara" as const })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: i + 101, casa: "senado" as const })),
  ]
  const subject = profile(rows)
  const goodCamara = receipt(subject, "camara")
  const badHash = receipt(subject, "senado", { hashOverride: sha("e") })
  assert.equal(validCoverageSourceProof(subject, "projetos_lei", { ...badHash, ...JSON.parse(String(badHash.detalhe)) }), false)
  assert.equal(planCoverageReceipts([goodCamara, badHash], [subject], ALLOW).planned.length, 0)
  const wrongSourceTotal = receipt(subject, "senado", { sourceRows: 7 })
  assert.equal(validCoverageSourceProof(subject, "projetos_lei", { ...wrongSourceTotal, ...JSON.parse(String(wrongSourceTotal.detalhe)) }), false)
  const mismatch = profile(rows, { camara: 24, senado: 7 })
  mismatch.projetos_lei_total = 30
  assert.equal(planCoverageReceipts([receipt(mismatch, "camara"), receipt(mismatch, "senado")], [mismatch], ALLOW).planned.length, 0)
})

test("a verified empty house and populated other house jointly close as published", () => {
  const subject = profile([{ id: 9, casa: "senado" }], { camara: 0, senado: 1 })
  const incoming = [receipt(subject, "camara"), receipt(subject, "senado")]
  const planned = planCoverageReceipts(incoming, [subject], ALLOW)
  assert.equal(planned.rejected.length, 0)
  assert.equal(planned.planned.length, 2)
  const matrix = buildCoverageMatrix([subject], [], adaptLatestReceipts(incoming, [subject]).joins)
  assert.equal(matrix.cells.find((cell) => cell.familia === "projetos_lei")?.estado, "publicado")
})

test("public rows missing a unique house attribution fail closed", () => {
  const subject = profile([{ id: 1, casa: "camara" }, { id: 2, casa: "senado" }])
  const incoming = [receipt(subject, "camara"), receipt(subject, "senado")]
  subject.projetos_lei = [{ id: 1, casa: "camara" }, { id: 2 }]
  assert.equal(publicFamilyHouseRows(subject, "projetos_lei"), null)
  assert.equal(planCoverageReceipts(incoming, [subject], ALLOW).planned.length, 0)
})
