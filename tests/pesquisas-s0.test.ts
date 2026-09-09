import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { criarClienteHttpMonitoramento } from "../scripts/lib/pesquisas-monitoramento-rede"
import { listarAlvosMonitoramento, obterContratoFonte } from "../scripts/lib/pesquisas-monitoramento"
import { parsePublicacaoMonitorada } from "../scripts/lib/pesquisas-monitoramento-adapters"
import { construirMatrizAgendada } from "../scripts/pesquisas-atualizacao-agendada/model"

for (const status of [403, 404]) {
  test(`robots ${status} permite somente o recurso aprovado e consulta a politica uma vez`, async () => {
    const calls: string[] = []
    const client = criarClienteHttpMonitoramento({
      allowedOrigins: ["https://approved.example"], minIntervalMs: 0,
      fetchImpl: async (input) => {
        const url = String(input)
        calls.push(url)
        return new Response(url.endsWith("robots.txt") ? "unavailable" : "public", {
          status: url.endsWith("robots.txt") ? status : 200,
        })
      },
    })
    assert.equal((await client.getText("https://approved.example/poll")).body, "public")
    await client.getText("https://approved.example/poll")
    await assert.rejects(client.getText("https://other.example/poll"), /origem nao aprovada/)
    assert.equal(calls.filter((url) => url.endsWith("robots.txt")).length, 1)
    assert.equal(calls.length, 3)
  })
}

for (const failure of [408, 429, 503, "network", "disallow"] as const) {
  test(`robots ${failure} continua impedindo acesso ao recurso`, async () => {
    let pageCalls = 0
    let robotCalls = 0
    const client = criarClienteHttpMonitoramento({
      allowedOrigins: ["https://approved.example"], minIntervalMs: 0, maxAttempts: 2,
      sleep: async () => undefined,
      fetchImpl: async (input) => {
        if (!String(input).endsWith("robots.txt")) { pageCalls++; return new Response("public") }
        robotCalls++
        if (failure === "network") throw new TypeError("fetch failed")
        return new Response("User-agent: *\nDisallow: /", { status: failure === "disallow" ? 200 : failure })
      },
    })
    await assert.rejects(client.getText("https://approved.example/poll"))
    assert.equal(pageCalls, 0)
    assert.ok(robotCalls >= 1 && robotCalls <= 2)
  })
}

test("403 no conteudo continua sendo erro mesmo com robots indisponivel", async () => {
  let pageCalls = 0
  const client = criarClienteHttpMonitoramento({
    allowedOrigins: ["https://approved.example"], minIntervalMs: 0,
    fetchImpl: async (input) => {
      if (!String(input).endsWith("robots.txt")) pageCalls++
      return new Response(null, { status: 403 })
    },
  })
  await assert.rejects(client.getText("https://approved.example/poll"), /HTTP 403/)
  assert.equal(pageCalls, 1)
})

function parseFixture(file: string, sourceId: string, uf: string, transform: (html: string) => string) {
  const target = listarAlvosMonitoramento({ sourceId, uf })[0]
  return parsePublicacaoMonitorada({
    html: transform(readFileSync(resolve("tests/fixtures/pesquisas-monitoramento", file), "utf8")),
    observedAt: "2026-09-09T12:00:00Z", target, source: obterContratoFonte(sourceId),
  })
}

test("adaptador usa cenário estimulado como principal mesmo quando a lista espontânea vem antes", () => {
  const spontaneous = '<h2>Pesquisa espontânea</h2><ul><li>Juliana Brizola (PDT): 50%</li><li>Luciano Zucco (PL): 30%</li><li>Nulo/Branco: 10%</li><li>Não sabe: 10%</li></ul>'
  const stimulated = '<h2>Pesquisa estimulada</h2><ul><li>Juliana Brizola (PDT): 55%</li><li>Luciano Zucco (PL): 35%</li><li>Nulo/Branco: 5%</li><li>Não sabe: 5%</li></ul>'
  const evidence = parseFixture("real-time-big-data-publicacao.html", "real-time-big-data-estaduais-2026", "RS", (html) => html.replace("</article>", `${spontaneous}${stimulated}</article>`))
  assert.match(evidence.scenario.label, /estimulado/)
  assert.equal(evidence.results[0].value_percent, 55)
  assert.match(evidence.additional_scenarios![0].scenario.label, /espontâneo/)
  assert.equal(evidence.additional_scenarios![0].results[0].value_percent, 50)
  assert.throws(() => parseFixture("real-time-big-data-publicacao.html", "real-time-big-data-estaduais-2026", "RS", (html) => html.replace("</article>", `${spontaneous}</article>`)), /cenário estimulado ausente/)
})

