import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { after, before, describe, test } from "node:test"

import {
  AlertsRouteFixture,
  seedCandidate,
  seedSubscriber,
} from "./helpers/alerts-route-fixture"

type GoldenCaseKind =
  | "unauthorized"
  | "empty"
  | "no-change"
  | "success-idempotent"
  | "provider-failure"

interface GoldenCase {
  id: string
  source: string
  kind: GoldenCaseKind
  expectedStatus: number
  expectedSent: number
  expectedFailed: number
  expectedEmails: number
}

interface DigestBody {
  ok?: boolean
  error?: string
  sent?: number
  failed?: number
  skipped?: number
  total?: number
}

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { createSendDigestHandler } = require("../src/app/api/alerts/send-digest/route") as typeof import("../src/app/api/alerts/send-digest/route")

const NOW = new Date("2026-04-10T15:00:00.000Z")
const TEST_CRON_SECRET = "pf26-local-cron-secret"
const SENSITIVE_ENV_KEYS = [
  "RESEND_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "PF_ALERTS_TOKEN_ENCRYPTION_KEY",
  "VERCEL_ENV",
] as const
const savedEnvironment = new Map<string, string | undefined>()
const savedFetch = globalThis.fetch
let unexpectedGlobalFetches = 0

function loadGoldenCases(): GoldenCase[] {
  const content = readFileSync(
    new URL("./fixtures/alerts-nightly-e2e.jsonl", import.meta.url),
    "utf8",
  )
  const cases = content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GoldenCase)

  assert.ok(cases.length > 0, "o golden set nightly nao pode ficar vazio")
  for (const goldenCase of cases) {
    assert.match(goldenCase.id, /^[a-z0-9-]+$/)
    assert.match(goldenCase.source, /^(src|tests)\//)
    assert.equal(typeof goldenCase.expectedStatus, "number")
    assert.equal(typeof goldenCase.expectedSent, "number")
    assert.equal(typeof goldenCase.expectedFailed, "number")
    assert.equal(typeof goldenCase.expectedEmails, "number")
  }

  return cases
}

function createFixture(kind: GoldenCaseKind): AlertsRouteFixture {
  if (kind === "empty") return new AlertsRouteFixture()

  const subscriber = seedSubscriber({
    id: "sub_pf26_nightly",
    email: "nightly-fixture@example.test",
    manageToken: "ManageTokenPf26Nightly001",
    verifyToken: "VerifyTokenPf26Nightly001",
    verified: true,
    verified_at: "2026-04-09T10:00:00.000Z",
    verify_token_hash: null,
  })
  const fixture = new AlertsRouteFixture({
    candidatos_publico: [seedCandidate()],
    alert_subscribers: [subscriber],
    alert_subscriptions: [
      {
        id: "asub_pf26_nightly",
        subscriber_id: subscriber.id,
        candidato_id: "cand_lula",
      },
    ],
  })

  if (kind !== "no-change") {
    fixture.setTable("candidate_changes", [
      {
        id: "chg_pf26_nightly",
        candidato_id: "cand_lula",
        titulo: "Nova atualizacao editorial",
        descricao: "Mudanca deterministica da fixture nightly.",
        created_at: "2026-04-10T12:00:00.000Z",
      },
    ])
  }

  if (kind === "provider-failure") fixture.failNextEmail("resend fixture unavailable")
  return fixture
}

type SendDigestDeps = NonNullable<Parameters<typeof createSendDigestHandler>[0]>

function createDeps(
  fixture: AlertsRouteFixture,
  networkCalls: { count: number },
): SendDigestDeps {
  return {
    createAlertsServiceRoleClient: () =>
      fixture.createClient() as ReturnType<SendDigestDeps["createAlertsServiceRoleClient"]>,
    sendTransactionalEmail: (input: Parameters<AlertsRouteFixture["sendTransactionalEmail"]>[0]) =>
      fixture.sendTransactionalEmail(input),
    logAlertsApiExit: fixture.logAlertsApiExit,
    logAlertsEvent: fixture.logAlertsEvent,
    afterResponse: () => {
      throw new Error("o teste nightly nao permite encadeamento assincrono")
    },
    fetchImpl: async () => {
      networkCalls.count += 1
      throw new Error("o teste nightly nao permite acesso a rede")
    },
    sleep: async () => {},
    now: () => new Date(NOW),
  }
}

async function dispatch(
  fixture: AlertsRouteFixture,
  handler: ReturnType<typeof createSendDigestHandler>,
  authorized = true,
) {
  return handler(
    fixture.request("/api/alerts/send-digest?chain=0", {
      headers: authorized ? { authorization: `Bearer ${TEST_CRON_SECRET}` } : {},
    }),
  )
}

