import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { puxaFichaNextConfig } from "../next.config"

type HeaderRule = {
  source: string
  headers: Array<{ key: string; value: string }>
  has?: Array<{ key: string }>
  missing?: Array<{ key: string }>
}

type RedirectRule = {
  source: string
  destination: string
  permanent: boolean
  has?: Array<{ type: string; value: string }>
}

function headerValue(rule: HeaderRule, key: string): string | null {
  return rule.headers.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value ?? null
}

describe("next security headers", () => {
  it("permite 127.0.0.1 no next dev para o browser harness local", () => {
    assert.deepEqual(puxaFichaNextConfig.allowedDevOrigins, ["127.0.0.1"])
  })

  it("aplica headers de iframe por path no embed e deixa CSP dinamico para o middleware", async () => {
    assert.ok(puxaFichaNextConfig.headers)
    const rules = (await puxaFichaNextConfig.headers()) as HeaderRule[]
    const embedRule = rules.find((rule) => rule.source === "/embed/:path+")
    const globalRule = rules.find((rule) => rule.source === "/((?!embed/).*)")

    assert.ok(embedRule)
    assert.ok(globalRule)

    assert.equal(headerValue(embedRule, "Content-Security-Policy"), null)
    assert.equal(headerValue(embedRule, "X-Frame-Options"), null)
    assert.equal(headerValue(embedRule, "X-Robots-Tag"), "noindex, nofollow")

    assert.equal(headerValue(globalRule, "Content-Security-Policy"), null)
    assert.equal(headerValue(globalRule, "X-Frame-Options"), "DENY")

    assert.equal(
      rules.some((rule) =>
        [...(rule.has ?? []), ...(rule.missing ?? [])].some((cond) => cond.key === "x-pf-embed-card")
      ),
      false
    )
  })

  it("mantem a rota nua /embed fora do noindex de iframe e dentro dos headers do site", async () => {
    assert.ok(puxaFichaNextConfig.headers)
    const rules = (await puxaFichaNextConfig.headers()) as HeaderRule[]
    const embedRule = rules.find((rule) => rule.source.startsWith("/embed/"))
    const globalRule = rules.find((rule) => rule.source.startsWith("/(("))

    assert.ok(embedRule)
    assert.ok(globalRule)

    // ":path+" exige pelo menos um segmento depois de /embed, entao a pagina nua
    // nao entra na regra do widget. Com ":path*" ela entrava e saia com noindex.
    assert.equal(embedRule.source, "/embed/:path+")
    assert.equal(embedRule.source.endsWith(":path*"), false)

    // O source da regra global ja e uma regex de path, entao da para exercitar
    // o casamento real em vez de confiar so na string.
    const globalMatcher = new RegExp(`^${globalRule.source}$`)
    assert.equal(globalMatcher.test("/embed"), true)
    assert.equal(globalMatcher.test("/embed/lula"), false)
    assert.equal(globalMatcher.test("/candidato/lula"), true)
    assert.equal(globalMatcher.test("/"), true)
  })
})

describe("next domain redirects", () => {
  it("canoniza www para apex sem depender de canonical ambíguo", async () => {
    assert.ok(puxaFichaNextConfig.redirects)
    const redirects = (await puxaFichaNextConfig.redirects()) as RedirectRule[]
    const wwwRedirect = redirects.find((rule) =>
      rule.has?.some((condition) => condition.type === "host" && condition.value === "www.puxaficha.com.br")
    )

    assert.ok(wwwRedirect)
    assert.equal(wwwRedirect.source, "/:path*")
    assert.equal(wwwRedirect.destination, "https://puxaficha.com.br/:path*")
    assert.equal(wwwRedirect.permanent, true)
  })

  it("redireciona /alertas para a tela de gerenciamento", async () => {
    assert.ok(puxaFichaNextConfig.redirects)
    const redirects = (await puxaFichaNextConfig.redirects()) as RedirectRule[]
    const alertsRedirect = redirects.find((rule) => rule.source === "/alertas")

    assert.deepEqual(alertsRedirect, {
      source: "/alertas",
      destination: "/alertas/gerenciar",
      permanent: true,
    })
  })
})
