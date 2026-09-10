import assert from "node:assert/strict"
import test from "node:test"
import { construirCoberturaDescoberta, descobrirPublicacoesPesquisas, LISTAGENS_PESQUISAS, type ObservacaoListagemPesquisas } from "../scripts/lib/pesquisas-monitoramento-descoberta"
import { validarEntradasDescobertas } from "../scripts/lib/pesquisas-monitoramento-entrada"
import { criarOrcamentoDescoberta, descobrirRegistrosPesqele, GEOGRAFIAS_DESCOBERTA, parsePaginaRegistrosPesqele, PESQELE_ORIGIN, type ObservacaoPesqele } from "../scripts/lib/pesquisas-monitoramento-pesqele"
import type { ClienteHttpMonitoramento } from "../scripts/lib/pesquisas-monitoramento-rede"
import { getEstadoNome } from "../src/lib/br-uf"

// Synthetic protocol fixtures, not evidence of actual registrations or vote results.
const stamp = "2026-09-09T12:00:00Z"
const geoName = (uf: string) => uf === "BR" ? "BRASIL" : getEstadoNome(uf)!.toUpperCase()
const form = `<form id="formPesquisa"><select name="formPesquisa:eleicoes_input"><option value="dynamic-election">Eleições Gerais 2026</option></select><select name="formPesquisa:filtroUF_input">${GEOGRAFIAS_DESCOBERTA.map(uf => `<option value="${uf}">${geoName(uf)}</option>`).join("")}</select><label>Período de registro:</label><span class="ui-calendar"><input name="formPesquisa:dateA" /></span><span class="ui-calendar"><input name="formPesquisa:dateB" /></span><input name="javax.faces.ViewState" value="PRIVATE-STATE" /></form>`
function page(uf = "BR", offset = 0, total = 3, ids?: string[]) {
  const rows = Array.from({ length: Math.min(2, total - offset) }, (_, index) => `<tr data-ri="${offset + index}"><td>${ids?.[index] ?? `${uf}-${String(offset + index + 1).padStart(5, "0")}/2026`}</td><td>Eleições Gerais 2026</td><td>PoderData</td><td>28/08/2026</td><td>${geoName(uf)}</td><td>Detalhes</td></tr>`).join("")
  return `<partial-response><update id="formPesquisa:tabelaPesquisas"><![CDATA[${rows}${offset === 0 ? `<script>paginator:{rows:2,rowCount:${total},page:0}</script>` : ""}]]></update><update id="javax.faces.ViewState"><![CDATA[PRIVATE-UPDATED]]></update></partial-response>`
}
const parserInput = { geography: "BR", dateFrom: "2026-08-28", dateTo: "2026-08-28", offset: 0, observedAt: stamp }
function simulated(options: { expire?: boolean; alwaysExpire?: boolean; failedUf?: string; total?: number; duplicate?: boolean } = {}) {
  const calls: Array<{ url: string; fields: URLSearchParams; cookie: string | null }> = []
  let expired = false
  let sessions = 0
  const budget = criarOrcamentoDescoberta({ maxDurationMs: 60_000, fetchImpl: async (url, init) => {
    const fields = new URLSearchParams(String(init?.body ?? ""))
    calls.push({ url: String(url), fields, cookie: new Headers(init?.headers).get("cookie") })
    if (String(url).endsWith("robots.txt")) return new Response("")
    if (init?.method !== "POST") return new Response(form, { headers: { "set-cookie": `JSESSIONID=PRIVATE-COOKIE-${++sessions}; Secure` } })
    assert.equal(fields.get("formPesquisa:eleicoes_input"), "dynamic-election")
    assert.equal(fields.get("formPesquisa:dateA"), "28/08/2026")
    assert.equal(fields.get("formPesquisa:dateB"), "28/08/2026")
    const uf = fields.get("formPesquisa:filtroUF_input")!
    if (uf === options.failedUf) return new Response("denied", { status: 403 })
    const offset = Number(fields.get("formPesquisa:tabelaPesquisas_first") ?? 0)
    if (offset) {
      assert.equal(fields.get("javax.faces.ViewState"), "PRIVATE-UPDATED")
      assert.equal(fields.get("formPesquisa:idBtnPesquisar"), null)
      assert.equal(fields.get("formPesquisa:tabelaPesquisas_rows"), "2")
      if (options.alwaysExpire || (options.expire && !expired)) { expired = true; return new Response("<error>javax.faces.application.ViewExpiredException</error>") }
    }
    return new Response(page(uf, offset, options.total ?? 3, options.duplicate && offset ? [`${uf}-00001/2026`] : undefined))
  } })
  return { budget, calls }
}

