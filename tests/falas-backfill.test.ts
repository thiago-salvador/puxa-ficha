import assert from "node:assert/strict"
import { test } from "node:test"
import { verificarRevisao, type AchadoRevisado } from "../scripts/lib/falas-revisao"
import { medirCobertura } from "../scripts/lib/falas-cobertura"
import { importarRevisao } from "../scripts/falas-importar-revisao"
import { dataEvento, validarCatalogo, type CandidatoFalas } from "../scripts/lib/falas-monitoramento"
import type { CatalogoFalas } from "../src/lib/falas-candidatos"
import { lerEvidenciaWeb, type EvidenciaWeb } from "../scripts/lib/falas-evidencia-web"

const now = new Date("2026-09-11T12:00:00Z")
const candidate: CandidatoFalas = { id: "ana", slug: "ana", nome_urna: "Ana Silva", nome_completo: "Ana Silva Souza", cargo_disputado: "Governador", estado: "SP" }
const finding: AchadoRevisado = { quote_text: "Vamos ampliar o atendimento de saúde.", context: "Proposta para saúde", event_context: "Entrevista CNN", occurred_on: "2026-08-23", article_published_at: "2026-08-23T18:00:00-03:00", article_title: "Entrevista Ana", article_url: "https://www.cnnbrasil.com.br/politica/entrevista-ana/", publisher: "CNN Brasil", evidence: { identity_excerpt: "A candidata Ana Silva", date_excerpt: "em entrevista neste domingo (23)" } }
const html = `<link rel="canonical" href="${finding.article_url}"><article><p>A candidata Ana Silva falou em entrevista neste domingo (23).</p><p>“${finding.quote_text}”, disse Ana Silva.</p></article>`
const empty: CatalogoFalas = { schema_version: "falas-v1", updated_at: null, quotes: [] }

test("dia e mês da entrevista respeitam a semana e o calendário da publicação", () => {
  assert.equal(dataEvento("na noite desta segunda-feira (7 de setembro)", "2026-09-08"), "2026-09-07")
  assert.equal(dataEvento("nesta segunda-feira (7 de agosto)", "2026-09-08"), null)
  assert.equal(dataEvento("nesta terça-feira (7 de setembro)", "2026-09-08"), null)
})

test("primeira carga rejeita falas anteriores à campanha mesmo com publicação recente", () => {
  for (const day of ["2022-08-28", "2026-05-20", "2026-08-15"]) {
    const older = { ...finding, occurred_on: day, article_published_at: "2026-09-10", evidence: { ...finding.evidence, date_excerpt: "em entrevista em " + day } }
    const source = html.replace("em entrevista neste domingo (23)", older.evidence.date_excerpt)
    assert.equal(verificarRevisao({ candidate, finding: older, html: source, now, mode: "initial_backfill" }).reason, "event_outside_window")
  }
})
test("primeiro dia da campanha é inclusivo; pré-candidatura é rejeitada", () => {
  const first = { ...finding, occurred_on: "2026-08-16", article_published_at: "2026-08-16", evidence: { ...finding.evidence, date_excerpt: "em entrevista neste domingo (16)" } }
  const source = html.replace("em entrevista neste domingo (23)", first.evidence.date_excerpt)
  assert.ok(verificarRevisao({ candidate, finding: first, html: source, now, mode: "initial_backfill" }).quote)
  const pre = { ...first, evidence: { ...first.evidence, identity_excerpt: "A pré-candidata Ana Silva" } }
  assert.equal(verificarRevisao({ candidate, finding: pre, html: source.replace("A candidata", "A pré-candidata"), now, mode: "initial_backfill" }).reason, "pre_campaign_candidate_context")
})

test("leitura textual preserva resposta da ferramenta e rejeita busca ou outra URL", async () => {
  const raw = `Matéria (${finding.article_url})\nContent type: text/html; Source: open(${JSON.stringify({ ref_id: finding.article_url, lineno: null })}); Total lines: 4\nL0: Entrevista Ana\nL1: A candidata Ana Silva falou em entrevista neste domingo (23).\nL2: “${finding.quote_text}”, disse Ana Silva.\nL3: Fim da matéria.`
  const web: EvidenciaWeb = { format: "web_text", url: finding.article_url, retrieved_at: "2026-09-11T11:00:00Z", raw }
  assert.ok(lerEvidenciaWeb(web).body.includes(finding.quote_text))
  assert.throws(() => lerEvidenciaWeb({ ...web, raw: "Resultado de busca: " + finding.quote_text }))
  assert.throws(() => lerEvidenciaWeb({ ...web, url: "https://example.com/" }))
  assert.throws(() => lerEvidenciaWeb({ ...web, raw: raw + "\nL2: Conteúdo acrescentado depois da leitura." }), /web_evidence_line_order/)
  const result = await importarRevisao({ roster: [candidate], previous: empty, mode: "initial_backfill", now,
    research: [{ candidates: [{ candidato_id: candidate.id, slug: candidate.slug, status: "verified", queries: ["Ana entrevista"], urls_consultadas: [finding.article_url], achados: [finding] }] }],
    webEvidence: new Map([[finding.article_url, web]]), getText: async () => { throw new Error("Não deve fingir leitura HTML") } })
  assert.equal(result.proposal.quotes.length, 1)
  assert.equal(result.proposal.quotes[0].review_evidence?.source_format, "web_text")
  const wrongAuthor = verificarRevisao({ candidate, finding, html: "", webText: { ...web, raw: raw.replace("disse Ana Silva", "disse Paulo Souza") }, now, mode: "initial_backfill" })
  assert.equal(wrongAuthor.quote, null)
})

