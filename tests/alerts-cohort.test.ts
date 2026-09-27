import assert from "node:assert/strict"
import test from "node:test"
import { resolveAlertCohort, type AlertCohortCandidate } from "@/lib/alerts-cohort"

const cohort: AlertCohortCandidate[] = [
  { id: "pres-1", slug: "pres-1", cargo: "Presidente", uf: null },
  { id: "pres-rj", slug: "pres-rj", cargo: "Presidente", uf: "RJ" },
  { id: "sp-1", slug: "sp-1", cargo: "Governador", uf: "SP" },
  { id: "sp-2", slug: "sp-2", cargo: "Deputado Federal", uf: "SP" },
  { id: "rj-1", slug: "rj-1", cargo: "Governador", uf: "RJ" },
  { id: "sen-1", slug: "sen-1", cargo: "Senador", uf: "SP" },
]

test("resolve recortes atuais, deduplica IDs diretos e respeita Senado", () => {
  const result = resolveAlertCohort({
    cohort,
    directCandidateIds: ["sp-1", "sp-1", "sen-1", "gone"],
    subscriptions: [{ cargo: "Governador", uf: "SP" }],
  })
  assert.deepEqual(result.candidateIds, ["sp-1"])
  assert.equal(result.matchedSubscriptionCount, 1)
})

test("flag Senado permite o candidato sem expor cargos fora da coorte", () => {
  const result = resolveAlertCohort({ cohort, subscriptions: [{ cargo: "Senador", uf: "sp" }], senadoEnabled: true })
  assert.deepEqual(result.candidateIds, ["sen-1"])
})

test("flag Senado desligada rejeita nova assinatura do cargo", () => {
  const result = resolveAlertCohort({ cohort, subscriptions: [{ cargo: "Senador", uf: "SP" }], senadoEnabled: false })
  assert.deepEqual(result.candidateIds, [])
  assert.equal(result.invalidSubscriptions[0]?.reason, "cargo_invalido")
})

test("valida cargo e UF e preserva assinatura válida sem match atual", () => {
  const result = resolveAlertCohort({
    cohort,
    allowedCargos: ["Governador", "Deputado Federal"],
    allowedUfs: ["SP", "RJ"],
    subscriptions: [
      { cargo: "Governador", uf: "BA" },
      { cargo: "Desconhecido", uf: "SP" },
      { cargo: "Governador", uf: "rj" },
    ],
  })
  assert.equal(result.invalidSubscriptions.length, 2)
  assert.deepEqual(result.candidateIds, ["rj-1"])
  assert.equal(result.validSubscriptions.length, 1)
})

test("limita por assinante e marca truncamento", () => {
  const result = resolveAlertCohort({
    cohort,
    subscriptions: [{ cargo: "Governador", uf: "SP" }, { cargo: "Governador", uf: "RJ" }],
    maxCandidates: 1,
  })
  assert.deepEqual(result.candidateIds, ["sp-1"])
  assert.equal(result.truncated, true)
})

test("Presidente exige UF nula e recorte sem UF cobre todos os estados", () => {
  const result = resolveAlertCohort({
    cohort,
    subscriptions: [{ cargo: "Presidente", uf: null }, { cargo: "Governador", uf: null }],
  })
  assert.deepEqual(result.candidateIds, ["pres-1", "pres-rj", "sp-1", "rj-1"])
  const invalid = resolveAlertCohort({ cohort, subscriptions: [{ cargo: "Presidente", uf: "SP" }] })
  assert.equal(invalid.invalidSubscriptions[0]?.reason, "uf_invalida")
})

test("candidato que sai e volta é resolvido somente contra a coorte recebida", () => {
  const subscriptions = [{ cargo: "Presidente", uf: null }]
  assert.deepEqual(resolveAlertCohort({ cohort: [], subscriptions }).candidateIds, [])
  assert.deepEqual(resolveAlertCohort({ cohort: [{ id: "pres-2", cargo: "Presidente", uf: null }], subscriptions }).candidateIds, ["pres-2"])
})
