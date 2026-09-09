import assert from "node:assert/strict"
import test from "node:test"
import { criarClienteHttpMonitoramento } from "../scripts/lib/pesquisas-monitoramento-rede"
import { consultarRegistroPesqele, parseDetalhePesqele, PESQELE_ORIGIN } from "../scripts/lib/pesquisas-monitoramento-pesqele"
import { extrairListaCompletaPrimeiroTurno, parsePublicacaoMonitorada } from "../scripts/lib/pesquisas-monitoramento-adapters"
import { avaliarEvidenciaAoVivo, listarAlvosMonitoramento, obterContratoFonte } from "../scripts/lib/pesquisas-monitoramento"

const searchUrl = `${PESQELE_ORIGIN}/app/pesquisa/listar.xhtml`
const detailsUrl = `${PESQELE_ORIGIN}/app/pesquisa/detalhar.xhtml`
const detailHtml = `<h4>Visualizar Pesquisa Eleitoral - AM-09965/2026</h4><h5>AMAZONAS</h5>
<table id="form:camposPesquisa"><tr>
<td>N&#250;mero de identifica&#231;&#227;o:</td><td>AM-09965/2026</td>
<td>Cargo(s):</td><td>Governador, Senador</td>
<td>Empresa contratada/ Nome Fantasia:</td><td>REAL TIME MIDIA LTDA / REAL TIME BIG DATA</td>
<td>Entrevistados:</td><td>1600</td>
<td>Data de início da pesquisa:</td><td>21/08/2026</td>
<td>Data de término da pesquisa:</td><td>25/08/2026</td>
<td>Data de divulgação:</td><td>26/08/2026</td>
</tr></table>
<div>Metodologia de pesquisa:</div><div>Entrevistas por abordagens telefônicas e digitais.</div>
<div>Plano amostral</div><div>O nível de confiança estimado é de 95% e a margem de erro máxima estimada é de aproximadamente 2 (dois) pontos percentuais.</div>
<input name="javax.faces.ViewState" value="private-transient-state"><script>UNTRUSTED_SCRIPT</script>`

