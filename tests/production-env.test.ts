import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, it } from "node:test"
import {
  resolveReleaseVerifyCacheBypassToken,
  validateProductionEnvironment,
} from "../src/lib/production-env"

const KEYS = [
  "VERCEL_ENV",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PF_QUIZ_SHORT_LINK_SALT",
  "PF_ALERTS_TOKEN_SALT",
  "PF_ALERTS_TOKEN_ENCRYPTION_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "PF_REVALIDATE_SECRET",
  "PF_INTERNAL_TOKEN",
  "PF_PREVIEW_TOKEN",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "PF_ALERTS_FROM_EMAIL",
  "PF_ALERTS_REPLY_TO_EMAIL",
  "SMTP_FROM",
] as const

const snapshot: Partial<Record<(typeof KEYS)[number], string | undefined>> = {}

function setCompleteProductionEnv() {
  process.env.VERCEL_ENV = "production"
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service"
  process.env.PF_QUIZ_SHORT_LINK_SALT = "quiz-salt-at-least-present-for-test-32chars"
  process.env.PF_ALERTS_TOKEN_SALT = "alerts-token-salt-test-32-characters-xx"
  process.env.PF_ALERTS_TOKEN_ENCRYPTION_KEY = "11".repeat(32)
  process.env.RESEND_API_KEY = "re_test_fake_key_for_unit_test_only"
  process.env.PF_ALERTS_REPLY_TO_EMAIL = "contato@puxaficha.com.br"
  process.env.CRON_SECRET = "cron-secret-test-at-least-24-chars-ok"
  process.env.PF_REVALIDATE_SECRET = "revalidate-secret-test-at-least-24-chars"
  process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.ingest.sentry.io/123"
}

describe("validateProductionEnvironment", () => {
  beforeEach(() => {
    for (const k of KEYS) {
      snapshot[k] = process.env[k]
    }
  })

  afterEach(() => {
    for (const k of KEYS) {
      if (snapshot[k] === undefined) delete process.env[k]
      else process.env[k] = snapshot[k]
    }
  })

  it("no-op when VERCEL_ENV is not production", () => {
    delete process.env.VERCEL_ENV
    assert.doesNotThrow(() => validateProductionEnvironment())
    process.env.VERCEL_ENV = "preview"
    assert.doesNotThrow(() => validateProductionEnvironment())
    process.env.VERCEL_ENV = "development"
    assert.doesNotThrow(() => validateProductionEnvironment())
  })

  it("throws when production and required vars are missing", () => {
    process.env.VERCEL_ENV = "production"
    for (const k of KEYS) {
      if (k === "VERCEL_ENV") continue
      delete process.env[k]
    }
    assert.throws(() => validateProductionEnvironment(), /\[production-env\]/)
  })

  it("passes when production and all required vars are set", () => {
    setCompleteProductionEnv()
    assert.doesNotThrow(() => validateProductionEnvironment())
  })

  it("keeps internal and preview tokens optional at boot because middleware fails closed", () => {
    setCompleteProductionEnv()
    delete process.env.PF_INTERNAL_TOKEN
    delete process.env.PF_PREVIEW_TOKEN

    assert.doesNotThrow(() => validateProductionEnvironment())
  })

  it("accepts a sender copied with outer quotes and reports malformed sender values", () => {
    setCompleteProductionEnv()

    process.env.PF_ALERTS_FROM_EMAIL = '"Puxa Ficha <alertas@puxaficha.com.br>"'
    assert.doesNotThrow(() => validateProductionEnvironment())

    // Desde 2026-08-03, remetente mal formatado quebra SO o envio de email e por
    // isso e reportado como degradacao em vez de derrubar o boot do site
    // publico. A cobertura do caso continua: o que mudou e o canal, de excecao
    // para console.error. Detalhe em tests/production-env-degradavel.test.ts.
    process.env.PF_ALERTS_FROM_EMAIL = "Puxa Ficha alertas@puxaficha.com.br"
    const originalConsoleError = console.error
    const logs: string[] = []
    console.error = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "))
    }
    try {
      assert.doesNotThrow(() => validateProductionEnvironment())
    } finally {
      console.error = originalConsoleError
    }
    assert.match(logs.join("\n"), /PF_ALERTS_FROM_EMAIL ou SMTP_FROM em formato invalido/)
  })
})

