import "./helpers/server-only"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import { parsePesquisasEleitoraisJson } from "../src/lib/pesquisas-eleitorais"
import type { EvidenciaPesquisaCandidata } from "../scripts/lib/pesquisas-monitoramento"
import { sourceMentionReviewConfere as sourceMentionReviewConfereModel } from "../scripts/pesquisas-atualizacao-agendada/model"

const require = createRequire(import.meta.url)

const { sourceMentionReviewConfere } = require("../scripts/lib/pesquisas-monitoramento") as typeof import("../scripts/lib/pesquisas-monitoramento")
const { resolverMencaoEspontaneaRevisada } = require("../scripts/lib/pesquisas-monitoramento-identidades-revisadas") as typeof import("../scripts/lib/pesquisas-monitoramento-identidades-revisadas")
const { comparabilityKey } = require("../scripts/lib/pesquisas-monitoramento") as typeof import("../scripts/lib/pesquisas-monitoramento")

const PDF_HASH = "a".repeat(64)
const HTML_HASH = "b".repeat(64)
const REGISTRATION = "RS-00001/2026"
const SCENARIO_ID = "poll-1t-spontaneous"
const QUESTION = "Pergunta aberta literal"
const LABEL = "Primeiro turno espontâneo"

function monitorScenario(): EvidenciaPesquisaCandidata["scenario"] {
  return {
    id: SCENARIO_ID,
    office: "Governador",
    geography: "Rio Grande do Sul",
    geography_code: "RS",
    turn: 1,
    label: LABEL,
    question: QUESTION,
    mode: "espontaneo",
  }
}

function monitorResult(): EvidenciaPesquisaCandidata["results"][number] {
  return {
    raw_label: "Eduardo Leite",
    candidate_slug: null,
    match_status: "reviewed_source_mention",
    value_percent: 1,
    source_mention_review: {
      registration_id: REGISTRATION,
      geography_code: "RS",
      office: "Governador",
      scenario_id: SCENARIO_ID,
      mode: "espontanea",
      source_sha256: PDF_HASH,
      raw_label: "Eduardo Leite",
      value_percent: 1,
      scenario_label: LABEL,
      scenario_question: QUESTION,
    },
  }
}

function monitorEvidence(): Pick<EvidenciaPesquisaCandidata, "registration" | "evidence_sha256" | "result_document"> {
  return {
    registration: { id: REGISTRATION, url: "https://example.test/registry" },
    evidence_sha256: HTML_HASH,
    result_document: { url: "https://example.test/result.pdf", observed_at: "2026-09-17T00:00:00.000Z", evidence_sha256: PDF_HASH, pages: [5] },
  }
}

test("revisão espontânea exige recibo nominal e hash do PDF", () => {
  const result = monitorResult()
  assert.equal(sourceMentionReviewConfere(result, monitorEvidence(), monitorScenario()), true)

  const invalidCases = [
    { name: "modo do cenário", scenario: { ...monitorScenario(), mode: "estimulado" as const } },
    { name: "pergunta do cenário", scenario: { ...monitorScenario(), question: "Pergunta estimulada" } },
    { name: "rótulo do cenário", scenario: { ...monitorScenario(), label: "Primeiro turno estimulado" } },
    { name: "hash do PDF", result: { ...result, source_mention_review: { ...result.source_mention_review!, source_sha256: HTML_HASH } } },
    { name: "PDF ausente", evidence: { ...monitorEvidence(), result_document: undefined } },
    { name: "percentual", result: { ...result, source_mention_review: { ...result.source_mention_review!, value_percent: 2 } } },
    { name: "escopo", result: { ...result, source_mention_review: { ...result.source_mention_review!, geography_code: "PR" } } },
  ]
  for (const invalid of invalidCases) {
    assert.equal(sourceMentionReviewConfere(invalid.result ?? result, invalid.evidence ?? monitorEvidence(), invalid.scenario ?? monitorScenario()), false, invalid.name)
  }
})

