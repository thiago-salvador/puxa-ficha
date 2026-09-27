import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import { AlertsRouteFixture, seedCandidate, seedSubscriber } from "./helpers/alerts-route-fixture"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never

const { createSubscribeHandler } = require("../src/app/api/alerts/subscribe/route") as typeof import("../src/app/api/alerts/subscribe/route")
const { createSendDigestHandler } = require("../src/app/api/alerts/send-digest/route") as typeof import("../src/app/api/alerts/send-digest/route")
const { createDeleteDataHandler } = require("../src/app/api/alerts/delete-data/route") as typeof import("../src/app/api/alerts/delete-data/route")
const { createUnsubscribeAllHandler } = require("../src/app/api/alerts/unsubscribe-all/route") as typeof import("../src/app/api/alerts/unsubscribe-all/route")
const { createAlertsMeHandlers } = require("../src/app/api/alerts/me/route") as typeof import("../src/app/api/alerts/me/route")
const { createAlertsAcessoHandler } = require("../src/app/(site)/alertas/acesso/route") as typeof import("../src/app/(site)/alertas/acesso/route")

const NOW = new Date("2026-04-10T15:00:00.000Z")

function deps(fixture: AlertsRouteFixture) {
  return {
    createAlertsServiceRoleClient: () => fixture.createClient() as never,
    findPublicCandidateBySlug: (slug: string) => fixture.findPublicCandidateBySlug(slug),
    findSubscriberByEmailHash: (hash: string) => fixture.findSubscriberByEmailHash(hash),
    findSubscriberByManageToken: (token: string) => fixture.findSubscriberByManageToken(token),
    sendTransactionalEmail: (input: Parameters<AlertsRouteFixture["sendTransactionalEmail"]>[0]) => fixture.sendTransactionalEmail(input),
    logAlertsApiExit: fixture.logAlertsApiExit,
    logAlertsEvent: fixture.logAlertsEvent,
    now: () => new Date(NOW),
    afterResponse: () => {},
    fetchImpl: async () => new Response(null, { status: 200 }),
    sleep: async () => {},
  }
}

function digestRequest(fixture: AlertsRouteFixture) {
  return fixture.request("/api/alerts/send-digest?chain=0", {
    headers: { authorization: "Bearer test-cron" },
  })
}

