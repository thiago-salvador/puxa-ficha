import "./helpers/server-only"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parsePublicacaoMonitorada } from "../scripts/lib/pesquisas-monitoramento-adapters"
import { listarAlvosMonitoramento, obterContratoFonte } from "../scripts/lib/pesquisas-monitoramento"
import { parseTextoRealTimePdf } from "../scripts/lib/pesquisas-monitoramento-realtime-pdf"

const registrationId = "PR-09262/2026"
const documentUrl = "https://prmais.com/wp-content/uploads/2026/08/Parana%CC%81-PR-09262_2026_Ago26.pdf"
const observedAt = "2026-09-17T19:56:37.810Z"
const html = `<meta property="article:published_time" content="2026-08-18"><article>
Real Time Big Data para governador do Paraná. A pesquisa foi realizada entre 13 e 17 de agosto de 2026, com 1.600 eleitores.
Registro ${registrationId}. Margem de erro de 2 pontos percentuais. Intervalo de confiança de 95%. Entrevistas presenciais.
</article>`
const target = listarAlvosMonitoramento({ sourceId: "real-time-big-data-estaduais-2026", uf: "PR" })
  .find((candidate) => candidate.registration_id === registrationId)!
const source = obterContratoFonte(target.source_id)
const parsed = parseTextoRealTimePdf(readFileSync("tests/fixtures/pesquisas-distribuicao/documentos/realtime-parana.layout.txt", "utf8"), registrationId)
const resultDocument = { ...parsed, kind: "realtime_pdf" as const, url: documentUrl, observed_at: observedAt, evidence_sha256: "a".repeat(64) }

test("adaptador reutiliza IDs distintos quando duelos compartilham a pergunta", () => {
  const evidence = parsePublicacaoMonitorada({ html, observedAt, source, target, resultDocument })
  assert.deepEqual(evidence.additional_scenarios?.map(({ scenario }) => scenario.id), [
    "real-time-big-data-pr-pr-09262-2026-1t-a9fc8d84fdbb7bc9",
    "real-time-big-data-pr-pr-09262-2026-2t-f98627ab337315b0",
    "real-time-big-data-pr-pr-09262-2026-2t-249840bfd6dd342b",
    "real-time-big-data-pr-pr-09262-2026-2t-19956771d3c92757",
  ])
})

test("mantém lookup por rótulo sem pergunta e fallback determinístico", () => {
  const document = { ...resultDocument, scenarios: [resultDocument.scenarios[1], { ...resultDocument.scenarios[2], question: null }] }
  const noQuestionTarget = {
    ...target,
    known_scenarios: target.known_scenarios?.map((scenario) => scenario.turn === 2 ? { ...scenario, question: null } : scenario),
  }
  const byLabel = parsePublicacaoMonitorada({ html, observedAt, source, target: noQuestionTarget, resultDocument: document })
  assert.equal(byLabel.additional_scenarios?.[0].scenario.id, "real-time-big-data-pr-pr-09262-2026-2t-f98627ab337315b0")

  const noMatchingLabelTarget = {
    ...target,
    known_scenarios: target.known_scenarios?.map((scenario) => scenario.turn === 2 ? { ...scenario, label: `Rótulo ${scenario.id}` } : scenario),
  }
  const fallback = parsePublicacaoMonitorada({ html, observedAt, source, target: noMatchingLabelTarget, resultDocument })
  const runoff = resultDocument.scenarios[2]
  const suffix = createHash("sha256").update(`estimulado|${runoff.results.map((row) => row.raw_label).sort().join("|")}`).digest("hex").slice(0, 16)
  assert.equal(fallback.additional_scenarios?.[1].scenario.id, `${target.poll_id}-2t-${suffix}`)
})
