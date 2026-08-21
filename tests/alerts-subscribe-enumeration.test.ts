/**
 * Anti-enumeracao no /api/alerts/subscribe (endurecimento de 2026-07-26).
 *
 * O endpoint respondia com corpos diferentes conforme o estado do email:
 * `manageLinkSent` para verificado, `requiresVerification` para cadastrado sem
 * verificar, e `cooldownActive` quando o envio tinha sido recente. Bastava
 * enviar um endereco para descobrir se ele estava na base e em que estagio.
 * Num site sobre politica, saber quem acompanha qual candidato nao e dano
 * hipotetico.
 *
 * Este teste trava a propriedade: os tres caminhos de sucesso respondem
 * exatamente o mesmo corpo. Os efeitos colaterais (linhas gravadas, email
 * disparado) continuam diferentes, e e isso que se quer: o comportamento muda,
 * a resposta observavel nao.
 */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import {
  AlertsRouteFixture,
  seedCandidate,
  seedSubscriber,
} from "./helpers/alerts-route-fixture"
import { hashTrustedClientIp } from "../src/lib/client-ip"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { NextRequest } = require("next/server") as typeof import("next/server")
const subscribeRoute = require("../src/app/api/alerts/subscribe/route")
const { createSubscribeHandler } = subscribeRoute

const NOW = new Date("2026-04-10T15:00:00.000Z")

function createDeps(fixture: AlertsRouteFixture) {
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

function subscribeRequest(email: string, ip: string) {
  return new NextRequest("http://localhost/api/alerts/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "sec-fetch-site": "same-origin",
      "x-vercel-forwarded-for": ip,
      "x-real-ip": ip,
    },
    body: JSON.stringify({ email, candidateSlug: "lula" }),
  })
}

/** Cada cenario usa um IP proprio para nao esbarrar no teto por janela. */
async function subscribeBody(fixture: AlertsRouteFixture, email: string, ip: string) {
  const response = await createSubscribeHandler(createDeps(fixture))(subscribeRequest(email, ip))
  assert.equal(response.status, 200, "os tres caminhos respondem 200")
  return (await response.json()) as Record<string, unknown>
}

