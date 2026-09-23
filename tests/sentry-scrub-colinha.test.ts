import assert from "node:assert/strict"
import { test } from "node:test"
import { redactSensitiveUrl, scrubSentryEvent } from "../src/lib/sentry-scrub"

const choiceUrl = "https://puxaficha.com.br/colinha?uf=SP&df=111&s1=222&s2=333"
const cardUrl = "https://puxaficha.com.br/api/colinha/card?uf=SP&df=111&s1=222&format=feed"

test("redige todas as escolhas em links da página e do cartão", () => {
  for (const url of [choiceUrl, cardUrl]) {
    const redacted = redactSensitiveUrl(url) ?? ""
    assert.ok(redacted.endsWith("?[REDACTED]"))
    assert.ok(!redacted.includes("111"))
    assert.ok(!redacted.includes("SP"))
  }
})

test("redige request, Referer, breadcrumb, extra e mensagem de erro", () => {
  const event = {
    request: { url: cardUrl, query_string: "uf=SP&df=111", headers: { Referer: choiceUrl } },
    breadcrumbs: [{ data: { to: choiceUrl } }],
    extra: { description: `Falha ao abrir ${choiceUrl}` },
    exception: { values: [{ value: `Erro em ${cardUrl}` }] },
  }
  scrubSentryEvent(event)
  const serialized = JSON.stringify(event)
  for (const secret of ["df=111", "s1=222", "s2=333", "uf=SP"]) {
    assert.ok(!serialized.includes(secret), secret)
  }
  assert.ok(serialized.includes("[REDACTED]"))
})
