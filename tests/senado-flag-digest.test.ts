import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { after, afterEach, before, beforeEach, describe, it } from "node:test"

import {
  AlertsRouteFixture,
  seedCandidate,
  seedSubscriber,
} from "./helpers/alerts-route-fixture"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never

type AlertsModule = typeof import("../src/lib/alerts")
type SendDigestRouteModule = typeof import("../src/app/api/alerts/send-digest/route")
type SendDigestDeps = NonNullable<Parameters<SendDigestRouteModule["createSendDigestHandler"]>[0]>

const NOW = new Date("2026-04-10T15:00:00.000Z")
const TEST_CRON_SECRET = "senado-flag-digest-secret"
const LOCAL_SUPABASE_URL = "http://127.0.0.1:9"
const TEST_ENVIRONMENT: Record<string, string> = {
  CRON_SECRET: TEST_CRON_SECRET,
  RESEND_API_KEY: "re_senado_flag_fake_key",
  SUPABASE_SERVICE_ROLE_KEY: "senado-flag-fake-service-role-key",
  SUPABASE_URL: LOCAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "senado-flag-fake-anon-key",
  PF_ALERTS_TOKEN_ENCRYPTION_KEY: "22".repeat(32),
  VERCEL_ENV: "development",
}

const env = process.env as Record<string, string | undefined>
const savedEnvironment = new Map<string, string | undefined>()
let savedFlag: string | undefined
let alerts: AlertsModule
let routeModule: SendDigestRouteModule

const SENADOR = seedCandidate({
  id: "cand_senado_teste",
  slug: "pessoa-senado-teste",
  nome_urna: "Pessoa Senado Teste",
  partido_sigla: "PX",
  cargo_disputado: "Senador",
})
const GOVERNADOR = seedCandidate({
  id: "cand_governo_teste",
  slug: "pessoa-governo-teste",
  nome_urna: "Pessoa Governo Teste",
  partido_sigla: "PX",
  cargo_disputado: "Governador",
})

/** Assinante verificado que segue só a candidatura informada, com uma mudança nova. */
function fixtureFollowing(candidate: typeof SENADOR): AlertsRouteFixture {
  const subscriber = seedSubscriber({
    id: "sub_senado_flag",
    email: "senado-flag@example.test",
    manageToken: "ManageTokenSenadoFlag001",
    verifyToken: "VerifyTokenSenadoFlag001",
    verified: true,
    verified_at: "2026-04-09T10:00:00.000Z",
    verify_token_hash: null,
  })
  const fixture = new AlertsRouteFixture({
    candidatos_publico: [SENADOR, GOVERNADOR],
    alert_subscribers: [subscriber],
    alert_subscriptions: [
      { id: "asub_senado_flag", subscriber_id: subscriber.id, candidato_id: candidate.id },
    ],
  })
  fixture.setTable("candidate_changes", [
    {
      id: "chg_senado_flag",
      candidato_id: candidate.id,
      titulo: "Nova atualização editorial",
      descricao: "Mudança determinística da fixture.",
      created_at: "2026-04-10T12:00:00.000Z",
    },
  ])
  return fixture
}

function deps(fixture: AlertsRouteFixture): SendDigestDeps {
  return {
    createAlertsServiceRoleClient: () =>
      fixture.createClient() as ReturnType<SendDigestDeps["createAlertsServiceRoleClient"]>,
    sendTransactionalEmail: (input: Parameters<AlertsRouteFixture["sendTransactionalEmail"]>[0]) =>
      fixture.sendTransactionalEmail(input),
    logAlertsApiExit: fixture.logAlertsApiExit,
    logAlertsEvent: fixture.logAlertsEvent,
    afterResponse: () => {
      throw new Error("encadeamento assíncrono não é permitido neste teste")
    },
    fetchImpl: async () => {
      throw new Error("acesso à rede não é permitido neste teste")
    },
    sleep: async () => {},
    now: () => new Date(NOW),
  }
}

async function runDigest(fixture: AlertsRouteFixture) {
  const handler = routeModule.createSendDigestHandler(deps(fixture))
  const response = await handler(
    fixture.request("/api/alerts/send-digest?chain=0", {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    }),
  )
  return { status: response.status, body: (await response.json()) as { sent?: number } }
}

describe("flag do Senado no digest de alertas", () => {
  before(() => {
    for (const [key, value] of Object.entries(TEST_ENVIRONMENT)) {
      savedEnvironment.set(key, env[key])
      env[key] = value
    }
    alerts = require("../src/lib/alerts") as AlertsModule
    routeModule = require("../src/app/api/alerts/send-digest/route") as SendDigestRouteModule
  })

  after(() => {
    for (const [key, value] of savedEnvironment) {
      if (value === undefined) delete env[key]
      else env[key] = value
    }
  })

  beforeEach(() => {
    savedFlag = env.SENADO_ENABLED
  })

  afterEach(() => {
    if (savedFlag === undefined) delete env.SENADO_ENABLED
    else env.SENADO_ENABLED = savedFlag
  })

  it("filtro de candidaturas de alerta remove Senador com a flag desligada e mantém com ela ligada", () => {
    const rows = [SENADOR, GOVERNADOR]

    delete env.SENADO_ENABLED
    assert.deepEqual(
      alerts.filterAlertCandidatesByExposedCargo(rows).map((row) => row.id),
      [GOVERNADOR.id],
    )
    assert.deepEqual(
      alerts.filterAlertCandidatesByExposedCargo(rows, { SENADO_ENABLED: "true" }).map((row) => row.id),
      [SENADOR.id, GOVERNADOR.id],
    )

    env.SENADO_ENABLED = "true"
    assert.deepEqual(
      alerts.filterAlertCandidatesByExposedCargo(rows).map((row) => row.id),
      [SENADOR.id, GOVERNADOR.id],
    )
  })

  it("com a flag ligada o digest real envia a mudança de quem segue um Senador", async () => {
    env.SENADO_ENABLED = "true"
    const fixture = fixtureFollowing(SENADOR)
    const { status, body } = await runDigest(fixture)
    assert.equal(status, 200)
    assert.equal(body.sent, 1)
    assert.match(fixture.emails[0]?.subject ?? "", /Pessoa Senado Teste/)
  })

  it("com a flag desligada o digest real envia normalmente para quem segue um Governador", async () => {
    delete env.SENADO_ENABLED
    const fixture = fixtureFollowing(GOVERNADOR)
    const { body } = await runDigest(fixture)
    assert.equal(body.sent, 1)
    assert.match(fixture.emails[0]?.subject ?? "", /Pessoa Governo Teste/)
  })

  // A consulta de candidaturas do digest (select em candidatos_publico, em
  // src/app/api/alerts/send-digest/route.ts) passa por
  // filterAlertCandidatesByExposedCargo: com a flag desligada, a mudança de um
  // Senador não vira email.
  it("com a flag desligada o digest real não envia mudança de Senador", async () => {
    delete env.SENADO_ENABLED
    const fixture = fixtureFollowing(SENADOR)
    const { status, body } = await runDigest(fixture)
    assert.equal(status, 200)
    assert.equal(body.sent ?? 0, 0)
    assert.equal(fixture.emails.length, 0)
  })
})