describe("alerts subscribe: resposta neutra contra enumeracao", () => {
  it("responde identico para email novo, cadastrado sem verificar e ja verificado", async () => {
    const novo = new AlertsRouteFixture({ candidatos_publico: [seedCandidate()] })
    const corpoNovo = await subscribeBody(novo, "novo@example.com", "203.0.113.1")

    const naoVerificado = new AlertsRouteFixture({
      candidatos_publico: [seedCandidate()],
      alert_subscribers: [seedSubscriber({ email: "pendente@example.com", verified: false })],
    })
    const corpoNaoVerificado = await subscribeBody(
      naoVerificado,
      "pendente@example.com",
      "203.0.113.2",
    )

    const verificado = new AlertsRouteFixture({
      candidatos_publico: [seedCandidate()],
      alert_subscribers: [
        seedSubscriber({
          email: "verificado@example.com",
          verified: true,
          verified_at: "2026-04-01T10:00:00.000Z",
          verify_token_hash: null,
        }),
      ],
    })
    const corpoVerificado = await subscribeBody(
      verificado,
      "verificado@example.com",
      "203.0.113.3",
    )

    assert.deepEqual(
      corpoNovo,
      corpoNaoVerificado,
      "email novo e email pendente nao podem ser distinguiveis pela resposta",
    )
    assert.deepEqual(
      corpoNovo,
      corpoVerificado,
      "email verificado nao pode ser distinguivel pela resposta",
    )
  })

  it("nao vaza estado do assinante em nenhuma chave do corpo", async () => {
    const fixture = new AlertsRouteFixture({
      candidatos_publico: [seedCandidate()],
      alert_subscribers: [
        seedSubscriber({
          email: "verificado@example.com",
          verified: true,
          verified_at: "2026-04-01T10:00:00.000Z",
          verify_token_hash: null,
        }),
      ],
    })

    const corpo = await subscribeBody(fixture, "verificado@example.com", "203.0.113.4")

    for (const chaveProibida of [
      "verified",
      "manageLinkSent",
      "requiresVerification",
      "cooldownActive",
      "emailMasked",
    ]) {
      assert.equal(
        chaveProibida in corpo,
        false,
        `${chaveProibida} revela estado do assinante e nao pode voltar no corpo`,
      )
    }
  })

  it("aplica teto por IP tambem no caminho de assinante ja verificado", async () => {
    // O teto de banco so roda quando o email ainda nao existe. Sem o limitador
    // de processo, uma lista de emails verificados rendia um email por endereco
    // sem nunca esbarrar em teto de IP.
    const fixture = new AlertsRouteFixture({
      candidatos_publico: [seedCandidate()],
      alert_subscribers: [
        seedSubscriber({
          email: "verificado@example.com",
          verified: true,
          verified_at: "2026-04-01T10:00:00.000Z",
          verify_token_hash: null,
        }),
      ],
    })

    const handler = createSubscribeHandler(createDeps(fixture))
    const ip = "203.0.113.9"
    let bloqueou = false

    for (let tentativa = 0; tentativa < 40; tentativa += 1) {
      const response = await handler(subscribeRequest("verificado@example.com", ip))
      if (response.status === 429) {
        bloqueou = true
        break
      }
    }

    assert.equal(bloqueou, true, "o mesmo IP tem de esbarrar em 429 antes de 40 tentativas")
  })

  /**
   * Cenarios do teto duravel (2026-08-04).
   *
   * O teto em memoria e por instancia: em serverless cada instancia nova nasce
   * com o balde zerado, entao ele nunca foi teto de verdade. Os dois cenarios
   * abaixo usam IP inedito de proposito, o que deixa o balde em memoria daquele
   * IP zerado: se um 429 aparece, quem respondeu foi o contador de banco.
   */
  function seedAlvoVerificado(indice: number, ipHash: string) {
    return seedSubscriber({
      id: `sub_alvo_${indice}`,
      email: `alvo${indice}@example.com`,
      manageToken: `ManageTokenAlvo${indice}`,
      verified: true,
      verified_at: "2026-04-01T10:00:00.000Z",
      verify_token_hash: null,
      last_verification_email_sent_at: "2026-04-10T14:30:00.000Z",
      last_email_request_ip_hash: ipHash,
    })
  }

  function seedVerificadoLimpo() {
    return seedSubscriber({
      id: "sub_verificado",
      email: "verificado@example.com",
      manageToken: "ManageTokenVerificadoDuravel",
      verified: true,
      verified_at: "2026-04-01T10:00:00.000Z",
      verify_token_hash: null,
    })
  }

  it("barra o reenvio do link de gestao pelo contador de banco, sem depender do balde em memoria", async () => {
    const ip = "203.0.113.30"
    const ipHash = hashTrustedClientIp(
      new Headers({ "x-vercel-forwarded-for": ip }),
      "alerts-subscribe",
    )
    const fixture = new AlertsRouteFixture({
      candidatos_publico: [seedCandidate()],
      alert_subscribers: [
        ...Array.from({ length: 24 }, (_, indice) => seedAlvoVerificado(indice, ipHash)),
        seedVerificadoLimpo(),
      ],
    })

    const response = await createSubscribeHandler(createDeps(fixture))(
      subscribeRequest("verificado@example.com", ip),
    )

    assert.equal(response.status, 429, "o teto duravel tem de responder na primeira tentativa deste IP")
    assert.equal(fixture.emails.length, 0, "nenhum email pode sair depois do teto")
  })

  it("carimba o ip_hash do pedido no assinante que recebeu o email", async () => {
    const ip = "203.0.113.31"
    const ipHash = hashTrustedClientIp(
      new Headers({ "x-vercel-forwarded-for": ip }),
      "alerts-subscribe",
    )
    const fixture = new AlertsRouteFixture({
      candidatos_publico: [seedCandidate()],
      alert_subscribers: [seedVerificadoLimpo()],
    })

    const response = await createSubscribeHandler(createDeps(fixture))(
      subscribeRequest("verificado@example.com", ip),
    )

    assert.equal(response.status, 200)
    assert.equal(fixture.emails.length, 1)
    const assinante = fixture.getTable("alert_subscribers")[0]
    assert.equal(
      assinante?.last_email_request_ip_hash,
      ipHash,
      "sem o carimbo, o contador de banco nunca enxerga o envio",
    )
    assert.ok(assinante?.last_verification_email_sent_at, "o carimbo de tempo sustenta o cooldown")
  })

  it("degrada aberto enquanto a coluna do teto duravel nao existe no banco", async () => {
    // A migration nao e aplicada no mesmo instante do deploy. Sem coluna, o
    // PostgREST responde 42703; o envio precisa continuar acontecendo, com o
    // limitador em memoria e o cooldown como camadas restantes.
    const ip = "203.0.113.32"
    const fixture = new AlertsRouteFixture({
      candidatos_publico: [seedCandidate()],
      alert_subscribers: [seedVerificadoLimpo()],
    })
    fixture.failNextRpc({
      code: "42703",
      message: 'column alert_subscribers.last_email_request_ip_hash does not exist',
    })

    const response = await createSubscribeHandler(createDeps(fixture))(
      subscribeRequest("verificado@example.com", ip),
    )

    assert.equal(response.status, 200, "coluna ausente nao pode derrubar o endpoint")
    assert.equal(fixture.emails.length, 1, "o link de gestao continua saindo sem a coluna")
  })

  it("falha fechado quando a consulta do teto duravel quebra por outro motivo", async () => {
    // Contrapartida da degradacao acima: so coluna ausente libera. Banco fora do
    // ar nao pode virar bypass do teto, e este cenario tambem prova que quem
    // consome o erro e mesmo a consulta do teto.
    const ip = "203.0.113.33"
    const fixture = new AlertsRouteFixture({
      candidatos_publico: [seedCandidate()],
      alert_subscribers: [seedVerificadoLimpo()],
    })
    fixture.failNextRpc({ message: "connection reset" })

    const response = await createSubscribeHandler(createDeps(fixture))(
      subscribeRequest("verificado@example.com", ip),
    )

    assert.equal(response.status, 503, "sem contagem confiavel, o envio nao acontece")
    assert.equal(fixture.emails.length, 0)
  })
})