test("metadados do PesqEle preservam campos, procedencia e texto publico sem estado de sessao", () => {
  const result = parseDetalhePesqele(detailHtml, "AM-09965/2026", "2026-09-09T12:00:00Z")
  assert.deepEqual(result.registry, {
    registration_id: "AM-09965/2026", office: "Governador, Senador", geography: "AMAZONAS",
    field_start: "2026-08-21", field_end: "2026-08-25", sample_size: 1600, margin_error_pp: 2,
    institute: "REAL TIME MIDIA LTDA / REAL TIME BIG DATA",
  })
  assert.equal(result.confidence_percent, 95)
  assert.equal(result.source_url, searchUrl)
  assert.match(result.evidence_sha256, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(result.public_text, /private-transient-state|UNTRUSTED_SCRIPT/)
})

for (const transform of [
  (html: string) => html.replaceAll("AM-09965/2026", "RS-09965/2026"),
  (html: string) => html.replace("21/08/2026", "32/08/2026"),
  (html: string) => html.replace("25/08/2026", "27/08/2026"),
  (html: string) => html.replace("95%", "100%"),
  (html: string) => html.replace("1600", "0"),
]) {
  test("registro conflitante ou metadado invalido nao e aceito", () => {
    assert.throws(() => parseDetalhePesqele(transform(detailHtml), "AM-09965/2026", "2026-09-09T12:00:00Z"))
  })
}

test("consulta encadeia apenas busca e detalhes, sem anexos, preservando cookie por origem", async () => {
  const calls: Array<{ url: string; method: string; cookie: string | null }> = []
  let postCount = 0
  const client = criarClienteHttpMonitoramento({
    allowedOrigins: [PESQELE_ORIGIN, "https://other.example"], allowedFormUrls: [searchUrl], sessionCookieNames: ["JSESSIONID"], minIntervalMs: 0,
    fetchImpl: async (input, init) => {
      const url = String(input)
      const headers = new Headers(init?.headers)
      calls.push({ url, method: init?.method ?? "GET", cookie: headers.get("cookie") })
      if (url.endsWith("robots.txt")) return new Response(null, { status: 404 })
      if (url.startsWith("https://other.example")) return new Response("public")
      if (url === detailsUrl) return new Response(detailHtml)
      if (init?.method === "POST") {
        assert.equal(headers.get("cookie"), "JSESSIONID=ephemeral")
        const data = new URLSearchParams(String(init.body))
        assert.equal(data.get("formPesquisa:eleicoes_input"), "2026-dynamic-value")
        postCount++
        if (postCount === 1) {
          assert.equal(data.get("formPesquisa:campoRegistro"), "AM099652026")
          return new Response(`<partial-response><update id="formPesquisa"><![CDATA[AM-09965/2026<a id="formPesquisa:tabelaPesquisas:0:detalhar">Detalhes</a>]]></update><update id="javax.faces.ViewState"><![CDATA[updated-state]]></update></partial-response>`)
        }
        assert.equal(data.get("javax.faces.ViewState"), "updated-state")
        return new Response(`<partial-response><redirect url="/app/pesquisa/detalhar.xhtml"/></partial-response>`)
      }
      return new Response(`<form id="formPesquisa"><select name="formPesquisa:eleicoes_input"><option value="2026-dynamic-value">Elei&#231;&#245;es Gerais 2026</option></select><input id="formPesquisa:campoRegistro" placeholder="Informe o número"><input name="javax.faces.ViewState" value="initial-state"></form>`, { headers: { "set-cookie": "JSESSIONID=ephemeral; Path=/; Secure; HttpOnly" } })
    },
  })
  const result = await consultarRegistroPesqele("AM-09965/2026", client)
  assert.equal(result.registry.sample_size, 1600)
  assert.equal(postCount, 2)
  await client.getText("https://other.example/public")
  assert.equal(calls.find((call) => call.url === "https://other.example/public")?.cookie, null)
  await assert.rejects(client.postForm(detailsUrl, {}), /formulario fora da allowlist/)
})

test("texto ISO-8859-1 e decodificado sem corromper nomes e metadados", async () => {
  const client = criarClienteHttpMonitoramento({
    allowedOrigins: [PESQELE_ORIGIN], minIntervalMs: 0,
    fetchImpl: async (input) => String(input).endsWith("robots.txt") ? new Response("") : new Response(Buffer.from("eleição", "latin1"), { headers: { "content-type": "text/html;charset=ISO-8859-1" } }),
  })
  assert.equal((await client.getText(searchUrl)).body, "eleição")
})

test("formulario nao segue redirect HTTP nem transmite campos a outro destino", async () => {
  const calls: string[] = []
  const client = criarClienteHttpMonitoramento({
    allowedOrigins: [PESQELE_ORIGIN], allowedFormUrls: [searchUrl], minIntervalMs: 0,
    fetchImpl: async (input) => {
      calls.push(String(input))
      return String(input).endsWith("robots.txt") ? new Response("") : new Response(null, { status: 307, headers: { location: "https://other.example/collect" } })
    },
  })
  await assert.rejects(client.postForm(searchUrl, { private: "state" }), /formulario nao pode redirecionar/)
  assert.deepEqual(calls, [`${PESQELE_ORIGIN}/robots.txt`, searchUrl])
})

const fullList = `<p>Cenário estimulado de primeiro turno para governador do Amazonas.</p><ul>
<li><b>Omar Aziz (PSD)</b>: 34%</li><li><b>Roberto Cidade (União Brasil)</b>: 22%</li>
<li><b>Professora Maria do Carmo (PL)</b>: 21%</li><li><b>David Almeida (Avante)</b>: 14%</li>
<li><b>Cabo Daciolo (Mobiliza)</b>: 4%</li><li><b>Outros</b>: 1%</li><li><b>Nulo/Branco</b>: 2%</li>
<li><b>Não sabe/Não respondeu (NS/NR)</b>: 2%</li></ul>`
const sourceHtml = `<meta property="article:published_time" content="2026-08-26"><article>
<p>Real Time Big Data para governador do Amazonas. A pesquisa foi realizada entre 21 e 25 de agosto de 2026, com 1.600 eleitores.</p>
<p>Registro AM-09965/2026. Margem de erro de 2 pontos percentuais.</p>${fullList}</article>`

test("lista completa preserva cinco candidatos e categorias sem misturar segundo turno", () => {
  const second = `<p>Segundo turno</p><ul><li>Omar Aziz (PSD): 55%</li><li>Roberto Cidade (União Brasil): 45%</li></ul>`
  const result = extrairListaCompletaPrimeiroTurno(fullList + second)
  assert.equal(result?.length, 8)
  assert.deepEqual(result?.map((row) => row.value_percent), [34, 22, 21, 14, 4, 1, 2, 2])
  assert.equal(result?.[4].raw_label, "Cabo Daciolo (Mobiliza)")
})

test("lista incompleta, linhas duplicadas e cenarios ambiguos falham", () => {
  assert.throws(() => extrairListaCompletaPrimeiroTurno(fullList.replace('<li><b>Cabo Daciolo (Mobiliza)</b>: 4%</li>', '')), /incompleto/)
  assert.throws(() => extrairListaCompletaPrimeiroTurno(fullList.replace('Outros', 'Nulo/Branco')), /duplicado/)
  assert.throws(() => extrairListaCompletaPrimeiroTurno(fullList + fullList), /ambíguos/)
})

test("metadados ausentes usam somente registro conciliado e nomes nao vinculados ficam preservados", () => {
  const target = listarAlvosMonitoramento({ sourceId: "real-time-big-data-estaduais-2026", uf: "AM" })[0]
  const source = obterContratoFonte(target.source_id)
  const observedAt = "2026-09-09T12:00:00Z"
  const registrySupplement = parseDetalhePesqele(detailHtml, target.registration_id, observedAt)
  const input = { html: sourceHtml, target, source, observedAt, registrySupplement }
  const evidence = parsePublicacaoMonitorada(input)
  assert.equal(evidence.confidence_percent, 95)
  assert.equal(evidence.method, "abordagens telefônicas e digitais")
  assert.equal(evidence.scenario_complete, true)
  assert.equal(evidence.results.length, 8)
  assert.equal(evidence.results[7].match_status, "not_candidate")
  const result = avaliarEvidenciaAoVivo({ ...input, registry: [registrySupplement.registry] })
  assert.equal(result.decision.reason, "identity_unresolved")
  assert.equal(result.evidence?.results[4].value_percent, 4)
  assert.equal(avaliarEvidenciaAoVivo(input).decision.reason, "registry_conflict", "nenhum registro pode ser fabricado a partir da matéria")
  assert.throws(() => parsePublicacaoMonitorada({ ...input, registrySupplement: undefined }), /confiança ausente/)
  assert.throws(() => parsePublicacaoMonitorada({ ...input, registrySupplement: { ...registrySupplement, registry: { ...registrySupplement.registry, geography: "RS" } } }), /conflitantes/)
})
