import assert from "node:assert/strict"
import test from "node:test"
import {
  describeError,
  fetchOfficial,
  fetchSupabaseTable,
} from "../scripts/audit/coletar-destaques-votacoes"

// Cobre o bug do issue #339: o job falhava com "fetch failed" nu, sem dizer
// qual fonte (Supabase ou API oficial) falhou nem por quê. Estes testes
// travam o contrato de que o erro final sempre carrega URL/label + a cadeia
// de causas, e que as duas leituras iniciais do Supabase (antes sem nenhuma
// proteção) agora resistem a uma falha transitória isolada.

test("describeError encadeia a mensagem com cada error.cause", () => {
  const raiz = new Error("ENOTFOUND legis.senado.leg.br")
  const meio = new Error("fetch failed", { cause: raiz })
  const externo = new Error("https://exemplo/api: fetch failed", { cause: meio })
  assert.equal(
    describeError(externo),
    "https://exemplo/api: fetch failed <- causado por: fetch failed <- causado por: ENOTFOUND legis.senado.leg.br",
  )
})

test("describeError sem cause devolve só a mensagem", () => {
  assert.equal(describeError(new Error("simples")), "simples")
})

test("describeError com valor não-Error usa String()", () => {
  assert.equal(describeError("string crua"), "string crua")
})

test("fetchOfficial esgota as tentativas e o erro final carrega a URL e a causa original", async () => {
  const url = "https://dadosabertos.camara.leg.br/api/v2/votacoes/123/votos"
  const originalFetch = globalThis.fetch
  let chamadas = 0
  globalThis.fetch = async () => {
    chamadas += 1
    throw new TypeError("fetch failed", { cause: new Error("ECONNRESET") })
  }
  try {
    await assert.rejects(
      () => fetchOfficial(url),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, new RegExp(`^${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: fetch failed$`))
        assert.ok(error.cause instanceof Error)
        assert.equal((error.cause as Error).message, "fetch failed")
        return true
      },
    )
    assert.equal(chamadas, 4, "deve tentar exatamente 4 vezes antes de desistir")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("fetchOfficial se recupera se uma tentativa anterior falhar", async () => {
  const url = "https://dadosabertos.camara.leg.br/api/v2/votacoes/456/votos"
  const originalFetch = globalThis.fetch
  let chamadas = 0
  globalThis.fetch = async () => {
    chamadas += 1
    if (chamadas < 2) throw new TypeError("fetch failed")
    return new Response(JSON.stringify({ dados: [] }), { status: 200 })
  }
  try {
    const result = await fetchOfficial(url)
    assert.equal(result.status, 200)
    assert.deepEqual(result.parsed, { dados: [] })
    assert.equal(chamadas, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("fetchSupabaseTable devolve os dados quando a query funciona de primeira", async () => {
  const data = await fetchSupabaseTable("votacoes_chave", async () => ({ data: [{ id: "1" }], error: null }))
  assert.deepEqual(data, [{ id: "1" }])
})

test("fetchSupabaseTable tenta de novo depois de um erro transitório e se recupera", async () => {
  let tentativas = 0
  const data = await fetchSupabaseTable("votos_candidato", async () => {
    tentativas += 1
    if (tentativas < 2) throw new TypeError("fetch failed")
    return { data: [{ id: "par-1" }], error: null }
  })
  assert.deepEqual(data, [{ id: "par-1" }])
  assert.equal(tentativas, 2)
})

test("fetchSupabaseTable esgota as tentativas e o erro final carrega o label da tabela e a causa", async () => {
  let tentativas = 0
  await assert.rejects(
    () =>
      fetchSupabaseTable("votacoes_chave", async () => {
        tentativas += 1
        throw new TypeError("fetch failed", { cause: new Error("ETIMEDOUT") })
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message, "votacoes_chave: fetch failed")
      assert.ok(error.cause instanceof Error)
      assert.equal((error.cause as Error).message, "fetch failed")
      return true
    },
  )
  assert.equal(tentativas, 3, "deve tentar exatamente 3 vezes antes de desistir")
})

test("fetchSupabaseTable propaga erro do PostgREST (sem exceção) depois de esgotar as tentativas", async () => {
  let tentativas = 0
  await assert.rejects(
    () =>
      fetchSupabaseTable("votos_candidato", async () => {
        tentativas += 1
        return { data: null, error: { message: "relation does not exist" } }
      }),
    /votos_candidato: relation does not exist/,
  )
  assert.equal(tentativas, 3)
})
