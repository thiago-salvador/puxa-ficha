import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, it } from "node:test"
import { DEFAULT_ALERTS_FROM_EMAIL } from "../../src/lib/email-from"
import { sendTransactionalEmail } from "../../src/lib/email"

const ENV_KEYS = ["RESEND_API_KEY", "PF_ALERTS_FROM_EMAIL", "PF_ALERTS_REPLY_TO_EMAIL"] as const
const envSnapshot: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}
let originalFetch: typeof globalThis.fetch

describe("email Reply-To server contract", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) envSnapshot[key] = process.env[key]
    process.env.RESEND_API_KEY = "re_test_fake_key_for_unit_test_only"
    delete process.env.PF_ALERTS_FROM_EMAIL
    process.env.PF_ALERTS_REPLY_TO_EMAIL = '"contato@puxaficha.com.br"'
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (envSnapshot[key] === undefined) delete process.env[key]
      else process.env[key] = envSnapshot[key]
    }
    globalThis.fetch = originalFetch
  })

  it("sends the configured Reply-To while preserving the existing Resend payload", async () => {
    let capturedUrl: string | URL | Request | undefined
    let capturedInit: RequestInit | undefined
    globalThis.fetch = async (input, init) => {
      capturedUrl = input
      capturedInit = init
      return new Response(JSON.stringify({ id: "email_pf24" }), { status: 200 })
    }

    await sendTransactionalEmail({
      to: ["primeiro@example.com", "segundo@example.com"],
      subject: "Assunto existente",
      html: "<p>HTML existente</p>",
      text: "Texto existente",
      headers: { "List-Unsubscribe": "<https://example.com/unsubscribe>" },
    })

    assert.equal(capturedUrl, "https://api.resend.com/emails")
    assert.equal(capturedInit?.method, "POST")
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      from: DEFAULT_ALERTS_FROM_EMAIL,
      to: ["primeiro@example.com", "segundo@example.com"],
      reply_to: "contato@puxaficha.com.br",
      subject: "Assunto existente",
      html: "<p>HTML existente</p>",
      text: "Texto existente",
      headers: { "List-Unsubscribe": "<https://example.com/unsubscribe>" },
    })
  })

  it("documents the server-only Reply-To authority in the environment catalog", () => {
    const environmentCatalog = readFileSync(
      new URL("../../Settings/AUTOMATIONS_AND_ENVIRONMENTS.md", import.meta.url),
      "utf8",
    )

    assert.match(environmentCatalog, /Alertas e email[^\n]+`PF_ALERTS_REPLY_TO_EMAIL`/)
    assert.doesNotMatch(environmentCatalog, /`NEXT_PUBLIC_PF_ALERTS_REPLY_TO_EMAIL`/)
  })

  for (const [label, value] of [
    ["missing", undefined],
    ["empty", "   "],
    ["invalid", "Puxa Ficha contato@puxaficha.com.br"],
    ["display-name", "Puxa Ficha <contato@puxaficha.com.br>"],
    ["multiple-addresses", "um@puxaficha.com.br,dois@puxaficha.com.br"],
    ["header-injection", "contato@puxaficha.com.br\r\nBcc: outro@example.com"],
    ["double-dot", "contato..alertas@puxaficha.com.br"],
  ] as const) {
    it(`rejects a ${label} Reply-To before any network call`, async () => {
      if (value === undefined) delete process.env.PF_ALERTS_REPLY_TO_EMAIL
      else process.env.PF_ALERTS_REPLY_TO_EMAIL = value
      let fetchCalls = 0
      globalThis.fetch = async () => {
        fetchCalls += 1
        throw new Error("network must not be called")
      }

      await assert.rejects(
        sendTransactionalEmail({
          to: "destinatario@example.com",
          subject: "Assunto",
          html: "<p>Conteudo</p>",
        }),
        /PF_ALERTS_REPLY_TO_EMAIL/,
      )
      assert.equal(fetchCalls, 0)
    })
  }
})
