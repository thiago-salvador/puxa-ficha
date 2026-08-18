import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { NextRequest } from "next/server"
import { middleware } from "../middleware"
import { deriveAccessCookieValue } from "@/lib/access-cookie-digest"

const env = process.env as Record<string, string | undefined>
const savedEnv: Partial<Record<string, string | undefined>> = {}
let savedFetch: typeof globalThis.fetch

function request(url: string, cookie?: string) {
  return new NextRequest(url, {
    headers: cookie ? { cookie } : undefined,
  })
}

function slugListResponse(slugs: unknown, init?: ResponseInit) {
  return Response.json({ slugs }, init)
}

describe("middleware route protection", () => {
  beforeEach(() => {
    savedFetch = globalThis.fetch
    savedEnv.NODE_ENV = env.NODE_ENV
    savedEnv.VERCEL = env.VERCEL
    savedEnv.VERCEL_ENV = env.VERCEL_ENV
    savedEnv.PF_PREVIEW_TOKEN = env.PF_PREVIEW_TOKEN
    savedEnv.PF_INTERNAL_TOKEN = env.PF_INTERNAL_TOKEN
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete env[key]
      else env[key] = value
    }
    globalThis.fetch = savedFetch
  })

  it("returns 404 for preview routes without a token", async () => {
    env.NODE_ENV = "production"
    env.VERCEL_ENV = "production"
    env.PF_PREVIEW_TOKEN = "preview-secret-token-123456"

    const response = await middleware(request("http://localhost/preview/candidato/lula"))

    assert.equal(response.status, 404)
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8")
  })

  it("bootstraps preview access from query token, strips the query and sets the preview cookie", async () => {
    env.NODE_ENV = "production"
    env.VERCEL_ENV = "production"
    env.PF_PREVIEW_TOKEN = "preview-secret-token-123456"

    const response = await middleware(
      request("http://localhost/preview/candidato/lula?token=preview-secret-token-123456"),
    )

    const setCookie = response.headers.get("set-cookie") ?? ""
    const derivado = await deriveAccessCookieValue("preview-secret-token-123456", "preview")

    assert.equal(response.status, 307)
    assert.equal(response.headers.get("location"), "http://localhost/preview/candidato/lula")
    assert.match(setCookie, new RegExp(`pf_preview_token=${derivado}`))
    assert.match(setCookie, /Path=\/preview/)
    // O ponto do fix: o cookie prova posse, não carrega o segredo.
    assert.equal(setCookie.includes("preview-secret-token-123456"), false)
  })

  it("allows preview routes with a valid preview cookie", async () => {
    env.NODE_ENV = "production"
    env.VERCEL_ENV = "production"
    env.PF_PREVIEW_TOKEN = "preview-secret-token-123456"

    const derivado = await deriveAccessCookieValue("preview-secret-token-123456", "preview")
    const response = await middleware(
      request("http://localhost/preview/candidato/lula", `pf_preview_token=${derivado}`),
    )

    assert.equal(response.headers.get("x-middleware-next"), "1")
  })

  it("recusa cookie com o token cru, em preview e no interno", async () => {
    // Regressão 2026-08-04: o cookie guardava o próprio token, então qualquer
    // leitura do jar devolvia um segredo reutilizável no bootstrap por `?token=`.
    // Com o valor derivado, o token cru deixa de ser aceito como cookie.
    env.NODE_ENV = "production"
    env.VERCEL_ENV = "production"
    env.PF_PREVIEW_TOKEN = "preview-secret-token-123456"
    env.PF_INTERNAL_TOKEN = "internal-secret-token-123456"

    const preview = await middleware(
      request(
        "http://localhost/preview/candidato/lula",
        "pf_preview_token=preview-secret-token-123456",
      ),
    )
    assert.equal(preview.status, 404)

    const interno = await middleware(
      request("http://localhost/internaltest", "pf_internal_token=internal-secret-token-123456"),
    )
    assert.equal(interno.status, 404)
  })

  it("nao aceita o cookie de uma superficie na outra", async () => {
    // Escopos separados na derivação: o valor do cookie interno não vale em
    // /preview, mesmo com os dois tokens configurados.
    env.NODE_ENV = "production"
    env.VERCEL_ENV = "production"
    env.PF_PREVIEW_TOKEN = "preview-secret-token-123456"
    env.PF_INTERNAL_TOKEN = "internal-secret-token-123456"

    const derivadoInterno = await deriveAccessCookieValue("internal-secret-token-123456", "internal")
    const response = await middleware(
      request("http://localhost/preview/candidato/lula", `pf_preview_token=${derivadoInterno}`),
    )

    assert.equal(response.status, 404)
  })

  it("fails closed in Vercel production when the preview token is missing or too short", async () => {
    env.NODE_ENV = "production"
    env.VERCEL_ENV = "production"
    env.PF_PREVIEW_TOKEN = "short-token"

    const response = await middleware(
      request("http://localhost/preview/candidato/lula?token=short-token"),
    )

    assert.equal(response.status, 404)
  })

  it("fails closed on Vercel PREVIEW deployments when the token is missing or too short", async () => {
    // Regressão 2026-06-09: o fallback hardcoded "local-preview" valia em qualquer
    // env != production, então preview deployments expunham fichas não publicadas.
    env.NODE_ENV = "production"
    env.VERCEL = "1"
    env.VERCEL_ENV = "preview"
    delete env.PF_PREVIEW_TOKEN

    const missing = await middleware(request("http://localhost/preview/candidato/lula"))
    assert.equal(missing.status, 404)

    env.PF_PREVIEW_TOKEN = "short-token"
    const weak = await middleware(
      request("http://localhost/preview/candidato/lula?token=short-token"),
    )
    assert.equal(weak.status, 404)
  })

  it("fails closed on any deployed Vercel env (VERCEL=1) even with VERCEL_ENV unset", async () => {
    // Ancorar em VERCEL==="1" garante fail-closed mesmo se VERCEL_ENV não vier.
    env.NODE_ENV = "production"
    env.VERCEL = "1"
    delete env.VERCEL_ENV
    delete env.PF_PREVIEW_TOKEN

    const missing = await middleware(request("http://localhost/preview/candidato/lula"))
    assert.equal(missing.status, 404)

    env.PF_PREVIEW_TOKEN = "preview-secret-token-123456"
    const bootstrap = await middleware(
      request("http://localhost/preview/candidato/lula?token=preview-secret-token-123456"),
    )
    const derivado = await deriveAccessCookieValue("preview-secret-token-123456", "preview")
    assert.equal(bootstrap.status, 307)
    assert.match(bootstrap.headers.get("set-cookie") ?? "", new RegExp(`pf_preview_token=${derivado}`))
  })

  it("applies the same token bootstrap flow to internaltest and styleguide routes", async () => {
    env.NODE_ENV = "production"
    delete env.VERCEL_ENV
    env.PF_INTERNAL_TOKEN = "internal-secret-token"

    const denied = await middleware(request("http://localhost/internaltest"))
    assert.equal(denied.status, 404)

    const derivado = await deriveAccessCookieValue("internal-secret-token", "internal")
    const bootstrap = await middleware(
      request("http://localhost/internaltest?token=internal-secret-token"),
    )
    const setCookie = bootstrap.headers.get("set-cookie") ?? ""
    assert.equal(bootstrap.status, 307)
    assert.equal(bootstrap.headers.get("location"), "http://localhost/internaltest")
    assert.match(setCookie, new RegExp(`pf_internal_token=${derivado}`))
    assert.equal(setCookie.includes("internal-secret-token"), false)
    // Limitado à superfície do bootstrap: com Path=/ o cookie viajava em toda
    // requisição pública do site sem precisar disso.
    assert.match(setCookie, /Path=\/internaltest/)

    const viaCookie = await middleware(
      request("http://localhost/styleguide", `pf_internal_token=${derivado}`),
    )
    assert.equal(viaCookie.headers.get("x-middleware-next"), "1")

    const bootstrapStyleguide = await middleware(
      request("http://localhost/styleguide?token=internal-secret-token"),
    )
    assert.match(bootstrapStyleguide.headers.get("set-cookie") ?? "", /Path=\/styleguide/)
  })

  it("fails closed in Vercel production when the internal token is missing or too short", async () => {
    env.NODE_ENV = "production"
    env.VERCEL_ENV = "production"
    delete env.PF_INTERNAL_TOKEN

    const missing = await middleware(request("http://localhost/internaltest"))
    assert.equal(missing.status, 404)

    env.PF_INTERNAL_TOKEN = "short-token"
    const weak = await middleware(request("http://localhost/internaltest?token=short-token"))
    assert.equal(weak.status, 404)
  })

  it("returns 404 for malformed candidato slugs without querying the slug list", async () => {
    let called = false
    globalThis.fetch = async () => {
      called = true
      throw new Error("slug list should not be fetched for malformed slugs")
    }

    const response = await middleware(request("http://localhost/candidato/slug%20invalido"))

    assert.equal(called, false)
    assert.equal(response.status, 404)
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow")
  })

  it("allows valid candidato slugs returned by the internal slug list", async () => {
    globalThis.fetch = async (input, init) => {
      assert.equal(new URL(String(input)).pathname, "/api/candidato-slugs")
      assert.equal((init?.headers as Record<string, string>)["x-middleware-internal"], "candidato-slugs")
      return slugListResponse(["lula"])
    }

    const response = await middleware(request("http://localhost/candidato/lula"))

    assert.equal(response.headers.get("x-middleware-next"), "1")
  })

  /**
   * O fetch do middleware carregava `next: { revalidate: 300, tags: [...] }`, e
   * as duas opcoes sao IGNORADAS ali. O Next monta um work unit store do tipo
   * `request` para middleware, e o fetch instrumentado so acumula tag e
   * revalidate quando o store e de cache ou prerender; sem config explicita de
   * fetchCache ele ainda liga `autoNoCache`
   * (packages/next/src/server/lib/patch-fetch.ts, Next 16).
   *
   * Ou seja: nao existia Data Cache aqui para 300s governar, e
   * `revalidateTag("public-candidatos")` nunca alcancou esta chamada. O codigo
   * dizia o contrario de como o sistema se comporta, que e a pior forma de
   * documentacao. A frescura real vem do `s-maxage` da resposta.
   */
  it("nao passa opcoes de cache inertes no fetch do middleware", async () => {
    let recebido: RequestInit | undefined
    globalThis.fetch = async (_input, init) => {
      recebido = init
      return slugListResponse(["lula"])
    }

    await middleware(request("http://localhost/candidato/lula"))

    assert.ok(recebido, "o middleware precisa ter chamado o endpoint interno")
    assert.equal(
      (recebido as { next?: unknown }).next,
      undefined,
      "next.revalidate/next.tags nao fazem nada dentro do middleware; escrever isso mente sobre onde mora a frescura",
    )
  })

  it("returns 404 for unknown candidato slugs when the slug list is available", async () => {
    globalThis.fetch = async () => slugListResponse(["lula"])

    const response = await middleware(request("http://localhost/candidato/slug-desconhecido"))

    assert.equal(response.status, 404)
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8")
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow")
  })

  it("keeps candidato routes fail-open only when the internal slug list is unavailable", async () => {
    globalThis.fetch = async () => new Response("unavailable", { status: 503 })

    const response = await middleware(request("http://localhost/candidato/slug-qualquer"))

    assert.equal(response.headers.get("x-middleware-next"), "1")
  })

  it("impõe um teto de tempo no fetch da lista de slugs", async () => {
    // O `!res.ok` e o catch cobrem erro e status ruim, mas não conexão pendurada.
    // Sem AbortSignal, uma chamada travada segura /candidato/* (a rota mais quente)
    // até o limite do runtime.
    let recebido: RequestInit | undefined
    globalThis.fetch = async (_input, init) => {
      recebido = init
      return slugListResponse(["lula"])
    }

    await middleware(request("http://localhost/candidato/lula"))

    assert.ok(recebido?.signal, "o fetch precisa carregar um AbortSignal com teto de tempo")
    assert.equal(recebido?.signal?.aborted, false)
  })

  it("mantém fail-open quando o fetch da lista de slugs estoura o teto", async () => {
    globalThis.fetch = async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError")
    }

    const response = await middleware(request("http://localhost/candidato/slug-qualquer"))

    assert.equal(response.headers.get("x-middleware-next"), "1")
  })

  it("keeps embed routes public and frameable", async () => {
    const response = await middleware(request("http://localhost/embed/lula"))

    assert.equal(response.headers.get("x-middleware-next"), "1")
    assert.match(response.headers.get("Content-Security-Policy") ?? "", /frame-ancestors \*/)
  })
})