test("manifesto persistente reaplica somente a menção com escopo completo", () => {
  const target = { source_id: "real-time-big-data-estaduais-2026", registration_id: "RS-09640/2026", geography_code: "RS", office: "Governador" }
  const scenario = { id: "real-time-big-data-rs-rs-09640-2026-1t-780d665f58cae3fa", office: "Governador", geography_code: "RS", mode: "espontaneo", label: "Primeiro turno espontâneo", question: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR DO RIO GRANDE DO SUL FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA? (PERGUNTA ABERTA)" }
  const row = { raw_label: "Eduardo Leite", value_percent: 1 }
  const hash = "a0af8ce066bb357cce179cf1349f46e1a19a7813e0332e136114d177c9410ea8"
  const receipt = resolverMencaoEspontaneaRevisada(target, scenario, row, hash)
  assert.equal(receipt?.raw_label, row.raw_label)
  assert.deepEqual(Object.keys(receipt ?? {}).sort(), [
    "geography_code",
    "mode",
    "office",
    "raw_label",
    "registration_id",
    "scenario_id",
    "scenario_label",
    "scenario_question",
    "source_sha256",
    "value_percent",
  ])
  assert.equal("source_id" in (receipt ?? {}), false)
  assert.equal(resolverMencaoEspontaneaRevisada(target, scenario, row, "b".repeat(64)), null)
  assert.equal(resolverMencaoEspontaneaRevisada(target, scenario, { ...row, value_percent: 2 }, hash), null)
  assert.equal(resolverMencaoEspontaneaRevisada(target, { ...scenario, mode: "estimulado" }, row, hash), null)
  assert.equal(resolverMencaoEspontaneaRevisada(target, { ...scenario, question: "Pergunta alterada" }, row, hash), null)
})

test("runoffs PR preservam o modo explícito do extrator na chave canônica", () => {
  const evidence = { registration: { id: "PR-09262/2026" } } as Parameters<typeof comparabilityKey>[0]
  const runoffs = [
    { id: "pr-2t-a", label: "Cenário 01", mode: "estimulado" as const },
    { id: "pr-2t-b", label: "Cenário 02", mode: "estimulado" as const },
    { id: "pr-2t-c", label: "Cenário 03", mode: "estimulado" as const },
  ]
  for (const scenario of runoffs) {
    const key = comparabilityKey(evidence, { ...scenario, office: "Governador", geography: "Paraná", geography_code: "PR", turn: 2, question: null }, [
      { raw_label: "Candidato A", candidate_slug: null, match_status: "indeterminado", value_percent: 50 },
      { raw_label: "Candidato B", candidate_slug: null, match_status: "indeterminado", value_percent: 50 },
    ])
    assert.equal(key.split("|")[4], "estimulada")
  }
})

test("modelo agendado aceita a menção só no cenário espontâneo escopado", () => {
  const result = monitorResult()
  const scenario = {
    id: SCENARIO_ID,
    turn: 1,
    geography: "Rio Grande do Sul",
    label_raw: LABEL,
    question: { value: QUESTION },
    comparability_key: "2026|Governador|RS|1|espontaneo|signature|total_amostra",
    resultados: [result],
  }
  const contract = {
    registration: { code: { value: REGISTRATION } },
    geography: { code: "RS" },
    office: "Governador",
    provenance: { capture: { sha256: HTML_HASH, supporting_pdf_sha256: PDF_HASH } },
  } as unknown as Parameters<typeof sourceMentionReviewConfereModel>[2]
  assert.equal(sourceMentionReviewConfereModel(result, scenario, contract), true)
  assert.equal(sourceMentionReviewConfereModel(result, scenario, { ...contract, provenance: { ...contract.provenance, capture: { sha256: HTML_HASH } } }), false)
  assert.equal(sourceMentionReviewConfereModel(result, { ...scenario, comparability_key: "2026|Governador|RS|1|estimulado|signature|total_amostra" }, contract), false)
  assert.equal(sourceMentionReviewConfereModel({ ...result, candidate_slug: "eduardo-leite" }, scenario, contract), false)
})

function publicCatalog(overrides: (scenario: Record<string, unknown>, result: Record<string, unknown>) => void = () => undefined): { researches: string; sources: string } {
  const result: Record<string, unknown> = {
    raw_label: "Eduardo Leite",
    candidate_slug: null,
    match_status: "reviewed_source_mention",
    value_percent: 1,
    status: "publicado",
    source_mention_review: {
      registration_id: REGISTRATION,
      geography_code: "RS",
      office: "Governador",
      scenario_id: SCENARIO_ID,
      mode: "espontanea",
      source_sha256: PDF_HASH,
      raw_label: "Eduardo Leite",
      value_percent: 1,
      scenario_label: LABEL,
      scenario_question: QUESTION,
    },
  }
  const scenario: Record<string, unknown> = {
    id: SCENARIO_ID,
    turn: 1,
    geography: "Rio Grande do Sul",
    label_raw: LABEL,
    question: { value: QUESTION, status: "publicado" },
    comparability_key: "2026|Governador|RS|1|espontaneo|signature|total_amostra",
    resultados: [result],
  }
  overrides(scenario, result)
  return {
    researches: JSON.stringify({
      schema_version: "1.0.0",
      election_scope: { year: 2026, office: "Governador", geography: "Rio Grande do Sul" },
      alias_scope: { year: 2026, office: "Governador", geography: "Rio Grande do Sul" },
      exact_aliases_version: "test",
      exact_aliases: [],
      publication_scope: { election_year: 2026, office: "Governador", geography_code: "RS", turn: 1, comparability_key: "2026|Governador|RS|1|espontaneo|signature|total_amostra" },
      pesquisas: [{
        id: "poll-1", source_id: "source-test", source_status: "aprovado", publishable_by_default: true, state: "publicado",
        instituto: { value: "Instituto Teste", status: "publicado" }, contratante: { value: "Contratante", status: "publicado" },
        fieldwork: { start: { value: "2026-08-20", status: "publicado" }, end: { value: "2026-08-22", status: "publicado" } },
        publication_date: { value: "2026-08-23", status: "publicado" },
        sample: { size: { value: 1000, status: "publicado" }, population: { value: "Eleitores", status: "publicado" } },
        margin_error_pp: { value: 2, status: "publicado" }, confidence_percent: { value: 95, status: "publicado" }, method: { value: "Entrevistas", status: "publicado" },
        registration: { code: { value: REGISTRATION, status: "publicado" }, url: { value: "https://example.test/registry", status: "publicado" } },
        geography: { type: "unidade_federativa", label: "Rio Grande do Sul", code: "RS" }, office: "Governador",
        provenance: { result_url: "https://example.test/result", supporting_urls: ["https://example.test/result.pdf"], source_kind: "test", route_class: "test", route_reason: "test", consulted_at: "2026-08-24T00:00:00.000Z", capture: { format: "html+pdf", sha256: HTML_HASH, supporting_pdf_sha256: PDF_HASH, status: "publicado" } },
        cenarios: [scenario],
      }],
    }),
    sources: JSON.stringify({ schema_version: "1.0.0", preferred_source_ids: ["source-test"], sources: [{ id: "source-test", status: "aprovado", roles: { institute: "Instituto Teste" }, representative_poll: { result_url: "https://example.test/result", registry_url: "https://example.test/registry", registration_id: REGISTRATION, office: "Governador", geography: "Rio Grande do Sul" }, reviewed_registration_ids: [REGISTRATION] }] }),
  }
}

test("catálogo público preserva o novo tipo e rejeita cenário ou PDF divergente", () => {
  const valid = publicCatalog()
  const catalog = parsePesquisasEleitoraisJson(valid.researches, valid.sources)
  const result = catalog.pesquisas[0]!.cenarios[0]!.resultados[0]!
  assert.equal(result.matchStatus, "reviewed_source_mention")
  assert.equal(result.candidateSlug, null)
  assert.equal(result.sourceMentionReview?.sourceSha256, PDF_HASH)

  for (const mutate of [
    (scenario: Record<string, unknown>) => { scenario.label_raw = "Primeiro turno estimulado" },
    (_scenario: Record<string, unknown>, result: Record<string, unknown>) => { (result.source_mention_review as Record<string, unknown>).source_sha256 = HTML_HASH },
    (_scenario: Record<string, unknown>, result: Record<string, unknown>) => { result.candidate_slug = "eduardo-leite" },
  ]) {
    const invalid = publicCatalog(mutate)
    assert.throws(() => parsePesquisasEleitoraisJson(invalid.researches, invalid.sources))
  }
})