before(() => {
  savedEnvironment.set("CRON_SECRET", process.env.CRON_SECRET)
  process.env.CRON_SECRET = TEST_CRON_SECRET

  for (const key of SENSITIVE_ENV_KEYS) {
    savedEnvironment.set(key, process.env[key])
    delete process.env[key]
  }
  process.env.VERCEL_ENV = "development"
  globalThis.fetch = (async () => {
    unexpectedGlobalFetches += 1
    throw new Error("o teste nightly bloqueou uma tentativa de fetch global")
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = savedFetch
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("PF-26 alertas nightly", () => {
  const goldenCases = loadGoldenCases()

  for (const goldenCase of goldenCases) {
    test(goldenCase.id, async () => {
      const fixture = createFixture(goldenCase.kind)
      const networkCalls = { count: 0 }
      const handler = createSendDigestHandler(createDeps(fixture, networkCalls))
      const response = await dispatch(fixture, handler, goldenCase.kind !== "unauthorized")
      const body = (await response.json()) as DigestBody

      assert.equal(response.status, goldenCase.expectedStatus)
      assert.equal(body.sent ?? 0, goldenCase.expectedSent)
      assert.equal(body.failed ?? 0, goldenCase.expectedFailed)
      assert.equal(fixture.emails.length, goldenCase.expectedEmails)
      assert.equal(networkCalls.count, 0, "nenhum caso pode sair para a rede")
      assert.equal(unexpectedGlobalFetches, 0, "nenhum caso pode usar o fetch global")

      if (goldenCase.kind === "unauthorized") {
        assert.deepEqual(body, { error: "Unauthorized" })
        assert.equal(fixture.getTable("notification_log").length, 0)
        return
      }

      if (goldenCase.kind === "empty") {
        assert.equal(body.ok, true)
        assert.equal(body.total, 0)
        return
      }

      if (goldenCase.kind === "no-change") {
        assert.equal(body.ok, true)
        assert.equal(body.skipped, 1)
        assert.equal(fixture.getTable("notification_log").length, 0)
        return
      }

      const logRow = fixture.getTable("notification_log")[0]
      if (goldenCase.kind === "provider-failure") {
        assert.equal(body.ok, false)
        assert.equal(logRow?.status, "failed")
        assert.equal(logRow?.error_message, "resend fixture unavailable")
        return
      }

      assert.equal(body.ok, true)
      assert.match(fixture.emails[0]?.subject ?? "", /Lula/)
      assert.equal(logRow?.status, "sent")
      assert.equal(logRow?.sent_at, NOW.toISOString())
      assert.equal(
        fixture.getTable("alert_subscribers")[0]?.last_digest_sent_at,
        NOW.toISOString(),
      )

      const replay = await dispatch(fixture, handler)
      const replayBody = (await replay.json()) as DigestBody
      assert.equal(replay.status, 200)
      assert.equal(replayBody.sent, 0)
      assert.equal(replayBody.failed, 0)
      assert.equal(replayBody.skipped, 1)
      assert.equal(fixture.emails.length, 1, "o replay do mesmo digest nao pode reenviar email")
      assert.equal(fixture.getTable("notification_log").length, 1)
      assert.equal(networkCalls.count, 0)
    })
  }

  test("workflow nightly e minimo, pinado e sem secrets", () => {
    const workflow = readFileSync(".github/workflows/alerts-nightly.yml", "utf8")
    assert.match(workflow, /schedule:\s*\n\s*#.*\n\s*- cron: "17 3 \* \* \*"/)
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /permissions:\s*\n\s*contents: read/)
    assert.match(workflow, /timeout-minutes: 10/)
    assert.match(workflow, /persist-credentials: false/)
    assert.match(workflow, /run: npm ci --ignore-scripts/)
    assert.match(workflow, /run: npm run test:alerts:nightly/)
    assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./)
    assert.doesNotMatch(workflow, /RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL/)
    assert.doesNotMatch(workflow, /playwright|npm run build|npm test\b|gate-check\.mjs/i)

    const uses = Array.from(workflow.matchAll(/uses:\s*([^\s#]+)/g), (match) => match[1])
    assert.ok(uses.length > 0)
    for (const action of uses) {
      if (action.startsWith("./")) continue
      assert.match(action, /@[0-9a-f]{40}$/, `action sem SHA imutavel: ${action}`)
    }
  })
})