test("parser reconhece tabela, valida filtros e não confunde formulário com coleta", () => {
  const first = parsePaginaRegistrosPesqele(page(), parserInput)
  assert.equal(first.records.length, 2)
  assert.equal(first.total_reported, 3)
  assert.doesNotMatch(JSON.stringify(first), /PRIVATE|ViewState|cookie/)
  for (const bad of [form, page("AM"), page().replaceAll("28/08/2026", "29/08/2026"), page().replace('data-ri="0"', 'data-ri="10"')]) assert.throws(() => parsePaginaRegistrosPesqele(bad, parserInput))
  assert.throws(() => parsePaginaRegistrosPesqele("<html>nada</html>", parserInput))
})

test("vazio só é reconhecido em tabela explícita e nunca comprova ausência", () => {
  const result = parsePaginaRegistrosPesqele('<tr class="ui-datatable-empty-message"><td>Nenhum registro encontrado</td></tr>', parserInput)
  assert.equal(result.total_reported, 0)
  assert.throws(() => parsePaginaRegistrosPesqele("Nenhum registro encontrado", parserInput))
})

test("múltiplas páginas e recuperação de sessão preservam registros e recibos sem segredos", async () => {
  const fixture = simulated({ expire: true })
  const result = await descobrirRegistrosPesqele({ ...{ dateFrom: parserInput.dateFrom, dateTo: parserInput.dateTo }, geographies: ["BR"], budget: fixture.budget })
  const br = result.geographies[0]
  assert.equal(result.geographies.length, 28)
  assert.equal(br.status, "observed")
  assert.equal(br.session_restarts, 1)
  assert.equal(br.records.length, 3)
  assert.deepEqual(br.pages.map(p => p.offset), [0, 0, 2])
  assert.equal(br.query_exhausted, true)
  assert.equal(result.geographies.every(g => g.absence_of_poll_confirmed === false), true)
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|ViewState|JSESSIONID/)
  const posts = fixture.calls.filter(c => c.fields.has("formPesquisa"))
  assert.equal(posts[0].cookie, "JSESSIONID=PRIVATE-COOKIE-1")
  assert.equal(posts[2].cookie, "JSESSIONID=PRIVATE-COOKIE-2")
})

test("falha de uma UF não apaga outras e nova rodada recupera idempotentemente", async () => {
  const args = { dateFrom: parserInput.dateFrom, dateTo: parserInput.dateTo, geographies: ["AC", "AM"] }
  const failed = await descobrirRegistrosPesqele({ ...args, budget: simulated({ failedUf: "AC", total: 1 }).budget })
  assert.equal(failed.geographies.find(g => g.geography_code === "AC")?.status, "failed")
  assert.equal(failed.geographies.find(g => g.geography_code === "AM")?.records.length, 1)
  const recovered = await descobrirRegistrosPesqele({ ...args, budget: simulated({ total: 1 }).budget })
  assert.equal(recovered.geographies.find(g => g.geography_code === "AC")?.status, "observed")
  assert.deepEqual(recovered.geographies.find(g => g.geography_code === "AM")?.records.map(r => [r.registration_id, r.evidence_sha256]), failed.geographies.find(g => g.geography_code === "AM")?.records.map(r => [r.registration_id, r.evidence_sha256]))
})

test("duplicatas e teto de 50 mantêm inventário parcial", async () => {
  for (const options of [{ duplicate: true }, { total: 50 }]) {
    const result = await descobrirRegistrosPesqele({ dateFrom: parserInput.dateFrom, dateTo: parserInput.dateTo, geographies: ["BR"], maxPagesPerGeography: 2, budget: simulated(options).budget })
    assert.equal(result.geographies[0].status, "partial")
    assert.equal(result.geographies[0].query_exhausted, false)
    assert.ok(result.geographies[0].errors.length)
    if (options.duplicate) assert.equal(result.geographies[0].records.length, 2)
    else assert.match(result.geographies[0].errors.join(" "), /50 registros/)
  }
})

