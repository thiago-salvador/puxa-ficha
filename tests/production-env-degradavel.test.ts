import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { validateProductionEnvironment } from "../src/lib/production-env"

const KEYS = [
  "VERCEL_ENV",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PF_QUIZ_SHORT_LINK_SALT",
  "PF_ALERTS_TOKEN_SALT",
  "PF_ALERTS_TOKEN_ENCRYPTION_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "PF_REVALIDATE_SECRET",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "PF_ALERTS_FROM_EMAIL",
  "SMTP_FROM",
] as const

const snapshot: Partial<Record<(typeof KEYS)[number], string | undefined>> = {}

function ambienteCompleto() {
  process.env.VERCEL_ENV = "production"
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service"
  process.env.PF_QUIZ_SHORT_LINK_SALT = "quiz-salt-at-least-present-for-test-32chars"
  process.env.PF_ALERTS_TOKEN_SALT = "alerts-token-salt-test-32-characters-xx"
  process.env.PF_ALERTS_TOKEN_ENCRYPTION_KEY = "11".repeat(32)
  process.env.RESEND_API_KEY = "re_test_fake_key_for_unit_test_only"
  process.env.CRON_SECRET = "cron-secret-test-at-least-24-chars-ok"
  process.env.PF_REVALIDATE_SECRET = "revalidate-secret-test-at-least-24-chars"
  process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.ingest.sentry.io/123"
}

/** Captura console.error sem deixar vazar para a saida do runner. */
function comConsoleErrorCapturado<T>(fn: () => T): { retorno: T; logs: string[] } {
  const original = console.error
  const logs: string[] = []
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "))
  }
  try {
    return { retorno: fn(), logs }
  } finally {
    console.error = original
  }
}

/**
 * Regressao de 2026-08-03 (master review).
 *
 * `validateProductionEnvironment` tratava TODA variavel como fatal. Efeito
 * medido: apagar a RESEND_API_KEY no painel (trocar de provedor de email, por
 * exemplo) derruba /candidato/*, /rankings, /comparar e /uf no proximo cold
 * start de qualquer funcao Node, sem precisar de redeploy, porque `register()`
 * lanca. Email nao tem relacao nenhuma com a ficha publica.
 *
 * A separacao NAO afrouxa PF_REVALIDATE_SECRET nem CRON_SECRET, cujas falhas
 * sao silenciosas e por isso continuam derrubando o boot.
 */
describe("validateProductionEnvironment separa critico de degradavel", () => {
  beforeEach(() => {
    for (const k of KEYS) snapshot[k] = process.env[k]
  })

  afterEach(() => {
    for (const k of KEYS) {
      if (snapshot[k] === undefined) delete process.env[k]
      else process.env[k] = snapshot[k]
    }
  })

  it("sem RESEND_API_KEY o boot SOBREVIVE e registra a feature degradada", () => {
    ambienteCompleto()
    delete process.env.RESEND_API_KEY

    const { logs } = comConsoleErrorCapturado(() => {
      assert.doesNotThrow(() => validateProductionEnvironment())
    })

    assert.equal(logs.length, 1, "a degradacao precisa aparecer em log, nao sumir em silencio")
    assert.match(logs[0], /RESEND_API_KEY/)
    assert.match(logs[0], /degradada/)
  })

  it("sem DSN do Sentry o boot sobrevive e registra", () => {
    ambienteCompleto()
    delete process.env.NEXT_PUBLIC_SENTRY_DSN
    delete process.env.SENTRY_DSN

    const { logs } = comConsoleErrorCapturado(() => {
      assert.doesNotThrow(() => validateProductionEnvironment())
    })
    assert.match(logs[0], /SENTRY_DSN/)
  })

  it("remetente mal formatado degrada, nao derruba", () => {
    ambienteCompleto()
    process.env.PF_ALERTS_FROM_EMAIL = "Puxa Ficha alertas@puxaficha.com.br"

    const { logs } = comConsoleErrorCapturado(() => {
      assert.doesNotThrow(() => validateProductionEnvironment())
    })
    assert.match(logs[0], /PF_ALERTS_FROM_EMAIL/)
  })

  it("PF_REVALIDATE_SECRET continua FATAL (falha silenciosa: serve dado velho pra sempre)", () => {
    ambienteCompleto()
    delete process.env.PF_REVALIDATE_SECRET
    assert.throws(() => validateProductionEnvironment(), /PF_REVALIDATE_SECRET/)
  })

  it("CRON_SECRET continua FATAL (falha silenciosa: crons respondem 401 e ninguem sabe)", () => {
    ambienteCompleto()
    delete process.env.CRON_SECRET
    assert.throws(() => validateProductionEnvironment(), /CRON_SECRET/)
  })

  it("Supabase continua FATAL", () => {
    ambienteCompleto()
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    assert.throws(() => validateProductionEnvironment(), /SUPABASE_SERVICE_ROLE_KEY/)
  })

  it("ambiente completo nao lanca e nao loga degradacao", () => {
    ambienteCompleto()
    const { logs } = comConsoleErrorCapturado(() => {
      assert.doesNotThrow(() => validateProductionEnvironment())
    })
    assert.equal(logs.length, 0)
  })

  it("fora de producao continua no-op mesmo com tudo faltando", () => {
    for (const k of KEYS) delete process.env[k]
    process.env.VERCEL_ENV = "preview"
    const { logs } = comConsoleErrorCapturado(() => {
      assert.doesNotThrow(() => validateProductionEnvironment())
    })
    assert.equal(logs.length, 0)
  })
})