// Synthetic fixtures with wording observed in the public AM and BR pages on 2026-09-09.
const samplePhrase = "Foram ouvidos 1.600 eleitores"
for (const phrase of ["A pesquisa foi realizada entre 21 e 25 de agosto de 2026, com 1.600 eleitores", "A pesquisa foi feita com as entrevistas de 1.600 eleitores"]) {
  test(`amostra aceita redacao observada: ${phrase}`, () => {
    const evidence = parseFixture("real-time-big-data-publicacao.html", "real-time-big-data-estaduais-2026", "RS", (html) => html.replace(samplePhrase, phrase))
    assert.equal(evidence.sample.size, 1600)
  })
}
test("numero de eleitores sem contexto de pesquisa nao vira amostra", () => {
  assert.throws(() => parseFixture("real-time-big-data-publicacao.html", "real-time-big-data-estaduais-2026", "RS", (html) => html.replace(samplePhrase, "Um evento contou com 1.600 eleitores")), /amostra ausente/)
})

const originalFieldwork = "com campo de 18 a 19 de agosto de 2026"
const observedFieldwork = "Elas começaram na terça (18), dia do início do levantamento que acabou na quarta (19)"
for (const phrase of ["com campo de terça-feira (18) a esta sexta-feira (21)", "com campo de terça (18) até sexta (21)", "com campo de terça-feira (18) a esta sexta"]) {
  test(`campo associa dia da semana ao calendário e à publicação: ${phrase}`, () => {
    const evidence = parseFixture("datafolha-nacional-publicacao.html", "datafolha-folha-globo-nacional-2026", "BR", (html) => html.replace(originalFieldwork, phrase))
    assert.deepEqual(evidence.fieldwork, { start: "2026-08-18", end: "2026-08-21" })
  })
}
test("dia da semana incompatível não é corrigido silenciosamente", () => {
  assert.throws(() => parseFixture("datafolha-nacional-publicacao.html", "datafolha-folha-globo-nacional-2026", "BR", (html) => html.replace(originalFieldwork, "com campo de segunda-feira (18) a sexta (21)")), /dia da semana conflitante/)
})
test("fim do campo sem dia exige referência explícita à publicação", () => {
  assert.throws(() => parseFixture("datafolha-nacional-publicacao.html", "datafolha-folha-globo-nacional-2026", "BR", (html) => html.replace(originalFieldwork, "com campo de terça-feira (18) a sexta")), /fim do campo sem data verificável/)
})
test("dia da semana conflitante não recua ao mesmo dia de outro mês", () => {
  assert.throws(() => parseFixture("datafolha-nacional-publicacao.html", "datafolha-folha-globo-nacional-2026", "BR", (html) => html.replaceAll("2026-08-21", "2026-09-21").replace(originalFieldwork, "com campo de terça-feira (18) a sexta-feira (21)")), /dia da semana conflitante/)
})
test("campo aceita dias contextualizados no inicio e fim do levantamento", () => {
  const evidence = parseFixture("datafolha-nacional-publicacao.html", "datafolha-folha-globo-nacional-2026", "BR", (html) => html.replace(originalFieldwork, observedFieldwork))
  assert.deepEqual(evidence.fieldwork, { start: "2026-08-18", end: "2026-08-19" })
})
for (const phrase of [
  "noticias na terça (18) e na quarta (19)",
  observedFieldwork.replace("(18)", "(32)"),
  observedFieldwork.replace("(18)", "(20)"),
  observedFieldwork.replace("(19)", "(22)"),
]) {
  test(`campo rejeita contexto ou datas invalidas: ${phrase}`, () => {
    assert.throws(() => parseFixture("datafolha-nacional-publicacao.html", "datafolha-folha-globo-nacional-2026", "BR", (html) => html.replace(originalFieldwork, phrase)))
  })
}

