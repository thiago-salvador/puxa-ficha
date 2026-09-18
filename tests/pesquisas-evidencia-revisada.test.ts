import "./helpers/server-only"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { test } from "node:test"
import { avaliarEvidenciaAoVivo, listarAlvosMonitoramento, obterContratoFonte, avaliarEvidenciaExtraidaRevisada, type EvidenciaPesquisaCandidata, type SourceContract } from "../scripts/lib/pesquisas-monitoramento"
import type { AlvoMonitoramento } from "../scripts/lib/pesquisas-monitoramento-adapters"

const html = "<article>captura revisada</article>"
const source: SourceContract = { id: "revisada-test", status: "aprovado", roles: { institute: "Teste" }, representative_poll: null }
const target: AlvoMonitoramento = { poll_id: "revisada-test-2026", source_id: source.id, url: "https://example.test/pesquisa", registration_id: "XX-00001/2026", registry_url: "https://example.test/tse", office: "Governador", geography: "TESTE", geography_code: "XX", turn: 1, scenario_id: "principal", scenario_label: "Primeiro turno", scenario_question: null, population: "eleitores" }
const registry = [{ registration_id: target.registration_id, office: target.office, geography: target.geography, field_start: "2026-09-10", field_end: "2026-09-12", sample_size: 100, margin_error_pp: 3, institute: "Teste" }]
const evidence = (): EvidenciaPesquisaCandidata => ({ source_id: source.id, source_status: "aprovado", url: target.url, institute: "Teste", registration: { id: target.registration_id, url: target.registry_url }, fieldwork: { start: "2026-09-10", end: "2026-09-12" }, publication_date: "2026-09-12", scenario: { id: target.scenario_id, office: target.office, geography: target.geography, geography_code: target.geography_code, turn: 1, label: target.scenario_label, question: null }, sample: { size: 100, population: "eleitores" }, margin_error_pp: 3, confidence_percent: 95, method: "entrevistas", results: [{ raw_label: "Branco", candidate_slug: null, match_status: "not_candidate", value_percent: 10 }], observed_at: "2026-09-17T00:00:00Z", evidence_sha256: createHash("sha256").update(html).digest("hex"), scenario_complete: true, publication_complete: true })
const run = (e = evidence(), t = target) => avaliarEvidenciaExtraidaRevisada({ source, target: t, html, evidence: e, registry, observedAt: "2026-09-17T00:00:00Z" })

test("evidência revisada válida mantém paridade do caminho canônico", () => assert.equal(run().decision.reason, "approved_new_evidence"))
test("hash, alvo e cenário adicional fora do escopo bloqueiam", () => {
  const badHash = evidence(); badHash.evidence_sha256 = "0".repeat(64)
  assert.equal(run(badHash).decision.reason, "revised_hash_mismatch")
  assert.equal(run(evidence(), { ...target, geography_code: "YY" }).decision.reason, "revised_primary_scenario_mismatch")
  const extra = evidence(); extra.additional_scenarios = [{ scenario: { ...extra.scenario, id: "fora", turn: 2, geography_code: "YY" }, results: extra.results, scenario_complete: true }]
  assert.equal(run(extra).decision.reason, "revised_additional_scenario_out_of_scope")
})
test("conflito TSE e incompletude preservam gates existentes", () => {
  assert.equal(run(evidence(), target).decision.reason, "approved_new_evidence")
  const conflict = [{ ...registry[0], sample_size: 101 }]
  assert.equal(avaliarEvidenciaExtraidaRevisada({ source, target, html, evidence: evidence(), registry: conflict, observedAt: "2026-09-17T00:00:00Z" }).decision.reason, "registry_conflict")
  const incomplete = evidence(); incomplete.scenario_complete = false
  assert.equal(run(incomplete).decision.reason, "scenario_incomplete")
})

