import assert from "node:assert/strict"
import { test } from "node:test"
import { verificarRevisao, type AchadoRevisado } from "../scripts/lib/falas-revisao"
import { medirCobertura, paginaCobertura } from "../scripts/lib/falas-cobertura"
import { dataEvento, validarCatalogo, type CandidatoFalas } from "../scripts/lib/falas-monitoramento"
import { importarRevisao } from "../scripts/falas-importar-revisao"
import type { CatalogoFalas } from "../src/lib/falas-candidatos"
import type { EvidenciaWeb } from "../scripts/lib/falas-evidencia-web"
import { conteudoSerializadoClickPb } from "../scripts/lib/falas-conteudo-serializado"

test("ClickPB decodifica texto UTF-8 da matéria certa sem executar scripts", () => {
  const url = "https://www.clickpb.com.br/eleicoes/ana.html"
  const body = "<p>Saúde e educação.</p>"
  const text = `a:T${Buffer.byteLength(body).toString(16)},${body}`
  const row = `b:${JSON.stringify({ Article: { uri: "/eleicoes/ana.html", title: "Ana", datePublished: "2026-09-08T12:00:00-03:00", content: "$a" } })}\n`
  const wrap = (stream: string) => `<script>self.__next_f.push(${JSON.stringify([1, stream])})</script>`
  assert.equal(conteudoSerializadoClickPb(wrap(`:HL["style"]\n${text}${row}`), url)?.body, body)
  assert.equal(conteudoSerializadoClickPb(wrap(text + row), url.replace("ana.html", "outra.html")), null)
  assert.equal(conteudoSerializadoClickPb(wrap(text + row), url.replace("clickpb.com.br", "example.com")), null)
  assert.equal(conteudoSerializadoClickPb(wrap(text + row.replace("$a", "$c")), url), null)
  assert.equal(conteudoSerializadoClickPb(wrap(text + row + text), url), null)
  assert.equal(conteudoSerializadoClickPb(wrap("a:Tffff,<p>truncado"), url), null)
  assert.equal(conteudoSerializadoClickPb('<script>self.__next_f.push((()=>{throw Error("executou")})())</script>', url), null)
})

const now = new Date("2026-09-11T12:00:00Z")
const candidate: CandidatoFalas = { id: "id-a", slug: "ana-silva", nome_urna: "Ana Silva", nome_completo: "Ana Silva Souza", estado: "SP", cargo_disputado: "Governador" }
const finding: AchadoRevisado = { quote_text: "Vamos ampliar o atendimento de saúde.", context: "Programa de saúde", event_context: "Entrevista CNN Brasil", occurred_on: "2026-09-08", article_published_at: "2026-09-08T18:00:00-03:00", publisher: "CNN Brasil", article_url: "https://www.cnnbrasil.com.br/politica/entrevista-ana/", article_title: "Ana apresenta proposta", evidence: { identity_excerpt: "A candidata Ana Silva", date_excerpt: "em entrevista nesta terça-feira (8)" } }
const html = `<html><head><link rel="canonical" href="${finding.article_url}"></head><body><article><p>A candidata Ana Silva falou em entrevista nesta terça-feira (8).</p><p>“${finding.quote_text}”, disse a candidata.</p></article></body></html>`
const empty: CatalogoFalas = { schema_version: "falas-v1", updated_at: null, quotes: [] }

test("recibos RSS contam execução por candidato sem promover links opacos ou consultas planejadas", async () => {
  const receipt = { attempt_status: "executed", plan_query: { candidate_id: candidate.id, candidate_slug: candidate.slug, query: "Ana entrevista" }, rss_request_url: "https://news.google.com/rss/search?q=Ana", rss_results: [{ rss_link: "https://news.google.com/rss/articles/opaque" }], error: null }
  const run = (queries: typeof receipt[]) => importarRevisao({ roster: [candidate], previous: empty, now,
    research: [{ candidates: [{ candidate_id: candidate.id, slug: candidate.slug, status: "pending", queries }] }],
    getText: async () => { throw new Error("descoberta RSS não autoriza abrir ou promover uma aspa") } })
  const result = await run([receipt, { ...receipt, attempt_status: "not_queried", plan_query: { ...receipt.plan_query, query: "Ana debate" } }])
  assert.deepEqual(result.coverage.candidates[0].queries, ["Ana entrevista"])
  assert.ok(result.coverage.candidates[0].urls.includes(receipt.rss_results[0].rss_link))
  assert.equal(result.proposal.quotes.length, 0)
  assert.equal(result.coverage.covered, 0)
  assert.equal((await run([{ ...receipt, attempt_status: "not_queried" }])).coverage.search_attempted_for_all, false)
  await assert.rejects(run([{ ...receipt, plan_query: { ...receipt.plan_query, candidate_id: "another" } }]), /Identidade divergente no recibo RSS/)
})

