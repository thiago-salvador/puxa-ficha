import assert from "node:assert/strict"
import test from "node:test"

import {
  caminhoPermitidoPorRobots,
  criarClienteHttpMonitoramento,
  redigirUrlParaLog,
} from "../scripts/lib/pesquisas-monitoramento-rede"

test("robots permite pagina publica e bloqueia rota proibida", () => {
  const robots = "User-agent: *\nDisallow: /wordpress/wp-admin/\nAllow: /wordpress/wp-admin/admin-ajax.php\n"
  assert.equal(caminhoPermitidoPorRobots(robots, "/poderdata/resultado/"), true)
  assert.equal(caminhoPermitidoPorRobots(robots, "/wordpress/wp-admin/edit.php"), false)
})

test("cliente limita retries e falha fechado em timeout", async () => {
  let calls = 0
  const fakeFetch: typeof fetch = async (input) => {
    calls += 1
    const url = String(input)
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:\n", { status: 200 })
    throw new DOMException("timeout", "AbortError")
  }
  const client = criarClienteHttpMonitoramento({
    allowedOrigins: ["https://www.poder360.com.br"],
    fetchImpl: fakeFetch,
    maxAttempts: 3,
    minIntervalMs: 0,
    sleep: async () => undefined,
    timeoutMs: 5,
  })
  await assert.rejects(() => client.getText("https://www.poder360.com.br/poderdata/resultado/"), /timeout/i)
  assert.equal(calls, 4, "uma consulta robots mais tres tentativas da pagina")
})

test("origem fora da allowlist nem chega ao fetch", async () => {
  let calls = 0
  const client = criarClienteHttpMonitoramento({
    allowedOrigins: ["https://www.poder360.com.br"],
    fetchImpl: async () => {
      calls += 1
      return new Response("ok")
    },
    minIntervalMs: 0,
    sleep: async () => undefined,
  })
  await assert.rejects(() => client.getText("https://example.com/private"), /origem nao aprovada/)
  assert.equal(calls, 0)
})

test("redirect revalida HTTPS, allowlist e robots antes do proximo GET", async () => {
  const calls: string[] = []
  const client = criarClienteHttpMonitoramento({
    allowedOrigins: ["https://approved.example"],
    fetchImpl: async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 })
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/internal" } })
    },
    minIntervalMs: 0,
    sleep: async () => undefined,
  })
  await assert.rejects(() => client.getText("https://approved.example/poll"), /somente HTTPS/)
  assert.deepEqual(calls, ["https://approved.example/robots.txt", "https://approved.example/poll"])
})

test("limite declarado rejeita corpo antes de materializar", async () => {
  let bodyRead = false
  let bodyCancelled = false
  const client = criarClienteHttpMonitoramento({
    allowedOrigins: ["https://approved.example"],
    fetchImpl: async (input) => {
      if (String(input).endsWith("/robots.txt")) return new Response("", { status: 200 })
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-length": "1000" }),
        body: {
          cancel: async () => { bodyCancelled = true },
          getReader: () => {
            bodyRead = true
            throw new Error("corpo nao deveria ser lido")
          },
        },
      } as unknown as Response
    },
    maxBytes: 8,
    minIntervalMs: 0,
    sleep: async () => undefined,
  })
  await assert.rejects(() => client.getText("https://approved.example/poll"), /limite de bytes/)
  assert.equal(bodyRead, false)
  assert.equal(bodyCancelled, true)
})

test("corpo chunked e interrompido ao exceder o teto", async () => {
  let reads = 0
  let cancelled = false
  const client = criarClienteHttpMonitoramento({
    allowedOrigins: ["https://approved.example"],
    fetchImpl: async (input) => {
      if (String(input).endsWith("/robots.txt")) return new Response("", { status: 200 })
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: async () => {
              reads += 1
              return { done: false, value: new Uint8Array(6) }
            },
            cancel: async () => { cancelled = true },
            releaseLock: () => undefined,
          }),
        },
      } as unknown as Response
    },
    maxBytes: 8,
    minIntervalMs: 0,
    sleep: async () => undefined,
  })
  await assert.rejects(() => client.getBytes("https://approved.example/poll"), /limite de bytes/)
  assert.equal(reads, 2)
  assert.equal(cancelled, true)
})

test("logs removem query, fragmento e credenciais", () => {
  assert.equal(redigirUrlParaLog("https://user:pass@example.com/path?token=segredo#x"), "https://example.com/path")
  console.log("MONITORAMENTO_REDE_PASS")
})
