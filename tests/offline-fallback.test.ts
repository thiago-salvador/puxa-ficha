import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import test from "node:test"

function worker(fetch: (request: unknown, options?: RequestInit) => Promise<Response>) {
  const handlers = new Map<string, (event: unknown) => void>()
  runInNewContext(readFileSync("public/offline-worker.js", "utf8"), {
    self: { addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler) },
    fetch, Response, URL,
  })
  return (request: { method: string; mode: string; url: string }) => {
    let response: Promise<Response> | undefined
    handlers.get("fetch")!({ request, respondWith: (value: Promise<Response>) => { response = value } })
    return response
  }
}

test("offline navigation shows a static notice without saving candidate data", async () => {
  const request = worker(async () => { throw new TypeError("offline") })
  const response = await request({ method: "GET", mode: "navigate", url: "https://puxaficha.com.br/candidato/teste" })
  assert.equal(response?.status, 503)
  assert.equal(response?.headers.get("cache-control"), "no-store")
  assert.match(await response!.text(), /Sem conexão/)
})

test("online navigation and HTTP errors remain unchanged", async () => {
  for (const status of [200, 404, 500]) {
    const original = new Response("original", { status })
    const request = worker(async () => original)
    assert.equal(await request({ method: "GET", mode: "navigate", url: "https://puxaficha.com.br/" }), original)
  }
})

test("navigation bypasses HTTP cache as well as CacheStorage", async () => {
  let cache: RequestCache | undefined
  const request = worker(async (_request, options) => {
    cache = options?.cache
    return new Response("online")
  })
  await request({ method: "GET", mode: "navigate", url: "https://puxaficha.com.br/" })
  assert.equal(cache, "no-store")
})

test("worker never intercepts API requests, mutations, or RSC fetches", () => {
  const request = worker(async () => { throw new Error("must not fetch") })
  for (const item of [
    { method: "POST", mode: "navigate", url: "https://puxaficha.com.br/" },
    { method: "GET", mode: "navigate", url: "https://puxaficha.com.br/api/search-index" },
    { method: "GET", mode: "cors", url: "https://puxaficha.com.br/?_rsc=abc" },
  ]) assert.equal(request(item), undefined)
})