test("data ao vivo exige a mesma aspa editorial, canal aprovado e revisão do segmento", () => {
  const url = "https://www.youtube.com/watch?v=rl_NCDHTsH4"
  const channel = "UCn6Moj1CU0yJi-xZpsKDaZg"
  const excerpt = "Entrevista da candidata Ana Silva na TV Ponta Negra"
  const quote = "Vamos ampliar o atendimento de saúde para toda a população."
  const proof = { url, channel_id: channel, article_event_excerpt: excerpt, quote_excerpt: quote, frame_sha256: "a".repeat(64), reviewed_live_on_air: true as const }
  const liveFinding: AchadoRevisado = { ...finding, quote_text: quote, event_context: "Entrevista na TV Ponta Negra", evidence: { identity_excerpt: "candidata Ana Silva", date_excerpt: excerpt, event_live_video: proof } }
  const article = `<head><link rel="canonical" href="${finding.article_url}"><meta property="article:published_time" content="${finding.article_published_at}"></head><article><p>${excerpt}</p><p>“${quote}”, disse Ana Silva.</p></article>`
  const metadata = { id: "rl_NCDHTsH4", webpage_url: url, channel_id: channel, title: "Jornal do Dia - 08/09/2026", description: "TV Ponta Negra", duration: 3600, was_live: true, live_status: "was_live", release_timestamp: 1788884722 }
  const support = { metadata: JSON.stringify(metadata), captions: `WEBVTT\n\n00:01:00.000 --> 00:01:05.000\n${quote}\n`, frame_sha256: proof.frame_sha256, frame_at_seconds: 63 }
  const check = (f = liveFinding, s = support, source = article) => verificarRevisao({ candidate, finding: f, html: source, now, liveVideos: new Map([[url, s]]) })
  const accepted = check()
  assert.ok(accepted.quote, accepted.reason)
  assert.equal(accepted.quote.review_evidence?.live_video?.broadcast_on, "2026-09-08")
  assert.doesNotThrow(() => validarCatalogo({ ...empty, quotes: [accepted.quote!] }))
  assert.equal(check(liveFinding, { ...support, metadata: JSON.stringify({ ...metadata, was_live: false, live_status: "not_live" }) }).quote, null)
  assert.equal(check(liveFinding, { ...support, captions: support.captions.replace("saúde", "segurança") }).quote, null)
  const shortProof = { ...liveFinding, evidence: { ...liveFinding.evidence, event_live_video: { ...proof, quote_excerpt: "Vamos ampliar o atendimento de saúde" } } }
  assert.ok(check(shortProof).quote, "citação editorial curta ainda exige todas as provas do episódio")
  assert.equal(check({ ...shortProof, evidence: { ...shortProof.evidence, event_live_video: { ...proof, quote_excerpt: "Vamos ampliar o atendimento" } } }).quote, null)
  assert.equal(check(liveFinding, { ...support, frame_sha256: "b".repeat(64) }).quote, null)
  assert.equal(check(liveFinding, { ...support, frame_at_seconds: 4000 }).quote, null)
  assert.equal(check({ ...liveFinding, occurred_on: "2026-09-07" }).quote, null)
  assert.equal(check({ ...liveFinding, evidence: { ...liveFinding.evidence, event_live_video: { ...proof, channel_id: "unapproved" } } }).quote, null)
  assert.equal(check({ ...liveFinding, evidence: { ...liveFinding.evidence, event_live_video: { ...proof, article_event_excerpt: "Entrevista em outra emissora de televisão" } } }).quote, null)
  assert.equal(check(liveFinding, support, article.replace("article:published_time", "other")).quote, null)
  assert.equal(verificarRevisao({ candidate, finding: liveFinding, html: article, now }).quote, null)
  assert.throws(() => validarCatalogo({ ...empty, quotes: [{ ...accepted.quote!, review_evidence: { ...accepted.quote!.review_evidence!, live_video: { ...accepted.quote!.review_evidence!.live_video!, broadcast_on: "2026-09-07" } } }] }))
})