test("caminhos planejados não contam como executados e evento antigo não é buscado", async () => {
  let requests = 0
  const result = await importarRevisao({ roster: [candidate], previous: empty, mode: "initial_backfill", now,
    research: [{ candidates: [{ candidato_id: candidate.id, slug: candidate.slug, status: "not_queried", queries: ["consulta planejada"], urls_consultadas: [], achados: [] }] }],
    getText: async () => { requests++; return { body: html } } })
  assert.equal(result.coverage.search_complete, false)
  assert.equal(result.coverage.candidates[0].status, "not_searched")
  const old = await importarRevisao({ roster: [candidate], previous: empty, mode: "initial_backfill", now,
    research: [{ candidates: [{ candidato_id: candidate.id, slug: candidate.slug, status: "verified", queries: ["consulta"], urls_consultadas: [], achados: [{ ...finding, occurred_on: "2026-08-15" }] }] }],
    getText: async () => { requests++; return { body: html } } })
  assert.equal(old.receipts[0].reason, "event_outside_window")
  assert.equal(requests, 0)
})

test("negação do formato de entrevista não comprova evento", () => {
  assert.equal(verificarRevisao({ candidate, finding: { ...finding, event_context: "Visita: não explicita formato de entrevista" }, html, now, mode: "initial_backfill" }).reason, "event_type_not_verified")
})

test("fala antiga entra somente na carga inicial explicitamente autorizada", () => {
  assert.equal(verificarRevisao({ candidate, finding, html, now }).reason, "event_outside_window")
  const quote = verificarRevisao({ candidate, finding, html, now, mode: "initial_backfill" }).quote!
  assert.equal(quote.occurred_on, "2026-08-23")
  assert.deepEqual(quote.collection_scope, { mode: "initial_backfill", from: "2026-08-16" })
  validarCatalogo({ ...empty, quotes: [quote] })
  const withoutScope = { ...quote, collection_scope: undefined }
  assert.throws(() => validarCatalogo({ ...empty, quotes: [withoutScope] }), /data comprovada/)
  for (const day of ["2025-12-31", "2026-09-12", "2026-02-30"]) {
    assert.equal(verificarRevisao({ candidate, finding: { ...finding, occurred_on: day }, html, now, mode: "initial_backfill" }).quote, null)
  }
})

test("aspa histórica cobre a ficha, mas não conta como recente", () => {
  const quote = verificarRevisao({ candidate, finding, html, now, mode: "initial_backfill" }).quote!
  const report = medirCobertura([candidate], { ...empty, quotes: [quote] }, [], now)
  assert.equal(report.covered, 1)
  assert.equal(report.coverage_complete, true)
  assert.equal(report.recent_covered, 0)
  assert.equal(report.historical_only, 1)
  assert.equal(report.recent_coverage_complete, false)
  assert.equal(report.candidates[0].freshness, "historical")
})

test("cabeçalho com cidade e horário de publicação não comprova dia da fala", () => {
  for (const dateExcerpt of ["Criciúma, SC, 23/08/2026 - 10:19", "23/08/2026 às 8:40", "23 de Agosto de 2026 às 12:15"]) {
  const source = html.replace("em entrevista neste domingo (23)", "em uma entrevista") + `<p>${dateExcerpt}</p>`
  const result = verificarRevisao({ candidate, finding: { ...finding, evidence: { ...finding.evidence, date_excerpt: dateExcerpt } }, html: source, now, mode: "initial_backfill" })
  assert.equal(result.quote, null)
  assert.equal(result.reason, "publication_timestamp_is_not_event_date")
  }
})

test("carga inicial não repesquisa ficha preenchida nem perde recibos de fallback", async () => {
  const quote = verificarRevisao({ candidate, finding, html, now, mode: "initial_backfill" }).quote!
  let requests = 0
  const research = [{ candidates: [{ candidato_id: candidate.id, slug: candidate.slug, status: "verified", queries: ["nome entrevista"], urls_consultadas: [finding.article_url], achados: [finding] }] }]
  const result = await importarRevisao({ roster: [candidate], previous: { ...empty, quotes: [quote] }, research, now, mode: "initial_backfill", getText: async () => { requests++; return { body: html } } })
  assert.equal(requests, 0)
  assert.equal(result.proposal.quotes.length, 1)
  const coverage = medirCobertura([candidate], empty, [
    { candidate_id: candidate.id, queries: ["A"], urls: [], errors: ["bloqueio"], status: "blocked" },
    { candidate_id: candidate.id, queries: ["B"], urls: [finding.article_url], errors: [], status: "searched" },
  ], now)
  assert.deepEqual(coverage.candidates[0].queries, ["A", "B"])
  assert.equal(coverage.search_complete, true)
  assert.equal(coverage.coverage_complete, false)
})