test("cenários novos no mesmo escopo são aceitos, IDs repetidos são rejeitados", () => {
  const e = evidence()
  const additional = { scenario: { ...e.scenario, id: "novo", turn: 2 as const }, results: e.results, scenario_complete: true as const }
  e.additional_scenarios = [additional]
  const known = { ...target, known_scenarios: [{ id: "antigo", turn: 2 as const, label: "Antigo", question: null }] }
  assert.equal(run(e, known).decision.reason, "approved_new_evidence")
  const additions = e.additional_scenarios
  assert.ok(additions)
  additions.push({ ...additional })
  assert.equal(run(e).decision.reason, "revised_duplicate_scenario_id")
  e.additional_scenarios = [{ ...additional, scenario: { ...additional.scenario, id: e.scenario.id } }]
  assert.equal(run(e).decision.reason, "revised_duplicate_scenario_id")
})

test("fallback do registro mantém URL representativa e padrão do adaptador", () => {
  const e = evidence()
  const t = { ...target, registry_url: "" }
  e.registration.url = "https://pesqele-divulgacao.tse.jus.br/"
  assert.equal(run(e, t).decision.reason, "approved_new_evidence")
  const s = { ...source, representative_poll: { result_url: target.url, registry_url: target.registry_url, registration_id: target.registration_id, office: target.office, geography: target.geography } }
  assert.equal(avaliarEvidenciaExtraidaRevisada({ source: s, target: t, html, evidence: evidence(), registry, observedAt: "2026-09-17T00:00:00Z" }).decision.reason, "approved_new_evidence")
})

test("hash do HTML, fonte, URL e registro ficam estritamente vinculados", () => {
  assert.equal(avaliarEvidenciaExtraidaRevisada({ source, target, html: html + "alterado", evidence: evidence(), registry, observedAt: "2026-09-17T00:00:00Z" }).decision.reason, "revised_hash_mismatch")
  for (const mutate of [
    (e: EvidenciaPesquisaCandidata) => { e.source_id = "outra" },
    (e: EvidenciaPesquisaCandidata) => { e.url += "/outra" },
    (e: EvidenciaPesquisaCandidata) => { e.registration.id = "outro" },
    (e: EvidenciaPesquisaCandidata) => { e.registration.url += "/outra" },
  ]) {
    const e = evidence(); mutate(e)
    assert.equal(run(e).decision.eligible_for_human_review, false)
  }
  assert.equal(run(evidence(), { ...target, source_id: "outra" }).decision.reason, "revised_source_mismatch")
})

test("cargo, geografia e turno são estritos para principal e adicionais", () => {
  for (const change of [{ office: "Presidente" }, { geography: "Outra" }, { geography_code: "YY" }, { turn: 2 as const }]) {
    const e = evidence(); e.scenario = { ...e.scenario, ...change }
    assert.equal(run(e).decision.reason, "revised_primary_scenario_mismatch")
  }
  for (const change of [{ office: "Presidente" }, { geography: "Outra" }, { geography_code: "YY" }, { turn: 3 as 1 }]) {
    const e = evidence(); e.additional_scenarios = [{ scenario: { ...e.scenario, id: "novo", ...change }, results: e.results, scenario_complete: true }]
    assert.equal(run(e).decision.eligible_for_human_review, false)
  }
})

test("identidade não resolvida, evidência vencida e publicação incompleta mantêm bloqueio", () => {
  const unresolved = evidence(); unresolved.results = [{ raw_label: "Pessoa desconhecida", candidate_slug: null, match_status: "indeterminado", value_percent: 10 }]
  assert.equal(run(unresolved).decision.reason, "identity_unresolved")
  const stale = evidence(); stale.publication_date = "2025-01-01"
  assert.equal(run(stale).decision.reason, "evidence_stale")
  const incomplete = evidence(); incomplete.publication_complete = false
  assert.equal(run(incomplete).decision.reason, "scenario_incomplete")
})

test("extração existente e entrada revisada produzem o mesmo resultado", () => {
  const t = listarAlvosMonitoramento({ sourceId: "datafolha-folha-globo-nacional-2026" }).find((entry) => entry.poll_id === "datafolha-br-04496-2026")!
  assert.ok(t)
  const input = { source: obterContratoFonte(t.source_id), target: t, html: readFileSync("tests/fixtures/pesquisas-monitoramento/datafolha-nacional-publicacao.html", "utf8"), observedAt: "2026-08-26T12:00:00-03:00" }
  const live = avaliarEvidenciaAoVivo(input)
  assert.ok(live.evidence)
  assert.deepEqual(avaliarEvidenciaExtraidaRevisada({ ...input, evidence: live.evidence }), live)
})
