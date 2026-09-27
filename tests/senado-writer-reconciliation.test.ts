import assert from "node:assert/strict"
import test from "node:test"
import { ceapsProcessingYears, classifyCeapsAnnualRows, classifyCeapsCandidateScope, classifyCeapsLegacyRow, historicalCeapsTotalMatches, isKnownSenateCeapsSource, legacyExpenseCategorySignatureMatches, senateNameMatchesHistoricalRoster } from "../scripts/lib/ingest-ceaps-senado"
import { persistSenadoAutoriaChunks, planejarReconciliacaoAutoriaLegada } from "../scripts/lib/ingest-senado"

test("lotes Senado isolam falha e readback parcial sem marcar matérias ausentes como gravadas", async () => {
  const rows = ["1", "2", "3", "4", "5"].map((proposicao_id_api) => ({ proposicao_id_api }))
  let applyCalls = 0
  let readbackCalls = 0
  const result = await persistSenadoAutoriaChunks({
    rows,
    chunkSize: 2,
    apply: async () => {
      applyCalls++
      if (applyCalls === 1) throw new Error("audit/write failed")
    },
    readback: async (ids) => {
      readbackCalls++
      return readbackCalls === 2 ? ids.slice(0, 1) : ids
    },
  })
  assert.equal(applyCalls, 3)
  assert.equal(readbackCalls, 3)
  assert.deepEqual(result.confirmedIds, ["3", "5"])
  assert.deepEqual(result.unresolvedIds, ["1", "2", "4"])
  assert.equal(result.errors.length, 2)
})

test("CEAPS não confirma zero quando roster não delimita nenhum ano elegível", () => {
  assert.equal(classifyCeapsCandidateScope([]), "indeterminate")
  assert.equal(classifyCeapsCandidateScope([2024]), "verifiable")
  assert.equal(isKnownSenateCeapsSource("CEAPS/Senado"), true)
  assert.equal(isKnownSenateCeapsSource("Senado CEAPS"), true)
  assert.equal(isKnownSenateCeapsSource("Senado"), true)
  assert.equal(isKnownSenateCeapsSource(null), false)
  assert.equal(isKnownSenateCeapsSource("Camara"), false)
  assert.equal(historicalCeapsTotalMatches("CEAPS/Senado", 100, 101), false)
  assert.equal(historicalCeapsTotalMatches("Senado CEAPS", 100, 101), false)
  assert.equal(historicalCeapsTotalMatches("CEAPS/Senado", 100, 100), true)
  assert.equal(historicalCeapsTotalMatches("Senado", 100, 101), true)
})

test("CEAPS insere linha anual do Senado mesmo com cota Câmara publicada no mesmo ano", () => {
  const plan = classifyCeapsAnnualRows([
    { id: "camara-2025", fonte: "Camara" },
  ])
  assert.equal(plan.ambiguous, false)
  assert.equal(plan.target, undefined)
  assert.deepEqual(plan.unrelatedRows.map(({ id }) => id), ["camara-2025"])
  // O writer registra esta condição como revisão, mas segue pela inserção
  // auditada quando há despesa CEAPS confirmada e não existe target Senado.
  assert.equal(plan.insertAlongsideUnrelated, true)
  assert.equal(classifyCeapsAnnualRows([{ id: "senado", fonte: "Senado" }, { id: "camara", fonte: "Camara" }]).insertAlongsideUnrelated, false)
})

test("CEAPS mantém linha legada em revisão quando o CSV anual ou roster não comprova o escopo", () => {
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 0, annualCsvComplete: false, rosterMembershipVerified: true, noCompetingHouseIdentity: true }), "review")
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 0, annualCsvComplete: true, rosterMembershipVerified: false, noCompetingHouseIdentity: true }), "review")
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 0, annualCsvComplete: true, rosterMembershipVerified: true, noCompetingHouseIdentity: false }), "review")
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 4, annualCsvComplete: true, rosterMembershipVerified: true, noCompetingHouseIdentity: false }), "confirmed")
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 0, annualCsvComplete: true, rosterMembershipVerified: true, noCompetingHouseIdentity: true }), "review")
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 4, annualCsvComplete: true, rosterMembershipVerified: true, noCompetingHouseIdentity: true }), "confirmed")
})

test("CEAPS reavalia anos de proveniência Senado fora do roster e permite baixa só com CSV completo e nome vinculado", () => {
  assert.deepEqual(ceapsProcessingYears([2020], [
    { ano: 2019, fonte: "Senado" },
    { ano: 2023, fonte: "Senado CEAPS" },
    { ano: 2018, fonte: "Camara" },
    { ano: 2022, fonte: "Senado", despublicado_em: "2026-09-01" },
  ]), [2019, 2020, 2023])
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 0, annualCsvComplete: true, rosterMembershipVerified: false, noCompetingHouseIdentity: false, senateProvenanceVerified: true }), "absent")
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 0, annualCsvComplete: false, rosterMembershipVerified: false, noCompetingHouseIdentity: false, senateProvenanceVerified: true }), "review")
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 0, annualCsvComplete: true, rosterMembershipVerified: false, noCompetingHouseIdentity: false, senateProvenanceVerified: false }), "review")
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 5, annualCsvComplete: true, rosterMembershipVerified: false, noCompetingHouseIdentity: false, senateProvenanceVerified: true }), "confirmed")
  assert.equal(senateNameMatchesHistoricalRoster("Ricardo Ferraço", "635", [new Map([["635", "Ricardo Ferraço"]])]), true)
  assert.equal(senateNameMatchesHistoricalRoster("Ricardo Ferraco", "635", [new Map([["635", "Outro Nome"]])]), false)
  assert.equal(legacyExpenseCategorySignatureMatches([{ categoria: "PASSAGENS", valor: 10 }, { categoria: "ALUGUEL", valor: 20 }], [{ categoria: "ALUGUEL", valor: 20 }, { categoria: "PASSAGENS", valor: 10 }]), true)
  assert.equal(legacyExpenseCategorySignatureMatches([{ categoria: "PASSAGENS", valor: 30 }], [{ categoria: "ALUGUEL", valor: 30 }]), false)
  assert.equal(legacyExpenseCategorySignatureMatches(null, [{ categoria: "ALUGUEL", valor: 30 }]), false)
})