test("intervalo exige fato anterior comprovado e publicação original sem inventar dia exato", () => {
  const anchorUrl = "https://www.cnnbrasil.com.br/politica/decisao-ana/"
  const anchorExcerpt = "A decisão sobre Ana Silva foi publicada nesta quarta-feira (2)."
  const relationship = "Em entrevista, a candidata Ana Silva comentou a decisão que autorizou sua participação."
  const ranged: AchadoRevisado = { ...finding, occurred_on: null, occurred_between: { from: "2026-09-02", to: "2026-09-04" }, article_published_at: "2026-09-04T11:00:00-03:00",
    evidence: { identity_excerpt: "a candidata Ana Silva", event_date_range: { anchor_url: anchorUrl, anchor_excerpt: anchorExcerpt, anchor_published_at: "2026-09-02T12:00:00-03:00", relationship_excerpt: relationship } } }
  const main = `<head><link rel="canonical" href="${finding.article_url}"><meta property="article:published_time" content="${ranged.article_published_at}"></head><article><p>${relationship}</p><p>“${finding.quote_text}”, disse Ana Silva.</p></article>`
  const supporting = new Map([[anchorUrl, `<article><p>${anchorExcerpt}</p></article>`]])
  const check = (changes: Partial<AchadoRevisado> = {}, source = main) => verificarRevisao({ candidate, finding: { ...ranged, ...changes }, html: source, supporting, now, mode: "initial_backfill" })
  const result = check()
  assert.ok(result.quote, result.reason)
  assert.equal(result.quote.occurred_on, null)
  assert.deepEqual(result.quote.occurred_between, { from: "2026-09-02", to: "2026-09-04" })
  const catalog = { ...empty, quotes: [result.quote] }
  assert.doesNotThrow(() => validarCatalogo(catalog))
  const coverage = medirCobertura([candidate], catalog, [], new Date("2026-09-16T12:00:00Z"))
  assert.equal(coverage.covered, 1)
  assert.equal(coverage.recent_covered, 0, "intervalo que cruza o limite não comprova fala nos últimos 14 dias")
  assert.match(paginaCobertura(coverage, catalog), /Entre 02\/09\/2026 e 04\/09\/2026 \(dia exato não informado\)/)
  assert.equal(check({ occurred_on: "2026-09-04" }).quote, null)
  assert.equal(check({ occurred_between: { from: "2026-08-15", to: "2026-09-04" } }).quote, null)
  assert.equal(check({ occurred_between: { from: "2026-09-03", to: "2026-09-04" } }).quote, null)
  assert.equal(check({ occurred_between: { from: "2026-09-02", to: "2026-09-03" } }).quote, null)
  assert.equal(check({}, main.replace('property="article:published_time"', 'property="other"')).quote, null)
  assert.equal(check({}, main.replace(relationship, "A candidata Ana Silva apresentou propostas em entrevista.")).quote, null)
  assert.equal(verificarRevisao({ candidate, finding: ranged, html: main, supporting: new Map(), now }).quote, null)
  const accepted = result.quote
  assert.throws(() => validarCatalogo({ ...empty, quotes: [{ ...accepted, review_evidence: { ...accepted.review_evidence!, date_range_proof: undefined } }] }))
})

test("declaração em campanha mantém o contexto real e exige trecho original", () => {
  const context = "A candidata Ana Silva falou durante a panfletagem de campanha nesta terça-feira (8)."
  const source = html.replace("A candidata Ana Silva falou em entrevista nesta terça-feira (8).", context)
  const declaration: AchadoRevisado = { ...finding, event_context: "Declaração durante panfletagem de campanha", evidence: { ...finding.evidence, date_excerpt: context, declaration_context_excerpt: context } }
  const check = (value: AchadoRevisado) => verificarRevisao({ candidate, finding: value, html: source, now })
  const result = check(declaration)
  assert.ok(result.quote, result.reason)
  assert.equal(result.quote.event_type, "declaracao")
  assert.equal(result.quote.review_evidence?.declaration_context_excerpt, context)
  assert.doesNotThrow(() => validarCatalogo({ ...empty, quotes: [result.quote!] }))
  assert.equal(check({ ...declaration, evidence: { ...declaration.evidence, declaration_context_excerpt: "A candidata discursou em outro comício de campanha." } }).quote, null)
  assert.equal(check({ ...declaration, occurred_on: "2026-08-15" }).quote, null)
})

test("dia e mês explícitos resolvem ano recente sem substituir ano histórico", () => {
  assert.equal(dataEvento("realizada entre 29 e 31 de agosto", "2026-09-04T05:00:00Z", true), "2026-08-31")
  assert.equal(dataEvento("31 de agosto de 2022", "2026-09-04T05:00:00Z", true), "2022-08-31")
  assert.equal(dataEvento("31 de setembro", "2026-10-02T05:00:00Z", true), null)
  assert.equal(dataEvento("12 de setembro", "2026-09-04T05:00:00Z", true), null)
  assert.equal(dataEvento("1 de julho", "2026-09-04T05:00:00Z", true), null)
})

