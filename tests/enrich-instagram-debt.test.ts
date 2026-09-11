import assert from "node:assert/strict"
import test from "node:test"
import { enrichInstagram, fetchInstagramFollowers, type EnrichInstagramDependencies } from "../scripts/lib/enrich-instagram"

async function executeInstagram(instagram: unknown, count: number | null = null) {
  const original = structuredClone(instagram)
  const writes: Record<string, unknown>[] = []
  let fetchCalls = 0
  const [result] = await enrichInstagram({
    loadCandidates: async () => [{
      slug: "teste", nome_urna: "Teste", nome_completo: "Teste", estado: "SP",
      cargo_disputado: "Governador", ids: { camara: null, senado: null, tse_sq_candidato: {} },
    }],
    resolveCandidateId: async () => "candidate-id",
    database: { from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({
        data: { redes_sociais: { instagram, twitter: "editorial" } }, error: null,
      }) }) }),
      update: (payload: Record<string, unknown>) => {
        writes.push(payload)
        return { eq: async () => ({ error: null }) }
      },
    }) } as unknown as EnrichInstagramDependencies["database"],
    fetcher: async () => {
      fetchCalls++
      return count === null ? new Response("blocked", { status: 400 })
        : Response.json({ graphql: { user: { username: "perfil", edge_followed_by: { count } } } })
    },
    appId: null,
    wait: async () => {},
  })
  assert.deepEqual(instagram, original, "o objeto original não deve ser mutado")
  return { result, writes, fetchCalls }
}

test("fluxo completo recusa username/URL divergentes sem rede nem escrita", async () => {
  const { result, writes, fetchCalls } = await executeInstagram({
    username: "perfil_a", url: "https://instagram.com/perfil_b", followers: 777,
  })
  assert.equal(result.coleta_resultado, "indeterminado")
  assert.match(result.coleta_detalhe ?? "", /ambígua/)
  assert.equal(fetchCalls, 0)
  assert.equal(result.rows_upserted, 0)
  assert.deepEqual(writes, [])
})

test("fluxo completo recusa rotas reservadas e URLs de conteúdo sem rede nem escrita", async () => {
  for (const url of [
    "https://instagram.com/p/abc", "https://instagram.com/p", "https://instagram.com/reel/abc",
    "https://instagram.com/stories/perfil", "https://instagram.com/accounts", "https://instagram.com/perfil/extra",
  ]) {
    for (const instagram of [url, { username: "", url, followers: 777 }, { username: "perfil", url, followers: 777 }]) {
      const { result, writes, fetchCalls } = await executeInstagram(instagram)
      assert.equal(result.coleta_resultado, "indeterminado", url)
      assert.equal(fetchCalls, 0, url)
      assert.equal(result.rows_upserted, 0, url)
      assert.deepEqual(writes, [], url)
    }
  }
})

test("identidade coincidente normaliza preservando followers e metadata se a fonte falha", async () => {
  const { result, writes, fetchCalls } = await executeInstagram({
    username: "@PERFIL", url: "https://www.instagram.com/PERFIL/", followers: 777, verified_at: "2026-09-01",
  })
  assert.equal(fetchCalls, 1)
  assert.equal(result.coleta_resultado, "indeterminado")
  assert.deepEqual(writes, [{ redes_sociais: {
    twitter: "editorial", instagram: { username: "perfil", url: "https://instagram.com/perfil", followers: 777, verified_at: "2026-09-01" },
  } }])
})

test("fluxo completo aceita zero confirmado sem remover metadata", async () => {
  const { result, writes } = await executeInstagram({
    username: "perfil", url: "https://instagram.com/perfil", followers: 777, verified_at: "2026-09-01",
  }, 0)
  assert.equal(result.coleta_resultado, "encontrado")
  assert.equal(result.rows_upserted, 1)
  assert.deepEqual(writes, [{ redes_sociais: {
    twitter: "editorial", instagram: { username: "perfil", url: "https://instagram.com/perfil", followers: 0, verified_at: "2026-09-01" },
  } }])
})

test("indisponibilidade preserva motivo sem afirmar perfil vazio", async () => {
  const result = await fetchInstagramFollowers("perfil", (async () => new Response("blocked", { status: 400 })) as typeof fetch, null)
  assert.equal(result.count, null)
  assert.deepEqual(result.reasons, ["principal: INSTAGRAM_APP_ID ausente, consulta não executada", "fallback: HTTP 400"])
})

test("não aceita contagem inválida ou identidade divergente", async () => {
  for (const user of [
    { username: "outro", edge_followed_by: { count: 12 } },
    { edge_followed_by: { count: 12 } },
    { username: "perfil", edge_followed_by: { count: -1 } },
    { username: "perfil", edge_followed_by: { count: 1.5 } },
  ]) {
    const result = await fetchInstagramFollowers("perfil", (async () => Response.json({ graphql: { user } })) as typeof fetch, null)
    assert.equal(result.count, null)
    assert.match(result.reasons.join(";"), /identidade ou contagem inválida/)
  }
})

test("zero só é confirmado com identidade e resposta válidas", async () => {
  const result = await fetchInstagramFollowers("perfil", (async () => Response.json({ graphql: { user: { username: "PERFIL", edge_followed_by: { count: 0 } } } })) as typeof fetch, null)
  assert.equal(result.count, 0)
})

test("falha principal pode recuperar no fallback sem expor resposta ou credencial", async () => {
  let calls = 0
  const result = await fetchInstagramFollowers("perfil", (async () => {
    calls++
    if (calls === 1) return new Response("credencial secreta", { status: 403 })
    return Response.json({ graphql: { user: { username: "perfil", edge_followed_by: { count: 100 } } } })
  }) as typeof fetch, "chave-nao-publicavel")
  assert.equal(result.count, 100)
  assert.deepEqual(result.reasons, ["principal: HTTP 403"])
})

test("HTML e JSON malformado não viram ausência confirmada", async () => {
  const result = await fetchInstagramFollowers("perfil", (async () => new Response("<html>login</html>")) as typeof fetch, null)
  assert.equal(result.count, null)
  assert.match(result.reasons.join(";"), /JSON inválido/)
})
