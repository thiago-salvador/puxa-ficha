import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { after, before, describe, test } from "node:test"
import { parse as parseYaml } from "yaml"

import {
  AlertsRouteFixture,
  seedCandidate,
  seedSubscriber,
} from "./helpers/alerts-route-fixture"

type GoldenCaseKind =
  | "unauthorized"
  | "empty"
  | "no-change"
  | "success"
  | "preseeded-idempotency"
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

const REQUIRED_GOLDEN_CASES = [
  { id: "unauthorized-no-side-effects", kind: "unauthorized" },
  { id: "empty-batch-is-explicit", kind: "empty" },
  { id: "no-change-skips-without-email", kind: "no-change" },
  { id: "digest-success-sends-once", kind: "success" },
  { id: "digest-log-prevents-duplicate", kind: "preseeded-idempotency" },
  { id: "provider-failure-is-not-hidden", kind: "provider-failure" },
] as const satisfies ReadonlyArray<{ id: string; kind: GoldenCaseKind }>

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

type SendDigestRouteModule = typeof import("../src/app/api/alerts/send-digest/route")
type SendDigestHandlerFactory = SendDigestRouteModule["createSendDigestHandler"]
let routeModule: SendDigestRouteModule
let createSendDigestHandler: SendDigestHandlerFactory

const NOW = new Date("2026-04-10T15:00:00.000Z")
const TEST_CRON_SECRET = "pf26-local-cron-secret"
const LOCAL_SUPABASE_URL = "http://127.0.0.1:9"
const TEST_ENVIRONMENT = {
  CRON_SECRET: TEST_CRON_SECRET,
  RESEND_API_KEY: "re_pf26_fake_key",
  SUPABASE_SERVICE_ROLE_KEY: "pf26-fake-service-role-key",
  SUPABASE_URL: LOCAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "pf26-fake-anon-key",
  PF_ALERTS_TOKEN_ENCRYPTION_KEY: "11".repeat(32),
  VERCEL_ENV: "development",
} as const
const savedEnvironment = new Map<string, string | undefined>()
const savedFetch = globalThis.fetch
const blockedGlobalFetchUrls: string[] = []

function assertGoldenSet(cases: readonly GoldenCase[]) {
  const requiredIds = REQUIRED_GOLDEN_CASES.map(({ id }) => id).sort()
  const requiredKinds = REQUIRED_GOLDEN_CASES.map(({ kind }) => kind).sort()
  const requiredPairs = REQUIRED_GOLDEN_CASES.map(({ id, kind }) => `${id}:${kind}`).sort()
  const actualIds = cases.map(({ id }) => id)
  const actualKinds = cases.map(({ kind }) => kind)
  const actualPairs = cases.map(({ id, kind }) => `${id}:${kind}`)

  assert.equal(cases.length, REQUIRED_GOLDEN_CASES.length, "cardinalidade inesperada no golden set")
  assert.equal(new Set(actualIds).size, cases.length, "IDs duplicados no golden set")
  assert.equal(new Set(actualKinds).size, cases.length, "kinds duplicados no golden set")
  assert.deepEqual(actualIds.sort(), requiredIds, "conjunto de IDs obrigatorios mudou")
  assert.deepEqual(actualKinds.sort(), requiredKinds, "conjunto de kinds obrigatorios mudou")
  assert.deepEqual(actualPairs.sort(), requiredPairs, "pares ID/kind obrigatorios mudaram")
}

function loadGoldenCases(): GoldenCase[] {
  const content = readFileSync(
    new URL("./fixtures/alerts-nightly-e2e.jsonl", import.meta.url),
    "utf8",
  )
  const cases = content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GoldenCase)

  assertGoldenSet(cases)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function collectKeyPaths(value: unknown, targetKey: string, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectKeyPaths(item, targetKey, [...path, String(index)]),
    )
  }
  if (!isRecord(value)) return []

  return Object.entries(value).flatMap(([key, nested]) => {
    const nextPath = [...path, key]
    const current = key === targetKey ? [nextPath.join(".")] : []
    return [...current, ...collectKeyPaths(nested, targetKey, nextPath)]
  })
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(collectStringValues)
  if (!isRecord(value)) return []
  return Object.values(value).flatMap(collectStringValues)
}

