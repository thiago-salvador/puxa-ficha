import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { rejectCrossSitePublicWrite } from "@/lib/public-write-origin-guard"

/**
 * `public-write-origin-guard` protege `/api/analytics/event` e
 * `/api/quiz/short-link` e, ate 2026-08-03, nao tinha um unico teste: era uma
 * copia linha a linha de `alerts-csrf`, que por sua vez e coberto de fato em
 * `tests/alerts-http.test.ts`. Duas copias da mesma allowlist com cobertura em
 * so uma delas e como ter uma so: a que ninguem exercita pode divergir em
 * silencio.
 */

const REQUEST_URL = "https://puxaficha.com.br/api/analytics/event"

function request(headers: Record<string, string>, url = REQUEST_URL) {
  return { url, headers: new Headers(headers) }
}

const envKeys = ["NEXT_PUBLIC_SITE_URL", "VERCEL_URL"] as const
const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>

afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
})

describe("rejectCrossSitePublicWrite libera o que e mesma origem", () => {
  it("origem igual a da propria request passa", () => {
    assert.equal(
      rejectCrossSitePublicWrite(request({ origin: "https://puxaficha.com.br" })),
      null,
    )
  })

  it("dominio de producao passa mesmo quando a request chega por outra origem", () => {
    const blocked = rejectCrossSitePublicWrite(
      request({ origin: "https://www.puxaficha.com.br" }, "https://pf.vercel.app/api/analytics/event"),
    )
    assert.equal(blocked, null)
  })

  it("preview deploy passa via VERCEL_URL (sem esquema no valor da env)", () => {
    process.env.VERCEL_URL = "pf-git-branch.vercel.app"
    const blocked = rejectCrossSitePublicWrite(
      request(
        { origin: "https://pf-git-branch.vercel.app" },
        "https://pf-git-branch.vercel.app/api/analytics/event",
      ),
    )
    assert.equal(blocked, null)
  })

  it("NEXT_PUBLIC_SITE_URL entra na allowlist", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.puxaficha.com.br"
    assert.equal(
      rejectCrossSitePublicWrite(request({ origin: "https://staging.puxaficha.com.br" })),
      null,
    )
  })

  it("config malformada e ignorada sem derrubar o guard", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "://isso-nao-e-url"
    assert.equal(
      rejectCrossSitePublicWrite(request({ origin: "https://puxaficha.com.br" })),
      null,
    )
    const blocked = rejectCrossSitePublicWrite(request({ origin: "https://evil.example" }))
    assert.equal(blocked?.status, 403)
  })

  it("sec-fetch-site same-origin passa", () => {
    assert.equal(
      rejectCrossSitePublicWrite(
        request({ origin: "https://puxaficha.com.br", "sec-fetch-site": "same-origin" }),
      ),
      null,
    )
  })
})

describe("rejectCrossSitePublicWrite bloqueia escrita de terceiro", () => {
  it("origem fora da allowlist vira 403 com motivo no header", async () => {
    const blocked = rejectCrossSitePublicWrite(request({ origin: "https://evil.example" }))

    assert.equal(blocked?.status, 403)
    assert.equal(blocked?.headers.get("x-pf-block-reason"), "csrf_origin_not_allowed")
    assert.equal(blocked?.headers.get("cache-control"), "no-store")
    assert.deepEqual(await blocked?.json(), { error: "Cross-site request blocked" })
  })

  it("sec-fetch-site cross-site bloqueia antes mesmo de olhar a origem", () => {
    const blocked = rejectCrossSitePublicWrite(
      request({ origin: "https://puxaficha.com.br", "sec-fetch-site": "Cross-Site" }),
    )

    assert.equal(blocked?.status, 403)
    assert.equal(blocked?.headers.get("x-pf-block-reason"), "csrf_sec_fetch_cross_site")
  })

  it("origem sintaticamente invalida e tratada como nao permitida", () => {
    const blocked = rejectCrossSitePublicWrite(request({ origin: "nao-e-uma-url" }))

    assert.equal(blocked?.status, 403)
    assert.equal(blocked?.headers.get("x-pf-block-reason"), "csrf_origin_not_allowed")
  })

  it("subdominio parecido nao passa (match e por origem exata)", () => {
    const blocked = rejectCrossSitePublicWrite(
      request({ origin: "https://puxaficha.com.br.evil.example" }),
    )

    assert.equal(blocked?.status, 403)
  })

  it("mesmo host em http nao passa por https", () => {
    const blocked = rejectCrossSitePublicWrite(request({ origin: "http://puxaficha.com.br" }))

    assert.equal(blocked?.status, 403)
  })
})

describe("modo requireOrigin", () => {
  it("sem requireOrigin, request sem Origin passa (contrato antigo, preservado)", () => {
    assert.equal(rejectCrossSitePublicWrite(request({})), null)
  })

  it("com requireOrigin, request sem Origin e bloqueada", () => {
    const blocked = rejectCrossSitePublicWrite(request({}), { requireOrigin: true })

    assert.equal(blocked?.status, 403)
    assert.equal(blocked?.headers.get("x-pf-block-reason"), "csrf_origin_missing")
  })

  it("com requireOrigin, Origin vazia conta como ausente", () => {
    const blocked = rejectCrossSitePublicWrite(request({ origin: "   " }), {
      requireOrigin: true,
    })

    assert.equal(blocked?.headers.get("x-pf-block-reason"), "csrf_origin_missing")
  })

  it("com requireOrigin, Origin valida continua passando", () => {
    assert.equal(
      rejectCrossSitePublicWrite(request({ origin: "https://puxaficha.com.br" }), {
        requireOrigin: true,
      }),
      null,
    )
  })
})

/**
 * Tripwire de implementacao. Os testes de comportamento acima passariam de novo
 * com a allowlist duplicada, porque as duas copias eram identicas. O que precisa
 * ficar amarrado e a ausencia da SEGUNDA copia: acrescentar um dominio em so um
 * dos dois arquivos era, ate aqui, uma mudanca silenciosa.
 */
describe("a allowlist de origens tem uma fonte unica", () => {
  const root = process.cwd()
  const consumidores = [
    "src/lib/alerts-csrf.ts",
    "src/lib/public-write-origin-guard.ts",
  ]

  for (const consumidor of consumidores) {
    it(`${consumidor} nao carrega a propria copia da allowlist`, () => {
      const fonte = readFileSync(join(root, consumidor), "utf8")

      assert.ok(
        fonte.includes("@/lib/cross-site-write-guard"),
        `${consumidor} deveria importar a decisao do modulo compartilhado`,
      )
      assert.ok(
        !fonte.includes("puxaficha.com.br"),
        `${consumidor} voltou a listar dominio na mao; a allowlist vive em cross-site-write-guard.ts`,
      )
      assert.ok(
        !fonte.includes("NEXT_PUBLIC_SITE_URL") && !fonte.includes("VERCEL_URL"),
        `${consumidor} voltou a ler env de origem direto; isso e trabalho do modulo compartilhado`,
      )
    })
  }
})