/**
 * Regressão da queda de 2026-08-03.
 *
 * `PF_RELEASE_VERIFY_CACHE_BYPASS` e
 * `PF_ALLOW_RELEASE_VERIFY_CACHE_BYPASS_IN_PRODUCTION` ficaram ligadas em
 * produção por 106 dias. Com as duas setadas, `getCandidatoBySlugResource`
 * passava a ler `headers()` em toda ficha; header lido em runtime numa rota
 * estática dispara `app-static-to-dynamic-error` e o `/candidato/[slug]`
 * respondeu HTTP 500.
 *
 * O opt-in de produção deixou de existir: em `VERCEL_ENV=production` o bypass é
 * ignorado independente dele. Verificação de release com bypass roda em Preview.
 */
describe("bypass de cache do release-verify", () => {
  const BYPASS_KEYS = [
    "VERCEL_ENV",
    "PF_RELEASE_VERIFY_CACHE_BYPASS",
    "PF_ALLOW_RELEASE_VERIFY_CACHE_BYPASS_IN_PRODUCTION",
  ] as const
  const bypassSnapshot: Partial<Record<(typeof BYPASS_KEYS)[number], string | undefined>> = {}

  beforeEach(() => {
    for (const k of BYPASS_KEYS) bypassSnapshot[k] = process.env[k]
  })

  afterEach(() => {
    for (const k of BYPASS_KEYS) {
      if (bypassSnapshot[k] === undefined) delete process.env[k]
      else process.env[k] = bypassSnapshot[k]
    }
  })

  it("em produção o bypass é ignorado mesmo com as duas variáveis setadas", () => {
    process.env.VERCEL_ENV = "production"
    process.env.PF_RELEASE_VERIFY_CACHE_BYPASS = "token-de-verificacao"
    process.env.PF_ALLOW_RELEASE_VERIFY_CACHE_BYPASS_IN_PRODUCTION = "1"

    assert.equal(resolveReleaseVerifyCacheBypassToken(), null)
  })

  it("em produção nenhum valor do opt-in reabre o bypass", () => {
    process.env.VERCEL_ENV = "production"
    process.env.PF_RELEASE_VERIFY_CACHE_BYPASS = "token-de-verificacao"

    for (const optIn of ["1", "true", "yes", "0", ""]) {
      process.env.PF_ALLOW_RELEASE_VERIFY_CACHE_BYPASS_IN_PRODUCTION = optIn
      assert.equal(
        resolveReleaseVerifyCacheBypassToken(),
        null,
        `opt-in "${optIn}" reabriu o bypass em produção`,
      )
    }
  })

  it("em preview o bypass continua valendo, com o token limpo", () => {
    process.env.VERCEL_ENV = "preview"
    process.env.PF_RELEASE_VERIFY_CACHE_BYPASS = "  token-de-verificacao  "
    delete process.env.PF_ALLOW_RELEASE_VERIFY_CACHE_BYPASS_IN_PRODUCTION

    assert.equal(resolveReleaseVerifyCacheBypassToken(), "token-de-verificacao")
  })

  it("sem token o bypass fica desligado em qualquer ambiente", () => {
    delete process.env.PF_RELEASE_VERIFY_CACHE_BYPASS
    process.env.VERCEL_ENV = "preview"
    assert.equal(resolveReleaseVerifyCacheBypassToken(), null)

    process.env.PF_RELEASE_VERIFY_CACHE_BYPASS = "   "
    assert.equal(resolveReleaseVerifyCacheBypassToken(), null)
  })

  it("a ficha lê headers() apenas atrás do gate, sem consultar o opt-in", () => {
    const api = readFileSync("src/lib/api.ts", "utf8")

    assert.match(api, /const cacheBypass = resolveReleaseVerifyCacheBypassToken\(\)/)
    assert.doesNotMatch(api, /PF_ALLOW_RELEASE_VERIFY_CACHE_BYPASS_IN_PRODUCTION/)
    assert.doesNotMatch(api, /process\.env\.PF_RELEASE_VERIFY_CACHE_BYPASS/)
  })
})
