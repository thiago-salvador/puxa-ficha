import assert from "node:assert/strict"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { parseCSV, validarEsquemaIndividual } from "../scripts/lib/ingest-filiacao"
import { resultadoTransparenciaPendente } from "../scripts/lib/ingest-transparencia"
import { ingestTransparenciaSanctions } from "../scripts/lib/ingest-transparencia-sanctions"
import { motivoRecusaDeFonte } from "../src/lib/public-attention-point"

test("Portal sem implementação não declara sucesso nem ausência", () => {
  const result = resultadoTransparenciaPendente("teste")
  assert.equal(result.coleta_resultado, "erro")
  assert.equal(result.rows_upserted, 0)
  assert.deepEqual(result.tables_updated, [])
  assert.ok(result.errors.length > 0)
  assert.match(result.coleta_detalhe!, /Nenhuma consulta/)
})

test("perfil agregado oficial é recusado como filiação individual", () => {
  assert.throws(() => validarEsquemaIndividual({ SG_PARTIDO: "", QT_FILIADO: "" }), /NM_ELEITOR/)
})

test("CSV vazio ou com apenas cabeçalho incompatível não confirma cobertura", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pf-filiacao-test-"))
  try {
    for (const content of ["", '"SG_PARTIDO";"QT_FILIADO"\n']) {
      const file = join(dir, "source.csv")
      await writeFile(file, content)
      let consumed = 0
      await assert.rejects(parseCSV(file, () => { consumed++ }), /sem registros|colunas ausentes/)
      assert.equal(consumed, 0)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

type Scenario = "missing-cpf" | "insert-error" | "select-error" | "http-error" | "found" | "empty"

async function runSanctions(scenario: Scenario) {
  const saved = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    TRANSPARENCIA_API_KEY: process.env.TRANSPARENCIA_API_KEY,
    PF_INGEST_SLUGS: process.env.PF_INGEST_SLUGS,
  }
  process.env.SUPABASE_URL = "http://127.0.0.1:1"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key"
  process.env.TRANSPARENCIA_API_KEY = "test-portal-key"
  delete process.env.PF_INGEST_SLUGS
  const originalFetch = globalThis.fetch
  const writes: string[] = []
  let portalCalls = 0
  let attentionPointCalls = 0
  // Synthetic fixture, never sent to a network endpoint.
  const cpf = "52998224725"
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? (input instanceof Request ? input.method : "GET")
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { "content-type": "application/json" },
    })
    if (url.pathname === "/rest/v1/candidatos_publico" && method === "GET") {
      return reply(Number(url.searchParams.get("offset") ?? 0) === 0
        ? [{ slug: "teste", nome_completo: "Pessoa de Teste" }] : [])
    }
    if (url.pathname === "/rest/v1/candidatos" && method === "GET") {
      return reply({ id: "candidate-id", slug: "teste", nome_completo: "Pessoa de Teste",
        cpf: scenario === "missing-cpf" ? null : cpf })
    }
    if (/^\/api-de-dados\/(ceis|cnep|ceaf)$/.test(url.pathname)) {
      portalCalls++
      if (scenario === "http-error") return reply({ message: `HTTP 401: ${cpf}` }, 401)
      return reply(scenario !== "empty" && url.pathname.endsWith("/ceis") ? [{
        id: 1, pessoa: { cpfFormatado: cpf, nome: "Pessoa de Teste" },
        numeroProcesso: "processo-teste", tipoSancao: { descricaoResumida: "Sanção de teste" },
      }] : [])
    }
    if (url.pathname === "/rest/v1/sancoes_administrativas") {
      if (method === "GET") return scenario === "select-error"
        ? reply({ message: "test select failure" }, 400) : reply([])
      writes.push(method)
      return scenario === "insert-error" ? reply({ message: "test insert failure" }, 400) : reply(null, 201)
    }
    if (url.pathname === "/rest/v1/pontos_atencao") {
      attentionPointCalls++
      return reply({ message: "attention point access must remain unreachable" }, 400)
    }
    throw new Error(`Unexpected test request: ${method} ${url.pathname}`)
  }
  try {
    const results = await ingestTransparenciaSanctions()
    assert.equal(results.length, 1)
    return { result: results[0], writes, portalCalls, attentionPointCalls }
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("entrypoint sem CPF faz zero consulta ao Portal e zero persistência", async () => {
  const { result, writes, portalCalls } = await runSanctions("missing-cpf")
  assert.equal(result.coleta_resultado, "erro")
  assert.equal(portalCalls, 0)
  assert.deepEqual(writes, [])
})

for (const scenario of ["insert-error", "select-error"] as const) {
  test(`entrypoint ${scenario} não transforma sanção encontrada em vazio`, async () => {
    const { result, writes, portalCalls } = await runSanctions(scenario)
    assert.equal(portalCalls, 3)
    assert.equal(result.coleta_resultado, "erro")
    assert.ok(result.errors.length > 0)
    assert.equal(result.rows_upserted, 0)
    assert.deepEqual(result.tables_updated, [])
    if (scenario === "select-error") assert.deepEqual(writes, [])
  })
}

test("entrypoint só anuncia a tabela que persistiu; guard editorial não vira escrita", async () => {
  const { result, writes, attentionPointCalls } = await runSanctions("found")
  assert.equal(result.coleta_resultado, "encontrado")
  assert.equal(result.rows_upserted, 1)
  assert.deepEqual(result.tables_updated, ["sancoes_administrativas"])
  assert.deepEqual(writes, ["POST"])
  assert.equal(attentionPointCalls, 0, "sem fonte, o guard deve impedir inclusive o SELECT de pontos_atencao")
})

test("sanção usa gravidade alta: fonte ausente bloqueia; média não tem esse bloqueio", () => {
  assert.equal(motivoRecusaDeFonte("alta", undefined), "nenhuma fonte preenchida")
  assert.equal(motivoRecusaDeFonte("media", undefined), null)
})

test("entrypoint mantém vazio confirmado quando os três cadastros respondem vazios", async () => {
  const { result, writes, portalCalls } = await runSanctions("empty")
  assert.equal(result.coleta_resultado, "vazio_confirmado")
  assert.equal(portalCalls, 3)
  assert.deepEqual(writes, [])
})

test("erro HTTP preserva falha sem expor documento nos recibos", async () => {
  const { result, writes } = await runSanctions("http-error")
  assert.equal(result.coleta_resultado, "erro")
  assert.match(result.coleta_detalhe!, /HTTP 401/)
  assert.doesNotMatch(JSON.stringify(result), /52998224725/)
  assert.deepEqual(writes, [])
})