test("resposta a resultado permite intervalo a partir do encerramento da coleta", () => {
  const anchor = "A pesquisa foi realizada entre 29 e 31 de agosto."
  const relationship = "A candidata Ana Silva afirmou receber com gratidão o resultado da pesquisa."
  const ranged: AchadoRevisado = { ...finding, occurred_on: null, occurred_between: { from: "2026-08-31", to: "2026-09-04" }, article_published_at: "2026-09-04T11:00:00-03:00",
    evidence: { identity_excerpt: "A candidata Ana Silva", event_date_range: { anchor_url: finding.article_url, anchor_excerpt: anchor, anchor_published_at: "2026-09-04T11:00:00-03:00", relationship_excerpt: relationship } } }
  const source = `<head><link rel="canonical" href="${finding.article_url}"><meta property="article:published_time" content="${ranged.article_published_at}"></head><article><p>${anchor}</p><p>${relationship}</p><p>“${finding.quote_text}”, disse Ana Silva.</p></article>`
  const check = (r: AchadoRevisado, body = source) => verificarRevisao({ candidate, finding: r, html: body, supporting: new Map([[finding.article_url, body]]), now, mode: "initial_backfill" })
  const accepted = check(ranged).quote
  assert.ok(accepted)
  assert.doesNotThrow(() => validarCatalogo({ ...empty, quotes: [accepted] }))
  assert.equal(check({ ...ranged, occurred_on: "2026-09-04", occurred_between: undefined }).quote, null)
  assert.equal(check(ranged, source.replace(relationship, "A candidata Ana Silva apresentou propostas em entrevista.")).quote, null)
})

test("reações em reportagem eleitoral preservam intervalo e não inventam dia da resposta", () => {
  const anchor = "A discussão começou em 1º de setembro."
  const relationship = "Os episódios, em pleno período eleitoral, tiveram reações dos candidatos."
  const ranged: AchadoRevisado = { ...finding, event_context: "Declaração à reportagem sobre os episódios", occurred_on: null,
    occurred_between: { from: "2026-09-01", to: "2026-09-04" }, article_published_at: "2026-09-04T11:00:00-03:00",
    evidence: { identity_excerpt: "A candidata Ana Silva", declaration_context_excerpt: relationship,
      event_date_range: { anchor_url: finding.article_url, anchor_excerpt: anchor, anchor_published_at: "2026-09-04T11:00:00-03:00", relationship_excerpt: relationship } } }
  const source = `<head><link rel="canonical" href="${finding.article_url}"><meta property="article:published_time" content="${ranged.article_published_at}"></head><article><p>${anchor}</p><p>${relationship}</p><p>A candidata Ana Silva respondeu à reportagem.</p><p>“${finding.quote_text}”, disse Ana Silva.</p></article>`
  const check = (value: AchadoRevisado, body = source) => verificarRevisao({ candidate, finding: value, html: body, supporting: new Map([[finding.article_url, body]]), now })
  const accepted = check(ranged)
  assert.ok(accepted.quote, accepted.reason)
  assert.equal(accepted.quote.event_type, "declaracao")
  assert.equal(accepted.quote.occurred_on, null)
  assert.deepEqual(accepted.quote.occurred_between, { from: "2026-09-01", to: "2026-09-04" })
  assert.doesNotThrow(() => validarCatalogo({ ...empty, quotes: [accepted.quote!] }))
  assert.equal(check({ ...ranged, occurred_on: "2026-09-04", occurred_between: undefined }).quote, null)
  assert.equal(check(ranged, source.replace(relationship, "A matéria apresenta os candidatos.")).quote, null)
})

test("prova complementar textual conserva origem e rejeita URL, data e trecho divergentes", async () => {
  const url = "https://www.cnnbrasil.com.br/politica/perfil-ana/"
  const proof = { alias: "Delegada Ana", canonical_name: "Ana Silva", uf: "SP", article_url: url, identity_excerpt: "Ana Silva", alias_party_excerpt: "Delegada Ana", uf_excerpt: "São Paulo" }
  const changed = { ...finding, evidence: { ...finding.evidence, identity_excerpt: "Delegada Ana", identity_alias_evidence: [proof] } }
  const main = html.replace("A candidata Ana Silva", "A candidata Delegada Ana")
  const web: EvidenciaWeb = { format: "web_text", url, retrieved_at: "2026-09-11T11:00:00Z",
    raw: `Perfil\nContent type: text/html; Source: open(${JSON.stringify({ ref_id: url, lineno: null })}); Total lines: 2\nL0: Ana Silva, conhecida como Delegada Ana.\nL1: Candidata ao Governo de São Paulo.` }
  const result = await importarRevisao({ roster: [candidate], previous: empty, now,
    research: [{ candidates: [{ candidato_id: candidate.id, slug: candidate.slug, status: "verified", queries: ["Ana"], urls_consultadas: [finding.article_url], achados: [changed] }] }],
    webEvidence: new Map([[url, web]]), getText: async (requested) => { assert.equal(requested, finding.article_url); return { body: main } } })
  assert.equal(result.proposal.quotes.length, 1)
  assert.equal(result.proposal.quotes[0].review_evidence?.supporting_sources?.[0].source_format, "web_text")
  for (const invalid of [
    { ...web, url: "https://www.cnnbrasil.com.br/politica/outro/" },
    { ...web, retrieved_at: "2026-09-12T11:00:00Z" },
    { ...web, raw: web.raw.replace("Ana Silva", "Outra Pessoa") },
    { ...web, raw: "Resultado de busca: Ana Silva, Delegada Ana, São Paulo" },
  ]) assert.equal(verificarRevisao({ candidate, finding: changed, html: main, now, supportingWeb: new Map([[url, invalid]]) }).quote, null)
})

