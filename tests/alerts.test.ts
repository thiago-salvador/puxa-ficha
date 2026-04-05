import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildAlertDigestEmail,
  buildAlertManageUrl,
  buildAlertVerifyUrl,
  createAlertToken,
  hashAlertEmail,
  hashAlertIp,
  hashAlertToken,
  maskAlertEmail,
  normalizeAlertEmail,
  normalizeCandidateSlug,
  normalizeOpaqueToken,
} from "../src/lib/alerts-shared"

describe("alerts helpers", () => {
  it("normalizes email and candidate slug", () => {
    assert.equal(normalizeAlertEmail("  User+Test@Example.COM  "), "user+test@example.com")
    assert.equal(normalizeAlertEmail("sem-arroba"), null)
    assert.equal(normalizeCandidateSlug("  Luiz-Inacio-Lula-Da-Silva "), "luiz-inacio-lula-da-silva")
    assert.equal(normalizeCandidateSlug("slug invalido"), null)
  })

  it("creates opaque tokens accepted by the validator", () => {
    const token = createAlertToken()
    assert.equal(normalizeOpaqueToken(token), token)
    assert.ok(token.length >= 16)
  })

  it("hashes email, token and ip deterministically", () => {
    assert.equal(hashAlertEmail("User@Test.com"), hashAlertEmail("user@test.com"))
    assert.equal(hashAlertToken("abc123_valid-token"), hashAlertToken("abc123_valid-token"))
    assert.equal(hashAlertIp("127.0.0.1"), hashAlertIp("127.0.0.1"))
    assert.notEqual(hashAlertToken("abc123_valid-token"), hashAlertToken("abc123_valid-token-2"))
  })

  it("builds manage and verify urls on the public origin", () => {
    const manageUrl = buildAlertManageUrl("manage_token")
    const verifyUrl = buildAlertVerifyUrl("verify_token", "manage_token")

    assert.equal(manageUrl, "https://puxaficha.com.br/alertas/gerenciar?token=manage_token")
    assert.equal(
      verifyUrl,
      "https://puxaficha.com.br/alertas/verificar?token=verify_token&manage=manage_token",
    )
  })

  it("masks emails without leaking the full local-part", () => {
    assert.equal(maskAlertEmail("abcde@example.com"), "ab***@example.com")
    assert.equal(maskAlertEmail("x@example.com"), "x*@example.com")
  })

  it("builds digest email copy with management links", () => {
    const payload = buildAlertDigestEmail({
      items: [
        {
          candidateName: "Maria Teste",
          candidateMeta: "PSB · Governadora",
          changes: [
            {
              title: "Nova notícia publicada",
              description: "Resumo curto da atualização.",
            },
          ],
        },
      ],
      manageUrl: "https://puxaficha.com.br/alertas/gerenciar?token=abc",
      unsubscribeUrl: "https://puxaficha.com.br/alertas/gerenciar?token=abc#cancelar-tudo",
    })

    assert.match(payload.subject, /Maria Teste/)
    assert.match(payload.text, /Gerenciar alertas/)
    assert.match(payload.text, /Cancelar todos os alertas/)
    assert.match(payload.html, /Nova notícia publicada/)
  })
})
