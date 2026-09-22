import assert from "node:assert/strict"
import { test } from "node:test"

import publicDataset from "../scripts/data/checagens-atribuidas.json"
import liveRoster from "../QA/evidencias/2026-09-22-checagens-atribuidas/inventario/candidate-roster-live-20260922.snapshot.json"
import {
  parseAttributedFactCheck,
  selectApprovedAttributedFactChecks,
  validateAttributedFactCheckDataset,
  type AttributedFactCheck,
  type CandidateRosterIdentity,
} from "../src/lib/checagens-atribuidas"

const baseCheck = (): AttributedFactCheck => ({
  id: "lupa-lula-001",
  candidate_id: "cand-lula",
  candidate_slug: "lula",
  candidate_name: "Luiz Inácio Lula da Silva",
  office: "Presidente",
  uf: null,
  claim: "A afirmação literal do candidato.",
  claimFormat: "literal",
  quoteText: "A afirmação literal do candidato.",
  event: {
    date: "2026-09-01",
    context: "Entrevista publicada com pergunta e resposta preservadas.",
    speakerIdentityReviewed: true,
    contextReviewed: true,
    speaker: "Luiz Inácio Lula da Silva",
    question: "Qual é a base dessa afirmação?",
    adjacentTurns: ["Pergunta anterior.", "Resposta seguinte."],
    timecode: "12:34",
  },
  publisher: "Agência Lupa",
  assessmentOrigin: "publisher",
  originalLabel: "Falso",
  summary: "A checagem encontrou dados incompatíveis com a afirmação no recorte indicado.",
  publishedAt: "2026-09-02T10:00:00Z",
  originalUrl: "https://www.agencialupa.org/checagem/lula-001",
  methodologyUrl: "https://www.agencialupa.org/metodologia",
  methodologyVersion: "metodologia-2026-09",
  sourcePolicyVersion: "pf-checagens-v1",
  sourceSnapshotSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  retrievedAt: "2026-09-04T12:00:00Z",
  sourceEvidence: {
    originalLabel: "Falso",
    speakerIdentity: "Nome identificado no trecho original.",
    contextExcerpt: "Trecho integral relevante conferido no original.",
  },
  sources: [
    {
      url: "https://dados.gov.br/dataset/exemplo",
      origin: "cited_by_publisher",
      title: "Fonte citada pela Lupa",
    },
    {
      url: "https://www.ibge.gov.br/exemplo",
      origin: "consulted_by_us",
      title: "Fonte consultada pelo Puxa Ficha",
    },
  ],
  corrections: [
    {
      version: "v2",
      publishedAt: "2026-09-03T11:00:00Z",
      summary: "Corrigido o período usado no texto.",
      finalLabel: "Falso",
      url: "https://www.agencialupa.org/checagem/lula-001#correcao",
    },
  ],
  review: {
    approved: true,
    reviewer: "Revisor editorial",
    reviewerKind: "human",
    reviewedAt: "2026-09-04T12:00:00Z",
  },
})

test("dataset público real contém somente registros aprovados e sem IDs duplicados", () => {
  assert.deepEqual(validateAttributedFactCheckDataset(publicDataset), [])
  assert.equal(publicDataset[0].review.approved, true)
  assert.equal(publicDataset[0].review.reviewerKind, "model_principal")
  assert.deepEqual(
    validateAttributedFactCheckDataset(publicDataset, liveRoster.map((candidate): CandidateRosterIdentity => {
      assert.ok(candidate.cargo_disputado === "Presidente" || candidate.cargo_disputado === "Governador")
      return {
        candidate_id: candidate.id,
        candidate_slug: candidate.slug,
        office: candidate.cargo_disputado,
        uf: candidate.estado,
      }
    })),
    [],
  )
  assert.equal(validateAttributedFactCheckDataset(publicDataset, [{
    candidate_id: "d6740de5-c7d9-4978-ab49-b51a22481aa2",
    candidate_slug: "outro-candidato",
    office: "Presidente",
    uf: null,
  }])[0].reason, "identity_mismatch")
})

test("publica somente o pacote aprovado com identidade exata", () => {
  const checks = selectApprovedAttributedFactChecks([baseCheck()], {
    candidate_id: "cand-lula",
    candidate_slug: "lula",
    office: "Presidente",
    uf: null,
  })
  assert.equal(checks.length, 1)
  assert.equal(checks[0].originalLabel, "Falso")
  assert.equal(checks[0].sources.filter((source) => source.origin === "cited_by_publisher").length, 1)
  assert.equal(checks[0].sources.filter((source) => source.origin === "consulted_by_us").length, 1)
  assert.equal(checks[0].corrections[0].version, "v2")
})