function assertWorkflowSecurity(workflow: string) {
  const parsed = parseYaml(workflow) as unknown
  assert.ok(isRecord(parsed), "workflow precisa ser um mapa YAML")
  assert.deepEqual(parsed.permissions, { contents: "read" })
  assert.deepEqual(
    collectKeyPaths(parsed, "permissions"),
    ["permissions"],
    "permissions extras, inclusive em jobs, nao sao permitidas",
  )
  assert.deepEqual(
    collectKeyPaths(parsed, "secrets"),
    [],
    "nenhuma chave YAML secrets, inclusive secrets: inherit, e permitida",
  )

  for (const scalar of collectStringValues(parsed)) {
    assert.doesNotMatch(
      scalar,
      /\$\{\{[\s\S]*?\bsecrets\b[\s\S]*?\}\}/i,
      "o workflow nao pode acessar o contexto secrets",
    )
  }
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
    notification_log:
      kind === "preseeded-idempotency"
        ? [
            {
              id: "nlog_pf26_already_sent",
              subscriber_id: subscriber.id,
              canal: "email",
              digest_date: "2026-04-10",
              status: "sent",
              error_message: null,
              sent_at: "2026-04-10T08:00:00.000Z",
              candidato_ids: ["cand_lula"],
              change_ids: ["chg_pf26_nightly"],
            },
          ]
        : [],
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

type SendDigestDeps = NonNullable<Parameters<SendDigestHandlerFactory>[0]>

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
  handler: ReturnType<SendDigestHandlerFactory>,
  authorized = true,
) {
  return handler(
    fixture.request("/api/alerts/send-digest?chain=0", {
      headers: authorized ? { authorization: `Bearer ${TEST_CRON_SECRET}` } : {},
    }),
  )
}

