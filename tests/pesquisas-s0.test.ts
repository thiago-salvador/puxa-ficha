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
