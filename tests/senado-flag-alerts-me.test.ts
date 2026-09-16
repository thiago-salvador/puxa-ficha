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

type AlertsMeRouteModule = typeof import("../src/app/api/alerts/me/route")
type AlertsMeDeps = NonNullable<Parameters<AlertsMeRouteModule["createAlertsMeHandlers"]>[0]>

const LOCAL_SUPABASE_URL = "http://127.0.0.1:9"
const TEST_ENVIRONMENT: Record<string, string> = {
  SUPABASE_SERVICE_ROLE_KEY: "senado-flag-me-fake-service-role-key",
  SUPABASE_URL: LOCAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "senado-flag-me-fake-anon-key",
  PF_ALERTS_TOKEN_ENCRYPTION_KEY: "33".repeat(32),
  VERCEL_ENV: "development",
}

const env = process.env as Record<string, string | undefined>
const savedEnvironment = new Map<string, string | undefined>()
let savedFlag: string | undefined
let routeModule: AlertsMeRouteModule

const MANAGE_TOKEN = "ManageTokenSenadoFlagMe01"

const SENADOR = seedCandidate({
  id: "cand_senado_me_teste",
  slug: "pessoa-senado-me-teste",
  nome_urna: "Pessoa Senado Me Teste",
  partido_sigla: "PX",
  cargo_disputado: "Senador",
})
const GOVERNADOR = seedCandidate({
  id: "cand_governo_me_teste",
  slug: "pessoa-governo-me-teste",
  nome_urna: "Pessoa Governo Me Teste",
  partido_sigla: "PX",
  cargo_disputado: "Governador",
})

/** Assinante verificado que segue um Senador e um Governador. */
function fixtureFollowingBoth(): AlertsRouteFixture {
  const subscriber = seedSubscriber({
    id: "sub_senado_flag_me",
    email: "senado-flag-me@example.test",
    manageToken: MANAGE_TOKEN,
    verifyToken: "VerifyTokenSenadoFlagMe01",
    verified: true,
    verified_at: "2026-04-09T10:00:00.000Z",
    verify_token_hash: null,
  })
  return new AlertsRouteFixture({
    candidatos_publico: [SENADOR, GOVERNADOR],
    alert_subscribers: [subscriber],
    alert_subscriptions: [
      { id: "asub_me_senado", subscriber_id: subscriber.id, candidato_id: SENADOR.id },
      { id: "asub_me_governo", subscriber_id: subscriber.id, candidato_id: GOVERNADOR.id },
    ],
  })
}

function deps(fixture: AlertsRouteFixture): AlertsMeDeps {
  return {
    createAlertsServiceRoleClient: () =>
      fixture.createClient() as ReturnType<AlertsMeDeps["createAlertsServiceRoleClient"]>,
    findSubscriberByManageToken: (manageToken: string) => fixture.findSubscriberByManageToken(manageToken),
  }
}

async function subscribedSlugs(fixture: AlertsRouteFixture): Promise<string[]> {
  const { POST } = routeModule.createAlertsMeHandlers(deps(fixture))
  const response = await POST(
    fixture.request("/api/alerts/me", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.77" },
      body: { manageToken: MANAGE_TOKEN },
    }),
  )
  assert.equal(response.status, 200)
  const body = (await response.json()) as { ok: boolean; subscriptions: Array<{ slug: string }> }
  assert.equal(body.ok, true)
  return body.subscriptions.map((row) => row.slug)
}

describe("flag do Senado em /api/alerts/me", () => {
  before(() => {
    for (const [key, value] of Object.entries(TEST_ENVIRONMENT)) {
      savedEnvironment.set(key, env[key])
      env[key] = value
    }
    routeModule = require("../src/app/api/alerts/me/route") as AlertsMeRouteModule
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

  it("com a flag desligada a lista de seguidas omite o Senador", async () => {
    delete env.SENADO_ENABLED
    assert.deepEqual(await subscribedSlugs(fixtureFollowingBoth()), [GOVERNADOR.slug])
  })

  it("com a flag ligada a lista de seguidas inclui o Senador", async () => {
    env.SENADO_ENABLED = "true"
    assert.deepEqual(await subscribedSlugs(fixtureFollowingBoth()), [GOVERNADOR.slug, SENADOR.slug])
  })
})