test("segunda expiração encerra tentativa e preserva prova parcial", async () => {
  const fixture = simulated({ alwaysExpire: true })
  const result = await descobrirRegistrosPesqele({ dateFrom: parserInput.dateFrom, dateTo: parserInput.dateTo, geographies: ["BR"], budget: fixture.budget })
  assert.equal(result.geographies[0].session_restarts, 1)
  assert.equal(result.geographies[0].status, "partial")
  assert.equal(result.geographies[0].records.length, 2)
  assert.equal(result.geographies[0].query_exhausted, false)
  assert.match(result.geographies[0].errors.join(" "), /sessão expirada/)
  assert.equal(fixture.calls.filter(call => call.fields.has("formPesquisa")).length, 4)
})

test("limites incluem robots, corpo, tempo e concorrência", async () => {
  let calls = 0
  const requests = criarOrcamentoDescoberta({ maxRequests: 1, fetchImpl: async () => { calls++; return new Response("") } })
  await assert.rejects(requests.client([PESQELE_ORIGIN]).getText(`${PESQELE_ORIGIN}/public`), /limite de chamadas/)
  assert.equal(calls, 1)
  const bytes = criarOrcamentoDescoberta({ maxBytes: 8, fetchImpl: async () => new Response("123456789") })
  await assert.rejects(bytes.client([PESQELE_ORIGIN]).getText(`${PESQELE_ORIGIN}/public`), /limite de bytes/)
  const timeout = criarOrcamentoDescoberta({ maxDurationMs: 5 })
  await new Promise(resolve => setTimeout(resolve, 10))
  await assert.rejects(timeout.client([PESQELE_ORIGIN]).getText(`${PESQELE_ORIGIN}/public`), /limite de tempo/)
  const serial = criarOrcamentoDescoberta({ fetchImpl: async () => { await new Promise(resolve => setTimeout(resolve, 30)); return new Response("") } })
  const attempts = await Promise.allSettled([serial.client([PESQELE_ORIGIN]).getText(`${PESQELE_ORIGIN}/public`), serial.client([PESQELE_ORIGIN]).getText(`${PESQELE_ORIGIN}/public`)])
  assert.equal(attempts.filter(result => result.status === "rejected" && /concorrência/.test(String(result.reason))).length, 1)
})

const listing = LISTAGENS_PESQUISAS[1]
const urlA = `${listing.url}pesquisa-a/`
const urlB = `${listing.url}pesquisa-b/`
const observations = (urls = [urlA, urlB]): ObservacaoListagemPesquisas[] => [{ id: listing.id, url: listing.url, observed_at: stamp, status: "observed", evidence_sha256: "a".repeat(64), error: null, links: urls.map(url => ({ url, title: "PoderData: Lula lidera intenções de voto", listing_id: listing.id, geography_hint: "BR", office_hint: "Presidente", state: "pending_validation" })) }]
const clientWith = (body: (url: string) => string): ClienteHttpMonitoramento => ({ getText: async url => ({ body: body(url), status: 200, observedAt: stamp }), getBytes: async () => { throw new Error("unused") }, postForm: async () => { throw new Error("unused") } })
const official: ObservacaoPesqele = { registry: { registration_id: "BR-00001/2026", office: "Presidente", geography: "BRASIL", field_start: "2026-08-27", field_end: "2026-08-28", sample_size: 1000, margin_error_pp: 2, institute: "PoderData" }, confidence_percent: 95, method: "telefone", publication_date: "2026-08-29", source_url: `${PESQELE_ORIGIN}/app/pesquisa/listar.xhtml`, observed_at: stamp, evidence_sha256: "b".repeat(64), public_text: "Fixture sintética" }

