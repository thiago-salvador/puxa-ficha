import "./helpers/server-only"
import assert from "node:assert/strict"
import test from "node:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { criarClienteHttpMonitoramento } from "../scripts/lib/pesquisas-monitoramento-rede"
import { consultarRegistroPesqele, parseDetalhePesqele, PESQELE_ORIGIN } from "../scripts/lib/pesquisas-monitoramento-pesqele"
import { extrairCenariosSegundoTurno, extrairListaCompletaPrimeiroTurno, parsePublicacaoMonitorada } from "../scripts/lib/pesquisas-monitoramento-adapters"
import { avaliarEvidenciaAoVivo, escreverRelatorios, listarAlvosMonitoramento, obterContratoFonte, resultadoFalhaColeta } from "../scripts/lib/pesquisas-monitoramento"
import { margemCompativelComRegistro } from "../scripts/lib/pesquisas-monitoramento-tse"
import { descobrirRelatorioPoderData, parseTextoPoderData } from "../scripts/lib/pesquisas-monitoramento-poderdata-pdf"
import { aplicarOperacoesAgendadas, carregarCatalogosAgendados, consolidarPropostasAgendadas, construirMatrizAgendada } from "../scripts/pesquisas-atualizacao-agendada/model"
import { parsePesquisasEleitoraisJson } from "../src/lib/pesquisas-eleitorais"

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

test("margem máxima prevista preserva o limite registrado e aceita margem publicada dentro dele", () => {
  const exact = parseDetalhePesqele(detailHtml, "AM-09965/2026", "2026-09-09T12:00:00Z")
  const planned = parseDetalhePesqele(detailHtml.replace("margem de erro máxima estimada é de aproximadamente", "margem de erro máxima prevista é de"), "AM-09965/2026", "2026-09-09T12:00:00Z")
  assert.equal(planned.registry.margin_error_pp, 2, "não substituir a margem declarada pelo valor do relatório")
  assert.equal(planned.registry.margin_error_qualifier, "maximum_planned")
  assert.equal(margemCompativelComRegistro(planned.registry, 1.8), true)
  assert.equal(margemCompativelComRegistro(planned.registry, 2.1), false)
  assert.equal(margemCompativelComRegistro(planned.registry, 0), false)
  assert.equal(margemCompativelComRegistro(exact.registry, 1.8), false, "sem qualificador explícito, comparação continua exata")
})

