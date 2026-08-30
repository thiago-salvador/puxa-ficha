import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, it } from "node:test"

// O módulo importa `server-only`, que só resolve sob a condição react-server.
const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { sendTransactionalEmail } =
  require("../src/lib/email") as typeof import("../src/lib/email")
const { buildDigestIdempotencyKey } =
  require("../src/app/api/alerts/send-digest/route") as typeof import("../src/app/api/alerts/send-digest/route")

const mutableEnv = process.env as Record<string, string | undefined>
const fetchOriginal = globalThis.fetch
let chamadas: Array<{ headers: Record<string, string>; body: unknown }> = []
const envSalvo: Record<string, string | undefined> = {}

beforeEach(() => {
  chamadas = []
  for (const chave of ["RESEND_API_KEY", "PF_ALERTS_FROM_EMAIL", "PF_ALERTS_REPLY_TO_EMAIL"]) {
    envSalvo[chave] = process.env[chave]
  }
  mutableEnv.RESEND_API_KEY = "re_teste"
  mutableEnv.PF_ALERTS_FROM_EMAIL = "Puxa Ficha <alertas@puxaficha.com.br>"
  mutableEnv.PF_ALERTS_REPLY_TO_EMAIL = "contato@puxaficha.com.br"
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    chamadas.push({ headers, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify({ id: "email_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = fetchOriginal
  for (const [chave, valor] of Object.entries(envSalvo)) {
    if (valor === undefined) delete mutableEnv[chave]
    else mutableEnv[chave] = valor
  }
})

/**
 * O `send-digest` aborta o fetch em 10s. A Resend pode ACEITAR o envio e ainda
 * assim estourar esse prazo: o catch marca o log como `failed`, o cron seguinte
 * reprocessa o assinante, e sem chave de idempotência ele recebe o digest duas
 * vezes. O header fecha essa janela (contrato da Resend: `Idempotency-Key`,
 * máximo 256 caracteres, expira em 24h).
 */
describe("Idempotency-Key no transporte de email", () => {
  it("manda o header quando o chamador passa a chave", async () => {
    await sendTransactionalEmail({
      to: "alguem@example.com",
      subject: "Digest",
      html: "<p>oi</p>",
      idempotencyKey: "pf-digest:abc:2026-08-30",
    })
    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0].headers["idempotency-key"], "pf-digest:abc:2026-08-30")
  })

  it("não manda o header quando não há chave", async () => {
    await sendTransactionalEmail({ to: "alguem@example.com", subject: "Oi", html: "<p>oi</p>" })
    assert.equal("idempotency-key" in chamadas[0].headers, false)
    // O User-Agent continua obrigatório: sem ele a Resend responde 403/1010.
    assert.match(chamadas[0].headers["user-agent"] ?? "", /PuxaFicha/)
  })

  it("chave vazia ou só espaço não vira header vazio", async () => {
    await sendTransactionalEmail({
      to: "a@example.com", subject: "s", html: "<p>x</p>", idempotencyKey: "   ",
    })
    assert.equal("idempotency-key" in chamadas[0].headers, false)
  })

  it("chave acima de 256 caracteres falha alto, em vez de enviar sem idempotência", async () => {
    await assert.rejects(
      sendTransactionalEmail({
        to: "a@example.com", subject: "s", html: "<p>x</p>", idempotencyKey: "k".repeat(257),
      }),
      /257 caracteres, acima do limite de 256/,
    )
    assert.equal(chamadas.length, 0, "não pode ter enviado nada")
  })
})

describe("chave do digest", () => {
  it("é estável entre tentativas e única por assinante e dia", () => {
    const a = buildDigestIdempotencyKey("sub-1", "2026-08-30")
    assert.equal(a, buildDigestIdempotencyKey("sub-1", "2026-08-30"))
    assert.notEqual(a, buildDigestIdempotencyKey("sub-2", "2026-08-30"))
    assert.notEqual(a, buildDigestIdempotencyKey("sub-1", "2026-08-31"))
  })

  it("cabe no limite da Resend com folga, mesmo com UUID", () => {
    const chave = buildDigestIdempotencyKey(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      "2026-08-30",
    )
    assert.ok(chave.length <= 256, `chave com ${chave.length} caracteres`)
    assert.ok(chave.length < 80, `folga menor do que o esperado: ${chave.length}`)
  })

  it("a rota do digest usa a chave, e a monta com subscriber e digestDate", async () => {
    const { readFileSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const src = readFileSync(
      fileURLToPath(new URL("../src/app/api/alerts/send-digest/route.ts", import.meta.url)),
      "utf-8",
    )
    assert.match(src, /idempotencyKey: buildDigestIdempotencyKey\(subscriber\.id, digestDate\)/)
  })
})
