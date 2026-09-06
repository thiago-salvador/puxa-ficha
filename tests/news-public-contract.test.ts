import assert from "node:assert/strict"
import test from "node:test"
import { analyzeNewsPublicContract, retentionCutoff } from "../scripts/audit/audit-news-public-contract"

test("separa contexto cruzado entre candidatos e dívida de retenção", () => {
  const report = analyzeNewsPublicContract([
    { id: "1", slug: "rosi-aires", nome_urna: "Rosi Aires", nome_completo: "Rosi Aires", publicavel: true },
    { id: "2", slug: "clebio-genuino", nome_urna: "Clébio Genuíno", nome_completo: "Clébio Genuíno", publicavel: true },
  ], [
    { id: "a", candidato_id: "1", titulo: "Clébio Genuíno disputa o governo", url: "https://example.test/a", data_publicacao: "2026-09-01T00:00:00Z" },
    { id: "b", candidato_id: "1", titulo: "Rosi Aires lança programa", url: "https://example.test/b", data_publicacao: "2024-01-01T00:00:00Z" },
    { id: "c", candidato_id: "1", titulo: "Rosi Aires em entrevista", url: "https://example.test/c", data_publicacao: null },
  ], new Date("2026-09-06T12:00:00Z"))

  assert.equal(report.totals.context_of_election, 0)
  assert.equal(report.totals.cross_candidate_context, 1)
  assert.equal(report.totals.expired, 1)
  assert.equal(report.totals.missing_publication_date, 1)
})

test("cutoff recua 365 dias exatos", () => {
  assert.equal(retentionCutoff(new Date("2026-09-06T12:00:00Z")).toISOString(), "2025-09-06T12:00:00.000Z")
})
