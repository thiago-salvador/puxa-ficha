import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, test } from "node:test"
import { NextRequest } from "next/server"

import {
  resendEventDesligaCanal,
  resendEventDestinatarios,
  signResendWebhookForTest,
  verifyResendWebhook,
} from "../src/lib/resend-webhook"

// Mesmo padrão dos outros testes de rota: o módulo importa `server-only`.
const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
const { createResendWebhookHandler } =
  require("../src/app/api/webhooks/resend/route") as typeof import("../src/app/api/webhooks/resend/route")

const SECRET = `whsec_${Buffer.from("segredo-de-teste-com-32-bytes-ok!").toString("base64")}`
const NOW = new Date("2026-09-02T12:00:00.000Z")
const TS = String(Math.floor(NOW.getTime() / 1000))

function assinado(payload: string, overrides: Partial<{ id: string; timestamp: string; secret: string }> = {}) {
  const id = overrides.id ?? "msg_123"
  const timestamp = overrides.timestamp ?? TS
  const secret = overrides.secret ?? SECRET
  return { id, timestamp, signature: signResendWebhookForTest({ payload, id, timestamp, secret }) }
}

describe("verificacao da assinatura Svix", () => {
  test("aceita assinatura correta e recusa corpo, id, timestamp ou segredo diferentes", () => {
    const payload = '{"type":"email.bounced"}'
    const h = assinado(payload)
    assert.deepEqual(verifyResendWebhook({ payload, headers: h, secret: SECRET, now: () => NOW }), { ok: true })
    assert.equal(verifyResendWebhook({ payload: payload + " ", headers: h, secret: SECRET, now: () => NOW }).ok, false)
    assert.equal(verifyResendWebhook({ payload, headers: { ...h, id: "outro" }, secret: SECRET, now: () => NOW }).ok, false)
    assert.equal(verifyResendWebhook({ payload, headers: h, secret: `whsec_${Buffer.from("outro segredo").toString("base64")}`, now: () => NOW }).ok, false)
  })

  test("recusa replay fora da tolerancia, headers ausentes e segredo sem prefixo", () => {
    const payload = "{}"
    const velho = assinado(payload, { timestamp: String(Number(TS) - 3600) })
    assert.deepEqual(verifyResendWebhook({ payload, headers: velho, secret: SECRET, now: () => NOW }), { ok: false, reason: "fora_da_tolerancia" })
    assert.deepEqual(verifyResendWebhook({ payload, headers: { id: null, timestamp: TS, signature: "v1,x" }, secret: SECRET, now: () => NOW }), { ok: false, reason: "headers_ausentes" })
    assert.deepEqual(verifyResendWebhook({ payload, headers: assinado(payload), secret: "sem-prefixo", now: () => NOW }), { ok: false, reason: "segredo_invalido" })
  })

  test("aceita lista com mais de uma assinatura (rotacao de segredo)", () => {
    const payload = '{"type":"email.complained"}'
    const h = assinado(payload)
    const outra = signResendWebhookForTest({ payload, id: h.id, timestamp: h.timestamp, secret: `whsec_${Buffer.from("antigo").toString("base64")}` })
    assert.equal(verifyResendWebhook({ payload, headers: { ...h, signature: `${outra} ${h.signature}` }, secret: SECRET, now: () => NOW }).ok, true)
  })
})

describe("classificacao do evento", () => {
  test("bounce permanente e reclamacao desligam; bounce transitorio e entregue nao", () => {
    assert.equal(resendEventDesligaCanal({ type: "email.bounced", data: { bounce: { type: "Permanent" } } }), true)
    assert.equal(resendEventDesligaCanal({ type: "email.complained" }), true)
    assert.equal(resendEventDesligaCanal({ type: "email.bounced", data: { bounce: { type: "Transient" } } }), false)
    assert.equal(resendEventDesligaCanal({ type: "email.delivered" }), false)
    assert.deepEqual(resendEventDestinatarios({ type: "x", data: { to: [" a@b.c ", ""] } }), ["a@b.c"])
    assert.deepEqual(resendEventDestinatarios({ type: "x", data: { to: "a@b.c" } }), ["a@b.c"])
  })
})

describe("rota /api/webhooks/resend", () => {
  const URL_ = "https://puxaficha.com.br/api/webhooks/resend"
  function request(payload: string, headers: Record<string, string>) {
    return new NextRequest(URL_, { method: "POST", body: payload, headers })
  }
  function headers(payload: string) {
    const h = assinado(payload)
    return { "svix-id": h.id, "svix-timestamp": h.timestamp, "svix-signature": h.signature, "content-type": "application/json" }
  }

  test("sem segredo responde 503 sem tocar no Supabase; assinatura invalida responde 401", async () => {
    let chamadas = 0
    const semSegredo = createResendWebhookHandler({ secret: "", desligarCanal: async () => { chamadas += 1; return 1 }, now: () => NOW })
    assert.equal((await semSegredo(request("{}", headers("{}")))).status, 503)
    const handler = createResendWebhookHandler({ secret: SECRET, desligarCanal: async () => { chamadas += 1; return 1 }, now: () => NOW })
    assert.equal((await handler(request("{}", { ...headers("{}"), "svix-signature": "v1,AAAA" }))).status, 401)
    assert.equal(chamadas, 0)
  })

  test("bounce permanente desliga o canal pelo hash do email e responde 200", async () => {
    const hashes: string[] = []
    const handler = createResendWebhookHandler({ secret: SECRET, desligarCanal: async (hash) => { hashes.push(hash); return 1 }, now: () => NOW })
    const payload = JSON.stringify({ type: "email.bounced", data: { email_id: "e1", to: ["Alguem@Example.com"], bounce: { type: "Permanent", subType: "General" } } })
    const response = await handler(request(payload, headers(payload)))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, acao: "canal_email_desligado", type: "email.bounced", destinatarios: 1, desligados: 1 })
    assert.equal(hashes.length, 1)
    assert.match(hashes[0], /^[0-9a-f]{64}$/u)
    assert.ok(!hashes[0].includes("@"), "o email nunca sai em claro")
  })

  test("bounce transitorio e outros eventos sao ignorados com 200; falha no Supabase responde 500 para a Resend reenviar", async () => {
    const handler = createResendWebhookHandler({ secret: SECRET, desligarCanal: async () => { throw new Error("timeout") }, now: () => NOW })
    const transitorio = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.c"], bounce: { type: "Transient" } } })
    const r1 = await handler(request(transitorio, headers(transitorio)))
    assert.equal(r1.status, 200)
    assert.equal(((await r1.json()) as { acao: string }).acao, "ignorado")

    const permanente = JSON.stringify({ type: "email.complained", data: { to: ["a@b.c"] } })
    assert.equal((await handler(request(permanente, headers(permanente)))).status, 500)
  })
})