test("proposições do Senado reconciliam legado só com ID oficial e lista completa", () => {
  const legacyRows = [
    { id: "confirmed-id", proposicao_id_api: "10", fonte: null },
    { id: "confirmed-tuple", proposicao_id_api: null, fonte: null, tipo: "pl", numero: "1", ano: 2020, ementa: "Ementa exata" },
    { id: "absent", proposicao_id_api: "11", fonte: null, tipo: "PL", numero: "9", ano: 2019 },
    { id: "unknown", proposicao_id_api: null, fonte: null },
    { id: "ambiguous", proposicao_id_api: null, fonte: null, tipo: "PL", numero: "2", ano: null, ementa: "Ambígua" },
  ]
  const officialRows = [
    { id: "10", tipo: "PL", numero: "8", ano: 2020, ementa: "Outra" },
    { id: "12", tipo: "PL", numero: "1", ano: 2020, ementa: "Ementa exata" },
    { id: "13", tipo: "PL", numero: "2", ano: 2020, ementa: "Ambígua" },
    { id: "14", tipo: "PL", numero: "2", ano: 2021, ementa: "Ambígua" },
  ]
  const complete = planejarReconciliacaoAutoriaLegada({ legacyRows, officialRows, sourceComplete: true, noCompetingHouseIdentity: true })
  assert.deepEqual(complete.confirmed.map(({ legacy }) => legacy.id), ["confirmed-id", "confirmed-tuple"])
  assert.deepEqual(complete.absent, [])
  assert.deepEqual(complete.review.map((row) => row.id), ["absent", "unknown", "ambiguous"])

  const partial = planejarReconciliacaoAutoriaLegada({ legacyRows, officialRows, sourceComplete: false, noCompetingHouseIdentity: true })
  assert.equal(partial.absent.length, 0)
  assert.deepEqual(partial.review.map((row) => row.id), legacyRows.map((row) => row.id))
  const competingHouse = planejarReconciliacaoAutoriaLegada({ legacyRows, officialRows, sourceComplete: true, noCompetingHouseIdentity: false })
  assert.deepEqual(competingHouse.confirmed.map(({ legacy }) => legacy.id), ["confirmed-id"])
  assert.equal(competingHouse.absent.length, 0)
  assert.deepEqual(competingHouse.review.map((row) => row.id), ["confirmed-tuple", "absent", "unknown", "ambiguous"])
})

test("match tipo/número/ano não identifica legado quando pode haver identidade concorrente da Câmara", () => {
  const legacyRows = [
    { id: "same-tuple", proposicao_id_api: null, fonte: null, tipo: "PL", numero: "1234", ano: 2019, ementa: "Ementa antiga" },
    { id: "same-official-id", proposicao_id_api: "42", fonte: null, tipo: "PL", numero: "1234", ano: 2019 },
  ]
  const officialRows = [
    { id: "42", tipo: "PL", numero: "1234", ano: 2019, ementa: "Ementa oficial" },
  ]

  const competingHouse = planejarReconciliacaoAutoriaLegada({
    legacyRows,
    officialRows,
    sourceComplete: true,
    noCompetingHouseIdentity: false,
  })
  assert.deepEqual(competingHouse.confirmed.map(({ legacy }) => legacy.id), ["same-official-id"])
  assert.deepEqual(competingHouse.review.map(({ id }) => id), ["same-tuple"])

  const noKnownCompetingHouse = planejarReconciliacaoAutoriaLegada({
    legacyRows: [legacyRows[0]!],
    officialRows,
    sourceComplete: true,
    noCompetingHouseIdentity: true,
  })
  assert.deepEqual(noKnownCompetingHouse.confirmed.map(({ legacy }) => legacy.id), ["same-tuple"])
})

test("ID Câmara null ou desconhecido não libera reconciliação por tupla sem prova independente", () => {
  const legacy = { id: "unknown-house", proposicao_id_api: null, fonte: null, tipo: "PL", numero: "1234", ano: 2019 }
  const officialRows = [{ id: "42", tipo: "PL", numero: "1234", ano: 2019, ementa: "Ementa oficial" }]

  // The seed uses null both for no known ID and for a potentially unknown ID.
  // With no positive proof supplied, the planner must default to review.
  const result = planejarReconciliacaoAutoriaLegada({
    legacyRows: [legacy],
    officialRows,
    sourceComplete: true,
  })
  assert.deepEqual(result.confirmed, [])
  assert.deepEqual(result.review.map(({ id }) => id), ["unknown-house"])
})