test("revisão confirma os três trechos no original e preserva contexto real", () => {
  const result = verificarRevisao({ candidate, finding, html, now })
  assert.equal(result.quote?.candidate_id, candidate.id)
  assert.equal(result.quote?.context, `“${finding.quote_text}”, disse a candidata.`)
  assert.equal(result.quote?.review_evidence?.date_excerpt, finding.evidence.date_excerpt)
})

test("legenda acessível da foto do artigo serve só para identidade", () => {
  const page = html.replace("A candidata Ana Silva", "A candidata").replace("<article>", '<article><img alt="Ana Silva">')
  const changed = { ...finding, evidence: { ...finding.evidence, identity_excerpt: "Ana Silva" } }
  assert.ok(verificarRevisao({ candidate, finding: changed, html: page, now }).quote)
  const onlyAlt = page.replace(finding.quote_text, "Outro conteúdo.").replace('alt="Ana Silva"', `alt="Ana Silva ${finding.quote_text}"`)
  assert.equal(verificarRevisao({ candidate, finding: changed, html: onlyAlt, now }).reason, "quote_not_literal_in_source")
  const outside = page.replace('<article><img alt="Ana Silva">', '<img alt="Ana Silva"><article>')
  assert.equal(verificarRevisao({ candidate, finding: changed, html: outside, now }).reason, "identity_excerpt_not_in_source")
})

test("revisão não promove aspa ausente, outro candidato nem data arbitrária", () => {
  for (const changed of [
    { ...finding, quote_text: "Uma frase que não está na matéria." },
    { ...finding, occurred_on: "2026-09-07" },
    { ...finding, evidence: { ...finding.evidence, identity_excerpt: "Outro nome" } },
    { ...finding, occurred_on: "2026-08-28" },
  ]) assert.equal(verificarRevisao({ candidate, finding: changed, html, now }).quote, null)
  assert.equal(verificarRevisao({ candidate: { ...candidate, nome_urna: "Bruno Lima", nome_completo: "Bruno Lima Santos" }, finding, html, now }).quote, null)
})

test("revisão rejeita autor explícito divergente no parágrafo da aspa", () => {
  const wrong = html.replace("disse a candidata", "disse o candidato Bruno Lima")
  assert.equal(verificarRevisao({ candidate, finding, html: wrong, now }).reason, "explicit_speaker_contradiction")
  const before = html.replace(`<p>“${finding.quote_text}”, disse a candidata.</p>`, `<p>Bruno Lima afirmou: “${finding.quote_text}”</p>`)
  assert.equal(verificarRevisao({ candidate, finding, html: before, now }).reason, "explicit_speaker_contradiction")
  const unverifiedAlias = { ...finding, evidence: { ...finding.evidence, identity_alias_evidence: [{ alias: "Bruno Lima", canonical_name: "Ana Silva", uf: "SP", article_url: finding.article_url, identity_excerpt: "Ana Silva", alias_party_excerpt: "Bruno Lima", uf_excerpt: "São Paulo" }] } }
  assert.equal(verificarRevisao({ candidate, finding: unverifiedAlias, html: wrong, now }).reason, "explicit_speaker_contradiction")
})

test("revisão rejeita data explícita divergente da entrevista que contém a aspa", () => {
  const wrong = html.replace(`<p>“${finding.quote_text}”, disse a candidata.</p>`, `<p>Em entrevista em 01/09/2026, Ana Silva afirmou: “${finding.quote_text}”.</p>`)
  assert.equal(verificarRevisao({ candidate, finding, html: wrong, now }).reason, "explicit_event_date_contradiction")
})

test("menções dentro da fala completa e contexto entre parágrafos não são contradições", () => {
  const nested = html.replace(`<p>“${finding.quote_text}”, disse a candidata.</p>`, `<p>“Bruno Lima afirmou: farei diferente. Na entrevista em 01/09/2026 ele prometeu muito. ${finding.quote_text}”, disse Ana Silva.</p>`)
  assert.ok(verificarRevisao({ candidate, finding, html: nested, now }).quote)
  assert.ok(verificarRevisao({ candidate, finding, html, now }).quote)
})

test("Informa Rondônia permite o bloco editorial de citação observado", () => {
  const adapted = { ...finding, article_url: "https://informarondonia.com.br/2026/09/08/debate/" }
  const page = html.replaceAll(finding.article_url, adapted.article_url).replace(`<p>“${finding.quote_text}”, disse a candidata.</p>`, `<div class="rema26x-quote">“${finding.quote_text}”, disse Ana Silva.</div>`)
  assert.ok(verificarRevisao({ candidate, finding: adapted, html: page, now }).quote)
})