test("diagnostico diferencia acesso, estrutura e divergencia com prova de captura", () => {
  const captured = { source_url: "https://noticias.r7.com/eleicoes/2026/pesquisa/", source_observed_at: "2026-09-09T12:00:00Z", source_sha256: "c".repeat(64) }
  assert.equal(resultadoFalhaColeta({ ...captured, detail: "HTML inesperado: período de campo ausente" }).decision.reason, "extraction_incomplete")
  assert.equal(resultadoFalhaColeta({ ...captured, detail: "PesqEle: metadados conflitantes com a publicação" }).decision.reason, "source_metadata_conflict")
  assert.equal(resultadoFalhaColeta({ ...captured, source_sha256: null, source_observed_at: null, detail: "HTTP 403" }).decision.reason, "source_unavailable")
  const result = resultadoFalhaColeta({ ...captured, detail: "HTML inesperado: resultados ausente" })
  const dir = mkdtempSync(join(tmpdir(), "pesquisas-diagnostico-"))
  try {
    escreverRelatorios([{ case_id: "captura-bloqueada", result }], dir)
    const persisted = JSON.parse(readFileSync(join(dir, "proposal.json"), "utf8")).items[0]
    assert.equal(persisted.diagnostic.source_sha256, captured.source_sha256)
    assert.equal(persisted.evidence, null)
    assert.equal(persisted.decision.eligible_for_human_review, false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
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

const pdfTextFixture = `Pesquisa de Opinião Pública Brasil 26 a 29 de julho de 2026 Registro TSE BR-07845/2026\f
Ficha técnica 2.400 entrevistas Margem de Erro +/- 2,0 p.p. Intervalo de confiança de 95%.\f
Intenção de voto no 1º turno
Em outubro teremos eleição para presidente do Brasil. Se a eleição fosse hoje, em qual dos candidatos que vou falar em ordem alfabética você votaria?
   15-Jul    29-Jul
   Flávio Bolsonaro   34   35
   Lula   40   41
   Renan Santos   6   4
   Ronaldo Caiado   4   5
   Romeu Zema   4   3
   Augusto Cury   3   3
   Branco/Nulo   5   5
   Não sabe   5   4
Pesquisa realizada de 26 a 29 de julho de 2026.\f
Intenção de voto no 1º turno
Sexo
Masculino Feminino Total
Flávio Bolsonaro   37%   32%   35%
Lula   38%   43%   41%
Renan Santos   5%   2%   4%
Ronaldo Caiado   5%   5%   5%
Romeu Zema   4%   3%   3%
Augusto Cury   3%   3%   3%
Branco/Nulo   4%   6%   5%
Não sabe   3%   5%   4%
Total   100%   100%   100%\f
Intenção de voto no 2º turno
E se houver um 2º turno entre Flávio Bolsonaro e Lula, em quem você votaria?
   15-Jul    29-Jul
   Flávio Bolsonaro   43   43
   Lula   45   46
   Branco/Nulo   9   9
   Não sabe   2   2
Pesquisa realizada de 26 a 29 de julho de 2026.`

test("PDF seleciona somente a íntegra vinculada e rejeita destino ou escolha ambígua", () => {
  const url = "https://static.poder360.com.br/uploads/2026/07/Relatorio-PoderData.pdf"
  assert.equal(descobrirRelatorioPoderData(`<a href="${url}">íntegra</a><a href="https://example.com/old.pdf">Brasil</a>`), url)
  assert.throws(() => descobrirRelatorioPoderData(`<a href="https://example.com/report.pdf">íntegra</a>`))
  assert.throws(() => descobrirRelatorioPoderData(`<a href="${url}">íntegra</a><a href="${url.replace('.pdf', '-2.pdf')}">íntegra</a>`))
})

test("PDF preserva coluna atual e seis candidatos sem misturar histórico ou recortes", () => {
  const result = parseTextoPoderData(pdfTextFixture, "BR-07845/2026")
  assert.equal(result.scenarios.length, 2)
  assert.deepEqual(result.scenarios[0].results.map((row) => row.value_percent), [35, 41, 4, 5, 3, 3, 5, 4])
  assert.deepEqual(result.scenarios[1].results.map((row) => row.value_percent), [43, 46, 9, 2])
  assert.equal(result.scenarios[1].page, 5)
  assert.equal(result.scenarios[0].question.endsWith("votaria?"), true)
  for (const text of [
    pdfTextFixture.replaceAll("29-Jul", "15-Jul"),
    pdfTextFixture.replace("BR-07845/2026", "BR-00001/2026"),
    pdfTextFixture.replace("   Augusto Cury   3   3\n", ""),
    pdfTextFixture.replace("   Lula   40   41", "   Lula   40"),
    pdfTextFixture.replace("   Lula   45   46", "   Outra pessoa   45   46"),
    pdfTextFixture.replace("29 de julho", "32 de julho"),
  ]) assert.throws(() => parseTextoPoderData(text, "BR-07845/2026"))
})

test("relatório presidencial mantém os IDs já publicados e todos os candidatos no contrato", () => {
  const target = listarAlvosMonitoramento({ sourceId: "poderdata-aya-nacional-2026", uf: "BR" })[0]
  const source = obterContratoFonte(target.source_id)
  const observedAt = "2026-09-09T12:00:00Z"
  const resultDocument = { ...parseTextoPoderData(pdfTextFixture, target.registration_id), url: "https://static.poder360.com.br/uploads/2026/07/report.pdf", observed_at: observedAt, evidence_sha256: "d".repeat(64) }
  const html = `<meta property="article:published_time" content="2026-07-30"><p>PoderData. Eleição para presidente do Brasil no primeiro turno. Lula (PT) tem 41% e Flávio Bolsonaro (PL), 35%. Pesquisa foi realizada de 26 a 29 de julho de 2026 com 2.400 eleitores. Margem de erro de 2 pontos percentuais. Intervalo de confiança de 95%. Entrevistas por telefone. BR-07845/2026.</p>`
  const registry = [{ registration_id: target.registration_id, office: "Presidente", geography: "BR", field_start: "2026-07-26", field_end: "2026-07-29", sample_size: 2400, margin_error_pp: 2, institute: "PoderData" }]
  const result = avaliarEvidenciaAoVivo({ target, source, html, observedAt, resultDocument, registry })
  assert.equal(result.decision.eligible_for_human_review, true)
  assert.equal(result.evidence?.results.length, 8)
  assert.equal(result.evidence?.additional_scenarios?.[0].scenario.id, target.known_scenarios?.find((scenario) => scenario.turn === 2)?.id)
  assert.equal(result.evidence?.results[5].candidate_slug, "augusto-cury")
  assert.throws(() => parsePublicacaoMonitorada({ target, source, html, observedAt, resultDocument: { ...resultDocument, sample_size: 999 } }), /conflitantes/)
})

const runoffsHtml = `<h3>Cenários de 2º turno</h3><p>O instituto projetou 2 cenários de segundo turno.</p>
<h3>Omar Aziz x Roberto Cidade</h3><ul><li>Omar Aziz: 42%</li><li>Roberto Cidade: 41%</li><li>Nulo/Branco: 9%</li><li>Não sabe/Não respondeu (NS/NR): 8%</li></ul>
<h3>Omar Aziz x David Almeida</h3><ul><li>Omar Aziz: 42%</li><li>David Almeida: 35%</li><li>Nulo/Branco: 14%</li><li>Não sabe/Não respondeu (NS/NR): 9%</li></ul>`

test("segundo turno preserva cada duelo completo, rotulo e categorias sem depender de partidos", () => {
  const scenarios = extrairCenariosSegundoTurno(fullList + runoffsHtml)
  assert.deepEqual(scenarios.map((scenario) => scenario.results.map((row) => row.value_percent)), [[42, 41, 9, 8], [42, 35, 14, 9]])
  assert.equal(scenarios[1].label, "Omar Aziz x David Almeida")
  for (const html of [
    runoffsHtml.replace("2 cenários", "3 cenários"),
    runoffsHtml.replace("<li>David Almeida: 35%</li>", ""),
    runoffsHtml.replace("<li>Roberto Cidade: 41%</li>", "<li>Outra pessoa: 41%</li>"),
    runoffsHtml.replace("<h3>Omar Aziz x Roberto Cidade</h3>", ""),
    runoffsHtml.replace("<li>Nulo/Branco: 9%</li>", "<li>Omar Aziz: 9%</li>"),
  ]) assert.throws(() => extrairCenariosSegundoTurno(html))
  assert.throws(() => extrairCenariosSegundoTurno("<p>Seis cenários de segundo turno em imagem.</p>"), /sem captura completa/)
})

test("proposta conserva todos os cenarios e resolve nome completo com evidencia da mesma publicacao", () => {
  const target = listarAlvosMonitoramento({ sourceId: "real-time-big-data-estaduais-2026", uf: "AM" })[0]
  const source = obterContratoFonte(target.source_id)
  const observedAt = "2026-09-09T12:00:00Z"
  const registrySupplement = parseDetalhePesqele(detailHtml, target.registration_id, observedAt)
  const html = sourceHtml.replace("</article>", `${runoffsHtml}</article>`)
  const result = avaliarEvidenciaAoVivo({ html, target, source, observedAt, registrySupplement, registry: [registrySupplement.registry] })
  assert.equal(result.decision.reason, "approved_new_evidence")
  assert.equal(result.evidence?.publication_complete, true)
  assert.equal(result.evidence?.additional_scenarios?.length, 2)
  assert.equal(result.evidence?.additional_scenarios?.[0].results[0].candidate_slug, "omar-aziz", "nome completo corresponde unicamente ao nome com partido na mesma publicação")
  const unresolvedHtml = html.replaceAll("Omar Aziz:", "Pessoa Desconhecida:").replaceAll("Omar Aziz x", "Pessoa Desconhecida x")
  assert.equal(avaliarEvidenciaAoVivo({ html: unresolvedHtml, target, source, observedAt, registrySupplement, registry: [registrySupplement.registry] }).decision.reason, "identity_unresolved")
  const changed = parsePublicacaoMonitorada({ html: html.replace("Omar Aziz: 42%", "Omar Aziz: 41%").replace("Roberto Cidade: 41%", "Roberto Cidade: 42%"), target, source, observedAt, registrySupplement })
  assert.equal(changed.additional_scenarios?.[0].scenario.id, result.evidence?.additional_scenarios?.[0].scenario.id, "percentuais não mudam a identidade do cenário")
  const dir = mkdtempSync(join(tmpdir(), "pesquisas-cenarios-"))
  try {
    escreverRelatorios([{ case_id: `${target.poll_id}-live`, result }], dir)
    const proposal = JSON.parse(readFileSync(join(dir, "proposal.json"), "utf8"))
    const scenarios = proposal.items[0].normalized_contract.cenarios
    assert.deepEqual(scenarios.map((scenario: { turn: number; resultados: unknown[] }) => [scenario.turn, scenario.resultados.length]), [[1, 8], [2, 4], [2, 4]])
    assert.equal(scenarios[1].question.value, null, "não fabricar pergunta do segundo turno")
    const matrix = construirMatrizAgendada({ sourceId: target.source_id, uf: "AM" })
    const consolidated = consolidarPropostasAgendadas({ matrix, documents: [{ key: matrix[0].key, proposal }], catalogs: carregarCatalogosAgendados() })
    assert.equal(consolidated.status, "ready")
    mkdirSync(join(dir, "scripts/data"), { recursive: true })
    for (const filename of ["pesquisas-presidencia-2026.json", "pesquisas-governadores-2026.json"]) {
      writeFileSync(join(dir, "scripts/data", filename), readFileSync(join("scripts/data", filename)))
    }
    aplicarOperacoesAgendadas(consolidated.diff.operations, dir)
    const saved = carregarCatalogosAgendados(dir)
    const dataset = saved.governadores.datasets.find((entry) => entry.pesquisas.some((poll) => poll.id === target.poll_id))!
    const parsed = parsePesquisasEleitoraisJson(JSON.stringify(dataset), readFileSync("scripts/data/pesquisas-governadores-fontes.json", "utf8"))
    assert.ok(parsed, "o contrato usado pelo site aceita os aliases escopados propostos")
    const aliasesBefore = JSON.stringify(dataset.exact_aliases)
    aplicarOperacoesAgendadas(consolidated.diff.operations, dir)
    const savedAgain = carregarCatalogosAgendados(dir).governadores.datasets.find((entry) => entry.pesquisas.some((poll) => poll.id === target.poll_id))!
    assert.equal(JSON.stringify(savedAgain.exact_aliases), aliasesBefore, "aplicação repetida não duplica aliases")
    const unchanged = consolidarPropostasAgendadas({ matrix, documents: [{ key: matrix[0].key, proposal }], catalogs: saved })
    assert.equal(unchanged.status, "no_changes")
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

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

test("metadados conciliados e identidade canônica preservam procedencia e rejeitam partido ou nome divergente", () => {
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
  assert.equal(result.decision.reason, "approved_new_evidence")
  assert.equal(result.evidence?.results[4].value_percent, 4)
  assert.equal(result.evidence?.results[4].candidate_slug, "cabo-daciolo")
  assert.equal(result.evidence?.identity_observations?.find((entry) => entry.raw_label === "Cabo Daciolo (Mobiliza)")?.basis, "curated_name_party_office_uf")
  for (const label of ["Cabo Daciolo (MDB)", "Pessoa Desconhecida (Mobiliza)", "Daciolo (Mobiliza)"]) {
    const unknown = avaliarEvidenciaAoVivo({ ...input, html: sourceHtml.replace("Cabo Daciolo (Mobiliza)", label), registry: [registrySupplement.registry] })
    assert.equal(unknown.decision.reason, "identity_unresolved")
    assert.equal(unknown.evidence?.results[4].value_percent, 4)
    assert.equal(unknown.evidence?.results[4].candidate_slug, null)
  }
  assert.equal(avaliarEvidenciaAoVivo(input).decision.reason, "registry_conflict", "nenhum registro pode ser fabricado a partir da matéria")
  assert.throws(() => parsePublicacaoMonitorada({ ...input, registrySupplement: undefined }), /confiança ausente/)
  assert.throws(() => parsePublicacaoMonitorada({ ...input, registrySupplement: { ...registrySupplement, registry: { ...registrySupplement.registry, geography: "RS" } } }), /conflitantes/)
})