test("publicações seguem página exposta; ciclos e limite não viram sucesso de cobertura", async () => {
  const urls: string[] = []
  const result = await descobrirPublicacoesPesquisas({ knownUrls: new Set(), sourceId: listing.source_ids[0], maxPagesPerListing: 2, client: clientWith(url => {
    urls.push(url)
    return `<a href="${url === listing.url ? urlA : urlB}">PoderData: Lula lidera intenções de voto</a><a rel="next" href="${listing.url}page/${url === listing.url ? 2 : 3}/">Próxima</a>`
  }) })
  assert.deepEqual(urls, [listing.url, `${listing.url}page/2/`])
  assert.equal(result[1].links[0].url, urlB)
  assert.equal(result[1].pagination_status, "limit_reached")
  assert.equal(result[1].status, "partial", "consumidores atuais rejeitam status diferente de observed")
  assert.equal(construirCoberturaDescoberta({ observations: result, targets: [] })[0].coverage_status, "gap_or_failure")
})

test("paginação externa e ciclo param na listagem aprovada", async () => {
  for (const next of ["https://outside.example/poderdata/page/2/", listing.url]) {
    let calls = 0
    const result = await descobrirPublicacoesPesquisas({ knownUrls: new Set(), sourceId: listing.source_ids[0], client: clientWith(() => { calls++; return `<a href="${urlA}">PoderData: Lula lidera intenções de voto</a><a rel="next" href="${next}">Próxima</a>` }) })
    assert.equal(calls, 1)
    assert.ok(result[0].error)
  }
})

test("cruzamento exato preserva complementares e retificações, sem promover percentuais", async () => {
  const result = await validarEntradasDescobertas({ observations: observations(), knownTargets: [], client: clientWith(() => "<article>BR-00001/2026</article>"), queryRegistry: async () => official })
  assert.equal(result.targets.length, 1)
  const repeat = observations()
  repeat[0].links.reverse().forEach(link => { link.state = "known_url" })
  const retification = await validarEntradasDescobertas({ observations: repeat, knownTargets: result.targets, client: clientWith(() => "<article>BR-00001/2026 retificado</article>"), queryRegistry: async () => official })
  assert.deepEqual(retification.targets, result.targets)
  assert.notEqual(retification.entries[0].source_sha256, result.entries[0].source_sha256)
  assert.equal(retification.entries[0].known_url_rechecked, true)
  const coverage = construirCoberturaDescoberta({ observations: repeat, targets: result.targets, entries: retification.entries })
  assert.equal(coverage.length, 28)
  assert.equal(coverage[0].publications_located.length, 2)
  assert.equal(coverage[0].validated_results.length, 0)
  assert.equal(coverage.every(item => !item.absence_of_poll_confirmed), true)
})

test("complementar sem registro é exceção explícita; regional não vira nacional", async () => {
  let queries = 0
  const noId = await validarEntradasDescobertas({ observations: observations([urlA]), knownTargets: [], client: clientWith(() => "<article>Dados por idade</article>"), queryRegistry: async () => { queries++; return official } })
  assert.equal(queries, 0)
  assert.equal(noId.entries[0].status, "blocked", "consumidores atuais continuam preservando o alerta")
  assert.equal(noId.entries[0].classification, "discovery_exception")
  assert.equal(noId.entries[0].registration_id, undefined)
  const coverage = construirCoberturaDescoberta({ observations: observations([urlA]), targets: [], entries: noId.entries })
  assert.equal(coverage[0].coverage_status, "gap_or_failure")
  assert.equal(coverage[0].discovery_exceptions.length, 1)
  const regional = await validarEntradasDescobertas({ observations: observations([urlA]), knownTargets: [], client: clientWith(() => "BR-00001/2026"), queryRegistry: async () => ({ ...official, registry: { ...official.registry, geography: "BAHIA" } }) })
  assert.equal(regional.targets.length, 0)
  assert.equal(regional.entries[0].status, "blocked")
  const wrongInstitute = await validarEntradasDescobertas({ observations: observations([urlA]), knownTargets: [], client: clientWith(() => "BR-00001/2026"), queryRegistry: async () => ({ ...official, registry: { ...official.registry, institute: "Instituto não aprovado" } }) })
  assert.equal(wrongInstitute.targets.length, 0)
  assert.match(wrongInstitute.entries[0].reason, /instituto/)
})