test("data de exibição exige prova separada da data da fala", () => {
  const evidence = "divulgada nesta terça-feira (8)"
  const changed = { ...finding, evidence: { ...finding.evidence, date_excerpt: evidence } }
  assert.equal(verificarRevisao({ candidate, finding: changed, html: html.replace(finding.evidence.date_excerpt!, evidence), now }).reason, "broadcast_date_needs_event_corroboration")
})

test("datas jornalísticas respeitam calendário e virada do mês", () => {
  assert.equal(dataEvento("nesta segunda (31)", "2026-09-01"), "2026-08-31")
  assert.equal(dataEvento("nessa quinta-feira, 3", "2026-09-04"), "2026-09-03")
  assert.equal(dataEvento("nesta terça-feira (1º)", "2026-09-01"), "2026-09-01")
  assert.equal(dataEvento("nesta sexta-feira (8)", "2026-09-08"), null)
  assert.equal(dataEvento("na entrevista realizada ontem", "2026-09-01"), "2026-08-31")
  assert.equal(dataEvento("nesta terça-feira (1º/9)", "2026-09-01"), "2026-09-01")
  assert.equal(dataEvento("nesta quinta-feira (10.9)", "2026-09-10"), "2026-09-10")
  assert.equal(dataEvento("em 1º de setembro de 2026", "2026-09-02"), "2026-09-01")
  assert.equal(dataEvento("FORTALEZA: 10.09.2026: candidata Ana Silva, sabatina", "2026-09-10"), "2026-09-10")
  const header = { ...finding, evidence: { ...finding.evidence, date_excerpt: "08.09.2026 18:00" } }
  assert.equal(verificarRevisao({ candidate, finding: header, html: html.replace(finding.evidence.date_excerpt!, header.evidence.date_excerpt), now }).reason, "publication_timestamp_is_not_event_date")
})

test("fonte complementar precisa conter os trechos que comprovam nome e data", () => {
  const url = "https://www.cnnbrasil.com.br/politica/agenda-ana/"
  const proof = { alias: "Delegada Ana", canonical_name: "Ana Silva", uf: "SP", article_url: url, identity_excerpt: "Ana Silva", alias_party_excerpt: "A candidata Delegada Ana", uf_excerpt: "Governo de São Paulo" }
  const changed = { ...finding, evidence: { ...finding.evidence, identity_excerpt: "Delegada Ana", identity_alias_evidence: [proof] } }
  const source = "<p>Ana Silva, a Delegada Ana. A candidata Delegada Ana concorre ao Governo de São Paulo.</p>"
  const changedHtml = html.replace("A candidata Ana Silva", "A candidata Delegada Ana")
  assert.equal(verificarRevisao({ candidate, finding: changed, html: changedHtml, now }).quote, null)
  const verified = verificarRevisao({ candidate, finding: changed, html: changedHtml, now, supporting: new Map([[url, source]]) }).quote
  assert.equal(verified?.review_evidence?.supporting_sources?.[0].url, url)
  const broadcast = "divulgada nesta terça-feira (8)"
  const dateFinding = { ...finding, evidence: { ...finding.evidence, date_excerpt: broadcast,
    event_date_source: { article_url: url, article_published_at: finding.article_published_at, date_excerpt: "concedeu a entrevista nesta terça-feira (8)" } } }
  const dateHtml = html.replace(finding.evidence.date_excerpt!, broadcast)
  assert.equal(verificarRevisao({ candidate, finding: dateFinding, html: dateHtml, now }).quote, null)
  assert.ok(verificarRevisao({ candidate, finding: dateFinding, html: dateHtml, now, supporting: new Map([[url, "<p>Ana Silva concedeu a entrevista nesta terça-feira (8).</p>"]]) }).quote)
})

test("alias comprovado não identifica outro nome que apenas contém suas letras", () => {
  const url = "https://www.cnnbrasil.com.br/politica/perfil-ana/"
  const proof = { alias: "Ana", canonical_name: "Ana Silva", uf: "SP", article_url: url, identity_excerpt: "Ana Silva", alias_party_excerpt: "conhecida como Ana", uf_excerpt: "Governo de São Paulo" }
  const supporting = new Map([[url, "<p>Ana Silva, conhecida como Ana, disputa o Governo de São Paulo.</p>"]])
  const check = (name: string) => verificarRevisao({ candidate,
    finding: { ...finding, evidence: { ...finding.evidence, identity_excerpt: `A candidata ${name}`, identity_alias_evidence: [proof] } },
    html: html.replace("A candidata Ana Silva", `A candidata ${name}`), supporting, now })
  assert.equal(check("Mariana").reason, "identity_does_not_match_candidate")
  assert.equal(check("Anabela").reason, "identity_does_not_match_candidate")
  assert.ok(check("Ána").quote)
})