test("CLI bloqueada falha apos gravar diagnostico e outputs, preservando upload always", () => {
  const root = mkdtempSync(resolve(tmpdir(), "pesquisas-s0-test-"))
  try {
    const matrix = resolve(root, "matrix.json")
    const output = resolve(root, "github-output")
    const summary = resolve(root, "github-summary")
    writeFileSync(matrix, JSON.stringify({ include: construirMatrizAgendada({ sourceId: "real-time-big-data-estaduais-2026", uf: "AM" }) }))
    const result = spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", "scripts/pesquisas-atualizacao-agendada/cli.ts", "consolidate", "--input", resolve(root, "missing"), "--matrix", matrix, "--out", resolve(root, "out")], {
      encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    })
    assert.match(result.stdout, /PESQUISAS_CONSOLIDATION_STATUS=blocked/)
    assert.match(readFileSync(output, "utf8"), /status=blocked/)
    assert.match(readFileSync(summary, "utf8"), /Status: blocked/)
    assert.deepEqual(JSON.parse(readFileSync(resolve(root, "out/diff.json"), "utf8")).operations, [])
    assert.equal(result.status, 1, result.stderr)
    const workflow = readFileSync(".github/workflows/pesquisas-monitoramento.yml", "utf8")
    const consolidateJob = workflow.slice(workflow.indexOf("  consolidar:"), workflow.indexOf("  promover:"))
    assert.match(consolidateJob, /- name: [^\n]+\n\s+if: always\(\)\n\s+uses: actions\/upload-artifact@/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("CLI inalterada retorna zero sem operacoes", () => {
  const root = mkdtempSync(resolve(tmpdir(), "pesquisas-s0-unchanged-"))
  try {
    const matrix = construirMatrizAgendada({ sourceId: "real-time-big-data-estaduais-2026", uf: "AM" })
    const matrixPath = resolve(root, "matrix.json")
    writeFileSync(matrixPath, JSON.stringify({ include: matrix }))
    const part = resolve(root, "input", `pesquisas-monitoramento-part-${matrix[0].key}`)
    mkdirSync(part, { recursive: true })
    writeFileSync(resolve(part, "proposal.json"), JSON.stringify({
      schema_version: "1.0.0", dry_run: true, human_review_required: true,
      items: matrix[0].poll_ids.map((id) => ({
        id: `${id}-live`, evidence: null, normalized_contract: null,
        decision: { classification: "inalterado", eligible_for_human_review: false, reason: "evidence_unchanged" },
      })),
    }))
    const env = { ...process.env }
    delete env.GITHUB_OUTPUT
    delete env.GITHUB_STEP_SUMMARY
    const result = spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", "scripts/pesquisas-atualizacao-agendada/cli.ts", "consolidate", "--input", resolve(root, "input"), "--matrix", matrixPath, "--out", resolve(root, "out")], { encoding: "utf8", env })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /PESQUISAS_CONSOLIDATION_STATUS=no_changes/)
    assert.deepEqual(JSON.parse(readFileSync(resolve(root, "out/diff.json"), "utf8")).operations, [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

for (const mode of ["inalterado", "bloqueado", "item-incorreto", "matriz-ambigua", "duplicado"] as const) {
  test(`artefato plano de download unico: ${mode}`, () => {
    const root = mkdtempSync(resolve(tmpdir(), "pesquisas-s0-flat-"))
    try {
      const matrix = construirMatrizAgendada({ sourceId: "real-time-big-data-estaduais-2026", uf: "AM" })
      if (mode === "matriz-ambigua") matrix.push(...construirMatrizAgendada({ sourceId: "real-time-big-data-estaduais-2026", uf: "RS" }))
      const matrixPath = resolve(root, "matrix.json")
      writeFileSync(matrixPath, JSON.stringify({ include: matrix }))
      const input = resolve(root, "input")
      mkdirSync(input)
      const proposal = JSON.stringify({
        schema_version: "1.0.0", dry_run: true, human_review_required: true,
        items: [{
          id: mode === "item-incorreto" ? "outra-pesquisa-live" : `${matrix[0].poll_ids[0]}-live`,
          evidence: null, normalized_contract: null,
          decision: mode === "bloqueado"
            ? { classification: "fonte indisponivel", eligible_for_human_review: false, reason: "source_unavailable" }
            : { classification: "inalterado", eligible_for_human_review: false, reason: "evidence_unchanged" },
        }],
      })
      writeFileSync(resolve(input, "proposal.json"), proposal)
      if (mode === "duplicado") {
        const nested = resolve(input, `pesquisas-monitoramento-part-${matrix[0].key}`)
        mkdirSync(nested)
        writeFileSync(resolve(nested, "proposal.json"), proposal)
      }
      const env = { ...process.env }
      delete env.GITHUB_OUTPUT
      delete env.GITHUB_STEP_SUMMARY
      const result = spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", "scripts/pesquisas-atualizacao-agendada/cli.ts", "consolidate", "--input", input, "--matrix", matrixPath, "--out", resolve(root, "out")], { encoding: "utf8", env })
      assert.equal(result.status, mode === "inalterado" ? 0 : 1, result.stderr)
      const summary = readFileSync(resolve(root, "out/summary.md"), "utf8")
      if (mode === "inalterado" || mode === "bloqueado") {
        assert.match(summary, /Artefatos esperados: 1. Recebidos: 1/)
        assert.doesNotMatch(summary, /artefato ausente|item ausente/)
      }
      if (mode === "bloqueado") assert.match(summary, /source_unavailable/)
      if (mode === "item-incorreto") assert.match(summary, /item inesperado/)
      if (mode === "matriz-ambigua") assert.match(summary, /artefato inesperado/)
      if (mode === "duplicado") assert.match(summary, /artefato duplicado/)
      assert.deepEqual(JSON.parse(readFileSync(resolve(root, "out/diff.json"), "utf8")).operations, [])
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
}