describe("alertas por cargo e UF", () => {
  it("aceita coorte pura no double opt-in e preserva a intenção pendente", async () => {
    const candidate = seedCandidate({ id: "cand-sp", cargo_disputado: "Governador", estado: "SP" })
    const fixture = new AlertsRouteFixture({ candidatos_publico: [candidate] })
    const response = await createSubscribeHandler(deps(fixture) as never)(fixture.request("/api/alerts/subscribe", {
      body: { email: "coorte@example.com", cohortSubscriptions: [{ cargo: "Governador", uf: "SP" }] },
    }))

    assert.equal(response.status, 200)
    assert.equal(fixture.getTable("alert_subscriptions").length, 0)
    assert.deepEqual(fixture.getTable("alert_cohort_subscriptions").map(({ cargo, uf }) => ({ cargo, uf })), [
      { cargo: "Governador", uf: "SP" },
    ])
    assert.equal(fixture.emails.length, 1)
  })

  it("ignora candidato removido na entrada da coorte", async () => {
    const fixture = new AlertsRouteFixture({
      candidatos_publico: [
        seedCandidate({ id: "cand-removido", cargo_disputado: "Governador", estado: "SP", status: "removido" }),
      ],
    })
    const response = await createSubscribeHandler(deps(fixture) as never)(fixture.request("/api/alerts/subscribe", {
      body: { email: "removido@example.com", cohortSubscriptions: [{ cargo: "Governador", uf: "SP" }] },
    }))

    assert.equal(response.status, 200)
    assert.deepEqual(fixture.getTable("alert_cohort_subscriptions").map(({ cargo, uf }) => ({ cargo, uf })), [
      { cargo: "Governador", uf: "SP" },
    ])
    assert.equal(fixture.emails.length, 1)
  })

  it("resolve a coorte no digest, deduplica assinatura direta e reenviará após falha", async () => {
    process.env.CRON_SECRET = "test-cron"
    const subscriber = seedSubscriber({ id: "sub-coorte", verified: true, verified_at: "2026-04-09T10:00:00.000Z" })
    const candidate = seedCandidate({ id: "cand-sp", cargo_disputado: "Governador", estado: "SP" })
    const fixture = new AlertsRouteFixture({
      candidatos_publico: [candidate],
      alert_subscribers: [subscriber],
      alert_subscriptions: [{ id: "direct", subscriber_id: subscriber.id, candidato_id: candidate.id }],
      alert_cohort_subscriptions: [{ id: "cohort", subscriber_id: subscriber.id, cargo: "Governador", uf: "SP" }],
      candidate_changes: [{ id: "change", candidato_id: candidate.id, titulo: "Atualização", descricao: "Nova", created_at: "2026-04-10T12:00:00.000Z" }],
    })
    fixture.failNextEmail()
    const handler = createSendDigestHandler(deps(fixture) as never)
    const first = await handler(digestRequest(fixture))
    assert.equal(first.status, 500)
    assert.equal(fixture.emails.length, 0)

    const second = await handler(digestRequest(fixture))
    assert.equal(second.status, 200)
    assert.equal(fixture.emails.length, 1)
    const log = fixture.getTable("notification_log")[0]
    assert.deepEqual(log?.candidato_ids, [candidate.id])
  })

  it("consulta a coorte uma vez por lote mesmo com mais de 1.000 candidatos públicos", async () => {
    process.env.CRON_SECRET = "test-cron"
    const subscribers = [
      seedSubscriber({ id: "sub-a", email: "a@example.com", verified: true, verified_at: "2026-04-09T10:00:00.000Z" }),
      seedSubscriber({ id: "sub-b", email: "b@example.com", verified: true, verified_at: "2026-04-09T10:00:00.000Z" }),
    ]
    const target = seedCandidate({ id: "zz-target", cargo_disputado: "Governador", estado: "SP" })
    const fixture = new AlertsRouteFixture({
      candidatos_publico: [
        ...Array.from({ length: 1200 }, (_, i) => seedCandidate({
          id: `other-${String(i).padStart(4, "0")}`,
          cargo_disputado: "Prefeito",
          estado: "RJ",
        })),
        target,
      ],
      alert_subscribers: subscribers,
      alert_cohort_subscriptions: subscribers.map((subscriber) => ({
        id: `cohort-${subscriber.id}`,
        subscriber_id: subscriber.id,
        cargo: "Governador",
        uf: "SP",
      })),
      candidate_changes: [{
        id: "change-target",
        candidato_id: target.id,
        titulo: "Atualização",
        descricao: "Nova",
        created_at: "2026-04-10T12:00:00.000Z",
      }],
    })

    const response = await createSendDigestHandler(deps(fixture) as never)(digestRequest(fixture))
    assert.equal(response.status, 200)
    assert.equal(fixture.emails.length, 2)
    assert.deepEqual(fixture.getTable("notification_log").map((row) => row.candidato_ids), [[target.id], [target.id]])
    assert.equal(fixture.selectCalls.filter((table) => table === "candidatos_publico").length, 1)
  })

  it("pagina a consulta da coorte quando o próprio cargo ultrapassa 1.000 candidatos", async () => {
    process.env.CRON_SECRET = "test-cron"
    const subscriber = seedSubscriber({ id: "sub-page", verified: true, verified_at: "2026-04-09T10:00:00.000Z" })
    const target = seedCandidate({ id: "zz-target", cargo_disputado: "Governador", estado: "SP" })
    const fixture = new AlertsRouteFixture({
      candidatos_publico: [
        ...Array.from({ length: 1200 }, (_, i) => seedCandidate({
          id: `gov-${String(i).padStart(4, "0")}`,
          cargo_disputado: "Governador",
          estado: "RJ",
        })),
        target,
      ],
      alert_subscribers: [subscriber],
      alert_cohort_subscriptions: [{ id: "cohort-page", subscriber_id: subscriber.id, cargo: "Governador", uf: "SP" }],
      candidate_changes: [{
        id: "change-page",
        candidato_id: target.id,
        titulo: "Atualização",
        descricao: "Nova",
        created_at: "2026-04-10T12:00:00.000Z",
      }],
    })

    const response = await createSendDigestHandler(deps(fixture) as never)(digestRequest(fixture))
    assert.equal(response.status, 200)
    assert.equal(fixture.emails.length, 1)
    assert.deepEqual(fixture.getTable("notification_log")[0]?.candidato_ids, [target.id])
    assert.equal(fixture.selectCalls.filter((table) => table === "candidatos_publico").length, 2)
  })

  it("faz upsert idempotente de Presidente com UF nula usando sessão verificada", async () => {
    const subscriber = seedSubscriber({ id: "sub-president", verified: true, verified_at: "2026-04-09T10:00:00.000Z" })
    const fixture = new AlertsRouteFixture({ alert_subscribers: [subscriber] })
    const handler = createSubscribeHandler(deps(fixture) as never)
    const body = { manageToken: "ManageTokenAlpha123", email: subscriber.email, cohortSubscriptions: [{ cargo: "Presidente", uf: null }] }

    assert.equal((await handler(fixture.request("/api/alerts/subscribe", { body }))).status, 200)
    assert.equal((await handler(fixture.request("/api/alerts/subscribe", { body }))).status, 200)
    assert.equal(fixture.getTable("alert_cohort_subscriptions").length, 1)
  })

  it("preserva recorte puro no link de gestão e só aplica depois do token válido", async () => {
    const subscriber = seedSubscriber({ id: "sub-manage-cohort", verified: true, verified_at: "2026-04-09T10:00:00.000Z" })
    const fixture = new AlertsRouteFixture({ alert_subscribers: [subscriber] })
    const subscribe = createSubscribeHandler(deps(fixture) as never)
    const response = await subscribe(fixture.request("/api/alerts/subscribe", {
      body: { email: subscriber.email, cohortSubscriptions: [{ cargo: "Governador", uf: "RJ" }] },
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(fixture.getTable("alert_cohort_subscriptions"), [])

    const accessUrl = fixture.extractAccessUrls()[0]
    assert.ok(accessUrl)
    const parsed = new URL(accessUrl)
    const access = createAlertsAcessoHandler({
      findSubscriberByManageToken: (token: string) => fixture.findSubscriberByManageToken(token),
      findPublicCandidateBySlug: (slug: string) => fixture.findPublicCandidateBySlug(slug),
      createAlertsServiceRoleClient: () => fixture.createClient() as never,
      logAlertsApiExit: fixture.logAlertsApiExit,
    })
    const accessResponse = await access(fixture.request(`${parsed.pathname}${parsed.search}`))
    assert.equal(accessResponse.status, 307)
    assert.deepEqual(fixture.getTable("alert_cohort_subscriptions").map(({ cargo, uf }) => ({ cargo, uf })), [
      { cargo: "Governador", uf: "RJ" },
    ])
  })

  it("descadastro remove recortes e exclusão remove o assinante em cascata", async () => {
    const subscriber = seedSubscriber({ id: "sub-delete-cohort", verified: true, verified_at: "2026-04-09T10:00:00.000Z" })
    const fixture = new AlertsRouteFixture({
      alert_subscribers: [subscriber],
      alert_cohort_subscriptions: [{ id: "cohort-delete", subscriber_id: subscriber.id, cargo: "Governador", uf: "SP" }],
    })
    const body = { manageToken: "ManageTokenAlpha123" }
    const unsubscribe = createUnsubscribeAllHandler(deps(fixture) as never)
    assert.equal((await unsubscribe(fixture.request("/api/alerts/unsubscribe-all", { body }))).status, 200)
    assert.equal(fixture.getTable("alert_cohort_subscriptions").length, 0)

    fixture.setTable("alert_cohort_subscriptions", [{ id: "cohort-delete-2", subscriber_id: subscriber.id, cargo: "Governador", uf: "SP" }])
    const deleteData = createDeleteDataHandler(deps(fixture) as never)
    assert.equal((await deleteData(fixture.request("/api/alerts/delete-data", { body }))).status, 200)
    assert.equal(fixture.getTable("alert_subscribers").length, 0)
    assert.equal(fixture.getTable("alert_cohort_subscriptions").length, 0)
  })

  for (const failedStep of ["direct", "cohort", "missing_table"] as const) {
    it(`não remove nenhuma assinatura quando o cancelamento falha em ${failedStep}`, async () => {
      const subscriber = seedSubscriber({ id: `sub-rollback-${failedStep}`, verified: true })
      const candidate = seedCandidate({ id: `cand-rollback-${failedStep}` })
      const fixture = new AlertsRouteFixture({
        alert_subscribers: [subscriber],
        candidatos_publico: [candidate],
        alert_subscriptions: [{ id: "direct", subscriber_id: subscriber.id, candidato_id: candidate.id }],
        alert_cohort_subscriptions: [{ id: "cohort", subscriber_id: subscriber.id, cargo: "Governador", uf: "SP" }],
      })
      fixture.failNextUnsubscribeDelete(failedStep)
      const response = await createUnsubscribeAllHandler(deps(fixture) as never)(fixture.request("/api/alerts/unsubscribe-all", {
        body: { manageToken: "ManageTokenAlpha123" },
      }))
      assert.equal(response.status, 503)
      assert.equal(fixture.getTable("alert_subscriptions").length, 1)
      assert.equal(fixture.getTable("alert_cohort_subscriptions").length, 1)
    })
  }

  for (const cohortError of [
    { code: "42P01", message: "relation alert_cohort_subscriptions does not exist" },
    { code: "XX000", message: "cohort query failed" },
  ]) {
    it(`mantém a gestão por candidato quando a consulta de recortes falha: ${cohortError.code}`, async () => {
      const subscriber = seedSubscriber({ id: `sub-me-${cohortError.code}`, verified: true })
      const candidate = seedCandidate({ id: `cand-me-${cohortError.code}` })
      const fixture = new AlertsRouteFixture({
        alert_subscribers: [subscriber],
        candidatos_publico: [candidate],
        alert_subscriptions: [{ id: "direct", subscriber_id: subscriber.id, candidato_id: candidate.id }],
      })
      fixture.failNextSelect("alert_cohort_subscriptions", cohortError)
      const response = await createAlertsMeHandlers(deps(fixture) as never).POST(fixture.request("/api/alerts/me", {
        body: { manageToken: "ManageTokenAlpha123" },
      }))
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.cohortSubscriptionsUnavailable, true)
      assert.deepEqual(body.cohortSubscriptions, [])
      assert.equal(body.subscriptions[0]?.id, candidate.id)
    })
  }

  it("preserva o acesso e o follow pendente quando a tabela de recortes falta", async () => {
    const subscriber = seedSubscriber({ id: "sub-access-legacy", verified: true })
    const candidate = seedCandidate({ id: "cand-access-legacy", slug: "candidato-legado" })
    const fixture = new AlertsRouteFixture({ alert_subscribers: [subscriber], candidatos_publico: [candidate] })
    fixture.failNextUpsert("alert_cohort_subscriptions", { code: "42P01", message: "relation missing" })
    const access = createAlertsAcessoHandler(deps(fixture) as never)
    const cohort = encodeURIComponent(JSON.stringify([{ cargo: "Governador", uf: "SP" }]))
    const response = await access(fixture.request(`/alertas/acesso?manage=ManageTokenAlpha123&follow=${candidate.slug}&cohort=${cohort}`, { method: "GET" }))
    assert.equal(response.status, 307)
    assert.ok(response.headers.get("set-cookie")?.includes("alert"))
    assert.equal(fixture.getTable("alert_subscriptions")[0]?.candidato_id, candidate.id)
    assert.deepEqual(fixture.getTable("alert_cohort_subscriptions"), [])
  })
})