test("preserva fonte nominal do veículo sem inventar URL", () => {
  const check = baseCheck()
  check.sources = [{ title: "Resposta da assessoria citada na matéria", origin: "cited_by_publisher" }]
  assert.deepEqual(parseAttributedFactCheck(check)?.sources, check.sources)
  check.sources = [{ title: "Fonte sem URL", origin: "consulted_by_us" }]
  assert.equal(parseAttributedFactCheck(check), null)
  check.sources = [{ origin: "cited_by_publisher" }]
  assert.equal(parseAttributedFactCheck(check), null)
  check.sources = [{ title: "URL inválida", origin: "cited_by_publisher", url: "javascript:alert(1)" }]
  assert.equal(parseAttributedFactCheck(check), null)
  assert.equal(parseAttributedFactCheck({ ...baseCheck(), sourcePolicyVersion: "unknown" }), null)
  check.sources = [{ title: "Fonte original em HTTP", origin: "cited_by_publisher", url: "http://example.org/documento" }]
  assert.deepEqual(parseAttributedFactCheck(check)?.sources, check.sources)
  check.sources[0].url = "http://user:password@example.org/documento"
  assert.equal(parseAttributedFactCheck(check), null)
})

test("falha fechado para identidade trocada, cargo ou UF divergente", () => {
  const check = baseCheck()
  for (const identity of [
    { candidate_id: "cand-other", candidate_slug: "lula", office: "Presidente", uf: null },
    { candidate_id: "cand-lula", candidate_slug: "other", office: "Presidente", uf: null },
    { candidate_id: "cand-lula", candidate_slug: "lula", office: "Governador", uf: "SP" },
    { candidate_id: "cand-lula", candidate_slug: "lula", office: "Presidente", uf: "SP" },
  ]) {
    assert.deepEqual(selectApprovedAttributedFactChecks([check], identity), [])
  }
})

test("preserva múltiplas afirmações individuais da mesma matéria e ordena por publicação", () => {
  const first = baseCheck()
  const second = {
    ...baseCheck(),
    id: "lupa-lula-002",
    claim: "Outra afirmação independente.",
    publishedAt: "2026-09-05T10:00:00Z",
    originalLabel: "Verdadeiro",
    sourceEvidence: { ...baseCheck().sourceEvidence, originalLabel: "Verdadeiro" },
    corrections: [{ ...baseCheck().corrections[0], finalLabel: "Verdadeiro" }],
  }
  const checks = selectApprovedAttributedFactChecks([first, second], {
    candidate_id: "cand-lula",
    candidate_slug: "lula",
    office: "Presidente",
    uf: null,
  })
  assert.deepEqual(checks.map((check) => check.id), ["lupa-lula-002", "lupa-lula-001"])
  assert.notEqual(checks[0].originalLabel, checks[1].originalLabel)
})

test("rejeita contexto incompleto, revisão não aprovada e fontes sem origem do veículo", () => {
  const incomplete = structuredClone(baseCheck())
  incomplete.event.context = ""
  assert.equal(parseAttributedFactCheck(incomplete), null)

  const pending = structuredClone(baseCheck()) as unknown as Record<string, unknown>
  pending.review = { approved: false, reviewer: "Revisor", reviewerKind: "human", reviewedAt: "2026-09-04T12:00:00Z" }
  assert.equal(parseAttributedFactCheck(pending), null)

  const noPublisherSource = structuredClone(baseCheck())
  noPublisherSource.sources = noPublisherSource.sources.map((source) => ({ ...source, origin: "consulted_by_us" as const }))
  assert.equal(parseAttributedFactCheck(noPublisherSource), null)
})

test("não aceita campo de veredito independente nem correção sem registro válido", () => {
  const withVerdict = { ...baseCheck(), independentVerdict: "falso" }
  assert.equal(parseAttributedFactCheck(withVerdict), null)

  const brokenCorrection = structuredClone(baseCheck())
  brokenCorrection.corrections[0].url = "http://inseguro.test/correcao"
  assert.equal(parseAttributedFactCheck(brokenCorrection), null)

  const wrongCorrectionLabel = structuredClone(baseCheck())
  wrongCorrectionLabel.corrections[0].finalLabel = "Verdadeiro"
  assert.equal(parseAttributedFactCheck(wrongCorrectionLabel), null)

  const ownAssessment = { ...baseCheck(), assessmentOrigin: "own" }
  assert.equal(parseAttributedFactCheck(ownAssessment), null)
})
