import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, it } from "node:test"
import {
  AlertsRouteFixture,
  seedCandidate,
  seedSubscriber,
  type NotificationLogRow,
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
const { ALERT_MANAGE_TOKEN_COOKIE_NAME } = require("../src/lib/alerts-session")
const { createDeleteDataHandler } = require("../src/app/api/alerts/delete-data/route")
const { createSendDigestHandler } = require("../src/app/api/alerts/send-digest/route")
const { createSubscribeHandler } = require("../src/app/api/alerts/subscribe/route")
const { ALERT_SUBSCRIBE_HONEYPOT_FIELD } = require("../src/lib/alerts-honeypot") as typeof import("../src/lib/alerts-honeypot")
const { createSessionPostHandler } = require("../src/app/api/alerts/session/route")
const { createToggleHandler } = require("../src/app/api/alerts/toggle/route")
const { createUnsubscribeAllHandler } = require("../src/app/api/alerts/unsubscribe-all/route")
const { createVerifyHandler } = require("../src/app/api/alerts/verify/route")
const { rejectCrossSiteAlertsMutation } = require("../src/lib/alerts-csrf") as typeof import("../src/lib/alerts-csrf")
const alertsMeRoute = require("../src/app/api/alerts/me/route") as {
  GET: (req: InstanceType<typeof NextRequest>) => Promise<Response>
  POST: (req: InstanceType<typeof NextRequest>) => Promise<Response>
}
const { GET: getAlertsMe, POST: postAlertsMe } = alertsMeRoute

const NOW = new Date("2026-04-10T15:00:00.000Z")
const CRON_SECRET = "cron-secret"

function createDeps(fixture: AlertsRouteFixture, now = NOW) {
  return {
    createAlertsServiceRoleClient: () => fixture.createClient(),
    findPublicCandidateBySlug: (slug: string) => fixture.findPublicCandidateBySlug(slug),
    findSubscriberByEmailHash: (emailHash: string) => fixture.findSubscriberByEmailHash(emailHash),
    findSubscriberByManageToken: (manageToken: string) => fixture.findSubscriberByManageToken(manageToken),
    findSubscriberByVerifyAndManageToken: (verifyToken: string, manageToken: string) =>
      fixture.findSubscriberByVerifyAndManageToken(verifyToken, manageToken),
    sendTransactionalEmail: (input: Parameters<AlertsRouteFixture["sendTransactionalEmail"]>[0]) =>
      fixture.sendTransactionalEmail(input),
    logAlertsApiExit: fixture.logAlertsApiExit,
    logAlertsEvent: fixture.logAlertsEvent,
    now: () => new Date(now),
    sleep: async () => {},
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

function assertAlertManageCookie(response: Response, expectedValue: string | undefined): void {
  const setCookie = response.headers.get("set-cookie") ?? ""
  if (expectedValue === undefined) {
    assert.doesNotMatch(setCookie, new RegExp(`${ALERT_MANAGE_TOKEN_COOKIE_NAME}=`))
    return
  }

  assert.match(setCookie, new RegExp(`${ALERT_MANAGE_TOKEN_COOKIE_NAME}=${expectedValue}`))
}

type MutativeAlertsCase = {
  name: string
  path: string
  routeLog: string
  body: Record<string, unknown>
  createFixture: () => AlertsRouteFixture
  createHandler: (fixture: AlertsRouteFixture) => (req: InstanceType<typeof NextRequest>) => Promise<Response>
  assertAllowed: (fixture: AlertsRouteFixture, response: Response) => Promise<void>
  assertBlocked: (fixture: AlertsRouteFixture) => void
}

describe("alerts HTTP routes", () => {
  const savedCronSecret = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET
  })

  afterEach(() => {
    if (savedCronSecret === undefined) {
      delete process.env.CRON_SECRET
      return
    }

    process.env.CRON_SECRET = savedCronSecret
  })

  describe("CSRF guard for mutative alert routes", () => {
    const manageToken = "ManageTokenCsrf001"
    const verifyToken = "VerifyTokenCsrf001"

    function mutativeCases(): MutativeAlertsCase[] {
      return [
        {
          name: "subscribe",
          path: "/api/alerts/subscribe",
          routeLog: "subscribe",
          body: { email: "eleitor@example.com", candidateSlug: "lula" },
          createFixture: () =>
            new AlertsRouteFixture({
              candidatos_publico: [seedCandidate()],
            }),
          createHandler: (fixture) => createSubscribeHandler(createDeps(fixture)),
          assertAllowed: async (fixture, response) => {
            assert.equal(response.status, 200)
            assert.equal(fixture.getTable("alert_subscribers").length, 1)
            assert.equal(fixture.getTable("alert_subscriptions").length, 1)
            assert.equal(fixture.emails.length, 1)
          },
          assertBlocked: (fixture) => {
            assert.equal(fixture.getTable("alert_subscribers").length, 0)
            assert.equal(fixture.emails.length, 0)
          },
        },
        {
          name: "verify",
          path: "/api/alerts/verify",
          routeLog: "verify",
          body: { token: verifyToken, manageToken },
          createFixture: () =>
            new AlertsRouteFixture({
              alert_subscribers: [
                seedSubscriber({
                  id: "sub_csrf_verify",
                  manageToken,
                  verifyToken,
                  verified: false,
                  verified_at: null,
                  verify_token_expires_at: "2026-04-11T14:00:00.000Z",
                }),
              ],
            }),
          createHandler: (fixture) => createVerifyHandler(createDeps(fixture)),
          assertAllowed: async (fixture, response) => {
            assert.equal(response.status, 200)
            const subscriber = fixture.getTable("alert_subscribers")[0]
            assert.equal(subscriber?.verified, true)
            assert.equal(subscriber?.verify_token_hash, null)
          },
          assertBlocked: (fixture) => {
            const subscriber = fixture.getTable("alert_subscribers")[0]
            assert.equal(subscriber?.verified, false)
            assert.notEqual(subscriber?.verify_token_hash, null)
          },
        },
        {
          name: "toggle",
          path: "/api/alerts/toggle",
          routeLog: "toggle",
          body: { manageToken, candidateSlug: "lula" },
          createFixture: () =>
            new AlertsRouteFixture({
              candidatos_publico: [seedCandidate()],
              alert_subscribers: [
                seedSubscriber({ id: "sub_csrf_toggle", manageToken, verified: true }),
              ],
            }),
          createHandler: (fixture) => createToggleHandler(createDeps(fixture)),
          assertAllowed: async (fixture, response) => {
            assert.equal(response.status, 200)
            assert.equal(fixture.getTable("alert_subscriptions").length, 1)
          },
          assertBlocked: (fixture) => {
            assert.equal(fixture.getTable("alert_subscriptions").length, 0)
          },
        },
        {
          name: "delete-data",
          path: "/api/alerts/delete-data",
          routeLog: "delete-data",
          body: { manageToken },
          createFixture: () =>
            new AlertsRouteFixture({
              alert_subscribers: [
                seedSubscriber({ id: "sub_csrf_delete", manageToken, verified: true }),
              ],
            }),
          createHandler: (fixture) => createDeleteDataHandler(createDeps(fixture)),
          assertAllowed: async (fixture, response) => {
            assert.equal(response.status, 200)
            assert.equal(fixture.getTable("alert_subscribers").length, 0)
          },
          assertBlocked: (fixture) => {
            assert.equal(fixture.getTable("alert_subscribers").length, 1)
          },
        },
        {
          name: "unsubscribe-all",
          path: "/api/alerts/unsubscribe-all",
          routeLog: "unsubscribe-all",
          body: { manageToken },
          createFixture: () => {
            const subscriber = seedSubscriber({ id: "sub_csrf_cancel", manageToken, verified: true })
            return new AlertsRouteFixture({
              alert_subscribers: [subscriber],
              alert_subscriptions: [
                { id: "asub_csrf_1", subscriber_id: subscriber.id, candidato_id: "cand_lula" },
              ],
            })
          },
          createHandler: (fixture) => createUnsubscribeAllHandler(createDeps(fixture)),
          assertAllowed: async (fixture, response) => {
            assert.equal(response.status, 200)
            assert.equal(fixture.getTable("alert_subscriptions").length, 0)
          },
          assertBlocked: (fixture) => {
            assert.equal(fixture.getTable("alert_subscriptions").length, 1)
          },
        },
        {
          name: "session",
          path: "/api/alerts/session",
          routeLog: "session",
          body: { manageToken },
          createFixture: () =>
            new AlertsRouteFixture({
              alert_subscribers: [
                seedSubscriber({ id: "sub_csrf_session", manageToken, verified: true }),
              ],
            }),
          createHandler: (fixture) => createSessionPostHandler(createDeps(fixture)),
          assertAllowed: async (_fixture, response) => {
            assert.equal(response.status, 200)
            assertAlertManageCookie(response, manageToken)
          },
          assertBlocked: (fixture) => {
            assert.equal(fixture.getTable("alert_subscribers").length, 1)
          },
        },
      ]
    }

    for (const csrfCase of mutativeCases()) {
      it(`${csrfCase.name} rejects an external Origin before the manage token can mutate`, async () => {
        const fixture = csrfCase.createFixture()
        const response = await csrfCase.createHandler(fixture)(
          fixture.request(csrfCase.path, {
            body: csrfCase.body,
            headers: { origin: "https://evil.example" },
          }),
        )

        assert.equal(response.status, 403)
        // O verify é a única rota que já devolve o código estável de erro (`reason`),
        // usado pela tela de confirmação para escolher a mensagem em português.
        const csrfBody: Record<string, string> = { error: "Cross-site request blocked" }
        if (csrfCase.name === "verify") csrfBody.reason = "origem_bloqueada"
        assert.deepEqual(await readJson(response), csrfBody)
        csrfCase.assertBlocked(fixture)
        assert.deepEqual(fixture.apiExits.at(-1), {
          route: csrfCase.routeLog,
          status: 403,
          reason: "csrf_origin_not_allowed",
          detail: { origin: "https://evil.example", secFetchSite: null },
        })
      })

      it(`${csrfCase.name} rejects Sec-Fetch-Site cross-site`, async () => {
        const fixture = csrfCase.createFixture()
        const response = await csrfCase.createHandler(fixture)(
          fixture.request(csrfCase.path, {
            body: csrfCase.body,
            headers: { "sec-fetch-site": "cross-site" },
          }),
        )

        assert.equal(response.status, 403)
        csrfCase.assertBlocked(fixture)
      })

      it(`${csrfCase.name} allows same-origin browser requests`, async () => {
        const fixture = csrfCase.createFixture()
        const response = await csrfCase.createHandler(fixture)(
          fixture.request(csrfCase.path, {
            body: csrfCase.body,
            headers: { origin: "http://localhost", "sec-fetch-site": "same-origin" },
          }),
        )

        await csrfCase.assertAllowed(fixture, response)
      })

      it(`${csrfCase.name} keeps non-browser internal tests valid when browser headers are absent`, async () => {
        const fixture = csrfCase.createFixture()
        const response = await csrfCase.createHandler(fixture)(
          fixture.request(csrfCase.path, {
            body: csrfCase.body,
          }),
        )

        await csrfCase.assertAllowed(fixture, response)
      })
    }

    it("alerts-csrf helper allows same-origin and blocks external origins", async () => {
      const fixture = new AlertsRouteFixture()
      const exits: Array<{
        route: string
        status: number
        reason: string
        detail?: Record<string, unknown>
      }> = []
      const logger = (
        route: string,
        status: number,
        reason: string,
        detail?: Record<string, unknown>,
      ) => exits.push({ route, status, reason, detail })

      const allowed = rejectCrossSiteAlertsMutation(
        fixture.request("/api/alerts/subscribe", {
          body: {},
          headers: { origin: "http://localhost", "sec-fetch-site": "same-origin" },
        }),
        "subscribe",
        logger,
      )
      assert.equal(allowed, null)
      assert.deepEqual(exits, [])

      const blocked = rejectCrossSiteAlertsMutation(
        fixture.request("/api/alerts/subscribe", {
          body: {},
          headers: { origin: "https://evil.example" },
        }),
        "subscribe",
        logger,
      )
      assert.equal(blocked?.status, 403)
      assert.deepEqual(await readJson(blocked as Response), { error: "Cross-site request blocked" })
      assert.deepEqual(exits, [
        {
          route: "subscribe",
          status: 403,
          reason: "csrf_origin_not_allowed",
          detail: { origin: "https://evil.example", secFetchSite: null },
        },
      ])
    })
  })

  describe("POST /api/alerts/subscribe", () => {
    it("rejects invalid payload", async () => {
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
      })
      const handler = createSubscribeHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/subscribe", {
          body: {
            email: "sem-arroba",
            candidateSlug: "slug invalido",
          },
        }),
      )

      assert.equal(response.status, 400)
      assert.deepEqual(await readJson(response), { error: "Invalid payload" })
    })

    it("returns 204 without creating a subscriber when the honeypot is filled", async () => {
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
      })
      const handler = createSubscribeHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/subscribe", {
          body: {
            email: "bot@example.com",
            candidateSlug: "lula",
            [ALERT_SUBSCRIBE_HONEYPOT_FIELD]: "https://spam.example",
          },
        }),
      )

      assert.equal(response.status, 204)
      assert.equal(await response.text(), "")
      assert.equal(fixture.getTable("alert_subscribers").length, 0)
      assert.equal(fixture.getTable("alert_subscriptions").length, 0)
      assert.equal(fixture.emails.length, 0)
      assert.deepEqual(fixture.apiExits.at(-1), {
        route: "subscribe",
        status: 204,
        reason: "honeypot_filled",
        detail: undefined,
      })
    })

    it("keeps verification email when the honeypot is empty or whitespace", async () => {
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
      })
      const handler = createSubscribeHandler(createDeps(fixture))

      for (const honeypot of ["", "  \t  "]) {
        const response = await handler(
          fixture.request("/api/alerts/subscribe", {
            body: {
              email: `eleitor-${honeypot.length}@example.com`,
              candidateSlug: "lula",
              [ALERT_SUBSCRIBE_HONEYPOT_FIELD]: honeypot,
            },
            headers: {
              "x-forwarded-for": "198.51.100.70",
            },
          }),
        )

        assert.equal(response.status, 200)
        const body = await readJson<{ ok: boolean; emailSent: boolean }>(response)
        assert.equal(body.ok, true)
        assert.equal(body.emailSent, true)
      }

      const subscribers = fixture.getTable("alert_subscribers")
      assert.equal(subscribers.length, 2)
      assert.equal(
        subscribers.every((subscriber) => subscriber.verified === false),
        true,
      )
      assert.equal(fixture.getTable("alert_subscriptions").length, 2)
      assert.equal(fixture.emails.length, 2)
    })

    it("rejects cross-site subscribe because honeypot does not bypass CSRF", async () => {
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
      })
      const handler = createSubscribeHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/subscribe", {
          body: {
            email: "bot@example.com",
            candidateSlug: "lula",
            [ALERT_SUBSCRIBE_HONEYPOT_FIELD]: "https://spam.example",
          },
          headers: { origin: "https://evil.example" },
        }),
      )

      assert.equal(response.status, 403)
      assert.deepEqual(await readJson(response), { error: "Cross-site request blocked" })
      assert.equal(fixture.getTable("alert_subscribers").length, 0)
      assert.equal(fixture.emails.length, 0)
      assert.equal(fixture.apiExits.at(-1)?.reason, "csrf_origin_not_allowed")
    })

    it("returns 429 because honeypot does not bypass rate limit", async () => {
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
      })
      const handler = createSubscribeHandler(createDeps(fixture))
      const headers = { "x-forwarded-for": "198.51.100.77" }

      for (let i = 0; i < 12; i += 1) {
        const allowed = await handler(
          fixture.request("/api/alerts/subscribe", {
            body: {
              email: `bot${i}@example.com`,
              candidateSlug: "lula",
              [ALERT_SUBSCRIBE_HONEYPOT_FIELD]: "https://spam.example",
            },
            headers,
          }),
        )
        assert.equal(allowed.status, 204)
      }

      const blocked = await handler(
        fixture.request("/api/alerts/subscribe", {
          body: {
            email: "bot12@example.com",
            candidateSlug: "lula",
            [ALERT_SUBSCRIBE_HONEYPOT_FIELD]: "https://spam.example",
          },
          headers,
        }),
      )

      assert.equal(blocked.status, 429)
      assert.deepEqual(await readJson(blocked), { error: "Too many requests" })
      assert.equal(fixture.getTable("alert_subscribers").length, 0)
      assert.equal(fixture.emails.length, 0)
    })

    it("returns 404 when the candidate does not exist", async () => {
      const fixture = new AlertsRouteFixture()
      const handler = createSubscribeHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/subscribe", {
          body: {
            email: "eleitor@example.com",
            candidateSlug: "inexistente",
          },
        }),
      )

      assert.equal(response.status, 404)
      assert.deepEqual(await readJson(response), { error: "Candidate not found" })
    })

    it("creates a new subscriber, a pending subscription and sends the verification email", async () => {
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
      })
      const handler = createSubscribeHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/subscribe", {
          body: {
            email: "Eleitor+Teste@example.com",
            candidateSlug: "lula",
            nome: "Eleitor Teste",
          },
          headers: {
            "x-forwarded-for": "203.0.113.10",
          },
        }),
      )

      // Corpo neutro desde 2026-07-26: os tres caminhos de sucesso respondem
      // igual, para o endpoint nao virar oraculo de enumeracao. O que muda
      // entre eles sao os efeitos colaterais, verificados logo abaixo.
      const body = await readJson<{
        ok: boolean
        emailSent: boolean
        candidateSlug: string
      }>(response)

      assert.equal(response.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.emailSent, true)
      assert.equal(body.candidateSlug, "lula")

      assert.equal(fixture.getTable("alert_subscribers").length, 1)
      assert.equal(fixture.getTable("alert_subscriptions").length, 1)
      assert.equal(fixture.emails.length, 1)
      assert.equal(fixture.emails[0]?.to, "eleitor+teste@example.com")
      assert.match(fixture.emails[0]?.subject ?? "", /Confirme seu alerta sobre Lula/)
      assert.equal(fixture.extractAccessUrls(0).length, 3)
      assert.ok(fixture.getTable("alert_subscribers")[0]?.last_verification_email_sent_at)
    })

    it("keeps the pending subscription during verification cooldown without sending a new email", async () => {
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
        alert_subscribers: [
          seedSubscriber({
            verified: false,
            last_verification_email_sent_at: "2026-04-10T14:58:00.000Z",
            verifyToken: "VerifyTokenCool001",
            manageToken: "ManageTokenCool001",
          }),
        ],
      })
      const handler = createSubscribeHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/subscribe", {
          body: {
            email: "eleitor@example.com",
            candidateSlug: "lula",
          },
          headers: {
            "x-forwarded-for": "203.0.113.10",
          },
        }),
      )

      const body = await readJson<{ ok: boolean; emailSent: boolean }>(response)

      assert.equal(response.status, 200)
      assert.equal(body.ok, true)
      // Mesmo corpo do caminho sem cooldown, de proposito. O cooldown so se
      // manifesta no efeito: a assinatura pendente e gravada e nenhum email sai.
      assert.equal(body.emailSent, true)
      assert.equal(fixture.getTable("alert_subscriptions").length, 1)
      assert.equal(fixture.emails.length, 0)
    })

    it("sends a fresh manage link for a verified subscriber without a valid browser session", async () => {
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
        alert_subscribers: [
          seedSubscriber({
            verified: true,
            verified_at: "2026-04-08T10:00:00.000Z",
            last_verification_email_sent_at: "2026-04-09T10:00:00.000Z",
            manageToken: "ManageTokenVerified001",
            verify_token_hash: null,
          }),
        ],
      })
      const previousManageHash = fixture.getTable("alert_subscribers")[0]?.manage_token_hash
      const handler = createSubscribeHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/subscribe", {
          body: {
            email: "eleitor@example.com",
            candidateSlug: "lula",
          },
        }),
      )

      const body = await readJson<{ ok: boolean; emailSent: boolean }>(response)

      assert.equal(response.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.emailSent, true)
      // `verified` some do corpo de proposito: era a chave que denunciava se o
      // email ja estava na base e confirmado. O envio real do link de gestao
      // continua provado pelo efeito colateral.
      assert.equal("verified" in body, false)
      assert.equal(fixture.emails.length, 1)
      assert.notEqual(fixture.getTable("alert_subscribers")[0]?.manage_token_hash, previousManageHash)
    })

    it("follows immediately for a verified subscriber with a valid manage token", async () => {
      const manageToken = "ManageTokenDirect001"
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
        alert_subscribers: [
          seedSubscriber({
            verified: true,
            verified_at: "2026-04-08T10:00:00.000Z",
            manageToken,
            verify_token_hash: null,
          }),
        ],
      })
      const handler = createSubscribeHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/subscribe", {
          body: {
            email: "eleitor@example.com",
            candidateSlug: "lula",
            manageToken,
          },
        }),
      )

      const body = await readJson<{
        ok: boolean
        verified: boolean
        following: boolean
      }>(response)

      assert.equal(response.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.verified, true)
      assert.equal(body.following, true)
      assert.equal(fixture.getTable("alert_subscriptions").length, 1)
      assertAlertManageCookie(response, manageToken)
    })

    it("returns 503 when sending the verification email fails", async () => {
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
      })
      fixture.failNextEmail("transport down")
      const handler = createSubscribeHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/subscribe", {
          body: {
            email: "eleitor@example.com",
            candidateSlug: "lula",
          },
        }),
      )

      assert.equal(response.status, 503)
      assert.deepEqual(await readJson(response), {
        error: "Não foi possível enviar o e-mail de confirmação agora.",
      })
      assert.equal(fixture.getTable("alert_subscribers").length, 1)
      assert.equal(fixture.getTable("alert_subscriptions").length, 1)
      assert.equal(fixture.emails.length, 0)
    })
  })

  describe("POST /api/alerts/verify", () => {
    it("rejects invalid payload", async () => {
      const fixture = new AlertsRouteFixture()
      const handler = createVerifyHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/verify", {
          body: {
            token: "",
            manageToken: "",
          },
        }),
      )

      assert.equal(response.status, 400)
      assert.deepEqual(await readJson(response), {
        error: "Invalid payload",
        reason: "payload_invalido",
      })
    })

    it("returns 410 when the verification link expired", async () => {
      const manageToken = "ManageTokenVerify001"
      const verifyToken = "VerifyTokenVerify001"
      const fixture = new AlertsRouteFixture({
        alert_subscribers: [
          seedSubscriber({
            manageToken,
            verifyToken,
            verify_token_expires_at: "2026-04-09T14:00:00.000Z",
          }),
        ],
      })
      const handler = createVerifyHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/verify", {
          body: {
            token: verifyToken,
            manageToken,
          },
        }),
      )

      assert.equal(response.status, 410)
      assert.deepEqual(await readJson(response), {
        error: "Invalid or expired verification link",
        reason: "link_invalido_ou_expirado",
      })
      assert.match(
        response.headers.get("cache-control") ?? "",
        /no-store/i,
      )
    })

    it("returns a generic 410 (no cookie) when verify mismatches but the manage token was already verified", async () => {
      const manageToken = "ManageTokenVerified002"
      const fixture = new AlertsRouteFixture({
        alert_subscribers: [
          seedSubscriber({
            manageToken,
            verified: true,
            verified_at: "2026-04-08T10:00:00.000Z",
            verify_token_hash: null,
          }),
        ],
      })
      const handler = createVerifyHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/verify", {
          body: {
            token: "VerifyTokenUnused002",
            manageToken,
          },
        }),
      )

      assert.equal(response.status, 410)
      assert.deepEqual(await readJson(response), {
        error: "Invalid or expired verification link",
        reason: "link_invalido_ou_expirado",
      })
      // Uniformização: a resposta não pode sinalizar que o manage token era válido —
      // logo, nenhum cookie de sessão é setado neste caminho.
      assertAlertManageCookie(response, undefined)
    })

    it("returns a generic 410 for an unknown verify/manage pair (no cookie)", async () => {
      const fixture = new AlertsRouteFixture()
      const handler = createVerifyHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/verify", {
          body: {
            token: "VerifyTokenRandom999",
            manageToken: "ManageTokenRandom999",
          },
        }),
      )

      assert.equal(response.status, 410)
      assert.deepEqual(await readJson(response), {
        error: "Invalid or expired verification link",
        reason: "link_invalido_ou_expirado",
      })
      assertAlertManageCookie(response, undefined)
    })

    it("marks the subscriber as verified and stores the browser cookie", async () => {
      const manageToken = "ManageTokenVerify002"
      const verifyToken = "VerifyTokenVerify002"
      const fixture = new AlertsRouteFixture({
        alert_subscribers: [
          seedSubscriber({
            manageToken,
            verifyToken,
            verified: false,
            verified_at: null,
            verify_token_expires_at: "2026-04-11T14:00:00.000Z",
          }),
        ],
      })
      const handler = createVerifyHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/verify", {
          body: {
            token: verifyToken,
            manageToken,
          },
        }),
      )

      const body = await readJson<{ ok: boolean; verified: boolean }>(response)
      const subscriber = fixture.getTable("alert_subscribers")[0]

      assert.equal(response.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.verified, true)
      assert.equal(subscriber?.verified, true)
      assert.equal(subscriber?.verify_token_hash, null)
      assert.equal(subscriber?.verify_token_expires_at, null)
      assertAlertManageCookie(response, manageToken)
    })
  })

  describe("POST /api/alerts/toggle", () => {
    it("rejects an invalid manage token", async () => {
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
      })
      const handler = createToggleHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/toggle", {
          body: {
            manageToken: "ManageTokenUnknown001",
            candidateSlug: "lula",
          },
        }),
      )

      assert.equal(response.status, 403)
      assert.deepEqual(await readJson(response), { error: "Invalid manage token" })
    })

    it("blocks follow changes while the email is not verified", async () => {
      const manageToken = "ManageTokenUnverified001"
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
        alert_subscribers: [seedSubscriber({ manageToken, verified: false })],
      })
      const handler = createToggleHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/toggle", {
          body: {
            manageToken,
            candidateSlug: "lula",
          },
        }),
      )

      assert.equal(response.status, 409)
      assert.deepEqual(await readJson(response), { error: "Email verification required" })
    })

    it("creates a subscription when following a candidate", async () => {
      const manageToken = "ManageTokenToggle001"
      const subscriber = seedSubscriber({ id: "sub_toggle_1", manageToken, verified: true })
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
        alert_subscribers: [subscriber],
      })
      const handler = createToggleHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/toggle", {
          body: {
            manageToken,
            candidateSlug: "lula",
          },
        }),
      )

      assert.equal(response.status, 200)
      assert.deepEqual(await readJson(response), {
        ok: true,
        following: true,
        candidateSlug: "lula",
      })
      assert.equal(fixture.getTable("alert_subscriptions").length, 1)
    })

    it("removes an existing subscription when unfollowing", async () => {
      const manageToken = "ManageTokenToggle002"
      const subscriber = seedSubscriber({ id: "sub_toggle_2", manageToken, verified: true })
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
        alert_subscribers: [subscriber],
        alert_subscriptions: [
          {
            id: "asub_1",
            subscriber_id: subscriber.id,
            candidato_id: "cand_lula",
          },
        ],
      })
      const handler = createToggleHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/toggle", {
          body: {
            manageToken,
            candidateSlug: "lula",
          },
        }),
      )

      assert.equal(response.status, 200)
      assert.deepEqual(await readJson(response), {
        ok: true,
        following: false,
        candidateSlug: "lula",
      })
      assert.equal(fixture.getTable("alert_subscriptions").length, 0)
    })
  })

  describe("POST /api/alerts/delete-data", () => {
    it("rejects an invalid manage token", async () => {
      const fixture = new AlertsRouteFixture()
      const handler = createDeleteDataHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/delete-data", {
          body: {
            manageToken: "ManageTokenMissing001",
          },
        }),
      )

      assert.equal(response.status, 403)
      assert.deepEqual(await readJson(response), { error: "Invalid manage token" })
    })

    it("deletes subscriber data and clears the browser cookie", async () => {
      const manageToken = "ManageTokenDelete001"
      const subscriber = seedSubscriber({ id: "sub_delete_1", manageToken, verified: true })
      const fixture = new AlertsRouteFixture({
        alert_subscribers: [subscriber],
        alert_subscriptions: [
          { id: "asub_1", subscriber_id: subscriber.id, candidato_id: "cand_lula" },
        ],
        notification_log: [
          {
            id: "nlog_1",
            subscriber_id: subscriber.id,
            canal: "email",
            digest_date: "2026-04-10",
            status: "sent",
            error_message: null,
          },
        ],
      })
      const handler = createDeleteDataHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/delete-data", {
          body: {
            manageToken,
          },
        }),
      )

      assert.equal(response.status, 200)
      assert.deepEqual(await readJson(response), { ok: true })
      assert.equal(fixture.getTable("alert_subscribers").length, 0)
      assert.equal(fixture.getTable("alert_subscriptions").length, 0)
      assert.equal(fixture.getTable("notification_log").length, 0)
      assertAlertManageCookie(response, "")
    })
  })

  describe("POST /api/alerts/unsubscribe-all", () => {
    it("rejects an invalid manage token", async () => {
      const fixture = new AlertsRouteFixture()
      const handler = createUnsubscribeAllHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/unsubscribe-all", {
          body: {
            manageToken: "ManageTokenMissing002",
          },
        }),
      )

      assert.equal(response.status, 403)
      assert.deepEqual(await readJson(response), { error: "Invalid manage token" })
    })

    it("removes all subscriptions for the subscriber", async () => {
      const manageToken = "ManageTokenCancel001"
      const subscriber = seedSubscriber({ id: "sub_cancel_1", manageToken, verified: true })
      const fixture = new AlertsRouteFixture({
        alert_subscribers: [subscriber],
        alert_subscriptions: [
          { id: "asub_1", subscriber_id: subscriber.id, candidato_id: "cand_lula" },
          { id: "asub_2", subscriber_id: subscriber.id, candidato_id: "cand_haddad" },
        ],
      })
      const handler = createUnsubscribeAllHandler(createDeps(fixture))

      const response = await handler(
        fixture.request("/api/alerts/unsubscribe-all", {
          body: {
            manageToken,
          },
        }),
      )

      assert.equal(response.status, 200)
      assert.deepEqual(await readJson(response), { ok: true })
      assert.equal(fixture.getTable("alert_subscriptions").length, 0)
    })

    it("accepts the RFC 8058 one-click POST without a JSON body", async () => {
      const manageToken = "ManageTokenOneClick001"
      const subscriber = seedSubscriber({ id: "sub_one_click_1", manageToken, verified: true })
      const fixture = new AlertsRouteFixture({
        alert_subscribers: [subscriber],
        alert_subscriptions: [
          { id: "asub_one_click_1", subscriber_id: subscriber.id, candidato_id: "cand_lula" },
        ],
      })
      const handler = createUnsubscribeAllHandler(createDeps(fixture))

      const response = await handler(
        new NextRequest(
          `http://localhost/api/alerts/unsubscribe-all?manage=${manageToken}`,
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: "List-Unsubscribe=One-Click",
          },
        ),
      )

      assert.equal(response.status, 200)
      assert.deepEqual(await readJson(response), { ok: true })
      assert.equal(fixture.getTable("alert_subscriptions").length, 0)
    })
  })

  describe("POST /api/alerts/send-digest", () => {
    function buildDigestRequest(
      fixture: AlertsRouteFixture,
      query = "",
      auth = `Bearer ${CRON_SECRET}`,
    ) {
      return fixture.request(`/api/alerts/send-digest${query}`, {
        headers: auth ? { authorization: auth } : {},
      })
    }

    function baseDigestFixture() {
      const subscriber = seedSubscriber({
        id: "sub_digest_1",
        email: "digest@example.com",
        manageToken: "ManageTokenDigest001",
        verifyToken: "VerifyTokenDigest001",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })

      return new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
        alert_subscribers: [subscriber],
        alert_subscriptions: [
          { id: "asub_1", subscriber_id: subscriber.id, candidato_id: "cand_lula" },
        ],
      })
    }

    it("rejects requests without the cron secret", async () => {
      const fixture = new AlertsRouteFixture()
      const handler = createSendDigestHandler(createDeps(fixture))

      const response = await handler(buildDigestRequest(fixture, "", ""))

      assert.equal(response.status, 401)
      assert.deepEqual(await readJson(response), { error: "Unauthorized" })
    })

    it("returns an empty successful batch when there are no subscribers", async () => {
      const fixture = new AlertsRouteFixture()
      const handler = createSendDigestHandler(createDeps(fixture))

      const response = await handler(buildDigestRequest(fixture))

      assert.equal(response.status, 200)
      assert.deepEqual(await readJson(response), {
        ok: true,
        degradado: null,
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        enviadosSemRegistro: 0,
        cursor: 0,
        nextCursor: null,
        chainScheduled: false,
        chainDepth: 0,
        total: 0,
      })
    })

    it("skips verified subscribers that have no relevant changes in the current window", async () => {
      const fixture = baseDigestFixture()
      const handler = createSendDigestHandler(createDeps(fixture))

      const response = await handler(buildDigestRequest(fixture))

      const body = await readJson<{
        ok: boolean
        sent: number
        skipped: number
        failed: number
      }>(response)

      assert.equal(response.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.sent, 0)
      assert.equal(body.skipped, 1)
      assert.equal(body.failed, 0)
      assert.equal(fixture.emails.length, 0)
      assert.equal(fixture.getTable("notification_log").length, 0)
    })

    it("sends the digest, records notification_log and updates last_digest_sent_at", async () => {
      const fixture = baseDigestFixture()
      fixture.setTable("candidate_changes", [
        {
          id: "chg_1",
          candidato_id: "cand_lula",
          titulo: "Nova atualização editorial",
          descricao: "Texto curto da mudança.",
          created_at: "2026-04-10T12:00:00.000Z",
        },
      ])

      const handler = createSendDigestHandler(createDeps(fixture))
      const response = await handler(buildDigestRequest(fixture))
      const body = await readJson<{
        ok: boolean
        sent: number
        failed: number
        skipped: number
      }>(response)
      const logRow = fixture.getTable("notification_log")[0]
      const subscriber = fixture.getTable("alert_subscribers")[0]

      assert.equal(response.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.sent, 1)
      assert.equal(body.failed, 0)
      assert.equal(body.skipped, 0)
      assert.equal(fixture.emails.length, 1)
      assert.match(fixture.emails[0]?.subject ?? "", /Lula/)
      assert.equal(
        fixture.emails[0]?.headers?.["List-Unsubscribe"],
        "<https://puxaficha.com.br/api/alerts/unsubscribe-all?manage=ManageTokenDigest001>",
      )
      assert.equal(
        fixture.emails[0]?.headers?.["List-Unsubscribe-Post"],
        "List-Unsubscribe=One-Click",
      )
      assert.equal(logRow?.status, "sent")
      assert.equal(logRow?.sent_at, NOW.toISOString())
      assert.equal(subscriber?.last_digest_sent_at, NOW.toISOString())
    })

    it("marks notification_log as failed when the email provider throws", async () => {
      const fixture = baseDigestFixture()
      fixture.setTable("candidate_changes", [
        {
          id: "chg_1",
          candidato_id: "cand_lula",
          titulo: "Nova atualização editorial",
          descricao: "Texto curto da mudança.",
          created_at: "2026-04-10T12:00:00.000Z",
        },
      ])
      fixture.failNextEmail("resend down")

      const handler = createSendDigestHandler(createDeps(fixture))
      const response = await handler(buildDigestRequest(fixture))
      const body = await readJson<{
        ok: boolean
        sent: number
        failed: number
      }>(response)
      const logRow = fixture.getTable("notification_log")[0]

      // 500 e proposital: nenhum envio do lote concluiu. E o unico sinal que faz a
      // Vercel notificar falha de cron, e sem ele "RESEND_API_KEY revogada" era um
      // 200 ok:true silencioso. Review de 2026-08-03.
      assert.equal(response.status, 500)
      assert.equal(body.ok, false)
      assert.equal(body.sent, 0)
      assert.equal(body.failed, 1)
      assert.equal(logRow?.status, "failed")
      assert.equal(logRow?.error_message, "resend down")
    })

    /**
     * Regressao de 2026-08-03 (master review). Quando o email SAIA e so o
     * UPDATE do notification_log falhava, a rota gravava status 'failed'. Como
     * 'failed' nao e 'sent', a proxima execucao do mesmo dia passava direto pela
     * guarda `existingLog?.status === "sent"` e REENVIAVA o mesmo digest para
     * quem ja tinha recebido: a falha era de escrita no banco e o preco era pago
     * na caixa de entrada do assinante.
     *
     * O contrato mudou de proposito. O envio nao pode mais ser contado como
     * falha de envio, e o que impede o reenvio e a janela do assinante avancar.
     */
    it("nao marca como falha o digest que saiu e so nao conseguiu ser registrado", async () => {
      const fixture = baseDigestFixture()
      fixture.setTable("candidate_changes", [
        {
          id: "chg_1",
          candidato_id: "cand_lula",
          titulo: "Nova atualização editorial",
          descricao: "Texto curto da mudança.",
          created_at: "2026-04-10T12:00:00.000Z",
        },
      ])
      fixture.failNextUpdate("notification_log", "notification log unavailable")

      const handler = createSendDigestHandler(createDeps(fixture))
      const response = await handler(buildDigestRequest(fixture))
      const body = await readJson<{
        ok: boolean
        sent: number
        failed: number
        enviadosSemRegistro: number
        degradado: { registroPerdido: boolean; motivo: string } | null
      }>(response)
      const logRow = fixture.getTable("notification_log")[0]
      const subscriber = fixture.getTable("alert_subscribers")[0]

      // 500 continua: registro perdido e anomalia dura, e o unico mecanismo de
      // alerta de cron do projeto e a notificacao nativa da Vercel no 500.
      assert.equal(response.status, 500)
      assert.equal(body.ok, false)
      assert.equal(fixture.emails.length, 1)

      assert.equal(body.enviadosSemRegistro, 1)
      assert.equal(body.failed, 0, "o email saiu; isso nao e falha de envio")
      assert.equal(body.sent, 0, "tambem nao e envio concluido: o registro nao existe")
      assert.equal(body.degradado?.registroPerdido, true)
      assert.equal(body.degradado?.motivo, "email enviado sem registro gravado")

      assert.notEqual(
        logRow?.status,
        "failed",
        "'failed' aqui e o que fazia a proxima execucao reenviar",
      )
      assert.equal(
        subscriber?.last_digest_sent_at,
        "2026-04-10T15:00:00.000Z",
        "a janela precisa avancar, senao a proxima execucao reenvia as mesmas mudancas",
      )
      assert.ok(
        fixture.events.some((event) => event.event === "digest_enviado_sem_registro"),
      )
    })

    it("nao reenvia o digest na re-execucao do mesmo dia depois de perder o registro", async () => {
      const fixture = baseDigestFixture()
      fixture.setTable("candidate_changes", [
        {
          id: "chg_1",
          candidato_id: "cand_lula",
          titulo: "Nova atualização editorial",
          descricao: "Texto curto da mudança.",
          created_at: "2026-04-10T12:00:00.000Z",
        },
      ])
      fixture.failNextUpdate("notification_log", "notification log unavailable")

      const handler = createSendDigestHandler(createDeps(fixture))

      const primeira = await handler(buildDigestRequest(fixture))
      assert.equal(primeira.status, 500)
      assert.equal(fixture.emails.length, 1, "o primeiro envio saiu")

      // Mesmo dia, mesmo digest_date, banco ja de volta ao normal.
      const segunda = await handler(buildDigestRequest(fixture))
      const corpo = await readJson<{ sent: number; skipped: number; failed: number }>(segunda)

      assert.equal(
        fixture.emails.length,
        1,
        "o assinante nao pode receber o mesmo digest duas vezes porque uma escrita falhou",
      )
      assert.equal(corpo.sent, 0)
      assert.equal(corpo.failed, 0)
      assert.equal(corpo.skipped, 1)
      assert.equal(segunda.status, 200)
      assert.ok(
        fixture.events.some(
          (event) => event.detail?.reason === "no_changes_in_window",
        ),
        "a janela avancada e o que faz a segunda execucao pular",
      )
    })

    it("surfaces failure when last_digest_sent_at update fails after email delivery", async () => {
      const fixture = baseDigestFixture()
      fixture.setTable("candidate_changes", [
        {
          id: "chg_1",
          candidato_id: "cand_lula",
          titulo: "Nova atualização editorial",
          descricao: "Texto curto da mudança.",
          created_at: "2026-04-10T12:00:00.000Z",
        },
      ])
      fixture.failNextUpdate("alert_subscribers", "subscriber digest timestamp unavailable")

      const handler = createSendDigestHandler(createDeps(fixture))
      const response = await handler(buildDigestRequest(fixture))
      const body = await readJson<{
        ok: boolean
        sent: number
        failed: number
      }>(response)
      const logRow = fixture.getTable("notification_log")[0]
      const subscriber = fixture.getTable("alert_subscribers")[0]

      // 500: o lote nao concluiu nenhum envio contabilizado. Ver comentario acima.
      assert.equal(response.status, 500)
      assert.equal(body.ok, false)
      assert.equal(body.sent, 0)
      assert.equal(body.failed, 1)
      assert.equal(fixture.emails.length, 1)
      assert.equal(logRow?.status, "sent")
      assert.equal(logRow?.error_message, "alert_subscriber_digest_update: subscriber digest timestamp unavailable")
      assert.equal(subscriber?.last_digest_sent_at, null)
      assert.ok(fixture.events.some((event) => event.detail?.step === "alert_subscriber_digest_update"))
    })

    it("is idempotent when a sent notification_log already exists for the same digest date", async () => {
      const fixture = baseDigestFixture()
      fixture.setTable("candidate_changes", [
        {
          id: "chg_1",
          candidato_id: "cand_lula",
          titulo: "Nova atualização editorial",
          descricao: "Texto curto da mudança.",
          created_at: "2026-04-10T12:00:00.000Z",
        },
      ])
      fixture.setTable("notification_log", [
        {
          id: "nlog_sent_1",
          subscriber_id: "sub_digest_1",
          canal: "email",
          digest_date: "2026-04-10",
          status: "sent",
          error_message: null,
          sent_at: "2026-04-10T13:00:00.000Z",
        } satisfies NotificationLogRow,
      ])

      const handler = createSendDigestHandler(createDeps(fixture))
      const response = await handler(buildDigestRequest(fixture))
      const body = await readJson<{
        ok: boolean
        sent: number
        skipped: number
      }>(response)

      assert.equal(response.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.sent, 0)
      assert.equal(body.skipped, 1)
      assert.equal(fixture.emails.length, 0)
    })

    it("chains the next batch when there are more verified subscribers to process", async () => {
      const subscriberOne = seedSubscriber({
        id: "sub_digest_chain_1",
        email: "primeiro@example.com",
        manageToken: "ManageTokenChain001",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })
      const subscriberTwo = seedSubscriber({
        id: "sub_digest_chain_2",
        email: "segundo@example.com",
        manageToken: "ManageTokenChain002",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
        alert_subscribers: [subscriberOne, subscriberTwo],
        alert_subscriptions: [
          { id: "asub_1", subscriber_id: subscriberOne.id, candidato_id: "cand_lula" },
          { id: "asub_2", subscriber_id: subscriberTwo.id, candidato_id: "cand_lula" },
        ],
        candidate_changes: [
          {
            id: "chg_1",
            candidato_id: "cand_lula",
            titulo: "Nova atualização editorial",
            descricao: "Texto curto da mudança.",
            created_at: "2026-04-10T12:00:00.000Z",
          },
        ],
      })
      const chainedRequests: Array<{ url: string; authorization: string | null }> = []
      const afterCallbacks: Array<() => Promise<void> | void> = []
      const handler = createSendDigestHandler({
        ...createDeps(fixture),
        afterResponse: (callback: () => Promise<void> | void) => {
          afterCallbacks.push(callback)
        },
        fetchImpl: async (input: string | URL | Request, init?: RequestInit) => {
          chainedRequests.push({
            url: String(input),
            authorization: init?.headers instanceof Headers
              ? init.headers.get("authorization")
              : (init?.headers as Record<string, string> | undefined)?.Authorization ?? null,
          })
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      })

      const response = await handler(buildDigestRequest(fixture, "?limit=1"))
      const body = await readJson<{
        ok: boolean
        processed: number
        nextCursor: number | null
        chainScheduled: boolean
      }>(response)

      assert.equal(response.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.processed, 1)
      assert.equal(body.nextCursor, 1)
      assert.equal(body.chainScheduled, true)
      assert.equal(afterCallbacks.length, 1)

      await afterCallbacks[0]?.()

      assert.equal(chainedRequests.length, 1)
      assert.match(chainedRequests[0]?.url ?? "", /cursor=1/)
      assert.match(chainedRequests[0]?.url ?? "", /limit=1/)
      assert.match(chainedRequests[0]?.url ?? "", /depth=1/)
      assert.equal(chainedRequests[0]?.authorization, `Bearer ${CRON_SECRET}`)
    })

    it("chains against the canonical origin in production even when invoked via *.vercel.app", async () => {
      // Mesmo bug do news/refresh (incidente 2026-08-04): em producao o cron
      // chega pela URL do deployment atras do Vercel SSO, e encadear contra ela
      // morre num 302 silencioso. O chain deve mirar a origem canonica.
      const savedVercelEnv = process.env.VERCEL_ENV
      const savedEncryptionKey = process.env.PF_ALERTS_TOKEN_ENCRYPTION_KEY
      process.env.VERCEL_ENV = "production"
      // Com VERCEL_ENV=production o resolver de chave dos tokens exige a env
      // explicita (32 bytes em hex) em vez do fallback de dev.
      process.env.PF_ALERTS_TOKEN_ENCRYPTION_KEY = "ab".repeat(32)
      try {
        const subscriberOne = seedSubscriber({
          id: "sub_digest_origin_1",
          email: "primeiro-origin@example.com",
          manageToken: "ManageTokenOrigin001",
          verified: true,
          verified_at: "2026-04-09T10:00:00.000Z",
          verify_token_hash: null,
        })
        const subscriberTwo = seedSubscriber({
          id: "sub_digest_origin_2",
          email: "segundo-origin@example.com",
          manageToken: "ManageTokenOrigin002",
          verified: true,
          verified_at: "2026-04-09T10:00:00.000Z",
          verify_token_hash: null,
        })
        const fixture = new AlertsRouteFixture({
          candidatos_publico: [seedCandidate()],
          alert_subscribers: [subscriberOne, subscriberTwo],
          alert_subscriptions: [
            { id: "asub_origin_1", subscriber_id: subscriberOne.id, candidato_id: "cand_lula" },
            { id: "asub_origin_2", subscriber_id: subscriberTwo.id, candidato_id: "cand_lula" },
          ],
          candidate_changes: [
            {
              id: "chg_origin_1",
              candidato_id: "cand_lula",
              titulo: "Nova atualização editorial",
              descricao: "Texto curto da mudança.",
              created_at: "2026-04-10T12:00:00.000Z",
            },
          ],
        })
        const chainedRequests: string[] = []
        const afterCallbacks: Array<() => Promise<void> | void> = []
        const handler = createSendDigestHandler({
          ...createDeps(fixture),
          afterResponse: (callback: () => Promise<void> | void) => {
            afterCallbacks.push(callback)
          },
          fetchImpl: async (input: string | URL | Request) => {
            chainedRequests.push(String(input))
            return new Response(JSON.stringify({ ok: true }), { status: 200 })
          },
        })

        const response = await handler(
          new NextRequest(
            "https://puxa-ficha-abc123-thiagosalvador.vercel.app/api/alerts/send-digest?limit=1",
            { method: "POST", headers: { authorization: `Bearer ${CRON_SECRET}` } },
          ),
        )

        assert.equal(response.status, 200)
        assert.equal(afterCallbacks.length, 1)
        await afterCallbacks[0]?.()

        assert.equal(chainedRequests.length, 1)
        const chainedUrl = new URL(chainedRequests[0] ?? "")
        assert.equal(chainedUrl.origin, "https://puxaficha.com.br")
        assert.equal(chainedUrl.pathname, "/api/alerts/send-digest")
        assert.equal(chainedUrl.searchParams.get("cursor"), "1")
      } finally {
        if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV
        else process.env.VERCEL_ENV = savedVercelEnv
        if (savedEncryptionKey === undefined) delete process.env.PF_ALERTS_TOKEN_ENCRYPTION_KEY
        else process.env.PF_ALERTS_TOKEN_ENCRYPTION_KEY = savedEncryptionKey
      }
    })

    it("rejects an insecure configured chain origin without leaking the cron secret", async () => {
      const savedChainOrigin = process.env.PF_CRON_CHAIN_ORIGIN
      process.env.PF_CRON_CHAIN_ORIGIN = "http://untrusted.example"
      try {
        const fixture = baseDigestFixture()
        const secondSubscriber = seedSubscriber({
          id: "sub_digest_origin_rejected_2",
          email: "segundo@example.com",
          manageToken: "ManageTokenOriginRejected002",
          verified: true,
          verified_at: "2026-04-09T10:00:00.000Z",
          verify_token_hash: null,
        })
        fixture.setTable("alert_subscribers", [
          ...fixture.getTable("alert_subscribers"),
          secondSubscriber,
        ])
        fixture.setTable("alert_subscriptions", [
          ...fixture.getTable("alert_subscriptions"),
          {
            id: "asub_origin_rejected_2",
            subscriber_id: secondSubscriber.id,
            candidato_id: "cand_lula",
          },
        ])
        fixture.setTable("candidate_changes", [
          {
            id: "chg_origin_rejected_1",
            candidato_id: "cand_lula",
            titulo: "Nova atualização editorial",
            descricao: "Texto curto da mudança.",
            created_at: "2026-04-10T12:00:00.000Z",
          },
        ])
        const afterCallbacks: Array<() => Promise<void> | void> = []
        const handler = createSendDigestHandler({
          ...createDeps(fixture),
          afterResponse: (callback: () => Promise<void> | void) => afterCallbacks.push(callback),
        })

        const response = await handler(buildDigestRequest(fixture, "?limit=1"))
        const body = await readJson<{
          ok: boolean
          chainScheduled: boolean
          degradado: { origemInvalida: boolean; motivo: string } | null
        }>(response)

        assert.equal(response.status, 500)
        assert.equal(body.ok, false)
        assert.equal(body.chainScheduled, false)
        assert.equal(body.degradado?.origemInvalida, true)
        assert.equal(body.degradado?.motivo, "origem de encadeamento rejeitada")
        assert.equal(afterCallbacks.length, 0)
        const rejected = fixture.events.find(
          (entry) => entry.event === "digest_chain_origin_rejected",
        )
        assert.ok(rejected)
        assert.equal(JSON.stringify(rejected).includes(CRON_SECRET), false)
      } finally {
        if (savedChainOrigin === undefined) delete process.env.PF_CRON_CHAIN_ORIGIN
        else process.env.PF_CRON_CHAIN_ORIGIN = savedChainOrigin
      }
    })

    it("logs digest_chain_fetch_failed when the chained fetch answers non-2xx (e.g. SSO 302)", async () => {
      const subscriberOne = seedSubscriber({
        id: "sub_digest_302_1",
        email: "primeiro-302@example.com",
        manageToken: "ManageTokenRedir001",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })
      const subscriberTwo = seedSubscriber({
        id: "sub_digest_302_2",
        email: "segundo-302@example.com",
        manageToken: "ManageTokenRedir002",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
        alert_subscribers: [subscriberOne, subscriberTwo],
        alert_subscriptions: [
          { id: "asub_302_1", subscriber_id: subscriberOne.id, candidato_id: "cand_lula" },
          { id: "asub_302_2", subscriber_id: subscriberTwo.id, candidato_id: "cand_lula" },
        ],
        candidate_changes: [
          {
            id: "chg_302_1",
            candidato_id: "cand_lula",
            titulo: "Nova atualização editorial",
            descricao: "Texto curto da mudança.",
            created_at: "2026-04-10T12:00:00.000Z",
          },
        ],
      })
      const afterCallbacks: Array<() => Promise<void> | void> = []
      const handler = createSendDigestHandler({
        ...createDeps(fixture),
        afterResponse: (callback: () => Promise<void> | void) => {
          afterCallbacks.push(callback)
        },
        fetchImpl: async () =>
          new Response(null, { status: 302, headers: { Location: "https://vercel.com/sso-api" } }),
      })

      const response = await handler(buildDigestRequest(fixture, "?limit=1"))
      assert.equal(response.status, 200)
      assert.equal(afterCallbacks.length, 1)
      await afterCallbacks[0]?.()

      const retry = fixture.events.find((event) => event.event === "digest_chain_fetch_retry")
      const failure = fixture.events.find((event) => event.event === "digest_chain_fetch_failed")
      assert.ok(retry, "esperava evento digest_chain_fetch_retry antes da segunda tentativa")
      assert.ok(failure, "esperava evento digest_chain_fetch_failed para resposta 302")
      assert.equal(retry?.detail?.status, 302)
      assert.equal(retry?.detail?.attempt, 1)
      assert.equal(failure?.detail?.status, 302)
      assert.equal(failure?.detail?.nextCursor, 1)
      assert.equal(failure?.detail?.attempt, 2)
      assert.equal(failure?.level, "error")
    })

    it("o fetch de encadeamento leva signal com prazo", async () => {
      const fixture = baseDigestFixture()
      const secondSubscriber = seedSubscriber({
        id: "sub_digest_signal_2",
        email: "segundo-signal@example.com",
        manageToken: "ManageTokenSignal002",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })
      fixture.setTable("alert_subscribers", [
        ...fixture.getTable("alert_subscribers"),
        secondSubscriber,
      ])
      fixture.setTable("alert_subscriptions", [
        ...fixture.getTable("alert_subscriptions"),
        {
          id: "asub_signal_2",
          subscriber_id: secondSubscriber.id,
          candidato_id: "cand_lula",
        },
      ])
      const chainedInits: Array<RequestInit | undefined> = []
      const afterCallbacks: Array<() => Promise<void> | void> = []
      const handler = createSendDigestHandler({
        ...createDeps(fixture),
        afterResponse: (callback: () => Promise<void> | void) => {
          afterCallbacks.push(callback)
        },
        fetchImpl: async (_input: string | URL | Request, init?: RequestInit) => {
          chainedInits.push(init)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      })

      const response = await handler(buildDigestRequest(fixture, "?limit=1"))
      assert.equal(response.status, 200)
      assert.equal(afterCallbacks.length, 1)
      await afterCallbacks[0]?.()

      assert.equal(chainedInits.length, 1)
      // Sem signal, um POST interno travado nunca voltava: sem retry, sem
      // digest_chain_fetch_failed e sem nova invocação para o resto da fila.
      assert.ok(chainedInits[0]?.signal instanceof AbortSignal)
    })

    it("abort do prazo é registrado como timeout e ainda tenta de novo", async () => {
      const fixture = baseDigestFixture()
      const secondSubscriber = seedSubscriber({
        id: "sub_digest_abort_2",
        email: "segundo-abort@example.com",
        manageToken: "ManageTokenAbort002",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })
      fixture.setTable("alert_subscribers", [
        ...fixture.getTable("alert_subscribers"),
        secondSubscriber,
      ])
      fixture.setTable("alert_subscriptions", [
        ...fixture.getTable("alert_subscriptions"),
        {
          id: "asub_abort_2",
          subscriber_id: secondSubscriber.id,
          candidato_id: "cand_lula",
        },
      ])
      const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
      const sleepCalls: number[] = []
      const afterCallbacks: Array<() => Promise<void> | void> = []
      const handler = createSendDigestHandler({
        ...createDeps(fixture),
        sleep: async (ms: number) => {
          sleepCalls.push(ms)
        },
        afterResponse: (callback: () => Promise<void> | void) => {
          afterCallbacks.push(callback)
        },
        fetchImpl: async (input: string | URL | Request, init?: RequestInit) => {
          fetchCalls.push({ url: String(input), init })
          // AbortController.abort() vira AbortError; AbortSignal.timeout() neste
          // runtime vira TimeoutError (igual ao transporte em src/lib/email.ts).
          const name = fetchCalls.length === 1 ? "AbortError" : "TimeoutError"
          throw Object.assign(new Error("aborted"), { name })
        },
      })

      const response = await handler(buildDigestRequest(fixture, "?limit=1"))
      assert.equal(response.status, 200)
      assert.equal(afterCallbacks.length, 1)
      await afterCallbacks[0]?.()

      assert.equal(fetchCalls.length, 2)
      assert.deepEqual(sleepCalls, [3000])
      const eventos = fixture.events.filter((event) =>
        String(event.event).startsWith("digest_chain_fetch_"),
      )
      assert.deepEqual(
        eventos.map((event) => event.event),
        ["digest_chain_fetch_retry", "digest_chain_fetch_failed"],
      )
      for (const evento of eventos) assert.equal(evento.detail?.message, "timeout")
    })

    it("retries the chained fetch once before declaring chain_fetch_failed", async () => {
      const fixture = baseDigestFixture()
      const secondSubscriber = seedSubscriber({
        id: "sub_digest_retry_2",
        email: "segundo-retry@example.com",
        manageToken: "ManageTokenRetry002",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })
      fixture.setTable("alert_subscribers", [
        ...fixture.getTable("alert_subscribers"),
        secondSubscriber,
      ])
      fixture.setTable("alert_subscriptions", [
        ...fixture.getTable("alert_subscriptions"),
        {
          id: "asub_retry_2",
          subscriber_id: secondSubscriber.id,
          candidato_id: "cand_lula",
        },
      ])
      let calls = 0
      const fetchCalls: unknown[] = []
      const sleepCalls: number[] = []
      const afterCallbacks: Array<() => Promise<void> | void> = []
      const handler = createSendDigestHandler({
        ...createDeps(fixture),
        sleep: async (ms: number) => {
          sleepCalls.push(ms)
        },
        afterResponse: (callback: () => Promise<void> | void) => {
          afterCallbacks.push(callback)
        },
        fetchImpl: async (input: string | URL | Request) => {
          fetchCalls.push(String(input))
          calls += 1
          if (calls === 1) throw new Error("socket hang up")
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        },
      })

      const response = await handler(buildDigestRequest(fixture, "?limit=1"))
      assert.equal(response.status, 200)
      assert.equal(afterCallbacks.length, 1)
      await afterCallbacks[0]?.()

      // Primeiro elo falhou, o retry salvou a fila do dia.
      assert.equal(fetchCalls.length, 2)
      assert.deepEqual(sleepCalls, [3000])
      assert.equal(
        fixture.events.filter((event) => event.event === "digest_chain_fetch_retry").length,
        1,
      )
      assert.equal(
        fixture.events.filter((event) => event.event === "digest_chain_fetch_failed").length,
        0,
      )
    })

    it("does not chain past the configured digest depth ceiling", async () => {
      const subscriberOne = seedSubscriber({
        id: "sub_digest_depth_1",
        email: "primeiro-depth@example.com",
        manageToken: "ManageTokenDepth001",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })
      const subscriberTwo = seedSubscriber({
        id: "sub_digest_depth_2",
        email: "segundo-depth@example.com",
        manageToken: "ManageTokenDepth002",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
        alert_subscribers: [subscriberOne, subscriberTwo],
        alert_subscriptions: [
          { id: "asub_depth_1", subscriber_id: subscriberOne.id, candidato_id: "cand_lula" },
          { id: "asub_depth_2", subscriber_id: subscriberTwo.id, candidato_id: "cand_lula" },
        ],
        candidate_changes: [
          {
            id: "chg_depth_1",
            candidato_id: "cand_lula",
            titulo: "Nova atualização editorial",
            descricao: "Texto curto da mudança.",
            created_at: "2026-04-10T12:00:00.000Z",
          },
        ],
      })
      const afterCallbacks: Array<() => Promise<void> | void> = []
      const handler = createSendDigestHandler({
        ...createDeps(fixture),
        afterResponse: (callback: () => Promise<void> | void) => {
          afterCallbacks.push(callback)
        },
      })

      const response = await handler(buildDigestRequest(fixture, "?limit=1&depth=20"))
      const body = await readJson<{
        ok: boolean
        degradado: { filaTruncada: boolean } | null
        nextCursor: number | null
        chainScheduled: boolean
        chainDepth: number
      }>(response)

      // O teto continua cortando a cadeia (chainScheduled false, nenhum callback
      // agendado), mas agora isso NAO passa em silencio: fila pendente com o teto
      // atingido significa que parte da base nao foi processada hoje e nao sera
      // sem intervencao, entao vira 500 para a Vercel notificar.
      assert.equal(response.status, 500)
      assert.equal(body.ok, false)
      assert.equal(body.degradado?.filaTruncada, true)
      assert.equal(body.nextCursor, 1)
      assert.equal(body.chainScheduled, false)
      assert.equal(body.chainDepth, 20)
      assert.equal(afterCallbacks.length, 0)
    })

    it("mantem 200 quando parte do lote falha mas algum envio conclui", async () => {
      // Guarda a assimetria proposital do gate: 500 e reservado para "nenhum envio
      // concluiu no lote". Falha isolada de um assinante entre varios NAO pode
      // acordar o dono de madrugada, senao o alerta vira ruido e para de ser lido.
      const subscriberOne = seedSubscriber({
        id: "sub_parcial_1",
        email: "parcial-um@example.com",
        manageToken: "ManageTokenParcial01",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })
      const subscriberTwo = seedSubscriber({
        id: "sub_parcial_2",
        email: "parcial-dois@example.com",
        manageToken: "ManageTokenParcial02",
        verified: true,
        verified_at: "2026-04-09T10:00:00.000Z",
        verify_token_hash: null,
      })
      const fixture = new AlertsRouteFixture({
        candidatos_publico: [seedCandidate()],
        alert_subscribers: [subscriberOne, subscriberTwo],
        alert_subscriptions: [
          { id: "asub_parcial_1", subscriber_id: subscriberOne.id, candidato_id: "cand_lula" },
          { id: "asub_parcial_2", subscriber_id: subscriberTwo.id, candidato_id: "cand_lula" },
        ],
        candidate_changes: [
          {
            id: "chg_parcial_1",
            candidato_id: "cand_lula",
            titulo: "Nova atualização editorial",
            descricao: "Texto curto da mudança.",
            created_at: "2026-04-10T12:00:00.000Z",
          },
        ],
      })
      // So o primeiro envio falha; o segundo conclui.
      fixture.failNextEmail("resend flap")

      const handler = createSendDigestHandler(createDeps(fixture))
      const response = await handler(buildDigestRequest(fixture))
      const body = await readJson<{
        ok: boolean
        degradado: unknown
        sent: number
        failed: number
      }>(response)

      assert.equal(response.status, 200)
      assert.equal(body.ok, true)
      assert.equal(body.degradado, null)
      assert.equal(body.sent, 1)
      assert.equal(body.failed, 1)
    })
  })

  describe("GET /api/alerts/me", () => {
    it("sets private no-store cache headers on the anonymous response", async () => {
      const request = new NextRequest("http://localhost/api/alerts/me", {
        method: "GET",
      })
      const response = await getAlertsMe(request)

      const cacheControl = response.headers.get("cache-control") ?? ""
      assert.match(cacheControl, /no-store/i)
      assert.match(cacheControl, /private/i)
      assert.match(cacheControl, /must-revalidate/i)
      assert.equal(response.headers.get("pragma"), "no-cache")

      const body = (await response.json()) as {
        ok: boolean
        anonymous: boolean
      }
      assert.equal(body.ok, false)
      assert.equal(body.anonymous, true)
    })

    it("sets private no-store cache headers on POST error responses", async () => {
      const request = new NextRequest("http://localhost/api/alerts/me", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not valid json",
      })
      const response = await postAlertsMe(request)

      assert.equal(response.status, 400)
      const cacheControl = response.headers.get("cache-control") ?? ""
      assert.match(cacheControl, /no-store/i)
      assert.match(cacheControl, /private/i)
      assert.match(cacheControl, /must-revalidate/i)
    })

    it("rejects oversized POST bodies before JSON parse", async () => {
      const request = new NextRequest("http://localhost/api/alerts/me", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "203.0.113.201",
        },
        body: JSON.stringify({ manageToken: "x".repeat(20_000) }),
      })
      const response = await postAlertsMe(request)

      assert.equal(response.status, 413)
      assert.match(response.headers.get("cache-control") ?? "", /no-store/i)
    })

    it("rate-limits alerts/me anonymous reads", async () => {
      const headers = { "x-real-ip": "203.0.113.202" }
      let response: Response | null = null

      for (let index = 0; index < 121; index += 1) {
        response = await getAlertsMe(
          new NextRequest("http://localhost/api/alerts/me", {
            method: "GET",
            headers,
          }),
        )
      }

      assert.equal(response?.status, 429)
      assert.match(response?.headers.get("cache-control") ?? "", /no-store/i)
    })
  })
})