test("prova do alias exige nome canônico e apelido como palavras inteiras", () => {
  const url = "https://www.cnnbrasil.com.br/politica/perfil-ana/"
  const proof = { alias: "Delegada Ana", canonical_name: "Ana Silva", uf: "SP", article_url: url, identity_excerpt: "Ana Silva", alias_party_excerpt: "conhecida como Delegada Ana", uf_excerpt: "Governo de São Paulo" }
  for (const [changedProof, source] of [
    [{ ...proof, identity_excerpt: "Mariana Silva" }, "<p>Mariana Silva, conhecida como Delegada Ana, disputa o Governo de São Paulo.</p>"],
    [{ ...proof, alias_party_excerpt: "conhecida como Delegada Anabela" }, "<p>Ana Silva, conhecida como Delegada Anabela, disputa o Governo de São Paulo.</p>"],
  ] as const) {
    const result = verificarRevisao({ candidate, now,
      finding: { ...finding, evidence: { ...finding.evidence, identity_excerpt: "Delegada Ana", identity_alias_evidence: [changedProof] } },
      html: html.replace("A candidata Ana Silva", "A candidata Delegada Ana"), supporting: new Map([[url, source]]) })
    assert.equal(result.reason, "identity_does_not_match_candidate")
  }
})

test("fonte da data exige o nome ou alias como sequência inteira de palavras", () => {
  const profileUrl = "https://www.cnnbrasil.com.br/politica/perfil-ana/"
  const dateUrl = "https://www.cnnbrasil.com.br/politica/agenda-ana/"
  const proof = { alias: "Delegada Ana", canonical_name: "Ana Silva", uf: "SP", article_url: profileUrl, identity_excerpt: "Ana Silva", alias_party_excerpt: "Delegada Ana", uf_excerpt: "Governo de São Paulo" }
  const dateExcerpt = "concedeu entrevista nesta terça-feira (8)"
  const dated = { ...finding, evidence: { ...finding.evidence, identity_alias_evidence: [proof],
    event_date_source: { article_url: dateUrl, article_published_at: finding.article_published_at, date_excerpt: dateExcerpt } } }
  const check = (name: string) => verificarRevisao({ candidate, finding: dated, html, now, supporting: new Map([
    [profileUrl, "<p>Ana Silva, conhecida como Delegada Ana, disputa o Governo de São Paulo.</p>"],
    [dateUrl, `<p>${name} ${dateExcerpt}.</p>`],
  ]) })
  assert.equal(check("Mariana Silva").reason, "event_source_identity_not_verified")
  assert.equal(check("Delegada Anabela").reason, "event_source_identity_not_verified")
  assert.ok(check("Ana Silva").quote)
  assert.ok(check("Delegada Ána").quote)
})

test("fonte da data pode usar alias comprovado mesmo quando a matéria usa o nome completo", async () => {
  const profileUrl = "https://www.cnnbrasil.com.br/politica/perfil-ana/"
  const dateUrl = "https://www.cnnbrasil.com.br/politica/agenda-ana/"
  const proof = { alias: "Delegada Ana", canonical_name: "Ana Silva", uf: "SP", article_url: profileUrl, identity_excerpt: "Ana Silva", alias_party_excerpt: "Delegada Ana", uf_excerpt: "Governo de São Paulo" }
  const dated = { ...finding, evidence: { ...finding.evidence, identity_alias_evidence: [proof], event_date_source: { article_url: dateUrl, article_published_at: finding.article_published_at, date_excerpt: "Delegada Ana concedeu entrevista nesta terça-feira (8)." } } }
  const pages = new Map([[finding.article_url, html], [profileUrl, "<p>Ana Silva, conhecida como Delegada Ana, disputa o Governo de São Paulo.</p>"], [dateUrl, "<p>Delegada Ana concedeu entrevista nesta terça-feira (8).</p>"]])
  const research = [{ candidates: [{ candidato_id: candidate.id, slug: candidate.slug, status: "verified", queries: ["consulta"], urls_consultadas: [...pages.keys()], achados: [dated] }] }]
  const imported = await importarRevisao({ roster: [candidate], previous: empty, research, now, getText: async (url) => ({ body: pages.get(url)! }) })
  assert.equal(imported.proposal.quotes.length, 1)
  assert.equal(verificarRevisao({ candidate, finding: { ...dated, evidence: { ...dated.evidence, identity_alias_evidence: [] } }, html, now, supporting: pages }).reason, "event_source_identity_not_verified")
  assert.equal(verificarRevisao({ candidate, finding: { ...dated, evidence: { ...dated.evidence, identity_alias_evidence: [{ ...proof, uf: "RJ" }] } }, html, now, supporting: pages }).reason, "event_source_identity_not_verified")
})

