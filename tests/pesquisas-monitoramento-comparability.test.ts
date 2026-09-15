import "./helpers/server-only"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { escreverRelatorios, type EvidenciaPesquisaCandidata } from "../scripts/lib/pesquisas-monitoramento"

function evidence(id: string, label: string, question: string | null = "", sampleSize = 1600): EvidenciaPesquisaCandidata {
  return {
    source_id: "fixture",
    source_status: "aprovado",
    url: "https://example.com/pesquisa",
    institute: "Instituto Fixture",
    registration: { id: `${id.toUpperCase()}/2026`, url: "https://example.com/registro" },
    fieldwork: { start: "2026-09-10", end: "2026-09-14" },
    publication_date: "2026-09-15",
    scenario: { id, office: "Governador", geography: "Pará", geography_code: "PA", turn: 1, label, question },
    sample: { size: sampleSize, population: "eleitorado" },
    margin_error_pp: 2,
    confidence_percent: 95,
    method: "entrevistas por telefone",
    results: [
      { raw_label: "Ana Silva (X)", candidate_slug: "ana-silva", match_status: "exact_alias", value_percent: 45 },
      { raw_label: "Beto Souza (Y)", candidate_slug: "beto-souza", match_status: "exact_alias", value_percent: 35 },
      { raw_label: "Nulo/Branco", candidate_slug: null, match_status: "not_candidate", value_percent: 10 },
      { raw_label: "Não sabe/Não respondeu", candidate_slug: null, match_status: "not_candidate", value_percent: 10 },
    ],
    observed_at: "2026-09-15T12:00:00Z",
    evidence_sha256: "a".repeat(64),
  }
}

function keyFor(...entries: EvidenciaPesquisaCandidata[]): string[] {
  const directory = mkdtempSync(join(tmpdir(), "pf-comparability-"))
  try {
    escreverRelatorios(entries.map((entry) => ({
      case_id: `${entry.scenario.id}-live`,
      result: { decision: { classification: "novo", eligible_for_human_review: true, reason: "fixture" }, evidence: entry, baseline: null },
    })), directory)
    const proposal = JSON.parse(readFileSync(join(directory, "proposal.json"), "utf8"))
    return proposal.items.map((item: { normalized_contract: { cenarios: Array<{ comparability_key: string }> } }) => item.normalized_contract.cenarios[0].comparability_key)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("chave semanal compara IDs diferentes com mesmo conjunto, modo e amostra", () => {
  const first = evidence("poll-a", "Primeiro turno estimulado")
  const second = evidence("poll-b", "Lista estimulada para governador", "", 2000)
  const [left, right] = keyFor(first, second)
  assert.equal(left, right)
  assert.equal(left.split("|").length, 7)
  assert.equal(left.split("|")[4], "estimulada")
  assert.equal(left.split("|")[6], "total_amostra")
})

test("modo espontâneo e conjunto desconhecido ficam isolados", () => {
  const stimulated = evidence("poll-a", "Primeiro turno estimulado")
  const spontaneous = evidence("poll-b", "Primeiro turno espontâneo")
  const unknownA = evidence("poll-c", "Resultado publicado")
  const unknownB = evidence("poll-d", "Resultado publicado")
  const [stimulatedKey, spontaneousKey, unknownKeyA, unknownKeyB] = keyFor(stimulated, spontaneous, unknownA, unknownB)
  assert.notEqual(stimulatedKey, spontaneousKey)
  assert.equal(stimulatedKey.split("|")[4], "estimulada")
  assert.equal(spontaneousKey.split("|")[4], "espontaneo")
  assert.notEqual(unknownKeyA, unknownKeyB)
  assert.equal(unknownKeyA.split("|")[4], "desconhecida")
})