before(() => {
  for (const [key, value] of Object.entries(TEST_ENVIRONMENT)) {
    savedEnvironment.set(key, process.env[key])
    process.env[key] = value
  }

  globalThis.fetch = (async (input) => {
    blockedGlobalFetchUrls.push(input instanceof Request ? input.url : String(input))
    throw new Error("o teste nightly bloqueou uma tentativa de fetch global")
  }) as typeof fetch

  routeModule = require("../src/app/api/alerts/send-digest/route") as SendDigestRouteModule
  createSendDigestHandler = routeModule.createSendDigestHandler
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
      const globalFetchesBefore = blockedGlobalFetchUrls.length
      const handler = createSendDigestHandler(createDeps(fixture, networkCalls))
      const response = await dispatch(fixture, handler, goldenCase.kind !== "unauthorized")
      const body = (await response.json()) as DigestBody

      assert.equal(response.status, goldenCase.expectedStatus)
      assert.equal(body.sent ?? 0, goldenCase.expectedSent)
      assert.equal(body.failed ?? 0, goldenCase.expectedFailed)
      assert.equal(fixture.emails.length, goldenCase.expectedEmails)
      assert.equal(networkCalls.count, 0, "nenhum caso pode sair para a rede")
      assert.equal(
        blockedGlobalFetchUrls.length,
        globalFetchesBefore,
        "casos com fixture nao podem usar o fetch global",
      )

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

      if (goldenCase.kind === "preseeded-idempotency") {
        assert.equal(body.ok, true)
        assert.equal(body.sent, 0)
        assert.equal(body.failed, 0)
        assert.equal(body.skipped, 1)
        assert.equal(fixture.emails.length, 0, "log sent preexistente precisa impedir novo email")
        assert.deepEqual(fixture.getTable("notification_log"), [
          {
            id: "nlog_pf26_already_sent",
            subscriber_id: "sub_pf26_nightly",
            canal: "email",
            digest_date: "2026-04-10",
            status: "sent",
            error_message: null,
            sent_at: "2026-04-10T08:00:00.000Z",
            candidato_ids: ["cand_lula"],
            change_ids: ["chg_pf26_nightly"],
          },
        ])
        assert.equal(
          fixture.getTable("alert_subscribers")[0]?.last_digest_sent_at,
          null,
          "a prova de idempotencia nao pode depender de last_digest_sent_at recente",
        )
        assert.ok(
          fixture.events.some(
            ({ event, detail }) =>
              event === "subscriber_skipped" && detail?.reason === "already_sent_today",
          ),
          "o skip precisa provar a guarda notification_log com reason already_sent_today",
        )
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
    })
  }

  test("golden set exige cardinalidade, IDs e kinds unicos", () => {
    assertGoldenSet(goldenCases)

    for (const requiredKind of ["preseeded-idempotency", "provider-failure"] as const) {
      const withoutRequiredCase = goldenCases.filter(({ kind }) => kind !== requiredKind)
      assert.throws(() => assertGoldenSet(withoutRequiredCase))

      const requiredCase = goldenCases.find(({ kind }) => kind === requiredKind)
      assert.ok(requiredCase)
      assert.throws(() => assertGoldenSet([...goldenCases, requiredCase]))
    }
  })

  test("GET e POST reais usam a composicao default sem contato externo", async () => {
    const fixture = new AlertsRouteFixture()
    const fetchesBefore = blockedGlobalFetchUrls.length

    const unauthorized = await routeModule.GET(
      fixture.request("/api/alerts/send-digest?chain=0"),
    )
    assert.equal(unauthorized.status, 401)
    assert.deepEqual(await unauthorized.json(), { error: "Unauthorized" })
    assert.equal(
      blockedGlobalFetchUrls.length,
      fetchesBefore,
      "GET sem autorizacao nao pode alcançar nenhum adapter de rede",
    )
    assert.equal(fixture.emails.length, 0)
    assert.equal(fixture.getTable("notification_log").length, 0)

    const authorized = await routeModule.POST(
      fixture.request("/api/alerts/send-digest?chain=0", {
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      }),
    )
    assert.equal(authorized.status, 503)
    assert.deepEqual(await authorized.json(), { error: "Could not load subscribers" })

    const blockedAttempts = blockedGlobalFetchUrls.slice(fetchesBefore)
    assert.ok(blockedAttempts.length > 0, "POST autorizado precisa alcançar o adapter Supabase real")
    for (const url of blockedAttempts) {
      assert.match(
        url,
        /^http:\/\/127\.0\.0\.1:9\//,
        `o adapter tentou um destino fora da fixture local: ${url}`,
      )
    }
    assert.equal(fixture.emails.length, 0)
    assert.equal(fixture.getTable("notification_log").length, 0)
  })

  test("workflow nightly e minimo, pinado e sem secrets", () => {
    const workflow = readFileSync(".github/workflows/alerts-nightly.yml", "utf8")
    assertWorkflowSecurity(workflow)
    assert.match(workflow, /schedule:\s*\n\s*#.*\n\s*- cron: "17 3 \* \* \*"/)
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /timeout-minutes: 10/)
    assert.match(workflow, /persist-credentials: false/)
    assert.match(workflow, /run: npm ci --ignore-scripts/)
    assert.match(workflow, /run: npm run test:alerts:nightly/)
    assert.doesNotMatch(workflow, /RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL/)
    assert.doesNotMatch(workflow, /playwright|npm run build|npm test\b|gate-check\.mjs/i)

    const withWritableOidc = workflow.replace(
      "permissions:\n  contents: read",
      "permissions:\n  contents: read\n  id-token: write",
    )
    assert.throws(() => assertWorkflowSecurity(withWritableOidc))

    const withBracketSecret = workflow.replace(
      'CI: "true"',
      'CI: "true"\n          LEAK: "${{ secrets[\'CRON_SECRET\'] }}"',
    )
    assert.throws(() => assertWorkflowSecurity(withBracketSecret))

    const withDynamicSecret = workflow.replace(
      'CI: "true"',
      'CI: "true"\n          LEAK: "${{ secrets[matrix.secret_name] }}"',
    )
    assert.throws(() => assertWorkflowSecurity(withDynamicSecret))

    const withInheritedSecrets = workflow.replace(
      "jobs:\n  alertas-e2e:",
      "jobs:\n  reusable:\n    uses: ./.github/workflows/reusable.yml\n    secrets: inherit\n\n  alertas-e2e:",
    )
    assert.throws(() => assertWorkflowSecurity(withInheritedSecrets))

    const uses = Array.from(workflow.matchAll(/uses:\s*([^\s#]+)/g), (match) => match[1])
    assert.ok(uses.length > 0)
    for (const action of uses) {
      if (action.startsWith("./")) continue
      assert.match(action, /@[0-9a-f]{40}$/, `action sem SHA imutavel: ${action}`)
    }
  })
})
