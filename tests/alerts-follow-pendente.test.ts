/**
 * Follow perdido no re-subscribe de assinante já verificado.
 *
 * Cenário: a pessoa já confirmou o email um dia, agora abre a ficha num
 * navegador novo (ou depois de limpar cookies) e clica em "seguir". Sem cookie
 * de sessão, o subscribe não pode autorizar a inscrição ali, então manda o email
 * de gestão. Só que ele nunca criava a inscrição pedida: a pessoa recebia o
 * email, abria o link, e o candidato que ela quis seguir não estava lá. A UI
 * promete o contrário.
 *
 * O slug pedido passa a viajar no link de gestão, e /alertas/acesso efetiva o
 * follow DEPOIS de validar o manage token contra um assinante real, no mesmo
 * gate que já autoriza o cookie de sessão.
 */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import {
  AlertsRouteFixture,
  seedCandidate,
  seedSubscriber,
} from "./helpers/alerts-route-fixture"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { NextRequest } = require("next/server") as typeof import("next/server")
const { createSubscribeHandler } = require("../src/app/api/alerts/subscribe/route")
const { createAlertsAcessoHandler } = require("../src/app/(site)/alertas/acesso/route")

const NOW = new Date("2026-04-10T15:00:00.000Z")

function subscribeDeps(fixture: AlertsRouteFixture) {
  return {
    createAlertsServiceRoleClient: () => fixture.createClient(),
    findPublicCandidateBySlug: (slug: string) => fixture.findPublicCandidateBySlug(slug),
    findSubscriberByEmailHash: (emailHash: string) => fixture.findSubscriberByEmailHash(emailHash),
    findSubscriberByManageToken: (manageToken: string) =>
      fixture.findSubscriberByManageToken(manageToken),
    findSubscriberByVerifyAndManageToken: (verifyToken: string, manageToken: string) =>
      fixture.findSubscriberByVerifyAndManageToken(verifyToken, manageToken),
    sendTransactionalEmail: (input: Parameters<AlertsRouteFixture["sendTransactionalEmail"]>[0]) =>
      fixture.sendTransactionalEmail(input),
    logAlertsApiExit: fixture.logAlertsApiExit,
    logAlertsEvent: fixture.logAlertsEvent,
    now: () => new Date(NOW),
  }
}

function acessoDeps(fixture: AlertsRouteFixture) {
  return {
    findSubscriberByManageToken: (manageToken: string) =>
      fixture.findSubscriberByManageToken(manageToken),
    findPublicCandidateBySlug: (slug: string) => fixture.findPublicCandidateBySlug(slug),
    createAlertsServiceRoleClient: () => fixture.createClient(),
    logAlertsApiExit: fixture.logAlertsApiExit,
  }
}

function cenario() {
  const subscriber = seedSubscriber({
    id: "sub_follow_1",
    email: "ja-verificado@example.com",
    manageToken: "ManageTokenFollow001",
    verifyToken: "VerifyTokenFollow001",
    verified: true,
    verified_at: "2026-03-01T10:00:00.000Z",
    verify_token_hash: null,
  })
  const fixture = new AlertsRouteFixture({
    candidatos_publico: [seedCandidate()],
    alert_subscribers: [subscriber],
    alert_subscriptions: [],
  })
  return { fixture, subscriber }
}

function subscribeSemCookie(email: string, candidateSlug: string) {
  return new NextRequest("http://localhost/api/alerts/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "x-forwarded-for": "198.51.100.10",
    },
    body: JSON.stringify({ email, candidateSlug }),
  })
}

function extrairLinkDeGestao(texto: string): URL {
  const match = /https?:\/\/\S*\/alertas\/acesso\?\S+/.exec(texto)
  assert.ok(match, `email de gestão sem link de acesso:\n${texto}`)
  return new URL(match[0])
}

describe("follow pendente no link de gestão", () => {
  it("subscribe de verificado sem sessão manda o slug no link, e o acesso cria a inscrição", async () => {
    const { fixture } = cenario()
    const subscribe = createSubscribeHandler(subscribeDeps(fixture))
    const acesso = createAlertsAcessoHandler(acessoDeps(fixture))

    const resposta = await subscribe(subscribeSemCookie("ja-verificado@example.com", "lula"))
    assert.equal(resposta.status, 200)
    assert.equal(
      fixture.getTable("alert_subscriptions").length,
      0,
      "o subscribe continua sem criar a inscrição neste ramo; quem cria é o acesso",
    )
    assert.equal(fixture.emails.length, 1)

    const link = extrairLinkDeGestao(fixture.emails[0].text ?? "")
    assert.equal(link.searchParams.get("follow"), "lula", `link sem follow: ${link.toString()}`)
    const manageToken = link.searchParams.get("manage")
    assert.ok(manageToken)

    await acesso(new NextRequest(`http://localhost${link.pathname}${link.search}`))

    const inscricoes = fixture.getTable("alert_subscriptions")
    assert.equal(inscricoes.length, 1, "o follow pedido tinha que existir depois de abrir o link")
    assert.equal(inscricoes[0].candidato_id, "cand_lula")
    assert.equal(inscricoes[0].subscriber_id, "sub_follow_1")
  })

  it("abrir o link duas vezes não duplica a inscrição", async () => {
    const { fixture } = cenario()
    const subscribe = createSubscribeHandler(subscribeDeps(fixture))
    const acesso = createAlertsAcessoHandler(acessoDeps(fixture))

    await subscribe(subscribeSemCookie("ja-verificado@example.com", "lula"))
    const link = extrairLinkDeGestao(fixture.emails[0].text ?? "")
    const req = () => new NextRequest(`http://localhost${link.pathname}${link.search}`)

    await acesso(req())
    await acesso(req())

    assert.equal(fixture.getTable("alert_subscriptions").length, 1)
  })

  it("follow só vale com manage token de assinante real", async () => {
    const { fixture } = cenario()
    const acesso = createAlertsAcessoHandler(acessoDeps(fixture))

    // Token no formato certo, mas que não corresponde a ninguém: o mesmo gate
    // que impede fixação de sessão impede o follow.
    const resposta = await acesso(
      new NextRequest("http://localhost/alertas/acesso?manage=ManageTokenInventado999&follow=lula"),
    )

    assert.equal(fixture.getTable("alert_subscriptions").length, 0)
    assert.equal(
      resposta.headers.get("set-cookie"),
      null,
      "token desconhecido não pode virar sessão nem follow",
    )
  })

  it("slug desconhecido não cria inscrição e não derruba a navegação", async () => {
    const { fixture } = cenario()
    const acesso = createAlertsAcessoHandler(acessoDeps(fixture))

    const resposta = await acesso(
      new NextRequest("http://localhost/alertas/acesso?manage=ManageTokenFollow001&follow=nao-existe"),
    )

    assert.equal(fixture.getTable("alert_subscriptions").length, 0)
    assert.equal(resposta.status, 307, "continua sendo um redirect normal")
    assert.ok(resposta.headers.get("set-cookie"), "a sessão válida continua sendo concedida")
  })

  it("link sem follow continua funcionando como antes", async () => {
    const { fixture } = cenario()
    const acesso = createAlertsAcessoHandler(acessoDeps(fixture))

    const resposta = await acesso(
      new NextRequest("http://localhost/alertas/acesso?manage=ManageTokenFollow001"),
    )

    assert.equal(fixture.getTable("alert_subscriptions").length, 0)
    assert.ok(resposta.headers.get("set-cookie"))
  })
})
