import "./helpers/server-only"
import assert from "node:assert/strict"
import test from "node:test"

import { listarRodadasRecentesDoCandidato, type CatalogoPesquisasEleitorais } from "../src/lib/pesquisas-eleitorais"
import { publishedValue, resultKey, seriesCandidates } from "../src/lib/poll-series"
import { aggregatePollWeeks, groupWeeklyPollSeries } from "../src/lib/poll-weeks"
import { fixturePoll } from "./fixtures/poll-series"

const PDF_HASH = "a".repeat(64)

function pollWithReviewedMention() {
  const poll = fixturePoll("2026-09-01", [35, 42, 10])
  poll.office = "Governador"
  poll.geography = { type: "estadual", label: "Mato Grosso do Sul", code: "MS" }
  poll.scenario.geography = "Mato Grosso do Sul"
  poll.scenario.comparabilityKey = "2026|Governador|MS|1|espontaneo|lista-ms|total_amostra"
  poll.scenario.resultados.push({
    rawLabel: "Reinaldo Azambuja",
    candidateSlug: null,
    matchStatus: "reviewed_source_mention",
    valuePercent: 1,
    status: "publicado",
    sourceMentionReview: {
      registrationId: "MS-07706/2026",
      geographyCode: "MS",
      office: "Governador",
      scenarioId: poll.scenario.id,
      mode: "espontanea",
      sourceSha256: PDF_HASH,
      rawLabel: "Reinaldo Azambuja",
      valuePercent: 1,
      scenarioLabel: poll.scenario.labelRaw,
      scenarioQuestion: poll.scenario.question.value,
    },
  })
  return poll
}

function catalogWithMention(): CatalogoPesquisasEleitorais {
  const poll = pollWithReviewedMention()
  poll.scenario.comparabilityKey = "2026|Governador|MS|1|estimulado|lista-ms|total_amostra"
  const { scenario } = poll
  const snakePoll = {
    id: poll.id,
    sourceId: poll.sourceId,
    sourceStatus: poll.sourceStatus,
    state: poll.state,
    electionYear: poll.electionYear,
    instituto: poll.instituto,
    contratante: poll.contratante,
    fieldwork: poll.fieldwork,
    publicationDate: poll.publicationDate,
    sample: poll.sample,
    marginErrorPp: poll.marginErrorPp,
    confidencePercent: poll.confidencePercent,
    method: poll.method,
    registration: poll.registration,
    geography: poll.geography,
    office: poll.office,
    provenance: poll.provenance,
    cenarios: [{
      id: scenario.id,
      turn: scenario.turn,
      geography: scenario.geography,
      labelRaw: scenario.labelRaw,
      question: scenario.question,
      comparabilityKey: scenario.comparabilityKey,
      resultados: scenario.resultados,
    }],
  }
  return {
    schemaVersion: "1.0.0",
    aliasesVersion: "test",
    electionScope: { year: 2026, office: "Governador", geography: "Mato Grosso do Sul" },
    publicationScope: { electionYear: 2026, office: "Governador", geographyCode: "MS", turn: 1, comparabilityKey: scenario.comparabilityKey },
    preferredSourceIds: [poll.sourceId],
    aliases: [],
    pesquisas: [snakePoll],
  }
}

test("menção revisada sem slug fica fora de série e média, mas mantém percentual original", () => {
  const poll = pollWithReviewedMention()
  const mention = poll.scenario.resultados.at(-1)!
  assert.equal(mention.matchStatus, "reviewed_source_mention")
  assert.equal(mention.candidateSlug, null)
  assert.equal(publishedValue(poll, mention), 1)
  const candidateKeys = seriesCandidates([poll]).map(resultKey)
  assert.equal(candidateKeys.some(key => key.includes("Reinaldo Azambuja")), false)
  const detailsResults = poll.scenario.resultados.filter(result => !candidateKeys.includes(resultKey(result)))
  assert.deepEqual(detailsResults.map(result => [result.rawLabel, publishedValue(poll, result)]), [["Reinaldo Azambuja", 1]])

  const [week] = aggregatePollWeeks([poll])
  assert.ok(week)
  assert.equal(week.results.some(item => item.result.rawLabel === "Reinaldo Azambuja"), false)
  assert.equal(groupWeeklyPollSeries([poll]).length, 1)
})

test("menção revisada sem slug não entra na listagem por perfil de candidato", () => {
  const catalog = catalogWithMention()
  assert.deepEqual(listarRodadasRecentesDoCandidato(catalog, "reinaldo-azambuja"), [])
  assert.equal(listarRodadasRecentesDoCandidato(catalog, "candidate-0").length, 1)
})
