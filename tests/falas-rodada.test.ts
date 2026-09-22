import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { auditarRodadaFalas, type ReciboBuscaFalas } from "../scripts/lib/falas-rodada"
import type { CandidatoFalas } from "../scripts/lib/falas-monitoramento"

const start = "2026-09-20T00:00:00Z"
const now = "2026-09-21T12:00:00Z"
const ana: CandidatoFalas = { id: "ana-id", slug: "ana-silva", nome_urna: "Ana Silva", nome_completo: "Ana Silva Souza", cargo_disputado: "Governador", estado: "SP" }
const bia: CandidatoFalas = { id: "bia-id", slug: "bia-souza", nome_urna: "Bia Souza", nome_completo: "Bia Souza Lima", cargo_disputado: "Presidente", estado: null }
const receipt = (candidate: CandidatoFalas, changes: Partial<ReciboBuscaFalas> = {}): ReciboBuscaFalas => ({
  candidate_id: candidate.id, candidate_slug: candidate.slug, provider: "google", query: `${candidate.nome_urna} entrevista 2026`, observed_at: "2026-09-20T10:00:00Z", status: "executed",
  individual_response: { candidate_id: candidate.id, candidate_slug: candidate.slug, result: "found", response_excerpt: "Resultado individual" }, ...changes,
})

describe("auditoria da rodada de busca de falas", () => {
  it("não reutiliza recibo antigo para candidato coberto", () => {
    const result = auditarRodadaFalas({ roster: [ana], roundStart: start, now, receipts: [receipt(ana, { observed_at: "2026-09-19T23:59:59Z" })], catalog: { quotes: [{ candidate_id: ana.id, candidate_slug: ana.slug }] } })
    assert.equal(result.covered, 1)
    assert.equal(result.covered_but_unsearched, 1)
    assert.equal(result.searched, 0)
    assert.equal(result.complete, false)
    assert.deepEqual(result.missing_names, [ana.nome_urna])
  })

  it("mantém cobertura editorial separada da busca da rodada", () => {
    const result = auditarRodadaFalas({ roster: [ana, bia], roundStart: start, now, receipts: [receipt(ana)], catalog: { quotes: [{ candidate_id: ana.id, candidate_slug: ana.slug }, { candidate_id: bia.id, candidate_slug: bia.slug }] } })
    assert.equal(result.searched, 1)
    assert.equal(result.covered, 2)
    assert.equal(result.covered_but_unsearched, 1)
    assert.deepEqual(result.missing_names, [bia.nome_urna])
  })

  it("não aceita slug alterado como identidade atual", () => {
    const result = auditarRodadaFalas({ roster: [ana], roundStart: start, now, receipts: [receipt(ana, { candidate_slug: "ana-slug-antigo", individual_response: { candidate_id: ana.id, candidate_slug: "ana-slug-antigo" } })] })
    assert.equal(result.searched, 0)
    assert.equal(result.invalid_receipts, 1)
    assert.equal(result.candidates[0].status, "not_searched")
  })

  it("separa bloqueio de busca executada", () => {
    const result = auditarRodadaFalas({ roster: [ana, bia], roundStart: start, now, receipts: [receipt(ana, { status: "blocked", individual_response: undefined }), receipt(bia, { status: "planned", individual_response: undefined })] })
    assert.equal(result.blocked, 1)
    assert.equal(result.planned, 1)
    assert.equal(result.searched, 0)
    assert.deepEqual(result.candidates.map((candidate) => candidate.status), ["blocked", "planned"])
  })

  it("aceita resposta individual explicitamente vazia", () => {
    const result = auditarRodadaFalas({ roster: [ana], roundStart: start, now, receipts: [receipt(ana, { status: "no_results", individual_response: { candidate_id: ana.id, candidate_slug: ana.slug, result: "empty", results: [] } })] })
    assert.equal(result.complete, true)
    assert.equal(result.searched, 1)
    assert.equal(result.no_results, 1)
  })

  it("não conta resposta de lote sem resposta individual", () => {
    const batch = { ...receipt(ana), individual_response: undefined, response: { results: [{ candidate_id: ana.id, candidate_slug: ana.slug }] } }
    const result = auditarRodadaFalas({ roster: [ana], roundStart: start, now, receipts: [batch] })
    assert.equal(result.searched, 0)
    assert.equal(result.invalid_receipts, 1)
    assert.equal(result.candidates[0].reasons.includes("individual_response_identity_missing"), true)
  })

  it("não confunde resposta bloqueada com resultado individual vazio", () => {
    const blocked = receipt(ana, { status: "no_results", individual_response: { candidate_id: ana.id, candidate_slug: ana.slug, result: "empty", results: [], blocked: true } })
    const result = auditarRodadaFalas({ roster: [ana], roundStart: start, now, receipts: [blocked] })
    assert.equal(result.complete, false)
    assert.equal(result.searched, 0)
    assert.equal(result.invalid_receipts, 1)
  })

  it("exige resultado e prova na resposta individual e não aceita provedor inventado", () => {
    const identityOnly = { ...receipt(ana), individual_response: { candidate_id: ana.id, candidate_slug: ana.slug } }
    const spoofedProvider = { ...receipt(ana), provider: "provedor-inventado", source_id: "g1", source_origin: "https://g1.globo.com" }
    const result = auditarRodadaFalas({ roster: [ana], roundStart: start, now, receipts: [identityOnly, spoofedProvider] })
    assert.equal(result.searched, 0)
    assert.equal(result.invalid_receipts, 2)
    assert.equal(result.candidates[0].reasons.includes("individual_response_outcome_missing"), true)
    assert.equal(result.candidates[0].reasons.includes("provider_unapproved"), true)
  })

  it("aceita fonte aprovada nominal e recusa metadados divergentes", () => {
    const valid = receipt(ana, { provider: "g1", source_id: "g1", source_origin: "https://g1.globo.com" })
    assert.equal(auditarRodadaFalas({ roster: [ana], roundStart: new Date(start), now: new Date(now), receipts: [valid] }).complete, true)
    assert.equal(auditarRodadaFalas({ roster: [ana], roundStart: start, now, receipts: [{ ...valid, source_origin: "https://example.com" }] }).complete, false)
  })
})