test("buscar todos não significa ter aspas para todos; bloqueio não conta como busca concluída", () => {
  const quote = verificarRevisao({ candidate, finding, html, now }).quote!
  const second = { ...candidate, id: "id-b", slug: "bruno" }
  const coverage = medirCobertura([candidate, second], { ...empty, quotes: [quote] }, [
    { candidate_id: candidate.id, queries: ["Ana entrevista"], urls: [], status: "searched", errors: [] },
    { candidate_id: second.id, queries: ["Bruno entrevista"], urls: [], status: "blocked", errors: ["fonte bloqueada"] },
  ], now)
  assert.equal(coverage.covered, 1)
  assert.equal(coverage.missing, 1)
  assert.equal(coverage.coverage_complete, false)
  assert.equal(coverage.search_attempted_for_all, true)
  assert.equal(coverage.search_complete, false)
})

test("importação é repetível, exige identidade id+slug e mantém fonte indisponível pendente", async () => {
  const research = [{ candidates: [{ candidato_id: candidate.id, slug: candidate.slug, status: "verified", queries: ["consulta"], urls_consultadas: [finding.article_url], achados: [finding] }] }]
  const input = { roster: [candidate], previous: empty, research, now, getText: async () => ({ body: html }) }
  const first = await importarRevisao(input)
  const replay = await importarRevisao({ ...input, previous: first.proposal })
  assert.deepEqual(first.proposal, replay.proposal)
  const blocked = await importarRevisao({ ...input, getText: async () => { throw new Error("HTTP 403") } })
  assert.equal(blocked.proposal.quotes.length, 0)
  assert.equal(blocked.receipts[0].status, "pending")
  assert.ok(blocked.coverage.candidates[0].errors.some((reason) => reason.includes("HTTP 403")))
  await assert.rejects(importarRevisao({ ...input, roster: [{ ...candidate, slug: "diferente" }] }), /Identidade divergente/)
})

test("relatório preserva motivo da pendência e escapa texto da pesquisa", async () => {
  const note = "Vídeo sem transcrição <script>alert(1)</script>"
  const result = await importarRevisao({ roster: [candidate], previous: empty, now,
    research: [{ candidates: [{ candidato_id: candidate.id, slug: candidate.slug, status: "searched_without_verified_quote", queries: ["Ana entrevista"], urls_consultadas: [finding.article_url], achados: [], review_notes: [note] }] }],
    getText: async () => { throw new Error("Nenhuma fonte deve ser carregada sem achado revisado") } })
  assert.deepEqual(result.coverage.candidates[0].errors, [note])
  const page = paginaCobertura(result.coverage, result.proposal)
  assert.ok(page.includes("Motivos registrados para a pendência"))
  assert.ok(page.includes("Vídeo sem transcrição &lt;script&gt;alert(1)&lt;/script&gt;"))
  assert.equal(page.includes(note), false)
  assert.equal(result.coverage.coverage_complete, false)
})

test("aspa do título exige marcação explícita, aspas completas e candidato nomeado", () => {
  const headline = `“${finding.quote_text}”, diz Ana Silva em entrevista`
  const source = html.replace(`<p>“${finding.quote_text}”, disse a candidata.</p>`, `<h2>${headline}</h2>`)
  const changed: AchadoRevisado = { ...finding, article_title: headline, evidence: { ...finding.evidence, quote_location: "headline" } }
  assert.equal(verificarRevisao({ candidate, finding: changed, html: source, now }).quote?.review_evidence?.quote_location, "headline")
  assert.equal(verificarRevisao({ candidate, finding: { ...changed, evidence: finding.evidence }, html: source, now }).reason, "quote_not_in_article_paragraph")
  for (const bad of [headline.replace("Ana Silva", "Bruno Lima"), headline.replace(/[“”]/g, ""), headline.replace(", diz Ana Silva em entrevista", "")]) {
    assert.equal(verificarRevisao({ candidate, finding: { ...changed, article_title: bad }, html: source.replace(headline, bad), now }).reason, "headline_quote_not_explicitly_attributed")
  }
  const web: EvidenciaWeb = { format: "web_text", url: finding.article_url, retrieved_at: "2026-09-11T11:00:00Z",
    raw: `Content type: text/html; Source: open(${JSON.stringify({ ref_id: finding.article_url, lineno: null })}); Total lines: 2\nL0: ## ${headline}\nL1: ${finding.evidence.identity_excerpt} falou ${finding.evidence.date_excerpt}.` }
  assert.ok(verificarRevisao({ candidate, finding: changed, html: "", webText: web, now }).quote)
  assert.equal(verificarRevisao({ candidate, finding: { ...changed, evidence: finding.evidence }, html: "", webText: web, now }).reason, "quote_not_in_article_paragraph")
})
